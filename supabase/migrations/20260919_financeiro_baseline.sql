-- ============================================================================
-- FINANCEIRO · BASELINE DO SCHEMA JÁ EXISTENTE
-- ============================================================================
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- As tabelas do financeiro (categoria_financeira, conta_financeira,
-- lancamento_financeiro, pagamento_recorrente, meta_financeira) foram criadas
-- direto no SQL Editor do Supabase e NUNCA tiveram migração commitada. Quem
-- clonasse o repositório não conseguiria subir o módulo, e qualquer migração
-- futura era escrita no escuro.
--
-- Este arquivo documenta o estado VIVO. Ele é integralmente `if not exists`:
-- rodar no banco de produção é NO-OP garantido (as tabelas já existem, então
-- nenhum CREATE executa). O valor está em (a) deixar o schema versionado e
-- (b) permitir montar um ambiente novo do zero.
--
-- COMO FOI LEVANTADO
--
-- Por introspecção read-only do PostgREST (`GET /rest/v1/` devolve o OpenAPI
-- com colunas, tipos, nullability, defaults e FKs). O `supabase db dump` exige
-- Docker, que não estava disponível na máquina.
--
-- O QUE **NÃO** ESTÁ CONFIRMADO AQUI
--
-- O PostgREST não expõe CHECK constraints, UNIQUE, índices, triggers nem
-- policies de RLS. Os CHECKs e índices abaixo são a RECONSTITUIÇÃO provável a
-- partir do que o código da aplicação assume (lib/financeiro.ts,
-- lib/financeiro-actions.ts) — não a cópia do que está no banco. Como tudo é
-- `if not exists`, uma divergência não quebra produção: o objeto existente
-- vence e o comando é ignorado.
--
-- Para fechar essa lacuna, rode as consultas de leitura de
-- docs/FINANCEIRO-SCHEMA-CONFERIR.sql e ajuste este arquivo se algo divergir.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── categoria_financeira ────────────────────────────────────────────────────
-- `parent_id` permite hierarquia de categorias. A coluna existe no banco mas
-- nenhuma tela usa hoje — mantida por fidelidade ao schema vivo.
create table if not exists public.categoria_financeira (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  tipo        text not null check (tipo in ('receita','despesa')),
  parent_id   uuid references public.categoria_financeira(id) on delete set null,
  cor         text default '#4c4e54',
  ativa       boolean not null default true,
  ordem       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Uma categoria é única pelo par (nome, tipo): "Aluguel" pode existir como
-- despesa e como receita, mas não duas vezes como despesa.
create unique index if not exists categoria_financeira_nome_tipo_key
  on public.categoria_financeira (lower(nome), tipo);

-- ── conta_financeira ────────────────────────────────────────────────────────
create table if not exists public.conta_financeira (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  tipo               text not null default 'banco'
                       check (tipo in ('banco','caixa','cartao_credito','investimento')),
  saldo_inicial      numeric(12,2) not null default 0,
  data_saldo_inicial date not null default current_date,
  ativa              boolean not null default true,
  ordem              integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── pagamento_recorrente ────────────────────────────────────────────────────
-- Template que gera lançamentos. `status_padrao` é legado: a UI foi
-- simplificada e todo recorrente materializa como 'previsto'. A coluna
-- continua por compatibilidade com linhas antigas.
create table if not exists public.pagamento_recorrente (
  id                       uuid primary key default gen_random_uuid(),
  nome                     text not null,
  tipo                     text not null check (tipo in ('receita','despesa')),
  valor                    numeric(12,2) not null,
  categoria_id             uuid references public.categoria_financeira(id) on delete set null,
  conta_id                 uuid references public.conta_financeira(id) on delete set null,
  periodicidade            text not null default 'mensal'
                             check (periodicidade in ('mensal','anual','semanal')),
  dia_vencimento           integer check (dia_vencimento between 1 and 31),
  inicio                   date not null,
  fim                      date,
  ativo                    boolean not null default true,
  ultimo_lancamento_gerado date,
  observacoes              text,
  status_padrao            text not null default 'previsto'
                             check (status_padrao in ('previsto','realizado')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ── lancamento_financeiro ───────────────────────────────────────────────────
--
-- Duas particularidades deste sistema em relação a um financeiro genérico:
--
-- 1. `deletado_em` (soft delete). Dinheiro NUNCA é apagado — excluir um
--    lançamento carimba a data e todas as leituras filtram `is null`. Isso é
--    deliberado e é o que permite auditar o que sumiu do caixa.
--
-- 2. `empresa_cliente` (texto livre, nome da empresa cliente). É a chave da
--    Conferência com o Sentinela: cruza o faturamento operacional reportado
--    pelo gestor de tráfego com a receita efetivamente lançada aqui.
--
-- ATENÇÃO ao default de `status`: é 'realizado'. Toda função/trigger nova que
-- inserir aqui PRECISA passar `status` explicitamente, senão o lançamento
-- nasce dentro do caixa sem ninguém ter confirmado o pagamento.
create table if not exists public.lancamento_financeiro (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  data_pagamento  date,
  tipo            text not null check (tipo in ('receita','despesa')),
  valor           numeric(12,2) not null,
  categoria_id    uuid references public.categoria_financeira(id) on delete set null,
  conta_id        uuid references public.conta_financeira(id) on delete set null,
  descricao       text not null,
  observacoes     text,
  recorrente_id   uuid references public.pagamento_recorrente(id) on delete set null,
  empresa_cliente text,
  status          text not null default 'realizado'
                    check (status in ('previsto','realizado','cancelado')),
  anexo_url       text,
  criado_por      uuid references public.usuarios(id) on delete set null,
  deletado_em     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists lancamento_financeiro_data_idx
  on public.lancamento_financeiro (data desc);
create index if not exists lancamento_financeiro_conta_idx
  on public.lancamento_financeiro (conta_id);
create index if not exists lancamento_financeiro_categoria_idx
  on public.lancamento_financeiro (categoria_id);
create index if not exists lancamento_financeiro_recorrente_idx
  on public.lancamento_financeiro (recorrente_id);

-- ── meta_financeira ─────────────────────────────────────────────────────────
-- Existe no banco, está VAZIA e nenhuma tela lê. Documentada para o schema
-- ficar fiel; não remover (regra: nada de drop no financeiro).
create table if not exists public.meta_financeira (
  id           uuid primary key default gen_random_uuid(),
  mes          text not null,
  ano          integer not null,
  tipo         text not null check (tipo in ('receita','despesa')),
  categoria_id uuid references public.categoria_financeira(id) on delete set null,
  valor_meta   numeric(12,2) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- O financeiro é lido e escrito EXCLUSIVAMENTE pelo service_role (o app usa
-- getSupabaseAdmin() em todas as chamadas; a autorização real é feita no
-- servidor por requererPermissao('dashboard_financeiro')). Ligar RLS sem
-- policy alguma é exatamente o que se quer: o anon não enxerga nada e o
-- service_role bypassa. Confirmado em produção: GET com a anon key devolve [].
alter table public.categoria_financeira    enable row level security;
alter table public.conta_financeira        enable row level security;
alter table public.lancamento_financeiro   enable row level security;
alter table public.pagamento_recorrente    enable row level security;
alter table public.meta_financeira         enable row level security;
