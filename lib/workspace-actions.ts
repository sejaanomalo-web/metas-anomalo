"use server"

// =============================================================================
// Workspace — ESCRITAS (Server Actions). Padrão de lib/financeiro-actions.ts.
// =============================================================================
//
// SEGURANÇA: como o Postgres não conhece o usuário deste app (auth própria por
// cookie HMAC, acesso via service_role), a autorização REAL acontece aqui.
// Toda action começa por exigirWorkspace(). Nenhum id de usuário vem do
// formulário — criado_por, concluida_por e autor_id saem SEMPRE da sessão.

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual, type UsuarioSessao } from "./auth"
import { criarNotificacao } from "./notificacoes"
import { ehDataISOValida, normalizarHora } from "./workspace-datas"
import { extrairMencoes } from "./workspace-markdown"
import type { Prioridade, Tarefa, TipoContexto } from "./workspace-tipos"

export interface ResultadoWorkspace {
  ok: boolean
  erro?: string
  id?: string
}

const ROTA = "/dashboard/workspace"

// Limites de tamanho — evitam que um paste gigante entupa a tabela.
const MAX_TITULO = 300
const MAX_DESCRICAO = 20_000
const MAX_COMENTARIO = 10_000

// ============================================================
// Guards e helpers
// ============================================================

// Devolve { usuario: null, erro } em vez de uma union discriminada: o TS nao
// estreita destructuring de union quando o discriminante nao e um tipo
// literal (`erro: string` nao serve), e cada action ficaria cheia de `!`.
// Checar `if (!usuario)` estreita de forma limpa e obvia.
async function exigirWorkspace(): Promise<{
  usuario: UsuarioSessao | null
  erro?: string
}> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { usuario: null, erro: "Sessão expirada. Entre de novo." }
  // admin bypassa em temPermissao; aqui a checagem é explícita pelo mesmo
  // motivo do resto do app: fail-closed se a chave não existir no JSONB.
  if (usuario.papel !== "admin" && usuario.permissoes.workspace !== true) {
    return { usuario: null, erro: "Sem permissão para o Workspace." }
  }
  return { usuario }
}

/** Quem pode mexer numa tarefa: admin, quem criou, ou o responsável. */
function podeEditar(usuario: UsuarioSessao, tarefa: {
  criado_por: string | null
  responsavel_id: string | null
}): boolean {
  if (usuario.papel === "admin") return true
  if (tarefa.criado_por === usuario.id) return true
  if (tarefa.responsavel_id === usuario.id) return true
  return false
}

function texto(fd: FormData, campo: string, max: number): string {
  return String(fd.get(campo) ?? "").trim().slice(0, max)
}

function opcional(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? "").trim()
  return v === "" ? null : v
}

function dataOpcional(fd: FormData, campo: string): string | null | undefined {
  const bruto = fd.get(campo)
  if (bruto === null) return undefined // campo ausente = não mexer
  const v = String(bruto).trim()
  if (v === "") return null // campo presente e vazio = limpar
  return ehDataISOValida(v) ? v : undefined
}

function prioridadeValida(v: string): v is Prioridade {
  return v === "baixa" || v === "normal" || v === "alta"
}

function tipoContextoValido(v: string): v is TipoContexto {
  return v === "geral" || v === "cliente" || v === "empresa" || v === "interno"
}

/** uuid v4 textual — valida ids vindos do formulário antes de ir pro banco. */
function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

/** Log append-only. Best-effort: falhar aqui nunca derruba a ação principal. */
async function registrarAtividade(
  tarefaId: string,
  atorId: string,
  evento: string,
  mudanca?: Record<string, unknown>
): Promise<void> {
  const db = getSupabaseAdmin()
  if (!db) return
  const { error } = await db.from("ws_atividade").insert({
    tarefa_id: tarefaId,
    ator_id: atorId,
    evento,
    mudanca: mudanca ?? null,
  })
  if (error) console.error("[workspace] atividade error", error.message)
}

/** Sinal de realtime (tabela sem PII lida pelo browser). Best-effort. */
async function ping(tarefaId: string, kind: "tarefa" | "comentario"): Promise<void> {
  const db = getSupabaseAdmin()
  if (!db) return
  await db.from("ws_realtime_ping").insert({ tarefa_id: tarefaId, kind })
}

/**
 * Notifica um conjunto de usuários sobre uma tarefa, sem nunca notificar quem
 * executou a ação (ninguém quer aviso do próprio clique) e sem duplicar
 * destinatário.
 */
async function notificar(opts: {
  destinatarios: (string | null | undefined)[]
  atorId: string
  titulo: string
  mensagem: string
  tarefaId: string
}): Promise<void> {
  const ids = [...new Set(opts.destinatarios.filter((x): x is string => Boolean(x)))]
    .filter((id) => id !== opts.atorId)
  if (ids.length === 0) return
  await criarNotificacao({
    tipo: "ws_tarefa",
    titulo: opts.titulo,
    mensagem: opts.mensagem,
    payload: { tarefa_id: opts.tarefaId, url: `${ROTA}?tarefa=${opts.tarefaId}` },
    usuarioIds: ids,
  })
}

/** Seguidores atuais da tarefa — quem recebe aviso de comentário/mudança. */
async function seguidoresDe(tarefaId: string): Promise<string[]> {
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data } = await db
    .from("ws_seguidores")
    .select("usuario_id")
    .eq("tarefa_id", tarefaId)
  return ((data ?? []) as { usuario_id: string }[]).map((s) => s.usuario_id)
}

/** Segue a tarefa sem duplicar (PK composta faz o trabalho). */
async function garantirSeguidor(tarefaId: string, usuarioId: string): Promise<void> {
  const db = getSupabaseAdmin()
  if (!db) return
  await db
    .from("ws_seguidores")
    .upsert({ tarefa_id: tarefaId, usuario_id: usuarioId }, { onConflict: "tarefa_id,usuario_id", ignoreDuplicates: true })
}

/** Traduz @nome / @email em ids de usuário ativos. */
async function resolverMencoes(txt: string | null): Promise<string[]> {
  const nomes = extrairMencoes(txt)
  if (nomes.length === 0) return []
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data } = await db.from("usuarios").select("id, nome, email").eq("ativo", true)
  const usuarios = (data ?? []) as { id: string; nome: string; email: string }[]
  const ids: string[] = []
  for (const n of nomes) {
    const alvo = usuarios.find(
      (u) =>
        u.email.toLowerCase().startsWith(n) ||
        u.nome.toLowerCase().replace(/\s+/g, "") === n.replace(/[._-]/g, "") ||
        u.nome.toLowerCase().split(/\s+/)[0] === n
    )
    if (alvo) ids.push(alvo.id)
  }
  return ids
}

async function buscarTarefa(id: string): Promise<Tarefa | null> {
  const db = getSupabaseAdmin()
  if (!db) return null
  const { data } = await db
    .from("ws_tarefas")
    .select("id, titulo, descricao, tarefa_pai_id, responsavel_id, criado_por, prazo_em, prazo_hora, inicio_em, prioridade, concluida_em, concluida_por, ordem, versao, arquivada_em, excluida_em, created_at, updated_at")
    .eq("id", id)
    .maybeSingle()
  return (data as Tarefa) ?? null
}

// ============================================================
// CONTEXTOS
// ============================================================

export async function criarContextoAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const nome = texto(formData, "nome", 120)
  if (!nome) return { ok: false, erro: "Informe um nome." }
  const tipoBruto = String(formData.get("tipo") ?? "geral")
  const tipo = tipoContextoValido(tipoBruto) ? tipoBruto : "geral"
  if (tipo === "cliente") {
    // Contexto de cliente nasce só via garantirContextoDoClienteAction, que
    // garante o vínculo com cliente_trafego. Criar "à mão" duplicaria a pasta.
    return { ok: false, erro: "Contexto de cliente é criado pela aba Clientes." }
  }
  const cor = opcional(formData, "cor")

  const { data, error } = await db
    .from("ws_contextos")
    .insert({ nome, tipo, cor, criado_por: usuario.id })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[workspace] criarContexto error", error?.message)
    return { ok: false, erro: "Não foi possível criar o contexto." }
  }
  revalidatePath(ROTA)
  return { ok: true, id: data.id as string }
}

/**
 * Devolve o contexto do cliente, criando na primeira vez. O índice único
 * parcial (ws_contextos_cliente_unico) garante que dois cliques simultâneos
 * não criem duas pastas — o segundo colide e a gente relê.
 */
export async function garantirContextoDoClienteAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const clienteId = String(formData.get("cliente_id") ?? "").trim()
  if (!ehUuid(clienteId)) return { ok: false, erro: "Cliente inválido." }

  const { data: existente } = await db
    .from("ws_contextos")
    .select("id")
    .eq("cliente_id", clienteId)
    .is("arquivado_em", null)
    .maybeSingle()
  if (existente) return { ok: true, id: existente.id as string }

  const { data: cliente } = await db
    .from("cliente_trafego")
    .select("id, nome, display_name, empresa_nome")
    .eq("id", clienteId)
    .maybeSingle()
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." }

  const nome =
    (cliente.display_name as string | null)?.trim() || (cliente.nome as string)

  const { data, error } = await db
    .from("ws_contextos")
    .insert({
      nome,
      tipo: "cliente",
      cliente_id: clienteId,
      empresa_nome: cliente.empresa_nome as string,
      criado_por: usuario.id,
    })
    .select("id")
    .single()

  if (error) {
    // Corrida perdida: outro request criou primeiro. Relê e devolve o dele.
    const { data: agora } = await db
      .from("ws_contextos")
      .select("id")
      .eq("cliente_id", clienteId)
      .is("arquivado_em", null)
      .maybeSingle()
    if (agora) return { ok: true, id: agora.id as string }
    console.error("[workspace] garantirContextoCliente error", error.message)
    return { ok: false, erro: "Não foi possível abrir a pasta do cliente." }
  }
  revalidatePath(ROTA)
  return { ok: true, id: data!.id as string }
}

// ============================================================
// TAREFAS — criação
// ============================================================

/**
 * Cria tarefa. O `id` vem do CLIENTE (crypto.randomUUID) e o insert é upsert
 * com ignoreDuplicates: reenviar o mesmo formulário (duplo clique, retry de
 * rede, back/forward) não cria uma segunda linha. É a garantia de
 * idempotência nº 1 do plano.
 */
export async function criarTarefaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const idBruto = String(formData.get("id") ?? "").trim()
  const id = ehUuid(idBruto) ? idBruto : undefined
  const titulo = texto(formData, "titulo", MAX_TITULO)
  if (!titulo) return { ok: false, erro: "Informe um título." }

  const descricao = texto(formData, "descricao", MAX_DESCRICAO) || null
  const responsavelBruto = opcional(formData, "responsavel_id")
  const responsavelId =
    responsavelBruto && ehUuid(responsavelBruto) ? responsavelBruto : null
  const prazo = dataOpcional(formData, "prazo_em")
  const prazoEm = prazo === undefined ? null : prazo
  const prazoHora = prazoEm ? normalizarHora(opcional(formData, "prazo_hora")) : null
  const prioridadeBruta = String(formData.get("prioridade") ?? "normal")
  const prioridade = prioridadeValida(prioridadeBruta) ? prioridadeBruta : "normal"

  const paiBruto = opcional(formData, "tarefa_pai_id")
  const tarefaPaiId = paiBruto && ehUuid(paiBruto) ? paiBruto : null

  const { data, error } = await db
    .from("ws_tarefas")
    .upsert(
      {
        ...(id ? { id } : {}),
        titulo,
        descricao,
        tarefa_pai_id: tarefaPaiId,
        responsavel_id: responsavelId,
        criado_por: usuario.id,
        prazo_em: prazoEm,
        prazo_hora: prazoHora,
        prioridade,
      },
      { onConflict: "id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[workspace] criarTarefa error", error.message)
    return { ok: false, erro: "Não foi possível criar a tarefa." }
  }
  // ignoreDuplicates devolve linha vazia quando o id já existia — é justamente
  // o caso "duplo clique". Trata como sucesso, sem criar nada de novo.
  const tarefaId = (data?.id as string | undefined) ?? id
  if (!tarefaId) return { ok: false, erro: "Não foi possível criar a tarefa." }
  if (!data) return { ok: true, id: tarefaId }

  // Vínculos de contexto (podem vir vários).
  const contextos = formData
    .getAll("contexto_ids")
    .map((v) => String(v).trim())
    .filter(ehUuid)
  if (contextos.length > 0) {
    await db.from("ws_tarefa_contextos").upsert(
      contextos.map((contexto_id) => ({ tarefa_id: tarefaId, contexto_id })),
      { onConflict: "tarefa_id,contexto_id", ignoreDuplicates: true }
    )
  }

  await garantirSeguidor(tarefaId, usuario.id)
  if (responsavelId) await garantirSeguidor(tarefaId, responsavelId)
  await registrarAtividade(tarefaId, usuario.id, "criada", { titulo })
  await ping(tarefaId, "tarefa")
  await notificar({
    destinatarios: [responsavelId, ...(await resolverMencoes(descricao))],
    atorId: usuario.id,
    titulo: "Nova tarefa atribuída",
    mensagem: `${usuario.nome} atribuiu "${titulo}" a você.`,
    tarefaId,
  })

  revalidatePath(ROTA)
  return { ok: true, id: tarefaId }
}

// ============================================================
// TAREFAS — edição
// ============================================================

/**
 * Atualiza campos simples. Só mexe no que veio no FormData (campo ausente =
 * não tocar), e usa `versao` como trava de concorrência: se outra pessoa
 * salvou no meio, o UPDATE afeta 0 linhas e o usuário é avisado em vez de
 * sobrescrever o trabalho dela em silêncio.
 */
export async function atualizarTarefaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Tarefa inválida." }
  const atual = await buscarTarefa(id)
  if (!atual) return { ok: false, erro: "Tarefa não encontrada." }
  if (!podeEditar(usuario, atual)) {
    return { ok: false, erro: "Você não pode editar esta tarefa." }
  }

  // Trava de concorrência de verdade: a versão vem do CLIENTE (a que estava na
  // tela quando o usuário começou a escrever). Comparar com a versão que
  // acabamos de ler do banco não detectaria nada — a janela seria de
  // microssegundos. O drawer só envia `versao` nos campos onde sobrescrever
  // em silêncio custa caro (título e descrição); responsável, prazo e
  // prioridade seguem last-write-wins, como no Asana.
  const versaoCliente = Number(formData.get("versao") ?? NaN)
  if (Number.isFinite(versaoCliente) && versaoCliente !== atual.versao) {
    return {
      ok: false,
      erro: "Outra pessoa editou esta tarefa enquanto você escrevia. Recarregue para ver a versão atual.",
    }
  }

  const patch: Record<string, unknown> = {}
  const mudanca: Record<string, unknown> = {}
  const eventos: string[] = []

  if (formData.has("titulo")) {
    const titulo = texto(formData, "titulo", MAX_TITULO)
    if (!titulo) return { ok: false, erro: "O título não pode ficar vazio." }
    if (titulo !== atual.titulo) {
      patch.titulo = titulo
      mudanca.titulo = { de: atual.titulo, para: titulo }
      eventos.push("titulo")
    }
  }

  if (formData.has("descricao")) {
    const descricao = texto(formData, "descricao", MAX_DESCRICAO) || null
    if (descricao !== atual.descricao) {
      patch.descricao = descricao
      // O log guarda só o TAMANHO da descrição, não o conteúdo — ws_atividade
      // não é lugar de texto livre que pode ter dado sensível colado.
      mudanca.descricao = {
        de_chars: atual.descricao?.length ?? 0,
        para_chars: descricao?.length ?? 0,
      }
      eventos.push("descricao")
    }
  }

  if (formData.has("responsavel_id")) {
    const bruto = opcional(formData, "responsavel_id")
    const novo = bruto && ehUuid(bruto) ? bruto : null
    if (novo !== atual.responsavel_id) {
      patch.responsavel_id = novo
      mudanca.responsavel = { de: atual.responsavel_id, para: novo }
      eventos.push("responsavel")
    }
  }

  if (formData.has("prazo_em")) {
    const novo = dataOpcional(formData, "prazo_em")
    if (novo === undefined) return { ok: false, erro: "Data inválida." }
    if (novo !== atual.prazo_em) {
      patch.prazo_em = novo
      // prazo_hora sem prazo_em viola o CHECK — limpa junto.
      if (novo === null) patch.prazo_hora = null
      mudanca.prazo = { de: atual.prazo_em, para: novo }
      eventos.push("prazo")
    }
  }

  if (formData.has("prazo_hora")) {
    const hora = normalizarHora(opcional(formData, "prazo_hora"))
    const prazoFinal = (patch.prazo_em as string | null) ?? atual.prazo_em
    if (hora && !prazoFinal) {
      return { ok: false, erro: "Defina a data antes do horário." }
    }
    if (hora !== atual.prazo_hora) patch.prazo_hora = hora
  }

  if (formData.has("prioridade")) {
    const p = String(formData.get("prioridade") ?? "")
    if (prioridadeValida(p) && p !== atual.prioridade) {
      patch.prioridade = p
      mudanca.prioridade = { de: atual.prioridade, para: p }
      eventos.push("prioridade")
    }
  }

  if (Object.keys(patch).length === 0) return { ok: true, id }

  patch.versao = atual.versao + 1

  const { data, error } = await db
    .from("ws_tarefas")
    .update(patch)
    .eq("id", id)
    .eq("versao", atual.versao)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[workspace] atualizarTarefa error", error.message)
    return { ok: false, erro: "Não foi possível salvar." }
  }
  if (!data) {
    return {
      ok: false,
      erro: "Outra pessoa editou esta tarefa agora. Recarregue para ver a versão atual.",
    }
  }

  for (const ev of eventos) {
    await registrarAtividade(id, usuario.id, ev, mudanca)
  }
  await ping(id, "tarefa")

  if (patch.responsavel_id) {
    const novoResp = patch.responsavel_id as string
    await garantirSeguidor(id, novoResp)
    await notificar({
      destinatarios: [novoResp],
      atorId: usuario.id,
      titulo: "Tarefa atribuída a você",
      mensagem: `${usuario.nome} atribuiu "${atual.titulo}" a você.`,
      tarefaId: id,
    })
  }
  if (eventos.includes("prazo")) {
    await notificar({
      destinatarios: await seguidoresDe(id),
      atorId: usuario.id,
      titulo: "Prazo alterado",
      mensagem: `${usuario.nome} mudou o prazo de "${atual.titulo}".`,
      tarefaId: id,
    })
  }

  revalidatePath(ROTA)
  return { ok: true, id }
}

/**
 * Só o prazo — usada pelo arrasto no calendário. Separada de
 * atualizarTarefaAction de propósito: o drag não deve falhar por conflito de
 * versão num campo que ele nem toca.
 */
export async function moverPrazoAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Tarefa inválida." }
  const novo = dataOpcional(formData, "prazo_em")
  if (novo === undefined) return { ok: false, erro: "Data inválida." }

  const atual = await buscarTarefa(id)
  if (!atual) return { ok: false, erro: "Tarefa não encontrada." }
  if (!podeEditar(usuario, atual)) {
    return { ok: false, erro: "Você não pode editar esta tarefa." }
  }
  if (novo === atual.prazo_em) return { ok: true, id }

  const { error } = await db
    .from("ws_tarefas")
    .update({
      prazo_em: novo,
      ...(novo === null ? { prazo_hora: null } : {}),
      versao: atual.versao + 1,
    })
    .eq("id", id)
  if (error) {
    console.error("[workspace] moverPrazo error", error.message)
    return { ok: false, erro: "Não foi possível mover a tarefa." }
  }

  await registrarAtividade(id, usuario.id, "prazo", {
    prazo: { de: atual.prazo_em, para: novo },
  })
  await ping(id, "tarefa")
  revalidatePath(ROTA)
  return { ok: true, id }
}

export async function alternarConclusaoAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Tarefa inválida." }
  const concluir = String(formData.get("concluir") ?? "1") === "1"

  const atual = await buscarTarefa(id)
  if (!atual) return { ok: false, erro: "Tarefa não encontrada." }
  if (!podeEditar(usuario, atual)) {
    return { ok: false, erro: "Você não pode concluir esta tarefa." }
  }

  // concluida_em e concluida_por andam SEMPRE juntos (CHECK no banco).
  const patch = concluir
    ? { concluida_em: new Date().toISOString(), concluida_por: usuario.id }
    : { concluida_em: null, concluida_por: null }

  const { error } = await db
    .from("ws_tarefas")
    .update({ ...patch, versao: atual.versao + 1 })
    .eq("id", id)
  if (error) {
    console.error("[workspace] alternarConclusao error", error.message)
    return { ok: false, erro: "Não foi possível salvar." }
  }

  await registrarAtividade(id, usuario.id, concluir ? "concluida" : "reaberta")
  await ping(id, "tarefa")
  if (concluir) {
    await notificar({
      destinatarios: await seguidoresDe(id),
      atorId: usuario.id,
      titulo: "Tarefa concluída",
      mensagem: `${usuario.nome} concluiu "${atual.titulo}".`,
      tarefaId: id,
    })
  }
  revalidatePath(ROTA)
  return { ok: true, id }
}

// ============================================================
// VÍNCULOS COM CONTEXTO
// ============================================================

export async function vincularContextoAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const tarefaId = String(formData.get("tarefa_id") ?? "").trim()
  const contextoId = String(formData.get("contexto_id") ?? "").trim()
  if (!ehUuid(tarefaId) || !ehUuid(contextoId)) {
    return { ok: false, erro: "Parâmetros inválidos." }
  }
  const atual = await buscarTarefa(tarefaId)
  if (!atual) return { ok: false, erro: "Tarefa não encontrada." }
  if (!podeEditar(usuario, atual)) return { ok: false, erro: "Sem permissão." }

  const { error } = await db
    .from("ws_tarefa_contextos")
    .upsert({ tarefa_id: tarefaId, contexto_id: contextoId }, {
      onConflict: "tarefa_id,contexto_id",
      ignoreDuplicates: true,
    })
  if (error) {
    console.error("[workspace] vincular error", error.message)
    return { ok: false, erro: "Não foi possível vincular." }
  }
  await registrarAtividade(tarefaId, usuario.id, "vinculo_add", { contexto_id: contextoId })
  await ping(tarefaId, "tarefa")
  revalidatePath(ROTA)
  return { ok: true, id: tarefaId }
}

/**
 * Remove a tarefa de UM contexto. Apaga só a linha de vínculo — a tarefa
 * continua existindo e visível nos outros contextos e no calendário. É a
 * regra estrutural do módulo; nunca transformar isto em delete da tarefa.
 */
export async function desvincularContextoAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const tarefaId = String(formData.get("tarefa_id") ?? "").trim()
  const contextoId = String(formData.get("contexto_id") ?? "").trim()
  if (!ehUuid(tarefaId) || !ehUuid(contextoId)) {
    return { ok: false, erro: "Parâmetros inválidos." }
  }
  const atual = await buscarTarefa(tarefaId)
  if (!atual) return { ok: false, erro: "Tarefa não encontrada." }
  if (!podeEditar(usuario, atual)) return { ok: false, erro: "Sem permissão." }

  const { error } = await db
    .from("ws_tarefa_contextos")
    .delete()
    .eq("tarefa_id", tarefaId)
    .eq("contexto_id", contextoId)
  if (error) {
    console.error("[workspace] desvincular error", error.message)
    return { ok: false, erro: "Não foi possível desvincular." }
  }
  await registrarAtividade(tarefaId, usuario.id, "vinculo_rm", { contexto_id: contextoId })
  await ping(tarefaId, "tarefa")
  revalidatePath(ROTA)
  return { ok: true, id: tarefaId }
}

// ============================================================
// ARQUIVAR / EXCLUIR / RESTAURAR
// ============================================================

export async function arquivarTarefaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Tarefa inválida." }
  const arquivar = String(formData.get("arquivar") ?? "1") === "1"

  const atual = await buscarTarefa(id)
  if (!atual) return { ok: false, erro: "Tarefa não encontrada." }
  if (!podeEditar(usuario, atual)) return { ok: false, erro: "Sem permissão." }

  const { error } = await db
    .from("ws_tarefas")
    .update({
      arquivada_em: arquivar ? new Date().toISOString() : null,
      versao: atual.versao + 1,
    })
    .eq("id", id)
  if (error) return { ok: false, erro: "Não foi possível salvar." }

  await registrarAtividade(id, usuario.id, arquivar ? "arquivada" : "restaurada")
  await ping(id, "tarefa")
  revalidatePath(ROTA)
  return { ok: true, id }
}

/** Exclusão SOFT — vai pra lixeira, dá pra restaurar. É o delete "normal". */
export async function excluirTarefaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Tarefa inválida." }
  const atual = await buscarTarefa(id)
  if (!atual) return { ok: false, erro: "Tarefa não encontrada." }
  if (!podeEditar(usuario, atual)) return { ok: false, erro: "Sem permissão." }

  const { error } = await db
    .from("ws_tarefas")
    .update({ excluida_em: new Date().toISOString(), versao: atual.versao + 1 })
    .eq("id", id)
  if (error) return { ok: false, erro: "Não foi possível excluir." }

  await registrarAtividade(id, usuario.id, "excluida")
  await ping(id, "tarefa")
  revalidatePath(ROTA)
  return { ok: true, id }
}

export async function restaurarTarefaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Tarefa inválida." }
  const atual = await buscarTarefa(id)
  if (!atual) return { ok: false, erro: "Tarefa não encontrada." }
  if (!podeEditar(usuario, atual)) return { ok: false, erro: "Sem permissão." }

  const { error } = await db
    .from("ws_tarefas")
    .update({ excluida_em: null, arquivada_em: null, versao: atual.versao + 1 })
    .eq("id", id)
  if (error) return { ok: false, erro: "Não foi possível restaurar." }

  await registrarAtividade(id, usuario.id, "restaurada")
  await ping(id, "tarefa")
  revalidatePath(ROTA)
  return { ok: true, id }
}

/**
 * DELETE de verdade — esvazia a lixeira. Só admin, e só sobre tarefa já
 * excluída (soft). O cascade leva vínculos, comentários, seguidores e o
 * histórico junto; por isso a confirmação dupla na UI.
 */
export async function excluirDefinitivoAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  if (usuario.papel !== "admin") {
    return { ok: false, erro: "Só um admin pode excluir definitivamente." }
  }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Tarefa inválida." }
  const atual = await buscarTarefa(id)
  if (!atual) return { ok: false, erro: "Tarefa não encontrada." }
  if (!atual.excluida_em) {
    return { ok: false, erro: "Mande a tarefa para a lixeira antes de apagar de vez." }
  }

  const { error } = await db.from("ws_tarefas").delete().eq("id", id)
  if (error) {
    console.error("[workspace] excluirDefinitivo error", error.message)
    return { ok: false, erro: "Não foi possível apagar." }
  }
  revalidatePath(ROTA)
  return { ok: true, id }
}

// ============================================================
// DUPLICAR
// ============================================================

/**
 * Copia a tarefa. Os nomes repetidos no Asana (otimizações, relatórios,
 * programação de posts) mostram que duplicar é o fluxo mais frequente depois
 * de criar. Cada campo é opt-out via checkbox no drawer.
 */
export async function duplicarTarefaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Tarefa inválida." }
  const origem = await buscarTarefa(id)
  if (!origem) return { ok: false, erro: "Tarefa não encontrada." }

  const manterResponsavel = formData.get("manter_responsavel") === "on"
  const manterPrazo = formData.get("manter_prazo") === "on"
  const manterDescricao = formData.get("manter_descricao") === "on"
  const manterVinculos = formData.get("manter_vinculos") === "on"
  const manterSubtarefas = formData.get("manter_subtarefas") === "on"

  const { data: nova, error } = await db
    .from("ws_tarefas")
    .insert({
      titulo: `${origem.titulo} (cópia)`.slice(0, MAX_TITULO),
      descricao: manterDescricao ? origem.descricao : null,
      responsavel_id: manterResponsavel ? origem.responsavel_id : null,
      criado_por: usuario.id,
      prazo_em: manterPrazo ? origem.prazo_em : null,
      prazo_hora: manterPrazo ? origem.prazo_hora : null,
      prioridade: origem.prioridade,
    })
    .select("id")
    .single()
  if (error || !nova) {
    console.error("[workspace] duplicar error", error?.message)
    return { ok: false, erro: "Não foi possível duplicar." }
  }
  const novoId = nova.id as string

  if (manterVinculos) {
    const { data: vinc } = await db
      .from("ws_tarefa_contextos")
      .select("contexto_id")
      .eq("tarefa_id", id)
    const linhas = ((vinc ?? []) as { contexto_id: string }[]).map((v) => ({
      tarefa_id: novoId,
      contexto_id: v.contexto_id,
    }))
    if (linhas.length > 0) {
      await db.from("ws_tarefa_contextos").upsert(linhas, {
        onConflict: "tarefa_id,contexto_id",
        ignoreDuplicates: true,
      })
    }
  }

  if (manterSubtarefas) {
    const { data: subs } = await db
      .from("ws_tarefas")
      .select("titulo, descricao, responsavel_id, prazo_em, prazo_hora, prioridade, ordem")
      .eq("tarefa_pai_id", id)
      .is("excluida_em", null)
    const linhas = ((subs ?? []) as Record<string, unknown>[]).map((s) => ({
      titulo: s.titulo,
      descricao: manterDescricao ? s.descricao : null,
      responsavel_id: manterResponsavel ? s.responsavel_id : null,
      criado_por: usuario.id,
      prazo_em: manterPrazo ? s.prazo_em : null,
      prazo_hora: manterPrazo ? s.prazo_hora : null,
      prioridade: s.prioridade,
      ordem: s.ordem,
      tarefa_pai_id: novoId,
    }))
    if (linhas.length > 0) await db.from("ws_tarefas").insert(linhas)
  }

  await garantirSeguidor(novoId, usuario.id)
  await registrarAtividade(novoId, usuario.id, "criada", { duplicada_de: id })
  await ping(novoId, "tarefa")
  revalidatePath(ROTA)
  return { ok: true, id: novoId }
}

// ============================================================
// COMENTÁRIOS E SEGUIDORES
// ============================================================

export async function comentarAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const tarefaId = String(formData.get("tarefa_id") ?? "").trim()
  if (!ehUuid(tarefaId)) return { ok: false, erro: "Tarefa inválida." }
  const corpo = texto(formData, "corpo", MAX_COMENTARIO)
  if (!corpo) return { ok: false, erro: "Escreva alguma coisa." }

  const tarefa = await buscarTarefa(tarefaId)
  if (!tarefa) return { ok: false, erro: "Tarefa não encontrada." }

  const { data, error } = await db
    .from("ws_comentarios")
    .insert({ tarefa_id: tarefaId, autor_id: usuario.id, corpo })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[workspace] comentar error", error?.message)
    return { ok: false, erro: "Não foi possível comentar." }
  }

  // Comentar passa a seguir a tarefa (idempotente — não duplica).
  await garantirSeguidor(tarefaId, usuario.id)
  await registrarAtividade(tarefaId, usuario.id, "comentario")
  await ping(tarefaId, "comentario")

  // Um único fan-out para seguidores + mencionados, deduplicado dentro de
  // notificar(): quem for as duas coisas recebe UMA notificação, não duas.
  await notificar({
    destinatarios: [
      ...(await seguidoresDe(tarefaId)),
      ...(await resolverMencoes(corpo)),
      tarefa.responsavel_id,
    ],
    atorId: usuario.id,
    titulo: "Novo comentário",
    mensagem: `${usuario.nome} comentou em "${tarefa.titulo}".`,
    tarefaId,
  })

  revalidatePath(ROTA)
  return { ok: true, id: data.id as string }
}

export async function excluirComentarioAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Comentário inválido." }

  const { data: c } = await db
    .from("ws_comentarios")
    .select("id, autor_id, tarefa_id")
    .eq("id", id)
    .maybeSingle()
  if (!c) return { ok: false, erro: "Comentário não encontrado." }
  if (usuario.papel !== "admin" && c.autor_id !== usuario.id) {
    return { ok: false, erro: "Só o autor pode apagar o comentário." }
  }

  const { error } = await db
    .from("ws_comentarios")
    .update({ excluido_em: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, erro: "Não foi possível apagar." }

  await ping(c.tarefa_id as string, "comentario")
  revalidatePath(ROTA)
  return { ok: true, id }
}

export async function alternarSeguidorAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const tarefaId = String(formData.get("tarefa_id") ?? "").trim()
  if (!ehUuid(tarefaId)) return { ok: false, erro: "Tarefa inválida." }
  // Só dá pra adicionar/remover OUTRA pessoa se for admin; qualquer um
  // gerencia a própria inscrição.
  const alvoBruto = opcional(formData, "usuario_id")
  const alvo = alvoBruto && ehUuid(alvoBruto) ? alvoBruto : usuario.id
  if (alvo !== usuario.id && usuario.papel !== "admin") {
    return { ok: false, erro: "Você só pode gerenciar a sua própria inscrição." }
  }

  const { data: existe } = await db
    .from("ws_seguidores")
    .select("usuario_id")
    .eq("tarefa_id", tarefaId)
    .eq("usuario_id", alvo)
    .maybeSingle()

  if (existe) {
    await db
      .from("ws_seguidores")
      .delete()
      .eq("tarefa_id", tarefaId)
      .eq("usuario_id", alvo)
  } else {
    await garantirSeguidor(tarefaId, alvo)
  }
  revalidatePath(ROTA)
  return { ok: true, id: tarefaId }
}
