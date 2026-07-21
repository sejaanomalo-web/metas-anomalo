// =============================================================================
// Workspace — normalização: ws_import_raw → tabelas canônicas. Server-only.
// =============================================================================
//
// Lê do STAGING, nunca do Asana. Isso é o que torna a etapa replayável: dá pra
// rodar, conferir, ajustar e rodar de novo sem gastar rate limit nem depender
// da origem estar no ar.
//
// Dividida em duas partes, de propósito:
//
//   normalizarBase()    usuários, projetos, seções e definições de campo.
//                       Barato e seguro. É o que dá matéria-prima pra tela de
//                       mapeamento (o humano decide quem é cliente e quem é
//                       quem ANTES de 1.588 tarefas entrarem).
//
//   normalizarTarefas() tarefas, vínculos, comentários, seguidores, valores de
//                       campo e links. Roda depois do mapeamento aprovado.
//
// IDEMPOTÊNCIA: tudo casa por source_gid (índice único COMUM — parcial não
// funciona com ON CONFLICT, ver 20260723_workspace_indices_upsert.sql) e
// registra em ws_import_mapeamentos. Rodar duas vezes atualiza; não duplica.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AsanaComentario, AsanaCustomField, AsanaProjeto, AsanaSecao, AsanaTarefa, AsanaUsuario } from "./asana/tipos"
import { converterHtmlAsana, extrairUrls, normalizarUrl } from "./workspace-html"
import { refinarNumero, tipoCampoDoAsana, type TipoCampo } from "./workspace-campos"
import { normalizar, prazoDoAsana, registrarErro } from "./workspace-import"
import { dominioDe } from "./workspace-import"

// ============================================================
// Leitura paginada do staging
// ============================================================

/**
 * O PostgREST corta em 1.000 linhas por padrão. Ler as 1.588 tarefas sem
 * paginar traria 1.000 e o resto sumiria em silêncio — exatamente o tipo de
 * perda que este módulo inteiro existe pra evitar.
 */
async function lerRaw<T>(
  db: SupabaseClient,
  execucaoId: string,
  tipo: string
): Promise<{ gid: string; parent: string | null; payload: T }[]> {
  const out: { gid: string; parent: string | null; payload: T }[] = []
  const PAGINA = 500
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await db
      .from("ws_import_raw")
      .select("source_gid, source_parent_gid, payload")
      .eq("execucao_id", execucaoId)
      .eq("tipo_objeto", tipo)
      .order("id")
      .range(offset, offset + PAGINA - 1)
    if (error) throw new Error(`lerRaw ${tipo}: ${error.message}`)
    const linhas = (data ?? []) as {
      source_gid: string
      source_parent_gid: string | null
      payload: T
    }[]
    for (const l of linhas) {
      out.push({ gid: l.source_gid, parent: l.source_parent_gid, payload: l.payload })
    }
    if (linhas.length < PAGINA) break
  }
  return out
}

async function mapear(
  db: SupabaseClient,
  tipo: string,
  sourceGid: string,
  tabela: string,
  id: string
): Promise<void> {
  await db.from("ws_import_mapeamentos").upsert(
    {
      sistema: "asana",
      tipo_objeto: tipo,
      source_gid: sourceGid,
      tabela_destino: tabela,
      id_destino: id,
      ultimo_sync_em: new Date().toISOString(),
    },
    { onConflict: "sistema,tipo_objeto,source_gid" }
  )
}


/**
 * Insere um link tolerando duplicata.
 *
 * ws_links_dedupe_idx é um índice de EXPRESSÃO (usa coalesce pra tratar os
 * NULLs de tarefa/comentario/contexto). ON CONFLICT não consegue inferir
 * índice de expressão, então aqui o insert é direto e o 23505 (unique
 * violation) é tratado como sucesso: o índice fez o trabalho de barrar a
 * duplicata, que é exatamente o que a gente queria.
 */
async function inserirLink(
  db: SupabaseClient,
  linha: Record<string, unknown>
): Promise<boolean> {
  const { error } = await db.from("ws_links_externos").insert(linha)
  if (!error) return true
  if (error.code === "23505") return false // já existia — ok
  return false
}

// ============================================================
// Classificação de projeto
// ============================================================

/**
 * Tipo do contexto pelo nome do projeto. Só classifica o que é
 * inequívoco — todo o resto vira 'desconhecido' e espera decisão humana.
 * Nenhum projeto vira cliente automaticamente; essa é regra do plano.
 */
export function tipoDoProjeto(nome: string): string {
  const n = normalizar(nome)
  if (n === "calendariodeconteudo") return "calendario_conteudo"
  if (n === "estudos") return "estudos"
  if (n === "arquivos") return "arquivos"
  if (n === "aprovados") return "aprovados"
  if (n === "clientes") return "geral"
  if (n.includes("anomalohub") || n === "hub") return "interno"
  return "desconhecido"
}

// ============================================================
// PARTE 1 — base
// ============================================================

export interface ResultadoBase {
  identidades: number
  identidadesJaMapeadas: number
  contextos: number
  contextosAdotados: number
  secoes: number
  definicoes: number
  opcoes: number
}

export async function normalizarBase(
  db: SupabaseClient,
  execucaoId: string,
  log: (m: string) => void = () => {}
): Promise<ResultadoBase> {
  const r: ResultadoBase = {
    identidades: 0, identidadesJaMapeadas: 0, contextos: 0,
    contextosAdotados: 0, secoes: 0, definicoes: 0, opcoes: 0,
  }

  // ---------- usuários ----------
  const usuariosRaw = await lerRaw<AsanaUsuario>(db, execucaoId, "user")
  const { data: locaisData } = await db
    .from("usuarios")
    .select("id, nome, email")
    .eq("ativo", true)
  const locais = (locaisData ?? []) as { id: string; nome: string; email: string }[]

  for (const u of usuariosRaw) {
    const nome = u.payload.name ?? ""
    const email = u.payload.email ?? null

    // Casamento automático SÓ quando é inequívoco: e-mail exato, ou nome
    // completo normalizado idêntico. "Job" vs "Job Nilton" NÃO casa aqui de
    // propósito — quem decide isso é o humano na tela de mapeamento.
    const porEmail = email
      ? locais.find((l) => l.email?.toLowerCase() === email.toLowerCase())
      : undefined
    const porNome = locais.find((l) => normalizar(l.nome) === normalizar(nome))
    const alvo = porEmail ?? porNome ?? null

    const { data, error } = await db
      .from("ws_identidades_externas")
      .upsert(
        {
          sistema: "asana",
          source_gid: u.gid,
          nome,
          email,
          ...(alvo ? { usuario_id: alvo.id, mapeado_em: new Date().toISOString() } : {}),
        },
        { onConflict: "sistema,source_gid" }
      )
      .select("id, usuario_id")
      .single()
    if (error || !data) {
      await registrarErro(execucaoId, "normalizacao", "identidade_falhou",
        error?.message ?? "sem retorno", { tipoObjeto: "user", sourceGid: u.gid })
      continue
    }
    r.identidades++
    if (data.usuario_id) r.identidadesJaMapeadas++
    await mapear(db, "user", u.gid, "ws_identidades_externas", data.id as string)
  }
  log(`identidades: ${r.identidades} (${r.identidadesJaMapeadas} já casadas)`)

  // ---------- projetos → contextos ----------
  const projetosRaw = await lerRaw<AsanaProjeto>(db, execucaoId, "project")

  // Contextos que já existem SEM source_gid (os semeados pela migration e os
  // que o Bruno criou na mão). Sem esta adoção, importar "Calendário de
  // conteúdo" criaria uma SEGUNDA pasta com o mesmo nome.
  const { data: existentesData } = await db
    .from("ws_contextos")
    .select("id, nome, source_gid, tipo, cliente_id")
    .is("source_gid", null)
    .is("arquivado_em", null)
  const semGid = (existentesData ?? []) as {
    id: string; nome: string; tipo: string; cliente_id: string | null
  }[]

  const contextoPorGid = new Map<string, string>()

  for (const p of projetosRaw) {
    const nome = p.payload.name ?? p.gid
    const tipo = tipoDoProjeto(nome)
    const candidato = semGid.find((c) => normalizar(c.nome) === normalizar(nome))

    const campos = {
      nome,
      nome_normalizado: normalizar(nome),
      tipo,
      privado: p.payload.public === false,
      visualizacao_padrao: p.payload.default_view ?? null,
      notas: p.payload.notes ?? null,
      notas_html: p.payload.html_notes ?? null,
      cor: null as string | null,
      source_gid: p.gid,
      source_criado_em: p.payload.created_at ?? null,
      source_modificado_em: p.payload.modified_at ?? null,
      arquivado_em: p.payload.archived ? new Date().toISOString() : null,
    }

    let contextoId: string
    if (candidato) {
      // ADOTA a linha existente em vez de criar outra — E PRESERVA a
      // classificação que já estava lá.
      //
      // Se alguém já disse "esta pasta é do cliente Ivone", sobrescrever com
      // 'desconhecido' desfaria uma decisão humana. Pior: violaria o CHECK
      // ws_contextos_cliente_coerente (tipo<>'cliente' exige cliente_id nulo),
      // derrubando a adoção inteira. Foi exatamente o que aconteceu com
      // IVONE CORRETORA na primeira execução.
      const jaClassificado = candidato.tipo !== "desconhecido"
      const camposAdocao = jaClassificado
        ? { ...campos, tipo: candidato.tipo, cliente_id: candidato.cliente_id }
        : campos

      // Este projeto já pode ter contexto próprio de uma execução anterior
      // (foi o que aconteceu quando a primeira rodada falhou pela metade).
      // Nesse caso adotar daria violação de unique — e, pior, deixaria duas
      // pastas com o mesmo nome. Em vez disso: transfere a classificação do
      // duplicado manual para o importado e remove o manual, se estiver vazio.
      const { data: jaImportado } = await db
        .from("ws_contextos")
        .select("id, tipo")
        .eq("source_gid", p.gid)
        .neq("id", candidato.id)
        .maybeSingle()

      if (jaImportado) {
        const importadoId = (jaImportado as { id: string; tipo: string }).id
        const { count: tarefasNoManual } = await db
          .from("ws_tarefa_contextos")
          .select("*", { count: "exact", head: true })
          .eq("contexto_id", candidato.id)

        if ((tarefasNoManual ?? 0) === 0) {
          if (jaClassificado) {
            await db
              .from("ws_contextos")
              .update({ tipo: candidato.tipo, cliente_id: candidato.cliente_id })
              .eq("id", importadoId)
          }
          await db.from("ws_contextos").delete().eq("id", candidato.id)
        } else {
          // Tem tarefa dentro: nunca apagar. Fica pro humano resolver.
          await registrarErro(execucaoId, "normalizacao", "contexto_duplicado_com_tarefas",
            `"${nome}" existe manualmente e importado; o manual tem tarefas`,
            { tipoObjeto: "project", sourceGid: p.gid })
        }
        r.contextos++
        contextoPorGid.set(p.gid, importadoId)
        await mapear(db, "project", p.gid, "ws_contextos", importadoId)
        continue
      }

      const { error } = await db
        .from("ws_contextos")
        .update(camposAdocao)
        .eq("id", candidato.id)
      if (error) {
        await registrarErro(execucaoId, "normalizacao", "contexto_adocao_falhou",
          error.message, { tipoObjeto: "project", sourceGid: p.gid })
        continue
      }
      contextoId = candidato.id
      r.contextosAdotados++
    } else {
      const { data, error } = await db
        .from("ws_contextos")
        .upsert(campos, { onConflict: "source_gid" })
        .select("id")
        .single()
      if (error || !data) {
        await registrarErro(execucaoId, "normalizacao", "contexto_falhou",
          error?.message ?? "sem retorno", { tipoObjeto: "project", sourceGid: p.gid })
        continue
      }
      contextoId = data.id as string
    }
    r.contextos++
    contextoPorGid.set(p.gid, contextoId)
    await mapear(db, "project", p.gid, "ws_contextos", contextoId)
  }
  log(`contextos: ${r.contextos} (${r.contextosAdotados} adotados de linhas existentes)`)

  // ---------- seções ----------
  const secoesRaw = await lerRaw<AsanaSecao>(db, execucaoId, "section")
  for (const s of secoesRaw) {
    const contextoId = s.parent ? contextoPorGid.get(s.parent) : undefined
    if (!contextoId) continue
    const original = s.payload.name ?? null
    // 62 das 73 seções se chamam "Untitled section". O nome exibido vira
    // "Geral"; o original fica guardado pra reconciliação bater.
    const semNome = !original || /^(untitled section|seção sem título)$/i.test(original.trim())
    const { data, error } = await db
      .from("ws_secoes")
      .upsert(
        {
          contexto_id: contextoId,
          nome: semNome ? "Geral" : original,
          nome_original: original,
          source_gid: s.gid,
        },
        { onConflict: "source_gid" }
      )
      .select("id")
      .single()
    if (error || !data) continue
    r.secoes++
    await mapear(db, "section", s.gid, "ws_secoes", data.id as string)
  }
  log(`seções: ${r.secoes}`)

  // ---------- definições de campo ----------
  const camposRaw = await lerRaw<AsanaCustomField>(db, execucaoId, "custom_field")
  for (const c of camposRaw) {
    const cf = c.payload
    const tipo: TipoCampo = refinarNumero(
      tipoCampoDoAsana(cf.type, cf.resource_subtype),
      cf.format
    )
    const { data, error } = await db
      .from("ws_campos_definicoes")
      .upsert(
        {
          nome: cf.name ?? "(sem nome)",
          descricao: cf.description ?? null,
          tipo,
          tipo_origem: cf.resource_subtype ?? cf.type ?? null,
          config: {
            precision: cf.precision ?? null,
            format: cf.format ?? null,
            currency_code: cf.currency_code ?? null,
          },
          renderer_key: tipo,
          source_gid: c.gid,
        },
        { onConflict: "source_gid" }
      )
      .select("id")
      .single()
    if (error || !data) {
      await registrarErro(execucaoId, "normalizacao", "campo_falhou",
        error?.message ?? "sem retorno", { tipoObjeto: "custom_field", sourceGid: c.gid })
      continue
    }
    r.definicoes++
    const definicaoId = data.id as string
    await mapear(db, "custom_field", c.gid, "ws_campos_definicoes", definicaoId)

    for (const [i, op] of (cf.enum_options ?? []).entries()) {
      if (!op.gid) continue
      const { error: eOp } = await db.from("ws_campos_opcoes").upsert(
        {
          definicao_id: definicaoId,
          rotulo: op.name ?? "(sem rótulo)",
          cor: op.color ?? null,
          habilitada: op.enabled !== false,
          ordem: i,
          source_gid: op.gid,
        },
        { onConflict: "source_gid" }
      )
      if (!eOp) r.opcoes++
    }
  }
  log(`definições de campo: ${r.definicoes} (${r.opcoes} opções)`)

  return r
}

// ============================================================
// PARTE 2 — tarefas
// ============================================================

export interface ResultadoTarefas {
  tarefas: number
  /** Tarefas dentro da janela: vieram com descrição, comentários, campos e links. */
  completas: number
  /** Fora da janela: só título, prazo, status, responsável e contextos. */
  enxutas: number
  subtarefas: number
  vinculos: number
  comentarios: number
  seguidores: number
  seguidoresExternos: number
  valoresCampo: number
  links: number
  ignoradasSemContexto: number
}

/**
 * Janela de importação completa.
 *
 * Decisão do Bruno (2026-07-23): trazer tudo de 1.588 tarefas seria carregar
 * seis meses de histórico com peso total. O acordo é:
 *
 *   • prazo >= corte (julho/2026)         -> COMPLETA
 *   • sem prazo E ainda pendente          -> COMPLETA (é o backlog vivo: 57
 *                                            tarefas em aberto que só não têm
 *                                            data marcada)
 *   • resto                               -> ENXUTA: título, prazo, status,
 *                                            responsável e contextos. Aparece
 *                                            no calendário e na pasta do
 *                                            cliente, mas sem descrição,
 *                                            comentários, campos nem links.
 *
 * O staging continua com TUDO. Mudar de ideia é rodar de novo com outro corte;
 * nada precisa ser reextraído do Asana.
 */
export interface Janela {
  /** 'YYYY-MM-DD'. Prazo a partir daqui entra completo. */
  corte: string
}

export const JANELA_PADRAO: Janela = { corte: "2026-07-01" }

/** Uma tarefa entra completa? Ver comentário de Janela. */
export function entraCompleta(
  prazoData: string | null,
  concluida: boolean,
  janela: Janela
): boolean {
  if (prazoData) return prazoData >= janela.corte
  return !concluida
}

export async function normalizarTarefas(
  db: SupabaseClient,
  execucaoId: string,
  log: (m: string) => void = () => {},
  janela: Janela = JANELA_PADRAO
): Promise<ResultadoTarefas> {
  const r: ResultadoTarefas = {
    tarefas: 0, completas: 0, enxutas: 0, subtarefas: 0, vinculos: 0, comentarios: 0, seguidores: 0,
    seguidoresExternos: 0, valoresCampo: 0, links: 0, ignoradasSemContexto: 0,
  }

  // --- índices de resolução, carregados uma vez ---
  const { data: mapsData } = await db
    .from("ws_import_mapeamentos")
    .select("tipo_objeto, source_gid, id_destino")
    .eq("sistema", "asana")
  const maps = (mapsData ?? []) as {
    tipo_objeto: string; source_gid: string; id_destino: string
  }[]
  const idxContexto = new Map<string, string>()
  const idxSecao = new Map<string, string>()
  const idxDefinicao = new Map<string, string>()
  for (const m of maps) {
    if (m.tipo_objeto === "project") idxContexto.set(m.source_gid, m.id_destino)
    if (m.tipo_objeto === "section") idxSecao.set(m.source_gid, m.id_destino)
    if (m.tipo_objeto === "custom_field") idxDefinicao.set(m.source_gid, m.id_destino)
  }

  const { data: identData } = await db
    .from("ws_identidades_externas")
    .select("id, source_gid, usuario_id")
    .eq("sistema", "asana")
  const idxIdentidade = new Map<string, { id: string; usuarioId: string | null }>()
  for (const i of (identData ?? []) as {
    id: string; source_gid: string; usuario_id: string | null
  }[]) {
    idxIdentidade.set(i.source_gid, { id: i.id, usuarioId: i.usuario_id })
  }

  const { data: opcoesData } = await db
    .from("ws_campos_opcoes")
    .select("id, source_gid")
  const idxOpcao = new Map<string, string>()
  for (const o of (opcoesData ?? []) as { id: string; source_gid: string | null }[]) {
    if (o.source_gid) idxOpcao.set(o.source_gid, o.id)
  }

  /** Resolve um usuário do Asana para (usuario_id, identidade_id). */
  function pessoa(gid: string | undefined | null): {
    usuarioId: string | null; identidadeId: string | null
  } {
    if (!gid) return { usuarioId: null, identidadeId: null }
    const i = idxIdentidade.get(gid)
    if (!i) return { usuarioId: null, identidadeId: null }
    return { usuarioId: i.usuarioId, identidadeId: i.usuarioId ? null : i.id }
  }

  // --- tarefas e subtarefas, na ordem (pai antes de filho) ---
  const tarefasRaw = await lerRaw<AsanaTarefa>(db, execucaoId, "task")
  const subtarefasRaw = await lerRaw<AsanaTarefa>(db, execucaoId, "subtask")
  const idxTarefa = new Map<string, string>()

  async function gravarTarefa(
    t: AsanaTarefa,
    gid: string,
    paiId: string | null,
    completa: boolean
  ): Promise<string | null> {
    // Enxuta não converte descrição: além de economizar, evita gravar HTML
    // original de 1.357 tarefas que ninguém vai abrir.
    const conv = completa
      ? converterHtmlAsana(t.html_notes, t.notes)
      : { texto: "", links: [] as string[], tagsIgnoradas: [] as string[] }
    const prazo = prazoDoAsana(t.due_on, t.due_at)
    const inicio = prazoDoAsana(t.start_on, t.start_at)
    const resp = pessoa(t.assignee?.gid)
    const criador = pessoa(t.created_by?.gid)
    const concluidor = pessoa(t.completed_by?.gid)

    // concluida_em precisa existir sempre que a tarefa está concluída — o
    // CHECK do banco depende disso. O Asana às vezes traz completed=true sem
    // completed_at (tarefas muito antigas); cai pro modified_at.
    const concluidaEm = t.completed
      ? t.completed_at ?? t.modified_at ?? new Date().toISOString()
      : null

    const { data, error } = await db
      .from("ws_tarefas")
      .upsert(
        {
          titulo: (t.name ?? "(sem título)").slice(0, 300) || "(sem título)",
          descricao: completa ? conv.texto || null : null,
          descricao_html_original: completa ? t.html_notes ?? null : null,
          tarefa_pai_id: paiId,
          responsavel_id: resp.usuarioId,
          responsavel_externo_id: resp.identidadeId,
          criado_por: criador.usuarioId,
          criado_por_externo_id: criador.identidadeId,
          prazo_em: prazo.data,
          prazo_hora: prazo.hora,
          inicio_em: inicio.data,
          inicio_hora: inicio.hora,
          concluida_em: concluidaEm,
          concluida_por: concluidaEm ? concluidor.usuarioId : null,
          concluida_por_externo_id: concluidaEm ? concluidor.identidadeId : null,
          resource_subtype: t.resource_subtype ?? null,
          approval_status: t.approval_status ?? null,
          source_gid: gid,
          source_criado_em: t.created_at ?? null,
          source_modificado_em: t.modified_at ?? null,
        },
        { onConflict: "source_gid" }
      )
      .select("id")
      .single()

    if (error || !data) {
      await registrarErro(execucaoId, "normalizacao", "tarefa_falhou",
        error?.message ?? "sem retorno", { tipoObjeto: "task", sourceGid: gid })
      return null
    }
    const tarefaId = data.id as string
    await mapear(db, paiId ? "subtask" : "task", gid, "ws_tarefas", tarefaId)

    if (completa) r.completas++
    else {
      // Enxuta para aqui: nada de links, seguidores nem campos. O título, o
      // prazo, o status, o responsável e (adiante) os vínculos já foram
      // gravados — é o registro histórico que o Bruno pediu.
      r.enxutas++
      return tarefaId
    }

    // --- links da descrição ---
    const urls = conv.links.length > 0 ? conv.links : extrairUrls(conv.texto)
    for (const [i, u] of urls.entries()) {
      const dom = dominioDe(u)
      if (!dom) continue
      const novo = await inserirLink(db, {
        tarefa_id: tarefaId,
        url: u,
        url_normalizada: normalizarUrl(u),
        dominio: dom,
        origem: "descricao",
        posicao: i,
        source_object_gid: gid,
      })
      if (novo) r.links++
    }

    // --- seguidores ---
    for (const f of t.followers ?? []) {
      const p = pessoa(f.gid)
      if (p.usuarioId) {
        const { error: e } = await db.from("ws_seguidores").upsert(
          { tarefa_id: tarefaId, usuario_id: p.usuarioId },
          { onConflict: "tarefa_id,usuario_id", ignoreDuplicates: true }
        )
        if (!e) r.seguidores++
      } else if (p.identidadeId) {
        const { error: e } = await db.from("ws_seguidores_externos").upsert(
          { tarefa_id: tarefaId, identidade_externa_id: p.identidadeId },
          { onConflict: "tarefa_id,identidade_externa_id", ignoreDuplicates: true }
        )
        if (!e) r.seguidoresExternos++
      }
    }

    // --- valores de campo personalizado ---
    for (const cf of t.custom_fields ?? []) {
      if (!cf.gid) continue
      const definicaoId = idxDefinicao.get(cf.gid)
      if (!definicaoId) continue
      const tipo: TipoCampo = refinarNumero(
        tipoCampoDoAsana(cf.type, cf.resource_subtype),
        cf.format
      )
      const temValor =
        cf.text_value != null || cf.number_value != null ||
        cf.enum_value != null || (cf.multi_enum_values ?? []).length > 0 ||
        (cf.people_value ?? []).length > 0 || cf.date_value?.date != null
      if (!temValor) continue

      const linha: Record<string, unknown> = {
        tarefa_id: tarefaId,
        definicao_id: definicaoId,
        // valor_bruto SEMPRE preenchido: é a garantia de que nada se perde,
        // mesmo se o tipo for desconhecido ou a leitura estiver errada.
        valor_bruto: cf,
      }
      if (tipo === "texto" || tipo === "url") linha.valor_texto = cf.text_value ?? cf.display_value ?? null
      if (tipo === "numero" || tipo === "moeda" || tipo === "percentual") linha.valor_numero = cf.number_value ?? null
      if (tipo === "data") linha.valor_data = cf.date_value?.date ?? null
      if (tipo === "data_hora") linha.valor_data_hora = cf.date_value?.date_time ?? null

      const { data: dv, error: ev } = await db
        .from("ws_campos_valores")
        .upsert(linha, { onConflict: "tarefa_id,definicao_id" })
        .select("id")
        .single()
      if (ev || !dv) continue
      r.valoresCampo++
      const valorId = dv.id as string

      const opcoes = [
        ...(cf.enum_value ? [cf.enum_value] : []),
        ...(cf.multi_enum_values ?? []),
      ]
      for (const op of opcoes) {
        const opcaoId = op.gid ? idxOpcao.get(op.gid) : undefined
        if (opcaoId) {
          await db.from("ws_campos_valor_opcoes").upsert(
            { valor_id: valorId, opcao_id: opcaoId },
            { onConflict: "valor_id,opcao_id", ignoreDuplicates: true }
          )
        }
      }
      for (const pv of cf.people_value ?? []) {
        const p = pessoa(pv.gid)
        if (p.usuarioId) {
          await db.from("ws_campos_valor_pessoas").upsert(
            { valor_id: valorId, usuario_id: p.usuarioId },
            { onConflict: "valor_id,usuario_id", ignoreDuplicates: true }
          )
        } else if (p.identidadeId) {
          await db.from("ws_campos_valor_pessoas").upsert(
            { valor_id: valorId, identidade_externa_id: p.identidadeId },
            { onConflict: "valor_id,identidade_externa_id", ignoreDuplicates: true }
          )
        }
      }
    }

    return tarefaId
  }

  // tarefas de topo
  const completaPorGid = new Map<string, boolean>()
  for (const t of tarefasRaw) {
    const p = prazoDoAsana(t.payload.due_on, t.payload.due_at)
    const completa = entraCompleta(p.data, Boolean(t.payload.completed), janela)
    completaPorGid.set(t.gid, completa)
    const id = await gravarTarefa(t.payload, t.gid, null, completa)
    if (!id) continue
    idxTarefa.set(t.gid, id)
    r.tarefas++
  }
  log(`tarefas: ${r.tarefas} (${r.completas} completas, ${r.enxutas} enxutas)`)

  // subtarefas (pai já existe)
  for (const s of subtarefasRaw) {
    const paiGid = s.payload.parent?.gid ?? s.parent
    const paiId = paiGid ? idxTarefa.get(paiGid) : undefined
    if (!paiId) {
      r.ignoradasSemContexto++
      await registrarErro(execucaoId, "normalizacao", "subtarefa_sem_pai",
        "pai não encontrado no snapshot", { tipoObjeto: "subtask", sourceGid: s.gid })
      continue
    }
    // Subtarefa herda a janela do pai: uma subtarefa de tarefa completa entra
    // completa, mesmo sem prazo próprio. Separá-las daria pai rico com filho
    // vazio, que confunde mais do que economiza.
    const id = await gravarTarefa(
      s.payload, s.gid, paiId, completaPorGid.get(paiGid!) ?? false
    )
    if (!id) continue
    idxTarefa.set(s.gid, id)
    r.subtarefas++
  }
  log(`subtarefas: ${r.subtarefas}`)

  // --- vínculos tarefa ↔ contexto (a regra estrutural) ---
  for (const t of tarefasRaw) {
    const tarefaId = idxTarefa.get(t.gid)
    if (!tarefaId) continue
    const ms = t.payload.memberships ?? []
    // Fallback: algumas tarefas trazem `projects` mas memberships vazio.
    const pares = ms.length > 0
      ? ms.map((m) => ({ projeto: m.project?.gid, secao: m.section?.gid }))
      : (t.payload.projects ?? []).map((p) => ({ projeto: p.gid, secao: undefined }))

    for (const par of pares) {
      const contextoId = par.projeto ? idxContexto.get(par.projeto) : undefined
      if (!contextoId) continue
      const secaoId = par.secao ? idxSecao.get(par.secao) ?? null : null
      const { error } = await db.from("ws_tarefa_contextos").upsert(
        { tarefa_id: tarefaId, contexto_id: contextoId, secao_id: secaoId },
        { onConflict: "tarefa_id,contexto_id" }
      )
      if (!error) r.vinculos++
    }
  }
  log(`vínculos tarefa↔contexto: ${r.vinculos}`)

  // --- comentários ---
  const comentariosRaw = await lerRaw<AsanaComentario>(db, execucaoId, "comment")
  for (const c of comentariosRaw) {
    const tarefaId = c.parent ? idxTarefa.get(c.parent) : undefined
    if (!tarefaId) continue
    // Comentário só das completas — na enxuta a tarefa é só o registro.
    if (!completaPorGid.get(c.parent!)) continue
    const conv = converterHtmlAsana(c.payload.html_text, c.payload.text)
    const autor = pessoa(c.payload.created_by?.gid)
    if (!autor.usuarioId && !autor.identidadeId) continue // CHECK exige um dos dois

    const { data, error } = await db
      .from("ws_comentarios")
      .upsert(
        {
          tarefa_id: tarefaId,
          autor_id: autor.usuarioId,
          autor_externo_id: autor.identidadeId,
          corpo: conv.texto || "(comentário vazio)",
          corpo_html_original: c.payload.html_text ?? null,
          source_gid: c.gid,
          source_criado_em: c.payload.created_at ?? null,
        },
        { onConflict: "source_gid" }
      )
      .select("id")
      .single()
    if (error || !data) continue
    r.comentarios++
    const comentarioId = data.id as string
    await mapear(db, "comment", c.gid, "ws_comentarios", comentarioId)

    for (const [i, u] of conv.links.entries()) {
      const dom = dominioDe(u)
      if (!dom) continue
      const novo = await inserirLink(db, {
        comentario_id: comentarioId,
        tarefa_id: tarefaId,
        url: u,
        url_normalizada: normalizarUrl(u),
        dominio: dom,
        origem: "comentario",
        posicao: i,
        source_object_gid: c.gid,
      })
      if (novo) r.links++
    }
  }
  log(`comentários: ${r.comentarios}`)

  return r
}
