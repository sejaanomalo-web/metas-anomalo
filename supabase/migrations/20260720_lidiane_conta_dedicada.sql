-- Mapeia a conta de anúncio DEDICADA da Lidiane Rezende (2026-07-20).
--
-- Contexto: a auditoria da integração com o Meta encontrou R$80,55 gastos
-- entre 22/06 e 03/07 na conta `act_1516121229917730` ("Lidiane Rezende", BM
-- própria) que NUNCA chegaram ao sistema — tokens_meta só apontava a Lidiane
-- pra conta compartilhada do Hub (act_1977423896429819, filtro `\[LIDIANE\]`).
-- É o mesmo padrão do caso Mãe Divina: o cliente migra pra conta própria e o
-- tokens_meta continua apontando pra antiga.
--
-- Diferença aqui: a Lidiane roda nas DUAS contas ao mesmo tempo (campanha
-- [003] [IMPULSIONAR] [LIDIANE] 08/06-11/06 na compartilhada, e [003]/[004]/
-- [005] na dedicada). Por isso mantemos as duas linhas em tokens_meta — o
-- UNIQUE da tabela é (empresa, ad_account_id), então isso é permitido.
--
-- PRÉ-REQUISITO: a edge function `sentinela` precisa estar na versão que
-- CONSOLIDA várias contas por empresa antes de gravar (função
-- `consolidarResultados`). Na versão anterior, cada linha de tokens_meta
-- fazia um upsert próprio em dados_diarios_log — que tem UNIQUE
-- (empresa, data, origem) — e a segunda conta SOBRESCREVIA a primeira em vez
-- de somar, escondendo o gasto de uma delas.
--
-- O access_token é copiado da linha existente (mesmo token de System User
-- `anomalo-api`, que já enxerga as duas contas — validado lendo o gasto real).

insert into tokens_meta (
  empresa, ad_account_id, app_id, bm_id, tipo_conversao,
  access_token, permissions, ativo, campaign_filter, observacoes
)
select
  'Lidiane Rezende',
  'act_1516121229917730',
  app_id,
  null,
  tipo_conversao,
  access_token,
  permissions,
  true,
  -- Conta dedicada: capta todas as campanhas, sem filtro por nome.
  null,
  'Conta dedicada (BM propria da Lidiane). Ela tambem roda campanhas [LIDIANE] '
  'na conta compartilhada do Hub act_1977423896429819 - a Sentinela consolida '
  'as duas contas na mesma empresa antes de gravar.'
from tokens_meta
where empresa = 'Lidiane Rezende'
  and ad_account_id = 'act_1977423896429819'
on conflict (empresa, ad_account_id) do nothing;
