-- ============================================================================
-- Workspace Fase 5 — a aba ESTUDOS deixa de existir.
--
-- APLICAR: Supabase → SQL Editor → colar este arquivo → Run.
-- Idempotente: pode rodar duas vezes sem efeito colateral.
--
-- Aplicar DEPOIS de 20260726_workspace_fase4.sql.
-- ============================================================================

-- ============================================================
-- 1) NOTAS DE ESTUDOS VÃO PARA ARQUIVOS
-- ============================================================
-- Nada é apagado: o editor rico deixou a aba Arquivos capaz de guardar tudo
-- que vivia separado, então as notas de Estudos passam a morar lá. Sem este
-- passo elas continuariam no banco mas SEM TELA que as mostrasse — some da
-- vista sem ninguém ter pedido, que é o pior tipo de perda.
update public.ws_notas
   set fixa = 'arquivos',
       updated_at = now()
 where fixa = 'estudos';

-- ============================================================
-- 2) O CHECK PASSA A ACEITAR SÓ 'arquivos'
-- ============================================================
-- Fecha a porta: com a aba fora do código, uma linha nova com
-- fixa='estudos' só poderia vir de bug ou de script antigo, e ficaria
-- invisível na interface. Melhor o banco recusar na hora.
alter table public.ws_notas
  drop constraint if exists ws_notas_fixa_check;
alter table public.ws_notas
  add constraint ws_notas_fixa_check check (fixa is null or fixa = 'arquivos');

-- NOTA sobre ws_contextos.tipo = 'estudos': esse é OUTRO conceito — é a
-- classificação do projeto ESTUDOS importado do Asana, não a aba fixa. Ele
-- continua válido e intocado; só a ABA some.
