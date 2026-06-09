-- =============================================================================
-- whatsapp_assinaturas - assinaturas dos relatorios diarios via WhatsApp
-- =============================================================================
-- Cada linha e uma pessoa que recebe um ou mais dos 3 relatorios (trafego,
-- comercial, hub) as 21h BRT. O cron /api/wa/diario le esta tabela com a
-- service_role key (que bypassa RLS), monta os relatorios conforme as flags e
-- dispara via template aprovado na Meta Cloud API.
--
-- SEGURANCA: telefone e dado sensivel. RLS fica LIGADO e SEM nenhuma policy,
-- entao anon/authenticated (browser) nao leem nem escrevem nada aqui. Apenas a
-- service_role (server-side, usada pelo cron) enxerga a tabela. Cadastro e
-- edicao de assinantes sao feitos por SQL/admin com a service_role.

create table if not exists public.whatsapp_assinaturas (
  id uuid primary key default gen_random_uuid(),
  -- Quem recebe. Se o usuario for removido, a assinatura vai junto.
  usuario_id uuid references public.usuarios(id) on delete cascade,
  -- E.164 sem "+" e sem espacos, ex: 5545999999999 (exigencia da Cloud API).
  telefone_e164 text not null,
  -- Quais dos 3 relatorios esta pessoa recebe.
  recebe_trafego boolean not null default false,
  recebe_comercial boolean not null default false,
  recebe_hub boolean not null default false,
  -- Desliga sem apagar (o cron so processa ativo = true).
  ativo boolean not null default true,
  -- Carimbo do ultimo envio bem-sucedido. Usado pra idempotencia diaria (BRT):
  -- se ja foi enviado hoje, o cron pula a pessoa.
  enviada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- O cron filtra por ativo = true; o indice ajuda quando a lista crescer.
create index if not exists whatsapp_assinaturas_ativo_idx
  on public.whatsapp_assinaturas (ativo);

-- RLS ligado e nenhuma policy: bloqueia anon/authenticated por completo.
-- A service_role ignora RLS, entao o cron continua lendo/escrevendo normal.
alter table public.whatsapp_assinaturas enable row level security;
