-- =============================================================================
-- LEADS DO META ADS (formulários instantâneos) → dashboard do cliente
-- =============================================================================
-- Substitui o fluxo manual "Google Sheets → copia e cola no WhatsApp".
--
-- Fluxo:
--   1. Meta chama POST /api/leads/meta/webhook a cada lead preenchido.
--   2. A rota grava o payload CRU em leads_webhook_eventos ANTES de qualquer
--      processamento (rede de segurança — nada se perde nem se o resto falhar).
--   3. Resolve o cliente pelo form_id (leads_form_mapping), busca o field_data
--      completo na Graph API e grava a linha final em leads_log.
--   4. O cliente acessa /leads/<leads_dash_token> e filtra por período e
--      formulário. SEM login — a segurança é o token uuid v4 na URL, mesmo
--      modelo já em produção no formulário público /vendas/<token>.
--   5. Cron diário /api/leads/reconciliar pergunta à Graph API quais leads
--      entraram nas últimas 24h e insere o que o webhook tiver perdido.
--
-- NÃO há envio automático de WhatsApp neste módulo: o link é fixo por cliente
-- e é copiado/enviado manualmente pelo time. Por isso não existe tabela de
-- destinatários nem coluna de status de envio.
--
-- RLS: ligada SEM policy em todas as tabelas novas = só service_role acessa.
-- Padrão do projeto (mesmo de usuarios, tokens_meta, cliente_trafego,
-- vendas_cliente). Dado sensível: telefone, e-mail e respostas livres que
-- podem conter informação financeira. A leitura do dashboard público também
-- passa por service_role, filtrando por cliente_id no servidor — a chave anon
-- nunca enxerga estas tabelas.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Token do dashboard de leads (1 por cliente, rotacionável via UPDATE)
-- -----------------------------------------------------------------------------
-- Mesmo desenho do vendas_form_token (20260611_vendas_cliente.sql): uuid v4
-- gerado pelo banco, unique, rotacionável se o link vazar.
alter table public.cliente_trafego
  add column if not exists leads_dash_token uuid not null default gen_random_uuid();

create unique index if not exists cliente_trafego_leads_dash_token_key
  on public.cliente_trafego (leads_dash_token);

-- -----------------------------------------------------------------------------
-- leads_form_mapping — vínculo formulário do Meta → cliente
-- -----------------------------------------------------------------------------
-- NÃO é uma tabela de clientes: o cliente já é cliente_trafego. Aqui só mora
-- "este form_id pertence a este cliente", mais o token da página dona do form.
--
-- page_access_token fica por LINHA (não numa env global) porque o leadgen exige
-- um token de PÁGINA — escopo diferente do token de ad account em tokens_meta,
-- obtido por página e dependente do aceite do cliente no Business Manager.
create table if not exists public.leads_form_mapping (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.cliente_trafego(id) on delete cascade,
  -- id do formulário instantâneo na Meta (chave de roteamento do webhook).
  form_id text not null,
  -- página dona do formulário (vem no webhook; usada na reconciliação).
  page_id text,
  -- Page Access Token de longa duração. Sem ele não dá pra ler o field_data
  -- nem reconciliar aquele formulário.
  page_access_token text,
  -- Rótulo amigável mostrado no filtro do cliente ("Cruz Habilitação", etc).
  rotulo text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1 formulário → 1 cliente. É a chave de roteamento: dois clientes disputando
-- o mesmo form_id seria ambiguidade sem resposta certa.
create unique index if not exists leads_form_mapping_form_id_key
  on public.leads_form_mapping (form_id);

create index if not exists leads_form_mapping_cliente_idx
  on public.leads_form_mapping (cliente_id, ativo);

alter table public.leads_form_mapping enable row level security;

-- -----------------------------------------------------------------------------
-- leads_webhook_eventos — log CRU do webhook (auditoria + replay)
-- -----------------------------------------------------------------------------
-- Primeira escrita de toda requisição, antes de qualquer processamento. Mesmo
-- papel do crm_wa_eventos no webhook da Evolution: se o processamento explodir,
-- o payload continua aqui e dá pra reprocessar sem pedir nada à Meta.
create table if not exists public.leads_webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  recebido_em timestamptz not null default now(),
  payload jsonb not null,
  -- quantos leadgen_id o payload continha (um webhook pode trazer vários).
  leads_no_payload integer not null default 0,
  processado boolean not null default false,
  erro_processamento text
);

create index if not exists leads_webhook_eventos_recebido_idx
  on public.leads_webhook_eventos (recebido_em desc);

-- Parcial: a fila de reprocessamento é sempre "o que falhou", nunca o histórico
-- inteiro (que cresce todo dia e nunca é varrido).
create index if not exists leads_webhook_eventos_pendentes_idx
  on public.leads_webhook_eventos (recebido_em)
  where processado = false;

alter table public.leads_webhook_eventos enable row level security;

-- -----------------------------------------------------------------------------
-- leads_log — o lead em si
-- -----------------------------------------------------------------------------
create table if not exists public.leads_log (
  id uuid primary key default gen_random_uuid(),
  -- Id do lead na Meta. É a CHAVE DE DEDUPLICAÇÃO entre webhook e
  -- reconciliação (as duas fontes podem trazer o mesmo lead).
  leadgen_id text not null,
  form_id text not null,
  page_id text,
  ad_id text,
  adset_id text,
  campaign_id text,
  -- NULL = formulário ainda não mapeado. O lead É GRAVADO MESMO ASSIM (vira
  -- "lead órfão" na tela interna) — perder o lead porque ninguém cadastrou a
  -- campanha nova seria exatamente o problema que este módulo veio resolver.
  cliente_id uuid references public.cliente_trafego(id) on delete set null,
  recebido_em timestamptz not null default now(),
  -- created_time da Meta (quando o usuário realmente enviou o formulário).
  created_time timestamptz,
  -- Dia-calendário BRT do lead, materializado. Os filtros do dashboard são
  -- todos por dia BRT e recebido_em é UTC — derivar em toda query é a receita
  -- clássica de bug de fuso (lead das 22h aparecendo no dia seguinte).
  data_brt date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  -- Payload cru do webhook/Graph. Auditoria completa e imutável.
  payload_bruto jsonb not null default '{}'::jsonb,
  -- Resposta do GET /{leadgen_id} — array [{name, values}] com TODAS as
  -- respostas do formulário, inclusive campos customizados por cliente.
  field_data jsonb,
  -- Extraídos do field_data pra busca e exibição (ver lib/leads-campos.ts).
  nome text,
  telefone text,
  email text,
  origem_registro text not null default 'webhook'
    check (origem_registro in ('webhook', 'reconciliacao')),
  processado boolean not null default false,
  erro_processamento text
);

-- Deduplicação NO BANCO. Feita em JS (select antes do insert) teria janela de
-- corrida entre webhook e cron de reconciliação rodando ao mesmo tempo.
create unique index if not exists leads_log_leadgen_id_key
  on public.leads_log (leadgen_id);

-- Consulta principal do dashboard do cliente: "meus leads, do período X".
create index if not exists leads_log_cliente_data_idx
  on public.leads_log (cliente_id, data_brt desc);

-- Ordenação dentro do período (mais recente primeiro).
create index if not exists leads_log_cliente_recebido_idx
  on public.leads_log (cliente_id, recebido_em desc);

-- Filtro por formulário dentro do cliente + varredura da reconciliação.
create index if not exists leads_log_form_data_idx
  on public.leads_log (form_id, data_brt desc);

-- Fila de leads órfãos (form não mapeado) pro time resolver.
create index if not exists leads_log_orfaos_idx
  on public.leads_log (recebido_em desc)
  where cliente_id is null;

alter table public.leads_log enable row level security;

-- -----------------------------------------------------------------------------
-- updated_at automático no mapping
-- -----------------------------------------------------------------------------
create or replace function public.fn_leads_form_mapping_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_leads_form_mapping_touch on public.leads_form_mapping;
create trigger trg_leads_form_mapping_touch
  before update on public.leads_form_mapping
  for each row
  execute function public.fn_leads_form_mapping_touch();
