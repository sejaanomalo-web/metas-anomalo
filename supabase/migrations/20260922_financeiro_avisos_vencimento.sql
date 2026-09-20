-- ============================================================================
-- FINANCEIRO · PREFERÊNCIAS DOS AVISOS DE VENCIMENTO
-- ============================================================================
--
-- Só SOMA duas colunas. Ambas nascem `true`: quem tem acesso ao financeiro
-- quer, por padrão, saber que uma conta vence hoje. Desligar é escolha
-- explícita em Configurações.
--
-- Por que dois tipos e não um: "vence hoje" avisa UMA vez e é informação;
-- "está atrasada há N dias" repete todo dia e é cobrança. Juntar os dois num
-- checkbox só obrigaria a pessoa a desligar a cobrança para parar de receber
-- o lembrete — ou o contrário.
-- ============================================================================

alter table public.preferencias_notificacao
  add column if not exists conta_vence_hoje boolean not null default true;

alter table public.preferencias_notificacao
  add column if not exists conta_atrasada boolean not null default true;

comment on column public.preferencias_notificacao.conta_vence_hoje is
  'Aviso único, na manhã do vencimento.';
comment on column public.preferencias_notificacao.conta_atrasada is
  'Cobrança diária enquanto a conta continuar vencida e não paga.';
