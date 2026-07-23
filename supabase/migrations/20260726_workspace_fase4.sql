-- ============================================================================
-- Workspace Fase 4 — foto de perfil que carrega, grupos por relação e
-- ordem 100% do usuário.
--
-- APLICAR: Supabase → SQL Editor → colar este arquivo → Run.
-- Idempotente: pode rodar duas vezes sem efeito colateral.
--
-- Aplicar DEPOIS de 20260724_workspace_fase2.sql e 20260725_workspace_fase3.sql.
-- ============================================================================

-- ============================================================
-- 1) BUCKET PÚBLICO SÓ PARA FOTO DE PERFIL
-- ============================================================
-- BUG QUE ISTO CORRIGE: as fotos eram gravadas em 'ws-anexos', que é
-- PRIVADO de propósito (guarda documento de cliente). O upload usava
-- getPublicUrl(), então a URL era salva com sucesso e a imagem respondia
-- 400 Bad Request — o ícone de imagem quebrada que apareceu no sistema.
--
-- Avatar não é documento: é público por natureza e precisa renderizar em
-- toda tela sem signed URL (que expira e quebraria a foto guardada). Bucket
-- separado e público, com caminho UUID não-adivinhável — mesmo padrão do
-- 'crm-midia', que funciona desde a fase 3 do CRM.
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('ws-perfil', 'ws-perfil', true)
  on conflict (id) do nothing;
exception when undefined_table then
  null; -- ambiente sem schema storage (ex.: banco local)
end $$;

-- ============================================================
-- 2) GRUPO DE EMPRESA VIRA RELAÇÃO, NÃO TEXTO
-- ============================================================
-- BUG QUE ISTO CORRIGE: o agrupamento da aba Clientes casava a STRING
-- empresa_nome. Os dados importados do Asana ficaram com caixas diferentes
-- ("ASSESSORIA SUN" nos clientes, "Assessoria Sun" na âncora), e o mesmo
-- grupo aparecia DUAS vezes — um com os 8 clientes e outro vazio pedindo
-- "arraste clientes para cá".
--
-- Agora cada contexto aponta para a âncora do seu grupo. Renomear a empresa
-- deixa de reagrupar nada, e caixa/acento não têm mais efeito colateral.
alter table public.ws_contextos
  add column if not exists grupo_id uuid references public.ws_contextos(id) on delete set null;

create index if not exists ws_contextos_grupo_idx
  on public.ws_contextos (grupo_id, ordem) where arquivado_em is null;

-- ---------- 2.1 Âncora para toda empresa que ainda não tem ----------
-- Fontes: empresa_nome dos contextos existentes + empresa_nome dos clientes
-- de tráfego ativos (que ainda podem não ter pasta no Workspace).
-- Comparação por lower(btrim(...)): é exatamente a duplicata que queremos
-- eliminar. A âncora criada herda a MENOR ordem do grupo, pra posição atual
-- na tela não dar um salto depois da migração.
with nomes as (
  select distinct btrim(empresa_nome) as nome
    from public.ws_contextos
   where empresa_nome is not null and btrim(empresa_nome) <> ''
     and arquivado_em is null
  union
  select distinct btrim(empresa_nome) as nome
    from public.cliente_trafego
   where ativo = true and empresa_nome is not null and btrim(empresa_nome) <> ''
),
faltantes as (
  select n.nome
    from nomes n
   where not exists (
     select 1 from public.ws_contextos a
      where a.tipo = 'empresa'
        and a.arquivado_em is null
        and lower(btrim(coalesce(a.empresa_nome, a.nome))) = lower(n.nome)
   )
)
insert into public.ws_contextos (nome, tipo, empresa_nome, ordem)
select f.nome, 'empresa', f.nome,
       coalesce((
         select min(c.ordem) from public.ws_contextos c
          where c.tipo = 'cliente' and c.arquivado_em is null
            and lower(btrim(c.empresa_nome)) = lower(f.nome)
       ), 9000)
  from faltantes f;

-- ---------- 2.2 Liga cada contexto à sua âncora ----------
-- Só preenche quem está sem grupo: rodar de novo não desfaz arrasto manual.
update public.ws_contextos c
   set grupo_id = a.id
  from public.ws_contextos a
 where c.grupo_id is null
   and c.arquivado_em is null
   and c.tipo <> 'empresa'
   and c.empresa_nome is not null
   and a.tipo = 'empresa'
   and a.arquivado_em is null
   and lower(btrim(coalesce(a.empresa_nome, a.nome))) = lower(btrim(c.empresa_nome));

-- ---------- 2.3 Âncora aponta para si mesma ----------
-- Assim "todo contexto de um grupo tem o mesmo grupo_id" vale sem exceção,
-- e a consulta da tela não precisa de um caso especial pra âncora.
update public.ws_contextos
   set grupo_id = id
 where tipo = 'empresa' and grupo_id is null and arquivado_em is null;

-- ---------- 2.4 Nome do grupo passa a ser o da âncora ----------
-- empresa_nome dos filhos vira espelho (mantido só pra compatibilidade com
-- consultas antigas); a fonte de verdade do nome é a âncora.
update public.ws_contextos c
   set empresa_nome = coalesce(a.empresa_nome, a.nome)
  from public.ws_contextos a
 where c.grupo_id = a.id
   and c.tipo <> 'empresa'
   and c.arquivado_em is null
   and c.empresa_nome is distinct from coalesce(a.empresa_nome, a.nome);

-- ============================================================
-- 3) ORDEM EXPLÍCITA PARA TODO MUNDO
-- ============================================================
-- ordem=0 em massa (o default) fazia o desempate cair no nome, então
-- adicionar um cliente parecia "reordenar sozinho". Aqui cada linha ganha
-- uma posição própria, respeitando a ordem que já está na tela hoje:
-- âncoras por ordem/nome, clientes por ordem/nome dentro do grupo.
with pos as (
  select id, row_number() over (order by ordem, nome) * 10 as nova
    from public.ws_contextos
   where tipo = 'empresa' and arquivado_em is null
)
update public.ws_contextos c set ordem = pos.nova
  from pos where pos.id = c.id and c.ordem is distinct from pos.nova;

with pos as (
  select id,
         row_number() over (partition by grupo_id order by ordem, nome) * 10 as nova
    from public.ws_contextos
   where tipo <> 'empresa' and arquivado_em is null and grupo_id is not null
)
update public.ws_contextos c set ordem = pos.nova
  from pos where pos.id = c.id and c.ordem is distinct from pos.nova;
