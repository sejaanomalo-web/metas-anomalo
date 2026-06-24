-- Limpeza pós-migração total para coleta via MCP (2026-06-24).
--
-- Contexto: o App do Meta que emitia os tokens System User foi apagado,
-- deixando a Sentinela (edge function + crons) inoperante. A coleta de
-- tráfego passou a ser 100% via ponte MCP — rotina agendada no claude.ai
-- (trig_01M6HhPedJDKwr684uEwYBfz, 9h/15h/20h BRT) que grava em
-- dados_diarios_log com coleta_status='mcp'. Esta migração remove artefatos
-- mortos, verificados por busca exaustiva (0 referências vivas no código).

-- 1) Tabelas órfãs (0 linhas úteis, 0 referências de runtime).
drop table if exists public.mcp_headless_test;  -- teste de conectividade MCP
drop table if exists public.log_semanal;         -- feature nunca usada

-- 2) Crons da Sentinela legada: falhavam 3x/dia (App do Meta apagado) e
--    gravavam linhas 'falha' em logs_sentinela. Removidos (idempotente;
--    NÃO mexe no cron de lembretes 'lembrete-diario-6h-brt').
do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname like 'sentinela_%' loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

-- PRESERVADOS de propósito:
--   • edge function `sentinela` (continua deployada, dormente) — recuperação.
--   • tabela `logs_sentinela` (histórico + ainda lida pelo badge de status).
--
-- RECRIAR os crons se o App do Meta voltar e a Sentinela for reativada
-- (substitua <SECRET> pelo x-sentinela-secret):
--   select cron.schedule('sentinela_9h','0 12 * * *', $cron$
--     select net.http_post(
--       url:='https://cawwccbuejmvfemgdhvl.supabase.co/functions/v1/sentinela',
--       headers:=jsonb_build_object('Content-Type','application/json','x-sentinela-secret','<SECRET>'),
--       body:='{}'::jsonb, timeout_milliseconds:=60000);
--   $cron$);
--   -- idem '0 18 * * *' (15h) e '0 23 * * *' (21h), com ?data=<hoje> na URL.
