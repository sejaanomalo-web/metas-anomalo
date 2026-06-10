-- Comercial: origem (Anuncios=pago / Organico=organico) em relatorios_comerciais.
-- Permite ao time comercial classificar cada relatorio diario por origem do lead.
-- No painel Metas: organico ja vem do comercial; com isso o realizado PAGO passa a
-- usar as conversoes (reunioes/contratos/faturamento) do comercial 'Anuncios'
-- ("comercial vira a conversao"), mantendo investimento/leads do trafego.
--
-- Transicao em 2 passos pra nao quebrar a app deployada (zero-downtime).
--
-- PASSO A (JA aplicado via MCP em 2026-06-10): adiciona a coluna origem
-- (default 'organico' — toda a base historica e prospeccao organica), o CHECK,
-- e a chave nova (empresa, colaborador_id, data, origem) SEM remover a antiga.
-- As duas coexistem; o codigo novo passa a usar onConflict pela chave nova.
alter table public.relatorios_comerciais
  add column if not exists origem text not null default 'organico';

alter table public.relatorios_comerciais
  add constraint relatorios_comerciais_origem_check
  check (origem in ('pago','organico'));

alter table public.relatorios_comerciais
  add constraint relatorios_comerciais_empresa_colab_data_origem_key
  unique (empresa, colaborador_id, data, origem);

-- PASSO B (rodar SO DEPOIS do deploy do codigo novo — senao o codigo antigo,
-- que faz onConflict por (empresa, colaborador_id, data), quebra). Enquanto a
-- antiga existir, pago e organico no mesmo colaborador/empresa/dia ainda batem
-- na chave de 3 colunas; ao remover, libera:
--
--   alter table public.relatorios_comerciais
--     drop constraint relatorios_comerciais_empresa_colab_data_key;
