-- ============================================================================
-- Excluir usuário, parte 2: o CHECK de ws_comentarios recusava o SET NULL.
--
-- BUG (reproduzido em 2026-07-31, Configurações → Usuários do sistema):
--
--   new row for relation "ws_comentarios" violates check constraint
--   "ws_comentarios_tem_autor"
--
-- A migration 20260729 pôs ws_comentarios.autor_id em ON DELETE SET NULL, que
-- é o certo (o comentário fica, só o crédito de autoria some). Só que o CHECK
-- ws_comentarios_tem_autor, criado na 20260722 pra importação do Asana, exige
--
--   autor_id is not null OR autor_externo_id is not null
--
-- Quem escreveu comentário AQUI (e não veio importado do Asana) não tem
-- autor_externo_id. Aí o SET NULL deixa os dois nulos, o CHECK reprova e a
-- exclusão inteira volta atrás. Por isso o Emmanuel saiu sem reclamação — ele
-- não tinha comentário — e o próximo da fila travou.
--
-- POR QUE NÃO SÓ AFROUXAR O CHECK: aceitar os dois nulos resolveria o delete e
-- deixaria a thread com "—" no lugar do nome, pra sempre, em todo comentário
-- da pessoa. Comentário é conversa: sem saber quem falou, o histórico da
-- tarefa perde o sentido. Então antes de anular a gente GUARDA o nome.
--
--   autor_nome_hist  →  o nome de quem escreveu, copiado no instante da
--                       exclusão da conta. Só é preenchido nesse momento.
--
-- e o CHECK passa a aceitar as três formas de autoria (conta viva, identidade
-- externa importada, ou o nome preservado de uma conta excluída).
--
-- NADA É APAGADO POR ESTA MIGRATION: uma coluna nova, uma trigger e um CHECK
-- mais permissivo. Nenhum DELETE, nenhum DROP COLUMN, nenhum DROP TABLE.
--
-- DEPENDE DA 20260729 (as FKs → usuarios em SET NULL). As duas são
-- independentes na aplicação, mas EXCLUIR USUÁRIO só funciona com as duas. A
-- seção 5 confere isso e avisa.
--
-- APLICAR: Supabase → SQL Editor → colar este arquivo → Run. Idempotente:
-- rodar de novo não tem efeito colateral.
-- ============================================================================


-- ============================================================
-- 1) A COLUNA DE SNAPSHOT
-- ============================================================
alter table public.ws_comentarios
  add column if not exists autor_nome_hist text;

comment on column public.ws_comentarios.autor_nome_hist is
  'Nome de quem escreveu, preservado quando a CONTA é excluída (a trigger '
  'trg_usuario_preserva_autoria grava antes de o FK anular autor_id). NULL '
  'em comentário de conta viva — nesse caso o nome vem do join com usuarios.';


-- ============================================================
-- 2) A TRIGGER QUE PRESERVA O NOME
-- ============================================================
-- BEFORE DELETE em usuarios. A ordem importa e é garantida pelo Postgres: as
-- ações referenciais de FK (o ON DELETE SET NULL que anula autor_id) rodam
-- DEPOIS que a linha sai, como triggers internas AFTER. Uma trigger BEFORE
-- roda antes de tudo isso — então quando o autor_id for anulado, o nome já
-- está guardado e o CHECK da seção 3 encontra a linha em ordem.
--
-- Fazer isso na aplicação (um UPDATE antes do DELETE) seria mais visível, mas
-- não seria ATÔMICO: são duas requisições via PostgREST, e um delete que
-- falhasse no meio deixaria o snapshot escrito à toa. Na trigger, snapshot e
-- exclusão vivem ou morrem na mesma transação — e vale também pra quem
-- excluir direto pelo SQL Editor.
create or replace function public.fn_usuario_preserva_autoria()
returns trigger
language plpgsql
-- search_path fixo: função disparada por trigger não deve depender do
-- search_path de quem chamou.
set search_path = public, pg_temp
as $$
begin
  -- `autor_nome_hist is null` mantém idempotente e protege o registro
  -- original: se por algum caminho o nome já tiver sido preservado, ele não é
  -- sobrescrito.
  update public.ws_comentarios
     set autor_nome_hist = old.nome
   where autor_id = old.id
     and autor_nome_hist is null;

  return old;
end $$;

drop trigger if exists trg_usuario_preserva_autoria on public.usuarios;
create trigger trg_usuario_preserva_autoria
  before delete on public.usuarios
  for each row
  execute function public.fn_usuario_preserva_autoria();


-- ============================================================
-- 3) O CHECK PASSA A ACEITAR O NOME PRESERVADO
-- ============================================================
-- Continua garantindo o que sempre garantiu — que todo comentário diga de
-- quem é — só que agora reconhece a terceira forma de dizer isso. Um
-- comentário sem NENHUMA das três segue recusado.
alter table public.ws_comentarios drop constraint if exists ws_comentarios_tem_autor;
alter table public.ws_comentarios add constraint ws_comentarios_tem_autor
  check (
    autor_id is not null
    or autor_externo_id is not null
    or autor_nome_hist is not null
  );


-- ============================================================
-- 4) ÍNDICE PRA TRIGGER NÃO VARRER A TABELA
-- ============================================================
-- A 20260729 já cria ws_comentarios_autor_id_idx; repetido aqui com
-- `if not exists` pra esta migration funcionar sozinha se as duas forem
-- aplicadas fora de ordem.
create index if not exists ws_comentarios_autor_id_idx
  on public.ws_comentarios (autor_id) where autor_id is not null;


-- ============================================================
-- 5) VERIFICAÇÃO — rode e LEIA o resultado
-- ============================================================

-- 5a) FKs que ainda bloqueiam a exclusão. Esperado: NENHUMA linha.
--     Se aparecer alguma, falta aplicar a 20260729.
select c.conrelid::regclass as tabela,
       c.conname            as constraint_name,
       'FK ainda em NO ACTION/RESTRICT — aplique 20260729' as problema
  from pg_constraint c
 where c.contype = 'f'
   and c.confrelid = 'public.usuarios'::regclass
   and c.confdeltype in ('a', 'r');

-- 5b) CHECKs que MEXEM numa coluna que vira NULL quando uma conta é excluída.
--     Aqui NÃO se espera lista vazia: ws_comentarios_tem_autor aparece de
--     propósito, já corrigido acima. A lista existe pra ser LIDA, com uma
--     pergunta só, por linha:
--
--         se esta coluna virar NULL, a expressão continua verdadeira?
--
--     Se a resposta for não, aquele CHECK é o próximo "Emmanuel passou e o
--     seguinte travou". É o mesmo bug voltando por uma tabela nova, e essa
--     consulta é o que faz uma fase futura do Workspace descobrir isso antes
--     do usuário descobrir.
with colunas_que_viram_nulo as (
  select c.conrelid          as relid,
         unnest(c.conkey)    as attnum
    from pg_constraint c
   where c.contype = 'f'
     and c.confrelid = 'public.usuarios'::regclass
     and c.confdeltype = 'n'          -- n = SET NULL
)
select distinct
       chk.conrelid::regclass          as tabela,
       chk.conname                     as check_a_conferir,
       pg_get_constraintdef(chk.oid)   as definicao
  from pg_constraint chk
  join colunas_que_viram_nulo cvn
    on cvn.relid  = chk.conrelid
   and cvn.attnum = any(chk.conkey)
 where chk.contype = 'c'
 order by 1, 2;
