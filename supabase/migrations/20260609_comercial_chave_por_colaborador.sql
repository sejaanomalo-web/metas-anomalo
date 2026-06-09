-- Comercial: permite VÁRIOS SDRs no mesmo cliente no mesmo dia.
-- Transição em 2 passos pra não quebrar a app deployada (zero-downtime).
--
-- PASSO A (este arquivo — JÁ aplicado via MCP em 2026-06-09): adiciona a chave
-- nova (empresa, colaborador_id, data) SEM remover a antiga (empresa, data).
-- As duas coexistem; o código novo passa a usar onConflict pela chave nova.
alter table public.relatorios_comerciais
  add constraint relatorios_comerciais_empresa_colab_data_key
  unique (empresa, colaborador_id, data);

-- PASSO B (rodar SÓ DEPOIS do deploy do código novo — senão o código antigo,
-- que faz onConflict por (empresa, data), quebra). Enquanto a antiga existir,
-- 2 SDRs no mesmo cliente+dia ainda batem na (empresa, data); ao remover, libera:
--
--   alter table public.relatorios_comerciais
--     drop constraint relatorios_comerciais_empresa_data_key;
