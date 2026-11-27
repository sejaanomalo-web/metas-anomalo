-- =============================================================================
-- Funil Estáticos Meta — 3º canal comercial (ao lado de Cal.com e ATIVO).
--
-- Pré-requisitos (nesta ordem): 20261125_reunioes_nativas.sql e
-- 20261126_reunioes_nativas_intervalo_slots.sql. Não apaga nem reescreve dados.
--
-- Decisões:
-- * A agenda NÃO é nova: o funil é um canal de reunioes_canais_nativos
--   (chave 'estaticos_meta') e reserva em reunioes_agendamentos/ws_tarefas com
--   o MESMO advisory lock por responsável e a MESMA constraint EXCLUDE
--   (reunioes_nativas_sem_sobreposicao) do canal ATIVO. Exclusividade é
--   compartilhada entre os canais nativos; frente ao Cal.com vale a mesma
--   verificação operacional exigida para ativar o canal ATIVO.
-- * As funções do ATIVO (reunioes_nativas_reservar) NÃO são alteradas.
--   reunioes_nativas_gerir só passa a procurar o canal da própria reserva
--   (null = 'ativo', comportamento idêntico ao anterior).
-- * Tudo é service_role (RLS ligada, sem policies) — o funil público fala só
--   com rotas do servidor.
-- =============================================================================

-- 1) Canal nativo adicional -------------------------------------------------
do $$
declare v_nome text;
begin
  for v_nome in select conname from pg_constraint
    where conrelid = 'public.reunioes_canais_nativos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%chave%' and pg_get_constraintdef(oid) ilike '%ativo''%'
      and conname <> 'nativo_ativacao_segura'
  loop
    execute format('alter table public.reunioes_canais_nativos drop constraint %I', v_nome);
  end loop;
end $$;
alter table public.reunioes_canais_nativos drop constraint if exists reunioes_canais_nativos_chave_permitida;
alter table public.reunioes_canais_nativos add constraint reunioes_canais_nativos_chave_permitida
  check (chave in ('ativo','estaticos_meta'));
-- Dois canais podem apontar para o mesmo tipo de reunião (ex.: diagnóstico).
alter table public.reunioes_canais_nativos drop constraint if exists reunioes_canais_nativos_tipo_id_key;

alter table public.reunioes_agendamentos add column if not exists canal_nativo text
  check (canal_nativo is null or canal_nativo in ('ativo','estaticos_meta'));
comment on column public.reunioes_agendamentos.canal_nativo is
  'Canal nativo que criou a reserva. NULL em reservas antigas = ativo.';

-- 2) Configuração, versões e criativos -------------------------------------
create table if not exists public.funil_config (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave ~ '^[a-z0-9_]{2,40}$'),
  nome text not null check (length(btrim(nome)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  -- Slugs antigos continuam funcionando (redirect 308) para não quebrar anúncios.
  slugs_anteriores text[] not null default '{}',
  ativo boolean not null default false,
  canal_chave text not null default 'estaticos_meta' check (canal_chave in ('estaticos_meta')),
  versao_publicada_id uuid,
  privacidade_url text check (privacidade_url is null or (privacidade_url ~ '^https://[^\s<>"]{4,}$' and length(privacidade_url) <= 300)),
  consentimento_modo text not null default 'opt_in' check (consentimento_modo in ('opt_in','informativo')),
  pixel_id text check (pixel_id is null or pixel_id ~ '^[0-9]{5,20}$'),
  capi_ativo boolean not null default false,
  meta_test_event_code text check (meta_test_event_code is null or meta_test_event_code ~ '^[A-Za-z0-9]{3,40}$'),
  eventos_meta jsonb not null default '{"PageView":true,"Lead":true,"Schedule":true}'::jsonb,
  abandono_minutos int not null default 30 check (abandono_minutos between 5 and 1440),
  followup_ativo boolean not null default false,
  followup_minutos int not null default 60 check (followup_minutos between 10 and 10080),
  notificar_novo_lead boolean not null default true,
  crm_usuario_id uuid references public.usuarios(id) on delete set null,
  crm_empresa_slug text,
  qualificacao jsonb not null default '{"ativo":false,"alta":6,"media":3}'::jsonb,
  retencao_dias int not null default 730 check (retencao_dias between 90 and 3650),
  atualizado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Publicação real exige política de privacidade (LGPD).
  constraint funil_ativo_exige_privacidade check (not ativo or privacidade_url is not null)
);
alter table public.funil_config enable row level security;

create table if not exists public.funil_versoes (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.funil_config(id) on delete cascade,
  numero int not null check (numero > 0),
  status text not null check (status in ('rascunho','publicada','arquivada')),
  definicao jsonb not null check (jsonb_typeof(definicao) = 'object' and octet_length(definicao::text) < 32768),
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  publicada_em timestamptz,
  unique (funil_id, numero)
);
create unique index if not exists funil_versoes_um_rascunho on public.funil_versoes (funil_id) where status = 'rascunho';
alter table public.funil_versoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'funil_config_versao_publicada_fk') then
    alter table public.funil_config add constraint funil_config_versao_publicada_fk
      foreign key (versao_publicada_id) references public.funil_versoes(id) on delete set null;
  end if;
end $$;

create table if not exists public.funil_criativos (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.funil_config(id) on delete cascade,
  codigo text not null check (codigo ~ '^[A-Z0-9_-]{1,20}$'),
  nome text not null check (length(btrim(nome)) between 1 and 120),
  hipotese text check (hipotese is null or length(hipotese) <= 1000),
  miniatura_url text check (miniatura_url is null or (miniatura_url ~ '^https://[^\s<>"]{4,}$' and length(miniatura_url) <= 500)),
  -- IDs da Meta são strings (evita perda de precisão de inteiros de 64 bits).
  meta_ad_id text check (meta_ad_id is null or meta_ad_id ~ '^[0-9]{5,25}$'),
  status text not null default 'ativo' check (status in ('ativo','pausado','encerrado')),
  inicio_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funil_id, codigo)
);
create unique index if not exists funil_criativos_ad_unico on public.funil_criativos (funil_id, meta_ad_id) where meta_ad_id is not null;
alter table public.funil_criativos enable row level security;

-- 3) Leads, sessões, eventos -----------------------------------------------
create table if not exists public.funil_leads (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.funil_config(id) on delete cascade,
  ambiente text not null default 'producao' check (ambiente in ('producao','teste')),
  nome text not null check (length(nome) between 2 and 120),
  telefone_e164 text not null check (telefone_e164 ~ '^\+55[1-9][0-9][2-9][0-9]{7,8}$'),
  email text check (email is null or (length(email) <= 160 and email ~ '^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$')),
  instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  primeira_sessao_id uuid,
  -- Atribuição de primeiro e último toque (nunca sobrescreve o primeiro).
  first_touch jsonb not null default '{}'::jsonb,
  last_touch jsonb not null default '{}'::jsonb,
  respostas jsonb not null default '{}'::jsonb,
  interesse text check (interesse is null or interesse in ('marketing','sistema','ambos')),
  pontuacao int,
  qualificacao text not null default 'nao_avaliado'
    check (qualificacao in ('nao_avaliado','baixa','media','alta','qualificado','nao_qualificado')),
  qualificacao_manual boolean not null default false,
  status_comercial text not null default 'lead_recebido' check (status_comercial in (
    'lead_recebido','aguardando_contato','em_qualificacao','nao_agendou','reuniao_agendada',
    'reuniao_realizada','nao_compareceu','reagendamento','proposta_enviada','em_negociacao',
    'venda_realizada','lead_perdido')),
  valor_venda numeric check (valor_venda is null or valor_venda >= 0),
  responsavel_id uuid references public.usuarios(id) on delete set null,
  crm_lead_id uuid,
  followup_tarefa_id uuid references public.ws_tarefas(id) on delete set null,
  consentimento jsonb not null default '{}'::jsonb,
  sessoes int not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  ultima_interacao_em timestamptz not null default now(),
  unique (funil_id, ambiente, telefone_e164)
);
create index if not exists funil_leads_criado_idx on public.funil_leads (funil_id, criado_em desc);
alter table public.funil_leads enable row level security;

create table if not exists public.funil_sessoes (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.funil_config(id) on delete cascade,
  versao_id uuid not null references public.funil_versoes(id),
  -- O cliente guarda id + segredo; o banco só o hash do segredo.
  segredo_hash text not null check (segredo_hash ~ '^[a-f0-9]{64}$'),
  ambiente text not null default 'producao' check (ambiente in ('producao','teste')),
  lead_id uuid references public.funil_leads(id) on delete set null,
  agendamento_id uuid references public.reunioes_agendamentos(id) on delete set null,
  estado text not null default 'aberta'
    check (estado in ('aberta','em_andamento','lead','horario_selecionado','agendada')),
  etapa_atual text not null default 'p1' check (etapa_atual ~ '^[a-z0-9_]{1,40}$'),
  perguntas_concluidas int not null default 0,
  respostas jsonb not null default '{}'::jsonb,
  respostas_em jsonb not null default '{}'::jsonb,
  atribuicao jsonb not null default '{}'::jsonb,
  canal_origem text not null default 'nao_identificado'
    check (canal_origem in ('meta_pago','outro_pago','organico','direto','nao_identificado')),
  criativo_id uuid references public.funil_criativos(id) on delete set null,
  fbp text check (fbp is null or fbp ~ '^fb\.[0-9]\.[0-9]{10,16}\.[0-9A-Za-z_-]{1,40}$'),
  fbc text check (fbc is null or (fbc ~ '^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_-]+$' and length(fbc) <= 560)),
  consentimento_marketing boolean,
  ip_hash text,
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  referer_host text check (referer_host is null or length(referer_host) <= 120),
  aberta_em timestamptz not null default now(),
  iniciada_em timestamptz,
  contato_visto_em timestamptz,
  contato_em timestamptz,
  agenda_vista_em timestamptz,
  sem_horarios_em timestamptz,
  horario_selecionado_em timestamptz,
  agendada_em timestamptz,
  ultima_interacao_em timestamptz not null default now(),
  -- Abandono é INFERIDO por inatividade e reversível se a sessão voltar.
  abandonada boolean not null default false,
  abandonada_em timestamptz,
  etapa_abandono text
);
create index if not exists funil_sessoes_periodo_idx on public.funil_sessoes (funil_id, aberta_em desc);
create index if not exists funil_sessoes_inativas_idx on public.funil_sessoes (ultima_interacao_em)
  where not abandonada and estado <> 'agendada';
create index if not exists funil_sessoes_lead_idx on public.funil_sessoes (lead_id);
create index if not exists funil_sessoes_agendamento_idx on public.funil_sessoes (agendamento_id);
alter table public.funil_sessoes enable row level security;

create table if not exists public.funil_eventos (
  id bigint generated always as identity primary key,
  funil_id uuid not null references public.funil_config(id) on delete cascade,
  sessao_id uuid references public.funil_sessoes(id) on delete cascade,
  lead_id uuid references public.funil_leads(id) on delete set null,
  eid uuid not null,
  evento text not null check (evento ~ '^[a-z_]{3,40}$'),
  etapa text check (etapa is null or etapa ~ '^[a-z0-9_]{1,40}$'),
  -- Sem PII: só ids de pergunta/opção, códigos de erro e afins.
  dados jsonb not null default '{}'::jsonb check (octet_length(dados::text) <= 1024),
  ambiente text not null default 'producao',
  ocorrido_em timestamptz not null default now(),
  unique (sessao_id, eid)
);
create index if not exists funil_eventos_periodo_idx on public.funil_eventos (funil_id, ocorrido_em desc);
alter table public.funil_eventos enable row level security;

-- 4) Conversões Meta (fila durável para a Conversions API) ------------------
create table if not exists public.funil_conversoes (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.funil_config(id) on delete cascade,
  sessao_id uuid references public.funil_sessoes(id) on delete set null,
  lead_id uuid references public.funil_leads(id) on delete set null,
  agendamento_id uuid references public.reunioes_agendamentos(id) on delete set null,
  evento text not null check (evento ~ '^[A-Za-z]{2,40}$'),
  -- Estável por fato de negócio: lead.<lead_id>, schedule.<agendamento_id>.
  event_id text not null unique check (event_id ~ '^[a-z]+\.[0-9a-f-]{36}$'),
  event_time timestamptz not null,
  ambiente text not null check (ambiente in ('producao','teste')),
  status text not null default 'pendente' check (status in ('pendente','enviado','erro','ignorado')),
  motivo text,
  tentativas int not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  -- IP/UA ficam só até o envio (necessários à correspondência da CAPI).
  contexto jsonb not null default '{}'::jsonb,
  resposta jsonb,
  ultimo_erro text,
  enviado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists funil_conversoes_fila_idx on public.funil_conversoes (proxima_tentativa_em) where status in ('pendente','erro');
alter table public.funil_conversoes enable row level security;

-- 5) Investimento (manual; o automático vem de dados_diarios_ad) ------------
create table if not exists public.funil_investimentos (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.funil_config(id) on delete cascade,
  criativo_id uuid references public.funil_criativos(id) on delete cascade,
  data date not null,
  investimento numeric not null check (investimento >= 0),
  impressoes int check (impressoes is null or impressoes >= 0),
  alcance int check (alcance is null or alcance >= 0),
  cliques_link int check (cliques_link is null or cliques_link >= 0),
  observacao text check (observacao is null or length(observacao) <= 300),
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique nulls not distinct (funil_id, criativo_id, data)
);
alter table public.funil_investimentos enable row level security;

create table if not exists public.funil_leads_historico (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.funil_leads(id) on delete cascade,
  campo text not null check (campo in ('qualificacao','status_comercial','valor_venda')),
  de text,
  para text,
  ator_id uuid references public.usuarios(id) on delete set null,
  em timestamptz not null default now()
);
create index if not exists funil_leads_historico_lead_idx on public.funil_leads_historico (lead_id, em desc);
alter table public.funil_leads_historico enable row level security;

-- 6) Configuração inicial (inativa até a equipe revisar) --------------------
insert into public.funil_config (chave, nome, slug)
values ('estaticos_meta', 'Funil Estáticos Meta', 'estaticos-meta')
on conflict (chave) do nothing;

insert into public.funil_versoes (funil_id, numero, status, definicao, publicada_em)
select f.id, 1, 'publicada', $json${
  "avanco_automatico": true,
  "textos": {
    "titulo": "Marketing e tecnologia para corretores de imóveis.",
    "subtitulo": "Responda 3 perguntas para conhecermos sua operação e encontre um horário para conversar com nossa equipe.",
    "contato_titulo": "Vamos conhecer você.",
    "contato_cta": "Ver horários disponíveis",
    "agenda_titulo": "Escolha o melhor horário para conversarmos.",
    "agenda_subtitulo": "Vamos entender sua operação imobiliária e apresentar as soluções que fazem sentido para você.",
    "sem_horarios": "No momento, não encontramos horários disponíveis. Seu contato já foi registrado e nossa equipe poderá entrar em contato para combinar a reunião.",
    "confirmacao_titulo": "Reunião agendada!",
    "confirmacao_texto": "Seu horário está reservado. Vamos conversar sobre sua operação imobiliária e apresentar as soluções mais adequadas ao seu momento.",
    "inativo": "Este formulário não está disponível no momento."
  },
  "contato": { "email": "oculto", "instagram": "oculto" },
  "perguntas": [
    { "id": "perfil", "texto": "Como você atua no mercado imobiliário?",
      "objetivo": "Identificar o perfil profissional e o contexto comercial do lead.",
      "opcoes": [
        { "id": "autonomo", "texto": "Corretor de imóveis autônomo.", "pontos": 0 },
        { "id": "vinculado", "texto": "Corretor vinculado a uma imobiliária.", "pontos": 0 },
        { "id": "gestor", "texto": "Proprietário ou gestor de imobiliária.", "pontos": 0 },
        { "id": "iniciante", "texto": "Estou começando no mercado imobiliário.", "pontos": 0 },
        { "id": "nao_atua", "texto": "Ainda não atuo no mercado imobiliário.", "pontos": 0 }
      ] },
    { "id": "interesse", "texto": "O que você gostaria de melhorar na sua operação?",
      "objetivo": "Identificar o interesse principal e direcionar a abordagem para ANÔMALO, ATIVO ou ambas.",
      "opcoes": [
        { "id": "compradores", "texto": "Atrair mais potenciais compradores.", "pontos": 0, "interesse": "marketing" },
        { "id": "conteudo", "texto": "Melhorar a produção de conteúdo e divulgação dos imóveis.", "pontos": 0, "interesse": "marketing" },
        { "id": "organizacao", "texto": "Organizar meus imóveis e atendimentos.", "pontos": 0, "interesse": "sistema" },
        { "id": "sistema", "texto": "Ter um sistema personalizado para minha operação.", "pontos": 0, "interesse": "sistema" },
        { "id": "ambos", "texto": "Melhorar meu marketing e minha organização comercial.", "pontos": 0, "interesse": "ambos" }
      ] },
    { "id": "investimento", "texto": "Atualmente, como você investe em marketing imobiliário?",
      "objetivo": "Entender a maturidade comercial e de marketing do lead (não é prova de capacidade financeira).",
      "opcoes": [
        { "id": "nao_investe", "texto": "Ainda não invisto em marketing.", "pontos": 0 },
        { "id": "proprio", "texto": "Faço meu marketing por conta própria.", "pontos": 0 },
        { "id": "anuncios", "texto": "Já invisto em anúncios pagos.", "pontos": 0 },
        { "id": "agencia", "texto": "Já contrato profissionais ou uma agência.", "pontos": 0 }
      ] }
  ]
}$json$::jsonb, now()
from public.funil_config f
where f.chave = 'estaticos_meta'
  and not exists (select 1 from public.funil_versoes v where v.funil_id = f.id);

update public.funil_config f set versao_publicada_id = v.id
from public.funil_versoes v
where f.chave = 'estaticos_meta' and v.funil_id = f.id and v.numero = 1 and f.versao_publicada_id is null;

-- 7) Captura do lead (antes da agenda), atômica e idempotente ---------------
create or replace function public.funil_capturar_lead(
  p_sessao uuid, p_segredo_hash text, p_nome text, p_telefone text, p_email text,
  p_instagram text, p_interesse text, p_pontuacao int, p_qualificacao text,
  p_consentimento jsonb, p_contexto jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s public.funil_sessoes%rowtype;
  v_f public.funil_config%rowtype;
  v_lead uuid;
  v_novo boolean;
  v_event_id text;
  v_status text := 'pendente';
  v_motivo text;
  v_resp uuid;
  v_notif public.notificacoes.id%type;
begin
  if p_nome is null or length(p_nome) not between 2 and 120 or p_nome ~ '[<>[:cntrl:]]'
     or p_telefone is null or p_telefone !~ '^\+55[1-9][0-9][2-9][0-9]{7,8}$'
     or p_segredo_hash !~ '^[a-f0-9]{64}$'
     or (p_interesse is not null and p_interesse not in ('marketing','sistema','ambos'))
     or p_consentimento is null or jsonb_typeof(p_consentimento) <> 'object'
     or p_contexto is null or jsonb_typeof(p_contexto) <> 'object' or octet_length(p_contexto::text) > 2048 then
    return jsonb_build_object('code','INVALID_INPUT');
  end if;
  select * into v_s from public.funil_sessoes where id = p_sessao for update;
  if not found or v_s.segredo_hash <> p_segredo_hash then return jsonb_build_object('code','SESSION_INVALID'); end if;
  select * into v_f from public.funil_config where id = v_s.funil_id;

  insert into public.funil_leads as l (funil_id, ambiente, nome, telefone_e164, email, instagram, primeira_sessao_id,
      first_touch, last_touch, respostas, interesse, pontuacao, qualificacao, consentimento)
  values (v_s.funil_id, v_s.ambiente, p_nome, p_telefone, p_email, p_instagram, v_s.id,
      v_s.atribuicao, v_s.atribuicao, v_s.respostas, p_interesse, p_pontuacao, coalesce(p_qualificacao,'nao_avaliado'), p_consentimento)
  on conflict (funil_id, ambiente, telefone_e164) do update set
      nome = excluded.nome,
      email = coalesce(excluded.email, l.email),
      instagram = coalesce(excluded.instagram, l.instagram),
      last_touch = case when excluded.last_touch = '{}'::jsonb then l.last_touch else excluded.last_touch end,
      respostas = excluded.respostas,
      interesse = coalesce(excluded.interesse, l.interesse),
      pontuacao = case when l.qualificacao_manual then l.pontuacao else excluded.pontuacao end,
      qualificacao = case when l.qualificacao_manual then l.qualificacao else excluded.qualificacao end,
      consentimento = excluded.consentimento,
      sessoes = l.sessoes + case when v_s.lead_id is distinct from l.id then 1 else 0 end,
      atualizado_em = now(), ultima_interacao_em = now()
  returning id, (xmax = 0) into v_lead, v_novo;

  update public.funil_sessoes set lead_id = v_lead,
      estado = case when estado in ('aberta','em_andamento') then 'lead' else estado end,
      contato_em = coalesce(contato_em, now()), ultima_interacao_em = now(),
      abandonada = false, abandonada_em = null, etapa_abandono = null,
      consentimento_marketing = coalesce((p_consentimento->>'marketing')::boolean, consentimento_marketing)
    where id = v_s.id;

  insert into public.funil_eventos (funil_id, sessao_id, lead_id, eid, evento, etapa, ambiente)
    values (v_s.funil_id, v_s.id, v_lead, md5('lead_created:' || v_s.id)::uuid, 'lead_created', 'contato', v_s.ambiente)
    on conflict (sessao_id, eid) do nothing;

  -- Uma conversão Lead por contato (não por tentativa nem por sessão).
  v_event_id := 'lead.' || v_lead;
  if not coalesce((v_f.eventos_meta->>'Lead')::boolean, false) then v_status := 'ignorado'; v_motivo := 'evento desativado';
  elsif not v_f.capi_ativo or v_f.pixel_id is null then v_status := 'ignorado'; v_motivo := 'CAPI não configurada';
  elsif v_f.consentimento_modo = 'opt_in' and coalesce((p_consentimento->>'marketing')::boolean, false) is not true then
    v_status := 'ignorado'; v_motivo := 'sem consentimento de marketing';
  end if;
  insert into public.funil_conversoes (funil_id, sessao_id, lead_id, evento, event_id, event_time, ambiente, status, motivo, contexto)
    values (v_s.funil_id, v_s.id, v_lead, 'Lead', v_event_id, now(), v_s.ambiente, v_status, v_motivo,
      case when v_status = 'pendente' then p_contexto else '{}'::jsonb end)
    on conflict (event_id) do nothing;

  if v_novo and v_f.notificar_novo_lead then
    select coalesce(d.responsavel_id, t.responsavel_id) into v_resp
      from public.reunioes_canais_nativos c
      join public.reunioes_tipos t on t.id = c.tipo_id
      join public.reunioes_disponibilidades d on d.id = c.disponibilidade_id
      where c.chave = v_f.canal_chave;
    insert into public.notificacoes(tipo, empresa, titulo, mensagem, payload, papel_alvo)
      values ('ws_tarefa', null,
        case when v_s.ambiente = 'teste' then '[Teste] ' else '' end || 'Novo lead — ' || v_f.nome,
        'Um corretor respondeu o formulário. Abra o lead para ver respostas e origem.',
        jsonb_build_object('url','/dashboard/workspace/funis/' || v_f.slug || '?aba=leads&lead=' || v_lead),
        array['admin','comercial'])
      returning id into v_notif;
    insert into public.notificacoes_usuario(notificacao_id, usuario_id)
      select v_notif, u from (select distinct unnest(array[v_resp, v_f.crm_usuario_id]) u) x
      where u is not null and coalesce((select ws_tarefa from public.preferencias_notificacao where usuario_id = u), true);
  end if;

  return jsonb_build_object('leadId', v_lead, 'novo', v_novo, 'eventId', v_event_id,
    'enviarPixel', v_status <> 'ignorado' or v_motivo = 'CAPI não configurada');
end $$;
revoke all on function public.funil_capturar_lead(uuid,text,text,text,text,text,text,int,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.funil_capturar_lead(uuid,text,text,text,text,text,text,int,text,jsonb,jsonb) to service_role;

-- 8) Reserva pelo funil -------------------------------------------------------
-- Mesmas regras críticas de reunioes_nativas_reservar (repetidas DENTRO da
-- transação), mesmo lock e mesma constraint de exclusão. Nome e WhatsApp vêm
-- do lead já salvo, nunca do navegador nesta etapa.
create or replace function public.funil_reservar(
  p_sessao uuid, p_segredo_hash text, p_inicio timestamptz, p_chave uuid, p_contexto jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s public.funil_sessoes%rowtype;
  v_f public.funil_config%rowtype;
  v_l public.funil_leads%rowtype;
  v_c public.reunioes_canais_nativos%rowtype;
  v_t public.reunioes_tipos%rowtype;
  v_d public.reunioes_disponibilidades%rowtype;
  v_ant public.reunioes_agendamentos%rowtype;
  v_cr public.funil_criativos%rowtype;
  v_resp uuid;
  v_id uuid := gen_random_uuid();
  v_tarefa uuid;
  v_fim timestamptz;
  v_local timestamp;
  v_data date;
  v_dia int;
  v_janelas jsonb;
  v_excecao jsonb;
  v_periodo jsonb;
  v_passo int;
  v_hash text;
  v_notif public.notificacoes.id%type;
  v_descricao text;
  v_respostas text := '';
  v_q jsonb;
  v_def jsonb;
  v_status text := 'pendente';
  v_motivo text;
  v_a jsonb;
  v_prefixo text := '';
begin
  if p_sessao is null or p_segredo_hash !~ '^[a-f0-9]{64}$' or p_inicio is null or p_chave is null
     or p_contexto is null or jsonb_typeof(p_contexto) <> 'object' or octet_length(p_contexto::text) > 2048 then
    return jsonb_build_object('code','INVALID_INPUT');
  end if;
  select * into v_s from public.funil_sessoes where id = p_sessao;
  if not found or v_s.segredo_hash <> p_segredo_hash then return jsonb_build_object('code','SESSION_INVALID'); end if;
  if v_s.lead_id is null then return jsonb_build_object('code','LEAD_REQUIRED'); end if;
  select * into v_f from public.funil_config where id = v_s.funil_id;
  select * into v_l from public.funil_leads where id = v_s.lead_id;
  v_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(p_sessao::text || '|' || p_inicio::text, 'UTF8')), 'hex');

  -- Reenvio da mesma tentativa.
  select * into v_ant from public.reunioes_agendamentos where provedor = 'nativo' and idempotency_key = p_chave;
  if found then
    if v_ant.request_hash <> v_hash then return jsonb_build_object('code','IDEMPOTENCY_MISMATCH'); end if;
    return jsonb_build_object('status','reserved','bookingId',v_ant.id,'startsAt',v_ant.inicio,'endsAt',v_ant.fim,
      'eventId','schedule.' || v_ant.id,'timezone','America/Sao_Paulo');
  end if;
  -- O mesmo lead não acumula duas reuniões futuras por este funil.
  select a.* into v_ant from public.reunioes_agendamentos a
    join public.funil_sessoes s on s.agendamento_id = a.id
    where s.lead_id = v_l.id and a.status in ('solicitada','confirmada') and a.fim > now()
    order by a.inicio limit 1;
  if found then
    return jsonb_build_object('status','existing','bookingId',v_ant.id,'startsAt',v_ant.inicio,'endsAt',v_ant.fim,
      'eventId','schedule.' || v_ant.id,'timezone','America/Sao_Paulo');
  end if;

  select * into v_c from public.reunioes_canais_nativos where chave = v_f.canal_chave and ativo;
  if not found or (not v_f.ativo and v_s.ambiente <> 'teste') then return jsonb_build_object('code','CONFIG_UNAVAILABLE'); end if;
  select * into v_t from public.reunioes_tipos where id = v_c.tipo_id and ativo;
  select * into v_d from public.reunioes_disponibilidades where id = v_c.disponibilidade_id;
  v_resp := coalesce(v_d.responsavel_id, v_t.responsavel_id);
  if v_t.id is null or v_d.id is null or v_d.fuso <> 'America/Sao_Paulo' or v_d.calcom_schedule_id is not null or not v_d.modo_nativo
     or v_resp is null
     or (v_d.responsavel_id is not null and v_t.responsavel_id is not null and v_d.responsavel_id <> v_t.responsavel_id)
     or not exists (select 1 from public.usuarios where id = v_resp and ativo) then
    return jsonb_build_object('code','CONFIG_UNAVAILABLE');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_resp::text, 0));
  select * into v_ant from public.reunioes_agendamentos where provedor = 'nativo' and idempotency_key = p_chave;
  if found then
    if v_ant.request_hash <> v_hash then return jsonb_build_object('code','IDEMPOTENCY_MISMATCH'); end if;
    return jsonb_build_object('status','reserved','bookingId',v_ant.id,'startsAt',v_ant.inicio,'endsAt',v_ant.fim,
      'eventId','schedule.' || v_ant.id,'timezone','America/Sao_Paulo');
  end if;

  v_fim := p_inicio + make_interval(mins => v_t.duracao_min);
  v_passo := case when v_t.intervalo_minutos between 5 and 480 then v_t.intervalo_minutos else v_t.duracao_min end;
  v_local := p_inicio at time zone 'America/Sao_Paulo';
  v_data := v_local::date;
  v_dia := extract(dow from v_data)::int;
  if p_inicio < now() + make_interval(hours => v_t.antecedencia_min_horas)
     or v_data < (now() at time zone 'America/Sao_Paulo')::date
     or v_data >= (now() at time zone 'America/Sao_Paulo')::date + v_t.horizonte_dias
     or (v_fim at time zone 'America/Sao_Paulo')::date <> v_data
     or extract(second from v_local) <> 0 then
    return jsonb_build_object('code','SLOT_UNAVAILABLE');
  end if;
  v_janelas := v_d.janelas;
  select x into v_periodo from jsonb_array_elements(v_d.periodos) x
    where v_data between (x->>'de')::date and (x->>'ate')::date limit 1;
  if v_periodo is not null then v_janelas := v_periodo->'janelas'; end if;
  select x into v_excecao from jsonb_array_elements(v_d.excecoes) x where x->>'data' = v_data::text limit 1;
  if v_excecao is not null then
    v_janelas := (select coalesce(jsonb_agg(x || jsonb_build_object('dia', v_dia)), '[]'::jsonb)
      from jsonb_array_elements(v_excecao->'janelas') x);
  end if;
  if not exists (select 1 from jsonb_array_elements(v_janelas) x
    where (x->>'dia')::int = v_dia and v_local::time >= (x->>'inicio')::time
      and (v_fim at time zone 'America/Sao_Paulo')::time <= (x->>'fim')::time
      and floor(extract(epoch from (v_local::time - (x->>'inicio')::time)) / 60)::int % v_passo = 0) then
    return jsonb_build_object('code','SLOT_UNAVAILABLE');
  end if;
  if exists (select 1 from jsonb_array_elements(v_d.bloqueios) x where v_data between (x->>'de')::date and (x->>'ate')::date)
     or exists (select 1 from public.reunioes_agendamentos a
      where (a.responsavel_id = v_resp or a.responsavel_id is null)
        and a.status in ('solicitada','confirmada') and a.inicio < v_fim + make_interval(mins => v_t.intervalo_min)
        and a.fim + make_interval(mins => v_t.intervalo_min) > p_inicio)
     or exists (select 1 from public.reunioes_agendamentos a
      where (a.responsavel_id = v_resp or a.responsavel_id is null)
        and a.status in ('solicitada','confirmada') and (a.inicio is null or a.fim is null))
     or exists (select 1 from public.ws_tarefa_bloqueios b join public.ws_tarefas w on w.id = b.tarefa_id
      where w.prazo_em is not null and w.prazo_hora is not null and w.arquivada_em is null
        and w.excluida_em is null and w.concluida_em is null
        and (w.responsavel_id = v_resp or w.responsavel_id is null
          or exists (select 1 from public.ws_tarefa_responsaveis r where r.tarefa_id = w.id and r.usuario_id = v_resp))
        and (w.prazo_em + w.prazo_hora) at time zone 'America/Sao_Paulo' < v_fim
        and ((w.prazo_em + w.prazo_hora) at time zone 'America/Sao_Paulo') + make_interval(mins => b.duracao_min) > p_inicio)
     or (v_t.limite_diario is not null and (select count(*) from public.reunioes_agendamentos a
      where a.tipo_id = v_t.id and a.status in ('solicitada','confirmada')
        and (a.inicio at time zone 'America/Sao_Paulo')::date = v_data) >= v_t.limite_diario) then
    return jsonb_build_object('code','SLOT_UNAVAILABLE');
  end if;

  -- Descrição interna (tarefa do Workspace, não vai a calendário externo).
  select definicao into v_def from public.funil_versoes where id = v_s.versao_id;
  for v_q in select * from jsonb_array_elements(coalesce(v_def->'perguntas','[]'::jsonb)) loop
    v_respostas := v_respostas || E'\n- ' || (v_q->>'texto') || ' **' || coalesce((
      select o->>'texto' from jsonb_array_elements(v_q->'opcoes') o where o->>'id' = v_s.respostas->>(v_q->>'id') limit 1), '—') || '**';
  end loop;
  v_a := v_s.atribuicao;
  if v_s.criativo_id is not null then select * into v_cr from public.funil_criativos where id = v_s.criativo_id; end if;
  if v_s.ambiente = 'teste' then v_prefixo := '[TESTE] '; end if;
  v_descricao := '**Tipo:** ' || v_t.nome ||
    E'\n**Participante:** ' || v_l.nome || E'\n**WhatsApp:** ' || v_l.telefone_e164 ||
    E'\n**Início:** ' || to_char(v_local, 'DD/MM/YYYY "às" HH24:MI') || E' (Brasília)' ||
    E'\n**Fim:** ' || to_char(v_fim at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') || E' (Brasília)' ||
    E'\n**Responsável:** ' || coalesce((select nome from public.usuarios where id = v_resp), '—') ||
    E'\n**Local:** A combinar pelo WhatsApp' ||
    E'\n**Origem:** ' || v_f.nome || case when v_s.ambiente = 'teste' then ' (TESTE)' else '' end ||
    E'\n**Interesse principal:** ' || coalesce(v_l.interesse, '—') ||
    E'\n**Respostas:**' || v_respostas ||
    E'\n**Criativo:** ' || coalesce(v_cr.codigo || ' — ' || v_cr.nome, 'Não identificado') ||
    E'\n**Campanha / conjunto / anúncio:** ' || coalesce(left(v_a->>'campaign_id', 40), left(v_a->>'utm_campaign', 80), '—') ||
      ' / ' || coalesce(left(v_a->>'adset_id', 40), left(v_a->>'utm_term', 80), '—') ||
      ' / ' || coalesce(left(v_a->>'ad_id', 40), left(v_a->>'utm_content', 80), '—') ||
    E'\n**Posicionamento:** ' || coalesce(left(v_a->>'placement', 60), '—') ||
    E'\n**Entrada no funil:** ' || to_char(v_l.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') ||
    E'\n**Status:** Horário reservado — aguardando confirmação pelo WhatsApp' ||
    E'\n**Link de contato:** https://wa.me/' || substring(v_l.telefone_e164 from 2);

  insert into public.ws_tarefas (titulo, descricao, prazo_em, prazo_hora, prioridade, criado_por, source_gid)
    values (v_prefixo || to_char(v_local, 'HH24:MI') || ' - Reunião com ' || v_l.nome || ' (a confirmar)', v_descricao,
      v_data, v_local::time, 'normal', null, 'nativo:' || v_id)
    returning id into v_tarefa;
  insert into public.ws_tarefa_responsaveis(tarefa_id, usuario_id, ordem) values (v_tarefa, v_resp, 0);
  insert into public.ws_seguidores(tarefa_id, usuario_id) values (v_tarefa, v_resp);
  if v_t.contexto_id is not null then
    insert into public.ws_tarefa_contextos(tarefa_id, contexto_id) values (v_tarefa, v_t.contexto_id);
  end if;
  insert into public.reunioes_agendamentos
    (id, provedor, booking_uid, tipo_id, tarefa_id, responsavel_id, participante_nome, participante_telefone,
     participante_fuso, inicio, fim, status, local_rotulo, origem_comercial, descricao_gerada,
     idempotency_key, request_hash, atribuicao, confirmacao_comercial, canal_nativo)
    values (v_id, 'nativo', v_id::text, v_t.id, v_tarefa, v_resp, v_l.nome, v_l.telefone_e164,
      'America/Sao_Paulo', p_inicio, v_fim, 'solicitada', 'A combinar pelo WhatsApp', v_t.origem_comercial, v_descricao,
      p_chave, v_hash, v_a || jsonb_build_object('funil', v_f.chave, 'sessao_id', v_s.id), 'aguardando_whatsapp', v_f.canal_chave);
  insert into public.ws_atividade(tarefa_id, ator_id, evento, mudanca)
    values (v_tarefa, null, 'reuniao_nativa_reservada', jsonb_build_object('agendamento_id', v_id, 'canal', v_f.canal_chave));
  insert into public.ws_realtime_ping(tarefa_id, kind) values (v_tarefa, 'tarefa');
  insert into public.reunioes_sync_log(nivel, acao, mensagem, agendamento_id)
    values ('info', 'nativo_reserva', 'Horário reservado pelo ' || v_f.nome || '.', v_id);
  insert into public.notificacoes(tipo, empresa, titulo, mensagem, payload, papel_alvo)
    values ('ws_tarefa', null, v_prefixo || 'Novo diagnóstico agendado — ' || v_f.nome,
      'Reunião reservada para ' || to_char(v_local, 'DD/MM "às" HH24:MI') || '. Acesse a tarefa para confirmar pelo WhatsApp.',
      jsonb_build_object('tarefa_id', v_tarefa, 'url', '/dashboard/workspace/calendario?tarefa=' || v_tarefa), array['admin','comercial'])
    returning id into v_notif;
  insert into public.notificacoes_usuario(notificacao_id, usuario_id)
    select v_notif, v_resp
    where coalesce((select ws_tarefa from public.preferencias_notificacao where usuario_id = v_resp), true);

  update public.funil_sessoes set agendamento_id = v_id, estado = 'agendada',
      agendada_em = now(), ultima_interacao_em = now(), abandonada = false, abandonada_em = null, etapa_abandono = null
    where id = v_s.id;
  update public.funil_leads set responsavel_id = coalesce(responsavel_id, v_resp), atualizado_em = now(), ultima_interacao_em = now(),
      status_comercial = case when status_comercial in ('lead_recebido','aguardando_contato','em_qualificacao','nao_agendou','reagendamento','nao_compareceu')
        then 'reuniao_agendada' else status_comercial end
    where id = v_l.id;
  insert into public.funil_eventos (funil_id, sessao_id, lead_id, eid, evento, etapa, dados, ambiente)
    values (v_s.funil_id, v_s.id, v_l.id, md5('booking_confirmed:' || v_id)::uuid, 'booking_confirmed', 'agenda',
      jsonb_build_object('agendamento_id', v_id), v_s.ambiente)
    on conflict (sessao_id, eid) do nothing;

  if not coalesce((v_f.eventos_meta->>'Schedule')::boolean, false) then v_status := 'ignorado'; v_motivo := 'evento desativado';
  elsif not v_f.capi_ativo or v_f.pixel_id is null then v_status := 'ignorado'; v_motivo := 'CAPI não configurada';
  elsif v_f.consentimento_modo = 'opt_in' and v_s.consentimento_marketing is not true then
    v_status := 'ignorado'; v_motivo := 'sem consentimento de marketing';
  end if;
  insert into public.funil_conversoes (funil_id, sessao_id, lead_id, agendamento_id, evento, event_id, event_time, ambiente, status, motivo, contexto)
    values (v_s.funil_id, v_s.id, v_l.id, v_id, 'Schedule', 'schedule.' || v_id, now(), v_s.ambiente, v_status, v_motivo,
      case when v_status = 'pendente' then p_contexto else '{}'::jsonb end)
    on conflict (event_id) do nothing;

  return jsonb_build_object('status','reserved','bookingId',v_id,'startsAt',p_inicio,'endsAt',v_fim,
    'eventId','schedule.' || v_id,'timezone','America/Sao_Paulo',
    'enviarPixel', v_status <> 'ignorado' or v_motivo = 'CAPI não configurada');
exception when exclusion_violation or unique_violation then
  return jsonb_build_object('code','SLOT_UNAVAILABLE');
end $$;
revoke all on function public.funil_reservar(uuid,text,timestamptz,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.funil_reservar(uuid,text,timestamptz,uuid,jsonb) to service_role;

-- 9) Gestão interna: procura o canal da PRÓPRIA reserva ---------------------
-- Idêntica à versão de 20261126; a única mudança é a linha marcada (MUDANÇA).
create or replace function public.reunioes_nativas_gerir(
  p_id uuid, p_acao text, p_ator uuid, p_novo_inicio timestamptz default null
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_a public.reunioes_agendamentos%rowtype;
  v_t public.reunioes_tipos%rowtype;
  v_d public.reunioes_disponibilidades%rowtype;
  v_c public.reunioes_canais_nativos%rowtype;
  v_fim timestamptz;
  v_local timestamp;
  v_data date;
  v_dia int;
  v_janelas jsonb;
  v_extra text;
  v_passo int;
begin
  select * into v_a from public.reunioes_agendamentos where id = p_id and provedor = 'nativo' for update;
  if not found then return 'NOT_FOUND'; end if;
  if v_a.status not in ('solicitada','confirmada') then return 'ALREADY_CLOSED'; end if;
  if p_acao not in ('confirmar','cancelar','realizar','reagendar') then return 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a.responsavel_id::text,0));
  if p_acao = 'reagendar' then
    -- MUDANÇA: canal da reserva (NULL = 'ativo', como antes).
    select * into v_c from public.reunioes_canais_nativos where chave = coalesce(v_a.canal_nativo, 'ativo') and ativo;
    select * into v_t from public.reunioes_tipos where id = v_a.tipo_id and ativo;
    select * into v_d from public.reunioes_disponibilidades where id = v_c.disponibilidade_id;
    if v_c.id is null or v_t.id is null or v_d.id is null or v_d.fuso <> 'America/Sao_Paulo'
       or coalesce(v_d.responsavel_id,v_t.responsavel_id) <> v_a.responsavel_id then return 'CONFIG_UNAVAILABLE'; end if;
    v_fim := p_novo_inicio + make_interval(mins => v_t.duracao_min);
    v_passo := case when v_t.intervalo_minutos between 5 and 480 then v_t.intervalo_minutos else v_t.duracao_min end;
    v_local := p_novo_inicio at time zone 'America/Sao_Paulo';
    v_data := v_local::date;
    v_dia := extract(dow from v_data)::int;
    if p_novo_inicio is null or p_novo_inicio < now() + make_interval(hours => v_t.antecedencia_min_horas)
      or v_data < (now() at time zone 'America/Sao_Paulo')::date
      or v_data >= (now() at time zone 'America/Sao_Paulo')::date + v_t.horizonte_dias
      or (v_fim at time zone 'America/Sao_Paulo')::date <> v_data
      or extract(second from v_local) <> 0 then return 'SLOT_UNAVAILABLE'; end if;
    v_janelas := v_d.janelas;
    select x->'janelas' into v_janelas from jsonb_array_elements(v_d.periodos) x
      where v_data between (x->>'de')::date and (x->>'ate')::date limit 1;
    if v_janelas is null then v_janelas := v_d.janelas; end if;
    if exists (select 1 from jsonb_array_elements(v_d.excecoes) x where x->>'data' = v_data::text) then
      select coalesce(jsonb_agg(x || jsonb_build_object('dia',v_dia)),'[]'::jsonb) into v_janelas
        from jsonb_array_elements((select x->'janelas' from jsonb_array_elements(v_d.excecoes) x
          where x->>'data' = v_data::text limit 1)) x;
    end if;
    if not exists (select 1 from jsonb_array_elements(v_janelas) x where (x->>'dia')::int = v_dia
      and v_local::time >= (x->>'inicio')::time and (v_fim at time zone 'America/Sao_Paulo')::time <= (x->>'fim')::time
        and floor(extract(epoch from (v_local::time - (x->>'inicio')::time)) / 60)::int % v_passo = 0)
      or exists (select 1 from jsonb_array_elements(v_d.bloqueios) x where v_data between (x->>'de')::date and (x->>'ate')::date)
      or exists (select 1 from public.reunioes_agendamentos a where a.id <> v_a.id
        and (a.responsavel_id = v_a.responsavel_id or a.responsavel_id is null)
        and a.status in ('solicitada','confirmada') and a.inicio < v_fim + make_interval(mins => v_t.intervalo_min)
        and a.fim + make_interval(mins => v_t.intervalo_min) > p_novo_inicio)
      or exists (select 1 from public.reunioes_agendamentos a where a.id <> v_a.id
        and (a.responsavel_id = v_a.responsavel_id or a.responsavel_id is null)
        and a.status in ('solicitada','confirmada') and (a.inicio is null or a.fim is null))
      or exists (select 1 from public.ws_tarefa_bloqueios b join public.ws_tarefas w on w.id = b.tarefa_id
        where w.prazo_em is not null and w.prazo_hora is not null and w.arquivada_em is null and w.excluida_em is null
          and w.concluida_em is null and (w.responsavel_id = v_a.responsavel_id or w.responsavel_id is null
            or exists (select 1 from public.ws_tarefa_responsaveis r where r.tarefa_id = w.id and r.usuario_id = v_a.responsavel_id))
          and (w.prazo_em + w.prazo_hora) at time zone 'America/Sao_Paulo' < v_fim
          and ((w.prazo_em + w.prazo_hora) at time zone 'America/Sao_Paulo') + make_interval(mins => b.duracao_min) > p_novo_inicio)
      or (v_t.limite_diario is not null and (select count(*) from public.reunioes_agendamentos a
        where a.id <> v_a.id and a.tipo_id = v_t.id
          and a.status in ('solicitada','confirmada') and (a.inicio at time zone 'America/Sao_Paulo')::date = v_data) >= v_t.limite_diario)
      then return 'SLOT_UNAVAILABLE'; end if;
    update public.reunioes_agendamentos set inicio = p_novo_inicio, fim = v_fim,
      ultimo_evento_em = now(), ultimo_gatilho = 'WORKSPACE_RESCHEDULE' where id = p_id;
    v_extra := E'\n\n**Reagendamento:** ' || to_char(v_local,'DD/MM/YYYY "às" HH24:MI') ||
      E' (Brasília)\n**Novo fim:** ' || to_char(v_fim at time zone 'America/Sao_Paulo','DD/MM/YYYY "às" HH24:MI') || ' (Brasília)';
    update public.ws_tarefas set prazo_em = v_data, prazo_hora = v_local::time,
      titulo = to_char(v_local,'HH24:MI') || ' - Reunião com ' || v_a.participante_nome ||
        case when v_a.confirmacao_comercial = 'confirmada' then '' else ' (a confirmar)' end,
      descricao = coalesce(descricao,'') || v_extra, versao = versao + 1 where id = v_a.tarefa_id;
  elsif p_acao = 'confirmar' then
    if v_a.confirmacao_comercial = 'confirmada' then return 'OK'; end if;
    update public.reunioes_agendamentos set status = 'confirmada', confirmacao_comercial = 'confirmada',
      ultimo_evento_em = now(), ultimo_gatilho = 'WORKSPACE_CONFIRM' where id = p_id;
    update public.ws_tarefas set titulo = replace(titulo,' (a confirmar)',''),
      descricao = coalesce(descricao,'') || E'\n\n**Confirmação comercial:** Confirmada pelo WhatsApp', versao = versao + 1
      where id = v_a.tarefa_id;
  elsif p_acao = 'cancelar' then
    update public.reunioes_agendamentos set status = 'cancelada', ultimo_evento_em = now(),
      ultimo_gatilho = 'WORKSPACE_CANCEL' where id = p_id;
    update public.ws_tarefas set titulo = '[Cancelada] ' || titulo, arquivada_em = now(),
      descricao = coalesce(descricao,'') || E'\n\n**Cancelamento:** Pelo Workspace', versao = versao + 1
      where id = v_a.tarefa_id;
  else
    if v_a.fim > now() then return 'INVALID_INPUT'; end if;
    update public.reunioes_agendamentos set status = 'realizada', ultimo_evento_em = now(),
      ultimo_gatilho = 'WORKSPACE_DONE' where id = p_id;
    update public.ws_tarefas set concluida_em = now(), concluida_por = p_ator,
      descricao = coalesce(descricao,'') || E'\n\n**Status:** Reunião realizada', versao = versao + 1
      where id = v_a.tarefa_id;
  end if;
  insert into public.ws_atividade(tarefa_id,ator_id,evento,mudanca)
    values(v_a.tarefa_id,p_ator,'reuniao_nativa_' || p_acao,
      jsonb_build_object('agendamento_id',p_id,'novo_inicio',p_novo_inicio));
  insert into public.ws_realtime_ping(tarefa_id,kind) values(v_a.tarefa_id,'tarefa');
  insert into public.reunioes_sync_log(nivel,acao,mensagem,agendamento_id,ator_id)
    values('info','nativo_' || p_acao,'Reunião nativa atualizada no Workspace.',p_id,p_ator);
  return 'OK';
exception when exclusion_violation then return 'SLOT_UNAVAILABLE';
end $$;
revoke all on function public.reunioes_nativas_gerir(uuid,text,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.reunioes_nativas_gerir(uuid,text,uuid,timestamptz) to service_role;

-- 10) Reflexo das mudanças da reunião no funil (só reservas do funil) -------
create or replace function public.funil_refletir_reuniao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_s public.funil_sessoes%rowtype; v_evento text;
begin
  if new.status is not distinct from old.status and new.inicio is not distinct from old.inicio then return new; end if;
  select * into v_s from public.funil_sessoes where agendamento_id = new.id limit 1;
  if not found then return new; end if;
  v_evento := case
    when new.status = 'cancelada' and old.status <> 'cancelada' then 'meeting_cancelled'
    when new.status = 'realizada' and old.status <> 'realizada' then 'meeting_attended'
    when new.inicio is distinct from old.inicio then 'meeting_rescheduled'
    else null end;
  if v_evento is null then return new; end if;
  insert into public.funil_eventos (funil_id, sessao_id, lead_id, eid, evento, etapa, dados, ambiente)
    values (v_s.funil_id, v_s.id, v_s.lead_id, gen_random_uuid(), v_evento, 'reuniao',
      jsonb_build_object('agendamento_id', new.id), v_s.ambiente);
  update public.funil_leads set atualizado_em = now(), status_comercial = case
      when v_evento = 'meeting_attended' and status_comercial in ('lead_recebido','aguardando_contato','em_qualificacao','reuniao_agendada','reagendamento','nao_agendou') then 'reuniao_realizada'
      when v_evento = 'meeting_cancelled' and status_comercial = 'reuniao_agendada' then 'reagendamento'
      else status_comercial end
    where id = v_s.lead_id;
  return new;
end $$;
drop trigger if exists funil_refletir_reuniao on public.reunioes_agendamentos;
create trigger funil_refletir_reuniao after update on public.reunioes_agendamentos
  for each row when (new.canal_nativo = 'estaticos_meta') execute function public.funil_refletir_reuniao();

-- 11) Inatividade (abandono inferido) e follow-up ----------------------------
create or replace function public.funil_processar_inatividade() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_abandonos int := 0; v_followups int := 0; v_r record; v_tarefa uuid; v_resp uuid;
begin
  with alvo as (
    select s.id, s.funil_id, s.lead_id, s.ambiente, s.etapa_atual from public.funil_sessoes s
    join public.funil_config f on f.id = s.funil_id
    where not s.abandonada and s.estado <> 'agendada'
      and s.ultima_interacao_em < now() - make_interval(mins => f.abandono_minutos)
    limit 2000
  ), upd as (
    update public.funil_sessoes s set abandonada = true, abandonada_em = now(), etapa_abandono = a.etapa_atual
    from alvo a where s.id = a.id returning s.id, s.funil_id, s.lead_id, s.ambiente, a.etapa_atual
  ), ev as (
    insert into public.funil_eventos (funil_id, sessao_id, lead_id, eid, evento, etapa, ambiente)
    select funil_id, id, lead_id, gen_random_uuid(), 'funnel_abandoned', etapa_atual, ambiente from upd
    returning 1
  ) select count(*) into v_abandonos from ev;

  -- Lead sem reunião após X minutos: uma tarefa de follow-up por lead.
  for v_r in
    select l.id, l.nome, l.telefone_e164, l.funil_id, f.nome as funil_nome, f.canal_chave, l.ambiente
    from public.funil_leads l join public.funil_config f on f.id = l.funil_id
    where f.followup_ativo and l.followup_tarefa_id is null
      and l.criado_em < now() - make_interval(mins => f.followup_minutos)
      and l.criado_em > now() - interval '7 days'
      and not exists (select 1 from public.funil_sessoes s join public.reunioes_agendamentos a on a.id = s.agendamento_id
        where s.lead_id = l.id and a.status in ('solicitada','confirmada','realizada'))
    order by l.criado_em limit 50
    for update of l skip locked
  loop
    select coalesce(d.responsavel_id, t.responsavel_id) into v_resp
      from public.reunioes_canais_nativos c join public.reunioes_tipos t on t.id = c.tipo_id
      join public.reunioes_disponibilidades d on d.id = c.disponibilidade_id where c.chave = v_r.canal_chave;
    insert into public.ws_tarefas (titulo, descricao, prazo_em, prioridade, criado_por, source_gid)
      values (case when v_r.ambiente = 'teste' then '[TESTE] ' else '' end || 'Follow-up: ' || v_r.nome || ' (não agendou)',
        '**Origem:** ' || v_r.funil_nome || E'\n**WhatsApp:** ' || v_r.telefone_e164 ||
        E'\n**Situação:** respondeu o formulário e não concluiu o agendamento.' ||
        E'\n**Link de contato:** https://wa.me/' || substring(v_r.telefone_e164 from 2),
        (now() at time zone 'America/Sao_Paulo')::date, 'alta', null, 'funil-followup:' || v_r.id)
      returning id into v_tarefa;
    if v_resp is not null then
      insert into public.ws_tarefa_responsaveis(tarefa_id, usuario_id, ordem) values (v_tarefa, v_resp, 0);
      insert into public.ws_seguidores(tarefa_id, usuario_id) values (v_tarefa, v_resp);
    end if;
    insert into public.ws_realtime_ping(tarefa_id, kind) values (v_tarefa, 'tarefa');
    update public.funil_leads set followup_tarefa_id = v_tarefa,
      status_comercial = case when status_comercial = 'lead_recebido' then 'nao_agendou' else status_comercial end
      where id = v_r.id;
    v_followups := v_followups + 1;
  end loop;

  -- Contexto (IP/UA) não fica guardado depois do envio/descarte.
  update public.funil_conversoes set contexto = '{}'::jsonb
    where contexto <> '{}'::jsonb and (status in ('enviado','ignorado') or criado_em < now() - interval '7 days');

  return jsonb_build_object('abandonos', v_abandonos, 'followups', v_followups);
end $$;
revoke all on function public.funil_processar_inatividade() from public, anon, authenticated;
grant execute on function public.funil_processar_inatividade() to service_role;

-- Agenda a cada 10 min quando o pg_cron existe (o mesmo usado pela Sentinela).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('funil_inatividade_10min', '*/10 * * * *', 'select public.funil_processar_inatividade()');
  end if;
end $$;
