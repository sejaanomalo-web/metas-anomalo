-- CRM — Fase 7: ficha de informações do contato. 2026-07-16.
--
-- Notas com formatação básica (negrito/itálico/sublinhado/lista) e campos
-- personalizados livres (nome+valor definidos pelo usuário), acessíveis via
-- botão de informações no Kanban (popup) e em Conversas (painel na própria
-- thread). Guardado direto em crm_leads — o "contato" já É o lead, não existe
-- tabela separada de contato (ver lib/crm-leads.ts).

alter table public.crm_leads
  add column if not exists notas_html text;

alter table public.crm_leads
  add column if not exists campos_personalizados jsonb not null default '[]'::jsonb;
