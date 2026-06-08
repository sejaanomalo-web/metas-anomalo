-- ===========================================================================
-- Processo de Relatórios — Comercial
--
-- Duas tabelas novas:
--   • relatorios_comerciais — trilha DIÁRIA por colaborador (atividade da
--     pessoa: prospecção, reuniões, propostas/fechamentos). 1 linha por
--     (colaborador, dia) → upsert.
--   • pipeline_comercial — oportunidades por etapa do funil. Modelo híbrido:
--     liga a empresa/cliente existente (empresa_config_slug / cliente_trafego_id)
--     OU é um prospect novo que ainda não é cliente do hub.
--
-- RLS: dados comerciais são sensíveis (desempenho individual + valores de
-- negócios). O app acessa essas tabelas SOMENTE via service_role
-- (getSupabaseAdmin em lib/relatorios-comerciais.ts), então RLS fica
-- habilitada SEM policy = só service_role acessa. Mesmo padrão de usuarios,
-- tokens_meta e cliente_trafego.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- Relatório diário comercial ------------------------------------------------
create table if not exists public.relatorios_comerciais (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text not null,
  data date not null,
  -- Prospecção (outbound do dia)
  ligacoes int not null default 0,
  mensagens int not null default 0,
  conexoes_novas int not null default 0,
  -- Reuniões / agendamentos
  reunioes_agendadas int not null default 0,
  reunioes_realizadas int not null default 0,
  no_shows int not null default 0,
  -- Propostas e fechamentos
  propostas_enviadas int not null default 0,
  contratos_fechados int not null default 0,
  faturamento_gerado numeric not null default 0,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colaborador_id, data)
);

create index if not exists relatorios_comerciais_data_idx
  on public.relatorios_comerciais (data);
create index if not exists relatorios_comerciais_colab_data_idx
  on public.relatorios_comerciais (colaborador_id, data);

-- Pipeline comercial por etapa ----------------------------------------------
create table if not exists public.pipeline_comercial (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  empresa_config_slug text,
  cliente_trafego_id uuid,
  etapa text not null default 'lead' check (
    etapa in ('lead','qualificado','reuniao','proposta','fechado','perdido')
  ),
  responsavel_id uuid,
  responsavel_nome text,
  valor_estimado numeric,
  origem_contato text,
  ultima_atualizacao date,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pipeline_comercial_etapa_idx
  on public.pipeline_comercial (etapa);
create index if not exists pipeline_comercial_ativo_idx
  on public.pipeline_comercial (ativo);

-- RLS habilitada sem policy = só service_role acessa (server-only).
alter table public.relatorios_comerciais enable row level security;
alter table public.pipeline_comercial enable row level security;
