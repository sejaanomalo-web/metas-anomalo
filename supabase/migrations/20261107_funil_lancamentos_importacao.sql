-- ============================================================================
-- COMERCIAL · IMPORTAÇÃO DE ARQUIVOS DO META NOS FUNIS
-- ============================================================================
--
-- Só SOMA: duas colunas e um índice em `funil_lancamentos`. Lançamentos manuais
-- não mudam e continuam com origem_importacao NULL.
--
-- Reimportar não pode contar em dobro. Por isso cada funil tem no máximo UMA
-- linha importada por data e origem, garantida pelo índice único. Como NULLs são
-- distintos no Postgres, os lançamentos manuais nunca colidem: a mesma data pode
-- ter quantos forem preciso.
--
-- O arquivo em si não é guardado. Só os totais por data e a referência de qual
-- arquivo e quais campanhas geraram a linha.
-- ============================================================================

alter table public.funil_lancamentos
  add column if not exists origem_importacao text,
  add column if not exists detalhe_importacao jsonb;

alter table public.funil_lancamentos
  drop constraint if exists funil_lancamentos_origem_importacao_check;
alter table public.funil_lancamentos
  add constraint funil_lancamentos_origem_importacao_check
  check (origem_importacao is null or origem_importacao in ('meta'));

create unique index if not exists funil_lancamentos_importacao_uq
  on public.funil_lancamentos (funil_id, data, origem_importacao);

comment on column public.funil_lancamentos.origem_importacao is
  'NULL = lançado à mão. ''meta'' = veio de arquivo exportado do Gerenciador de Anúncios.';
comment on column public.funil_lancamentos.detalhe_importacao is
  'De onde veio a linha importada: {arquivo, campanhas}.';
