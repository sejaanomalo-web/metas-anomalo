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
import { exigirWorkspace } from "./workspace-acesso"
import { criarNotificacao } from "./notificacoes"
import { ehDataISOValida, normalizarHora, proximaOcorrencia } from "./workspace-datas"
import { extrairMencoes } from "./workspace-markdown"
import {
  gravarNota,
  MAX_TITULO_NOTA,
  type CamposNota,
} from "./workspace-notas-gravar"
import { uploadFotoPerfil } from "./workspace-midia"
import {
  recorrenciaValida,
  type Prioridade,
  type Tarefa,
  type TipoContexto,
} from "./workspace-tipos"

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

// exigirWorkspace mora em lib/workspace-acesso.ts: a rota
// /api/workspace/notas/salvar (flush do editor quando a janela fecha) precisa
// da MESMA checagem, e um arquivo "use server" só exporta actions.
//
// Ela devolve { usuario: null, erro } em vez de uma union discriminada: o TS
// nao estreita destructuring de union quando o discriminante nao e um tipo
// literal (`erro: string` nao serve), e cada action ficaria cheia de `!`.
// Checar `if (!usuario)` estreita de forma limpa e obvia.

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
    .select("id, titulo, descricao, tarefa_pai_id, responsavel_id, criado_por, prazo_em, prazo_hora, inicio_em, prioridade, concluida_em, concluida_por, recorrencia, ordem, versao, arquivada_em, excluida_em, created_at, updated_at")
    .eq("id", id)
    .maybeSingle()
  return (data as Tarefa) ?? null
}

/**
 * Recorrência lazy, no jeito do Asana: concluir uma tarefa recorrente CRIA a
 * próxima ocorrência (mesmo título/responsável/contextos, prazo seguinte).
 * ocorrencia_chave = serie:data + índice único parcial da Fase 1 = concluir
 * duas vezes (retry, duplo clique) nunca gera duas tarefas.
 */
async function materializarRecorrencia(atual: Tarefa, atorId: string): Promise<void> {
  const rec = recorrenciaValida(atual.recorrencia)
  if (!rec || !atual.prazo_em) return
  const db = getSupabaseAdmin()
  if (!db) return

  // A série é a tarefa-raiz: a primeira da cadeia usa o próprio id.
  const { data: extras } = await db
    .from("ws_tarefas")
    .select("recorrencia_id")
    .eq("id", atual.id)
    .maybeSingle()
  const serie = (extras?.recorrencia_id as string | null) ?? atual.id

  const proxima = proximaOcorrencia(atual.prazo_em, rec)
  const chave = `${serie}:${proxima}`

  const { data: nova, error } = await db
    .from("ws_tarefas")
    .insert({
      titulo: atual.titulo,
      descricao: atual.descricao,
      responsavel_id: atual.responsavel_id,
      criado_por: atorId,
      prazo_em: proxima,
      prazo_hora: atual.prazo_hora,
      prioridade: atual.prioridade,
      recorrencia: rec,
      recorrencia_id: serie,
      ocorrencia_chave: chave,
    })
    .select("id")
    .maybeSingle()
  if (error) {
    // 23505 = a ocorrência já existe (outro clique chegou antes). Sucesso.
    if (!error.message.includes("duplicate") && !error.message.includes("unique")) {
      console.error("[workspace] materializarRecorrencia error", error.message)
    }
    return
  }
  if (!nova) return

  // A próxima ocorrência aparece nos MESMOS contextos (calendário do cliente
  // incluído) — sem isso ela nasceria órfã, fora de todas as pastas.
  const { data: vincs } = await db
    .from("ws_tarefa_contextos")
    .select("contexto_id")
    .eq("tarefa_id", atual.id)
  const contextos = (vincs ?? []) as { contexto_id: string }[]
  if (contextos.length > 0) {
    await db.from("ws_tarefa_contextos").insert(
      contextos.map((v) => ({ tarefa_id: nova.id as string, contexto_id: v.contexto_id }))
    )
  }
  await registrarAtividade(nova.id as string, atorId, "criada", {
    recorrente_de: atual.id,
  })
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

  const empresaCliente = (cliente.empresa_nome as string | null) ?? ""
  const grupoId = empresaCliente
    ? await garantirAncora(db, empresaCliente, usuario.id)
    : null
  const ordemNoGrupo = await proximaOrdemNoGrupo(db, grupoId)

  const { data, error } = await db
    .from("ws_contextos")
    .insert({
      nome,
      tipo: "cliente",
      cliente_id: clienteId,
      empresa_nome: cliente.empresa_nome as string,
      // Entra no grupo certo e no FIM dele — abrir a pasta de um cliente do
      // cadastro não pode empurrar a organização que o time já fez.
      grupo_id: grupoId,
      ordem: ordemNoGrupo,
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

  if (formData.has("recorrencia")) {
    // "" = tirar a repetição; senão JSON validado por recorrenciaValida —
    // nada além de {freq, dias[]} entra no jsonb.
    const bruto = String(formData.get("recorrencia") ?? "").trim()
    if (bruto === "") {
      if (atual.recorrencia !== null) {
        patch.recorrencia = null
        eventos.push("recorrencia")
      }
    } else {
      let rec: unknown
      try {
        rec = JSON.parse(bruto)
      } catch {
        return { ok: false, erro: "Repetição inválida." }
      }
      const valida = recorrenciaValida(rec)
      if (!valida) return { ok: false, erro: "Repetição inválida." }
      patch.recorrencia = valida
      mudanca.recorrencia = valida as unknown as Record<string, unknown>
      eventos.push("recorrencia")
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

/**
 * Move a tarefa no CALENDÁRIO: dia (prazo_em) e/ou posição vertical (ordem)
 * numa só escrita. A ordem é numeric — o cliente manda o ponto médio entre os
 * vizinhos de destino, então reordenar não reescreve o dia inteiro.
 */
export async function moverTarefaCalendarioAction(
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
  const ordemBruta = Number(formData.get("ordem"))
  const ordem = Number.isFinite(ordemBruta) ? ordemBruta : null

  const atual = await buscarTarefa(id)
  if (!atual) return { ok: false, erro: "Tarefa não encontrada." }
  if (!podeEditar(usuario, atual)) {
    return { ok: false, erro: "Você não pode editar esta tarefa." }
  }

  const patch: Record<string, unknown> = { versao: atual.versao + 1 }
  if (novo !== atual.prazo_em) {
    patch.prazo_em = novo
    if (novo === null) patch.prazo_hora = null
  }
  if (ordem !== null) patch.ordem = ordem

  const { error } = await db.from("ws_tarefas").update(patch).eq("id", id)
  if (error) {
    console.error("[workspace] moverTarefaCalendario error", error.message)
    return { ok: false, erro: "Não foi possível mover a tarefa." }
  }

  if (novo !== atual.prazo_em) {
    await registrarAtividade(id, usuario.id, "prazo", {
      prazo: { de: atual.prazo_em, para: novo },
    })
  }
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
  if (concluir) await materializarRecorrencia(atual, usuario.id)
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

/**
 * Edita o corpo de um comentário já publicado.
 *
 * Permissão IDÊNTICA à de excluir: autor ou admin. Um comentário é fala de
 * alguém — deixar terceiro reescrever seria pior que deixar apagar.
 *
 * Não gera atividade nem notificação: quem segue a tarefa já foi avisado
 * quando o comentário foi criado, e avisar de novo a cada correção de typo
 * treinaria o time a ignorar o sino. O updated_at é carimbado pelo trigger
 * ws_comentarios_touch, então a UI consegue mostrar "(editado)".
 */
export async function editarComentarioAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Comentário inválido." }

  const corpo = texto(formData, "corpo", MAX_COMENTARIO)
  // O CHECK do banco exige corpo não-vazio: esvaziar é apagar, e apagar tem
  // action própria. Barrar aqui dá mensagem melhor que o erro 23514.
  if (!corpo) return { ok: false, erro: "O comentário não pode ficar vazio." }

  const { data: c } = await db
    .from("ws_comentarios")
    .select("id, autor_id, tarefa_id, excluido_em")
    .eq("id", id)
    .maybeSingle()
  if (!c || c.excluido_em) return { ok: false, erro: "Comentário não encontrado." }
  if (usuario.papel !== "admin" && c.autor_id !== usuario.id) {
    return { ok: false, erro: "Só o autor pode editar o comentário." }
  }

  const { error } = await db
    .from("ws_comentarios")
    .update({ corpo })
    .eq("id", id)
  if (error) {
    console.error("[workspace] editarComentario error", error.message)
    return { ok: false, erro: "Não foi possível salvar a edição." }
  }

  await ping(c.tarefa_id as string, "comentario")
  revalidatePath(ROTA)
  return { ok: true, id }
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

// ============================================================
// FASE 2 — CLIENTES DO WORKSPACE (área própria, foto, cor, empresa)
// ============================================================

const HEX_COR = /^#[0-9a-fA-F]{6}$/

/**
 * Âncora (contexto tipo 'empresa') de um grupo, criando se ainda não existir.
 * A comparação é case-insensitive DE PROPÓSITO: os dados do Asana vieram com
 * caixas diferentes pro mesmo grupo, e casar string exata era o que criava
 * grupo duplicado (um com os clientes, outro vazio).
 */
async function garantirAncora(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  nomeEmpresa: string,
  criadoPor: string
): Promise<string | null> {
  const nome = nomeEmpresa.trim()
  if (!nome) return null

  const { data: existentes } = await db
    .from("ws_contextos")
    .select("id, nome, empresa_nome")
    .eq("tipo", "empresa")
    .is("arquivado_em", null)
  const alvo = nome.toLowerCase()
  const achou = (existentes ?? []).find(
    (a) =>
      String((a as { empresa_nome: string | null; nome: string }).empresa_nome ??
        (a as { nome: string }).nome)
        .trim()
        .toLowerCase() === alvo
  )
  if (achou) return (achou as { id: string }).id

  // Nasce no FIM da lista de grupos — criar empresa nunca empurra as outras.
  const { data: ultima } = await db
    .from("ws_contextos")
    .select("ordem")
    .eq("tipo", "empresa")
    .is("arquivado_em", null)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle()
  const ordem = ((ultima?.ordem as number | undefined) ?? 0) + 10

  const { data, error } = await db
    .from("ws_contextos")
    .insert({
      nome,
      tipo: "empresa",
      empresa_nome: nome,
      ordem,
      criado_por: criadoPor,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[workspace] garantirAncora error", error?.message)
    return null
  }
  // Âncora aponta pra si mesma: todo contexto do grupo compartilha grupo_id.
  await db.from("ws_contextos").update({ grupo_id: data.id }).eq("id", data.id)
  return data.id as string
}

/** Próxima posição livre DENTRO de um grupo — item novo entra no fim. */
async function proximaOrdemNoGrupo(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  grupoId: string | null
): Promise<number> {
  let q = db
    .from("ws_contextos")
    .select("ordem")
    .neq("tipo", "empresa")
    .is("arquivado_em", null)
    .order("ordem", { ascending: false })
    .limit(1)
  q = grupoId ? q.eq("grupo_id", grupoId) : q.is("grupo_id", null)
  const { data } = await q.maybeSingle()
  return ((data?.ordem as number | undefined) ?? 0) + 10
}

/**
 * Cria um cliente DIRETO no Workspace (sem cadastro de tráfego): contexto
 * tipo 'cliente' com cliente_id nulo. Nome, cor exata, empresa e foto —
 * a área de trabalho dele (nota + calendário + lista) passa a existir na hora.
 *
 * Entra no FIM do grupo: criar cliente não reordena o que o time já organizou.
 */
export async function criarClienteWorkspaceAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const nome = texto(formData, "nome", 120)
  if (!nome) return { ok: false, erro: "Informe o nome do cliente." }
  const corBruta = opcional(formData, "cor")
  const cor = corBruta && HEX_COR.test(corBruta) ? corBruta : null
  const empresa = opcional(formData, "empresa_nome")

  const grupoId = empresa ? await garantirAncora(db, empresa, usuario.id) : null
  const ordem = await proximaOrdemNoGrupo(db, grupoId)

  let fotoUrl: string | null = null
  const fotoBase64 = opcional(formData, "foto_base64")
  if (fotoBase64) fotoUrl = await uploadFotoPerfil(fotoBase64, "contexto")

  const { data, error } = await db
    .from("ws_contextos")
    .insert({
      nome,
      tipo: "cliente",
      cliente_id: null,
      empresa_nome: empresa,
      grupo_id: grupoId,
      ordem,
      cor,
      foto_url: fotoUrl,
      criado_por: usuario.id,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[workspace] criarClienteWorkspace error", error?.message)
    return { ok: false, erro: "Não foi possível criar o cliente." }
  }
  revalidatePath(ROTA)
  return { ok: true, id: data.id as string }
}

/**
 * Edita um contexto (cliente ou aba-calendário): nome, cor da identidade
 * visual, empresa, foto de perfil, arquivar/desarquivar. A cor reflete em
 * TODOS os cartões de tarefa daquele contexto — é a identidade do cliente.
 */
export async function atualizarContextoAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Contexto inválido." }

  const patch: Record<string, unknown> = {}

  if (formData.has("nome")) {
    const nome = texto(formData, "nome", 120)
    if (!nome) return { ok: false, erro: "O nome não pode ficar vazio." }
    patch.nome = nome
  }
  if (formData.has("cor")) {
    const cor = opcional(formData, "cor")
    if (cor && !HEX_COR.test(cor)) return { ok: false, erro: "Cor inválida." }
    patch.cor = cor
  }
  if (formData.has("empresa_nome")) {
    const empresa = opcional(formData, "empresa_nome")
    patch.empresa_nome = empresa
    // Trocar a empresa move o contexto de GRUPO — o vínculo é o grupo_id, e
    // deixar só o texto mudar faria o cliente sumir do grupo antigo sem
    // aparecer no novo. Entra no fim do grupo de destino.
    const grupoId = empresa ? await garantirAncora(db, empresa, usuario.id) : null
    patch.grupo_id = grupoId
    patch.ordem = await proximaOrdemNoGrupo(db, grupoId)
  }
  const fotoBase64 = opcional(formData, "foto_base64")
  if (fotoBase64) {
    const url = await uploadFotoPerfil(fotoBase64, "contexto")
    if (!url) return { ok: false, erro: "Não foi possível subir a foto." }
    patch.foto_url = url
  }
  if (formData.get("remover_foto") === "1") patch.foto_url = null
  if (formData.has("arquivar")) {
    patch.arquivado_em =
      String(formData.get("arquivar")) === "1" ? new Date().toISOString() : null
  }

  if (Object.keys(patch).length === 0) return { ok: true, id }
  patch.updated_at = new Date().toISOString()

  const { error } = await db.from("ws_contextos").update(patch).eq("id", id)
  if (error) {
    console.error("[workspace] atualizarContexto error", error.message)
    return { ok: false, erro: "Não foi possível salvar." }
  }
  revalidatePath(ROTA)
  return { ok: true, id }
}

/**
 * Renomeia um grupo de empresa DENTRO do Workspace, pelo ID DA ÂNCORA.
 *
 * Identificar o grupo pelo id (e não pelo nome antigo, como antes) é o que
 * torna a operação confiável: o nome digitado na tela podia divergir do
 * empresa_nome gravado por diferença de caixa, e o update não pegava linha
 * nenhuma. Não toca em cliente_trafego nem em empresas_config — o cadastro de
 * tráfego é de outro módulo e renomear lá afetaria relatórios e metas.
 */
export async function renomearEmpresaWsAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const ancoraId = String(formData.get("ancora_id") ?? "").trim()
  if (!ehUuid(ancoraId)) return { ok: false, erro: "Empresa inválida." }
  const para = texto(formData, "para", 120)
  if (!para) return { ok: false, erro: "Informe o nome novo." }

  const agora = new Date().toISOString()
  const { data, error } = await db
    .from("ws_contextos")
    .update({ nome: para, empresa_nome: para, updated_at: agora })
    .eq("id", ancoraId)
    .eq("tipo", "empresa")
    .select("id")
    .maybeSingle()
  if (error) {
    console.error("[workspace] renomearEmpresaWs error", error.message)
    return { ok: false, erro: "Não foi possível renomear." }
  }
  if (!data) return { ok: false, erro: "Empresa não encontrada." }

  // empresa_nome dos filhos é espelho do nome da âncora (compatibilidade
  // com consultas antigas que ainda leem o texto).
  await db
    .from("ws_contextos")
    .update({ empresa_nome: para, updated_at: agora })
    .eq("grupo_id", ancoraId)
    .neq("tipo", "empresa")
    .is("arquivado_em", null)

  revalidatePath(ROTA)
  return { ok: true, id: ancoraId }
}

// ============================================================
// FASE 2 — ABAS CUSTOMIZADAS (o "+" da régua)
// ============================================================

/**
 * Cria uma aba nova: 'calendario' ganha um contexto interno próprio (as
 * tarefas dela vivem ali); 'nota' vira uma coleção de notas. As abas fixas
 * do sistema são código e não passam por aqui — por isso nunca somem.
 */
export async function criarAbaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const nome = texto(formData, "nome", 60)
  if (!nome) return { ok: false, erro: "Informe o nome da aba." }
  const tipoBruto = String(formData.get("tipo") ?? "nota")
  const tipo =
    tipoBruto === "calendario" || tipoBruto === "misto" ? tipoBruto : "nota"

  let contextoId: string | null = null
  if (tipo === "calendario" || tipo === "misto") {
    const { data: ctx, error: e1 } = await db
      .from("ws_contextos")
      .insert({ nome, tipo: "interno", criado_por: usuario.id })
      .select("id")
      .single()
    if (e1 || !ctx) {
      console.error("[workspace] criarAba contexto error", e1?.message)
      return { ok: false, erro: "Não foi possível criar a aba." }
    }
    contextoId = ctx.id as string
  }

  const { data, error } = await db
    .from("ws_abas")
    .insert({ nome, tipo, contexto_id: contextoId, criado_por: usuario.id })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[workspace] criarAba error", error?.message)
    return { ok: false, erro: "Não foi possível criar a aba. A migration da Fase 2 já foi aplicada?" }
  }
  revalidatePath(ROTA)
  return { ok: true, id: data.id as string }
}

export async function renomearAbaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Aba inválida." }
  const nome = texto(formData, "nome", 60)
  if (!nome) return { ok: false, erro: "Informe o nome." }

  const { data, error } = await db
    .from("ws_abas")
    .update({ nome })
    .eq("id", id)
    .select("contexto_id")
    .maybeSingle()
  if (error) {
    console.error("[workspace] renomearAba error", error.message)
    return { ok: false, erro: "Não foi possível renomear." }
  }
  // O contexto interno acompanha o nome da aba (aparece nos chips da tarefa).
  const ctxId = data?.contexto_id as string | null
  if (ctxId) await db.from("ws_contextos").update({ nome }).eq("id", ctxId)
  revalidatePath(ROTA)
  return { ok: true, id }
}

/**
 * Exclui (soft) uma aba criada. As TAREFAS de uma aba-calendário continuam no
 * banco — só o contexto é arquivado; nada é apagado de verdade.
 */
export async function excluirAbaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Aba inválida." }

  const { data, error } = await db
    .from("ws_abas")
    .update({ excluida_em: new Date().toISOString() })
    .eq("id", id)
    .select("contexto_id")
    .maybeSingle()
  if (error) {
    console.error("[workspace] excluirAba error", error.message)
    return { ok: false, erro: "Não foi possível excluir." }
  }
  const ctxId = data?.contexto_id as string | null
  if (ctxId) {
    await db
      .from("ws_contextos")
      .update({ arquivado_em: new Date().toISOString() })
      .eq("id", ctxId)
  }
  revalidatePath(ROTA)
  return { ok: true, id }
}

// ============================================================
// FASE 2 — NOTAS (estilo iPhone Notes, HTML sanitizado)
// ============================================================

function escopoDoForm(fd: FormData): { contexto_id?: string; aba_id?: string; fixa?: string } | null {
  const contextoId = String(fd.get("contexto_id") ?? "").trim()
  const abaId = String(fd.get("aba_id") ?? "").trim()
  const fixa = String(fd.get("fixa") ?? "").trim()
  const definidos = [contextoId, abaId, fixa].filter(Boolean).length
  if (definidos !== 1) return null
  if (contextoId) return ehUuid(contextoId) ? { contexto_id: contextoId } : null
  if (abaId) return ehUuid(abaId) ? { aba_id: abaId } : null
  // Só existe uma aba fixa de notas (Estudos saiu na fase 5).
  return fixa === "arquivos" ? { fixa } : null
}

export async function criarNotaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const escopo = escopoDoForm(formData)
  if (!escopo) return { ok: false, erro: "Escopo da nota inválido." }

  const { data, error } = await db
    .from("ws_notas")
    .insert({ ...escopo, titulo: "", corpo_html: "", criado_por: usuario.id })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[workspace] criarNota error", error?.message)
    return { ok: false, erro: "Não foi possível criar a nota. A migration da Fase 2 já foi aplicada?" }
  }
  revalidatePath(ROTA)
  return { ok: true, id: data.id as string }
}

/**
 * Salva título e corpo. O corpo passa SEMPRE por sanitizarHtmlNota (dentro de
 * gravarNota) — o dangerouslySetInnerHTML da renderização só vê HTML que o
 * servidor montou.
 *
 * Campo ausente no FormData não é tocado: o editor manda só o que mudou, e é
 * isso que impede um save de título de sobrescrever o corpo com valor velho.
 */
export async function salvarNotaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Nota inválida." }

  const campos: CamposNota = {}
  if (formData.has("titulo")) campos.titulo = texto(formData, "titulo", MAX_TITULO_NOTA)
  if (formData.has("corpo_html")) campos.corpo_html = String(formData.get("corpo_html") ?? "")

  const r = await gravarNota(usuario.id, id, campos)
  return r.ok ? { ok: true, id } : { ok: false, erro: r.erro }
}

export async function excluirNotaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Nota inválida." }

  const { error } = await db
    .from("ws_notas")
    .update({ excluida_em: new Date().toISOString(), atualizado_por: usuario.id })
    .eq("id", id)
  if (error) {
    console.error("[workspace] excluirNota error", error.message)
    return { ok: false, erro: "Não foi possível excluir." }
  }
  revalidatePath(ROTA)
  return { ok: true, id }
}

// ============================================================
// FASE 2 — PREFERÊNCIAS DO USUÁRIO (foto + modo de cor)
// ============================================================

export async function salvarPreferenciaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const patch: Record<string, unknown> = {
    usuario_id: usuario.id,
    updated_at: new Date().toISOString(),
  }
  if (formData.has("modo_cor")) {
    const modo = String(formData.get("modo_cor"))
    if (modo !== "colorido" && modo !== "mono") {
      return { ok: false, erro: "Modo de cor inválido." }
    }
    patch.modo_cor = modo
  }
  const fotoBase64 = opcional(formData, "foto_base64")
  if (fotoBase64) {
    const url = await uploadFotoPerfil(fotoBase64, "usuario")
    if (!url) return { ok: false, erro: "Não foi possível subir a foto." }
    patch.foto_url = url
  }
  if (formData.get("remover_foto") === "1") patch.foto_url = null

  const { error } = await db
    .from("ws_preferencias")
    .upsert(patch, { onConflict: "usuario_id" })
  if (error) {
    console.error("[workspace] salvarPreferencia error", error.message)
    return { ok: false, erro: "Não foi possível salvar. A migration da Fase 2 já foi aplicada?" }
  }
  revalidatePath(ROTA)
  return { ok: true }
}

/**
 * Reordena um DIA do calendário: recebe a lista completa de ids na nova ordem
 * e renumera ordem = (i+1)*1000 — determinístico e cura os empates de ordem=0
 * que vieram da importação. A tarefa movida também ganha o prazo do dia de
 * destino (mover entre colunas e reordenar são o mesmo gesto no Asana).
 */
export async function reordenarDiaAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const movidaId = String(formData.get("movida_id") ?? "").trim()
  if (!ehUuid(movidaId)) return { ok: false, erro: "Tarefa inválida." }
  const prazo = dataOpcional(formData, "prazo_em")
  if (prazo === undefined) return { ok: false, erro: "Data inválida." }

  let ids: string[]
  try {
    const bruto = JSON.parse(String(formData.get("ids") ?? "[]"))
    ids = Array.isArray(bruto) ? bruto.map(String).filter(ehUuid) : []
  } catch {
    return { ok: false, erro: "Ordem inválida." }
  }
  if (!ids.includes(movidaId)) return { ok: false, erro: "Ordem inválida." }
  if (ids.length > 300) return { ok: false, erro: "Dia grande demais." }

  const movida = await buscarTarefa(movidaId)
  if (!movida) return { ok: false, erro: "Tarefa não encontrada." }
  if (!podeEditar(usuario, movida)) {
    return { ok: false, erro: "Você não pode mover esta tarefa." }
  }

  // Renumeração: poucas linhas (um dia), determinística, sem estado fracionado.
  for (let i = 0; i < ids.length; i++) {
    const patch: Record<string, unknown> = { ordem: (i + 1) * 1000 }
    if (ids[i] === movidaId && prazo !== movida.prazo_em) {
      patch.prazo_em = prazo
      if (prazo === null) patch.prazo_hora = null
    }
    const { error } = await db.from("ws_tarefas").update(patch).eq("id", ids[i])
    if (error) {
      console.error("[workspace] reordenarDia error", error.message)
      return { ok: false, erro: "Não foi possível reordenar." }
    }
  }

  if (prazo !== movida.prazo_em) {
    await registrarAtividade(movidaId, usuario.id, "prazo", {
      prazo: { de: movida.prazo_em, para: prazo },
    })
  }
  await ping(movidaId, "tarefa")
  revalidatePath(ROTA)
  return { ok: true, id: movidaId }
}

/**
 * Cria um GRUPO de empresa no Workspace sem precisar de cliente: um contexto
 * tipo 'empresa' serve de âncora do grupo (aparece como seção na aba
 * Clientes, participa da ordenação e do renomear). Não toca em
 * empresas_config — é organização interna do Workspace.
 */
export async function criarEmpresaWsAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const nome = texto(formData, "nome", 120)
  if (!nome) return { ok: false, erro: "Informe o nome da empresa." }

  // garantirAncora reaproveita grupo existente comparando SEM caixa e cria o
  // novo no fim da lista — nenhuma empresa muda de lugar por causa disto.
  const id = await garantirAncora(db, nome, usuario.id)
  if (!id) return { ok: false, erro: "Não foi possível criar a empresa." }
  revalidatePath(ROTA)
  return { ok: true, id }
}

/**
 * Persiste a ordem visual da aba Clientes.
 *
 * Recebe os GRUPOS na ordem final, cada um com sua âncora e a lista de
 * clientes. Grava:
 *   • âncora.ordem = posição do grupo  (10, 20, 30…)
 *   • cliente.ordem = posição no grupo (10, 20, 30…)
 *   • cliente.grupo_id/empresa_nome = grupo onde ele parou
 *
 * Ordem POSICIONAL e explícita: como toda linha tem um valor próprio, a tela
 * só reordena quando alguém arrasta. Antes a posição do grupo era o min(ordem)
 * dos seus contextos, então adicionar ou tirar um cliente movia o grupo
 * inteiro de lugar sozinho.
 */
export async function reordenarContextosAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  let grupos: { ancoraId: string; nome: string; clientes: string[] }[]
  try {
    const bruto = JSON.parse(String(formData.get("grupos") ?? "[]"))
    grupos = Array.isArray(bruto)
      ? bruto
          .map((g) => ({
            ancoraId: String(g?.ancoraId ?? ""),
            nome: String(g?.nome ?? "").slice(0, 120),
            clientes: Array.isArray(g?.clientes)
              ? g.clientes.map(String).filter(ehUuid)
              : [],
          }))
          .filter((g) => ehUuid(g.ancoraId))
      : []
  } catch {
    return { ok: false, erro: "Ordem inválida." }
  }
  if (grupos.length === 0 || grupos.length > 200) {
    return { ok: false, erro: "Ordem inválida." }
  }
  const totalClientes = grupos.reduce((n, g) => n + g.clientes.length, 0)
  if (totalClientes > 1000) return { ok: false, erro: "Lista grande demais." }

  for (let i = 0; i < grupos.length; i++) {
    const g = grupos[i]
    const { error: errAncora } = await db
      .from("ws_contextos")
      .update({ ordem: (i + 1) * 10 })
      .eq("id", g.ancoraId)
      .eq("tipo", "empresa")
    if (errAncora) {
      console.error("[workspace] reordenarContextos ancora", errAncora.message)
      return { ok: false, erro: "Não foi possível reordenar." }
    }

    for (let j = 0; j < g.clientes.length; j++) {
      const { error } = await db
        .from("ws_contextos")
        .update({
          ordem: (j + 1) * 10,
          grupo_id: g.ancoraId,
          empresa_nome: g.nome || null,
        })
        .eq("id", g.clientes[j])
      if (error) {
        console.error("[workspace] reordenarContextos cliente", error.message)
        return { ok: false, erro: "Não foi possível reordenar." }
      }
    }
  }
  revalidatePath(ROTA)
  return { ok: true }
}

/**
 * Exclui um GRUPO de empresa do Workspace (soft): arquiva a âncora tipo
 * 'empresa'. Só permite com o grupo VAZIO — se ainda há clientes nele, o
 * caminho certo é arrastá-los pra outro grupo primeiro; excluir junto
 * esconderia áreas de trabalho inteiras sem ninguém pedir.
 */
export async function excluirEmpresaWsAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  // Pelo ID da âncora, não pelo nome: casar a string era frágil (caixa
  // diferente entre a âncora e o que a tela mostrava) e o update podia não
  // pegar linha nenhuma, com a UI dizendo "excluído" sem nada ter acontecido.
  const ancoraId = String(formData.get("ancora_id") ?? "").trim()
  if (!ehUuid(ancoraId)) return { ok: false, erro: "Empresa inválida." }

  const { count } = await db
    .from("ws_contextos")
    .select("id", { count: "exact", head: true })
    .eq("grupo_id", ancoraId)
    .neq("tipo", "empresa")
    .is("arquivado_em", null)
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      erro: "Mova ou exclua os clientes deste grupo antes de excluir a empresa.",
    }
  }

  const { data, error } = await db
    .from("ws_contextos")
    .update({ arquivado_em: new Date().toISOString() })
    .eq("id", ancoraId)
    .eq("tipo", "empresa")
    .is("arquivado_em", null)
    .select("id")
    .maybeSingle()
  if (error) {
    console.error("[workspace] excluirEmpresaWs error", error.message)
    return { ok: false, erro: "Não foi possível excluir." }
  }
  if (!data) return { ok: false, erro: "Empresa não encontrada (já excluída?)." }
  revalidatePath(ROTA)
  return { ok: true, id: ancoraId }
}

/**
 * Exclui (soft) a área de trabalho de um CLIENTE: arquiva o contexto.
 *
 * As TAREFAS não são apagadas — elas continuam no banco e nas outras pastas
 * em que estiverem vinculadas. É o mesmo princípio do resto do módulo:
 * nada some de verdade, some da visão.
 */
export async function excluirClienteWorkspaceAction(
  formData: FormData
): Promise<ResultadoWorkspace> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!ehUuid(id)) return { ok: false, erro: "Cliente inválido." }

  const { data: ctx } = await db
    .from("ws_contextos")
    .select("id, tipo")
    .eq("id", id)
    .maybeSingle()
  if (!ctx) return { ok: false, erro: "Cliente não encontrado." }
  if ((ctx as { tipo: string }).tipo !== "cliente") {
    return { ok: false, erro: "Este contexto não é um cliente." }
  }

  const { error } = await db
    .from("ws_contextos")
    .update({ arquivado_em: new Date().toISOString() })
    .eq("id", id)
  if (error) {
    console.error("[workspace] excluirClienteWorkspace error", error.message)
    return { ok: false, erro: "Não foi possível excluir." }
  }
  revalidatePath(ROTA)
  return { ok: true, id }
}
