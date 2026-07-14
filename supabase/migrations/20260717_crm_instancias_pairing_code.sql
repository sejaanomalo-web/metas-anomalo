-- CRM — login por código de pareamento como alternativa ao QR (Evolution
-- API já suporta isso via /instance/connect/{instance}?number=...). 2026-07-17.
--
-- Guarda o código junto do QR (ultimo_qr) na mesma linha — os dois nunca
-- coexistem (gerar um limpa o outro), então não precisa de tabela separada.

alter table public.crm_instancias
  add column if not exists ultimo_pairing_code text;
