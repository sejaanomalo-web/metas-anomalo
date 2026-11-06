-- ============================================================================
-- COMERCIAL · FUNIS POR USUÁRIO (acompanhamento manual)
-- ============================================================================
--
-- Só SOMA: duas tabelas novas. `relatorios_comerciais` não é tocada e continua
-- alimentando o realizado do Metas, o sync do CRM e o formulário público.
--
-- Cada pessoa com acesso ao Comercial tem os PRÓPRIOS funis. Um funil tem uma
-- lista livre de etapas e recebe lançamentos datados: quanto foi investido e
-- quanto entrou em cada etapa naquela data.
--
-- Decisões de modelagem:
--   • etapas em jsonb no próprio funil: salvar o funil é um único UPDATE, e o
--     PostgREST não oferece transação entre tabelas. A ordem é a do array.
--   • valores em jsonb no lançamento, pelo mesmo motivo. A chave é o id da
--     etapa: renomear ou reordenar não perde número nenhum.
--   • excluir usuário: funis e lançamentos saem junto (CASCADE), igual à
--     semântica de "remoção total". `criado_por` vira NULL (SET NULL) e não tem
--     CHECK, então não recria a armadilha descrita na migration 20260731.
--   • RLS ligada e sem policy: o app acessa só com a service role, e a anon key
--     pública não enxerga nada.
-- ============================================================================

create table if not exists public.funis_comerciais (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  nome        text not null,
  descricao   text,
  etapas      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint funis_comerciais_nome_check
    check (char_length(btrim(nome)) between 1 and 80),
  constraint funis_comerciais_etapas_check
    check (
      jsonb_typeof(etapas) = 'array'
      and jsonb_array_length(etapas) between 2 and 12
    )
);

-- O nome identifica o funil na tela: não pode repetir para a mesma pessoa.
create unique index if not exists funis_comerciais_usuario_nome_uq
  on public.funis_comerciais (usuario_id, lower(btrim(nome)));

create table if not exists public.funil_lancamentos (
  id           uuid primary key default gen_random_uuid(),
  funil_id     uuid not null references public.funis_comerciais(id) on delete cascade,
  data         date not null,
  investimento numeric(14,2) not null default 0,
  valores      jsonb not null default '{}'::jsonb,
  perdidos     integer not null default 0,
  faturamento  numeric(14,2) not null default 0,
  observacoes  text,
  criado_por   uuid references public.usuarios(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint funil_lancamentos_investimento_check check (investimento >= 0),
  constraint funil_lancamentos_perdidos_check check (perdidos >= 0),
  constraint funil_lancamentos_faturamento_check check (faturamento >= 0),
  constraint funil_lancamentos_valores_check
    check (jsonb_typeof(valores) = 'object')
);

create index if not exists funil_lancamentos_funil_data_idx
  on public.funil_lancamentos (funil_id, data);

-- Índice da FK: sem ele, excluir um usuário varreria a tabela inteira.
create index if not exists funil_lancamentos_criado_por_idx
  on public.funil_lancamentos (criado_por);

alter table public.funis_comerciais enable row level security;
alter table public.funil_lancamentos enable row level security;

revoke all on public.funis_comerciais from anon, authenticated;
revoke all on public.funil_lancamentos from anon, authenticated;
grant select, insert, update, delete on public.funis_comerciais to service_role;
grant select, insert, update, delete on public.funil_lancamentos to service_role;

comment on table public.funis_comerciais is
  'Funis comerciais de cada usuário, com etapas livres (acompanhamento manual).';
comment on column public.funis_comerciais.etapas is
  'Array ordenado de {id, nome}. A última etapa é o fechamento do funil.';
comment on table public.funil_lancamentos is
  'Números lançados à mão em um funil, sempre com data.';
comment on column public.funil_lancamentos.valores is
  'Mapa {id_da_etapa: quantidade}. Chave sem etapa correspondente é ignorada.';
