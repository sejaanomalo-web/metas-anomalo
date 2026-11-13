-- Reuniões: VÁRIAS CONTAS do Cal.com. 2026-11-13.
--
-- Antes: uma conta (Anômalo Hub, @anomalohub) com os dois eventos — Marketing
-- e Sistema. Agora o sistema tem marca própria (Ativo) e conta própria no
-- Cal.com. As duas contas alimentam o MESMO fluxo: cada reserva vira tarefa
-- no Calendário do Workspace, com cancelamento nos dois sentidos,
-- reconciliação e feed de bloqueios.
--
-- O que muda:
--   • reunioes_integracoes: 1 linha POR CONTA (chave 'principal', 'ativo').
--     A API key de cada conta continua em variável de ambiente, nunca no
--     banco: CALCOM_API_KEY (principal) e CALCOM_API_KEY_ATIVO.
--   • reunioes_tipos, reunioes_disponibilidades e reunioes_agendamentos
--     ganham integracao_id: de qual conta é o evento, o schedule e a reserva.
--     É essa coluna que diz com qual API key cancelar, publicar e conferir.
--   • bloquear_outras_contas: com contas separadas, o Cal.com deixa de ver o
--     conflito entre elas (antes era o mesmo usuário). Ligado, o feed de
--     bloqueios de cada conta passa a incluir as reuniões ativas das OUTRAS
--     contas como "Ocupado".
--
-- 100% aditiva e idempotente: tudo o que já existe fica na conta 'principal'.
-- Pode rodar de novo sem efeito.
--
-- ORDEM: aplicar DEPOIS do deploy do código novo. O código novo funciona sem
-- ela (modo de conta única, igual a antes). O código ANTIGO não funciona com
-- ela aplicada: ele lê "a" linha de reunioes_integracoes e, com duas, não
-- acha nenhuma.

-- ============================================================
-- 1) Contas
-- ============================================================
alter table public.reunioes_integracoes
  add column if not exists chave                  text,
  add column if not exists rotulo                 text,
  add column if not exists ordem                  int     not null default 0,
  add column if not exists bloquear_outras_contas boolean not null default true;

update public.reunioes_integracoes
   set chave = 'principal'
 where chave is null and provedor = 'calcom';

update public.reunioes_integracoes
   set rotulo = 'Anômalo Hub'
 where chave = 'principal' and rotulo is null;

alter table public.reunioes_integracoes alter column chave set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reunioes_integracoes_chave_formato'
  ) then
    alter table public.reunioes_integracoes
      add constraint reunioes_integracoes_chave_formato check (chave ~ '^[a-z0-9_]{2,30}$');
  end if;
end $$;

-- Era "uma conta por provedor". Agora: uma linha por (provedor, chave).
drop index if exists public.reunioes_integracoes_provedor_unico;
create unique index if not exists reunioes_integracoes_chave_unica
  on public.reunioes_integracoes (provedor, chave);

insert into public.reunioes_integracoes (provedor, chave, rotulo, ordem, status)
select 'calcom', 'ativo', 'Ativo', 1, 'pendente'
where not exists (
  select 1 from public.reunioes_integracoes where provedor = 'calcom' and chave = 'ativo'
);

-- ============================================================
-- 2) De qual conta é cada coisa
-- ============================================================
alter table public.reunioes_tipos
  add column if not exists integracao_id uuid references public.reunioes_integracoes(id) on delete set null;
alter table public.reunioes_disponibilidades
  add column if not exists integracao_id uuid references public.reunioes_integracoes(id) on delete set null;
alter table public.reunioes_agendamentos
  add column if not exists integracao_id uuid references public.reunioes_integracoes(id) on delete set null;

-- Tudo que existia nasceu na conta principal.
update public.reunioes_tipos t
   set integracao_id = i.id
  from public.reunioes_integracoes i
 where t.integracao_id is null and i.provedor = 'calcom' and i.chave = 'principal';

update public.reunioes_disponibilidades d
   set integracao_id = i.id
  from public.reunioes_integracoes i
 where d.integracao_id is null and i.provedor = 'calcom' and i.chave = 'principal';

update public.reunioes_agendamentos a
   set integracao_id = i.id
  from public.reunioes_integracoes i
 where a.integracao_id is null and i.provedor = 'calcom' and i.chave = 'principal';

-- Evento de webhook guarda por qual conta chegou: o "Tentar de novo" precisa
-- reprocessar com a conta certa.
alter table public.reunioes_webhook_eventos
  add column if not exists integracao_id uuid references public.reunioes_integracoes(id) on delete set null;

create index if not exists reunioes_agend_integracao_idx
  on public.reunioes_agendamentos (integracao_id, status);

-- ============================================================
-- 3) Disponibilidade inicial da conta Ativo
-- ============================================================
-- Schedule é por usuário do Cal.com: a conta Ativo precisa do seu. Nasce com
-- as mesmas janelas da agenda principal (ajuste na aba Disponibilidade e
-- "Salvar e publicar" — a publicação cria o schedule na conta Ativo).
insert into public.reunioes_disponibilidades (nome, fuso, responsavel_id, janelas, integracao_id)
select 'Agenda Ativo', d.fuso, d.responsavel_id, d.janelas, ia.id
  from public.reunioes_integracoes ia
  cross join lateral (
    select fuso, responsavel_id, janelas
      from public.reunioes_disponibilidades x
      join public.reunioes_integracoes ip on ip.id = x.integracao_id and ip.chave = 'principal'
     order by x.created_at
     limit 1
  ) d
 where ia.provedor = 'calcom' and ia.chave = 'ativo'
   and not exists (select 1 from public.reunioes_disponibilidades where integracao_id = ia.id);

-- O tipo "Sistema" NÃO muda de conta aqui de propósito: o evento dele ainda
-- é o da conta principal até alguém associar o evento da conta Ativo (aba
-- Tipos → Conta do Cal.com → Ativo → Associar). Mudar agora deixaria o
-- link público em branco antes de existir o novo.
