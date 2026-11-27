-- Intervalo entre horários (slot interval) da agenda nativa ATIVO.
-- Pré-requisito: 20261125_reunioes_nativas.sql. Não edita migrations já aplicadas.
--
-- reunioes_tipos.intervalo_min       = buffer APÓS cada reunião (já existia, ex.: 15).
-- reunioes_tipos.intervalo_minutos   = passo entre os inícios oferecidos (novo).
-- Os inícios de cada janela passam a ser janela.inicio + k × intervalo_minutos,
-- desde que início + duração caiba na janela. A RPC de reserva (e o reagendamento
-- interno) recusam qualquer início fora dessa grade com SLOT_UNAVAILABLE.

alter table public.reunioes_tipos add column if not exists intervalo_minutos integer;

-- Preenche os registros existentes com a duração atual, ANTES de o trigger de
-- invalidação passar a observar a coluna (o preenchimento só reduz a oferta a um
-- subconjunto das janelas já verificadas, então não exige nova validação).
update public.reunioes_tipos
   set intervalo_minutos = least(480, greatest(5, duracao_min))
 where intervalo_minutos is null;

alter table public.reunioes_tipos alter column intervalo_minutos set default 60;
alter table public.reunioes_tipos alter column intervalo_minutos set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reunioes_tipos_intervalo_minutos_faixa') then
    alter table public.reunioes_tipos add constraint reunioes_tipos_intervalo_minutos_faixa
      check (intervalo_minutos between 5 and 480);
  end if;
end $$;

comment on column public.reunioes_tipos.intervalo_minutos is
  'Passo, em minutos, entre os inícios oferecidos pela agenda nativa (5–480). Padrão = duração.';
comment on column public.reunioes_tipos.intervalo_min is
  'Buffer, em minutos, após cada reunião.';

-- Alterar o intervalo conta como alteração de disponibilidade: desativa o canal
-- até nova validação de exclusividade.
create or replace function public.reunioes_nativas_invalidar_tipo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.duracao_min is distinct from new.duracao_min or old.responsavel_id is distinct from new.responsavel_id
     or old.antecedencia_min_horas is distinct from new.antecedencia_min_horas
     or old.intervalo_min is distinct from new.intervalo_min
     or old.intervalo_minutos is distinct from new.intervalo_minutos or old.limite_diario is distinct from new.limite_diario
     or old.horizonte_dias is distinct from new.horizonte_dias or old.ativo is distinct from new.ativo then
    update public.reunioes_canais_nativos set ativo = false, exclusividade_verificada_em = null,
      exclusividade_verificada_por = null, updated_at = now() where tipo_id = new.id;
    if new.calcom_event_type_id is not null then
      update public.reunioes_canais_nativos c set ativo = false, exclusividade_verificada_em = null,
        exclusividade_verificada_por = null, updated_at = now()
        from public.reunioes_tipos t
        where t.id = c.tipo_id and t.responsavel_id in (old.responsavel_id,new.responsavel_id);
    end if;
  end if;
  return new;
end $$;

-- Reserva pública: exige início na grade do intervalo, além das regras anteriores.
create or replace function public.reunioes_nativas_reservar(
  p_nome text, p_telefone text, p_inicio timestamptz, p_chave uuid,
  p_hash text, p_atribuicao jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_c public.reunioes_canais_nativos%rowtype;
  v_t public.reunioes_tipos%rowtype;
  v_d public.reunioes_disponibilidades%rowtype;
  v_ant public.reunioes_agendamentos%rowtype;
  v_id uuid := gen_random_uuid();
  v_tarefa uuid;
  v_fim timestamptz;
  v_local timestamp;
  v_data date;
  v_dia int;
  v_janelas jsonb;
  v_excecao jsonb;
  v_periodo jsonb;
  v_notificacao public.notificacoes.id%type;
  v_rotulo text;
  v_descricao text;
  v_passo int;
begin
  if p_nome is null or length(p_nome) not between 2 and 120 or p_nome ~ '[<>[:cntrl:]]'
     or p_telefone is null or p_telefone !~ '^\+55[1-9][0-9][2-9][0-9]{7,8}$'
     or p_inicio is null or p_chave is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
     or p_atribuicao is null or jsonb_typeof(p_atribuicao) <> 'object'
     or pg_catalog.octet_length(p_atribuicao::text) > 2048 then
    return jsonb_build_object('code','INVALID_INPUT');
  end if;
  select * into v_ant from public.reunioes_agendamentos
    where provedor = 'nativo' and idempotency_key = p_chave;
  if found then
    if v_ant.request_hash <> p_hash then return jsonb_build_object('code','IDEMPOTENCY_MISMATCH'); end if;
    return jsonb_build_object('status','reserved_pending_whatsapp','bookingId',v_ant.id,
      'startsAt',v_ant.inicio,'endsAt',v_ant.fim,'timezone','America/Sao_Paulo');
  end if;
  select * into v_c from public.reunioes_canais_nativos where chave = 'ativo' and ativo;
  if not found then return jsonb_build_object('code','CONFIG_UNAVAILABLE'); end if;
  select * into v_t from public.reunioes_tipos where id = v_c.tipo_id and ativo;
  select * into v_d from public.reunioes_disponibilidades where id = v_c.disponibilidade_id;
  if v_t.id is null or v_d.id is null or v_d.fuso <> 'America/Sao_Paulo' or v_d.calcom_schedule_id is not null or not v_d.modo_nativo
     or coalesce(v_d.responsavel_id,v_t.responsavel_id) is null
     or (v_d.responsavel_id is not null and v_t.responsavel_id is not null and v_d.responsavel_id <> v_t.responsavel_id)
     or not exists (select 1 from public.usuarios where id = coalesce(v_d.responsavel_id,v_t.responsavel_id) and ativo) then
    return jsonb_build_object('code','CONFIG_UNAVAILABLE');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(v_d.responsavel_id,v_t.responsavel_id)::text,0));
  -- Outra requisição com a mesma chave pode ter concluído enquanto aguardávamos o lock.
  select * into v_ant from public.reunioes_agendamentos
    where provedor = 'nativo' and idempotency_key = p_chave;
  if found then
    if v_ant.request_hash <> p_hash then return jsonb_build_object('code','IDEMPOTENCY_MISMATCH'); end if;
    return jsonb_build_object('status','reserved_pending_whatsapp','bookingId',v_ant.id,
      'startsAt',v_ant.inicio,'endsAt',v_ant.fim,'timezone','America/Sao_Paulo');
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
  select x into v_excecao from jsonb_array_elements(v_d.excecoes) x
    where x->>'data' = v_data::text limit 1;
  if v_excecao is not null then
    v_janelas := (select coalesce(jsonb_agg(x || jsonb_build_object('dia',v_dia)),'[]'::jsonb)
      from jsonb_array_elements(v_excecao->'janelas') x);
  end if;
  if not exists (select 1 from jsonb_array_elements(v_janelas) x
    where (x->>'dia')::int = v_dia and v_local::time >= (x->>'inicio')::time
      and (v_fim at time zone 'America/Sao_Paulo')::time <= (x->>'fim')::time
      and floor(extract(epoch from (v_local::time - (x->>'inicio')::time)) / 60)::int % v_passo = 0) then
    return jsonb_build_object('code','SLOT_UNAVAILABLE');
  end if;
  if exists (select 1 from jsonb_array_elements(v_d.bloqueios) x
      where v_data between (x->>'de')::date and (x->>'ate')::date)
     or exists (select 1 from public.reunioes_agendamentos a
      where (a.responsavel_id = coalesce(v_d.responsavel_id,v_t.responsavel_id) or a.responsavel_id is null)
        and a.status in ('solicitada','confirmada') and a.inicio < v_fim + make_interval(mins => v_t.intervalo_min)
        and a.fim + make_interval(mins => v_t.intervalo_min) > p_inicio)
     or exists (select 1 from public.reunioes_agendamentos a
      where (a.responsavel_id = coalesce(v_d.responsavel_id,v_t.responsavel_id) or a.responsavel_id is null)
        and a.status in ('solicitada','confirmada') and (a.inicio is null or a.fim is null))
     or exists (select 1 from public.ws_tarefa_bloqueios b join public.ws_tarefas w on w.id = b.tarefa_id
      where w.prazo_em is not null and w.prazo_hora is not null and w.arquivada_em is null
        and w.excluida_em is null and w.concluida_em is null
        and (w.responsavel_id = coalesce(v_d.responsavel_id,v_t.responsavel_id) or w.responsavel_id is null
          or exists (select 1 from public.ws_tarefa_responsaveis r where r.tarefa_id = w.id
            and r.usuario_id = coalesce(v_d.responsavel_id,v_t.responsavel_id)))
        and (w.prazo_em + w.prazo_hora) at time zone 'America/Sao_Paulo' < v_fim
        and ((w.prazo_em + w.prazo_hora) at time zone 'America/Sao_Paulo') + make_interval(mins => b.duracao_min) > p_inicio)
     or (v_t.limite_diario is not null and (select count(*) from public.reunioes_agendamentos a
      where a.tipo_id = v_t.id and a.status in ('solicitada','confirmada')
        and (a.inicio at time zone 'America/Sao_Paulo')::date = v_data) >= v_t.limite_diario) then
    return jsonb_build_object('code','SLOT_UNAVAILABLE');
  end if;
  v_rotulo := to_char(v_local,'HH24:MI');
  v_descricao := '**Tipo:** ' || v_t.nome || E'\n**Participante:** ' || p_nome ||
    E'\n**WhatsApp:** ' || p_telefone || E'\n**Início:** ' || to_char(v_local,'DD/MM/YYYY "às" HH24:MI') ||
    E' (Brasília)\n**Fim:** ' || to_char(v_fim at time zone 'America/Sao_Paulo','DD/MM/YYYY "às" HH24:MI') ||
    E' (Brasília)\n**Responsável:** ' || (select nome from public.usuarios where id = coalesce(v_d.responsavel_id,v_t.responsavel_id)) ||
    E'\n**Local:** A combinar pelo WhatsApp\n**Origem:** Landing Page ATIVO — Agendamento nativo' ||
    E'\n**Campanha:** ' || coalesce(left(p_atribuicao->>'utm_campaign',120),'—') ||
    E'\n**UTM source/medium/content:** ' || coalesce(left(p_atribuicao->>'utm_source',120),'—') ||
    ' / ' || coalesce(left(p_atribuicao->>'utm_medium',120),'—') ||
    ' / ' || coalesce(left(p_atribuicao->>'utm_content',120),'—') ||
    E'\n**Status:** Horário reservado — aguardando confirmação pelo WhatsApp' ||
    E'\n**Link de contato:** https://wa.me/' || substring(p_telefone from 2);
  insert into public.ws_tarefas (titulo,descricao,prazo_em,prazo_hora,prioridade,criado_por,source_gid)
    values (v_rotulo || ' - Reunião com ' || p_nome || ' (a confirmar)',v_descricao,v_data,v_local::time,'normal',null,'nativo:' || v_id)
    returning id into v_tarefa;
  insert into public.ws_tarefa_responsaveis(tarefa_id,usuario_id,ordem)
    values (v_tarefa,coalesce(v_d.responsavel_id,v_t.responsavel_id),0);
  insert into public.ws_seguidores(tarefa_id,usuario_id)
    values (v_tarefa,coalesce(v_d.responsavel_id,v_t.responsavel_id));
  if v_t.contexto_id is not null then
    insert into public.ws_tarefa_contextos(tarefa_id,contexto_id) values(v_tarefa,v_t.contexto_id);
  end if;
  insert into public.reunioes_agendamentos
    (id,provedor,booking_uid,tipo_id,tarefa_id,responsavel_id,participante_nome,participante_telefone,
     participante_fuso,inicio,fim,status,local_rotulo,origem_comercial,descricao_gerada,
     idempotency_key,request_hash,atribuicao,confirmacao_comercial)
    values(v_id,'nativo',v_id::text,v_t.id,v_tarefa,coalesce(v_d.responsavel_id,v_t.responsavel_id),
      p_nome,p_telefone,'America/Sao_Paulo',p_inicio,v_fim,'solicitada','A combinar pelo WhatsApp',
      v_t.origem_comercial,v_descricao,p_chave,p_hash,p_atribuicao,'aguardando_whatsapp');
  insert into public.ws_atividade(tarefa_id,ator_id,evento,mudanca)
    values(v_tarefa,null,'reuniao_nativa_reservada',jsonb_build_object('agendamento_id',v_id));
  insert into public.ws_realtime_ping(tarefa_id,kind) values(v_tarefa,'tarefa');
  insert into public.reunioes_sync_log(nivel,acao,mensagem,agendamento_id)
    values('info','nativo_reserva','Horário reservado pelo canal nativo ATIVO.',v_id);
  insert into public.notificacoes(tipo,empresa,titulo,mensagem,payload,papel_alvo)
    values('ws_tarefa',null,'Nova demonstração ATIVO agendada',
      'Uma reunião foi reservada para ' || to_char(v_local,'DD/MM "às" HH24:MI') || '. Acesse a tarefa para entrar em contato pelo WhatsApp.',
      jsonb_build_object('tarefa_id',v_tarefa,'url','/dashboard/workspace/calendario?tarefa=' || v_tarefa),array['admin','comercial'])
    returning id into v_notificacao;
  insert into public.notificacoes_usuario(notificacao_id,usuario_id)
    select v_notificacao,coalesce(v_d.responsavel_id,v_t.responsavel_id)
    where coalesce((select ws_tarefa from public.preferencias_notificacao
      where usuario_id = coalesce(v_d.responsavel_id,v_t.responsavel_id)),true);
  return jsonb_build_object('status','reserved_pending_whatsapp','bookingId',v_id,
    'startsAt',p_inicio,'endsAt',v_fim,'timezone','America/Sao_Paulo');
exception when exclusion_violation or unique_violation then
  return jsonb_build_object('code','SLOT_UNAVAILABLE');
end $$;
revoke all on function public.reunioes_nativas_reservar(text,text,timestamptz,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.reunioes_nativas_reservar(text,text,timestamptz,uuid,text,jsonb) to service_role;

-- Reagendamento interno segue a mesma grade.
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
    select * into v_c from public.reunioes_canais_nativos where chave = 'ativo' and ativo;
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
