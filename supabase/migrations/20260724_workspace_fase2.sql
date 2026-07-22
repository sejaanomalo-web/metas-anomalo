-- ============================================================================
-- Workspace Fase 2 — área do cliente, abas customizadas, notas ricas,
-- recorrência de tarefas e preferências por usuário.
--
-- APLICAR: Supabase → SQL Editor → colar este arquivo → Run.
-- Idempotente: pode rodar duas vezes sem efeito colateral.
-- ============================================================================

-- ============================================================
-- 1) RECORRÊNCIA — regra na própria tarefa
-- ============================================================
-- Formato: {"freq":"diaria"|"semanal"|"mensal"|"anual","dias":[0..6]}
-- ("dias" só na semanal: dias da semana, 0=domingo). A materialização é
-- LAZY: ao concluir uma tarefa recorrente, a action cria a próxima
-- ocorrência. ocorrencia_chave (índice único já existente da Fase 1)
-- garante idempotência: serie_id + data não duplica nem com duplo clique.
alter table public.ws_tarefas
  add column if not exists recorrencia jsonb;

-- ============================================================
-- 2) CONTEXTOS — foto de perfil + cliente nascido no Workspace
-- ============================================================
alter table public.ws_contextos
  add column if not exists foto_url text;

-- O CHECK da Fase 1 exigia cliente_id em todo tipo='cliente'. Agora um
-- cliente pode nascer DIRETO no Workspace (sem cadastro de tráfego) — o
-- vínculo com cliente_trafego continua existindo quando houver, e o índice
-- único parcial (cliente_id where not null) segue impedindo pasta duplicada
-- para clientes do cadastro.
alter table public.ws_contextos
  drop constraint if exists ws_contextos_cliente_coerente;
alter table public.ws_contextos
  add constraint ws_contextos_cliente_coerente check (
    tipo = 'cliente' or cliente_id is null
  );

-- ============================================================
-- 3) ABAS CUSTOMIZADAS — o "+" da régua de navegação
-- ============================================================
-- Aba de tipo 'calendario' ganha um contexto próprio (tipo interno) para as
-- tarefas dela; aba 'nota' guarda notas em ws_notas. As abas fixas do
-- sistema (Lista, Calendário, Clientes, Minhas, Arquivos, Estudos,
-- Configurações) são código, não linhas — por isso não podem ser excluídas.
create table if not exists public.ws_abas (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null check (length(btrim(nome)) > 0),
  tipo         text not null check (tipo in ('calendario','nota')),
  contexto_id  uuid references public.ws_contextos(id) on delete set null,
  ordem        int not null default 0,
  criado_por   uuid references public.usuarios(id),
  excluida_em  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists ws_abas_ativas_idx
  on public.ws_abas (ordem, created_at) where excluida_em is null;

-- ============================================================
-- 4) NOTAS — estilo iPhone Notes, HTML rico SANITIZADO no servidor
-- ============================================================
-- Uma nota pertence a exatamente UM escopo:
--   contexto_id -> aba "Nota" de um cliente
--   aba_id      -> aba customizada de tipo 'nota'
--   fixa        -> abas fixas 'arquivos' | 'estudos'
-- corpo_html só recebe o subconjunto permitido pelo sanitizador
-- (lib/workspace-notas.ts) — nunca HTML cru do cliente.
create table if not exists public.ws_notas (
  id           uuid primary key default gen_random_uuid(),
  contexto_id  uuid references public.ws_contextos(id) on delete cascade,
  aba_id       uuid references public.ws_abas(id) on delete cascade,
  fixa         text check (fixa in ('arquivos','estudos')),
  titulo       text not null default '',
  corpo_html   text not null default '',
  criado_por   uuid references public.usuarios(id),
  atualizado_por uuid references public.usuarios(id),
  excluida_em  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ws_notas_escopo_unico check (
    (contexto_id is not null)::int
    + (aba_id is not null)::int
    + (fixa is not null)::int = 1
  )
);

create index if not exists ws_notas_contexto_idx
  on public.ws_notas (contexto_id, updated_at desc) where excluida_em is null;
create index if not exists ws_notas_aba_idx
  on public.ws_notas (aba_id, updated_at desc) where excluida_em is null;
create index if not exists ws_notas_fixa_idx
  on public.ws_notas (fixa, updated_at desc) where excluida_em is null;

-- ============================================================
-- 5) PREFERÊNCIAS POR USUÁRIO — foto + modo de cor do calendário
-- ============================================================
create table if not exists public.ws_preferencias (
  usuario_id  uuid primary key references public.usuarios(id) on delete cascade,
  foto_url    text,
  modo_cor    text not null default 'colorido'
              check (modo_cor in ('colorido','mono')),
  updated_at  timestamptz not null default now()
);

-- RLS: mesmas regras do resto do workspace — acesso só via service_role
-- (o app valida permissão 'workspace' na camada de auth própria).
alter table public.ws_abas         enable row level security;
alter table public.ws_notas        enable row level security;
alter table public.ws_preferencias enable row level security;
