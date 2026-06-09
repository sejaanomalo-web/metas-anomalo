-- Fase 2a do Gerenciador de Anúncios: breakdown de conversões + status +
-- objetivo por campanha em dados_diarios_campanha. Aditivo e nulável — a UI
-- mostra "—" até o Sentinela v2 popular (e o backfill re-puxar maio/junho).
-- (Aplicada no remoto via MCP em 2026-06-09.)
alter table public.dados_diarios_campanha
  add column if not exists status        text,  -- ACTIVE | PAUSED | ARCHIVED (effective_status)
  add column if not exists objetivo      text,  -- objective do Meta (cru)
  add column if not exists compras_real  int,
  add column if not exists carrinho_real int,
  add column if not exists checkout_real int,
  add column if not exists view_real     int,   -- view_content
  add column if not exists landing_real  int;   -- landing_page_view

comment on column public.dados_diarios_campanha.status is
  'effective_status da campanha no Meta (ACTIVE/PAUSED/ARCHIVED). Fase 2a.';
comment on column public.dados_diarios_campanha.objetivo is
  'objective da campanha no Meta (cru). Fase 2a — base do "resultados" preciso.';
