-- Notificações: novos tipos + preferências por usuário + trigger Sentinela.
--
-- Tipos de notificação ganham: dados_comercial, dados_trafego,
-- meta_batida, dados_sentinela (além de nova_venda, lembrete).
-- criarNotificacao (lib/notificacoes.ts) cria a notificação e faz fan-out
-- filtrado por papel + ver_notificacoes + preferência. O push dispara
-- sozinho via trigger existente fn_dispatch_push_async em
-- notificacoes_usuario.

-- 1) Amplia o CHECK de tipo.
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'nova_venda','lembrete',
    'dados_comercial','dados_trafego','meta_batida','dados_sentinela'
  ));

-- 2) Preferências por usuário (ausência de linha = tudo ligado).
create table if not exists public.preferencias_notificacao (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  nova_venda boolean not null default true,
  lembrete boolean not null default true,
  dados_comercial boolean not null default true,
  dados_trafego boolean not null default true,
  meta_batida boolean not null default true,
  dados_sentinela boolean not null default true,
  updated_at timestamptz not null default now()
);

-- RLS habilitada sem policy = só service_role (acesso via getSupabaseAdmin).
alter table public.preferencias_notificacao enable row level security;

-- 3) Trigger do Sentinela: ao INSERIR linha do Sentinela em
-- dados_diarios_log, notifica dados_sentinela (fan-out filtrado por
-- preferência). Só no INSERT pra não spammar nos updates.
create or replace function public.fn_notificar_dados_sentinela()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  novo_id uuid;
begin
  if NEW.preenchedor_nome is distinct from 'Sentinela Anomalo' then
    return NEW;
  end if;

  insert into public.notificacoes (tipo, empresa, titulo, mensagem, payload, papel_alvo)
  values (
    'dados_sentinela',
    NEW.empresa,
    'Sentinela · ' || NEW.empresa,
    'O agente atualizou dados de campanha de ' || NEW.empresa || ' (' || NEW.data || ').',
    jsonb_build_object('empresa', NEW.empresa, 'data', NEW.data, 'origem', NEW.origem),
    array['admin','gestor_trafego','comercial','custom']
  )
  returning id into novo_id;

  insert into public.notificacoes_usuario (notificacao_id, usuario_id)
  select novo_id, u.id
  from public.usuarios u
  left join public.preferencias_notificacao p on p.usuario_id = u.id
  where u.ativo = true
    and u.papel = any(array['admin','gestor_trafego','comercial','custom'])
    and (u.papel = 'admin' or (u.permissoes->>'ver_notificacoes')::boolean = true)
    and coalesce(p.dados_sentinela, true) = true;

  return NEW;
end;
$$;

drop trigger if exists trg_notificar_dados_sentinela on public.dados_diarios_log;
create trigger trg_notificar_dados_sentinela
  after insert on public.dados_diarios_log
  for each row execute function public.fn_notificar_dados_sentinela();
