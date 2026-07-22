-- ============================================================================
-- Workspace Fase 3 — alerta de tarefa atrasada + fim do cron 09h da Sentinela.
--
-- APLICAR: Supabase → SQL Editor → colar este arquivo → Run.
-- Idempotente: pode rodar duas vezes sem efeito colateral.
--
-- Aplicar DEPOIS de 20260724_workspace_fase2.sql.
-- ============================================================================

-- ============================================================
-- 1) ALERTA DE TAREFA ATRASADA
-- ============================================================
-- Marca QUANDO o alerta de atraso foi enviado. Sem isso, o cron diário
-- notificaria a MESMA tarefa todo dia até alguém concluir — o caminho mais
-- rápido para o time desligar as notificações do Workspace inteiro.
-- Regra do alerta (app/api/workspace/atrasadas): prazo venceu há 2+ dias
-- (1 dia é normal: fica pro dia seguinte), tarefa aberta e com responsável.
alter table public.ws_tarefas
  add column if not exists alerta_atraso_em timestamptz;

-- Índice do próprio cron: pendentes, com prazo e ainda não alertadas.
create index if not exists ws_tarefas_atraso_pendente_idx
  on public.ws_tarefas (prazo_em)
  where concluida_em is null
    and excluida_em is null
    and arquivada_em is null
    and alerta_atraso_em is null;

-- ============================================================
-- 2) SENTINELA — desliga a coleta automática das 09:00
-- ============================================================
-- A coleta agora dispara SOZINHA quando alguém abre a aba de Tráfego pago
-- (components/SentinelaAutoRefresh.tsx). Como o time entra no painel todo
-- dia, o cron virou redundante: rodava mesmo sem ninguém olhando e disputava
-- rate limit da API do Meta com a atualização sob demanda.
--
-- O botão "Atualizar dados" continua existindo para reprocessar na hora.
-- Para voltar atrás, reaplique 20260720_sentinela_cron_9h.sql (lembrando de
-- substituir os placeholders <SENTINELA_CRON_SECRET> etc).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sentinela_9h') then
    perform cron.unschedule('sentinela_9h');
  end if;
  if exists (select 1 from cron.job where jobname = 'sentinela_9h_notificar') then
    perform cron.unschedule('sentinela_9h_notificar');
  end if;
exception
  -- Ambiente sem pg_cron (ex.: banco local): não é erro, só não há o que tirar.
  when undefined_table then null;
end $$;
