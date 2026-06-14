-- =============================================================================
-- Metas por CLIENTE de tráfego + comercial por cliente
-- =============================================================================
-- (Já aplicada no remoto via MCP — mantida no repo por consistência; idempotente.)
--
-- metas_cliente espelha metas_empresa, mas chaveada por cliente_trafego.id
-- (uuid estável). Orgânico e pago são linhas separadas (origem na chave única),
-- igual à empresa. RLS ligada SEM policy → acesso só via service_role
-- (lib/metas-cliente.ts usa getSupabaseAdmin).
create table if not exists public.metas_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.cliente_trafego(id) on delete cascade,
  mes text not null,
  ano integer not null default 2026,
  origem text not null default 'pago' check (origem in ('pago','organico')),
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- O upsert (onConflict cliente_id,mes,ano,origem) DEPENDE deste índice único.
create unique index if not exists metas_cliente_cliente_mes_ano_origem_key
  on public.metas_cliente (cliente_id, mes, ano, origem);

alter table public.metas_cliente enable row level security;

-- Comercial por cliente: relatorios_comerciais ganha o vínculo opcional com o
-- cliente de tráfego (soft ref + nome denormalizado, padrão de
-- dados_diarios_campanha). Sem FK rígida (coerente com colaborador_id).
alter table public.relatorios_comerciais
  add column if not exists cliente_trafego_id uuid,
  add column if not exists cliente_nome text;

create index if not exists relatorios_comerciais_cliente_idx
  on public.relatorios_comerciais (cliente_trafego_id, data);
