-- CRM — Fase 8: WhatsApp só como VIEWER + ficha do lead mais rica. 2026-07-20.
--
-- Mudança de estratégia anti-bloqueio: o CRM deixa de mandar/receber mensagem
-- pela Evolution (o principal vetor de banimento do número). A Evolution passa
-- a ser só um "viewer" — sincroniza nome/foto do contato e reflete contatos
-- adicionados no celular. No lugar da tela de conversa, a ficha do lead vira a
-- tela principal, agora com anotações de reunião (data + texto, repetível) e
-- links de redes sociais (Instagram/Facebook). Conversar de fato é 1 clique
-- pro WhatsApp (wa.me), fora do app.
--
-- reunioes: array JSON de { id, data (YYYY-MM-DD), anotacao } — histórico de
-- reuniões do lead, o registro de longo prazo que o cliente pediu. Guardado
-- direto em crm_leads (o "contato" já É o lead; ver lib/crm-leads.ts), igual
-- aos campos_personalizados da Fase 7.

alter table public.crm_leads
  add column if not exists instagram text;

alter table public.crm_leads
  add column if not exists facebook text;

alter table public.crm_leads
  add column if not exists reunioes jsonb not null default '[]'::jsonb;
