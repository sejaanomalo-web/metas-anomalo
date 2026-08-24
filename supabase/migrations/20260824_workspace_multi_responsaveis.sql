-- =============================================================================
-- Workspace — VÁRIOS RESPONSÁVEIS por tarefa
-- =============================================================================
--
-- Uma tarefa quase nunca é de uma pessoa só: a gravação é do editor E do
-- social, o relatório é do tráfego E do comercial. Até agora o modelo forçava
-- escolher um e o resto do time ficava invisível — quem não era "o
-- responsável" não via a tarefa em "Minhas tarefas" e nem podia editá-la.
--
-- Mesma solução estrutural que já resolve "uma tarefa, vários projetos"
-- (ws_tarefa_contextos): uma tabela de VÍNCULO. A tarefa continua existindo
-- UMA vez em ws_tarefas.
--
-- ws_tarefas.responsavel_id NÃO é apagada. Ela vira um ESPELHO do primeiro
-- responsável, mantido por trigger, por três motivos concretos:
--   1. o índice ws_tarefas_responsavel_idx e consultas antigas continuam de pé;
--   2. o importador do Asana (lib/workspace-import-*) escreve na coluna;
--   3. um `select` de uma tarefa continua respondendo "de quem é isto?" sem
--      join — útil em log, cron e qualquer script de suporte.
-- A FONTE DA VERDADE é a tabela de vínculo; a coluna nunca é escrita à mão
-- pelo app novo.

-- ============================================================
-- 1) VÍNCULO TAREFA ↔ RESPONSÁVEL
-- ============================================================
create table if not exists public.ws_tarefa_responsaveis (
  tarefa_id  uuid not null references public.ws_tarefas(id) on delete cascade,
  -- CASCADE (e não SET NULL como na coluna): "responsável nenhum" é a ausência
  -- da linha. Excluir um usuário tira as atribuições dele e pronto — é também
  -- o que evita o 23503 que a exclusão de usuário já encontrou noutras FKs.
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  -- Ordem de exibição. O de MENOR ordem é o "principal" (o que vai pro espelho
  -- e pro avatar único das listas compactas).
  ordem      numeric not null default 0,
  created_at timestamptz not null default now(),
  -- PK composta: atribuir duas vezes a mesma pessoa é no-op, não duplicata.
  primary key (tarefa_id, usuario_id)
);

-- "Minhas tarefas" e o filtro por pessoa passam por aqui.
create index if not exists ws_tarefa_responsaveis_usuario_idx
  on public.ws_tarefa_responsaveis (usuario_id, tarefa_id);

-- RLS ligada SEM policy = só service_role, como todas as tabelas do módulo.
alter table public.ws_tarefa_responsaveis enable row level security;

-- ============================================================
-- 2) BACKFILL — ninguém perde responsável
-- ============================================================
insert into public.ws_tarefa_responsaveis (tarefa_id, usuario_id, ordem)
select t.id, t.responsavel_id, 0
from public.ws_tarefas t
where t.responsavel_id is not null
on conflict (tarefa_id, usuario_id) do nothing;

-- ============================================================
-- 3) ESPELHO: lista → ws_tarefas.responsavel_id
-- ============================================================
-- Recalcula o principal a cada mudança da lista. O `is distinct from` no WHERE
-- não é otimização: é o que CORTA A RECURSÃO com o trigger da seção 4 (um
-- UPDATE que não muda nada afeta 0 linhas e não dispara nada).
create or replace function public.ws_sincroniza_responsavel_principal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tarefa   uuid;
  v_primeiro uuid;
begin
  if tg_op = 'DELETE' then
    v_tarefa := old.tarefa_id;
  else
    v_tarefa := new.tarefa_id;
  end if;

  select r.usuario_id
    into v_primeiro
    from public.ws_tarefa_responsaveis r
   where r.tarefa_id = v_tarefa
   order by r.ordem, r.created_at, r.usuario_id
   limit 1;

  update public.ws_tarefas
     set responsavel_id = v_primeiro
   where id = v_tarefa
     and responsavel_id is distinct from v_primeiro;

  return null;
end $$;

drop trigger if exists ws_tarefa_responsaveis_espelho on public.ws_tarefa_responsaveis;
create trigger ws_tarefa_responsaveis_espelho
  after insert or update or delete on public.ws_tarefa_responsaveis
  for each row execute function public.ws_sincroniza_responsavel_principal();

-- ============================================================
-- 4) ESPELHO INVERSO: ws_tarefas.responsavel_id → lista
-- ============================================================
-- Quem escreve DIRETO na coluna (importador do Asana, script de suporte,
-- correção manual no SQL Editor) não pode produzir uma tarefa com responsável
-- que não aparece na lista. Duas regras, e só duas:
--
--   • valor novo NÃO nulo  → ENTRA na lista como principal (ordem -1).
--     Não remove ninguém: escrever na coluna promove alguém a principal, não
--     é um comando de "desatribuir o resto". Remover aqui criava um pingue-
--     pongue com o trigger da seção 3 que apagava co-responsáveis.
--   • valor novo NULO      → sai da lista SÓ quem estava na coluna (old).
--     É exatamente a semântica do "desfazer mapeamento" do importador.
create or replace function public.ws_espelha_responsavel_na_lista()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.responsavel_id is null
     and old.responsavel_id is not null then
    delete from public.ws_tarefa_responsaveis
     where tarefa_id = new.id
       and usuario_id = old.responsavel_id;
    return null;
  end if;

  if new.responsavel_id is not null then
    insert into public.ws_tarefa_responsaveis (tarefa_id, usuario_id, ordem)
    values (new.id, new.responsavel_id, -1)
    on conflict (tarefa_id, usuario_id) do nothing;
  end if;

  return null;
end $$;

drop trigger if exists ws_tarefas_responsavel_espelho on public.ws_tarefas;
create trigger ws_tarefas_responsavel_espelho
  after insert or update of responsavel_id on public.ws_tarefas
  for each row execute function public.ws_espelha_responsavel_na_lista();

-- ============================================================
-- 5) PostgREST precisa enxergar a relação nova
-- ============================================================
-- Sem isto os embeds `ws_tarefa_responsaveis!inner(usuario_id)` respondem
-- PGRST200 até o próximo reload espontâneo do schema cache.
notify pgrst, 'reload schema';
