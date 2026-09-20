-- ============================================================================
-- FINANCEIRO · IMPORTAÇÃO DE EXTRATO OFX
-- ============================================================================
--
-- Só SOMA: três tabelas novas e duas funções. Nada existente é tocado.
--
-- A importação acontece em DOIS TEMPOS, e isso é a decisão central do
-- desenho: ler o arquivo NÃO cria lançamento nenhum. As linhas ficam
-- guardadas como `pendente` até alguém revisar, escolher a conta e confirmar.
-- Um extrato do mês inteiro entrando direto no caixa, com categorias
-- adivinhadas, seria impossível de desfazer.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Cabeçalho do arquivo ────────────────────────────────────────────────────
create table if not exists public.extratos_importados (
  id             uuid primary key default gen_random_uuid(),
  conta_id       uuid references public.conta_financeira(id) on delete set null,
  arquivo_nome   text not null,
  banco_id       text,
  conta_externa  text,
  periodo_de     date,
  periodo_ate    date,
  saldo_final    numeric(12,2),
  total_linhas   integer not null default 0,
  importado_por  uuid references public.usuarios(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ── Linhas do extrato ───────────────────────────────────────────────────────
--
-- `conta_id` aqui é a conta DE DESTINO decidida na revisão, não a conta de
-- origem do arquivo: a pessoa importa um extrato só e distribui as linhas
-- entre as contas que realmente pagaram cada coisa.
--
-- `descricao` guarda SEMPRE o texto original do banco. A descrição editada na
-- tela vai para o lançamento, mas a regra aprendida precisa do original —
-- senão ela aprenderia com o texto que a pessoa escreveu à mão e nunca mais
-- casaria com o próximo arquivo.
create table if not exists public.extrato_linhas (
  id                   uuid primary key default gen_random_uuid(),
  extrato_id           uuid not null references public.extratos_importados(id) on delete cascade,
  conta_id             uuid references public.conta_financeira(id) on delete set null,
  categoria_id         uuid references public.categoria_financeira(id) on delete set null,
  fitid                text not null,
  data                 date not null,
  hora                 text,
  valor                numeric(12,2) not null,
  tipo                 text not null check (tipo in ('receita','despesa')),
  descricao            text not null,
  trntype              text,
  status               text not null default 'pendente'
                         check (status in ('pendente','importada','ignorada','duplicada')),
  lancamento_id        uuid references public.lancamento_financeiro(id) on delete set null,
  classificacao_origem text check (classificacao_origem in ('regra','manual')),
  created_at           timestamptz not null default now()
);

-- Chave de deduplicação. O FITID é o identificador que o banco dá à
-- transação; importar o mesmo arquivo duas vezes não pode criar a despesa
-- duas vezes.
--
-- O `where status <> 'duplicada'` é o que permite REGISTRAR a repetição sem
-- violar o índice: a linha repetida entra marcada como 'duplicada' e fica de
-- fora da chave, então ela aparece no placar ("já lançadas") em vez de
-- sumir silenciosamente.
create unique index if not exists extrato_linhas_fitid_key
  on public.extrato_linhas (fitid)
  where status <> 'duplicada';

create index if not exists extrato_linhas_extrato_idx
  on public.extrato_linhas (extrato_id, status);

-- ── Regras de categorização aprendidas ──────────────────────────────────────
--
-- Ninguém cadastra estas regras à mão: elas nascem sozinhas toda vez que
-- alguém confirma uma linha. É por isso que o diálogo de exclusão de
-- categoria precisa avisar que "as regras de importação nascem sozinhas" —
-- apagar uma não é perder trabalho manual.
create table if not exists public.regras_categorizacao (
  id           uuid primary key default gen_random_uuid(),
  padrao       text not null,
  tipo         text check (tipo in ('receita','despesa')),
  conta_id     uuid references public.conta_financeira(id) on delete cascade,
  categoria_id uuid references public.categoria_financeira(id) on delete cascade,
  acertos      integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Regra que não diz nem conta nem categoria não classifica nada.
  constraint regras_categorizacao_util
    check (conta_id is not null or categoria_id is not null)
);

-- `coalesce(tipo,'')` porque NULL nunca é igual a NULL num índice único: sem
-- isso, dariam pra criar infinitas regras "sem tipo" com o mesmo padrão.
create unique index if not exists regras_categorizacao_padrao_key
  on public.regras_categorizacao (padrao, coalesce(tipo, ''));

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mesmo desenho do resto do financeiro: só service_role. A autorização real
-- é feita no servidor, em requererPermissao('dashboard_financeiro').
alter table public.extratos_importados   enable row level security;
alter table public.extrato_linhas        enable row level security;
alter table public.regras_categorizacao  enable row level security;

-- ============================================================================
-- fn_sugerir_classificacao_extrato
-- ============================================================================
--
-- Aplica as regras aprendidas a todas as linhas pendentes de um extrato, numa
-- chamada só (e não uma consulta por linha).
--
-- Critério de desempate, nesta ordem:
--   1. o padrão MAIS LONGO vence — "pix enviado mercado" é mais específico
--      que "pix enviado", e o específico tem que ganhar;
--   2. depois, o maior número de acertos.
--
-- Linhas classificadas à mão (`classificacao_origem = 'manual'`) NÃO são
-- tocadas: a escolha da pessoa vale mais que o palpite da regra.
create or replace function public.fn_sugerir_classificacao_extrato(
  p_extrato_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classificadas integer := 0;
begin
  with candidatas as (
    select
      l.id as linha_id,
      r.conta_id,
      r.categoria_id,
      row_number() over (
        partition by l.id
        order by length(r.padrao) desc, r.acertos desc, r.updated_at desc
      ) as posicao
    from public.extrato_linhas l
    join public.regras_categorizacao r
      on position(r.padrao in lower(l.descricao)) > 0
     and (r.tipo is null or r.tipo = l.tipo)
    where l.extrato_id = p_extrato_id
      and l.status = 'pendente'
      and coalesce(l.classificacao_origem, '') <> 'manual'
  ),
  vencedoras as (
    select * from candidatas where posicao = 1
  )
  update public.extrato_linhas l
     set conta_id             = coalesce(v.conta_id, l.conta_id),
         categoria_id         = coalesce(v.categoria_id, l.categoria_id),
         classificacao_origem = 'regra'
    from vencedoras v
   where l.id = v.linha_id;

  get diagnostics v_classificadas = row_count;
  return v_classificadas;
end;
$$;

-- ============================================================================
-- fn_confirmar_extrato
-- ============================================================================
--
-- Recebe [{id, conta_id, categoria_id, descricao}] e transforma cada linha
-- num lançamento. Uma função é uma transação: ou o lote inteiro vale, ou
-- nada vale.
--
-- Três decisões que valem explicação:
--
-- 1. `for update` e o filtro `status = 'pendente'`. Repetir a chamada (duplo
--    clique, retry de rede) não cria nada de novo: na segunda vez as linhas
--    já são 'importada' e simplesmente não entram na seleção.
--
-- 2. Linha sem conta é PULADA e contada, não derruba o lote. Quem revisou 60
--    linhas e esqueceu a conta de duas não pode perder as 58.
--
-- 3. O lançamento nasce REALIZADO, com competência, vencimento e pagamento
--    todos na data da linha. Extrato é dinheiro que JÁ andou — nasce previsto
--    seria descrever o passado como futuro.
create or replace function public.fn_confirmar_extrato(
  p_linhas jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item        jsonb;
  v_linha       public.extrato_linhas%rowtype;
  v_lancamento  uuid;
  v_descricao   text;
  v_padrao      text;
  v_criados     integer := 0;
  v_sem_conta   integer := 0;
  v_conta       uuid;
  v_categoria   uuid;
begin
  for v_item in select * from jsonb_array_elements(p_linhas)
  loop
    select * into v_linha
      from public.extrato_linhas
     where id = (v_item->>'id')::uuid
       and status = 'pendente'
       for update;

    -- Já importada, ignorada, ou id inexistente: nada a fazer.
    if not found then
      continue;
    end if;

    v_conta     := nullif(v_item->>'conta_id', '')::uuid;
    v_categoria := nullif(v_item->>'categoria_id', '')::uuid;

    if v_conta is null then
      v_sem_conta := v_sem_conta + 1;
      continue;
    end if;

    v_descricao := coalesce(nullif(trim(v_item->>'descricao'), ''), v_linha.descricao);

    insert into public.lancamento_financeiro (
      data, data_vencimento, data_pagamento,
      tipo, valor, categoria_id, conta_id,
      descricao, origem, status
    ) values (
      v_linha.data, v_linha.data, v_linha.data,
      v_linha.tipo,
      -- O sinal vive no `tipo`; gravar valor negativo somaria errado em todo
      -- relatório do módulo.
      abs(v_linha.valor),
      v_categoria, v_conta,
      v_descricao, 'Extrato', 'realizado'
    )
    returning id into v_lancamento;

    update public.extrato_linhas
       set status        = 'importada',
           lancamento_id = v_lancamento,
           conta_id      = v_conta,
           categoria_id  = v_categoria
     where id = v_linha.id;

    v_criados := v_criados + 1;

    -- ── Aprende ─────────────────────────────────────────────────────────
    -- O padrão sai da descrição ORIGINAL do banco (não da editada), porque é
    -- ela que vai se repetir no próximo arquivo. Só a parte antes de ' · ',
    -- que é a contraparte estável; o resto costuma trazer data e referência,
    -- que mudam sempre.
    v_padrao := lower(trim(split_part(v_linha.descricao, ' · ', 1)));

    -- Padrão curto demais casaria com quase tudo.
    if length(v_padrao) >= 4 then
      insert into public.regras_categorizacao (padrao, tipo, conta_id, categoria_id, acertos)
      values (v_padrao, v_linha.tipo, v_conta, v_categoria, 1)
      on conflict (padrao, coalesce(tipo, '')) do update
        -- A escolha MAIS RECENTE prevalece: se a pessoa reclassificou, é
        -- porque a regra antiga estava errada.
        set conta_id     = excluded.conta_id,
            categoria_id = excluded.categoria_id,
            acertos      = public.regras_categorizacao.acertos + 1,
            updated_at   = now();
    end if;
  end loop;

  return jsonb_build_object('criados', v_criados, 'sem_conta', v_sem_conta);
end;
$$;
