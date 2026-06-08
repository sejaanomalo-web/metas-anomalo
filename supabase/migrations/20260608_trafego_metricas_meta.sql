-- Métricas de anúncio do Meta (contrato p/ o Sentinela) + tabela por
-- campanha. Tudo ADITIVO e nulável — não altera dados existentes.
--
-- Rollups diários ganham cliques/alcance/conversas (+ impressões/cpm já
-- existentes em dados_diarios_log). A tabela dados_diarios_campanha guarda
-- a granularidade por campanha (categoria + destino), base da coluna
-- "Categoria" do histórico e dos rollups. O agente Sentinela popula tudo.

-- Rollups diários: empresa
alter table public.dados_diarios_log add column if not exists cliques_real int;
alter table public.dados_diarios_log add column if not exists alcance_real int;
alter table public.dados_diarios_log add column if not exists conversas_real int;

-- Rollups diários: cliente (tabela do Sentinela) — também ganha as
-- métricas de anúncio e de negócio.
alter table public.dados_diarios_cliente add column if not exists cliques_real int;
alter table public.dados_diarios_cliente add column if not exists alcance_real int;
alter table public.dados_diarios_cliente add column if not exists conversas_real int;
alter table public.dados_diarios_cliente add column if not exists impressoes_real int;
alter table public.dados_diarios_cliente add column if not exists cpm_real numeric;
alter table public.dados_diarios_cliente add column if not exists faturamento_real numeric;
alter table public.dados_diarios_cliente add column if not exists reunioes_real int;
alter table public.dados_diarios_cliente add column if not exists contratos_real int;

-- Granularidade por campanha (categoria/destino + rollups).
create table if not exists public.dados_diarios_campanha (
  id uuid primary key default gen_random_uuid(),
  empresa_nome text not null,
  cliente_nome text,
  data date not null,
  origem text not null default 'pago',
  campanha_id text,
  campanha_nome text,
  categoria text,        -- remarketing | vendas | leads
  destino text,          -- whatsapp | instagram | messenger | site | ...
  investimento_real numeric,
  leads_real int,
  conversas_real int,
  cliques_real int,
  impressoes_real int,
  alcance_real int,
  cpl_real numeric,
  created_at timestamptz not null default now(),
  unique (empresa_nome, data, origem, campanha_id)
);

create index if not exists dados_diarios_campanha_emp_data_idx
  on public.dados_diarios_campanha (empresa_nome, data);
create index if not exists dados_diarios_campanha_cli_data_idx
  on public.dados_diarios_campanha (cliente_nome, data);

-- RLS service-role-only (padrão das tabelas do Sentinela).
alter table public.dados_diarios_campanha enable row level security;
