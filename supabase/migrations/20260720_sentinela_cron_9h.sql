-- Reativa a coleta automática da Sentinela (2026-07-20).
--
-- Contexto: recriamos o App do Meta for Developers + token de System User
-- (não-expirável) depois que o App antigo foi apagado (ver migração
-- 20260624_cleanup_pos_mcp.sql, que removeu os crons antigos e descreve o
-- incidente). tokens_meta já foi atualizado com o token novo e validado
-- (leitura real das ~18 contas de clientes). A ponte MCP (rotina claude.ai)
-- foi desligada — a coleta volta a ser 100% via este App.
--
-- Diferença do setup antigo: SÓ 1 horário automático (09:00 BRT), não mais
-- 3x/dia (9h/15h/20h) — pedido explícito do usuário. Reprocessamento sob
-- demanda continua disponível pelo botão "Atualizar dados" no dashboard
-- (chama a mesma edge function direto, ver lib/sentinela-trigger.ts).
--
-- IMPORTANTE: substitua <SENTINELA_SECRET>, <SENTINELA_NOTIFY_SECRET> e
-- <DOMINIO_DE_PRODUCAO> pelos valores reais (os mesmos configurados nas env
-- vars do Vercel) antes de rodar este arquivo no SQL Editor do Supabase.

-- 1) Coleta: roda 09:00 BRT (12:00 UTC), sem ?data= → processa "ontem" por
--    padrão (mesmo comportamento documentado no incidente anterior).
select cron.schedule(
  'sentinela_9h',
  '0 12 * * *',
  $cron$
    select net.http_post(
      url := 'https://cawwccbuejmvfemgdhvl.supabase.co/functions/v1/sentinela',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sentinela-secret', '<SENTINELA_SECRET>'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);

-- 2) Notificação in-app: dispara 5 min depois, dando tempo da coleta
--    terminar (processa ~18 contas). Chama o endpoint interno do app
--    (app/api/sentinela/notificar/route.ts), que lê logs_sentinela e cria
--    a notificação "Tráfego atualizado" (tipo dados_sentinela) no sino.
--    Substitua <DOMINIO_DE_PRODUCAO> pelo domínio real do deploy no Vercel
--    (ex.: o mesmo host que aparece em Vercel → Project → Domains).
select cron.schedule(
  'sentinela_9h_notificar',
  '5 12 * * *',
  $cron$
    select net.http_post(
      url := 'https://<DOMINIO_DE_PRODUCAO>/api/sentinela/notificar',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', '<SENTINELA_NOTIFY_SECRET>'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

-- Não recriamos os horários de 15h/20h nem o cron 'sentinela_21h' antigo —
-- só o único horário pedido. Se precisar reprocessar um dia específico fora
-- do 09:00, use o botão "Atualizar dados" (ontem+hoje) ou chame a edge
-- function manualmente com ?data=YYYY-MM-DD.
