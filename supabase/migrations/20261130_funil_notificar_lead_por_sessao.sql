-- =============================================================================
-- Funil Estáticos Meta — notificação de lead por ENVIO do contato (sessão)
--
-- Antes (20261128): o sino/push de "Novo lead" só saía quando o TELEFONE era
-- inédito no funil (v_novo). Quem já tinha preenchido antes e voltava (ou um
-- teste repetido com o mesmo número) era salvo/atualizado em silêncio — só a
-- reunião notificava.
--
-- Agora: notifica na PRIMEIRA vez que cada sessão envia nome + WhatsApp
-- (v_s.contato_em is null antes do update). Reenviar o contato na mesma sessão
-- (voltar e corrigir) não duplica. Telefone já conhecido → "Lead voltou".
-- Fluxo completo = 2 notificações: contato enviado + reunião agendada.
--
-- Inalterado: o lead continua salvo no clique (upsert por telefone), sessão de
-- teste não notifica, e a conversão Lead da Meta segue UMA por pessoa
-- (event_id = lead.<lead_id>) para não inflar o resultado da campanha.
--
-- Idempotente (CREATE OR REPLACE, mesma assinatura). Rodar no SQL Editor.
-- =============================================================================
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

  -- 20261130: notifica no 1º envio do contato DESTA sessão (lead novo ou que
  -- voltou). v_s foi lido antes do update, então contato_em ainda é o anterior.
  -- Sessão de teste continua sem notificar.
  if v_s.contato_em is null and v_f.notificar_novo_lead and v_s.ambiente = 'producao' then
    select coalesce(d.responsavel_id, t.responsavel_id) into v_resp
      from public.reunioes_canais_nativos c
      join public.reunioes_tipos t on t.id = c.tipo_id
      join public.reunioes_disponibilidades d on d.id = c.disponibilidade_id
      where c.chave = v_f.canal_chave;
    insert into public.notificacoes(tipo, empresa, titulo, mensagem, payload, papel_alvo)
      values ('ws_tarefa', null,
        case when v_novo then 'Novo lead — ' else 'Lead voltou — ' end || v_f.nome,
        case when v_novo then 'Um corretor respondeu o formulário. Abra o lead para ver respostas e origem.'
             else 'Um lead que já tinha preenchido enviou o contato de novo. Abra para ver respostas e origem.' end,
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

