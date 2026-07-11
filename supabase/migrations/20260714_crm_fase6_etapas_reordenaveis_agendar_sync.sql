-- CRM — Fase 6: etapas com nome/cor editáveis + reordenáveis, etiquetas
-- sincronizadas com o Kanban (deixam de ser criadas em Conversas), e as
-- categorias padrão de agendamento também viram etapa. 2026-07-14. Idempotente.
--
-- Etiquetas (crm_etiquetas) passam a ser um ESPELHO de crm_etapas: cada
-- etiqueta disponível pra atribuir a um lead corresponde a uma etapa visível
-- ao usuário (padrão ou própria). O vínculo é feito por etapa_id — a
-- sincronização em si (criar/religar/renomear) acontece na aplicação
-- (lib/crm-etapas.ts, lib/crm-etiquetas-actions.ts), não aqui; esta migração
-- só prepara o schema.

alter table public.crm_etiquetas
  add column if not exists etapa_id uuid references public.crm_etapas(id) on delete cascade;
create index if not exists crm_etiquetas_etapa_idx on public.crm_etiquetas (etapa_id);

-- As 3 categorias padrão de agendamento (lib/crm-tipos-atividade.ts) que
-- ainda não existem como etapa — "Reunião agendada" já existe com o mesmo
-- nome desde a Fase 0, não precisa duplicar. `ordem` é calculada (max atual +
-- 1/2/3) em vez de fixa: valores fixos (5/6/7) colidiriam em silêncio com uma
-- etapa que um usuário já tenha movido pra ali via o novo botão de reordenar
-- (crm_etapas.ordem não é unique — duas etapas empatadas ficam com ordem
-- indefinida entre si). Ficam no fim da lista; dá pra reordenar pela UI depois.
insert into public.crm_etapas (nome, ordem, tipo, cor)
select v.nome,
       (select coalesce(max(e2.ordem), 0) from public.crm_etapas e2 where e2.ativo) + v.deslocamento,
       v.tipo, v.cor
from (values
  ('Follow-up',               1, 'aberta', '#4a90d9'),
  ('Fechamento de follow-up', 2, 'aberta', '#8e7cc3'),
  ('Fechamento',              3, 'aberta', '#4caf50')
) as v(nome, deslocamento, tipo, cor)
where not exists (
  select 1 from public.crm_etapas e
  where e.usuario_id is null and lower(e.nome) = lower(v.nome)
);
