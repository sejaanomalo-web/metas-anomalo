// =============================================================================
// Funil Estáticos Meta — serviço do SERVIDOR (service role; nunca no browser).
//
// Sessão  → funil_sessoes (id + segredo; o banco guarda só o hash)
// Lead    → RPC funil_capturar_lead (lead + sessão + evento + fila CAPI, atômico)
// Agenda  → lib/reunioes-nativas (mesma disponibilidade do Workspace)
// Reserva → RPC funil_reservar (mesmo lock/EXCLUDE do canal ATIVO)
// CAPI    → funil_conversoes (fila durável) + despacharConversoes()
// =============================================================================
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { getSupabaseAdmin } from "./supabase"
import { agendaNativa, idempotencyKeyValida } from "./reunioes-nativas"
import {
  avaliarRespostas, classificarOrigem, EVENTOS_CLIENTE, fbcDeFbclid, filtrarRespostas, resolverCriativo,
  sanitizarAtribuicao, validarDefinicao, type Atribuicao, type DefinicaoFunil,
} from "./funil-estaticos-nucleo"

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEGREDO = /^[A-Za-z0-9_-]{43}$/

export interface FunilPublico {
  id: string; chave: string; nome: string; slug: string; ativo: boolean; slugsAnteriores: string[]
  versaoId: string; versaoNumero: number; definicao: DefinicaoFunil
  privacidadeUrl: string | null; consentimentoModo: "opt_in" | "informativo"
  pixelId: string | null; eventosMeta: Record<string, boolean>; capiAtivo: boolean
  testEventCode: string | null; qualificacao: { ativo?: boolean; alta?: number; media?: number }
  criativos: { id: string; codigo: string; meta_ad_id: string | null }[]
  crmUsuarioId: string | null; crmEmpresaSlug: string | null
}

// Cache curto SÓ de configuração/versão (nunca de disponibilidade).
let cache: { em: number; porSlug: Map<string, FunilPublico | null> } = { em: 0, porSlug: new Map() }
export function limparCacheFunil() { cache = { em: 0, porSlug: new Map() } }

type Linha = Record<string, unknown>
function montar(f: Linha, v: Linha, criativos: Linha[]): FunilPublico {
  return {
    id: f.id as string, chave: f.chave as string, nome: f.nome as string, slug: f.slug as string, ativo: f.ativo === true,
    slugsAnteriores: (f.slugs_anteriores as string[]) ?? [],
    versaoId: v.id as string, versaoNumero: v.numero as number, definicao: v.definicao as DefinicaoFunil,
    privacidadeUrl: (f.privacidade_url as string) ?? null,
    consentimentoModo: f.consentimento_modo === "informativo" ? "informativo" : "opt_in",
    pixelId: (f.pixel_id as string) ?? null, eventosMeta: (f.eventos_meta as Record<string, boolean>) ?? {},
    capiAtivo: f.capi_ativo === true, testEventCode: (f.meta_test_event_code as string) ?? null,
    qualificacao: (f.qualificacao as FunilPublico["qualificacao"]) ?? {},
    criativos: criativos.map(c => ({ id: c.id as string, codigo: c.codigo as string, meta_ad_id: (c.meta_ad_id as string) ?? null })),
    crmUsuarioId: (f.crm_usuario_id as string) ?? null, crmEmpresaSlug: (f.crm_empresa_slug as string) ?? null,
  }
}

const COLS_FUNIL = "id, chave, nome, slug, slugs_anteriores, ativo, versao_publicada_id, privacidade_url, consentimento_modo, pixel_id, capi_ativo, meta_test_event_code, eventos_meta, qualificacao, crm_usuario_id, crm_empresa_slug"

/** Funil pelo slug (atual ou antigo). `versaoId` força outra versão (prévia admin). */
export async function carregarFunil(slug: string, opts: { versaoId?: string; semCache?: boolean } = {}): Promise<FunilPublico | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null
  const chaveCache = `${slug}|${opts.versaoId ?? ""}`
  if (!opts.semCache && Date.now() - cache.em < 30_000 && cache.porSlug.has(chaveCache)) return cache.porSlug.get(chaveCache)!
  if (Date.now() - cache.em >= 30_000) cache = { em: Date.now(), porSlug: new Map() }
  const db = getSupabaseAdmin()
  if (!db) return null
  let { data: f } = await db.from("funil_config").select(COLS_FUNIL).eq("slug", slug).maybeSingle()
  if (!f) ({ data: f } = await db.from("funil_config").select(COLS_FUNIL).contains("slugs_anteriores", [slug]).maybeSingle())
  if (!f) { cache.porSlug.set(chaveCache, null); return null }
  const versaoId = opts.versaoId ?? (f.versao_publicada_id as string | null)
  if (!versaoId) return null
  const [{ data: v }, { data: cr }] = await Promise.all([
    db.from("funil_versoes").select("id, numero, definicao, funil_id").eq("id", versaoId).eq("funil_id", f.id).maybeSingle(),
    db.from("funil_criativos").select("id, codigo, meta_ad_id").eq("funil_id", f.id),
  ])
  if (!v || validarDefinicao(v.definicao).length) return null
  const out = montar(f, v, cr ?? [])
  cache.porSlug.set(chaveCache, out)
  return out
}

// -----------------------------------------------------------------------------
// Segredos, hashes, prévia, rate limit
// -----------------------------------------------------------------------------
function chaveServidor(): string {
  const k = process.env.FUNIL_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!k) throw new Error("sem segredo de servidor")
  return k
}
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
const hmac = (label: string, valor: string) => createHmac("sha256", chaveServidor()).update(`${label}:${valor}`).digest("hex")
export function novoSegredo(): string { return randomBytes(32).toString("base64url") }
export const hashSegredo = (s: string) => sha256(`funil-sessao:${s}`)
export const hashIp = (ip: string) => hmac("funil-ip", ip)

/** Link de prévia (versão de teste/rascunho) válido por 7 dias, assinado. */
export function tokenPrevia(funilId: string, versaoId: string, agora = Date.now()): string {
  const exp = Math.floor(agora / 1000) + 7 * 86400
  return `${versaoId}.${exp}.${hmac("funil-previa", `${funilId}|${versaoId}|${exp}`).slice(0, 32)}`
}
export function lerTokenPrevia(funilId: string, token: string | null): string | null {
  if (!token) return null
  const [versaoId, exp, sig] = token.split(".")
  if (!UUID.test(versaoId ?? "") || !/^\d{10}$/.test(exp ?? "") || !/^[a-f0-9]{32}$/.test(sig ?? "")) return null
  if (Number(exp) * 1000 < Date.now()) return null
  const esperado = hmac("funil-previa", `${funilId}|${versaoId}|${exp}`).slice(0, 32)
  return timingSafeEqual(Buffer.from(sig), Buffer.from(esperado)) ? versaoId : null
}

export function ipDaRequisicao(req: Request): string {
  return req.headers.get("x-real-ip")?.slice(0, 64) || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "unknown"
}

/** Reusa o rate limit distribuído do banco (reunioes_nativas_limitar). */
export async function limitarFunil(chave: string, limite: number): Promise<boolean | null> {
  const db = getSupabaseAdmin()
  if (!db) return null
  try {
    const { data, error } = await db.rpc("reunioes_nativas_limitar", { p_chave: hmac("funil-rate", chave), p_limite: limite })
    return error ? null : data === true
  } catch { return null }
}

// -----------------------------------------------------------------------------
// Sessão
// -----------------------------------------------------------------------------
type SessaoDb = {
  id: string; funil_id: string; versao_id: string; segredo_hash: string; ambiente: "producao" | "teste"; lead_id: string | null
  agendamento_id: string | null; estado: string; etapa_atual: string; perguntas_concluidas: number
  respostas: Record<string, string>; respostas_em: Record<string, string>; atribuicao: Atribuicao; consentimento_marketing: boolean | null
  fbp: string | null; fbc: string | null; iniciada_em: string | null; contato_visto_em: string | null; agenda_vista_em: string | null
  horario_selecionado_em: string | null; sem_horarios_em: string | null
}
const COLS_SESSAO = "id, funil_id, versao_id, segredo_hash, ambiente, lead_id, agendamento_id, estado, etapa_atual, perguntas_concluidas, respostas, respostas_em, atribuicao, consentimento_marketing, fbp, fbc, iniciada_em, contato_visto_em, agenda_vista_em, horario_selecionado_em, sem_horarios_em"

export async function lerSessao(funil: FunilPublico, id: unknown, segredo: unknown): Promise<SessaoDb | null> {
  if (typeof id !== "string" || !UUID.test(id) || typeof segredo !== "string" || !SEGREDO.test(segredo)) return null
  const db = getSupabaseAdmin()
  if (!db) return null
  const { data } = await db.from("funil_sessoes").select(COLS_SESSAO).eq("id", id).eq("funil_id", funil.id).maybeSingle()
  if (!data) return null
  const a = Buffer.from(data.segredo_hash as string), b = Buffer.from(hashSegredo(segredo))
  return a.length === b.length && timingSafeEqual(a, b) ? (data as SessaoDb) : null
}

export interface EstadoPublico {
  sessaoId: string; segredo?: string; versaoId: string; etapa: string; respostas: Record<string, string>
  lead: { primeiroNome: string } | null
  reuniao: { inicio: string; fim: string; status: string } | null
  consentimento: boolean | null; ambiente: "producao" | "teste"
}

async function estadoPublico(s: SessaoDb): Promise<EstadoPublico> {
  const db = getSupabaseAdmin()!
  let lead: EstadoPublico["lead"] = null, reuniao: EstadoPublico["reuniao"] = null
  if (s.lead_id) {
    const { data } = await db.from("funil_leads").select("nome").eq("id", s.lead_id).maybeSingle()
    if (data) lead = { primeiroNome: String(data.nome).split(" ")[0] }
  }
  if (s.agendamento_id) {
    const { data } = await db.from("reunioes_agendamentos").select("inicio, fim, status").eq("id", s.agendamento_id).maybeSingle()
    if (data?.inicio && data.fim) reuniao = { inicio: data.inicio, fim: data.fim, status: data.status }
  }
  return { sessaoId: s.id, versaoId: s.versao_id, etapa: s.etapa_atual, respostas: s.respostas ?? {}, lead, reuniao,
    consentimento: s.consentimento_marketing, ambiente: s.ambiente }
}

/** Abre (ou retoma) a sessão. Não cria contato comercial — sessão é anônima. */
export async function abrirSessao(funil: FunilPublico, req: Request, body: Record<string, unknown>, ambiente: "producao" | "teste") {
  const db = getSupabaseAdmin()
  if (!db) return null
  const atual = await lerSessao(funil, body.sessaoId, body.segredo)
  if (atual && atual.versao_id === funil.versaoId && atual.ambiente === ambiente) {
    await db.from("funil_sessoes").update({ ultima_interacao_em: new Date().toISOString(), abandonada: false, abandonada_em: null, etapa_abandono: null }).eq("id", atual.id)
    return estadoPublico(atual)
  }
  const bruto = (body.atribuicao && typeof body.atribuicao === "object" ? body.atribuicao : {}) as Record<string, unknown>
  const atribuicao = sanitizarAtribuicao(bruto)
  const ref = typeof body.referrer === "string" ? body.referrer : ""
  let refererHost: string | null = null
  try { refererHost = ref ? new URL(ref).hostname.slice(0, 120) : null } catch { refererHost = null }
  if (refererHost) atribuicao.referer_host = refererHost
  const agora = Date.now()
  const fbp = typeof body.fbp === "string" && /^fb\.[0-9]\.[0-9]{10,16}\.[0-9A-Za-z_-]{1,40}$/.test(body.fbp) ? body.fbp : null
  const fbcCookie = typeof body.fbc === "string" && /^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,500}$/.test(body.fbc) ? body.fbc : null
  const segredo = novoSegredo()
  // Retomada de uma sessão de versão anterior: mantém a atribuição original.
  const herdada = atual?.atribuicao && Object.keys(atual.atribuicao).length ? atual.atribuicao : null
  const atrib = herdada ?? atribuicao
  const linha = {
    id: randomUUID(), funil_id: funil.id, versao_id: funil.versaoId, segredo_hash: hashSegredo(segredo), ambiente,
    atribuicao: atrib, canal_origem: classificarOrigem(atrib), criativo_id: resolverCriativo(atrib, funil.criativos),
    fbp, fbc: fbcCookie ?? fbcDeFbclid(atrib.fbclid, agora),
    consentimento_marketing: typeof body.consentimento === "boolean" ? body.consentimento : null,
    ip_hash: hashIp(ipDaRequisicao(req)), user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
    referer_host: refererHost, etapa_atual: funil.definicao.perguntas[0]?.id ?? "p1",
  }
  const { data, error } = await db.from("funil_sessoes").insert(linha).select(COLS_SESSAO).single()
  if (error || !data) return null
  await db.from("funil_eventos").insert({ funil_id: funil.id, sessao_id: data.id, eid: randomUUID(), evento: "funnel_page_view", etapa: linha.etapa_atual, ambiente,
    dados: { versao: funil.versaoNumero, origem: linha.canal_origem } })
  return { ...(await estadoPublico(data as SessaoDb)), segredo }
}

// -----------------------------------------------------------------------------
// Eventos do navegador (sem PII)
// -----------------------------------------------------------------------------
type EventoEntrada = { eid?: unknown; evento?: unknown; etapa?: unknown; opcao?: unknown; codigo?: unknown; consentimento?: unknown }

export async function registrarEventos(funil: FunilPublico, s: SessaoDb, eventos: unknown[]): Promise<boolean> {
  const db = getSupabaseAdmin()
  if (!db) return false
  const perguntas = funil.definicao.perguntas
  const ids = perguntas.map(p => p.id)
  const etapasValidas = new Set([...ids, "contato", "agenda", "confirmacao"])
  const agoraIso = new Date().toISOString()
  const linhas: Record<string, unknown>[] = []
  const respostas = { ...(s.respostas ?? {}) }
  const respostasEm = { ...(s.respostas_em ?? {}) }
  const patch: Record<string, unknown> = { ultima_interacao_em: agoraIso, abandonada: false, abandonada_em: null, etapa_abandono: null }
  for (const bruto of eventos.slice(0, 30)) {
    const e = (bruto ?? {}) as EventoEntrada
    if (typeof e.eid !== "string" || !UUID.test(e.eid) || !EVENTOS_CLIENTE.includes(e.evento as never)) continue
    const etapa = typeof e.etapa === "string" && etapasValidas.has(e.etapa) ? e.etapa : null
    const dados: Record<string, string | boolean> = {}
    if (e.evento === "question_answered" && etapa && ids.includes(etapa)) {
      const p = perguntas.find(x => x.id === etapa)!
      if (typeof e.opcao !== "string" || !p.opcoes.some(o => o.id === e.opcao)) continue
      respostas[etapa] = e.opcao; respostasEm[etapa] = agoraIso; dados.opcao = e.opcao
      if (!s.iniciada_em) patch.iniciada_em = agoraIso
    }
    if ((e.evento === "booking_failed" || e.evento === "client_error") && typeof e.codigo === "string") dados.codigo = e.codigo.replace(/[^A-Z_]/g, "").slice(0, 40)
    if (e.evento === "funnel_started" && !s.iniciada_em) patch.iniciada_em = agoraIso
    if (e.evento === "contact_form_viewed" && !s.contato_visto_em) patch.contato_visto_em = agoraIso
    if (e.evento === "booking_page_viewed" && !s.agenda_vista_em) patch.agenda_vista_em = agoraIso
    if (e.evento === "booking_no_slots" && !s.sem_horarios_em) patch.sem_horarios_em = agoraIso
    if (e.evento === "booking_slot_selected") { if (!s.horario_selecionado_em) patch.horario_selecionado_em = agoraIso; if (s.estado === "lead") patch.estado = "horario_selecionado" }
    if (typeof e.consentimento === "boolean") patch.consentimento_marketing = e.consentimento
    if (etapa) patch.etapa_atual = etapa
    linhas.push({ funil_id: funil.id, sessao_id: s.id, lead_id: s.lead_id, eid: e.eid, evento: e.evento, etapa, dados, ambiente: s.ambiente })
  }
  const limpas = filtrarRespostas(funil.definicao, respostas)
  // Concluída = respondida em sequência desde a 1ª (voltar e trocar não regride).
  let concluidas = 0
  for (const id of ids) { if (limpas[id]) concluidas++; else break }
  patch.respostas = limpas; patch.respostas_em = respostasEm
  patch.perguntas_concluidas = Math.max(concluidas, s.perguntas_concluidas)
  if (s.estado === "aberta" && (patch.iniciada_em || s.iniciada_em)) patch.estado = "em_andamento"
  if (linhas.length) {
    const { error } = await db.from("funil_eventos").upsert(linhas, { onConflict: "sessao_id,eid", ignoreDuplicates: true })
    if (error) return false
  }
  const { error } = await db.from("funil_sessoes").update(patch).eq("id", s.id)
  return !error
}

// -----------------------------------------------------------------------------
// Captura do lead
// -----------------------------------------------------------------------------
export function contextoCapi(req: Request, s: SessaoDb, urlFonte: string): Record<string, string> {
  const ctx: Record<string, string> = { event_source_url: urlFonte.slice(0, 500) }
  const ip = ipDaRequisicao(req); if (ip !== "unknown") ctx.client_ip_address = ip
  const ua = req.headers.get("user-agent"); if (ua) ctx.client_user_agent = ua.slice(0, 400)
  if (s.fbp) ctx.fbp = s.fbp
  if (s.fbc) ctx.fbc = s.fbc
  return ctx
}

export async function capturarLead(funil: FunilPublico, s: SessaoDb, dados: { nome: string; telefone: string; email: string | null; instagram: string | null; consentimento: { marketing: boolean | null; aviso_versao: string } }, ctx: Record<string, string>) {
  const db = getSupabaseAdmin()
  if (!db) return { code: "TEMPORARY_FAILURE" as const }
  const respostas = filtrarRespostas(funil.definicao, s.respostas)
  if (Object.keys(respostas).length < funil.definicao.perguntas.length) return { code: "ANSWERS_REQUIRED" as const }
  const av = avaliarRespostas(funil.definicao, respostas, funil.qualificacao)
  const { data, error } = await db.rpc("funil_capturar_lead", {
    p_sessao: s.id, p_segredo_hash: s.segredo_hash, p_nome: dados.nome, p_telefone: dados.telefone, p_email: dados.email,
    p_instagram: dados.instagram, p_interesse: av.interesse, p_pontuacao: av.pontos, p_qualificacao: av.qualificacao,
    p_consentimento: { ...dados.consentimento, em: new Date().toISOString() }, p_contexto: ctx,
  })
  if (error || !data || data.code) return { code: (data?.code ?? "TEMPORARY_FAILURE") as string }
  // CRM: espelho best-effort; o funil_leads é a fonte da verdade e o
  // processamento periódico tenta de novo os que ficaram sem vínculo.
  try { await vincularCrm(funil, data.leadId as string) } catch { /* reprocessado depois */ }
  return { leadId: data.leadId as string, eventId: data.eventId as string, enviarPixel: data.enviarPixel === true }
}

/** Cria (ou reaproveita) o lead no CRM existente, no dono configurado. */
export async function vincularCrm(funil: Pick<FunilPublico, "crmUsuarioId" | "crmEmpresaSlug">, leadId: string): Promise<boolean> {
  if (!funil.crmUsuarioId || !funil.crmEmpresaSlug) return false
  const db = getSupabaseAdmin()
  if (!db) return false
  const { data: l } = await db.from("funil_leads").select("id, nome, telefone_e164, email, crm_lead_id, ambiente").eq("id", leadId).maybeSingle()
  if (!l || l.crm_lead_id || l.ambiente === "teste") return Boolean(l?.crm_lead_id)
  const tel = String(l.telefone_e164).replace(/^\+/, "")
  const [{ data: dono }, { data: emp }, { data: etapa }] = await Promise.all([
    db.from("usuarios").select("id, nome").eq("id", funil.crmUsuarioId).eq("ativo", true).maybeSingle(),
    db.from("empresas_config").select("nome").eq("slug", funil.crmEmpresaSlug).maybeSingle(),
    db.from("crm_etapas").select("id").eq("ativo", true).is("usuario_id", null).order("ordem", { ascending: true }).limit(1),
  ])
  if (!dono) return false
  const { data: existente } = await db.from("crm_leads").select("id, usuario_id").eq("empresa_slug", funil.crmEmpresaSlug).eq("telefone_e164", tel).maybeSingle()
  let crmId: string | null = existente && existente.usuario_id === dono.id ? (existente.id as string) : null
  if (!existente) {
    const { data: novo, error } = await db.from("crm_leads").insert({
      empresa_slug: funil.crmEmpresaSlug, empresa_nome: (emp?.nome as string) ?? funil.crmEmpresaSlug,
      usuario_id: dono.id, usuario_nome: dono.nome, telefone_e164: tel, nome: l.nome, nome_manual: true, email: l.email,
      origem: "trafego", etapa_id: etapa?.[0]?.id ?? null, status: "aberto", ultima_interacao_em: new Date().toISOString(),
    }).select("id").single()
    if (error || !novo) return false
    crmId = novo.id as string
  }
  // Telefone já pertence a outro usuário do CRM: não funde nem revela; fica sem vínculo.
  if (!crmId) return false
  await db.from("funil_leads").update({ crm_lead_id: crmId }).eq("id", l.id)
  return true
}

// -----------------------------------------------------------------------------
// Agenda e reserva
// -----------------------------------------------------------------------------
export async function agendaDoFunil(from: string, days: number) {
  return agendaNativa(from, days, "estaticos_meta")
}

export async function reservarNoFunil(s: SessaoDb, start: string, chave: string, ctx: Record<string, string>) {
  if (!idempotencyKeyValida(chave)) return { code: "INVALID_INPUT" }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(start) || !Number.isFinite(Date.parse(start))) return { code: "INVALID_INPUT" }
  const db = getSupabaseAdmin()
  if (!db) return { code: "TEMPORARY_FAILURE" }
  const { data, error } = await db.rpc("funil_reservar", {
    p_sessao: s.id, p_segredo_hash: s.segredo_hash, p_inicio: new Date(start).toISOString(), p_chave: chave, p_contexto: ctx,
  })
  if (error || !data) return { code: "TEMPORARY_FAILURE" }
  return data as { code?: string; status?: string; bookingId?: string; startsAt?: string; endsAt?: string; eventId?: string; enviarPixel?: boolean }
}

// -----------------------------------------------------------------------------
// Conversions API (fila durável, retry com backoff, event_id estável)
// -----------------------------------------------------------------------------
export function capiConfigurada(): boolean { return Boolean(process.env.FUNIL_ESTATICOS_META_CAPI_TOKEN) }

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "")

/** user_data conforme a documentação: hash SHA-256 só nos campos que exigem hash. */
export function montarUserData(lead: { id: string; nome: string; telefone_e164: string; email: string | null }, ctx: Record<string, string>) {
  const partes = lead.nome.trim().split(/\s+/)
  const ud: Record<string, string | string[]> = {
    ph: [sha256(lead.telefone_e164.replace(/\D/g, ""))],
    external_id: [sha256(lead.id)],
    country: [sha256("br")],
  }
  const fn = normalizar(partes[0] ?? ""); if (fn) ud.fn = [sha256(fn)]
  const ln = normalizar(partes.length > 1 ? partes[partes.length - 1] : ""); if (ln) ud.ln = [sha256(ln)]
  if (lead.email) ud.em = [sha256(lead.email.trim().toLowerCase())]
  // Sem hash (exigência da Meta): IP, user agent, fbp, fbc.
  if (ctx.client_ip_address) ud.client_ip_address = ctx.client_ip_address
  if (ctx.client_user_agent) ud.client_user_agent = ctx.client_user_agent
  if (ctx.fbp) ud.fbp = ctx.fbp
  if (ctx.fbc) ud.fbc = ctx.fbc
  return ud
}

export function backoffMs(tentativas: number): number { return Math.min(6 * 3_600_000, 60_000 * 2 ** Math.max(0, tentativas - 1)) }

/** Processa itens pendentes da fila. `sessaoId` restringe (disparo logo após o fato). */
export async function despacharConversoes(opts: { sessaoId?: string; limite?: number } = {}) {
  const db = getSupabaseAdmin()
  const token = process.env.FUNIL_ESTATICOS_META_CAPI_TOKEN
  const r = { enviados: 0, erros: 0, ignorados: 0 }
  if (!db || !token) return r
  let q = db.from("funil_conversoes").select("id, funil_id, lead_id, evento, event_id, event_time, ambiente, tentativas, contexto")
    .in("status", ["pendente", "erro"]).lte("proxima_tentativa_em", new Date().toISOString()).lt("tentativas", 8)
    .order("criado_em", { ascending: true }).limit(opts.limite ?? 25)
  if (opts.sessaoId) q = q.eq("sessao_id", opts.sessaoId)
  const { data: itens } = await q
  for (const it of itens ?? []) {
    const { data: f } = await db.from("funil_config").select("pixel_id, capi_ativo, meta_test_event_code, nome").eq("id", it.funil_id).maybeSingle()
    const { data: lead } = it.lead_id ? await db.from("funil_leads").select("id, nome, telefone_e164, email").eq("id", it.lead_id).maybeSingle() : { data: null }
    // Teste só vai à Meta com código de teste (nunca como conversão real).
    if (!f?.pixel_id || !f.capi_ativo || !lead || (it.ambiente === "teste" && !f.meta_test_event_code)) {
      await db.from("funil_conversoes").update({ status: "ignorado", motivo: !lead ? "sem lead" : it.ambiente === "teste" ? "teste sem test_event_code" : "CAPI desativada", contexto: {} }).eq("id", it.id)
      r.ignorados++; continue
    }
    // Trava otimista: só quem muda a tentativa envia (evita envio duplo concorrente).
    const { data: trava } = await db.from("funil_conversoes").update({ tentativas: it.tentativas + 1, proxima_tentativa_em: new Date(Date.now() + backoffMs(it.tentativas + 1)).toISOString() })
      .eq("id", it.id).eq("tentativas", it.tentativas).select("id")
    if (!trava?.length) continue
    const ctx = (it.contexto ?? {}) as Record<string, string>
    const corpo: Record<string, unknown> = {
      data: [{
        event_name: it.evento, event_id: it.event_id, event_time: Math.floor(Date.parse(it.event_time) / 1000),
        action_source: "website", event_source_url: ctx.event_source_url,
        user_data: montarUserData(lead as { id: string; nome: string; telefone_e164: string; email: string | null }, ctx),
        custom_data: { content_name: f.nome, content_category: "funil_estaticos_meta" },
      }],
    }
    if (it.ambiente === "teste" || process.env.VERCEL_ENV !== "production") {
      if (!f.meta_test_event_code) { await db.from("funil_conversoes").update({ status: "ignorado", motivo: "ambiente não-produção sem test_event_code", contexto: {} }).eq("id", it.id); r.ignorados++; continue }
      corpo.test_event_code = f.meta_test_event_code
    }
    try {
      const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${f.pixel_id}/events?access_token=${encodeURIComponent(token)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo), cache: "no-store",
        signal: AbortSignal.timeout(8000),
      })
      const json = await resp.json().catch(() => ({})) as { events_received?: number; fbtrace_id?: string; error?: { message?: string; code?: number } }
      if (resp.ok && json.events_received) {
        await db.from("funil_conversoes").update({ status: "enviado", enviado_em: new Date().toISOString(), ultimo_erro: null,
          resposta: { events_received: json.events_received, fbtrace_id: json.fbtrace_id, test: Boolean(corpo.test_event_code) }, contexto: {} }).eq("id", it.id)
        r.enviados++
      } else {
        // Mensagem da Meta sanitizada (sem token, sem PII).
        const msg = `HTTP ${resp.status}${json.error?.code ? ` code ${json.error.code}` : ""}: ${(json.error?.message ?? "").replace(/access_token=[^&\s]+/g, "access_token=***").slice(0, 300)}`
        await db.from("funil_conversoes").update({ status: "erro", ultimo_erro: msg }).eq("id", it.id)
        r.erros++
      }
    } catch (e) {
      await db.from("funil_conversoes").update({ status: "erro", ultimo_erro: (e instanceof Error ? e.name : "erro").slice(0, 100) }).eq("id", it.id)
      r.erros++
    }
  }
  return r
}

/** Rotina periódica: inatividade/follow-up (SQL), fila CAPI e CRM pendente. */
export async function processarFunil() {
  const db = getSupabaseAdmin()
  if (!db) return { ok: false }
  const { data: inat } = await db.rpc("funil_processar_inatividade")
  const capi = await despacharConversoes({ limite: 100 })
  let crm = 0
  const { data: fs } = await db.from("funil_config").select("id, crm_usuario_id, crm_empresa_slug").not("crm_usuario_id", "is", null)
  for (const f of fs ?? []) {
    const { data: ls } = await db.from("funil_leads").select("id").eq("funil_id", f.id).is("crm_lead_id", null).eq("ambiente", "producao")
      .gt("criado_em", new Date(Date.now() - 7 * 86400_000).toISOString()).limit(50)
    for (const l of ls ?? []) if (await vincularCrm({ crmUsuarioId: f.crm_usuario_id, crmEmpresaSlug: f.crm_empresa_slug }, l.id)) crm++
  }
  return { ok: true, inatividade: inat, capi, crm }
}
