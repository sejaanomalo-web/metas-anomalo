-- Reuniões (Cal.com → Workspace). 2026-10-21.
--
-- Doc completa: docs/CALCOM_WORKSPACE_INTEGRATION.md
--
-- O Cal.com é quem RESERVA (página pública, conflito de agenda, Google Meet).
-- O Workspace é a central interna: cada reserva vira UMA tarefa normal em
-- ws_tarefas, com prazo_em/prazo_hora no horário de Brasília, e aparece no
-- calendário como qualquer tarefa criada à mão. Nada aqui cria um segundo
-- calendário.
--
-- Migration 100% ADITIVA: só cria tabelas novas. ws_tarefas NÃO ganha coluna
-- — o select de tarefa é uma lista fixa de colunas (lib/workspace.ts) e coluna
-- nova lá quebraria o Workspace inteiro enquanto esta migration não estivesse
-- aplicada. O vínculo reunião↔tarefa e o "bloqueia agenda" vivem em tabelas
-- laterais.
--
-- SEGURANÇA: mesmo padrão do resto do app (ver 20260721_workspace_fase1.sql) —
-- RLS ligada SEM policy. Só o service_role (servidor) lê e escreve; o browser
-- nunca toca nestas tabelas. Nenhuma credencial é gravada aqui: a API key e o
-- segredo do webhook ficam em variáveis de ambiente.

-- ============================================================
-- 1) INTEGRAÇÃO — uma linha por provedor/conta
-- ============================================================
create table if not exists public.reunioes_integracoes (
  id                      uuid primary key default gen_random_uuid(),
  provedor                text not null default 'calcom' check (provedor in ('calcom')),
  -- Estado da conexão como a tela mostra. 'nao_configurado' = env ausente
  -- (calculado na leitura); aqui guardamos o último estado PERSISTIDO.
  status                  text not null default 'pendente'
                          check (status in ('pendente','conectado','sincronizando','erro','desconectado')),
  -- Desligar a sincronização para de importar reservas SEM apagar nada.
  sincronizacao_ativa     boolean not null default true,
  -- Dados públicos da conta (GET /v2/me). Nunca a API key.
  conta_id                bigint,
  conta_username          text,
  conta_email             text,
  conta_nome              text,
  conta_fuso              text,
  -- Webhook registrado via API (POST /v2/webhooks) — guardado pra poder
  -- desligar/apagar na desconexão.
  webhook_id              text,
  webhook_url             text,
  -- Feed ICS de bloqueios cadastrado no Cal.com (POST /v2/calendars/ics-feed/save).
  ics_credencial_id       bigint,
  ultimo_teste_em         timestamptz,
  ultimo_teste_ok         boolean,
  ultima_sincronizacao_em timestamptz,
  ultimo_erro             text,
  desconectado_em         timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Uma conta por provedor por enquanto (ferramenta interna, uma conta da
-- agência). Para várias contas no futuro: trocar por unique(provedor, conta_id).
create unique index if not exists reunioes_integracoes_provedor_unico
  on public.reunioes_integracoes (provedor);

insert into public.reunioes_integracoes (provedor, status)
select 'calcom', 'pendente'
where not exists (select 1 from public.reunioes_integracoes where provedor = 'calcom');

-- ============================================================
-- 2) DISPONIBILIDADE — espelho editável de um schedule do Cal.com
-- ============================================================
-- janelas:  [{ "dia": 1, "inicio": "09:00", "fim": "11:00" }, ...]   (0=dom … 6=sáb)
-- periodos: [{ "id", "nome", "de": "2026-11-01", "ate": "2026-11-30", "janelas": [...] }]
--           regra semanal que vale SÓ dentro do intervalo; publicada no Cal.com
--           como overrides por data (o Cal.com não tem regra semanal com vigência).
-- excecoes: [{ "data": "2026-11-15", "janelas": [] }]  — [] = dia indisponível
-- bloqueios:[{ "id", "de", "ate", "motivo", "calcom_ooo_id" }] — Out of Office
create table if not exists public.reunioes_disponibilidades (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null check (length(btrim(nome)) > 0),
  fuso               text not null default 'America/Sao_Paulo',
  responsavel_id     uuid references public.usuarios(id) on delete set null,
  janelas            jsonb not null default '[]'::jsonb,
  periodos           jsonb not null default '[]'::jsonb,
  excecoes           jsonb not null default '[]'::jsonb,
  bloqueios          jsonb not null default '[]'::jsonb,
  calcom_schedule_id bigint,
  publicado_em       timestamptz,
  publicacao_erro    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists reunioes_disp_schedule_unico
  on public.reunioes_disponibilidades (calcom_schedule_id)
  where calcom_schedule_id is not null;

-- Semente: o exemplo combinado (seg/ter/qui com duas janelas, qua/sex só manhã).
-- O responsável fica NULO de propósito: não adivinhamos usuário — escolhe-se
-- na aba Reuniões.
insert into public.reunioes_disponibilidades (nome, janelas)
select 'Agenda comercial', '[
  {"dia":1,"inicio":"09:00","fim":"11:00"},{"dia":1,"inicio":"14:00","fim":"15:00"},
  {"dia":2,"inicio":"09:00","fim":"11:00"},{"dia":2,"inicio":"14:00","fim":"15:00"},
  {"dia":3,"inicio":"09:00","fim":"11:00"},
  {"dia":4,"inicio":"09:00","fim":"11:00"},{"dia":4,"inicio":"14:00","fim":"15:00"},
  {"dia":5,"inicio":"09:00","fim":"11:00"}
]'::jsonb
where not exists (select 1 from public.reunioes_disponibilidades);

-- ============================================================
-- 3) TIPOS DE REUNIÃO — evento interno ↔ event type do Cal.com
-- ============================================================
create table if not exists public.reunioes_tipos (
  id                      uuid primary key default gen_random_uuid(),
  nome                    text not null check (length(btrim(nome)) > 0),
  descricao               text,
  duracao_min             int  not null default 30 check (duracao_min between 5 and 480),
  -- 'marketing_corretores' | 'sistema_imobiliario' | futuros. Vai pra tarefa.
  origem_comercial        text not null check (origem_comercial ~ '^[a-z0-9_]{2,60}$'),
  campanha_rotulo         text,
  responsavel_id          uuid references public.usuarios(id) on delete set null,
  disponibilidade_id      uuid references public.reunioes_disponibilidades(id) on delete set null,
  -- Projeto/cliente do Workspace onde a tarefa da reunião entra (opcional).
  contexto_id             uuid references public.ws_contextos(id) on delete set null,
  calcom_event_type_id    bigint,
  calcom_slug             text,
  link_publico            text,
  -- Cal Video é o padrão (decisão 2026-10-21: a ANÔMALO não usa Google
  -- Calendar/Meet como agenda; nada aqui depende do Google).
  local                   text not null default 'cal_video'
                          check (local in ('cal_video','google_meet','definido_no_calcom')),
  antecedencia_min_horas  int  not null default 12 check (antecedencia_min_horas between 0 and 720),
  intervalo_min           int  not null default 15 check (intervalo_min between 0 and 240),
  limite_diario           int           default 3  check (limite_diario is null or limite_diario between 1 and 50),
  horizonte_dias          int  not null default 14 check (horizonte_dias between 1 and 365),
  ativo                   boolean not null default true,
  ordem                   int  not null default 0,
  ultima_sincronizacao_em timestamptz,
  ultimo_erro             text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Um event type do Cal.com pertence a UM tipo interno — é isto que impede uma
-- reserva de "cair" no tipo errado.
create unique index if not exists reunioes_tipos_event_type_unico
  on public.reunioes_tipos (calcom_event_type_id)
  where calcom_event_type_id is not null;

create unique index if not exists reunioes_tipos_origem_unica
  on public.reunioes_tipos (origem_comercial);

insert into public.reunioes_tipos (nome, descricao, duracao_min, origem_comercial, campanha_rotulo, ordem, disponibilidade_id)
select v.nome, v.descricao, 30, v.origem, v.campanha, v.ordem,
       (select id from public.reunioes_disponibilidades order by created_at limit 1)
from (values
  ('Diagnóstico de Marketing para Corretores',
   'Vamos entender como você divulga seus imóveis atualmente e apresentar como a ANÔMALO trabalha com produção de conteúdo, gravação de imóveis, edição, tráfego pago e captação de interessados.',
   'marketing_corretores', 'Marketing para Corretores', 0),
  ('Demonstração do Sistema Imobiliário',
   'Conheça por dentro o sistema desenvolvido pela ANÔMALO para organização de imóveis, CRM de leads, vitrine imobiliária e inteligência artificial.',
   'sistema_imobiliario', 'Sistema Imobiliário para Corretores', 1)
) as v(nome, descricao, origem, campanha, ordem)
where not exists (select 1 from public.reunioes_tipos where origem_comercial = v.origem);

-- ============================================================
-- 4) AGENDAMENTOS — 1 linha por booking UID do Cal.com
-- ============================================================
-- Reagendar no Cal.com gera um UID NOVO (o antigo vira cancelado com
-- rescheduledToUid). As duas linhas apontam pra MESMA tarefa: a antiga fica
-- 'reagendada' (histórico), a nova é a ativa.
create table if not exists public.reunioes_agendamentos (
  id                    uuid primary key default gen_random_uuid(),
  provedor              text not null default 'calcom',
  booking_uid           text not null,
  booking_id            bigint,
  tipo_id               uuid references public.reunioes_tipos(id) on delete set null,
  calcom_event_type_id  bigint,
  tarefa_id             uuid references public.ws_tarefas(id) on delete set null,
  responsavel_id        uuid references public.usuarios(id) on delete set null,
  participante_nome     text,
  participante_email    text,
  participante_telefone text,
  participante_fuso     text,
  inicio                timestamptz,
  fim                   timestamptz,
  status                text not null
                        check (status in ('solicitada','confirmada','reagendada','cancelada','rejeitada','realizada')),
  reagendada_de_uid     text,
  reagendada_para_uid   text,
  link_reuniao          text,
  local_rotulo          text,
  origem_comercial      text,
  cancelamento_motivo   text,
  -- Ordem dos eventos: timestamp do evento MAIS NOVO já aplicado. Um webhook
  -- atrasado (createdAt menor) não sobrescreve estado mais novo.
  ultimo_evento_em      timestamptz,
  ultimo_gatilho        text,
  -- Descrição que o sistema escreveu na tarefa. Se a tarefa ainda tiver
  -- exatamente esse texto, pode ser regenerada; se a equipe editou, só
  -- acrescentamos uma linha de atualização (nunca apagamos anotação).
  descricao_gerada      text,
  sync_status           text not null default 'ok' check (sync_status in ('ok','pendente','erro')),
  sync_erro             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists reunioes_agend_uid_unico
  on public.reunioes_agendamentos (provedor, booking_uid);
create index if not exists reunioes_agend_inicio_idx
  on public.reunioes_agendamentos (inicio);
create index if not exists reunioes_agend_tarefa_idx
  on public.reunioes_agendamentos (tarefa_id) where tarefa_id is not null;
create index if not exists reunioes_agend_sync_idx
  on public.reunioes_agendamentos (sync_status) where sync_status <> 'ok';

-- ============================================================
-- 5) EVENTOS RECEBIDOS — idempotência + retentativa
-- ============================================================
create table if not exists public.reunioes_webhook_eventos (
  id                 uuid primary key default gen_random_uuid(),
  recebido_em        timestamptz not null default now(),
  gatilho            text,
  booking_uid        text,
  evento_criado_em   timestamptz,
  -- sha256 do corpo cru: o mesmo POST reenviado 3x vira 1 linha.
  chave_idempotencia text not null,
  -- payload pode ter dado pessoal (nome/e-mail/telefone): RLS sem policy, e a
  -- tela só mostra para admin. Necessário pra reprocessar sem depender do
  -- Cal.com.
  payload            jsonb,
  status             text not null default 'recebido'
                     check (status in ('recebido','processado','ignorado','erro')),
  resultado          text,
  erro               text,
  tentativas         int not null default 0,
  processado_em      timestamptz
);

create unique index if not exists reunioes_eventos_idem_unico
  on public.reunioes_webhook_eventos (chave_idempotencia);
create index if not exists reunioes_eventos_recebido_idx
  on public.reunioes_webhook_eventos (recebido_em desc);
create index if not exists reunioes_eventos_erro_idx
  on public.reunioes_webhook_eventos (status) where status = 'erro';

-- ============================================================
-- 6) LOG DE SINCRONIZAÇÃO — histórico técnico (append-only)
-- ============================================================
create table if not exists public.reunioes_sync_log (
  id             bigserial primary key,
  nivel          text not null default 'info' check (nivel in ('info','aviso','erro')),
  acao           text not null,
  mensagem       text not null,
  detalhes       jsonb,
  agendamento_id uuid references public.reunioes_agendamentos(id) on delete set null,
  ator_id        uuid references public.usuarios(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists reunioes_sync_log_idx
  on public.reunioes_sync_log (created_at desc);

-- ============================================================
-- 7) TAREFA QUE BLOQUEIA A AGENDA PÚBLICA
-- ============================================================
-- Tarefa comum NÃO bloqueia agenda. Só entra aqui quem a equipe marcar
-- explicitamente ("Bloqueia agenda de reuniões" no detalhe da tarefa), e
-- só vale se a tarefa tiver data E horário. Essas tarefas saem no feed ICS
-- (/api/reunioes/agenda-bloqueios/<token>) que o Cal.com lê como calendário
-- de conflitos. Reuniões importadas do Cal.com NUNCA entram no feed — o
-- próprio Cal.com já ocupa o horário (evita loop).
create table if not exists public.ws_tarefa_bloqueios (
  tarefa_id   uuid primary key references public.ws_tarefas(id) on delete cascade,
  duracao_min int not null default 60 check (duracao_min between 5 and 720),
  criado_por  uuid references public.usuarios(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 8) updated_at automático (reusa a função do Workspace)
-- ============================================================
drop trigger if exists reunioes_integracoes_touch on public.reunioes_integracoes;
create trigger reunioes_integracoes_touch before update on public.reunioes_integracoes
  for each row execute function public.ws_touch_updated_at();

drop trigger if exists reunioes_disp_touch on public.reunioes_disponibilidades;
create trigger reunioes_disp_touch before update on public.reunioes_disponibilidades
  for each row execute function public.ws_touch_updated_at();

drop trigger if exists reunioes_tipos_touch on public.reunioes_tipos;
create trigger reunioes_tipos_touch before update on public.reunioes_tipos
  for each row execute function public.ws_touch_updated_at();

drop trigger if exists reunioes_agend_touch on public.reunioes_agendamentos;
create trigger reunioes_agend_touch before update on public.reunioes_agendamentos
  for each row execute function public.ws_touch_updated_at();

-- ============================================================
-- 9) RLS — ligada, SEM policy (só service_role)
-- ============================================================
alter table public.reunioes_integracoes      enable row level security;
alter table public.reunioes_disponibilidades enable row level security;
alter table public.reunioes_tipos            enable row level security;
alter table public.reunioes_agendamentos     enable row level security;
alter table public.reunioes_webhook_eventos  enable row level security;
alter table public.reunioes_sync_log         enable row level security;
alter table public.ws_tarefa_bloqueios       enable row level security;
