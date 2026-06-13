-- =============================================================================
-- VENDAS INFORMADAS PELO CLIENTE (formulário público /vendas/<token>)
-- =============================================================================
-- Cada cliente de tráfego ganha um token secreto (link compartilhável via
-- WhatsApp). O cliente final registra vendas vindas dos anúncios sem login.
--
-- Modelo em duas camadas:
--   • vendas_cliente        = EVENTO append-only (auditoria: quem, quando,
--                             quanto, observação). Nunca é sobrescrito.
--   • dados_diarios_log /   = SNAPSHOT do dia (contratos_real/faturamento_real
--     dados_diarios_cliente   são INCREMENTADOS a cada evento) — assim o funil
--                             "Vendas", faturamento, lucro e ROI dos painéis
--                             existentes refletem a venda sem mudança de leitura.
--                             O upsert do Sentinela não toca esses campos.
--
-- OBS: esta migration JÁ foi aplicada no projeto remoto (cawwccbuejmvfemgdhvl,
-- versão 20260611220438_vendas_cliente). Mantida no repo por consistência e é
-- idempotente (todos os comandos usam IF NOT EXISTS).
-- =============================================================================

-- Token do formulário público (1 por cliente, rotacionável via UPDATE).
alter table public.cliente_trafego
  add column if not exists vendas_form_token uuid not null default gen_random_uuid();

create unique index if not exists cliente_trafego_vendas_form_token_key
  on public.cliente_trafego (vendas_form_token);

-- Evento de venda informada (append-only; quantidade 0 = cliente confirmou
-- que NÃO houve vendas no dia — registro de confirmação, não soma nada).
create table if not exists public.vendas_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.cliente_trafego(id) on delete cascade,
  -- Denormalizados pra leitura/auditoria sem join:
  empresa_nome text not null,
  cliente_nome text not null,
  data date not null,
  quantidade integer not null default 0 check (quantidade >= 0),
  valor numeric not null default 0 check (valor >= 0),
  observacoes text,
  registrado_por text not null default 'formulario_cliente',
  created_at timestamptz not null default now()
);

create index if not exists vendas_cliente_cliente_data_idx
  on public.vendas_cliente (cliente_id, data);
create index if not exists vendas_cliente_empresa_data_idx
  on public.vendas_cliente (empresa_nome, data);

-- RLS ligada SEM policies: acesso só via service_role (padrão do projeto —
-- toda escrita/leitura passa pelas server actions do app).
alter table public.vendas_cliente enable row level security;
