-- ============================================================================
-- CONFERÊNCIA DO SCHEMA VIVO DO FINANCEIRO — 100% LEITURA
-- ============================================================================
--
-- Rode no SQL Editor do Supabase e compare com
-- supabase/migrations/20260919_financeiro_baseline.sql.
--
-- Por que isso existe: o schema do financeiro foi criado à mão, sem migração.
-- O baseline foi reconstituído por introspecção do PostgREST, que expõe
-- colunas/tipos/defaults/FKs mas NÃO expõe CHECK, UNIQUE, índices, triggers
-- nem policies. As consultas abaixo fecham essa lacuna.
--
-- Nenhuma delas escreve nada.
-- ============================================================================

-- 1) Colunas, tipos, nullability e defaults
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('categoria_financeira','conta_financeira',
                      'lancamento_financeiro','pagamento_recorrente',
                      'meta_financeira')
 order by table_name, ordinal_position;

-- 2) Constraints: CHECK, UNIQUE, PK e FK (com as regras de ON DELETE)
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where connamespace = 'public'::regnamespace
   and conrelid::regclass::text like '%financeir%'
 order by 1, 2;

-- 3) Índices
select tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename like '%financeir%'
 order by 1, 2;

-- 4) Triggers (updated_at, etc.)
select event_object_table, trigger_name, action_timing,
       event_manipulation, action_statement
  from information_schema.triggers
 where trigger_schema = 'public' and event_object_table like '%financeir%'
 order by 1, 2;

-- 5) RLS: está ligada? há policies?
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public' and tablename like '%financeir%';

select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename like '%financeir%';

-- 6) A view fluxo_caixa_mensal existe e ninguém consulta. Definição, pra decidir
--    se vira feature ou fica como está.
select pg_get_viewdef('public.fluxo_caixa_mensal'::regclass, true);

-- ============================================================================
-- CHECAGENS DE RISCO ANTES DAS MIGRAÇÕES NOVAS
-- ============================================================================

-- A) O índice único parcial (recorrente_id, mês) pode ser criado?
--    Precisa devolver ZERO linhas. (Em 19/09/2026 devolvia zero.)
select recorrente_id,
       date_trunc('month', data::timestamp) as mes,
       count(*)
  from public.lancamento_financeiro
 where recorrente_id is not null
   and deletado_em is null
 group by 1, 2
having count(*) > 1;

-- B) Algum lançamento com valor negativo? (o sinal tem que vir do tipo)
select count(*) from public.lancamento_financeiro where valor < 0;

-- C) Algum realizado sem data de pagamento? (quebraria o saldo da conta)
select count(*) from public.lancamento_financeiro
 where status = 'realizado' and data_pagamento is null and deletado_em is null;

-- D) Categorias duplicadas por (nome, tipo)? Precisa devolver ZERO para o
--    índice único do baseline poder existir.
select lower(nome), tipo, count(*)
  from public.categoria_financeira
 group by 1, 2
having count(*) > 1;
