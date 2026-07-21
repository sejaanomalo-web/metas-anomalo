// =============================================================================
// Workspace — importação do Asana: extração, staging e dry-run. Server-only.
// =============================================================================
//
// ORDEM SAGRADA (plano §9): extrair → gravar CRU em ws_import_raw → analisar →
// só então normalizar. Nada é interpretado antes de estar salvo. Se o
// normalizador não souber ler um campo, o dado continua íntegro no staging e a
// execução acusa a pendência em vez de perder em silêncio.
//
// Este arquivo faz as três primeiras etapas. A normalização (staging → tabelas
// canônicas) vive em workspace-import-normalizar.ts.

import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "./supabase"
import type { AsanaSource } from "./asana/source"
import { AsanaRest } from "./asana/source"
import type {
  AsanaAnexo,
  AsanaRecurso,
  AsanaComentario,
  AsanaCustomField,
  AsanaProjeto,
  AsanaTarefa,
} from "./asana/tipos"
import { refinarNumero, tipoCampoDoAsana, tipoSuportado, type TipoCampo } from "./workspace-campos"

export const VERSAO_IMPORTADOR = "1.0.0"

export type ModoImportacao =
  | "descoberta"
  | "dry_run"
  | "completa"
  | "incremental"
  | "cutover"

export type TipoObjeto =
  | "workspace" | "team" | "user" | "project" | "section"
  | "custom_field" | "task" | "subtask" | "comment" | "attachment"

// ============================================================
// Checksum canônico
// ============================================================

/**
 * Hash estável de um objeto: chaves ordenadas recursivamente antes de
 * serializar. Sem a ordenação, o mesmo objeto vindo em outra ordem de chaves
 * geraria checksum diferente e a reexecução reescreveria tudo à toa.
 */
export function checksumCanonico(valor: unknown): string {
  return createHash("sha256").update(canonicalizar(valor)).digest("hex")
}

function canonicalizar(v: unknown): string {
  if (v === null || v === undefined) return "null"
  if (typeof v !== "object") return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonicalizar).join(",")}]`
  const obj = v as Record<string, unknown>
  const chaves = Object.keys(obj).sort()
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonicalizar(obj[k])}`).join(",")}}`
}

// ============================================================
// Execução
// ============================================================

export interface Execucao {
  id: string
  modo: ModoImportacao
}

export async function abrirExecucao(
  modo: ModoImportacao,
  snapshotEm?: string
): Promise<Execucao | null> {
  const db = getSupabaseAdmin()
  if (!db) return null
  const { data, error } = await db
    .from("ws_import_execucoes")
    .insert({
      modo,
      estado: "rodando",
      snapshot_em: snapshotEm ?? new Date().toISOString(),
      versao_importador: VERSAO_IMPORTADOR,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[import] abrirExecucao", error?.message)
    return null
  }
  return { id: data.id as string, modo }
}

export async function fecharExecucao(
  execucaoId: string,
  estado: "concluida" | "parcial" | "falhou" | "cancelada",
  contadores: Record<string, number>,
  relatorio?: unknown
): Promise<void> {
  const db = getSupabaseAdmin()
  if (!db) return
  await db
    .from("ws_import_execucoes")
    .update({
      estado,
      finalizada_em: new Date().toISOString(),
      contadores,
      relatorio: relatorio ?? null,
    })
    .eq("id", execucaoId)
}

export async function registrarErro(
  execucaoId: string,
  etapa: string,
  codigo: string,
  mensagem: string,
  extra?: { tipoObjeto?: string; sourceGid?: string; retryable?: boolean; resumo?: unknown }
): Promise<void> {
  const db = getSupabaseAdmin()
  if (!db) return
  await db.from("ws_import_erros").insert({
    execucao_id: execucaoId,
    etapa,
    codigo,
    // A mensagem NUNCA leva conteúdo de tarefa, token ou signed URL — só o
    // suficiente pra localizar o objeto na origem.
    mensagem: mensagem.slice(0, 500),
    tipo_objeto: extra?.tipoObjeto ?? null,
    source_gid: extra?.sourceGid ?? null,
    retryable: extra?.retryable ?? false,
    resumo: extra?.resumo ?? null,
  })
}

// ============================================================
// Staging
// ============================================================

interface LinhaRaw {
  execucao_id: string
  sistema: string
  tipo_objeto: string
  source_gid: string
  source_parent_gid: string | null
  payload: unknown
  checksum: string
  source_criado_em: string | null
  source_modificado_em: string | null
}

/**
 * Grava objetos crus em lote. Usa upsert com ignoreDuplicates na chave
 * (execucao, tipo, gid): reler a mesma página depois de um 429 não gera linha
 * duplicada nem derruba a execução.
 */
export async function gravarRaw(
  execucaoId: string,
  tipo: TipoObjeto,
  objetos: { gid: string; [k: string]: unknown }[],
  parentGid?: (o: { gid: string; [k: string]: unknown }) => string | null
): Promise<number> {
  const db = getSupabaseAdmin()
  if (!db || objetos.length === 0) return 0

  const linhas: LinhaRaw[] = objetos.map((o) => ({
    execucao_id: execucaoId,
    sistema: "asana",
    tipo_objeto: tipo,
    source_gid: String(o.gid),
    source_parent_gid: parentGid ? parentGid(o) : null,
    payload: o,
    checksum: checksumCanonico(o),
    source_criado_em: (o.created_at as string) ?? null,
    source_modificado_em: (o.modified_at as string) ?? (o.created_at as string) ?? null,
  }))

  let gravadas = 0
  // Lotes de 500: acima disso o payload da request fica grande demais e o
  // PostgREST começa a devolver 413 no meio da importação.
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500)
    const { error } = await db
      .from("ws_import_raw")
      .upsert(lote, {
        onConflict: "execucao_id,tipo_objeto,source_gid",
        ignoreDuplicates: true,
      })
    if (error) {
      console.error("[import] gravarRaw", tipo, error.message)
      await registrarErro(execucaoId, "staging", "raw_insert_falhou", error.message, {
        tipoObjeto: tipo,
      })
      continue
    }
    gravadas += lote.length
  }
  return gravadas
}

// ============================================================
// Extração completa
// ============================================================

export interface ResultadoExtracao {
  workspaceGid: string
  contadores: Record<string, number>
  /** Tarefas únicas por GID, já deduplicadas entre projetos. */
  tarefas: Map<string, AsanaTarefa>
  subtarefas: Map<string, AsanaTarefa>
  projetos: AsanaProjeto[]
  comentarios: Map<string, AsanaComentario[]>
  anexos: AsanaAnexo[]
  /** definição de campo por gid, e em quais projetos ela aparece */
  camposDefinicoes: Map<string, AsanaCustomField>
  camposPorProjeto: Map<string, string[]>
}

/**
 * Percorre o Asana inteiro e grava tudo em staging.
 *
 * A deduplicação por GID acontece AQUI, não no banco: uma tarefa que está em
 * 3 projetos volta 3 vezes da API, e importar as 3 criaria 3 tarefas — o
 * oposto da regra "uma tarefa, vários memberships". Os memberships de todas as
 * ocorrências são preservados porque cada payload já traz `memberships` inteiro.
 */
export async function extrair(
  source: AsanaSource,
  execucaoId: string,
  log: (m: string) => void = () => {},
  workspaceGidAlvo?: string
): Promise<ResultadoExtracao | null> {
  const workspaces = await source.workspaces()
  if (workspaces.length === 0) {
    await registrarErro(execucaoId, "extracao", "sem_workspace", "Nenhum workspace acessível")
    return null
  }
  await gravarRaw(execucaoId, "workspace", workspaces)

  // Escolha do workspace é EXPLÍCITA de propósito. Pegar workspaces[0] parece
  // funcionar até o dia em que a API devolve noutra ordem — aí a extração vem
  // vazia, sem erro, e ninguém percebe até o corte. Este token enxerga dois
  // ("My workspace" e "Minha empresa"), então a ambiguidade é real.
  let ws: AsanaRecurso
  if (workspaceGidAlvo) {
    const achado = workspaces.find((w) => w.gid === workspaceGidAlvo)
    if (!achado) {
      const lista = workspaces.map((w) => `${w.gid} (${w.name ?? "?"})`).join(", ")
      await registrarErro(
        execucaoId, "extracao", "workspace_nao_encontrado",
        `GID ${workspaceGidAlvo} não está entre os acessíveis: ${lista}`
      )
      return null
    }
    ws = achado
  } else if (workspaces.length === 1) {
    ws = workspaces[0]
  } else {
    const lista = workspaces.map((w) => `${w.gid} (${w.name ?? "?"})`).join(", ")
    await registrarErro(
      execucaoId, "extracao", "workspace_ambiguo",
      `${workspaces.length} workspaces acessíveis: ${lista}. Defina ASANA_WORKSPACE_GID.`
    )
    return null
  }
  log(`workspace: ${ws.name ?? ws.gid} (${ws.gid})`)

  const [equipes, usuarios] = await Promise.all([
    source.equipes(ws.gid),
    source.usuarios(ws.gid),
  ])
  await gravarRaw(execucaoId, "team", equipes)
  await gravarRaw(execucaoId, "user", usuarios)
  log(`${usuarios.length} usuários, ${equipes.length} equipes`)

  const projetos = await source.projetos(ws.gid)
  await gravarRaw(execucaoId, "project", projetos)
  log(`${projetos.length} projetos`)

  // Definições de campo saem do custom_field_settings de cada projeto. Os 30
  // "Colaborators" têm GIDs distintos — são definições diferentes de verdade,
  // então a chave é o GID, nunca o nome.
  const camposDefinicoes = new Map<string, AsanaCustomField>()
  const camposPorProjeto = new Map<string, string[]>()
  for (const p of projetos) {
    const gids: string[] = []
    for (const s of p.custom_field_settings ?? []) {
      const cf = s.custom_field
      if (!cf?.gid) continue
      camposDefinicoes.set(cf.gid, cf)
      gids.push(cf.gid)
    }
    camposPorProjeto.set(p.gid, gids)
  }
  await gravarRaw(execucaoId, "custom_field", [...camposDefinicoes.values()])
  log(`${camposDefinicoes.size} definições de campo`)

  // Seções e tarefas, projeto a projeto.
  const emLotes = source instanceof AsanaRest
    ? source.emLotes.bind(source)
    : async <T, R>(itens: T[], fn: (i: T, n: number) => Promise<R>) => {
        const out: R[] = []
        for (let i = 0; i < itens.length; i++) out.push(await fn(itens[i], i))
        return out
      }

  const tarefas = new Map<string, AsanaTarefa>()
  let totalAssociacoes = 0

  await emLotes(projetos, async (p: AsanaProjeto) => {
    const secoes = await source.secoes(p.gid)
    await gravarRaw(execucaoId, "section", secoes, () => p.gid)

    const doProjeto = await source.tarefasDoProjeto(p.gid)
    totalAssociacoes += doProjeto.length
    for (const t of doProjeto) {
      // Primeira ocorrência ganha; as demais são a MESMA tarefa vista de outro
      // projeto. O payload já traz memberships completo, então nada se perde.
      if (!tarefas.has(t.gid)) tarefas.set(t.gid, t)
    }
    log(`  ${p.name ?? p.gid}: ${doProjeto.length} associações`)
  })

  await gravarRaw(execucaoId, "task", [...tarefas.values()])
  log(`${totalAssociacoes} associações → ${tarefas.size} tarefas únicas`)

  // Subtarefas e comentários só de quem declara ter.
  const subtarefas = new Map<string, AsanaTarefa>()
  const comentarios = new Map<string, AsanaComentario[]>()

  const listaTarefas = [...tarefas.values()]
  await emLotes(listaTarefas, async (t: AsanaTarefa) => {
    if ((t.num_subtasks ?? 0) > 0) {
      const subs = await source.subtarefas(t.gid)
      for (const s of subs) subtarefas.set(s.gid, s)
    }
    const cs = await source.comentarios(t.gid)
    if (cs.length > 0) comentarios.set(t.gid, cs)
  })

  await gravarRaw(execucaoId, "subtask", [...subtarefas.values()], (s) => {
    const p = (s as AsanaTarefa).parent
    return p?.gid ?? null
  })
  for (const [tarefaGid, lista] of comentarios) {
    await gravarRaw(execucaoId, "comment", lista, () => tarefaGid)
  }
  log(`${subtarefas.size} subtarefas, ${[...comentarios.values()].flat().length} comentários`)

  // Anexos: projetos + tarefas + subtarefas. Não dá pra pular as subtarefas —
  // a auditoria encontrou anexo em objeto de subtarefa.
  const alvos: string[] = [
    ...projetos.map((p) => p.gid),
    ...listaTarefas.map((t) => t.gid),
    ...[...subtarefas.values()].map((s) => s.gid),
  ]
  const anexos: AsanaAnexo[] = []
  await emLotes(alvos, async (gid: string) => {
    const lista = await source.anexosDe(gid)
    for (const a of lista) anexos.push(a)
  })
  await gravarRaw(execucaoId, "attachment", anexos, (a) => {
    const p = (a as AsanaAnexo).parent
    return p?.gid ?? null
  })
  log(`${anexos.length} anexos`)

  return {
    workspaceGid: ws.gid,
    contadores: {
      workspaces: workspaces.length,
      equipes: equipes.length,
      usuarios: usuarios.length,
      projetos: projetos.length,
      associacoes: totalAssociacoes,
      tarefas: tarefas.size,
      subtarefas: subtarefas.size,
      comentarios: [...comentarios.values()].flat().length,
      campos: camposDefinicoes.size,
      anexos: anexos.length,
    },
    tarefas,
    subtarefas,
    projetos,
    comentarios,
    anexos,
    camposDefinicoes,
    camposPorProjeto,
  }
}

// ============================================================
// Dry-run
// ============================================================

export interface RelatorioDryRun {
  geradoEm: string
  contadores: Record<string, number>
  blockers: string[]
  avisos: string[]
  detalhes: {
    projetosVazios: string[]
    projetosSemClienteMapeado: { gid: string; nome: string; sugestao: string | null }[]
    usuariosNaoMapeados: { gid: string; nome: string; email: string | null }[]
    tiposDeCampoDesconhecidos: { gid: string; nome: string; tipoOrigem: string }[]
    tarefasSemPrazo: number
    tarefasComHorario: number
    tarefasPorQtdProjetos: Record<string, number>
    anexosBinarios: number
    anexosExternos: number
    anexosSemDownload: number
    dominiosDeLink: Record<string, number>
    tarefasOrfas: string[]
  }
}

/**
 * Analisa o snapshot ANTES de gravar qualquer linha canônica.
 *
 * Blocker = não pode entrar em cutover. Aviso = precisa de decisão humana mas
 * não impede a carga em homologação.
 */
export async function dryRun(
  extracao: ResultadoExtracao,
  db: SupabaseClient
): Promise<RelatorioDryRun> {
  const blockers: string[] = []
  const avisos: string[] = []

  // --- Projetos vazios (precisam existir mesmo assim) ---
  const associacoesPorProjeto = new Map<string, number>()
  for (const t of extracao.tarefas.values()) {
    for (const m of t.memberships ?? []) {
      const gid = m.project?.gid
      if (gid) associacoesPorProjeto.set(gid, (associacoesPorProjeto.get(gid) ?? 0) + 1)
    }
  }
  const projetosVazios = extracao.projetos
    .filter((p) => (associacoesPorProjeto.get(p.gid) ?? 0) === 0)
    .map((p) => p.name ?? p.gid)
  if (projetosVazios.length > 0) {
    avisos.push(
      `${projetosVazios.length} projetos vazios serão importados como contexto ` +
      `(CLIENTES, ESTUDOS, ARQUIVOS, APROVADOS e afins precisam existir como aba).`
    )
  }

  // --- Usuários ---
  const { data: usuariosLocais } = await db.from("usuarios").select("id, nome, email")
  const locais = (usuariosLocais ?? []) as { id: string; nome: string; email: string }[]
  const usuariosAsana = new Map<string, { nome: string; email: string | null }>()
  const anota = (u: { gid?: string; name?: string; email?: string } | null | undefined) => {
    if (!u?.gid) return
    if (!usuariosAsana.has(u.gid)) {
      usuariosAsana.set(u.gid, { nome: u.name ?? "", email: u.email ?? null })
    }
  }
  for (const t of [...extracao.tarefas.values(), ...extracao.subtarefas.values()]) {
    anota(t.assignee); anota(t.created_by); anota(t.completed_by)
    for (const f of t.followers ?? []) anota(f)
  }
  const usuariosNaoMapeados = [...usuariosAsana.entries()]
    .filter(([, u]) => {
      const porEmail = u.email && locais.some((l) => l.email?.toLowerCase() === u.email!.toLowerCase())
      const porNome = locais.some((l) => normalizar(l.nome) === normalizar(u.nome))
      return !porEmail && !porNome
    })
    .map(([gid, u]) => ({ gid, nome: u.nome, email: u.email }))
  if (usuariosNaoMapeados.length > 0) {
    avisos.push(
      `${usuariosNaoMapeados.length} usuários do Asana sem conta correspondente. ` +
      `A autoria fica preservada em ws_identidades_externas até o mapeamento.`
    )
  }

  // --- Clientes ---
  const { data: clientes } = await db
    .from("cliente_trafego")
    .select("id, nome, display_name")
    .eq("ativo", true)
  const listaClientes = (clientes ?? []) as {
    id: string; nome: string; display_name: string | null
  }[]
  const projetosSemClienteMapeado = extracao.projetos
    .map((p) => {
      const nome = p.name ?? p.gid
      const alvo = listaClientes.find(
        (c) => normalizar(c.display_name ?? c.nome) === normalizar(nome)
      )
      return { gid: p.gid, nome, sugestao: alvo ? alvo.id : null }
    })
    .filter((x) => !x.sugestao)
  avisos.push(
    `${projetosSemClienteMapeado.length} projetos sem cliente correspondente automático. ` +
    `Nenhum vira cliente sozinho — precisa passar pelo mapeamento assistido.`
  )

  // --- Campos personalizados ---
  const tiposDesconhecidos: { gid: string; nome: string; tipoOrigem: string }[] = []
  for (const [gid, cf] of extracao.camposDefinicoes) {
    const tipo: TipoCampo = refinarNumero(
      tipoCampoDoAsana(cf.type, cf.resource_subtype),
      cf.format
    )
    if (!tipoSuportado(tipo)) {
      tiposDesconhecidos.push({
        gid,
        nome: cf.name ?? "(sem nome)",
        tipoOrigem: cf.resource_subtype ?? cf.type ?? "?",
      })
    }
  }
  if (tiposDesconhecidos.length > 0) {
    blockers.push(
      `${tiposDesconhecidos.length} definições de campo com tipo não suportado. ` +
      `O valor cru é preservado, mas o cutover fica bloqueado até o tipo ganhar ` +
      `persistência, edição, filtro e renderer.`
    )
  }

  // --- Tarefas: prazo, horário, multi-projeto, órfãs ---
  let semPrazo = 0
  let comHorario = 0
  const porQtdProjetos: Record<string, number> = {}
  const gidsTarefas = new Set(extracao.tarefas.keys())
  const orfas: string[] = []

  for (const t of extracao.tarefas.values()) {
    if (!t.due_on && !t.due_at) semPrazo++
    if (t.due_at) comHorario++
    const n = (t.memberships ?? []).length
    const chave = String(n)
    porQtdProjetos[chave] = (porQtdProjetos[chave] ?? 0) + 1
  }
  for (const s of extracao.subtarefas.values()) {
    const pai = s.parent?.gid
    // Subtarefa cujo pai não veio no snapshot: importar cegamente criaria uma
    // tarefa solta sem contexto nenhum.
    if (!pai || !gidsTarefas.has(pai)) orfas.push(s.gid)
  }
  if (orfas.length > 0) {
    blockers.push(`${orfas.length} subtarefas sem tarefa-pai no snapshot.`)
  }

  // --- Anexos ---
  const anexosBinarios = extracao.anexos.filter((a) => a.resource_subtype === "asana").length
  const anexosExternos = extracao.anexos.length - anexosBinarios
  const anexosSemDownload = extracao.anexos.filter(
    (a) => a.resource_subtype === "asana" && !a.download_url
  ).length
  if (anexosSemDownload > 0) {
    blockers.push(
      `${anexosSemDownload} anexos binários sem download_url — a URL do Asana ` +
      `expira, então esses arquivos precisam de nova extração antes do corte.`
    )
  }

  // --- Links ---
  const dominios: Record<string, number> = {}
  const reUrl = /https?:\/\/[^\s<>"')\]]+/gi
  for (const t of extracao.tarefas.values()) {
    const texto = `${t.notes ?? ""} ${t.html_notes ?? ""}`
    for (const m of texto.matchAll(reUrl)) {
      const d = dominioDe(m[0])
      if (d) dominios[d] = (dominios[d] ?? 0) + 1
    }
  }
  const dependeDoAsana = Object.keys(dominios).filter(
    (d) => d.includes("asana.com") || d.includes("asanausercontent.com")
  )
  if (dependeDoAsana.length > 0) {
    avisos.push(
      `Há links apontando para ${dependeDoAsana.join(", ")}. Depois do corte eles ` +
      `morrem — os que corresponderem a anexos migrados serão reescritos.`
    )
  }

  return {
    geradoEm: new Date().toISOString(),
    contadores: extracao.contadores,
    blockers,
    avisos,
    detalhes: {
      projetosVazios,
      projetosSemClienteMapeado,
      usuariosNaoMapeados,
      tiposDeCampoDesconhecidos: tiposDesconhecidos,
      tarefasSemPrazo: semPrazo,
      tarefasComHorario: comHorario,
      tarefasPorQtdProjetos: porQtdProjetos,
      anexosBinarios,
      anexosExternos,
      anexosSemDownload,
      dominiosDeLink: dominios,
      tarefasOrfas: orfas,
    },
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Letras estilizadas que o time usa no NOME dos projetos do Asana.
 *
 * "\ua4e5" (U+A4A5, Lisu) \u00e9 usado no lugar de "A": \ua4e5N\u00d4MALO HUB, T\ua4e5TO ESTOFADOS,
 * H\ua4e5TO, ASSESSORIA LINH\ua4e5 NOV\ua4e5. Sem esta tradu\u00e7\u00e3o, o strip de n\u00e3o-alfanum\u00e9ricos
 * transformaria "T\ua4e5TO ESTOFADOS" em "toestofados", que nunca casaria com o
 * cliente "Tato Estofados" \u2014 e "\ua4e5N\u00d4MALO HUB" n\u00e3o adotaria o contexto
 * "An\u00f4malo Hub" que j\u00e1 existe, criando pasta duplicada.
 */
const LETRAS_ESTILIZADAS: Record<string, string> = {
  "\u{A4A5}": "a", // \ua4e5
  "\u{2C6F}": "a", // \u2c6f
  "\u{0245}": "a", // \u0245
  "\u{039B}": "a", // \u039b (lambda grego, mesmo desenho)
  "\u{0410}": "a", // \u0410 cir\u00edlico
  "\u{041E}": "o", // \u041e cir\u00edlico
  "\u{0415}": "e", // \u0415 cir\u00edlico
}

export function normalizar(s: string): string {
  let out = ""
  for (const c of s) out += LETRAS_ESTILIZADAS[c] ?? c
  return out
    .normalize("NFD")
    // Escape explicito do range de combining marks: escrever os caracteres
    // literais deixaria bytes invisiveis no fonte.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

export function dominioDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return null
  }
}

/**
 * Converte o prazo do Asana para o par (date, time) usado em ws_tarefas.
 *
 * O plano pedia due_on + due_at timestamptz. Guardamos date + time em BRT
 * porque timestamptz é justamente o que faz a tarefa "pular de dia" quando o
 * servidor está em UTC — o próprio plano §3.7 manda evitar isso. A conversão é
 * sem perda e reversível: due_on vira (data, null); due_at vira (data, hora)
 * já em America/Sao_Paulo.
 */
export function prazoDoAsana(
  dueOn: string | null | undefined,
  dueAt: string | null | undefined
): { data: string | null; hora: string | null } {
  if (dueAt) {
    const d = new Date(dueAt)
    if (!Number.isNaN(d.getTime())) {
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      })
      const partes = Object.fromEntries(
        fmt.formatToParts(d).map((p) => [p.type, p.value])
      ) as Record<string, string>
      return {
        data: `${partes.year}-${partes.month}-${partes.day}`,
        hora: `${partes.hour}:${partes.minute}`,
      }
    }
  }
  if (dueOn && /^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { data: dueOn, hora: null }
  return { data: null, hora: null }
}
