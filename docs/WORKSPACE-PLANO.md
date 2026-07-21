# Workspace — plano de implementação (substituir o Asana)

> Status: **plano aprovado para execução por fases**. Nada foi implementado ainda.
> Base: briefing "Plano de implementação — módulo de tarefas do Metas Anômalo"
> (auditoria feita via MCP do Asana em outro chat), **reescrito contra a
> arquitetura real deste repositório**.
>
> Objetivo final: desligar o Asana. Este documento cobre a construção do módulo.
> A migração dos dados do Asana é um projeto separado (ver §12).

---

## 0. O que muda em relação ao briefing original

O briefing foi escrito sem acesso ao código. Ele assume um stack que **não é o
nosso** em sete pontos estruturais. Cada divergência abaixo foi verificada no
código; ignorar qualquer uma delas produz um módulo que não funciona ou que é
inseguro por baixo de uma falsa sensação de segurança.

| # | Briefing assume | Realidade do repo | Consequência |
|---|---|---|---|
| 1 | Supabase Auth (`auth.uid()`) e RLS por usuário | Auth **própria**: cookie HMAC-SHA256 (`lib/auth.ts`, `COOKIE_SESSAO`) + `public.usuarios`. O Postgres **não sabe quem é o usuário**. Todo acesso é via `getSupabaseAdmin()` (service_role, bypassa RLS) | **RLS por usuário é impossível.** Ver §5 — o modelo correto é RLS ligada *sem policy* + autorização no servidor |
| 2 | `organization_id` obrigatório em toda tabela; multi-tenant | Não existe organização. O sistema é **mono-tenant** (Anômalo). Os análogos são `empresas_config` (empresa/marca) e `cliente_trafego` (cliente de assessoria) | Remover `organization_id`. Escopo = `empresa_nome` / `cliente_id`, ambos **opcionais** |
| 3 | Testes automatizados, E2E, CI | **Zero framework de teste** instalado. Existe 1 script manual (`scripts/test-relatorios.ts` via `tsx`) | §9 substitui E2E por script de verificação `tsx` + checklist manual assinado |
| 4 | Editor rich text já existente | Não existe. Nenhuma dependência de editor | Descrição em **markdown-lite renderizado em nós React** (sem `dangerouslySetInnerHTML`). Elimina a classe inteira de XSS |
| 5 | Biblioteca de calendário | Não existe — mas `components/crm/Calendario.tsx` já é uma grade mensal completa em React puro, e `@dnd-kit` já está instalado (`components/crm/Kanban.tsx`) | **Zero dependência nova.** Adaptar o calendário do CRM + dnd-kit |
| 6 | Feature flag | Não existe sistema de flags | A flag **é o RBAC**: nova chave `workspace` em `ChavePermissao`. Enquanto só `admin` a tiver, o módulo está desligado para o resto |
| 7 | `supabase gen types` | Tipos são **interfaces TS escritas à mão** em `lib/*.ts`. Migrations são `.sql` datados aplicados manualmente | Escrever os tipos à mão, no padrão de `lib/financeiro.ts` |

Além disso: **Storage é público hoje** (`crm-midia`, `getPublicUrl`). Anexos de
tarefa exigem bucket **privado** + signed URL — padrão novo no repo (§5.3).

O que o briefing acertou e fica valendo integralmente: tarefa única com N
contextos, calendário como *view* derivada do prazo, soft delete, log de
atividade, idempotência, não migrar nada do Asana agora.

---

## 1. Fatos da auditoria (referência rápida)

**Stack:** Next.js 14.2 (App Router) · React 18.3 · TS 5.5 · Tailwind 3.4 ·
`@supabase/supabase-js` 2.x · Sentry 8 · deploy Vercel.

**Auth/RBAC** (`lib/auth.ts`)
- Cookie `anomalo_session` = `<usuario_id>.<hmac>`, 12h, httpOnly.
- Papéis: `admin` · `gestor_trafego` · `comercial` · `custom`.
- 13 chaves de permissão em `ChavePermissao` + `PRESETS_PERMISSOES`.
- Guards de página: `requererPermissao(chave)` e `requererAdmin()`.
- `admin` **sempre** bypassa em `temPermissao`.

**Dados**
- Migrations: `supabase/migrations/YYYYMMDD_nome.sql`, aplicadas à mão. Sem CLI.
- Padrão de segurança consolidado (CRM, comercial, tokens): `alter table …
  enable row level security;` **sem nenhuma policy** ⇒ só `service_role` entra.
- Padrão de exceção: uma tabela-sinal sem PII (`crm_realtime_ping`) com policy
  `select to anon` + `alter publication supabase_realtime add table …`.
- `usuarios.id` uuid · `cliente_trafego.id` uuid · `empresas_config.nome` text.

**UI**
- `components/AppShell.tsx`: rail lateral (72px/240px), itens gateados por
  `temPermissao`. É onde a aba nova entra.
- Design tokens em CSS vars: `--surface-1/2/3`, `--accent` (#C9953A), classes
  `.glass`, `.ds-label`, `.ds-caption`.
- Padrão de drawer: `components/financeiro/LancamentoDrawer.tsx`
  (`useTransition` + Server Action + `router.refresh()`).
- Padrão de Server Action: `lib/financeiro-actions.ts` — `"use server"`,
  `exigirPermissao()` no topo, `FormData` in, `{ok, erro}` out, `revalidatePath`.

**Infra pronta para reuso**
- Notificações + push: `criarNotificacao({ usuarioIds })` já faz fan-out e
  dispara push por trigger. Preferências por tipo em `preferencias_notificacao`.
- Cron: `vercel.json` → `crons[]`, autenticado por `bearerValido()` +
  `CRON_SECRET` (`lib/cron-auth.ts`).
- Realtime: `components/crm/CrmRealtime.tsx` (channel → `router.refresh()`).
- Máscaras/inputs: `components/inputs/*`.

---

## 2. Decisões travadas antes de escrever código

| Decisão | Escolha | Motivo |
|---|---|---|
| Nome e posição da aba | **"Workspace"**, último item da nav principal (abaixo de Financeiro), ícone de checklist | Pedido do Bruno |
| Rota base | `/dashboard/workspace` | Consistente com `/dashboard/crm`, `/dashboard/financeiro` |
| Prefixo das tabelas | `ws_` | Mesmo padrão do CRM (`crm_*`); deixa o módulo isolável |
| Fuso e prazo | `prazo_em date` + `prazo_hora time` **nullable** — nunca `timestamptz` para prazo | Elimina 100% do risco de "tarefa pulou de dia". Operação é 100% BRT |
| Descrição | Texto puro com markdown-lite (`**negrito**`, `- lista`, autolink `https://`) renderizado em JSX | 28% das tarefas do Asana têm link na descrição; 0% precisam de HTML. Sem XSS, sem dependência |
| Hierarquia | **1 nível** (tarefa → subtarefa). Subtarefa não tem subtarefa | Uso real no Asana é raro e raso. Trava por constraint, documentada |
| Anexos | Bucket **privado** `ws-anexos` + signed URL de 60s emitida por route handler autenticado | Time cola link do Drive hoje; anexo é conveniência, não pode virar vazamento |
| Recorrência | **V1.1**, depois da V1 estável. V1 entrega "Duplicar" | Briefing já autoriza esse corte. Recorrência é o maior gerador de bug |
| Realtime | Tabela-sinal `ws_realtime_ping` (sem PII) → `router.refresh()` | Copia o padrão do CRM. Não expõe tarefa nenhuma ao `anon` |
| Concorrência | Coluna `versao` + `UPDATE … WHERE versao = $n`; 0 linhas ⇒ "alguém editou antes, recarregue" | Barato e suficiente |

**Aberto para o Bruno decidir na Fase 2** (não bloqueia o início): quem pode
**excluir definitivamente** uma tarefa de outra pessoa — proposta: só `admin`.

---

## 3. Modelo de dados

Migration única de fundação: `supabase/migrations/20260721_workspace_fase1.sql`.

### 3.1 Regra estrutural

```
ws_tarefas (1 linha, 1 verdade)
   └── ws_tarefa_contextos (N vínculos)
         ├── contexto "Calendário de conteúdo"  (tipo=geral)
         ├── contexto "Cliente X"               (tipo=cliente → cliente_trafego)
         └── contexto "Anômalo Hub"             (tipo=interno)
```

Aparecer no calendário **não é vínculo** — é consequência de `prazo_em` não ser
nulo. Remover de um contexto apaga só a linha de vínculo.

### 3.2 Tabelas

```sql
-- ============ CONTEXTOS (as "pastas"/projetos) ============
create table if not exists public.ws_contextos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(btrim(nome)) > 0),
  tipo          text not null check (tipo in ('geral','cliente','empresa','interno')),
  empresa_nome  text,          -- vínculo lógico com empresas_config.nome
  cliente_id    uuid references public.cliente_trafego(id) on delete set null,
  cor           text,
  ordem         int  not null default 0,
  arquivado_em  timestamptz,
  criado_por    uuid not null references public.usuarios(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- contexto de cliente PRECISA de cliente_id; os outros tipos não podem ter
  constraint ws_contextos_cliente_coerente check (
    (tipo = 'cliente' and cliente_id is not null) or
    (tipo <> 'cliente' and cliente_id is null)
  )
);
-- 1 contexto ativo por cliente (evita duplicar a "pasta" do cliente)
create unique index if not exists ws_contextos_cliente_unico
  on public.ws_contextos (cliente_id)
  where cliente_id is not null and arquivado_em is null;

-- ============ TAREFAS ============
create table if not exists public.ws_tarefas (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null check (length(btrim(titulo)) > 0),
  descricao       text,                  -- markdown-lite, TEXTO PURO (sem HTML)
  tarefa_pai_id   uuid references public.ws_tarefas(id) on delete cascade,
  responsavel_id  uuid references public.usuarios(id) on delete set null,
  criado_por      uuid not null references public.usuarios(id),
  prazo_em        date,
  prazo_hora      time,                  -- opcional; sempre lido como BRT
  inicio_em       date,
  prioridade      text not null default 'normal'
                  check (prioridade in ('baixa','normal','alta')),
  concluida_em    timestamptz,
  concluida_por   uuid references public.usuarios(id),
  recorrencia_id  uuid,                  -- FK adicionada na Fase 5
  ocorrencia_chave text,                 -- '<recorrencia_id>:<YYYY-MM-DD>'
  ordem           numeric not null default 0,
  versao          int not null default 1,
  arquivada_em    timestamptz,
  excluida_em     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ws_tarefas_conclusao_coerente check (
    (concluida_em is null and concluida_por is null) or
    (concluida_em is not null and concluida_por is not null)
  ),
  constraint ws_tarefas_prazo_hora_exige_prazo check (
    prazo_hora is null or prazo_em is not null
  )
);
-- idempotência de recorrência: 1 ocorrência por série+data
create unique index if not exists ws_tarefas_ocorrencia_unica
  on public.ws_tarefas (ocorrencia_chave)
  where ocorrencia_chave is not null;

-- hierarquia de 1 nível: o pai não pode ter pai
create or replace function public.ws_valida_hierarquia() returns trigger as $$
begin
  if new.tarefa_pai_id is not null then
    if new.tarefa_pai_id = new.id then
      raise exception 'ws_tarefas: tarefa não pode ser pai de si mesma';
    end if;
    if exists (select 1 from public.ws_tarefas
               where id = new.tarefa_pai_id and tarefa_pai_id is not null) then
      raise exception 'ws_tarefas: subtarefa não pode ter subtarefa (1 nível)';
    end if;
  end if;
  return new;
end $$ language plpgsql;

create trigger ws_tarefas_hierarquia
  before insert or update of tarefa_pai_id on public.ws_tarefas
  for each row execute function public.ws_valida_hierarquia();

-- ============ VÍNCULO TAREFA ↔ CONTEXTO ============
create table if not exists public.ws_tarefa_contextos (
  tarefa_id   uuid not null references public.ws_tarefas(id)   on delete cascade,
  contexto_id uuid not null references public.ws_contextos(id) on delete cascade,
  ordem       numeric not null default 0,
  created_at  timestamptz not null default now(),
  primary key (tarefa_id, contexto_id)
);

-- ============ COMENTÁRIOS ============
create table if not exists public.ws_comentarios (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid not null references public.ws_tarefas(id) on delete cascade,
  autor_id    uuid not null references public.usuarios(id),
  corpo       text not null check (length(btrim(corpo)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  excluido_em timestamptz
);

-- ============ SEGUIDORES ============
create table if not exists public.ws_seguidores (
  tarefa_id  uuid not null references public.ws_tarefas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tarefa_id, usuario_id)
);

-- ============ ANEXOS (metadados; arquivo vive no bucket privado) ============
create table if not exists public.ws_anexos (
  id            uuid primary key default gen_random_uuid(),
  tarefa_id     uuid not null references public.ws_tarefas(id) on delete cascade,
  enviado_por   uuid not null references public.usuarios(id),
  caminho       text not null unique,   -- 'tarefas/<tarefa_id>/<uuid>.<ext>'
  nome_arquivo  text not null,
  content_type  text,
  tamanho_bytes bigint,
  created_at    timestamptz not null default now(),
  excluido_em   timestamptz
);

-- ============ LOG DE ATIVIDADE (append-only) ============
create table if not exists public.ws_atividade (
  id         bigserial primary key,
  tarefa_id  uuid not null references public.ws_tarefas(id) on delete cascade,
  ator_id    uuid references public.usuarios(id),
  evento     text not null,   -- criada|titulo|responsavel|prazo|concluida|
                              -- reaberta|vinculo_add|vinculo_rm|arquivada|
                              -- restaurada|comentario|anexo|subtarefa
  mudanca    jsonb,           -- {de:…, para:…} — só o necessário
  created_at timestamptz not null default now()
);

-- ============ SINAL DE REALTIME (sem PII) ============
create table if not exists public.ws_realtime_ping (
  id        uuid primary key default gen_random_uuid(),
  tarefa_id uuid,
  kind      text,             -- 'tarefa' | 'comentario'
  at        timestamptz not null default now()
);
```

### 3.3 Índices

```sql
-- lista principal: pendentes por prazo
create index if not exists ws_tarefas_pendentes_idx
  on public.ws_tarefas (prazo_em nulls last, ordem)
  where concluida_em is null and excluida_em is null and arquivada_em is null;

-- "Minhas tarefas"
create index if not exists ws_tarefas_responsavel_idx
  on public.ws_tarefas (responsavel_id, prazo_em)
  where excluida_em is null and arquivada_em is null;

-- calendário (janela de mês)
create index if not exists ws_tarefas_prazo_idx
  on public.ws_tarefas (prazo_em)
  where prazo_em is not null and excluida_em is null;

create index if not exists ws_tarefas_pai_idx        on public.ws_tarefas (tarefa_pai_id);
create index if not exists ws_vinculo_contexto_idx   on public.ws_tarefa_contextos (contexto_id, tarefa_id);
create index if not exists ws_comentarios_tarefa_idx on public.ws_comentarios (tarefa_id, created_at);
create index if not exists ws_atividade_tarefa_idx   on public.ws_atividade (tarefa_id, created_at desc);
create index if not exists ws_ping_at_idx            on public.ws_realtime_ping (at desc);

-- busca full-text PT-BR sobre título + descrição
create index if not exists ws_tarefas_busca_idx
  on public.ws_tarefas
  using gin (to_tsvector('portuguese', coalesce(titulo,'') || ' ' || coalesce(descricao,'')));
```

### 3.4 `updated_at`

Não existe convenção de trigger no repo (hoje é setado na mão). Para este
módulo, criar uma única function `ws_touch_updated_at()` e aplicá-la em
`ws_contextos`, `ws_tarefas` e `ws_comentarios` — evita `updated_at` mentiroso,
que é justamente o que a checagem de concorrência precisa que seja verdade.

---

## 4. Idempotência e não-duplicação

Três mecanismos, cada um cobrindo um jeito diferente de duplicar:

1. **Duplo clique / retry de rede na criação** — o `id` da tarefa é gerado no
   **cliente** (`crypto.randomUUID()`) e enviado no FormData. O insert usa
   `.upsert(…, { onConflict: 'id', ignoreDuplicates: true })`. Reenviar o mesmo
   formulário não cria uma segunda linha.
2. **Ocorrência recorrente gerada duas vezes** — índice único parcial em
   `ocorrencia_chave` (`<recorrencia_id>:<data>`). O cron pode rodar duas vezes
   sem consequência.
3. **Mesma tarefa vinculada duas vezes ao mesmo contexto** — PK composta em
   `ws_tarefa_contextos`.

---

## 5. Segurança

### 5.1 O modelo correto aqui (leia antes de escrever policy)

O Postgres **não tem identidade do usuário** neste sistema — não há JWT do
Supabase, `auth.uid()` é sempre nulo. Portanto:

- **Toda** tabela `ws_*` de conteúdo: `enable row level security` e **nenhuma
  policy**. Resultado: `anon` e `authenticated` não leem nem escrevem nada;
  apenas `service_role` (servidor) entra. É exatamente o padrão já usado em
  `crm_leads`, `relatorios_comerciais`, `tokens_meta`, `usuarios`.
- **Exceção única:** `ws_realtime_ping` ganha `select to anon` (a tabela não
  tem PII: id, tarefa_id, kind, timestamp) e entra na publication
  `supabase_realtime`.
- **A autorização real vive no servidor**, em toda Server Action e route
  handler: `getUsuarioAtual()` → `temPermissao(usuario, 'workspace')` →
  regra de papel. Nenhuma action confia em id de usuário vindo do formulário —
  `criado_por`, `concluida_por`, `autor_id` vêm **sempre** da sessão.

> Escrever policies com `auth.uid()` aqui seria pior que não escrever: daria a
> aparência de proteção sem proteger nada, porque o app não passa por elas.

### 5.2 Matriz de permissão (aplicada no servidor)

Nova chave `workspace` em `ChavePermissao` + `PRESETS_PERMISSOES`:

| Papel | `workspace` no preset | Pode |
|---|---|---|
| `admin` | (bypass) | tudo, inclusive excluir definitivo e restaurar |
| `comercial` | `false` na V1 → `true` no rollout | criar, editar, concluir, comentar, arquivar o que criou ou é responsável |
| `gestor_trafego` | `false` na V1 → `true` no rollout | idem |
| `custom` | `false` | idem, se o admin marcar |

Regras finas, checadas na action:
- Editar/arquivar: autor **ou** responsável **ou** admin.
- Reatribuir responsável: qualquer um com `workspace` (o time é pequeno e o
  Asana hoje não restringe).
- Excluir definitivo (`DELETE` real, esvazia a lixeira): **só admin**.
- Editar/apagar comentário: só o autor, ou admin.

**Isso é a feature flag.** Enquanto o preset entregar `workspace: false` para
todos os papéis não-admin, o item some do rail (`AppShell`) e a rota
redireciona (`requererPermissao('workspace')`). Ligar = trocar o preset numa
migration + `configuracoes`.

### 5.3 Conteúdo e arquivos

- Descrição e comentário são **texto puro** no banco. A renderização é um
  parser próprio (`lib/workspace-markdown.ts`) que devolve **nós React** —
  nunca `dangerouslySetInnerHTML`.
- Autolink: só `https://` e `http://`. `javascript:`, `data:` e `vbscript:` são
  descartados no parser (não escapados — descartados). Links abrem com
  `target="_blank" rel="noopener noreferrer nofollow"`.
- Bucket `ws-anexos` **privado** (`public: false`). Nada de `getPublicUrl`.
- Upload: valida MIME contra allowlist, extensão coerente com o MIME, e teto de
  10 MB. Caminho `tarefas/<tarefa_id>/<uuid>.<ext>` — nome original só nos
  metadados, nunca no caminho.
- Download: `GET /api/workspace/anexo/[id]` → checa sessão + permissão → emite
  `createSignedUrl(caminho, 60)` → 302. A URL assinada nunca vai pro HTML nem
  pro log.
- Sentry: `beforeSend` do módulo não pode carregar `descricao`, `corpo` de
  comentário nem URL assinada.

---

## 6. Camada de código — arquivos a criar

```
supabase/migrations/
  20260721_workspace_fase1.sql          tabelas, índices, triggers, RLS, bucket
  20260722_workspace_permissao.sql      chave 'workspace' nos presets
  2026xxxx_workspace_recorrencia.sql    Fase 5

lib/
  workspace.ts                  tipos + leituras (server). Espelha lib/financeiro.ts
  workspace-actions.ts          "use server": criar/editar/concluir/vincular/…
  workspace-comentarios.ts      comentários + seguidores + menções
  workspace-anexos.ts           upload/signed URL (server-only)
  workspace-atividade.ts        registrarAtividade() — 1 função, chamada nas actions
  workspace-markdown.ts         parser markdown-lite → nós React (puro, testável)
  workspace-datas.ts            hoje/atrasada/próximos-7-dias em BRT (puro, testável)
  workspace-recorrencia.ts      Fase 5
  auth.ts                       (editar) + chave 'workspace'

components/workspace/
  WorkspaceNav.tsx              sub-abas (Lista · Calendário · Clientes · Minhas · Arquivo)
  ListaTarefas.tsx              lista agrupável + conclusão inline
  LinhaTarefa.tsx               1 linha: checkbox, título, responsável, prazo, chips
  TarefaDrawer.tsx              painel de detalhe (padrão LancamentoDrawer)
  CriacaoRapida.tsx             título + responsável + prazo + contexto → salvar
  CalendarioTarefas.tsx         grade mensal (base: components/crm/Calendario.tsx)
  BandejaSemData.tsx            drop zone de tarefas sem prazo
  FiltrosTarefas.tsx            busca, responsável, contexto, situação, período
  Subtarefas.tsx                lista + progresso concluídas/total
  Comentarios.tsx               thread cronológica
  Anexos.tsx                    upload + lista + download assinado
  HistoricoTarefa.tsx           render do ws_atividade
  DescricaoRica.tsx             textarea + preview do markdown-lite
  WorkspaceRealtime.tsx         canal ws_realtime_ping → router.refresh()

app/dashboard/workspace/
  page.tsx                      Lista (visão geral)
  calendario/page.tsx
  clientes/page.tsx
  clientes/[cliente]/page.tsx
  minhas/page.tsx
  arquivo/page.tsx

app/api/workspace/
  anexo/[id]/route.ts           GET → signed URL 60s
  recorrencia/route.ts          POST cron (Fase 5), Bearer CRON_SECRET

components/AppShell.tsx         (editar) item "Workspace" + IconeWorkspace
vercel.json                     (editar) cron da recorrência (Fase 5)
scripts/test-workspace.ts       verificação executável (§9)
```

**Convenções obrigatórias** (batem com o resto do repo): `getSupabaseAdmin()`
sempre; Server Actions recebem `FormData` e devolvem `{ok, erro?}`;
`exigirPermissao()` na primeira linha de toda action; `revalidatePath` no fim;
comentários em português explicando o *porquê*; sem libs novas.

---

## 7. UI — telas

Todas dentro de `/dashboard/workspace`, com `WorkspaceNav` no topo (mesmo
padrão de `components/financeiro/FinanceiroNav.tsx`).

**Lista (padrão)** — pendentes primeiro; atrasadas com marcação de cor **e**
rótulo textual ("Atrasada 3d" — cor sozinha não é acessível); agrupar por
prazo/responsável/contexto; checkbox conclui na hora (otimista, reverte com
mensagem se a action falhar); paginação server-side de 50.

**Calendário** — grade mensal derivada de `prazo_em`. Máx. 3 chips por dia +
"mais N". Arrastar (dnd-kit) → action que só altera `prazo_em`; falha reverte
visualmente. Bandeja lateral "Sem data" é origem e destino de arraste. Mês e
filtros preservados na URL ao abrir/fechar o drawer.

**Clientes** — lista de `cliente_trafego` ativos com contagem de pendentes e
atrasadas; abrir mostra as tarefas do contexto daquele cliente; criar a partir
dali já vincula. O contexto do cliente é criado **on demand** no primeiro uso
(nunca duplica cadastro de cliente — §3.2 tem índice único garantindo).

**Minhas tarefas** — Hoje · Atrasadas · Próximos 7 dias · Sem prazo ·
Concluídas recentemente. Tudo calculado em BRT por `workspace-datas.ts`.

**Arquivo/Lixeira** — concluídas, arquivadas e excluídas (soft). Busca, filtro,
reabrir e restaurar. Exclusão definitiva só para admin, com confirmação dupla.

**Drawer de detalhe** — desktop: lateral 480px; mobile: tela cheia. Conteúdo:
checkbox + título · responsável · prazo/hora · contextos (chips removíveis) ·
descrição · subtarefas com progresso · comentários · seguidores · anexos ·
histórico · duplicar/arquivar/excluir.

**Regra transversal:** nenhum toast de sucesso antes da confirmação do
Supabase. Falha de rede mostra erro e reverte o estado otimista.

---

## 8. Fases de execução

Uma fase por vez, cada uma com entregável verificável. Nada segue sem a
verificação da anterior fechada.

### Fase 1 — Fundação (banco + segurança)
Migration `20260721_workspace_fase1.sql` (§3), bucket privado `ws-anexos`,
chave `workspace` no RBAC, `lib/workspace.ts` com os tipos, `lib/workspace-datas.ts`,
`lib/workspace-markdown.ts`.
**Pronto quando:** migration roda limpa; `psql` confirma RLS ligada e zero
policy em todas as `ws_*` exceto o ping; um `SELECT` com a anon key retorna
vazio/erro em `ws_tarefas`; o parser passa no script de verificação.

### Fase 2 — Tarefas essenciais
Item no rail + rota + guard. Lista, criação rápida, drawer, edição de título/
responsável/prazo/descrição, concluir/reabrir, vínculo com contexto, subtarefas,
busca e filtros, soft delete, log de atividade.
**Pronto quando:** os itens 1, 2, 3, 5, 6, 10 e 12 do checklist (§9) passam.

### Fase 3 — Calendário e clientes
Calendário mensal, drag-and-drop persistente com rollback, bandeja sem data,
aba Clientes com contexto on demand, aba Minhas tarefas.
**Pronto quando:** itens 4 e 11 passam, e a mesma tarefa aparece nas 4 visões
com o **mesmo `id`** (verificado no banco, não na tela).

### Fase 4 — Colaboração
Comentários, seguidores, menções `@`, notificações via `criarNotificacao`
(novos tipos `ws_atribuicao`, `ws_prazo`, `ws_comentario`, `ws_vencendo` +
linhas em `preferencias_notificacao`), anexos privados, histórico, duplicar,
`ws_realtime_ping` + `WorkspaceRealtime`.
**Pronto quando:** itens 7, 8 e 9 passam e não há notificação duplicada.

### Fase 5 — Recorrência (V1.1)
`ws_recorrencias` + FK em `ws_tarefas.recorrencia_id`, gerador idempotente,
`/api/workspace/recorrencia` com `bearerValido()`, cron diário em `vercel.json`,
regra "só esta ocorrência" vs "esta e as próximas".
**Pronto quando:** rodar o endpoint 3x seguidas gera exatamente 1 ocorrência.

### Fase 6 — Homologação e rollout
Teste de restauração de backup documentado (§10), uso paralelo Asana+Workspace
por 2 semanas com o time real, e só então flip do preset RBAC para
`comercial`/`gestor_trafego`.

---

## 9. Verificação (sem framework de teste)

Duas trilhas, porque não há Jest/Playwright e instalar um agora atrasa a Fase 1
sem reduzir o risco real (que é de dados, não de render).

**Trilha A — `scripts/test-workspace.ts`** (`tsx`, contra o Supabase, como
`scripts/test-relatorios.ts`). Roda em qualquer fase, cria e limpa os próprios
dados, e cobre o que é caro descobrir tarde:
1. `workspace-datas`: hoje/atrasada/7dias na virada do dia em BRT e no horário
   de verão histórico.
2. `workspace-markdown`: `javascript:alert(1)` **não** vira link; `https://`
   vira; sem HTML na saída.
3. Constraints: `concluida_em` sem `concluida_por` é rejeitado; subtarefa de
   subtarefa é rejeitada; contexto `tipo='cliente'` sem `cliente_id` é rejeitado.
4. Idempotência: 3 upserts com o mesmo `id` ⇒ 1 linha; 2 ocorrências com a
   mesma `ocorrencia_chave` ⇒ 1 linha.
5. Isolamento: client **anon** faz `select` em `ws_tarefas` ⇒ 0 linhas ou erro.
6. Multi-contexto: 1 tarefa em 3 contextos ⇒ `count(*) from ws_tarefas` = 1;
   apagar 1 vínculo ⇒ tarefa continua existindo com 2.
7. Concorrência: 2 updates com a mesma `versao` ⇒ o segundo afeta 0 linhas.

**Trilha B — checklist manual** (executado no browser, desktop **e** mobile,
registrado neste doc com data e quem assinou):
1. Criar com título+responsável+prazo+cliente → aparece na lista e no calendário.
2. Mesma tarefa visível em Lista, Calendário, Minhas e Cliente — mesmo `id`.
3. Editar numa visão → refletiu nas outras após refresh/realtime.
4. Arrastar no calendário → **F5** → prazo novo persistiu.
5. Concluir → reabrir → arquivar → restaurar → histórico mostra os 4 eventos.
6. Subtarefa criada e concluída → progresso do pai atualiza.
7. Comentário + menção + seguidor → 1 notificação, não 2.
8. Link na descrição renderiza clicável; `javascript:` não vira link.
9. Upload e download de anexo; abrir a URL assinada 2 min depois → negado.
10. Remover de 1 contexto → tarefa segue nos outros.
11. Logar como `gestor_trafego` sem a chave `workspace` → item some do rail e a
    URL direta redireciona.
12. Duplo clique em "Criar" → 1 tarefa só.

**Regressão obrigatória a cada fase:** `npm run build` limpo (é o único gate
automático que existe hoje) + abrir Dashboard, Tráfego, Comercial, CRM e
Financeiro para confirmar que a mudança em `AppShell.tsx` e `lib/auth.ts` não
quebrou nav nem permissão de ninguém.

---

## 10. Não perder dados (o requisito nº 1 do Bruno)

1. **Soft delete em tudo.** `excluida_em`/`arquivada_em`/`excluido_em`. `DELETE`
   real só existe em: vínculo de contexto, seguidor, e esvaziar lixeira (admin).
2. **Log append-only** (`ws_atividade`) — nunca sofre UPDATE. Se um campo for
   sobrescrito por engano, o valor antigo está em `mudanca.de`.
3. **Backup verificado antes do desligamento do Asana**, não depois: confirmar
   o PITR do plano Supabase atual, restaurar em projeto de teste, e registrar
   aqui a data + o que foi restaurado. Se o plano não tiver PITR, adicionar um
   cron semanal de dump antes da Fase 6. **Esta é uma pendência de infra, não de
   código — precisa ser checada na Fase 1.**
4. **Migrations versionadas.** Nenhuma alteração pelo painel do Supabase — a
   alteração manual não é reproduzível e some do histórico do git.
5. **Concorrência detectada** (`versao`), nunca "último a salvar ganha" mudo.
6. **Sem falso sucesso:** toast só depois do retorno OK do Supabase.
7. **Exclusão definitiva** exige admin + confirmação digitando o título.

---

## 11. Fora de escopo (registrado para não voltar em reunião)

Portfólios, OKRs, carga de trabalho, aprovações, marcos, dependências e caminho
crítico, formulários do Asana, automações configuráveis, motor genérico de
campos personalizados, timesheets, status reports executivos, integrações de
marketplace, e seções sem nome só para imitar a estrutura atual do Asana.

Justificativa medida na auditoria do Asana: 0/100 tarefas usavam data inicial,
0/100 eram marcos, 0/100 preenchiam campos personalizados, e nenhuma dependência
apareceu no fluxo real.

---

## 12. Depois deste projeto

**Migração dos dados do Asana** — projeto separado. Nada do Asana é lido,
escrito ou importado durante as Fases 1–6. Quando for a hora: export via API do
Asana → CSV/JSON → script `tsx` de import idempotente por `gid` do Asana
(coluna `asana_gid` a ser adicionada então, com índice único).

**Desligamento do Asana** — só depois de: uso paralelo aprovado pelo time,
teste de restauração de backup registrado no §10, e a migração acima concluída.

---

## Registro de execução

| Fase | Status | Data | Observação |
|---|---|---|---|
| 1 — Fundação | **código pronto** | 2026-07-21 | migration escrita; falta APLICAR no Supabase (§14) |
| 2 — Tarefas | **código pronto** | 2026-07-21 | lista, criação rápida, drawer, subtarefas, filtros, soft delete, histórico |
| 3 — Calendário/Clientes | **código pronto** | 2026-07-21 | calendário mensal + drag-and-drop + bandeja; abas Clientes e Minhas |
| 4 — Colaboração | **parcial** | 2026-07-21 | comentários, menções, seguidores, notificações e realtime prontos. **Anexos não** — ver §15 |
| 5 — Recorrência | não iniciada | — | colunas já existem no banco (`recorrencia_id`, `ocorrencia_chave`) |
| 6 — Rollout | não iniciada | — | depende do §14 |

---

## 14. O QUE PRECISA SER FEITO À MÃO (nesta ordem)

O código está no repositório e compila. O que falta é o que só quem tem acesso
ao painel consegue fazer.

### Passo 1 — aplicar a migration

Supabase → SQL Editor → cole o conteúdo de
`supabase/migrations/20260721_workspace_fase1.sql` → Run.

A migration é idempotente (`if not exists` / `drop … if exists` em tudo), então
rodar duas vezes não quebra nada. Ela cria as 7 tabelas `ws_*`, os índices, os
triggers, liga a RLS, adiciona o tipo de notificação `ws_tarefa` e semeia dois
contextos (`Calendário de conteúdo` e `Anômalo Hub`).

### Passo 2 — conferir que a segurança ficou de pé

Ainda no SQL Editor:

```sql
-- Deve listar as 7 tabelas com rowsecurity = true
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename like 'ws_%';

-- Deve retornar EXATAMENTE uma linha: ws_realtime_ping_select.
-- Qualquer outra policy aqui é bug — apague.
select tablename, policyname from pg_policies
where schemaname = 'public' and tablename like 'ws_%';
```

### Passo 3 — rodar a verificação

```bash
npx tsx scripts/test-workspace.ts
```

Esperado: tudo verde. O bloco 3 (banco) só roda de verdade depois do Passo 1;
antes disso ele avisa que a migration não foi aplicada e falha de propósito.

### Passo 4 — usar

Entre no sistema com o seu usuário admin. O item **Workspace** aparece no fim
do menu lateral. Nenhum outro papel enxerga nada ainda — é a feature flag.

Percorra o checklist manual do §9 (trilha B), especialmente:
arrastar no calendário → **F5** → o prazo continua lá.

### Passo 5 — checar o backup ANTES de liberar pro time

No painel do Supabase, confirme se o plano atual tem **PITR (Point-in-Time
Recovery)**. Se não tiver, isso precisa ser resolvido antes de o time começar a
depender do módulo — hoje o Asana é o backup de fato, e ele vai embora.
Anote aqui a data em que isso foi verificado.

### Passo 6 — liberar pro time (só depois dos anteriores)

```sql
update public.usuarios
   set permissoes = jsonb_set(permissoes, '{workspace}', 'true'::jsonb)
 where ativo and papel in ('comercial','gestor_trafego');
```

Para reverter, troque `'true'` por `'false'`. Não precisa de deploy: a
permissão é lida a cada request.

---

## 15. O que ficou fora desta entrega (e por quê)

**Anexos.** O código não foi escrito. Exige um bucket privado novo
(`ws-anexos`), um route handler de signed URL e validação de MIME/tamanho —
e, olhando o uso real, o time cola link do Drive/Canva na descrição em vez de
anexar (0 anexos nativos encontrados na auditoria do Asana). Os links já
funcionam. Entra depois da recorrência, se aparecer demanda.

**Recorrência (Fase 5).** Cortada de propósito para a V1, como o próprio
briefing autoriza. As colunas (`recorrencia_id`, `ocorrencia_chave`) e o índice
único de idempotência já existem no banco, então a Fase 5 não vai precisar
mexer em tabela grande. "Duplicar" cobre o caso enquanto isso.

**Ordenação manual por arrasto na lista** (`ordem` já existe na tabela). O
calendário tem drag-and-drop; a lista ordena por prazo.
