-- Comercial: modelo APPEND-ONLY (somar, nunca sobrescrever).
--
-- Antes, salvarRelatorioComercialAction fazia upsert por
-- (empresa, colaborador_id, data, origem) — reenviar o formulário no mesmo
-- dia SOBRESCREVIA o registro anterior, podendo "perder" dados.
--
-- Agora o app faz INSERT (append-only): cada envio vira um novo registro e o
-- funil/resumos SOMAM todos os registros do período, então reenviar ACUMULA
-- em cima do que já existe. Para isso, removemos TODAS as constraints unique
-- que rejeitariam o segundo insert do mesmo (empresa, colaborador_id, data,
-- origem). Só o admin remove registros individuais (Configurações).
--
-- Drops defensivos (if exists) — cobrem todas as chaves criadas ao longo das
-- migrations comerciais (a base remota pode ter só um subconjunto delas):
--   • relatorios_comerciais_colaborador_id_data_key  (unique colaborador_id, data) — tabela original
--   • relatorios_comerciais_empresa_data_key         (unique empresa, data)
--   • relatorios_comerciais_empresa_colab_data_key   (unique empresa, colaborador_id, data)
--   • relatorios_comerciais_empresa_colab_data_origem_key (unique empresa, colaborador_id, data, origem)

alter table public.relatorios_comerciais
  drop constraint if exists relatorios_comerciais_colaborador_id_data_key;

alter table public.relatorios_comerciais
  drop constraint if exists relatorios_comerciais_empresa_data_key;

alter table public.relatorios_comerciais
  drop constraint if exists relatorios_comerciais_empresa_colab_data_key;

alter table public.relatorios_comerciais
  drop constraint if exists relatorios_comerciais_empresa_colab_data_origem_key;

-- Índices de leitura permanecem (data, colaborador_id+data) — só as constraints
-- UNIQUE saem. Garante performance das agregações sem travar o append.
create index if not exists relatorios_comerciais_empresa_data_origem_idx
  on public.relatorios_comerciais (empresa, data, origem);
