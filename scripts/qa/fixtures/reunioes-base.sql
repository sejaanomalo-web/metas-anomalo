-- Dependências externas ao Workspace para banco descartável de testes.
-- Workspace/Reuniões são criados pelas migrations reais do repositório.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create table public.usuarios(id uuid primary key default gen_random_uuid(),nome text not null,email text,papel text,ativo boolean default true,permissoes jsonb);
create table public.cliente_trafego(id uuid primary key default gen_random_uuid());
create table public.notificacoes(id uuid primary key default gen_random_uuid(),tipo text,empresa text,titulo text,mensagem text,payload jsonb,papel_alvo text[],criada_em timestamptz default now());
create table public.notificacoes_usuario(id uuid primary key default gen_random_uuid(),notificacao_id uuid references public.notificacoes(id),usuario_id uuid references public.usuarios(id),created_at timestamptz default now(),unique(notificacao_id,usuario_id));
create table public.preferencias_notificacao(usuario_id uuid primary key references public.usuarios(id));
