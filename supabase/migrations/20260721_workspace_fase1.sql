-- Workspace — Fase 1: fundação do módulo de tarefas. 2026-07-21.
--
-- Substitui o uso operacional do Asana. Plano completo em docs/WORKSPACE-PLANO.md.
--
-- REGRA ESTRUTURAL: a tarefa existe UMA vez em ws_tarefas e aparece em vários
-- lugares por VÍNCULO (ws_tarefa_contextos). Aparecer no calendário NÃO é
-- vínculo — é consequência de prazo_em não ser nulo. Nunca duplicar a linha da
-- tarefa pra mostrá-la em outra visão.
--
-- SEGURANÇA: este app NÃO usa Supabase Auth — a sessão é um cookie HMAC
-- (lib/auth.ts) e todo acesso ao banco passa por getSupabaseAdmin()
-- (service_role). auth.uid() é sempre nulo aqui, então policy por usuário não
-- protegeria nada — só daria aparência de proteção. O padrão correto (mesmo de
-- crm_leads / tokens_meta / relatorios_comerciais) é RLS ligada SEM policy:
-- anon e authenticated não leem nem escrevem; a autorização real acontece no
-- servidor, em requererPermissao('workspace') + checagens nas Server Actions.
-- Exceção cirúrgica: ws_realtime_ping (sem PII) é legível pelo anon.
--
-- PRAZO: date + time separados, nunca timestamptz. A operação é 100% BRT e
-- timestamptz é o que faz tarefa "pular de dia" quando o servidor está em UTC.

-- ============================================================
-- 1) CONTEXTOS — as "pastas"/projetos onde a tarefa aparece
-- ============================================================
create table if not exists public.ws_contextos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(btrim(nome)) > 0),
  tipo          text not null check (tipo in ('geral','cliente','empresa','interno')),
  -- vínculo lógico com empresas_config.nome (mesmo padrão texto usado em
  -- dados_diarios_log e cliente_trafego.empresa_nome)
  empresa_nome  text,
  cliente_id    uuid references public.cliente_trafego(id) on delete set null,
  cor           text,
  ordem         int  not null default 0,
  arquivado_em  timestamptz,
  criado_por    uuid references public.usuarios(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- contexto de cliente PRECISA apontar pra um cliente; os outros tipos não
  -- podem apontar (senão a aba Clientes mostraria a mesma pasta duas vezes)
  constraint ws_contextos_cliente_coerente check (
    (tipo = 'cliente' and cliente_id is not null) or
    (tipo <> 'cliente' and cliente_id is null)
  )
);

-- No máximo 1 contexto ATIVO por cliente. É isto que garante que criar o
-- contexto "on demand" (no primeiro uso do cliente) nunca duplique a pasta,
-- mesmo com dois cliques simultâneos.
create unique index if not exists ws_contextos_cliente_unico
  on public.ws_contextos (cliente_id)
  where cliente_id is not null and arquivado_em is null;

create index if not exists ws_contextos_ativos_idx
  on public.ws_contextos (ordem, nome)
  where arquivado_em is null;

-- ============================================================
-- 2) TAREFAS
-- ============================================================
create table if not exists public.ws_tarefas (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null check (length(btrim(titulo)) > 0),
  -- TEXTO PURO com markdown-lite (**negrito**, - lista, autolink https://).
  -- Nunca HTML: a renderização é um parser que devolve nós React
  -- (lib/workspace-markdown.ts), então não existe superfície de XSS.
  descricao        text,
  tarefa_pai_id    uuid references public.ws_tarefas(id) on delete cascade,
  responsavel_id   uuid references public.usuarios(id) on delete set null,
  criado_por       uuid references public.usuarios(id),
  prazo_em         date,
  prazo_hora       time,
  inicio_em        date,
  prioridade       text not null default 'normal'
                   check (prioridade in ('baixa','normal','alta')),
  concluida_em     timestamptz,
  concluida_por    uuid references public.usuarios(id),
  -- recorrência entra na Fase 5; as colunas já nascem aqui pra não precisar
  -- de ALTER TABLE em tabela grande depois
  recorrencia_id   uuid,
  ocorrencia_chave text,
  ordem            numeric not null default 0,
  -- concorrência otimista: UPDATE ... WHERE versao = $n. 0 linhas afetadas
  -- significa "outra pessoa salvou antes", e o app avisa em vez de sobrescrever
  versao           int not null default 1,
  arquivada_em     timestamptz,
  excluida_em      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint ws_tarefas_conclusao_coerente check (
    (concluida_em is null and concluida_por is null) or
    (concluida_em is not null and concluida_por is not null)
  ),
  constraint ws_tarefas_prazo_hora_exige_prazo check (
    prazo_hora is null or prazo_em is not null
  )
);

-- Idempotência da recorrência (Fase 5): 1 ocorrência por série+data. Deixa o
-- cron rodar duas vezes sem gerar tarefa duplicada.
create unique index if not exists ws_tarefas_ocorrencia_unica
  on public.ws_tarefas (ocorrencia_chave)
  where ocorrencia_chave is not null;

-- Hierarquia de 1 nível só (decisão de produto: no Asana real subtarefa de
-- subtarefa nunca apareceu, e 1 nível simplifica toda a UI de progresso).
create or replace function public.ws_valida_hierarquia() returns trigger as $$
begin
  if new.tarefa_pai_id is not null then
    if new.tarefa_pai_id = new.id then
      raise exception 'ws_tarefas: tarefa nao pode ser pai de si mesma';
    end if;
    if exists (
      select 1 from public.ws_tarefas
      where id = new.tarefa_pai_id and tarefa_pai_id is not null
    ) then
      raise exception 'ws_tarefas: subtarefa nao pode ter subtarefa (1 nivel)';
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists ws_tarefas_hierarquia on public.ws_tarefas;
create trigger ws_tarefas_hierarquia
  before insert or update of tarefa_pai_id on public.ws_tarefas
  for each row execute function public.ws_valida_hierarquia();

-- ============================================================
-- 3) VÍNCULO TAREFA ↔ CONTEXTO (a tal "uma tarefa, várias visões")
-- ============================================================
create table if not exists public.ws_tarefa_contextos (
  tarefa_id   uuid not null references public.ws_tarefas(id)   on delete cascade,
  contexto_id uuid not null references public.ws_contextos(id) on delete cascade,
  ordem       numeric not null default 0,
  created_at  timestamptz not null default now(),
  -- PK composta: vincular duas vezes ao mesmo contexto é no-op, não duplicata
  primary key (tarefa_id, contexto_id)
);

-- ============================================================
-- 4) COMENTÁRIOS
-- ============================================================
create table if not exists public.ws_comentarios (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid not null references public.ws_tarefas(id) on delete cascade,
  autor_id    uuid references public.usuarios(id),
  corpo       text not null check (length(btrim(corpo)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  excluido_em timestamptz
);

-- ============================================================
-- 5) SEGUIDORES (quem recebe notificação da tarefa)
-- ============================================================
create table if not exists public.ws_seguidores (
  tarefa_id  uuid not null references public.ws_tarefas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tarefa_id, usuario_id)
);

-- ============================================================
-- 6) LOG DE ATIVIDADE — append-only, nunca sofre UPDATE
-- ============================================================
-- É a rede de segurança contra perda de dado: se um campo for sobrescrito por
-- engano, o valor antigo continua em mudanca->>'de'.
create table if not exists public.ws_atividade (
  id         bigserial primary key,
  tarefa_id  uuid not null references public.ws_tarefas(id) on delete cascade,
  ator_id    uuid references public.usuarios(id),
  evento     text not null,
  mudanca    jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7) SINAL DE REALTIME — única tabela do módulo legível pelo browser
-- ============================================================
create table if not exists public.ws_realtime_ping (
  id        uuid primary key default gen_random_uuid(),
  tarefa_id uuid,
  kind      text,   -- 'tarefa' | 'comentario'
  at        timestamptz not null default now()
);

-- ============================================================
-- 8) ÍNDICES
-- ============================================================
-- Lista principal: pendentes ordenadas por prazo (sem prazo no fim).
create index if not exists ws_tarefas_pendentes_idx
  on public.ws_tarefas (prazo_em nulls last, ordem)
  where concluida_em is null and excluida_em is null and arquivada_em is null;

-- "Minhas tarefas".
create index if not exists ws_tarefas_responsavel_idx
  on public.ws_tarefas (responsavel_id, prazo_em)
  where excluida_em is null and arquivada_em is null;

-- Calendário (janela de um mês).
create index if not exists ws_tarefas_prazo_idx
  on public.ws_tarefas (prazo_em)
  where prazo_em is not null and excluida_em is null;

create index if not exists ws_tarefas_pai_idx
  on public.ws_tarefas (tarefa_pai_id) where tarefa_pai_id is not null;

create index if not exists ws_vinculo_contexto_idx
  on public.ws_tarefa_contextos (contexto_id, tarefa_id);

create index if not exists ws_comentarios_tarefa_idx
  on public.ws_comentarios (tarefa_id, created_at);

create index if not exists ws_atividade_tarefa_idx
  on public.ws_atividade (tarefa_id, created_at desc);

create index if not exists ws_ping_at_idx
  on public.ws_realtime_ping (at desc);

-- Busca full-text PT-BR sobre título + descrição. Sem isto, buscar "relatório"
-- viraria ILIKE sequencial na tabela inteira.
create index if not exists ws_tarefas_busca_idx
  on public.ws_tarefas
  using gin (to_tsvector('portuguese',
    coalesce(titulo,'') || ' ' || coalesce(descricao,'')));

-- ============================================================
-- 9) updated_at automático
-- ============================================================
-- Não existe convenção de trigger no repo (hoje é setado na mão em cada
-- action). Aqui precisa ser confiável de verdade: a checagem de concorrência
-- e a ordenação "atualizadas recentemente" dependem dele.
create or replace function public.ws_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists ws_contextos_touch on public.ws_contextos;
create trigger ws_contextos_touch before update on public.ws_contextos
  for each row execute function public.ws_touch_updated_at();

drop trigger if exists ws_tarefas_touch on public.ws_tarefas;
create trigger ws_tarefas_touch before update on public.ws_tarefas
  for each row execute function public.ws_touch_updated_at();

drop trigger if exists ws_comentarios_touch on public.ws_comentarios;
create trigger ws_comentarios_touch before update on public.ws_comentarios
  for each row execute function public.ws_touch_updated_at();

-- ============================================================
-- 10) RLS
-- ============================================================
-- Conteúdo: RLS ligada SEM policy = só service_role. Ver comentário do topo.
alter table public.ws_contextos        enable row level security;
alter table public.ws_tarefas          enable row level security;
alter table public.ws_tarefa_contextos enable row level security;
alter table public.ws_comentarios      enable row level security;
alter table public.ws_seguidores       enable row level security;
alter table public.ws_atividade        enable row level security;

-- Exceção: ws_realtime_ping é lida pelo browser (anon) pra disparar refresh.
-- Não tem PII — só id, tarefa_id, kind e timestamp. INSERT continua service_role.
alter table public.ws_realtime_ping enable row level security;
drop policy if exists ws_realtime_ping_select on public.ws_realtime_ping;
create policy ws_realtime_ping_select
  on public.ws_realtime_ping
  for select
  to anon, authenticated
  using (true);

-- Realtime (Replication) só na tabela-sinal. Guard: ignora se já adicionada ou
-- se a publication não existir neste ambiente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'ws_realtime_ping'
  ) then
    execute 'alter publication supabase_realtime add table public.ws_realtime_ping';
  end if;
exception when undefined_object then
  null;  -- publication supabase_realtime ausente neste ambiente
end $$;

-- ============================================================
-- 11) SEEDS — contextos iniciais espelhando o uso real do Asana
-- ============================================================
-- Só roda se a tabela estiver vazia. 'Calendário de conteúdo' e 'Anômalo Hub'
-- são os dois projetos transversais que a auditoria do Asana encontrou (as
-- pastas por cliente nascem sob demanda, na aba Clientes).
insert into public.ws_contextos (nome, tipo, cor, ordem, criado_por)
select v.nome, v.tipo, v.cor, v.ordem,
       (select id from public.usuarios where papel = 'admin' and ativo order by email limit 1)
from (values
  ('Calendário de conteúdo', 'geral',   '#C9953A', 0),
  ('Anômalo Hub',            'interno', '#4a90d9', 1)
) as v(nome, tipo, cor, ordem)
where not exists (select 1 from public.ws_contextos);

-- ============================================================
-- 12) NOTIFICAÇÕES — novo tipo ws_tarefa
-- ============================================================
-- Um tipo só cobre atribuição, prazo, comentário e menção: são eventos da
-- mesma tarefa, e o usuário toma uma decisão só ("quero saber das minhas
-- tarefas?"). Mesmo padrão da adição de crm_lembrete na Fase 2 do CRM.
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'nova_venda','lembrete',
    'dados_comercial','dados_trafego','meta_batida','dados_sentinela',
    'crm_lembrete',
    'ws_tarefa'
  ));

alter table public.preferencias_notificacao
  add column if not exists ws_tarefa boolean not null default true;

-- ============================================================
-- 13) PERMISSÃO 'workspace' — a feature flag do módulo
-- ============================================================
-- Enquanto só o admin tiver a chave, o item some do rail pros outros papéis e
-- a rota redireciona. Ligar pro time = rodar o UPDATE comentado no fim.
--
-- Usuários existentes simplesmente NÃO têm a chave no JSONB; temPermissao é
-- fail-closed (ausência = false) e admin bypassa. Ou seja: nada a fazer aqui
-- pro módulo já nascer desligado com segurança.
--
-- ROLLOUT (Fase 6) — rodar manualmente quando o time for liberado:
--
--   update public.usuarios
--      set permissoes = jsonb_set(permissoes, '{workspace}', 'true'::jsonb)
--    where ativo and papel in ('comercial','gestor_trafego');
--
-- ROLLBACK do rollout:
--
--   update public.usuarios
--      set permissoes = jsonb_set(permissoes, '{workspace}', 'false'::jsonb)
--    where ativo and papel in ('comercial','gestor_trafego');
