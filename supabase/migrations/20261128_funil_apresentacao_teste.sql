-- =============================================================================
-- 20261128 — Funil Estáticos Meta, fase 2: apresentação comercial (Etapa 00),
-- identidade branca, métricas de entrada, modo de teste sem efeitos reais,
-- diagnóstico explícito da CAPI e os 12 criativos estáticos.
--
-- Pré-requisito: 20261125 → 20261126 → 20261127 aplicadas, nesta ordem.
-- Incremental e não destrutiva: só ADD COLUMN, constraints novas, uma nova
-- versão do formulário (somente se a v1 semeada ainda é a única) e
-- CREATE OR REPLACE de três funções da 20261127 (diferenças comentadas):
-- funil_reservar (trava por lead), funil_capturar_lead (teste não notifica)
-- e funil_processar_inatividade (teste não gera follow-up).
-- =============================================================================

-- 1) Sessões: entrada (apresentação x direto), visual, teste ----------------
alter table public.funil_sessoes
  add column if not exists variante_entrada text,
  add column if not exists versao_visual text,
  add column if not exists apresentacao_vista_em timestamptz,
  add column if not exists cta_inicial_em timestamptz,
  add column if not exists diagnostico_capi boolean not null default false,
  add column if not exists teste_reserva_inicio timestamptz,
  add column if not exists teste_reserva_fim timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'funil_sessoes_variante_entrada_chk') then
    alter table public.funil_sessoes add constraint funil_sessoes_variante_entrada_chk
      check (variante_entrada is null or variante_entrada in ('apresentacao','direto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'funil_sessoes_versao_visual_chk') then
    alter table public.funil_sessoes add constraint funil_sessoes_versao_visual_chk
      check (versao_visual is null or versao_visual in ('claro','escuro'));
  end if;
  -- Diagnóstico da CAPI e reserva simulada só existem em sessão de TESTE.
  if not exists (select 1 from pg_constraint where conname = 'funil_sessoes_diagnostico_so_teste') then
    alter table public.funil_sessoes add constraint funil_sessoes_diagnostico_so_teste
      check (not diagnostico_capi or ambiente = 'teste');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'funil_sessoes_reserva_simulada_so_teste') then
    alter table public.funil_sessoes add constraint funil_sessoes_reserva_simulada_so_teste
      check ((teste_reserva_inicio is null and teste_reserva_fim is null)
        or (ambiente = 'teste' and teste_reserva_inicio is not null and teste_reserva_fim > teste_reserva_inicio));
  end if;
end $$;

comment on column public.funil_sessoes.variante_entrada is
  'apresentacao = abriu na Etapa 00; direto = abriu na 1ª pergunta. Base para comparar as duas entradas.';
comment on column public.funil_sessoes.teste_reserva_inicio is
  'Reserva SIMULADA de sessão de teste: valida o horário na agenda real, mas não cria reunião, tarefa nem bloqueio.';

-- 2) Versão 2 do formulário: mesmas perguntas da v1 + Etapa 00 + identidade
-- branca. Só quando a v1 semeada ainda é a única versão (não sobrescreve
-- edições feitas pela equipe). A v1 fica arquivada e continua interpretando
-- as sessões que começaram nela.
with base as (
  select f.id as funil_id, v.id as v1, v.definicao
  from public.funil_config f
  join public.funil_versoes v on v.id = f.versao_publicada_id
  where f.chave = 'estaticos_meta' and v.numero = 1
    and not exists (select 1 from public.funil_versoes x where x.funil_id = f.id and x.numero <> 1)
), arquiva as (
  update public.funil_versoes a set status = 'arquivada' from base where a.id = base.v1 returning a.id
), nova as (
  insert into public.funil_versoes (funil_id, numero, status, definicao, publicada_em)
  select base.funil_id, 2, 'publicada',
    base.definicao
      || jsonb_build_object('visual', 'claro')
      || jsonb_build_object('apresentacao', $json${
    "ativo": true,
    "identificacao": "Marketing & Tecnologia Imobiliária",
    "headline": "Mais oportunidades de venda para corretores de imóveis de Cascavel.",
    "beneficios": [
      { "emoji": "🎯", "destaque": "Tráfego pago", "texto": "para seus imóveis" },
      { "emoji": "🎬", "destaque": "Gravação e edição", "texto": "por nossa conta" },
      { "emoji": "📲", "destaque": "Sistema imobiliário", "texto": "personalizado" },
      { "emoji": "📈", "destaque": "Marketing e gestão", "texto": "comercial" }
    ],
    "complemento": "Para corretores que desejam atrair novos compradores e profissionalizar sua operação imobiliária.",
    "cta": "Quero conhecer as soluções",
    "rodape": "Suas respostas serão enviadas à ANÔMALO."
  }$json$::jsonb)
      || jsonb_build_object('textos', (base.definicao->'textos') || jsonb_build_object(
           'contato_subtitulo', 'Informe seus dados para visualizar os horários disponíveis.',
           'agenda_cta', 'Confirmar agendamento')),
    now()
  from base
  returning id, funil_id
)
-- O funil continua INATIVO até a equipe ativar; só a versão publicada muda.
update public.funil_config c set versao_publicada_id = nova.id, updated_at = now()
from nova where c.id = nova.funil_id;

-- 3) Criativos estáticos E01–E12 (sem ID de anúncio: a equipe associa no painel).
insert into public.funil_criativos (funil_id, codigo, nome, status)
select f.id, c.codigo, c.nome, 'ativo'
from public.funil_config f
cross join (values
  ('E01', 'Enquanto você poderia estar vendendo'),
  ('E02', 'Seu próximo comprador precisa te encontrar'),
  ('E03', 'A primeira visita acontece na tela do celular'),
  ('E04', 'Dois lados da operação imobiliária'),
  ('E05', 'Você não precisa de mais um CRM'),
  ('E06', 'Procura-se corretor de imóveis'),
  ('E07', 'Resultados de quem já investe'),
  ('E08', 'Marketing especializado para corretores'),
  ('E09', 'Olha o que um corretor nos mandou'),
  ('E10', 'Sem depender apenas de indicações'),
  ('E11', 'Corretor cansado de prospectar'),
  ('E12', 'Marketing imobiliário de alto padrão')
) as c(codigo, nome)
where f.chave = 'estaticos_meta'
on conflict (funil_id, codigo) do nothing;

-- 3b) Reserva pelo funil — idêntica à 20261127, exceto: trava por lead antes
-- das checagens (corrige reserva dupla em pedidos simultâneos do mesmo lead).
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
  -- Fase 2: serializa as reservas do MESMO lead (duas abas/dispositivos ou
  -- reenvios em paralelo). Sem esta trava, pedidos simultâneos para horários
  -- diferentes passavam juntos pela checagem de "reunião futura existente"
  -- (encontrado no teste de concorrência em PostgreSQL real). Trava consultiva
  -- (não de linha) e sempre ANTES da trava do responsável: sem ciclo com
  -- reunioes_nativas_gerir, que só usa a trava do responsável.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('funil-lead:' || v_l.id::text, 0));

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

-- 4) Captura do lead — idêntica à 20261127, exceto: teste não notifica.
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

  -- Fase 2: sessão de teste não notifica a equipe (nem sino, nem push).
  if v_novo and v_f.notificar_novo_lead and v_s.ambiente = 'producao' then
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

-- 5) Inatividade/follow-up — idêntica à 20261127, exceto: teste não gera follow-up.
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
    -- Fase 2: lead de teste nunca gera tarefa comercial de follow-up.
    where f.followup_ativo and l.followup_tarefa_id is null and l.ambiente = 'producao'
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
