-- CRM ↔ Comercial: sincronização automática do funil. 2026-07-15. Idempotente.
--
-- Cada transição de etapa de um lead do CRM (e o retorno do cliente) passa a
-- gravar UMA linha em relatorios_comerciais, marcada com origem_registro='crm'.
-- As agregações existentes (funil, resumos, realizado orgânico do Metas) somam
-- TODAS as linhas do período, então essas linhas do CRM entram no cálculo sem
-- nenhuma mudança nas queries — os relatórios manuais continuam funcionando em
-- paralelo, cada um é um registro append-only.
--
-- Idempotência: cada evento conta 1 ponto por lead. Um índice ÚNICO por
-- (lead_id, evento) garante isso. NULLs são distintos no Postgres, então as
-- linhas manuais (lead_id/evento nulos) NUNCA colidem entre si nem com as do
-- CRM — só as linhas do CRM (ambos preenchidos) ficam sujeitas à unicidade.

alter table public.relatorios_comerciais
  add column if not exists lead_id uuid,
  add column if not exists evento text,
  add column if not exists origem_registro text not null default 'manual';

create unique index if not exists relatorios_comerciais_lead_evento_uidx
  on public.relatorios_comerciais (lead_id, evento);

create index if not exists relatorios_comerciais_origem_registro_idx
  on public.relatorios_comerciais (origem_registro);
