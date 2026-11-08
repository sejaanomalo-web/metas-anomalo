-- ============================================================================
-- COMERCIAL · CONTRATOS FECHADOS COM PARCELAS
-- ============================================================================
--
-- Só SOMA: uma coluna. Nada existente é apagado.
--
-- Os contratos são recebidos mês a mês, e a 1ª parcela pode ser diferente das
-- outras (outro produto vendido junto). Cada lançamento passa a guardar a lista
-- dos contratos fechados:
--
--   [{"cliente": "Fulano", "primeira": 3847, "mensal": 1147, "meses": 3}, ...]
--
--   total do contrato = primeira + mensal × (meses − 1)
--
--   • funil_lancamentos.faturamento continua existindo e passa a ser a soma das
--     1ªs parcelas (o que entra no 1º mês). O app grava os dois juntos.
--   • Lançamento antigo, sem lista, vale como um contrato de 1 mês com o valor
--     do faturamento. Nada precisa ser convertido.
--   • Só com default constante: o ALTER não reescreve a tabela.
-- ============================================================================

alter table public.funil_lancamentos
  add column if not exists contratos jsonb not null default '[]'::jsonb;

alter table public.funil_lancamentos
  drop constraint if exists funil_lancamentos_contratos_check;
alter table public.funil_lancamentos
  add constraint funil_lancamentos_contratos_check
  check (
    jsonb_typeof(contratos) = 'array'
    and jsonb_array_length(contratos) <= 50
  );

comment on column public.funil_lancamentos.contratos is
  'Contratos fechados: array de {cliente?, primeira, mensal, meses}. Total = primeira + mensal × (meses − 1).';
