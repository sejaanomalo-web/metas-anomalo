# Proposta de hardening de RLS + anon key — PARA REVISÃO (NÃO aplicada)

> Status: **proposta**. Nada aqui foi aplicado no banco. A migration SQL no
> fim só deve rodar **depois** da etapa de código (passo 1) estar feita e
> testada — caso contrário **quebra o app em produção**.

## O problema (real, verificado)

A `anon key` do Supabase é **pública**: o componente client
`components/TrafegoRealtime.tsx` instancia um client Supabase com
`NEXT_PUBLIC_SUPABASE_ANON_KEY` no browser, então qualquer pessoa consegue
extrair essa chave e falar direto com a API REST do Supabase.

Várias tabelas têm policy RLS `USING(true)` (e `WITH CHECK(true)`) para o role
`anon`, ou seja **leitura e escrita liberadas para qualquer um com a anon key**:

- `dados_diarios_log`, `dados_reais`, `metas_empresa`, `configuracoes`,
  `empresas_config`, `tentativas_login`, `preenchedores`,
  `preenchedor_empresas`, `log_semanal`

Tabelas sensíveis estão OK (RLS ligada **sem policy** = só `service_role`):
`usuarios` (senha_hash), `tokens_meta` (tokens do Meta), `relatorios_comerciais`,
`vendas_cliente`, `notificacoes*`, `push_subscriptions`.

Impacto: dá pra **ler e adulterar dados de negócio** (investimento, leads,
faturamento, metas) via a API pública, sem login.

## Por que NÃO é uma migration isolada

As policies permissivas são **load-bearing**: o app usa o client anon
(`getSupabase()`) **no servidor** em ~34 lugares pra ler e escrever justamente
essas tabelas. Apertar a RLS sem antes mudar o código deixaria essas leituras/
escritas retornando vazio / falhando silenciosamente.

Arquivos que usam o client anon (`getSupabase()`) no servidor e as tabelas que
tocam:

| Arquivo | Tabelas (via anon) |
|---|---|
| `lib/sentinela.ts` | dados_diarios_log, dados_diarios_campanha, logs_sentinela, tokens_meta |
| `lib/dados-reais.ts` | dados_reais, dados_diarios_log, empresas_config |
| `lib/dados-diarios.ts` | dados_diarios_log |
| `lib/metas-empresa.ts` | metas_empresa |
| `lib/empresas-actions.ts` | empresas_config, dados_reais, metas_empresa |
| `lib/configuracoes.ts` | configuracoes |
| `app/login/actions.ts` | tentativas_login |

Realtime (browser, role `anon`) **precisa** de SELECT em: `dados_diarios_log`,
`logs_sentinela` (`components/TrafegoRealtime.tsx`).

## Plano seguro (2 passos, nessa ordem)

### Passo 1 — Código: mover todo acesso server-side do anon para service_role

Trocar `getSupabase()` por `getSupabaseAdmin()` em **todas** as leituras/escritas
**server-side** dos arquivos acima. É comportamentalmente neutro (os dois
clients batem no mesmo banco; o service_role apenas ignora a RLS), e **remove a
dependência do app** das policies permissivas.

- Manter `getSupabase()` (anon) **apenas** onde roda no browser: o realtime em
  `components/TrafegoRealtime.tsx`.
- `app/login/actions.ts` (rate-limit) deve usar service_role — assim `anon` não
  precisa mais escrever em `tentativas_login` (hoje um atacante com a anon key
  pode inserir/apagar linhas dessa tabela e furar o próprio rate-limit).
- Verificar caso a caso: alguns `.from("tokens_meta")` em `sentinela.ts` podem
  já estar inconsistentes (tokens_meta não tem policy anon → leitura via anon
  já volta vazia hoje). Confirmar que cada call-site certo usa service_role.

Testar em staging: dashboards de tráfego/metas/financeiro, formulários públicos,
botão "Atualizar dados" (Sentinela), login + rate-limit, realtime atualizando
sozinho.

### Passo 2 — Banco: apertar a RLS (a migration abaixo)

Só depois do passo 1 testado. A migration:
- Remove as policies `USING(true)` de todas as tabelas listadas.
- Recria **somente** uma policy de **SELECT para `anon`** nas duas tabelas que o
  realtime usa (`dados_diarios_log`, `logs_sentinela`). Sem INSERT/UPDATE/DELETE
  pro anon em lugar nenhum.
- As demais tabelas ficam **sem policy** = só `service_role` (igual às já
  protegidas hoje).

> ⚠️ Verificar em staging que o Realtime continua entregando eventos com a policy
> de SELECT restrita. Se o Realtime não exigir RLS na sua versão, a policy de
> SELECT anon pode nem ser necessária — testar antes de produção.

```sql
-- ============================================================================
-- HARDENING RLS — aplicar SÓ APÓS o passo 1 (código) estar em produção e testado
-- ============================================================================
-- Remove acesso do role anon a tabelas de negócio, mantendo apenas o SELECT
-- necessário pro Supabase Realtime nas tabelas que o browser assina.

begin;

-- 1) Dropar as policies permissivas (USING(true) FOR ALL) -----------------
drop policy if exists dados_diarios_log_all      on public.dados_diarios_log;
drop policy if exists dados_reais_all            on public.dados_reais;
drop policy if exists metas_empresa_all          on public.metas_empresa;
drop policy if exists configuracoes_all          on public.configuracoes;
drop policy if exists empresas_config_all        on public.empresas_config;
drop policy if exists tentativas_login_all       on public.tentativas_login;
drop policy if exists preenchedores_all          on public.preenchedores;
drop policy if exists preenchedor_empresas_all   on public.preenchedor_empresas;
drop policy if exists log_semanal_all            on public.log_semanal;

-- 2) Realtime: anon só PODE LER as 2 tabelas assinadas no browser ---------
--    (service_role continua com acesso total, sempre.)
create policy realtime_select_anon
  on public.dados_diarios_log
  for select
  to anon
  using (true);

create policy realtime_select_anon
  on public.logs_sentinela
  for select
  to anon
  using (true);

-- 3) (Opcional, defesa extra) revogar grants de tabela do anon nas demais.
--    A RLS sem policy já bloqueia, mas revogar o GRANT corta antes da RLS.
--    Descomente após confirmar que nada server-side usa o anon nelas:
-- revoke all on public.dados_reais        from anon;
-- revoke all on public.metas_empresa      from anon;
-- revoke all on public.configuracoes      from anon;
-- revoke all on public.empresas_config    from anon;
-- revoke all on public.tentativas_login   from anon;
-- revoke all on public.preenchedores      from anon;
-- revoke all on public.preenchedor_empresas from anon;
-- revoke all on public.log_semanal        from anon;

commit;

-- ROLLBACK (se algo quebrar): recriar as policies permissivas como estavam.
-- create policy dados_diarios_log_all on public.dados_diarios_log for all
--   to anon, authenticated using (true) with check (true);
-- ...(idem pras outras)...
```

## Recomendação

Tratar como um item próprio, em staging, com os dois passos juntos e teste de
regressão. Não cabe na "Faixa 1" (que foi só código aditivo sem risco). Quando
você quiser tocar isso, eu faço o passo 1 (migração dos call-sites) num PR
isolado e revisável, você testa, e só então aplicamos o passo 2 no banco.
