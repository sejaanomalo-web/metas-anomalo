-- Esquema do projeto Anômalo Hub Dashboard
-- Rode este SQL no SQL Editor do Supabase (uma vez).

-- Extensão para uuid_generate_v4 (geralmente já existe)
create extension if not exists "uuid-ossp";

-- Tabela dados_reais --------------------------------------------------------
create table if not exists public.dados_reais (
  id uuid primary key default uuid_generate_v4(),
  empresa text not null check (
    empresa in ('a2_marketing','f2_sports','f2_moveis','hato','aton','diego')
  ),
  mes text not null check (
    mes in ('Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro')
  ),
  ano int not null default 2025,
  investimento_real numeric,
  leads_real int,
  reunioes_real int,
  contratos_real int,
  faturamento_real numeric,
  criativos_entregues int,
  cpl_real numeric,
  observacoes text,
  updated_at timestamptz not null default now(),
  unique (empresa, mes, ano)
);

-- Tabela comissionamento ----------------------------------------------------
create table if not exists public.comissionamento (
  id uuid primary key default uuid_generate_v4(),
  colaborador text not null check (colaborador in ('felipe','vinicius','emanuel')),
  mes text not null check (
    mes in ('Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro')
  ),
  ano int not null default 2025,
  entregas_validas int,
  bonus_calculado numeric not null default 0,
  detalhes jsonb,
  updated_at timestamptz not null default now(),
  unique (colaborador, mes, ano)
);

-- RLS -----------------------------------------------------------------------
-- Este painel é interno e a autenticação acontece no próprio app via cookie.
-- Portanto liberamos leitura e escrita pelo ANON key (o app gera o JWT).
-- Se preferir restringir via Supabase Auth, customize as policies abaixo.
alter table public.dados_reais enable row level security;
alter table public.comissionamento enable row level security;

drop policy if exists dados_reais_all on public.dados_reais;
create policy dados_reais_all
  on public.dados_reais
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists comissionamento_all on public.comissionamento;
create policy comissionamento_all
  on public.comissionamento
  for all
  to anon, authenticated
  using (true)
  with check (true);
