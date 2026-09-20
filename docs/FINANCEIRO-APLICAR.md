# Financeiro — passos manuais antes do deploy

> **Leia primeiro.** As migrações deste projeto são aplicadas **à mão** no SQL
> Editor do Supabase. Enquanto elas não rodarem, o módulo financeiro **não
> abre**: o código consulta colunas que ainda não existem e o Postgres
> responde `42703`.
>
> Isso não quebra nada de forma silenciosa — a tela de erro do módulo
> (`app/dashboard/financeiro/error.tsx`) reconhece esse código e mostra
> exatamente esta instrução. O resto do sistema continua funcionando normal.

## Ordem de aplicação

Rode os quatro arquivos **nesta ordem**, um de cada vez, no
**SQL Editor → New query** do projeto `metas-anomalo`
(`cawwccbuejmvfemgdhvl`).

Todos são idempotentes: rodar de novo um que já passou não faz nada.

| # | Arquivo | O que faz | Risco |
|---|---|---|---|
| 1 | `supabase/migrations/20260919_financeiro_baseline.sql` | Documenta o schema que já existe. **No-op em produção** — todas as tabelas já estão lá, então nenhum CREATE executa. | Nenhum |
| 2 | `supabase/migrations/20260920_financeiro_vencimento_origem.sql` | Adiciona `data_vencimento`, `forma_pagamento`, `origem`, `aviso_enviado_dia`; cria índices e a trava anti-duplicata dos recorrentes. | Baixo — só `add column if not exists` e `create index if not exists`. Ver aviso abaixo. |
| 3 | `supabase/migrations/20260921_financeiro_extrato.sql` | Cria as três tabelas da importação OFX e as funções `fn_sugerir_classificacao_extrato` e `fn_confirmar_extrato`. | Nenhum — tudo novo. |
| 4 | `supabase/migrations/20260922_financeiro_avisos_vencimento.sql` | Adiciona `conta_vence_hoje` e `conta_atrasada` em `preferencias_notificacao`. | Nenhum. |

**Depois do passo 2 o módulo já volta a abrir.** Os passos 3 e 4 liberam a
importação de extrato e os avisos de vencimento.

### Antes do passo 2 — a única checagem que importa

A migração 2 cria um índice **único** que impede o mesmo recorrente de gerar
dois lançamentos no mesmo mês. Se já houver duplicata no banco, ela falha com
`23505`.

Rode antes:

```sql
select recorrente_id,
       date_trunc('month', data::timestamp) as mes,
       count(*)
  from public.lancamento_financeiro
 where recorrente_id is not null and deletado_em is null
 group by 1,2 having count(*) > 1;
```

- **Zero linhas** (era o caso em 19/09/2026): pode aplicar.
- **Alguma linha**: **não apague nada.** Decida caso a caso qual lançamento
  vale e marque o outro como `cancelado` — dinheiro não se apaga pra fazer uma
  migração passar.

## Depois de aplicar

1. **Confira o schema** rodando `docs/FINANCEIRO-SCHEMA-CONFERIR.sql`
   (100% leitura) e compare com o baseline. Ele fecha a lacuna do que o
   PostgREST não expõe: CHECKs, índices, triggers e policies.
2. **Cron novo**: `vercel.json` ganhou `/api/financeiro/avisos` às 10:00 UTC
   (07:00 em São Paulo). Ele só passa a existir no próximo deploy; precisa do
   `CRON_SECRET` já configurado (o mesmo que a materialização usa).
3. **Nada a fazer sobre `data_vencimento` estar vazia.** É intencional: os
   previstos de hoje já guardam o dia do vencimento em `data`, e a regra R3
   trata "sem vencimento" usando a competência. O comportamento continua
   idêntico, linha por linha, sem reescrever dado financeiro.

## Como reverter

Nenhuma migração remove nada, então reverter é reverter o **código**.

Se precisar desfazer no banco:

- Índices (`lancamento_financeiro_recorrente_mes_key`,
  `lancamento_financeiro_vencimento_idx`,
  `lancamento_financeiro_status_vencimento_idx`) podem ser removidos com
  `drop index if exists` sem perda.
- Tabelas do extrato podem ser removidas **se nunca tiverem sido usadas**.
- **As colunas novas não devem ser removidas.** Depois que um lançamento
  gravar um vencimento ou uma forma de pagamento, `drop column` apaga
  informação financeira.

## Estado da verificação automática

- `npm run typecheck` — limpo.
- `npm test` — 52 testes, todos passando.
- `npm run build` — compila.
- `npm run lint` — **não existe neste projeto.** O ESLint nunca foi
  configurado (`next lint` abre o wizard interativo e trava). Instalar o
  ESLint agora traria ~100 pacotes novos ao lockfile e centenas de avisos
  pré-existentes em código não relacionado — decisão que não cabe num PR de
  financeiro. Vale como tarefa separada.
