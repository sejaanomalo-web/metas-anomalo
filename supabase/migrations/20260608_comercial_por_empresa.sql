-- Relatório comercial passa a ser por EMPRESA + dia (antes: colaborador + dia).
-- Habilita um formulário público compartilhado onde o time escolhe a empresa.
-- colaborador_* vira informativo ("Formulário público" quando sem login).

alter table public.relatorios_comerciais add column if not exists empresa text;
alter table public.relatorios_comerciais alter column empresa set not null;

alter table public.relatorios_comerciais
  drop constraint if exists relatorios_comerciais_colaborador_id_data_key;
alter table public.relatorios_comerciais
  add constraint relatorios_comerciais_empresa_data_key unique (empresa, data);

drop index if exists public.relatorios_comerciais_colab_data_idx;
create index if not exists relatorios_comerciais_empresa_data_idx
  on public.relatorios_comerciais (empresa, data);
