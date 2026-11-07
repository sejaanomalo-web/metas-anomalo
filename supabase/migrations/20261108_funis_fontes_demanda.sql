-- ============================================================================
-- COMERCIAL · FONTES DE DEMANDA NOS FUNIS
-- ============================================================================
--
-- Só SOMA: uma coluna em cada tabela. Nada existente é apagado.
--
-- Um funil continua sendo uma só estrutura de etapas. O que muda é que cada
-- lançamento passa a dizer de onde veio a demanda (tráfego, indicação, prospecção
-- fria...). Assim as três fontes usam o mesmo funil e podem ser vistas juntas ou
-- separadas.
--
--   • fontes em jsonb no funil, pelo mesmo motivo das etapas: salvar é um único
--     UPDATE. A ordem é a do array, e o id liga a fonte aos lançamentos, então
--     renomear não perde nada.
--   • 'trafego' é id fixo: é onde entra a importação do Meta.
--   • O que já foi lançado passa a contar como tráfego, porque até aqui era o
--     único caso previsto na tela. Dá para corrigir editando o lançamento.
--   • Só com default constante: o ALTER não reescreve a tabela.
-- ============================================================================

alter table public.funis_comerciais
  add column if not exists fontes jsonb not null default
    '[{"id":"trafego","nome":"Tráfego"},{"id":"indicacao","nome":"Indicação"},{"id":"prospeccao","nome":"Prospecção fria"}]'::jsonb;

alter table public.funis_comerciais
  drop constraint if exists funis_comerciais_fontes_check;
alter table public.funis_comerciais
  add constraint funis_comerciais_fontes_check
  check (
    jsonb_typeof(fontes) = 'array'
    and jsonb_array_length(fontes) between 1 and 8
  );

alter table public.funil_lancamentos
  add column if not exists fonte text not null default 'trafego';

-- O que vem do arquivo do Meta é tráfego, sempre.
alter table public.funil_lancamentos
  drop constraint if exists funil_lancamentos_fonte_importacao_check;
alter table public.funil_lancamentos
  add constraint funil_lancamentos_fonte_importacao_check
  check (origem_importacao is null or fonte = 'trafego');

comment on column public.funis_comerciais.fontes is
  'Array ordenado de {id, nome}: de onde a demanda do funil pode vir.';
comment on column public.funil_lancamentos.fonte is
  'Id da fonte de demanda do funil. Padrão: trafego.';
