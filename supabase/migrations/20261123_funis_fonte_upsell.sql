-- ============================================================================
-- COMERCIAL · FONTE DE DEMANDA "UPSELL" NOS FUNIS
-- ============================================================================
--
-- Upsell = venda nova para quem já é cliente. Entra como 4ª fonte padrão.
--
--   • Só SOMA: acrescenta {"id":"upsell","nome":"Upsell"} no fim das fontes dos
--     funis que ainda não têm esse id e que cabem no limite de 8.
--   • Idempotente: rodar de novo não duplica.
--   • Pode rodar antes ou depois do deploy: o código antigo só vê uma fonte a mais.
--   • Quem não quiser a fonte pode removê-la editando o funil (é opcional).
-- ============================================================================

update public.funis_comerciais
set fontes = fontes || '[{"id":"upsell","nome":"Upsell"}]'::jsonb
where jsonb_typeof(fontes) = 'array'
  and jsonb_array_length(fontes) < 8
  and not exists (
    select 1 from jsonb_array_elements(fontes) f where f->>'id' = 'upsell'
  );

alter table public.funis_comerciais
  alter column fontes set default
    '[{"id":"trafego","nome":"Tráfego"},{"id":"indicacao","nome":"Indicação"},{"id":"prospeccao","nome":"Prospecção fria"},{"id":"upsell","nome":"Upsell"}]'::jsonb;
