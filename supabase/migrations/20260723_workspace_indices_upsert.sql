-- Workspace — índices únicos que o ON CONFLICT consegue usar. 2026-07-23.
--
-- BUG QUE ISTO CORRIGE:
--
-- A migration 20260722 criou os índices de source_gid como PARCIAIS:
--
--   create unique index ... on ws_contextos (source_gid) where source_gid is not null;
--
-- O upsert do importador manda `ON CONFLICT (source_gid)`. O PostgreSQL só
-- infere um índice parcial se a cláusula WHERE também vier no comando — e o
-- PostgREST não a emite. Resultado: "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification", e 71 objetos (39 contextos, 32
-- definições de campo) foram rejeitados na normalização.
--
-- A cláusula parcial nunca foi necessária: no PostgreSQL NULL nunca é igual a
-- NULL, então um índice único COMUM já permite quantas linhas com source_gid
-- nulo a gente quiser (os contextos criados à mão dentro do sistema). A
-- semântica é idêntica; a diferença é que o ON CONFLICT passa a funcionar.
--
-- Idempotente: dá pra rodar em cima de um banco que já tem os índices parciais.

-- ============================================================
-- source_gid: parcial -> comum
-- ============================================================
drop index if exists public.ws_contextos_source_gid_unico;
create unique index if not exists ws_contextos_source_gid_unico
  on public.ws_contextos (source_gid);

drop index if exists public.ws_secoes_source_gid_unico;
create unique index if not exists ws_secoes_source_gid_unico
  on public.ws_secoes (source_gid);

drop index if exists public.ws_tarefas_source_gid_unico;
create unique index if not exists ws_tarefas_source_gid_unico
  on public.ws_tarefas (source_gid);

drop index if exists public.ws_comentarios_source_gid_unico;
create unique index if not exists ws_comentarios_source_gid_unico
  on public.ws_comentarios (source_gid);

drop index if exists public.ws_campos_definicoes_source_gid_unico;
create unique index if not exists ws_campos_definicoes_source_gid_unico
  on public.ws_campos_definicoes (source_gid);

drop index if exists public.ws_campos_opcoes_source_gid_unico;
create unique index if not exists ws_campos_opcoes_source_gid_unico
  on public.ws_campos_opcoes (source_gid);

drop index if exists public.ws_anexos_source_gid_unico;
create unique index if not exists ws_anexos_source_gid_unico
  on public.ws_anexos (source_gid);

-- ============================================================
-- valores de campo do tipo "pessoas": mesmo problema
-- ============================================================
-- O upsert usa ON CONFLICT (valor_id, usuario_id) e (valor_id,
-- identidade_externa_id). Como só um dos dois lados é preenchido por linha
-- (há CHECK garantindo), o outro fica NULL e não conflita — exatamente o
-- comportamento que queremos.
drop index if exists public.ws_campos_valor_pessoas_usuario_unq;
create unique index if not exists ws_campos_valor_pessoas_usuario_unq
  on public.ws_campos_valor_pessoas (valor_id, usuario_id);

drop index if exists public.ws_campos_valor_pessoas_externo_unq;
create unique index if not exists ws_campos_valor_pessoas_externo_unq
  on public.ws_campos_valor_pessoas (valor_id, identidade_externa_id);

-- ============================================================
-- membros de contexto: idem
-- ============================================================
drop index if exists public.ws_contexto_membros_usuario_unq;
create unique index if not exists ws_contexto_membros_usuario_unq
  on public.ws_contexto_membros (contexto_id, usuario_id);

drop index if exists public.ws_contexto_membros_externo_unq;
create unique index if not exists ws_contexto_membros_externo_unq
  on public.ws_contexto_membros (contexto_id, identidade_externa_id);

-- ============================================================
-- O QUE FICA PARCIAL DE PROPÓSITO
-- ============================================================
-- ws_contextos_cliente_unico  (where cliente_id is not null and arquivado_em is null)
--   Precisa ser parcial: um cliente pode ter uma pasta ATIVA e várias
--   arquivadas. Nenhum upsert aponta pra ele.
--
-- ws_tarefas_ocorrencia_unica (where ocorrencia_chave is not null)
--   Idem — só garante idempotência da recorrência, não é alvo de ON CONFLICT.
--
-- ws_links_dedupe_idx (índice de EXPRESSÃO com coalesce)
--   Índice de expressão também não é inferível por ON CONFLICT. O importador
--   trata isso no código: insere e tolera o erro 23505, deixando o índice
--   fazer o trabalho de impedir a duplicata. Ver workspace-import-normalizar.
