-- CRM — Fase 4: nome manual do lead + "sobre" (status do WhatsApp).
-- 2026-07-12. Idempotente.
--
-- nome_manual: quando o usuario edita o nome do lead à mão, o sync automatico
-- (CONTACTS_UPSERT / pushName) NAO sobrescreve mais — o nome digitado ganha.
-- sobre: recado/status do contato no WhatsApp (via /chat/fetchProfile), exibido
-- na ficha do contato.

alter table public.crm_leads add column if not exists nome_manual boolean not null default false;
alter table public.crm_leads add column if not exists sobre text;
