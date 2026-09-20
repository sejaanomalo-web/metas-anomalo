-- ============================================================================
-- FINANCEIRO · VENCIMENTO, FORMA DE PAGAMENTO, ORIGEM E IDEMPOTÊNCIA
-- ============================================================================
--
-- Só SOMA. Nenhum DROP, nenhum UPDATE em dado financeiro. Rodar duas vezes é
-- inofensivo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE `data_vencimento`
--
-- Até aqui a tabela tinha uma data só (`data`, competência) e a data de
-- pagamento. Isso impede representar o caso mais comum do caixa: um serviço
-- entregue em setembro que só será recebido em 13 de outubro. Ele precisa
-- aparecer no caixa de OUTUBRO — é em outubro que o dinheiro se mexe — e não
-- em setembro, que é quando o fato aconteceu.
--
-- A coluna nasce NULA de propósito, e NÃO há backfill. Os previstos já
-- existentes foram materializados com `data` = dia do vencimento, e a regra
-- R3 trata "sem vencimento" usando a competência. Ou seja: com a coluna vazia,
-- o comportamento de hoje continua idêntico, linha por linha. Preencher seria
-- reescrever dado financeiro para obter o mesmo resultado — risco sem ganho.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE `origem` CONVIVE COM `empresa_cliente`
--
-- `empresa_cliente` é estruturado: casa com o nome da empresa e alimenta a
-- Conferência com o Sentinela. `origem` é texto livre ("Fornecedor X",
-- "Extrato", "Recorrente") e serve para contar de onde a linha veio. Um não
-- substitui o outro, e nada é migrado de um para o outro.
-- ============================================================================

alter table public.lancamento_financeiro
  add column if not exists data_vencimento date;

comment on column public.lancamento_financeiro.data_vencimento is
  'Quando o dinheiro DEVE andar. Nulo = usar a competência (data). '
  'Ver R3 em lib/financeiro-regras.ts: pago recorta por competência, '
  'em aberto recorta por vencimento.';

alter table public.lancamento_financeiro
  add column if not exists forma_pagamento text;

alter table public.lancamento_financeiro
  add column if not exists origem text;

comment on column public.lancamento_financeiro.origem is
  'De onde a linha veio, texto livre: Venda, Extrato, Recorrente, '
  'Fornecedor X. Não confundir com empresa_cliente, que é estruturado '
  'e alimenta a Conferência com o Sentinela.';

-- Controle de notificação: dia em que o aviso de vencimento já foi mandado.
-- Evita repetir o aviso de "vence hoje" a cada execução do cron; o aviso de
-- atraso repete todo dia justamente porque a data muda.
alter table public.lancamento_financeiro
  add column if not exists aviso_enviado_dia date;

-- ── Índices de leitura ──────────────────────────────────────────────────────
-- A lista e os KPIs recortam por R3, que toca as duas datas. A ordem
-- (status, data_vencimento) serve tanto o recorte de previstos quanto a
-- varredura diária do cron de avisos.
create index if not exists lancamento_financeiro_vencimento_idx
  on public.lancamento_financeiro (data_vencimento);

create index if not exists lancamento_financeiro_status_vencimento_idx
  on public.lancamento_financeiro (status, data_vencimento)
  where deletado_em is null;

-- ── Idempotência da materialização (R11) ────────────────────────────────────
--
-- Hoje a garantia de "um recorrente gera no máximo um lançamento por mês" é
-- só da aplicação: ela consulta, não acha, insere. Dois cliques simultâneos
-- em "Gerar lançamentos" passam os dois pela consulta e criam duas linhas —
-- despesa duplicada no caixa.
--
-- Duas sutilezas obrigatórias:
--
--   1. O cast `::timestamp`. `date_trunc('month', <date>)` não é IMMUTABLE
--      para o planejador e o Postgres recusa o índice com erro 42P17. Com o
--      cast explícito para timestamp, a função é imutável e o índice sobe.
--
--   2. O `deletado_em is null`. Este sistema usa soft delete: sem o filtro,
--      um lançamento excluído continuaria ocupando a vaga do mês e impediria
--      a regeneração legítima do recorrente.
--
-- Pré-requisito verificado em 19/09/2026: zero duplicatas (consulta A em
-- docs/FINANCEIRO-SCHEMA-CONFERIR.sql). Se esta migração falhar com 23505,
-- NÃO apague nada: rode a consulta A, decida linha a linha o que fazer e
-- marque a sobra como cancelada em vez de removê-la.
create unique index if not exists lancamento_financeiro_recorrente_mes_key
  on public.lancamento_financeiro (
    recorrente_id,
    date_trunc('month', data::timestamp)
  )
  where recorrente_id is not null and deletado_em is null;
