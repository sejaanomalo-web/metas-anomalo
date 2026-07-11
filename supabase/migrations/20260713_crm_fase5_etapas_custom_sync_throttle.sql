-- CRM — Fase 5: etapas customizáveis por usuário + throttle do auto-sync de
-- perfil. 2026-07-13. Idempotente.
--
-- Etapas do Kanban continuam COMPARTILHADAS por padrão (usuario_id null =
-- visível a todos, mesmo comportamento de sempre) — mas agora um usuário pode
-- criar as PRÓPRIAS etapas (usuario_id = dono), visíveis só pra ele. Mesmo
-- espírito de crm_tipos_atividade (padrão global + custom por usuário).

alter table public.crm_etapas add column if not exists usuario_id uuid;
create index if not exists crm_etapas_usuario_idx on public.crm_etapas (usuario_id);

-- perfil_sync_tentado_em: carimbo da última tentativa de buscar nome/foto/
-- recado no WhatsApp (manual ou automática) — evita bater no Evolution a
-- cada abertura de conversa/rodada de cron pra contato sem informação
-- disponível (throttle, não trava o dado já sincronizado).
alter table public.crm_leads add column if not exists perfil_sync_tentado_em timestamptz;
create index if not exists crm_leads_perfil_sync_pendente_idx
  on public.crm_leads (perfil_sync_tentado_em)
  where nome_manual = false;

-- ===== Reparo: mensagens de áudio com midia_url = data URL gigante =====
-- Bug da Fase 3/4: quando o upload pro Storage falhava, o fallback gravava o
-- PRÓPRIO base64 (até ~8MB) direto na coluna midia_url. Isso fazia a conversa
-- inteira travar ao abrir (a página carrega todas as mensagens de uma vez, e
-- alguns MB de string por mensagem trava o navegador). Zera esse fallback:
-- a mensagem continua existindo, só sem o player inline (mostra "🎤 Áudio").
update public.crm_mensagens
   set midia_url = null
 where midia_url like 'data:%'
   and length(midia_url) > 200000;
