-- Esquema do projeto Anômalo Hub Dashboard
-- Rode este SQL no SQL Editor do Supabase (uma vez).

create extension if not exists "uuid-ossp";

-- Tabela dados_reais --------------------------------------------------------
create table if not exists public.dados_reais (
  id uuid primary key default uuid_generate_v4(),
  empresa text not null check (
    empresa in ('a2_marketing','f2_sports','f2_moveis','hato','aton','diego')
  ),
  mes text not null check (
    mes in ('Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
            'Agosto','Setembro','Outubro','Novembro','Dezembro')
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
    mes in ('Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
            'Agosto','Setembro','Outubro','Novembro','Dezembro')
  ),
  ano int not null default 2026,
  entregas_validas int,
  entregas_descontadas int,
  bonus_calculado numeric not null default 0,
  gatilhos_atingidos jsonb,
  observacoes text,
  updated_at timestamptz not null default now(),
  unique (colaborador, mes, ano)
);

-- Migrações (se já existiam versões anteriores) ----------------------------
alter table public.dados_reais
  drop constraint if exists dados_reais_mes_check;
alter table public.dados_reais
  add constraint dados_reais_mes_check check (
    mes in ('Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
            'Agosto','Setembro','Outubro','Novembro','Dezembro')
  );

alter table public.comissionamento
  drop constraint if exists comissionamento_mes_check;
alter table public.comissionamento
  add constraint comissionamento_mes_check check (
    mes in ('Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
            'Agosto','Setembro','Outubro','Novembro','Dezembro')
  );

alter table public.comissionamento
  add column if not exists entregas_descontadas int;
alter table public.comissionamento
  add column if not exists observacoes text;
alter table public.comissionamento
  add column if not exists gatilhos_atingidos jsonb;

-- Migra dados antigos da coluna detalhes (renomeada para gatilhos_atingidos)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'comissionamento'
               and column_name = 'detalhes') then
    update public.comissionamento
       set gatilhos_atingidos = detalhes
     where gatilhos_atingidos is null and detalhes is not null;
    alter table public.comissionamento drop column detalhes;
  end if;
end $$;

-- RLS -----------------------------------------------------------------------
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
