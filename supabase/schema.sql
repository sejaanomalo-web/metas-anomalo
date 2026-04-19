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

-- Migração: clientes_ativos em dados_reais + configuracoes + log_semanal ----
alter table public.dados_reais
  add column if not exists clientes_ativos int;

-- Afrouxa a constraint de colaborador em comissionamento para aceitar
-- nomes livres cadastrados pelo drawer de Pessoas.
alter table public.comissionamento
  drop constraint if exists comissionamento_colaborador_check;

-- Funções do time + colunas extras em colaboradores --------------------------
create table if not exists public.funcoes_time (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criada_em timestamptz not null default now()
);

insert into public.funcoes_time (nome) values
  ('Gestor'),
  ('Tráfego Pago'),
  ('Editor de Vídeo'),
  ('Editor de Estáticos')
on conflict (nome) do nothing;

alter table public.colaboradores
  add column if not exists data_entrada date;
alter table public.colaboradores
  add column if not exists observacoes text;
alter table public.colaboradores
  add column if not exists is_fixed boolean default false;
alter table public.colaboradores
  add column if not exists descricao text;

-- Relaxa o check constraint de colaboradores.tipo para aceitar
-- 'personalizado' (além de 'gatilhos' e 'escala').
alter table public.colaboradores
  drop constraint if exists colaboradores_tipo_check;
alter table public.colaboradores
  add constraint colaboradores_tipo_check
  check (tipo in ('gatilhos', 'escala', 'personalizado'));

-- Remove duplicatas antigas em colaboradores: mantém o registro mais
-- recente de cada nome e apaga os demais (seguro — só deleta duplicatas
-- com mesmo nome).
delete from public.colaboradores a
using public.colaboradores b
where a.nome = b.nome
  and a.created_at < b.created_at;

-- Índice único por nome para bloquear novas duplicatas.
create unique index if not exists colaboradores_nome_unique_idx
  on public.colaboradores (nome);

-- Seed dos colaboradores fixos (Felipe, Vinicius, Emanuel) --------------
-- idempotente: só insere se o nome ainda não existe na tabela.
insert into public.colaboradores
  (nome, funcao, descricao, tipo, configuracao_padrao, ativo, is_fixed)
select
  'Felipe',
  'TRÁFEGO',
  'Bônus por gatilhos de performance',
  'gatilhos',
  '{"tipo":"gatilhos","gatilhos":[{"chave":"cpl_meta","rotulo":"CPL dentro da meta","valor":200},{"chave":"leads_meta","rotulo":"Meta de leads atingida","valor":200},{"chave":"roas_hato","rotulo":"ROAS Hato acima do alvo","valor":150,"alvoRoas":2.5},{"chave":"posts_prazo","rotulo":"100% posts no prazo","valor":150}]}'::jsonb,
  true,
  true
where not exists (select 1 from public.colaboradores where nome = 'Felipe');

insert into public.colaboradores
  (nome, funcao, descricao, tipo, configuracao_padrao, ativo, is_fixed)
select
  'Vinicius',
  'EDITOR · ESTÁTICOS E CARROSSÉIS',
  'Bônus por entregas válidas no mês',
  'escala',
  '{"tipo":"escala","faixas":[{"minimo":0,"bonus":0},{"minimo":10,"bonus":100},{"minimo":15,"bonus":200},{"minimo":20,"bonus":350},{"minimo":25,"bonus":500},{"minimo":30,"bonus":700}]}'::jsonb,
  true,
  true
where not exists (select 1 from public.colaboradores where nome = 'Vinicius');

insert into public.colaboradores
  (nome, funcao, descricao, tipo, configuracao_padrao, ativo, is_fixed)
select
  'Emanuel',
  'EDITOR DE VÍDEO · REELS',
  'Bônus por entregas válidas no mês',
  'escala',
  '{"tipo":"escala","faixas":[{"minimo":0,"bonus":0},{"minimo":5,"bonus":100},{"minimo":8,"bonus":200},{"minimo":11,"bonus":350},{"minimo":15,"bonus":500}]}'::jsonb,
  true,
  true
where not exists (select 1 from public.colaboradores where nome = 'Emanuel');

alter table public.funcoes_time enable row level security;

drop policy if exists funcoes_time_all on public.funcoes_time;
create policy funcoes_time_all
  on public.funcoes_time
  for all
  to anon, authenticated
  using (true)
  with check (true);

create table if not exists public.configuracoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  valor jsonb not null,
  updated_at timestamptz not null default now()
);

-- Overrides de metas por empresa × mês × ano (complementa lib/data.ts) -----
create table if not exists public.metas_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  mes text not null,
  ano int not null default 2026,
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (empresa, mes, ano)
);

alter table public.metas_empresa enable row level security;
drop policy if exists metas_empresa_all on public.metas_empresa;
create policy metas_empresa_all
  on public.metas_empresa
  for all
  to anon, authenticated
  using (true)
  with check (true);

create table if not exists public.log_semanal (
  id uuid primary key default gen_random_uuid(),
  semana int not null,
  mes text not null,
  ano int not null,
  preenchido_por text,
  timestamp timestamptz not null default now(),
  dados_salvos jsonb
);

alter table public.configuracoes enable row level security;
alter table public.log_semanal enable row level security;

drop policy if exists configuracoes_all on public.configuracoes;
create policy configuracoes_all
  on public.configuracoes
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists log_semanal_all on public.log_semanal;
create policy log_semanal_all
  on public.log_semanal
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ===========================================================================
-- Empresas gerenciadas pelo dashboard (CRUD via UI)
-- ===========================================================================
create table if not exists public.empresas_config (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  db text not null unique,
  nome text not null,
  tipo text not null check (tipo in ('leads-reunioes-contratos','hato','aton','diego')),
  subtitulo text,
  inicio_em text,
  cpl numeric,
  ticket_medio_projetado numeric,
  conversao_lead_reuniao numeric,
  conversao_reuniao_fechamento numeric,
  conversao_lead_orcamento numeric,
  conversao_orcamento_venda numeric,
  ativa boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.empresas_config enable row level security;
drop policy if exists empresas_config_all on public.empresas_config;
create policy empresas_config_all
  on public.empresas_config
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Remove a restrição de empresa fixa em dados_reais para aceitar empresas
-- adicionadas dinamicamente via UI.
alter table public.dados_reais
  drop constraint if exists dados_reais_empresa_check;

-- Seed das 6 empresas originais (idempotente — só insere se não existir)
insert into public.empresas_config
  (slug, db, nome, tipo, subtitulo, cpl, conversao_lead_reuniao, conversao_reuniao_fechamento, ordem)
select 'a2-marketing', 'a2_marketing', 'A2 Marketing',
  'leads-reunioes-contratos',
  'Agência de marketing',
  6, 0.1, 0.65, 1
where not exists (select 1 from public.empresas_config where slug = 'a2-marketing');

insert into public.empresas_config
  (slug, db, nome, tipo, subtitulo, cpl, conversao_lead_reuniao, conversao_reuniao_fechamento, ordem)
select 'f2-sports', 'f2_sports', 'F2 Sports',
  'leads-reunioes-contratos',
  'Artigos esportivos',
  5, 0.1, 0.6, 2
where not exists (select 1 from public.empresas_config where slug = 'f2-sports');

insert into public.empresas_config
  (slug, db, nome, tipo, subtitulo, cpl, conversao_lead_reuniao, conversao_reuniao_fechamento, ordem)
select 'f2-moveis', 'f2_moveis', 'F2 Móveis',
  'leads-reunioes-contratos',
  'Móveis planejados',
  20, 0.1, 0.6, 3
where not exists (select 1 from public.empresas_config where slug = 'f2-moveis');

insert into public.empresas_config
  (slug, db, nome, tipo, subtitulo, ordem)
select 'hato', 'hato', 'Hato',
  'hato',
  'E-commerce via influenciadores',
  4
where not exists (select 1 from public.empresas_config where slug = 'hato');

insert into public.empresas_config
  (slug, db, nome, tipo, subtitulo, cpl, conversao_lead_orcamento, conversao_orcamento_venda, ordem)
select 'aton', 'aton', 'Aton Estofados',
  'aton',
  'Estofados sob medida',
  15, 0.25, 0.5, 5
where not exists (select 1 from public.empresas_config where slug = 'aton');

insert into public.empresas_config
  (slug, db, nome, tipo, subtitulo, ordem)
select 'diego-knebel', 'diego', 'Diego Knebel',
  'diego',
  'Participação no faturamento',
  6
where not exists (select 1 from public.empresas_config where slug = 'diego-knebel');
