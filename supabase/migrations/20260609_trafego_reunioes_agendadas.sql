-- Funil de conversão do tráfego: separa "Agendamentos" de "Realizados".
-- Hoje só existe reunioes_real (= realizadas, conforme o formulário). Esta
-- coluna nova guarda as reuniões AGENDADAS. Aditiva e nulável — não afeta
-- nada existente. (Aplicada no remoto via MCP em 2026-06-09.)
alter table public.dados_diarios_log
  add column if not exists reunioes_agendadas_real int;
alter table public.dados_reais
  add column if not exists reunioes_agendadas_real int;

comment on column public.dados_diarios_log.reunioes_agendadas_real is
  'Reuniões AGENDADAS no dia (manual). Par de reunioes_real (=realizadas). Etapa "Agendamentos" do funil de conversão do tráfego.';
comment on column public.dados_reais.reunioes_agendadas_real is
  'Reuniões AGENDADAS (manual). Espelha dados_diarios_log.reunioes_agendadas_real.';
