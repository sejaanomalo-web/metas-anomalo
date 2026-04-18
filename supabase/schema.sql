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
  ano int not null default 2026,
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
  ano int not null default 2026,
  entregas_validas int,
  bonus_calculado numeric not null default 0,
  detalhes jsonb,
  updated_at timestamptz not null default now(),
  unique (colaborador, mes, ano)
);

-- Migração: atualiza o default do ano para 2026 em instalações antigas
alter table public.dados_reais alter column ano set default 2026;
alter table public.comissionamento alter column ano set default 2026;

-- Tabelas de configuração do comissionamento ------------------------------
create extension if not exists "pgcrypto";

create table if not exists public.metas_comissionamento (
  id uuid primary key default gen_random_uuid(),
  colaborador text not null,
  mes text not null,
  ano int not null default 2026,
  configuracao jsonb not null,
  updated_at timestamptz not null default now(),
  unique (colaborador, mes, ano)
);

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  funcao text not null,
  tipo text not null check (tipo in ('gatilhos','escala')),
  configuracao_padrao jsonb not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.metas_comissionamento enable row level security;
alter table public.colaboradores enable row level security;

drop policy if exists metas_comissionamento_all on public.metas_comissionamento;
create policy metas_comissionamento_all
  on public.metas_comissionamento
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists colaboradores_all on public.colaboradores;
create policy colaboradores_all
  on public.colaboradores
  for all
  to anon, authenticated
  using (true)
  with check (true);

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
