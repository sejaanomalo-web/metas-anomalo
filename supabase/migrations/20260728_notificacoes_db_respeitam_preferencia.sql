-- ============================================================================
-- Notificações do banco passam a respeitar a preferência do usuário.
--
-- BUG: duas funções de fan-out inseriam em notificacoes_usuario só por papel +
-- ver_notificacoes, SEM olhar preferencias_notificacao — então desligar o
-- toggle em Configurações não tinha efeito e o push continuava chegando:
--
--   1. fn_gerar_lembretes_diarios()  (job pg_cron `lembrete-diario-6h-brt`)
--      → ignorava preferencias_notificacao.lembrete
--   2. fn_notificar_nova_venda()     (trigger em dados_diarios_log)
--      → ignorava preferencias_notificacao.nova_venda
--
-- Todo o resto do sistema (criarNotificacao em lib/notificacoes.ts e o trigger
-- fn_notificar_dados_sentinela) já filtra por preferência; estas duas eram as
-- portas que passavam por cima. Ambas são reescritas com o MESMO filtro
-- `coalesce(p.<tipo>, true) = true` (ausência de linha = ligado).
--
-- As duas funções viviam só no banco (nunca versionadas); esta migration passa
-- a ser a fonte de verdade delas.
--
-- APLICAR: Supabase → SQL Editor → colar este arquivo → Run. Idempotente.
-- ============================================================================

create or replace function public.fn_gerar_lembretes_diarios()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ontem date := (now() at time zone 'America/Sao_Paulo')::date - interval '1 day';
  empresas_pendentes text[];
  novo_id uuid;
begin
  select array_agg(e.nome order by e.nome)
  into empresas_pendentes
  from public.empresas_config e
  where e.ativa = true
    and e.nome <> 'Anômalo Hub'
    and not exists (
      select 1
      from public.dados_diarios_log d
      where d.empresa = e.nome
        and d.data = ontem
        and (d.reunioes_real is not null or d.contratos_real is not null)
    );

  if empresas_pendentes is null or array_length(empresas_pendentes, 1) = 0 then
    return;
  end if;

  -- Lembrete: só admin (gestor de tráfego não preenche reuniões/contratos).
  -- Custom recebe se permissao ver_notificacoes=true.
  insert into public.notificacoes (
    tipo, empresa, titulo, mensagem, payload, papel_alvo
  )
  values (
    'lembrete',
    null,
    'Bom dia · ' || array_length(empresas_pendentes, 1) || ' pendência(s) de ontem',
    'Faltou reportar reuniões ou contratos de ' || to_char(ontem, 'DD/MM') || ': ' ||
      array_to_string(empresas_pendentes, ', '),
    jsonb_build_object(
      'data_referencia', ontem,
      'empresas_pendentes', empresas_pendentes
    ),
    array['admin', 'custom']
  )
  returning id into novo_id;

  -- Fan-out FILTRADO pela preferência 'lembrete' (o que faltava). Ausência de
  -- linha em preferencias_notificacao = ligado, igual ao resto do sistema.
  insert into public.notificacoes_usuario (notificacao_id, usuario_id)
  select novo_id, u.id
  from public.usuarios u
  left join public.preferencias_notificacao p on p.usuario_id = u.id
  where u.ativo = true
    and u.papel = any(array['admin', 'custom'])
    and (u.papel = 'admin' or (u.permissoes->>'ver_notificacoes')::boolean = true)
    and coalesce(p.lembrete, true) = true;
end;
$function$;


-- ============================================================
-- 2) NOVA VENDA — mesmo conserto no trigger de dados_diarios_log
-- ============================================================
create or replace function public.fn_notificar_nova_venda()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  delta_contratos integer;
  delta_faturamento numeric;
  novo_id uuid;
  titulo_msg text;
  texto_msg text;
begin
  delta_contratos := coalesce(NEW.contratos_real, 0) - coalesce(OLD.contratos_real, 0);
  if delta_contratos <= 0 then
    return NEW;
  end if;
  delta_faturamento := coalesce(NEW.faturamento_real, 0) - coalesce(OLD.faturamento_real, 0);
  titulo_msg := 'Nova venda · ' || NEW.empresa;
  texto_msg := case
    when delta_contratos = 1 then '1 contrato fechado'
    else delta_contratos || ' contratos fechados'
  end;
  if delta_faturamento > 0 then
    texto_msg := texto_msg || ' · R$ ' || trim(to_char(delta_faturamento, 'FM999G999G990D00'));
  end if;

  -- Nova venda: todos os papéis recebem (evento positivo).
  insert into public.notificacoes (
    tipo, empresa, titulo, mensagem, payload, papel_alvo
  )
  values (
    'nova_venda',
    NEW.empresa,
    titulo_msg,
    texto_msg,
    jsonb_build_object(
      'empresa', NEW.empresa,
      'data', NEW.data,
      'origem', NEW.origem,
      'delta_contratos', delta_contratos,
      'delta_faturamento', delta_faturamento,
      'contratos_total', NEW.contratos_real,
      'faturamento_total', NEW.faturamento_real,
      'preenchedor_nome', NEW.preenchedor_nome
    ),
    array['admin', 'gestor_trafego', 'custom']
  )
  returning id into novo_id;

  -- Fan-out FILTRADO: papel em papel_alvo + ver_notificacoes E, agora, a
  -- preferência 'nova_venda' (o que faltava). Ausência de linha = ligado.
  insert into public.notificacoes_usuario (notificacao_id, usuario_id)
  select novo_id, u.id
  from public.usuarios u
  left join public.preferencias_notificacao p on p.usuario_id = u.id
  where u.ativo = true
    and u.papel = any(array['admin', 'gestor_trafego', 'custom'])
    and (u.papel = 'admin' or (u.permissoes->>'ver_notificacoes')::boolean = true)
    and coalesce(p.nova_venda, true) = true;
  return NEW;
end;
$function$;
