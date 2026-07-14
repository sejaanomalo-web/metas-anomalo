-- CRM — índice pra checagem anti-bloqueio do WhatsApp ser rápida. 2026-07-19.
--
-- A trava anti-ban (lib/crm-anti-ban.ts) roda a CADA envio e consulta os
-- envios recentes DAQUELE número (instancia_id) na última 1h, ordenados por
-- wa_timestamp desc. Sem índice, isso vira um scan da tabela inteira a cada
-- mensagem. Índice parcial (só direcao='out') cobre exatamente essa query e
-- fica enxuto (não indexa as mensagens recebidas, que a checagem ignora).

create index if not exists crm_mensagens_instancia_saida_idx
  on public.crm_mensagens (instancia_id, wa_timestamp desc)
  where direcao = 'out';
