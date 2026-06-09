-- Fase 2c: anúncios (ads) por dia. O Sentinela v3 (level=ad) popula.
-- todos_cliques_real = clicks (todos) vs cliques_real = inline_link_clicks.
-- RLS on sem policy (service-role only). (Aplicada no remoto via MCP em 2026-06-09.)
create table if not exists public.dados_diarios_ad (
  id uuid primary key default gen_random_uuid(),
  empresa_nome text not null,
  cliente_nome text,
  data date not null,
  origem text not null default 'pago',
  campanha_id text not null,
  adset_id text not null,
  adset_nome text,
  ad_id text not null,
  ad_nome text,
  criativo_tipo text,
  status text,
  investimento_real numeric, leads_real int, conversas_real int,
  compras_real int, carrinho_real int, checkout_real int, view_real int, landing_real int,
  cliques_real int, todos_cliques_real int, impressoes_real int, alcance_real int, cpl_real numeric,
  created_at timestamptz not null default now(),
  constraint dados_diarios_ad_uniq unique (empresa_nome, data, origem, ad_id)
);
create index if not exists dados_diarios_ad_emp_adset_data_idx
  on public.dados_diarios_ad (empresa_nome, adset_id, data);
alter table public.dados_diarios_ad enable row level security;
