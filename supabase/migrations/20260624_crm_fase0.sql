-- CRM — Fase 0: fundacao (schema + RLS + seeds). 2026-06-24.
--
-- Area nova /dashboard/crm (permissao 'crm'). Leads + Kanban + calendario +
-- WhatsApp via Evolution (3 numeros = 3 empresas, 1 webhook). Decisoes:
--   • todos veem tudo (RLS service_role-only, igual relatorios_comerciais);
--   • crm_realtime_ping e a UNICA tabela legivel pelo browser (sem PII).
-- Idempotente (if not exists / guards), aplicavel via apply_migration.

-- 1) Instancias Evolution -> empresa (1 numero = 1 empresa).
create table if not exists public.crm_instancias (
  id uuid primary key default gen_random_uuid(),
  instance_name text not null unique,           -- chave de roteamento do webhook (payload.instance)
  empresa_slug text not null,                   -- soft-link a empresas_config.slug
  numero_e164 text,
  display_nome text,
  status_conexao text not null default 'desconhecido'
    check (status_conexao in ('conectado','desconectado','qrcode','desconhecido')),
  ultimo_qr text,
  conectado_em timestamptz,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_instancias_empresa_idx on public.crm_instancias (empresa_slug);

-- 2) Etapas do Kanban (configuraveis, sem enum).
create table if not exists public.crm_etapas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null default 0,
  tipo text not null default 'aberta' check (tipo in ('aberta','ganho','perdido')),
  cor text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists crm_etapas_ordem_idx on public.crm_etapas (ordem) where ativo;

-- 3) Leads (contato + card do Kanban + ficha + dono da thread).
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  empresa_slug text not null,
  empresa_nome text not null,                   -- denormalizado (padrao do projeto)
  telefone_e164 text,                           -- E.164 sem '+'; null p/ lead manual
  nome text,
  email text,
  etapa_id uuid references public.crm_etapas(id) on delete set null,
  ordem_na_etapa numeric not null default 0,    -- drag-and-drop sem renumerar
  responsavel_id uuid,                          -- SOFT (usuarios/colaboradores); atribuicao, NAO seguranca
  responsavel_nome text,
  valor_estimado numeric,
  origem text not null default 'whatsapp'
    check (origem in ('whatsapp','manual','formulario','trafego','importado')),
  status text not null default 'aberto' check (status in ('aberto','ganho','perdido')),
  motivo_perda text,
  cliente_trafego_id uuid,                      -- SOFT, gancho p/ o funil de trafego
  ultima_interacao_em timestamptz,
  nao_lidas int not null default 0,
  arquivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- UNIQUE simples: no Postgres NULLs sao distintos, entao varios leads manuais
-- sem telefone coexistem; a unicidade so vale quando telefone_e164 e nao-nulo.
-- (Plano em vez de indice parcial -> compativel com upsert on_conflict do PostgREST.)
create unique index if not exists crm_leads_empresa_telefone_uq
  on public.crm_leads (empresa_slug, telefone_e164);
create index if not exists crm_leads_etapa_ordem_idx on public.crm_leads (etapa_id, ordem_na_etapa);
create index if not exists crm_leads_empresa_recencia_idx on public.crm_leads (empresa_slug, ultima_interacao_em desc);
create index if not exists crm_leads_empresa_status_idx on public.crm_leads (empresa_slug, status);
create index if not exists crm_leads_responsavel_idx on public.crm_leads (responsavel_id);
create index if not exists crm_leads_ativos_idx on public.crm_leads (arquivado) where arquivado = false;

-- 4) Mensagens WhatsApp (in/out), idempotentes.
create table if not exists public.crm_mensagens (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  instancia_id uuid references public.crm_instancias(id) on delete set null,
  empresa_slug text not null,
  direcao text not null check (direcao in ('in','out')),
  tipo text not null default 'texto'
    check (tipo in ('texto','imagem','audio','video','documento','figurinha','localizacao','contato','sistema')),
  conteudo text,
  midia_url text,
  wa_message_id text,
  status text not null default 'recebida'
    check (status in ('enviando','enviada','entregue','lida','falha','recebida')),
  erro text,
  autor_id uuid,
  autor_nome text,
  from_me boolean not null default false,       -- true = enviada pelo celular OU pelo CRM
  wa_timestamp timestamptz,
  metadados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists crm_mensagens_wamid_uq
  on public.crm_mensagens (instancia_id, wa_message_id);
create index if not exists crm_mensagens_lead_idx on public.crm_mensagens (lead_id, wa_timestamp);
create index if not exists crm_mensagens_empresa_idx on public.crm_mensagens (empresa_slug, created_at desc);
create index if not exists crm_mensagens_pendentes_idx on public.crm_mensagens (status) where status in ('enviando','falha');

-- 5) Atividades (timeline da ficha + eventos do calendario).
create table if not exists public.crm_atividades (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  empresa_slug text not null,
  tipo text not null check (tipo in ('nota','ligacao','reuniao','tarefa','mudanca_etapa','email')),
  titulo text,
  corpo text,
  etapa_de uuid,
  etapa_para uuid,
  agendado_para timestamptz,                     -- preenchido -> item do calendario
  agendado_fim timestamptz,
  concluido_em timestamptz,                      -- null = pendente/futuro
  lembrete_em timestamptz,
  autor_id uuid,
  autor_nome text,
  metadados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_atividades_lead_idx on public.crm_atividades (lead_id, created_at desc);
create index if not exists crm_atividades_calendario_idx on public.crm_atividades (empresa_slug, agendado_para) where agendado_para is not null;
create index if not exists crm_atividades_pendentes_idx on public.crm_atividades (agendado_para) where concluido_em is null and agendado_para is not null;

-- 6) Log cru de webhooks (auditoria + replay + 2a linha de idempotencia).
create table if not exists public.crm_wa_eventos (
  id uuid primary key default gen_random_uuid(),
  instance_name text,
  evento text,
  wa_message_id text,
  processado boolean not null default false,
  erro_processamento text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists crm_wa_eventos_fila_idx on public.crm_wa_eventos (created_at) where processado = false;
create index if not exists crm_wa_eventos_instancia_idx on public.crm_wa_eventos (instance_name, created_at desc);
create index if not exists crm_wa_eventos_evento_idx on public.crm_wa_eventos (evento, processado);

-- 7) Sinal de Realtime SEM PII (unica tabela que o browser le).
create table if not exists public.crm_realtime_ping (
  id uuid primary key default gen_random_uuid(),
  empresa_slug text,
  lead_id uuid,
  kind text,                                     -- 'msg' | 'lead' | 'atividade' | 'conexao'
  at timestamptz not null default now()
);
create index if not exists crm_realtime_ping_empresa_idx on public.crm_realtime_ping (empresa_slug, at desc);
create index if not exists crm_realtime_ping_at_idx on public.crm_realtime_ping (at);

-- ===== RLS =====
-- Conteudo: RLS habilitada SEM policy = so service_role (mesmo padrao de
-- relatorios_comerciais/tokens_meta). A seguranca real e o cookie do app
-- (requererPermissao('crm')). anon/authenticated nao leem nem escrevem.
alter table public.crm_instancias    enable row level security;
alter table public.crm_etapas        enable row level security;
alter table public.crm_leads         enable row level security;
alter table public.crm_mensagens     enable row level security;
alter table public.crm_atividades    enable row level security;
alter table public.crm_wa_eventos    enable row level security;

-- Excecao cirurgica: crm_realtime_ping legivel pelo anon (browser), mas SEM
-- PII (so empresa_slug/lead_id/kind). INSERT continua so via service_role.
alter table public.crm_realtime_ping enable row level security;
drop policy if exists crm_realtime_ping_select on public.crm_realtime_ping;
create policy crm_realtime_ping_select
  on public.crm_realtime_ping
  for select
  to anon, authenticated
  using (true);

-- Realtime (Replication) so na tabela-sinal. Guard: ignora se ja adicionada
-- ou se a publication nao existir neste ambiente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'crm_realtime_ping'
  ) then
    execute 'alter publication supabase_realtime add table public.crm_realtime_ping';
  end if;
exception when undefined_object then
  null;  -- publication supabase_realtime ausente neste ambiente
end $$;

-- ===== SEEDS =====
-- Etapas iniciais do Kanban (so se a tabela estiver vazia).
insert into public.crm_etapas (nome, ordem, tipo, cor)
select v.nome, v.ordem, v.tipo, v.cor from (values
  ('Novo',             0, 'aberta',  '#9aa0a6'),
  ('Em conversa',      1, 'aberta',  '#4a90d9'),
  ('Qualificado',      2, 'aberta',  '#C9953A'),
  ('Reunião agendada', 3, 'aberta',  '#8e7cc3'),
  ('Proposta',         4, 'aberta',  '#e0a458'),
  ('Ganho',            5, 'ganho',   '#4caf50'),
  ('Perdido',          6, 'perdido', '#e24b4a')
) as v(nome, ordem, tipo, cor)
where not exists (select 1 from public.crm_etapas);

-- Instancias Evolution: NAO semeadas (mapa slug<->numero<->empresa vem do
-- usuario; slugs de empresas_config sao confusos, nao chutar). Preencher 1
-- linha por numero quando confirmado, ex.:
--   insert into public.crm_instancias (instance_name, empresa_slug, numero_e164, display_nome)
--   values ('tato-comercial','aton','5545999999999','Comercial Tato');

-- ===== PERMISSAO 'crm' =====
-- Concede a chave aos papeis admin e comercial existentes (JSONB sem CHECK).
update public.usuarios
   set permissoes = coalesce(permissoes, '{}'::jsonb) || '{"crm": true}'::jsonb
 where papel in ('admin','comercial');
