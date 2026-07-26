-- ============================================================================
-- Excluir usuário volta a funcionar: FKs → public.usuarios passam a SET NULL.
--
-- BUG (reproduzido em 2026-07-25, tela Configurações → Usuários do sistema):
--
--   update or delete on table "usuarios" violates foreign key constraint
--   "ws_tarefas_concluida_por_fkey" on table "ws_tarefas"
--
-- O Workspace criou 11 chaves estrangeiras apontando pra public.usuarios SEM
-- cláusula `on delete` — e o padrão do Postgres é NO ACTION, que RECUSA o
-- delete. Cada tentativa de excluir batia numa FK diferente:
--
--   ws_contextos.criado_por            ws_tarefas.criado_por
--   ws_tarefas.concluida_por           ws_comentarios.autor_id
--   ws_atividade.ator_id               ws_import_execucoes.iniciada_por
--   ws_identidades_externas.mapeado_por  ws_anexos.enviado_por
--   ws_abas.criado_por                 ws_notas.criado_por
--   ws_notas.atualizado_por
--
-- POR QUE `SET NULL` E NÃO `CASCADE`: essas colunas são AUTORIA ("quem criou",
-- "quem concluiu", "quem comentou"). Com CASCADE, excluir uma pessoa apagaria
-- as tarefas, as notas e os comentários dela — perda de dado do time inteiro.
-- Com SET NULL a linha CONTINUA e só o crédito de autoria fica nulo, que é
-- exatamente o que a interface já sabe mostrar ("Sem responsável").
--
-- NADA É APAGADO POR ESTA MIGRATION. Ela só troca a REGRA das FKs e cria
-- índices. Nenhum DELETE, nenhum DROP COLUMN, nenhum DROP TABLE.
--
-- APLICAR: Supabase → SQL Editor → colar este arquivo → Run. Idempotente:
-- rodar duas vezes não tem efeito colateral (a segunda vez não encontra mais
-- nenhuma FK em NO ACTION e não faz nada).
-- ============================================================================


-- ============================================================
-- 1) TODA FK → usuarios EM NO ACTION/RESTRICT VIRA SET NULL
-- ============================================================
-- Genérico de propósito, varrendo o catálogo em vez de listar as 11 FKs na
-- mão. Dois motivos:
--   • pega FK criada fora deste repositório (direto no painel do Supabase);
--   • pega FK que uma fase futura do Workspace adicionar esquecendo o
--     `on delete` — o mesmo bug não volta pela porta de trás.
--
-- Trava de segurança: só converte quando TODAS as colunas da FK aceitam NULL.
-- Se alguma for NOT NULL, SET NULL violaria a coluna, e a alternativa
-- (CASCADE) apagaria linhas — decisão que NUNCA pode ser implícita. Nesse
-- caso a FK é deixada como está e um aviso é emitido no fim.
do $$
declare
  r          record;
  colunas    text;
  ref_cols   text;
  aceita_nulo boolean;
  convertidas int := 0;
begin
  for r in
    select c.conname,
           c.conrelid,
           c.conrelid::regclass::text as tabela,
           c.conkey,
           c.confkey,
           c.confupdtype
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid = 'public.usuarios'::regclass
       and c.confdeltype in ('a', 'r')   -- a = NO ACTION, r = RESTRICT
     order by c.conrelid::regclass::text, c.conname
  loop
    -- Recriar a FK só carrega o que este script escreve, então uma regra de
    -- ON UPDATE diferente do padrão seria PERDIDA em silêncio. Nenhuma FK do
    -- sistema tem hoje, e é melhor pular avisando do que degradar calado.
    if r.confupdtype <> 'a' then
      raise notice
        'PULADA: % tem ON UPDATE fora do padrão — converta na mão pra não perder a regra.',
        r.conname;
      continue;
    end if;

    -- Colunas da FK (na ordem certa) e nullability de todas elas.
    select string_agg(quote_ident(a.attname), ', ' order by k.ord),
           bool_and(not a.attnotnull)
      into colunas, aceita_nulo
      from unnest(r.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a
        on a.attrelid = r.conrelid
       and a.attnum = k.attnum;

    -- Colunas referenciadas em usuarios (na prática é sempre `id`).
    select string_agg(quote_ident(a.attname), ', ' order by k.ord)
      into ref_cols
      from unnest(r.confkey) with ordinality as k(attnum, ord)
      join pg_attribute a
        on a.attrelid = 'public.usuarios'::regclass
       and a.attnum = k.attnum;

    if not aceita_nulo then
      raise notice
        'PULADA: %.% (%) tem coluna NOT NULL — precisa de decisão manual (SET NULL violaria a coluna, CASCADE apagaria linhas).',
        r.tabela, colunas, r.conname;
      continue;
    end if;

    -- Recriar com o MESMO nome mantém migrations, dumps e mensagens de erro
    -- reconhecíveis. O bloco DO inteiro é UMA transação: o drop e o add são
    -- atômicos juntos, então nunca existe um instante — nem em caso de erro no
    -- meio — em que a tabela fique sem a proteção da chave estrangeira.
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%s) references public.usuarios(%s) on delete set null',
      r.tabela, r.conname, colunas, ref_cols
    );

    convertidas := convertidas + 1;
    raise notice 'OK: %.% (%) agora é ON DELETE SET NULL.', r.tabela, colunas, r.conname;
  end loop;

  raise notice '% chave(s) estrangeira(s) convertida(s).', convertidas;
end $$;


-- ============================================================
-- 2) ÍNDICE EM CADA COLUNA DE AUTORIA
-- ============================================================
-- Postgres NÃO indexa o lado que APONTA de uma FK. Sem índice, cada exclusão
-- de usuário faz um seq scan em ws_tarefas, ws_comentarios, ws_atividade e
-- ws_notas — e ainda segura lock enquanto varre. Com o time e o histórico
-- crescendo, "excluir usuário" ficaria lento exatamente quando mais dói.
-- Parcial (`where ... is not null`) porque a maioria das linhas antigas terá
-- nulo depois das conversões acima: índice menor, escrita mais barata.
--
-- Criados dentro de um DO com checagem de existência: se uma fase futura
-- renomear uma tabela, ou se este banco estiver numa fase anterior, um
-- `create index` solto abortaria a migration DEPOIS de converter as FKs —
-- deixando o trabalho pela metade e um erro vermelho na tela sem explicar que
-- a parte importante já tinha passado.
do $$
declare
  alvo record;
begin
  for alvo in
    select *
      from (values
        ('ws_tarefas',    'criado_por'),
        ('ws_tarefas',    'concluida_por'),
        ('ws_comentarios','autor_id'),
        ('ws_atividade',  'ator_id'),
        ('ws_contextos',  'criado_por'),
        ('ws_abas',       'criado_por'),
        ('ws_notas',      'criado_por'),
        ('ws_notas',      'atualizado_por')
      ) as t(tabela, coluna)
  loop
    if not exists (
      select 1
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = alvo.tabela
         and a.attname = alvo.coluna
         and a.attnum > 0
         and not a.attisdropped
    ) then
      raise notice 'PULADO: public.%.% não existe neste banco.', alvo.tabela, alvo.coluna;
      continue;
    end if;

    execute format(
      'create index if not exists %I on public.%I (%I) where %I is not null',
      alvo.tabela || '_' || alvo.coluna || '_idx',
      alvo.tabela,
      alvo.coluna,
      alvo.coluna
    );
  end loop;
end $$;


-- ============================================================
-- 3) VERIFICAÇÃO — rode e confira o resultado
-- ============================================================
-- Esperado: NENHUMA linha. Cada linha que aparecer aqui é uma FK que ainda
-- bloqueia a exclusão de usuário (provavelmente com coluna NOT NULL, avisada
-- no passo 1) e precisa de decisão manual.
select c.conrelid::regclass as tabela,
       c.conname            as constraint_name,
       case c.confdeltype
         when 'a' then 'NO ACTION (bloqueia)'
         when 'r' then 'RESTRICT (bloqueia)'
       end                  as regra
  from pg_constraint c
 where c.contype = 'f'
   and c.confrelid = 'public.usuarios'::regclass
   and c.confdeltype in ('a', 'r');
