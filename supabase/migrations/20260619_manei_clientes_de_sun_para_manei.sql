-- ===========================================================================
-- Reatribui "Antônio Carlos Corretor" e "Ivone Corretora" da Assessoria Sun
-- para a Assessoria Manei (data move — DML, não DDL).
--
-- Contexto: os dois corretores existiam como clientes ATIVOS (modo origem) da
-- "Assessoria Sun", mas pertencem à "Assessoria Manei" (que já existe em
-- empresas_config, slug assessoria-manei, e tem token Meta act_1514791713446299
-- — ver memória manei-templo-token-meta). Mudar só o empresa_nome reagrupa os
-- clientes sob a Manei em TODAS as superfícies (dashboard de Tráfego, Metas por
-- cliente e o seletor de cliente do formulário comercial), preservando id,
-- histórico (dados_diarios_cliente/metas_cliente são keyed por cliente_id),
-- slug, ativo, display_name e o modo origem (empresa_origem_nome intacto).
--
-- Idempotente: após a reatribuição, o WHERE (empresa_nome='Assessoria Sun')
-- casa 0 linhas. Já aplicada no remoto via MCP — mantida no repo p/ auditoria.
-- ===========================================================================

update public.cliente_trafego
set empresa_nome = 'Assessoria Manei',
    updated_at = now()
where empresa_nome = 'Assessoria Sun'
  and nome in ('Antônio Carlos Corretor', 'Ivone Corretora');
