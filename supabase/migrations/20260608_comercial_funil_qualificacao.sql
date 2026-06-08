-- Novo topo do funil comercial: Mensagens enviadas -> Retorno de mensagens
-- -> Qualificados -> Reuniões agendadas.
--
-- Aditivo e seguro: novas colunas NOT NULL DEFAULT 0 (linhas existentes
-- recebem 0). "Mensagens enviadas" reaproveita a coluna existente
-- `mensagens` (só muda o rótulo na UI). `conexoes_novas` é MANTIDA no banco
-- (deixa de ser escrita/lida pelo app) — sem DROP, pra não acoplar deploy
-- de banco+código no mesmo instante.
ALTER TABLE public.relatorios_comerciais
  ADD COLUMN IF NOT EXISTS retorno_mensagens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qualificados integer NOT NULL DEFAULT 0;
