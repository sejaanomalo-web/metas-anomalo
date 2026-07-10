-- CRM — Fase 2: isolamento por usuario + etiquetas + cores + contatos +
-- lembretes. 2026-07-10.
--
-- Muda a politica de visibilidade: de "todos veem tudo" (Fase 0) para
-- "cada usuario ve so o que ELE conectou" (literalmente como WhatsApp Web —
-- instancia, leads, mensagens e atividades pertencem a quem criou a
-- instancia). RLS continua service_role-only (seguranca no app, via
-- requererPermissao + filtro usuario_id nas queries), igual ao padrao ja
-- usado no projeto inteiro.
--
-- Idempotente (if not exists / guards), aplicavel via apply_migration.

-- ===== 1) Isolamento por usuario =====

-- 1a) crm_instancias: dono da conexao + cor de identificacao visual.
alter table public.crm_instancias add column if not exists usuario_id uuid;
alter table public.crm_instancias add column if not exists usuario_nome text;
alter table public.crm_instancias add column if not exists cor text not null default '#C9953A';

-- Backfill: instancias existentes (criadas antes do isolamento) ficam com o
-- primeiro usuario admin — na pratica, quem conectou os numeros ate agora.
update public.crm_instancias
   set usuario_id = (select id from public.usuarios where papel = 'admin' order by created_at asc limit 1)
 where usuario_id is null;
update public.crm_instancias ci
   set usuario_nome = u.nome
  from public.usuarios u
 where ci.usuario_id = u.id and ci.usuario_nome is null;

alter table public.crm_instancias alter column usuario_id set not null;
create index if not exists crm_instancias_usuario_idx on public.crm_instancias (usuario_id);

-- 1b) crm_leads: dono herdado da instancia que originou o lead (denormalizado,
-- mesmo padrao de empresa_nome — evita join em toda leitura do inbox).
alter table public.crm_leads add column if not exists usuario_id uuid;
alter table public.crm_leads add column if not exists usuario_nome text;

update public.crm_leads cl
   set usuario_id = ci.usuario_id, usuario_nome = ci.usuario_nome
  from public.crm_instancias ci
 where cl.empresa_slug = ci.empresa_slug and cl.usuario_id is null;

-- Fallback: leads sem instancia correspondente (manual/formulario/trafego)
-- vao pro mesmo admin do backfill acima, pra nao ficarem orfaos/invisiveis.
update public.crm_leads
   set usuario_id = (select id from public.usuarios where papel = 'admin' order by created_at asc limit 1)
 where usuario_id is null;
update public.crm_leads cl
   set usuario_nome = u.nome
  from public.usuarios u
 where cl.usuario_id = u.id and cl.usuario_nome is null;

alter table public.crm_leads alter column usuario_id set not null;
create index if not exists crm_leads_usuario_recencia_idx on public.crm_leads (usuario_id, ultima_interacao_em desc);
create index if not exists crm_leads_usuario_etapa_idx on public.crm_leads (usuario_id, etapa_id, ordem_na_etapa);

-- 1c) crm_mensagens / crm_atividades: SOFT (igual autor_id/responsavel_id
-- ja existentes nessas tabelas) — copiado do lead no momento da escrita.
alter table public.crm_mensagens add column if not exists usuario_id uuid;
update public.crm_mensagens cm
   set usuario_id = cl.usuario_id
  from public.crm_leads cl
 where cm.lead_id = cl.id and cm.usuario_id is null;
create index if not exists crm_mensagens_usuario_idx on public.crm_mensagens (usuario_id);

alter table public.crm_atividades add column if not exists usuario_id uuid;
alter table public.crm_atividades add column if not exists notificado_em timestamptz;
update public.crm_atividades ca
   set usuario_id = cl.usuario_id
  from public.crm_leads cl
 where ca.lead_id = cl.id and ca.usuario_id is null;
create index if not exists crm_atividades_usuario_calendario_idx
  on public.crm_atividades (usuario_id, agendado_para) where agendado_para is not null;
create index if not exists crm_atividades_lembretes_idx
  on public.crm_atividades (lembrete_em) where concluido_em is null and notificado_em is null and lembrete_em is not null;

-- ===== 2) Contatos (nome salvo no celular, via CONTACTS_UPSERT/UPDATE) =====
-- Cache por instancia+telefone. Preenchido pelo webhook antes/durante a
-- criacao do lead, preferido sobre o pushName (autodeclarado pelo contato).
create table if not exists public.crm_contatos (
  id uuid primary key default gen_random_uuid(),
  instancia_id uuid not null references public.crm_instancias(id) on delete cascade,
  telefone_e164 text not null,
  nome text,
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_contatos_instancia_telefone_uq
  on public.crm_contatos (instancia_id, telefone_e164);

-- ===== 3) Etiquetas (labels, estilo WhatsApp Business) =====
-- Por usuario (mesmo espirito do isolamento: cada um cuida do seu vocabulario
-- de etiquetas, igual cuida das proprias instancias).
create table if not exists public.crm_etiquetas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  nome text not null,
  cor text not null default '#8e7cc3',
  created_at timestamptz not null default now()
);
create unique index if not exists crm_etiquetas_usuario_nome_uq
  on public.crm_etiquetas (usuario_id, lower(nome));
create index if not exists crm_etiquetas_usuario_idx on public.crm_etiquetas (usuario_id);

create table if not exists public.crm_lead_etiquetas (
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  etiqueta_id uuid not null references public.crm_etiquetas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, etiqueta_id)
);
create index if not exists crm_lead_etiquetas_etiqueta_idx on public.crm_lead_etiquetas (etiqueta_id);

-- ===== 4) Link do feed de calendario (ICS) por usuario =====
-- Token opaco, gerado sob demanda (gerarLinkCalendarioAction). Nao usa
-- EVOLUTION_WEBHOOK_SECRET nem CRON_SECRET — e por usuario, revogavel.
alter table public.usuarios add column if not exists crm_calendario_token text;
create unique index if not exists usuarios_crm_calendario_token_uq
  on public.usuarios (crm_calendario_token) where crm_calendario_token is not null;

-- ===== RLS (tabelas novas) =====
-- Mesmo padrao do resto do CRM: RLS habilitada SEM policy = so service_role.
alter table public.crm_contatos       enable row level security;
alter table public.crm_etiquetas      enable row level security;
alter table public.crm_lead_etiquetas enable row level security;

-- ===== 5) Notificacoes: novo tipo crm_lembrete =====
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'nova_venda','lembrete',
    'dados_comercial','dados_trafego','meta_batida','dados_sentinela',
    'crm_lembrete'
  ));

alter table public.preferencias_notificacao
  add column if not exists crm_lembrete boolean not null default true;
