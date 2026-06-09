-- Fase 2b: conjuntos (adsets) por dia. O Sentinela v3 (level=adset) popula.
-- RLS on sem policy (service-role only), igual às demais tabelas do agente.
-- (Aplicada no remoto via MCP em 2026-06-09.)
create table if not exists public.dados_diarios_adset (
  id uuid primary key default gen_random_uuid(),
  empresa_nome text not null,
  cliente_nome text,
  data date not null,
  origem text not null default 'pago',
  campanha_id text not null,
  campanha_nome text,
  adset_id text not null,
  adset_nome text,
  status text,
  segmentacao text,
  investimento_real numeric, leads_real int, conversas_real int,
  compras_real int, carrinho_real int, checkout_real int, view_real int, landing_real int,
  cliques_real int, impressoes_real int, alcance_real int, cpl_real numeric,
  created_at timestamptz not null default now(),
  constraint dados_diarios_adset_uniq unique (empresa_nome, data, origem, adset_id)
);
create index if not exists dados_diarios_adset_emp_camp_data_idx
  on public.dados_diarios_adset (empresa_nome, campanha_id, data);
alter table public.dados_diarios_adset enable row level security;
