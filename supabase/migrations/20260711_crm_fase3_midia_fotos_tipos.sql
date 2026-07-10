-- CRM — Fase 3: foto de perfil + preview da ultima msg + midia (audio) +
-- tipos de atividade (qualificacao/conteudo) + correcao do lado das
-- mensagens fromMe. 2026-07-11.
--
-- Idempotente (if not exists / guards), aplicavel via apply_migration.

-- ===== 1) Foto de perfil (estilo WhatsApp) + preview da ultima mensagem =====
-- foto_url: URL da foto de perfil do contato (via Evolution
-- fetchProfilePictureUrl / CONTACTS_UPSERT.profilePicUrl). Pode expirar (CDN do
-- WhatsApp) — a UI cai pro avatar de iniciais quando a imagem nao carrega.
alter table public.crm_leads    add column if not exists foto_url text;
alter table public.crm_contatos add column if not exists foto_url text;

-- ultima_msg_preview: previa (denormalizada) da ultima mensagem, pra lista de
-- conversas mostrar como o WhatsApp (sem carregar todas as mensagens).
alter table public.crm_leads add column if not exists ultima_msg_preview text;

-- ===== 2) Categoria da atividade (Follow-up / Reuniao / Fechamento / custom) =====
-- Rotulo livre exibido na UI. `tipo` (com CHECK) continua sendo o eixo tecnico
-- (tarefa/reuniao/...); `categoria` e o rotulo de negocio que o usuario escolhe.
alter table public.crm_atividades add column if not exists categoria text;

-- Tipos de atividade custom por usuario (alem dos 4 padrao, que ficam no
-- codigo em lib/crm-tipos-atividade.ts). Botao "+" na thread cria aqui.
create table if not exists public.crm_tipos_atividade (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  nome text not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists crm_tipos_atividade_usuario_nome_uq
  on public.crm_tipos_atividade (usuario_id, lower(nome));
create index if not exists crm_tipos_atividade_usuario_idx
  on public.crm_tipos_atividade (usuario_id);
alter table public.crm_tipos_atividade enable row level security;

-- ===== 3) Correcao do lado das mensagens (bug: fromMe gravado como 'in') =====
-- Mensagens enviadas pelo proprio celular chegam no webhook com fromMe=true
-- mas eram gravadas com direcao='in' (apareciam no lado do cliente). A partir
-- de agora o inbound grava direcao='out' quando fromMe; aqui corrige o passado.
update public.crm_mensagens
   set direcao = 'out',
       status  = case when status = 'recebida' then 'enviada' else status end
 where from_me = true and direcao = 'in';

-- ===== 4) Bucket de midia (audios enviados/recebidos) =====
-- Publico: as URLs sao UUIDs nao-adivinhaveis. Upload so via service_role
-- (getSupabaseAdmin bypassa RLS). Guard: nao falha se storage indisponivel.
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('crm-midia', 'crm-midia', true)
  on conflict (id) do nothing;
exception when undefined_table then
  null; -- schema storage ausente neste ambiente (ex: banco local sem storage)
end $$;
