-- ===========================================================================
-- Time comercial DESACOPLADO do login (usuarios)
--
-- Problema: até aqui, o time comercial que aparece no seletor "Responsável"
-- do formulário e na aba Time vinha SÓ de public.usuarios (via
-- listarTimePorPapel("comercial")). Para entrar na lista, a pessoa precisava
-- ser um USUÁRIO de login (e-mail + senha) E bater uma regra sutil
-- (papel='comercial' OU custom com a permissão formulario_comercial), com
-- admins ficando de fora. Resultado: novos integrantes do comercial
-- "não apareciam" no formulário quando essas condições não eram satisfeitas,
-- e não havia como cadastrar um vendedor que NÃO precisa de acesso ao painel.
--
-- Solução: tabela de primeira classe para o roster comercial, independente de
-- login. listarTimePorPapel("comercial") passa a devolver a UNIÃO
-- (usuários de login que se qualificam + integrantes desta tabela), então o
-- formulário, a aba Time e as Configurações capturam todos automaticamente.
--
-- O vínculo com relatorios_comerciais já é por colaborador_id (uuid SOFT, sem
-- FK), então o id desta tabela serve direto como colaborador_id — as métricas
-- individuais da aba Time funcionam sem mudança no schema de relatórios.
--
-- RLS: dados comerciais são sensíveis (desempenho individual). RLS habilitada
-- SEM policy = só service_role acessa (getSupabaseAdmin). Mesmo padrão de
-- relatorios_comerciais, usuarios e tokens_meta.
--
-- NB: existe uma tabela LEGADA public.colaboradores (sistema antigo de
-- comissionamento, com shape diferente — funcao/tipo/configuracao_padrao).
-- Esta tabela é OUTRA coisa (roster do funil comercial atual); por isso o
-- nome colaboradores_comerciais.
-- ===========================================================================

create extension if not exists "pgcrypto";

create table if not exists public.colaboradores_comerciais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- E-mail é OPCIONAL: o integrante pode ser só um vendedor que preenche o
  -- formulário público, sem conta de login no painel.
  email text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists colaboradores_comerciais_ativo_idx
  on public.colaboradores_comerciais (ativo);

-- Evita cadastrar o mesmo e-mail duas vezes (quando informado). Vários nulos
-- são permitidos (vendedores sem e-mail), pois o índice ignora linhas sem
-- e-mail. A deduplicação por NOME (contra usuários de login) é feita na
-- aplicação (lib/time.ts), pois dois humanos reais podem ter o mesmo nome.
create unique index if not exists colaboradores_comerciais_email_key
  on public.colaboradores_comerciais (lower(email))
  where email is not null and email <> '';

alter table public.colaboradores_comerciais enable row level security;
-- RLS habilitada sem policy = só service_role acessa (server-only).
