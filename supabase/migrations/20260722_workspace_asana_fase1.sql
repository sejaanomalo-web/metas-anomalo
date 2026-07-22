-- Workspace — Migração do Asana, Fase 1: staging + extensões do modelo. 2026-07-22.
--
-- Depende de 20260721_workspace_fase1.sql. Plano em docs/WORKSPACE-MIGRACAO-ASANA.md.
--
-- Esta migration NÃO importa nada. Ela cria:
--   1. o staging raw-first (nada é normalizado antes de estar salvo cru);
--   2. o mapa permanente origem→destino (idempotência e reconciliação);
--   3. as extensões que faltavam no modelo pra receber o Asana sem perda:
--      seções, identidades externas, motor de campos personalizados,
--      anexos e links.
--
-- PRINCÍPIO RAW-FIRST: todo objeto lido do Asana é gravado inteiro em
-- ws_import_raw ANTES de virar linha canônica. Se o normalizador não souber
-- interpretar um campo, o dado continua íntegro e a execução acusa pendência.
-- Nunca descartar em silêncio.
--
-- SEGURANÇA: mesmo padrão do módulo — RLS ligada SEM policy (só service_role).
-- O staging é ainda mais sensível (payload cru pode ter qualquer coisa), então
-- ele nunca é lido pelo browser, nem pela tabela-sinal de realtime.

-- ============================================================
-- 1) EXECUÇÕES DE IMPORTAÇÃO
-- ============================================================
create table if not exists public.ws_import_execucoes (
  id             uuid primary key default gen_random_uuid(),
  modo           text not null check (modo in
                   ('descoberta','dry_run','completa','incremental','cutover')),
  estado         text not null default 'rodando' check (estado in
                   ('rodando','concluida','parcial','falhou','cancelada')),
  iniciada_em    timestamptz not null default now(),
  finalizada_em  timestamptz,
  -- Marco temporal do snapshot: na incremental, só objetos modificados depois
  -- disto são relidos. É o que permite a sincronização final antes do corte.
  snapshot_em    timestamptz,
  versao_importador text not null,
  contadores     jsonb not null default '{}'::jsonb,
  relatorio      jsonb,
  iniciada_por   uuid references public.usuarios(id),
  created_at     timestamptz not null default now()
);

create index if not exists ws_import_execucoes_estado_idx
  on public.ws_import_execucoes (estado, iniciada_em desc);

-- ============================================================
-- 2) STAGING RAW — a rede de segurança contra perda
-- ============================================================
create table if not exists public.ws_import_raw (
  id                  bigserial primary key,
  execucao_id         uuid not null references public.ws_import_execucoes(id) on delete cascade,
  sistema             text not null default 'asana',
  tipo_objeto         text not null,   -- workspace|team|user|project|section|
                                       -- custom_field|task|subtask|comment|
                                       -- attachment|membership|tag|portfolio
  source_gid          text not null,
  source_parent_gid   text,
  payload             jsonb not null,
  -- checksum do payload canonicalizado: se não mudou, o normalizador pula a
  -- linha em vez de reescrever tudo (é o que faz a reexecução ser barata)
  checksum            text not null,
  source_criado_em    timestamptz,
  source_modificado_em timestamptz,
  estado              text not null default 'pendente' check (estado in
                        ('pendente','normalizado','ignorado','erro')),
  tabela_destino      text,
  id_destino          uuid,
  erro                text,
  tentativas          int not null default 0,
  created_at          timestamptz not null default now(),
  -- Um objeto aparece uma vez por execução. Reler a mesma página duas vezes
  -- (retry de rate limit) não gera linha duplicada em staging.
  unique (execucao_id, tipo_objeto, source_gid)
);

create index if not exists ws_import_raw_estado_idx
  on public.ws_import_raw (execucao_id, tipo_objeto, estado);
create index if not exists ws_import_raw_gid_idx
  on public.ws_import_raw (sistema, tipo_objeto, source_gid);

-- ============================================================
-- 3) MAPA PERMANENTE ORIGEM → DESTINO
-- ============================================================
-- Sobrevive às execuções. É isto que garante que rodar a importação duas
-- vezes atualize as mesmas linhas em vez de criar cópias.
create table if not exists public.ws_import_mapeamentos (
  id                   uuid primary key default gen_random_uuid(),
  sistema              text not null default 'asana',
  tipo_objeto          text not null,
  source_gid           text not null,
  tabela_destino       text not null,
  id_destino           uuid not null,
  source_criado_em     timestamptz,
  source_modificado_em timestamptz,
  ultimo_sync_em       timestamptz not null default now(),
  checksum             text,
  created_at           timestamptz not null default now(),
  unique (sistema, tipo_objeto, source_gid)
);

create index if not exists ws_import_mapeamentos_destino_idx
  on public.ws_import_mapeamentos (tabela_destino, id_destino);

-- ============================================================
-- 4) ERROS ESTRUTURADOS
-- ============================================================
create table if not exists public.ws_import_erros (
  id           bigserial primary key,
  execucao_id  uuid not null references public.ws_import_execucoes(id) on delete cascade,
  tipo_objeto  text,
  source_gid   text,
  etapa        text not null,   -- extracao|staging|normalizacao|anexo|reconciliacao
  codigo       text not null,
  -- mensagem SEGURA: nunca conteúdo de tarefa, token ou signed URL
  mensagem     text not null,
  resumo       jsonb,
  retryable    boolean not null default false,
  resolvido_em timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists ws_import_erros_execucao_idx
  on public.ws_import_erros (execucao_id, etapa, created_at desc);

-- ============================================================
-- 5) IDENTIDADES EXTERNAS (os 7 usuários do Asana)
-- ============================================================
-- Preserva autoria mesmo antes de existir conta no Metas Anômalo. O plano é
-- explícito: não criar usuário autenticável por importação. Então a tarefa
-- aponta pra identidade externa até alguém mapear pra um usuario real.
create table if not exists public.ws_identidades_externas (
  id          uuid primary key default gen_random_uuid(),
  sistema     text not null default 'asana',
  source_gid  text not null,
  nome        text,
  email       text,
  -- Preenchido na etapa de mapeamento assistido. NULL = ainda pendente.
  usuario_id  uuid references public.usuarios(id) on delete set null,
  mapeado_em  timestamptz,
  mapeado_por uuid references public.usuarios(id),
  created_at  timestamptz not null default now(),
  unique (sistema, source_gid)
);

create index if not exists ws_identidades_pendentes_idx
  on public.ws_identidades_externas (sistema) where usuario_id is null;

-- ============================================================
-- 6) CONTEXTOS — campos que faltavam pra receber um projeto do Asana
-- ============================================================
alter table public.ws_contextos
  add column if not exists nome_normalizado     text,
  add column if not exists privado              boolean not null default true,
  add column if not exists visualizacao_padrao  text,
  add column if not exists dono_id              uuid references public.usuarios(id) on delete set null,
  add column if not exists dono_externo_id      uuid references public.ws_identidades_externas(id) on delete set null,
  add column if not exists notas                text,
  add column if not exists notas_html           text,
  add column if not exists source_gid           text,
  add column if not exists source_criado_em     timestamptz,
  add column if not exists source_modificado_em timestamptz;

-- Novos kinds. Os projetos CLIENTES/ESTUDOS/ARQUIVOS/APROVADOS vêm vazios do
-- Asana mas precisam existir como aba — 'desconhecido' é o estado de quem
-- ainda não passou pelo mapeamento assistido (nunca vira cliente sozinho).
alter table public.ws_contextos drop constraint if exists ws_contextos_tipo_check;
alter table public.ws_contextos add constraint ws_contextos_tipo_check
  check (tipo in (
    'geral','cliente','empresa','interno',
    'calendario_conteudo','estudos','arquivos','aprovados','desconhecido'
  ));

create unique index if not exists ws_contextos_source_gid_unico
  on public.ws_contextos (source_gid) where source_gid is not null;

-- Membros do projeto (preserva quem tinha acesso lá).
create table if not exists public.ws_contexto_membros (
  contexto_id           uuid not null references public.ws_contextos(id) on delete cascade,
  usuario_id            uuid references public.usuarios(id) on delete cascade,
  identidade_externa_id uuid references public.ws_identidades_externas(id) on delete cascade,
  created_at            timestamptz not null default now(),
  -- exatamente um dos dois lados preenchido
  constraint ws_contexto_membros_um_lado check (
    (usuario_id is not null and identidade_externa_id is null) or
    (usuario_id is null and identidade_externa_id is not null)
  )
);

create unique index if not exists ws_contexto_membros_usuario_unq
  on public.ws_contexto_membros (contexto_id, usuario_id) where usuario_id is not null;
create unique index if not exists ws_contexto_membros_externo_unq
  on public.ws_contexto_membros (contexto_id, identidade_externa_id) where identidade_externa_id is not null;

-- ============================================================
-- 7) SEÇÕES
-- ============================================================
-- 62 das 73 seções do Asana se chamam "Untitled section". O nome exibido cai
-- pra 'Geral', mas nome_original fica guardado pra reconciliação bater.
create table if not exists public.ws_secoes (
  id            uuid primary key default gen_random_uuid(),
  contexto_id   uuid not null references public.ws_contextos(id) on delete cascade,
  nome          text not null,
  nome_original text,
  ordem         numeric not null default 0,
  source_gid    text,
  arquivada_em  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists ws_secoes_contexto_idx on public.ws_secoes (contexto_id, ordem);
create unique index if not exists ws_secoes_source_gid_unico
  on public.ws_secoes (source_gid) where source_gid is not null;

alter table public.ws_tarefa_contextos
  add column if not exists secao_id uuid references public.ws_secoes(id) on delete set null;

-- ============================================================
-- 8) TAREFAS — campos que faltavam
-- ============================================================
alter table public.ws_tarefas
  -- HTML original do Asana, guardado cru. A renderização usa o markdown-lite
  -- convertido (descricao); isto aqui é o fallback auditável se a conversão
  -- tiver perdido algo.
  add column if not exists descricao_html_original text,
  add column if not exists inicio_hora             time,
  add column if not exists resource_subtype        text,
  add column if not exists approval_status         text,
  add column if not exists responsavel_externo_id  uuid references public.ws_identidades_externas(id) on delete set null,
  add column if not exists criado_por_externo_id   uuid references public.ws_identidades_externas(id) on delete set null,
  add column if not exists concluida_por_externo_id uuid references public.ws_identidades_externas(id) on delete set null,
  add column if not exists source_gid              text,
  add column if not exists source_criado_em        timestamptz,
  add column if not exists source_modificado_em    timestamptz;

create unique index if not exists ws_tarefas_source_gid_unico
  on public.ws_tarefas (source_gid) where source_gid is not null;

-- inicio_hora segue a mesma regra de prazo_hora: horário exige a data.
alter table public.ws_tarefas drop constraint if exists ws_tarefas_inicio_hora_exige_data;
alter table public.ws_tarefas add constraint ws_tarefas_inicio_hora_exige_data
  check (inicio_hora is null or inicio_em is not null);

-- A conclusão importada pode ter ator externo em vez de usuario. O CHECK
-- original exigia concluida_por junto com concluida_em — precisa aceitar o
-- ator externo como alternativa, senão 1.500 tarefas concluídas não entram.
alter table public.ws_tarefas drop constraint if exists ws_tarefas_conclusao_coerente;
alter table public.ws_tarefas add constraint ws_tarefas_conclusao_coerente
  check (
    (concluida_em is null and concluida_por is null and concluida_por_externo_id is null)
    or (concluida_em is not null)
  );

-- Seguidores que ainda não têm conta no sistema.
create table if not exists public.ws_seguidores_externos (
  tarefa_id             uuid not null references public.ws_tarefas(id) on delete cascade,
  identidade_externa_id uuid not null references public.ws_identidades_externas(id) on delete cascade,
  created_at            timestamptz not null default now(),
  primary key (tarefa_id, identidade_externa_id)
);

-- ============================================================
-- 9) COMENTÁRIOS — autor externo e original
-- ============================================================
alter table public.ws_comentarios
  add column if not exists autor_externo_id uuid references public.ws_identidades_externas(id) on delete set null,
  add column if not exists corpo_html_original text,
  add column if not exists source_gid          text,
  add column if not exists source_criado_em    timestamptz;

create unique index if not exists ws_comentarios_source_gid_unico
  on public.ws_comentarios (source_gid) where source_gid is not null;

-- autor_id era NOT NULL de fato (sempre vinha da sessão). Na importação o
-- autor pode ser só externo, então o vínculo passa a ser "um dos dois".
alter table public.ws_comentarios drop constraint if exists ws_comentarios_tem_autor;
alter table public.ws_comentarios add constraint ws_comentarios_tem_autor
  check (autor_id is not null or autor_externo_id is not null);

-- ============================================================
-- 10) MOTOR DE CAMPOS PERSONALIZADOS
-- ============================================================
-- O plano é explícito: NADA de ALTER TABLE ws_tarefas por campo novo. Campo
-- vira LINHA em definições, e o valor vira linha em valores, com coluna
-- tipada. Assim um campo novo no Asana (ou criado aqui depois) aparece no
-- banco e na interface sem migration.
create table if not exists public.ws_campos_definicoes (
  id             uuid primary key default gen_random_uuid(),
  contexto_id    uuid references public.ws_contextos(id) on delete cascade,
  nome           text not null,
  descricao      text,
  -- tipo canônico do registry (lib/workspace-campos.ts). 'desconhecido'
  -- preserva o valor cru e BLOQUEIA o cutover até alguém implementar.
  tipo           text not null check (tipo in (
                   'texto','texto_rico','numero','moeda','percentual',
                   'enum','multi_enum','pessoas','data','data_hora',
                   'booleano','url','desconhecido')),
  tipo_origem    text,
  config         jsonb not null default '{}'::jsonb,
  global         boolean not null default false,
  ativo          boolean not null default true,
  ordem          int not null default 0,
  renderer_key   text,
  filtravel      boolean not null default true,
  ordenavel      boolean not null default true,
  source_gid     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- O Asana tem 30 campos "Colaborators" com GIDs DIFERENTES, um por projeto.
-- São definições distintas de verdade — o unique é por GID, não por nome.
create unique index if not exists ws_campos_definicoes_source_gid_unico
  on public.ws_campos_definicoes (source_gid) where source_gid is not null;
create index if not exists ws_campos_definicoes_contexto_idx
  on public.ws_campos_definicoes (contexto_id, ordem) where ativo;

create table if not exists public.ws_campos_opcoes (
  id           uuid primary key default gen_random_uuid(),
  definicao_id uuid not null references public.ws_campos_definicoes(id) on delete cascade,
  rotulo       text not null,
  cor          text,
  habilitada   boolean not null default true,
  ordem        int not null default 0,
  source_gid   text,
  created_at   timestamptz not null default now()
);

create unique index if not exists ws_campos_opcoes_source_gid_unico
  on public.ws_campos_opcoes (source_gid) where source_gid is not null;
create index if not exists ws_campos_opcoes_definicao_idx
  on public.ws_campos_opcoes (definicao_id, ordem);

create table if not exists public.ws_campos_valores (
  id             uuid primary key default gen_random_uuid(),
  tarefa_id      uuid not null references public.ws_tarefas(id) on delete cascade,
  definicao_id   uuid not null references public.ws_campos_definicoes(id) on delete cascade,
  valor_texto    text,
  valor_numero   numeric,
  valor_booleano boolean,
  valor_data     date,
  valor_data_hora timestamptz,
  -- multi-valor (multi_enum, pessoas) e preservação do payload cru
  valor_json     jsonb,
  valor_bruto    jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tarefa_id, definicao_id)
);

create index if not exists ws_campos_valores_definicao_idx
  on public.ws_campos_valores (definicao_id);
create index if not exists ws_campos_valores_texto_idx
  on public.ws_campos_valores (definicao_id, valor_texto) where valor_texto is not null;
create index if not exists ws_campos_valores_numero_idx
  on public.ws_campos_valores (definicao_id, valor_numero) where valor_numero is not null;
create index if not exists ws_campos_valores_data_idx
  on public.ws_campos_valores (definicao_id, valor_data) where valor_data is not null;

-- Relação N:N pra enum/pessoas — permite filtrar "contém esta opção" por
-- índice, o que um scan de jsonb não daria de graça.
create table if not exists public.ws_campos_valor_opcoes (
  valor_id  uuid not null references public.ws_campos_valores(id) on delete cascade,
  opcao_id  uuid not null references public.ws_campos_opcoes(id) on delete cascade,
  primary key (valor_id, opcao_id)
);
create index if not exists ws_campos_valor_opcoes_opcao_idx
  on public.ws_campos_valor_opcoes (opcao_id);

create table if not exists public.ws_campos_valor_pessoas (
  valor_id              uuid not null references public.ws_campos_valores(id) on delete cascade,
  usuario_id            uuid references public.usuarios(id) on delete cascade,
  identidade_externa_id uuid references public.ws_identidades_externas(id) on delete cascade,
  constraint ws_campos_valor_pessoas_um_lado check (
    (usuario_id is not null and identidade_externa_id is null) or
    (usuario_id is null and identidade_externa_id is not null)
  )
);
create unique index if not exists ws_campos_valor_pessoas_usuario_unq
  on public.ws_campos_valor_pessoas (valor_id, usuario_id) where usuario_id is not null;
create unique index if not exists ws_campos_valor_pessoas_externo_unq
  on public.ws_campos_valor_pessoas (valor_id, identidade_externa_id) where identidade_externa_id is not null;

-- Coerência tipo↔coluna: impede que um campo 'numero' guarde valor em
-- valor_texto e depois ninguém entenda por que o filtro numérico não acha.
create or replace function public.ws_valida_valor_campo() returns trigger as $$
declare
  t text;
begin
  select tipo into t from public.ws_campos_definicoes where id = new.definicao_id;
  if t is null then
    raise exception 'ws_campos_valores: definicao % nao existe', new.definicao_id;
  end if;

  if t in ('numero','moeda','percentual') and new.valor_numero is null
     and new.valor_bruto is not null and new.valor_json is null then
    raise exception 'ws_campos_valores: tipo % exige valor_numero', t;
  end if;
  if t = 'booleano' and new.valor_booleano is null and new.valor_bruto is null then
    raise exception 'ws_campos_valores: tipo booleano exige valor_booleano';
  end if;
  if t = 'data' and new.valor_data is null and new.valor_bruto is null then
    raise exception 'ws_campos_valores: tipo data exige valor_data';
  end if;
  if t = 'data_hora' and new.valor_data_hora is null and new.valor_bruto is null then
    raise exception 'ws_campos_valores: tipo data_hora exige valor_data_hora';
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists ws_campos_valores_valida on public.ws_campos_valores;
create trigger ws_campos_valores_valida
  before insert or update on public.ws_campos_valores
  for each row execute function public.ws_valida_valor_campo();

-- ============================================================
-- 11) ANEXOS
-- ============================================================
-- 52 anexos únicos: 41 binários hospedados pelo Asana (download_url expira!)
-- e 11 externos. Os binários TÊM que ser baixados durante a execução e
-- reenviados pro Storage privado — guardar a URL do Asana é garantir link
-- morto depois do corte.
create table if not exists public.ws_anexos (
  id                uuid primary key default gen_random_uuid(),
  tarefa_id         uuid references public.ws_tarefas(id) on delete cascade,
  contexto_id       uuid references public.ws_contextos(id) on delete cascade,
  nome_arquivo      text not null,
  -- 'asana' = binário que baixamos; 'external'/'gdrive'/'dropbox'/... = link
  origem_subtipo    text,
  host_origem       text,
  -- preenchidos só quando o binário foi realmente parar no nosso bucket
  storage_bucket    text,
  storage_path      text,
  content_type      text,
  content_type_declarado text,
  tamanho_bytes     bigint,
  sha256            text,
  url_externa       text,
  url_view          text,
  url_permanente    text,
  estado            text not null default 'pendente' check (estado in
                      ('pendente','baixado','enviado','verificado','externo','falhou')),
  erro              text,
  source_gid        text,
  source_criado_em  timestamptz,
  enviado_por       uuid references public.usuarios(id),
  created_at        timestamptz not null default now(),
  excluido_em       timestamptz,
  constraint ws_anexos_tem_dono check (tarefa_id is not null or contexto_id is not null)
);

create unique index if not exists ws_anexos_source_gid_unico
  on public.ws_anexos (source_gid) where source_gid is not null;
create index if not exists ws_anexos_tarefa_idx on public.ws_anexos (tarefa_id) where excluido_em is null;
create index if not exists ws_anexos_sha_idx on public.ws_anexos (sha256) where sha256 is not null;
create index if not exists ws_anexos_estado_idx on public.ws_anexos (estado);

-- Bucket PRIVADO. Nada de getPublicUrl como o crm-midia: aqui pode ter
-- documento de cliente. Acesso só por signed URL curta emitida no servidor.
insert into storage.buckets (id, name, public)
select 'ws-anexos', 'ws-anexos', false
where not exists (select 1 from storage.buckets where id = 'ws-anexos');

-- ============================================================
-- 12) LINKS EXTERNOS
-- ============================================================
-- 507 tarefas têm link na descrição (Drive é o campeão). Extrair pra tabela
-- própria dá a aba Arquivos e a validação de link morto — SEM tirar o link
-- da descrição, que continua sendo a fonte.
create table if not exists public.ws_links_externos (
  id             uuid primary key default gen_random_uuid(),
  tarefa_id      uuid references public.ws_tarefas(id) on delete cascade,
  comentario_id  uuid references public.ws_comentarios(id) on delete cascade,
  contexto_id    uuid references public.ws_contextos(id) on delete cascade,
  url            text not null,
  url_normalizada text not null,
  dominio        text not null,
  titulo         text,
  origem         text not null check (origem in
                   ('descricao','comentario','campo','anexo_externo','notas_contexto')),
  posicao        int,
  source_object_gid text,
  created_at     timestamptz not null default now()
);

create index if not exists ws_links_tarefa_idx on public.ws_links_externos (tarefa_id);
create index if not exists ws_links_dominio_idx on public.ws_links_externos (dominio);
-- Dedupe por representação, não por ocorrência textual: o mesmo link citado
-- duas vezes na mesma descrição é uma linha só.
create unique index if not exists ws_links_dedupe_idx
  on public.ws_links_externos (coalesce(tarefa_id,     '00000000-0000-0000-0000-000000000000'::uuid),
                               coalesce(comentario_id, '00000000-0000-0000-0000-000000000000'::uuid),
                               coalesce(contexto_id,   '00000000-0000-0000-0000-000000000000'::uuid),
                               url_normalizada, origem);

-- ============================================================
-- 13) updated_at nas tabelas novas que têm
-- ============================================================
drop trigger if exists ws_campos_definicoes_touch on public.ws_campos_definicoes;
create trigger ws_campos_definicoes_touch before update on public.ws_campos_definicoes
  for each row execute function public.ws_touch_updated_at();

drop trigger if exists ws_campos_valores_touch on public.ws_campos_valores;
create trigger ws_campos_valores_touch before update on public.ws_campos_valores
  for each row execute function public.ws_touch_updated_at();

-- ============================================================
-- 14) RLS — tudo fechado, staging mais ainda
-- ============================================================
alter table public.ws_import_execucoes      enable row level security;
alter table public.ws_import_raw            enable row level security;
alter table public.ws_import_mapeamentos    enable row level security;
alter table public.ws_import_erros          enable row level security;
alter table public.ws_identidades_externas  enable row level security;
alter table public.ws_contexto_membros      enable row level security;
alter table public.ws_secoes                enable row level security;
alter table public.ws_seguidores_externos   enable row level security;
alter table public.ws_campos_definicoes     enable row level security;
alter table public.ws_campos_opcoes         enable row level security;
alter table public.ws_campos_valores        enable row level security;
alter table public.ws_campos_valor_opcoes   enable row level security;
alter table public.ws_campos_valor_pessoas  enable row level security;
alter table public.ws_anexos                enable row level security;
alter table public.ws_links_externos        enable row level security;

-- Nenhuma policy = só service_role. O staging NUNCA vai pro browser, nem
-- indiretamente: ws_realtime_ping continua sendo a única exceção do módulo.

-- ============================================================
-- 15) ÍNDICES DE RECONCILIAÇÃO
-- ============================================================
-- A reconciliação conta por GID; sem estes, cada contagem viraria seq scan.
create index if not exists ws_tarefas_source_criado_idx
  on public.ws_tarefas (source_criado_em) where source_gid is not null;
create index if not exists ws_tarefa_contextos_secao_idx
  on public.ws_tarefa_contextos (secao_id) where secao_id is not null;
