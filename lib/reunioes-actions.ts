"use server"

// =============================================================================
// Reuniões — ESCRITAS (Server Actions).
// =============================================================================
//
// PERMISSÃO: integração, tipos e disponibilidade mexem em credencial externa e
// na agenda pública da agência — só ADMIN (papel efetivo === 'admin', mesmo
// critério de requererAdmin). Quem tem Workspace só VÊ a aba e pode marcar uma
// tarefa como "bloqueia agenda". Nada aqui confia em id vindo do browser sem
// validar.

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual, type UsuarioSessao } from "./auth"
import { exigirWorkspace } from "./workspace-acesso"
import {
  calApagarOoo,
  calApagarWebhook,
  calAtualizarEventType,
  calAtualizarSchedule,
  calAtualizarWebhook,
  calcomConfigurado,
  calCriarEventType,
  calCriarOoo,
  calCriarSchedule,
  calCriarWebhook,
  calListarConferencias,
  calListarEventTypes,
  calListarSchedules,
  calListarWebhooks,
  calMe,
  calSalvarFeedIcs,
  type CalEventType,
} from "./calcom"
import {
  brParaUtcIso,
  limparTexto,
  montarCorpoEventType,
  montarCorpoSchedule,
  slugDe,
  urlSegura,
  validarBloqueios,
  validarExcecoes,
  validarJanelas,
  validarPeriodos,
  type BloqueioDisp,
} from "./reunioes-nucleo"
import { lerIntegracao, logSync, reconciliar, reprocessarPendentes, type Integracao } from "./reunioes-sync"
import { hojeISO } from "./workspace-datas"

export interface ResultadoReunioes {
  ok: boolean
  erro?: string
  mensagem?: string
  /** Checklist do "Testar conexão". */
  itens?: { rotulo: string; ok: boolean; detalhe?: string }[]
}

const ROTA = "/dashboard/workspace/reunioes"
const GATILHOS = [
  "BOOKING_CREATED",
  "BOOKING_REQUESTED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_REJECTED",
  "BOOKING_LOCATION_UPDATED",
  "MEETING_ENDED",
]

function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function msg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500)
}

async function exigirAdmin(): Promise<{ usuario: UsuarioSessao | null; erro?: string }> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { usuario: null, erro: "Sessão expirada. Entre de novo." }
  if (usuario.papel !== "admin") return { usuario: null, erro: "Só administradores alteram a integração e a agenda pública." }
  return { usuario }
}

/**
 * URL pública deste app, pra montar o endereço do webhook e do feed ICS.
 * APP_PUBLIC_URL (opcional) vence — útil quando o domínio de produção é
 * diferente do host que fez a requisição. Sem ela, usa o host da requisição.
 */
function urlBaseApp(): string | null {
  const env = process.env.APP_PUBLIC_URL?.trim()
  if (env) return env.replace(/\/+$/, "")
  const h = headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  if (!host) return null
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

function urlPublicaAlcancavel(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)
  } catch {
    return false
  }
}

async function db() {
  const d = getSupabaseAdmin()
  if (!d) throw new Error("Supabase indisponível.")
  return d
}

async function integracaoOuErro(): Promise<Integracao> {
  const i = await lerIntegracao(await db())
  if (!i) throw new Error("Integração não encontrada — a migration 20261021_reunioes_calcom.sql foi aplicada?")
  return i
}

// ============================================================
// Conexão
// ============================================================

/** Verificação REAL: chama a API com a chave configurada e lista o que dá. */
export async function testarConexaoAction(): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  if (!calcomConfigurado()) return { ok: false, erro: "CALCOM_API_KEY não está configurada no servidor." }

  const d = await db()
  const integ = await integracaoOuErro()
  const itens: NonNullable<ResultadoReunioes["itens"]> = []
  let me: Awaited<ReturnType<typeof calMe>> | null = null

  try {
    me = await calMe()
    itens.push({ rotulo: "API key válida (GET /v2/me)", ok: true, detalhe: `Conta: ${me.username}` })
  } catch (e) {
    itens.push({ rotulo: "API key válida (GET /v2/me)", ok: false, detalhe: msg(e) })
  }
  if (me) {
    for (const [rotulo, fn] of [
      ["Ler tipos de evento (GET /v2/event-types)", () => calListarEventTypes(me!.username).then((x) => `${x.length} encontrados`)],
      ["Ler disponibilidades (GET /v2/schedules)", () => calListarSchedules().then((x) => `${x.length} encontradas`)],
      ["Ler webhooks (GET /v2/webhooks)", () => calListarWebhooks().then((x) => `${x.length} registrados`)],
      ["Apps de videochamada (GET /v2/conferencing)", () => calListarConferencias().then((x) => x.map((c) => c.appSlug ?? c.type).filter(Boolean).join(", ") || "nenhum app listado (Cal Video é nativo)")],
    ] as const) {
      try {
        itens.push({ rotulo, ok: true, detalhe: await fn() })
      } catch (e) {
        itens.push({ rotulo, ok: false, detalhe: msg(e) })
      }
    }
  }
  itens.push({
    rotulo: "Segredo do webhook (CALCOM_WEBHOOK_SECRET)",
    ok: Boolean(process.env.CALCOM_WEBHOOK_SECRET),
    detalhe: process.env.CALCOM_WEBHOOK_SECRET ? "configurado" : "ausente — webhooks seriam recusados",
  })

  const ok = itens.every((i) => i.ok)
  await d.from("reunioes_integracoes").update({
    ultimo_teste_em: new Date().toISOString(),
    ultimo_teste_ok: ok,
    ...(me ? { conta_id: me.id, conta_username: me.username, conta_email: me.email, conta_nome: me.name, conta_fuso: me.timeZone } : {}),
    ...(ok ? {} : { ultimo_erro: itens.filter((i) => !i.ok).map((i) => `${i.rotulo}: ${i.detalhe}`).join(" | ").slice(0, 500) }),
    ...(!ok && integ.status === "conectado" ? { status: "erro" } : {}),
    ...(ok && integ.status === "erro" ? { status: "conectado", ultimo_erro: null } : {}),
  }).eq("id", integ.id)
  await logSync(d, ok ? "info" : "aviso", "testar_conexao", ok ? "Teste de conexão OK." : "Teste de conexão com falhas.", { atorId: usuario.id })
  revalidatePath(ROTA)
  return { ok, itens, erro: ok ? undefined : "Alguma verificação falhou — veja os itens." }
}

/**
 * Conectar = registrar (ou reativar) o webhook desta URL no Cal.com via
 * POST /v2/webhooks, com o segredo de CALCOM_WEBHOOK_SECRET. Idempotente:
 * se já existe webhook pra esta URL, só atualiza.
 */
export async function conectarAction(): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  if (!calcomConfigurado()) return { ok: false, erro: "Configure CALCOM_API_KEY no servidor antes de conectar." }
  const segredo = process.env.CALCOM_WEBHOOK_SECRET
  if (!segredo) return { ok: false, erro: "Configure CALCOM_WEBHOOK_SECRET no servidor antes de conectar." }
  const base = urlBaseApp()
  if (!base) return { ok: false, erro: "Não consegui descobrir a URL pública do app. Defina APP_PUBLIC_URL." }
  const url = `${base}/api/reunioes/calcom/webhook`
  if (!urlPublicaAlcancavel(url)) {
    return { ok: false, erro: `O Cal.com não alcança ${url}. Conecte a partir do app publicado (https) ou defina APP_PUBLIC_URL.` }
  }

  const d = await db()
  const integ = await integracaoOuErro()
  try {
    const me = await calMe()
    const existentes = await calListarWebhooks()
    const meu = existentes.find((w) => w.subscriberUrl === url)
    const wh = meu
      ? await calAtualizarWebhook(String(meu.id), { active: true, triggers: GATILHOS, secret: segredo })
      : await calCriarWebhook({ subscriberUrl: url, triggers: GATILHOS, secret: segredo, active: true })
    await d.from("reunioes_integracoes").update({
      status: "conectado",
      sincronizacao_ativa: true,
      conta_id: me.id,
      conta_username: me.username,
      conta_email: me.email,
      conta_nome: me.name,
      conta_fuso: me.timeZone,
      webhook_id: String(wh.id),
      webhook_url: url,
      ultimo_erro: null,
      desconectado_em: null,
    }).eq("id", integ.id)
    await logSync(d, "info", "conectar", `Webhook ${meu ? "reativado" : "registrado"} em ${url} (conta ${me.username}).`, { atorId: usuario.id })
    revalidatePath(ROTA)
    return { ok: true, mensagem: `Conectado à conta ${me.username}. Webhook ${meu ? "reativado" : "registrado"}.` }
  } catch (e) {
    await d.from("reunioes_integracoes").update({ status: "erro", ultimo_erro: msg(e) }).eq("id", integ.id)
    await logSync(d, "erro", "conectar", msg(e), { atorId: usuario.id })
    revalidatePath(ROTA)
    return { ok: false, erro: msg(e) }
  }
}

export async function sincronizarAgoraAction(): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const r = await reconciliar(await db())
  revalidatePath(ROTA)
  revalidatePath("/dashboard/workspace")
  return { ok: r.erros === 0, mensagem: r.mensagem, erro: r.erros > 0 ? r.mensagem : undefined }
}

export async function reprocessarAction(): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const d = await db()
  const r = await reprocessarPendentes(d)
  await logSync(d, r.falhas > 0 ? "aviso" : "info", "reprocessar", `Reprocessados ${r.ok}/${r.total} eventos.`, { atorId: usuario.id })
  revalidatePath(ROTA)
  return { ok: r.falhas === 0, mensagem: `${r.ok} de ${r.total} eventos reprocessados.`, erro: r.falhas > 0 ? `${r.falhas} continuam com erro.` : undefined }
}

/** Pausar/retomar: para de importar SEM apagar nada (histórico intacto). */
export async function alternarSincronizacaoAction(ativa: boolean): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const d = await db()
  const integ = await integracaoOuErro()
  let aviso = ""
  if (integ.webhook_id && calcomConfigurado()) {
    try {
      await calAtualizarWebhook(integ.webhook_id, { active: ativa })
    } catch (e) {
      aviso = ` (o webhook no Cal.com não foi ${ativa ? "reativado" : "pausado"}: ${msg(e)}; eventos recebidos serão ignorados mesmo assim)`
    }
  }
  await d.from("reunioes_integracoes").update({ sincronizacao_ativa: ativa }).eq("id", integ.id)
  await logSync(d, "info", "sincronizacao", `Sincronização ${ativa ? "retomada" : "pausada"}.${aviso}`, { atorId: usuario.id })
  revalidatePath(ROTA)
  return { ok: true, mensagem: `Sincronização ${ativa ? "retomada" : "pausada"}.${aviso}` }
}

/**
 * Desconectar: apaga o webhook no Cal.com (best-effort), para a importação e
 * marca desconectado. NÃO cancela reservas, NÃO apaga tarefas nem histórico.
 * A API key em si vive na env — removê-la/revogá-la é passo manual (doc).
 */
export async function desconectarAction(confirmacao: string): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  if (confirmacao !== "DESCONECTAR") return { ok: false, erro: "Digite DESCONECTAR para confirmar." }
  const d = await db()
  const integ = await integracaoOuErro()
  const avisos: string[] = []
  if (integ.webhook_id && calcomConfigurado()) {
    try {
      await calApagarWebhook(integ.webhook_id)
    } catch (e) {
      avisos.push(`Webhook não removido no Cal.com (${msg(e)}) — remova em Settings → Developer → Webhooks.`)
    }
  }
  await d.from("reunioes_integracoes").update({
    status: "desconectado",
    sincronizacao_ativa: false,
    webhook_id: null,
    desconectado_em: new Date().toISOString(),
  }).eq("id", integ.id)
  await logSync(d, avisos.length ? "aviso" : "info", "desconectar", `Integração desconectada. ${avisos.join(" ")}`.trim(), { atorId: usuario.id })
  revalidatePath(ROTA)
  return {
    ok: true,
    mensagem: "Desconectado. Reuniões e tarefas existentes foram preservadas; novas reservas não serão importadas. Para encerrar de vez, revogue a API key no Cal.com e remova CALCOM_API_KEY do servidor.",
    erro: avisos.length ? avisos.join(" ") : undefined,
  }
}

/** Cadastra no Cal.com o feed ICS de bloqueios do Workspace. */
export async function conectarFeedIcsAction(): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const token = process.env.REUNIOES_ICS_TOKEN ?? ""
  if (token.length < 24) return { ok: false, erro: "Configure REUNIOES_ICS_TOKEN (mín. 24 caracteres aleatórios) no servidor." }
  if (!calcomConfigurado()) return { ok: false, erro: "Configure CALCOM_API_KEY antes." }
  const base = urlBaseApp()
  const url = base ? `${base}/api/reunioes/agenda-bloqueios/${token}.ics` : null
  if (!url || !urlPublicaAlcancavel(url)) return { ok: false, erro: "O feed precisa de uma URL https pública. Faça isso pelo app publicado ou defina APP_PUBLIC_URL." }
  const d = await db()
  const integ = await integracaoOuErro()
  try {
    const r = await calSalvarFeedIcs(url)
    await d.from("reunioes_integracoes").update({ ics_credencial_id: r.id }).eq("id", integ.id)
    await logSync(d, "info", "feed_ics", "Feed ICS de bloqueios cadastrado no Cal.com.", { atorId: usuario.id })
    revalidatePath(ROTA)
    return { ok: true, mensagem: "Feed cadastrado. Confira em app.cal.com → Settings → Calendars se ele aparece marcado para checar conflitos." }
  } catch (e) {
    await logSync(d, "erro", "feed_ics", msg(e), { atorId: usuario.id })
    return { ok: false, erro: msg(e) }
  }
}

// ============================================================
// Tipos de reunião
// ============================================================

interface TipoRow {
  id: string
  nome: string
  descricao: string | null
  duracao_min: number
  disponibilidade_id: string | null
  calcom_event_type_id: number | null
  calcom_slug: string | null
  local: "cal_video" | "google_meet" | "definido_no_calcom"
  antecedencia_min_horas: number
  intervalo_min: number
  limite_diario: number | null
  horizonte_dias: number
  ativo: boolean
}

function linkDe(et: CalEventType, username: string | null): string | null {
  return urlSegura(et.bookingUrl) ?? (username ? `https://cal.com/${username}/${et.slug}` : null)
}

/** Empurra as regras do tipo para o event type vinculado (PATCH). */
async function publicarTipo(tipoId: string): Promise<{ ok: boolean; erro?: string }> {
  const d = await db()
  const { data: t } = await d.from("reunioes_tipos").select("*").eq("id", tipoId).maybeSingle()
  const tipo = t as TipoRow | null
  if (!tipo) return { ok: false, erro: "Tipo não encontrado." }
  if (!tipo.calcom_event_type_id) return { ok: false, erro: "Tipo sem evento do Cal.com associado." }
  if (!calcomConfigurado()) return { ok: false, erro: "Cal.com não configurado." }

  let scheduleId: number | null = null
  if (tipo.disponibilidade_id) {
    const { data: disp } = await d.from("reunioes_disponibilidades").select("calcom_schedule_id").eq("id", tipo.disponibilidade_id).maybeSingle()
    scheduleId = (disp?.calcom_schedule_id as number | null) ?? null
  }
  const integ = await lerIntegracao(d)
  try {
    const et = await calAtualizarEventType(tipo.calcom_event_type_id, {
      ...montarCorpoEventType({ ...tipo, scheduleId }),
      hidden: !tipo.ativo,
    })
    await d.from("reunioes_tipos").update({
      calcom_slug: et.slug,
      link_publico: linkDe(et, integ?.conta_username ?? null),
      ultima_sincronizacao_em: new Date().toISOString(),
      ultimo_erro: null,
    }).eq("id", tipoId)
    return { ok: true }
  } catch (e) {
    await d.from("reunioes_tipos").update({ ultimo_erro: msg(e) }).eq("id", tipoId)
    return { ok: false, erro: msg(e) }
  }
}

function inteiroEntre(fd: FormData, campo: string, min: number, max: number): number | null {
  const v = Number(String(fd.get(campo) ?? "").trim())
  return Number.isInteger(v) && v >= min && v <= max ? v : null
}

export async function salvarTipoAction(fd: FormData): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const d = await db()

  const id = String(fd.get("id") ?? "")
  if (!ehUuid(id)) return { ok: false, erro: "Tipo inválido." }
  const nome = limparTexto(fd.get("nome"), 120)
  if (!nome) return { ok: false, erro: "Informe o nome." }
  const duracao = inteiroEntre(fd, "duracao_min", 5, 480)
  const antecedencia = inteiroEntre(fd, "antecedencia_min_horas", 0, 720)
  const intervalo = inteiroEntre(fd, "intervalo_min", 0, 240)
  const horizonte = inteiroEntre(fd, "horizonte_dias", 1, 365)
  const limiteBruto = String(fd.get("limite_diario") ?? "").trim()
  const limite = limiteBruto === "" ? null : inteiroEntre(fd, "limite_diario", 1, 50)
  if (duracao === null || antecedencia === null || intervalo === null || horizonte === null || (limiteBruto !== "" && limite === null)) {
    return { ok: false, erro: "Confira os números: duração 5–480 min, antecedência 0–720 h, intervalo 0–240 min, horizonte 1–365 dias, limite 1–50." }
  }
  const local = String(fd.get("local") ?? "cal_video")
  if (!["cal_video", "google_meet", "definido_no_calcom"].includes(local)) return { ok: false, erro: "Local inválido." }
  const uuidOuNull = (campo: string) => {
    const v = String(fd.get(campo) ?? "").trim()
    return ehUuid(v) ? v : null
  }

  const { error } = await d.from("reunioes_tipos").update({
    nome,
    descricao: limparTexto(fd.get("descricao"), 1000),
    campanha_rotulo: limparTexto(fd.get("campanha_rotulo"), 120),
    duracao_min: duracao,
    antecedencia_min_horas: antecedencia,
    intervalo_min: intervalo,
    horizonte_dias: horizonte,
    limite_diario: limite,
    local,
    responsavel_id: uuidOuNull("responsavel_id"),
    disponibilidade_id: uuidOuNull("disponibilidade_id"),
    contexto_id: uuidOuNull("contexto_id"),
    ativo: fd.get("ativo") === "1",
  }).eq("id", id)
  if (error) return { ok: false, erro: "Não foi possível salvar o tipo." }

  const { data: t } = await d.from("reunioes_tipos").select("calcom_event_type_id").eq("id", id).maybeSingle()
  let mensagem = "Salvo no Workspace."
  if (t?.calcom_event_type_id && calcomConfigurado()) {
    const p = await publicarTipo(id)
    if (!p.ok) {
      revalidatePath(ROTA)
      return { ok: false, erro: `Salvo no Workspace, mas NÃO publicado no Cal.com: ${p.erro}` }
    }
    mensagem = "Salvo e publicado no Cal.com."
  } else {
    mensagem = "Salvo no Workspace. Ainda não está publicado: associe um evento do Cal.com."
  }
  await logSync(d, "info", "tipo", `Tipo "${nome}": ${mensagem}`, { atorId: usuario.id })
  revalidatePath(ROTA)
  return { ok: true, mensagem }
}

export async function criarTipoAction(fd: FormData): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const d = await db()
  const nome = limparTexto(fd.get("nome"), 120)
  if (!nome) return { ok: false, erro: "Informe o nome." }
  const origem = slugDe(String(fd.get("origem_comercial") ?? nome)).replace(/-/g, "_").slice(0, 60)
  if (!/^[a-z0-9_]{2,60}$/.test(origem)) return { ok: false, erro: "Origem comercial inválida (use letras, números e _)." }
  const { data: disp } = await d.from("reunioes_disponibilidades").select("id").order("created_at").limit(1).maybeSingle()
  const { error } = await d.from("reunioes_tipos").insert({
    nome,
    origem_comercial: origem,
    duracao_min: inteiroEntre(fd, "duracao_min", 5, 480) ?? 30,
    disponibilidade_id: (disp?.id as string | undefined) ?? null,
    ordem: 100,
  })
  if (error) return { ok: false, erro: /duplicate|unique/i.test(error.message) ? "Já existe um tipo com essa origem comercial." : "Não foi possível criar." }
  await logSync(d, "info", "tipo", `Tipo "${nome}" criado.`, { atorId: usuario.id })
  revalidatePath(ROTA)
  return { ok: true, mensagem: "Tipo criado. Agora associe ou crie o evento no Cal.com." }
}

/** Associa um tipo interno a um event type JÁ existente na conta. */
export async function vincularEventTypeAction(tipoId: string, eventTypeId: number | null): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  if (!ehUuid(tipoId)) return { ok: false, erro: "Tipo inválido." }
  const d = await db()

  if (eventTypeId === null) {
    await d.from("reunioes_tipos").update({ calcom_event_type_id: null, calcom_slug: null, link_publico: null }).eq("id", tipoId)
    await logSync(d, "info", "tipo", "Associação com o Cal.com removida (nada foi apagado no Cal.com).", { atorId: usuario.id })
    revalidatePath(ROTA)
    return { ok: true, mensagem: "Associação removida." }
  }
  if (!Number.isInteger(eventTypeId) || eventTypeId <= 0) return { ok: false, erro: "Evento inválido." }

  try {
    const integ = await lerIntegracao(d)
    const ets = await calListarEventTypes(integ?.conta_username ?? undefined)
    const et = ets.find((e) => e.id === eventTypeId)
    // Só aceita evento que a API realmente devolve pra esta conta.
    if (!et) return { ok: false, erro: "Esse evento não pertence à conta conectada." }
    const { error } = await d.from("reunioes_tipos").update({
      calcom_event_type_id: et.id,
      calcom_slug: et.slug,
      link_publico: linkDe(et, integ?.conta_username ?? null),
      ultimo_erro: null,
    }).eq("id", tipoId)
    if (error) {
      return { ok: false, erro: /duplicate|unique/i.test(error.message) ? "Esse evento já está associado a outro tipo." : "Não foi possível associar." }
    }
    const p = await publicarTipo(tipoId)
    await logSync(d, p.ok ? "info" : "aviso", "tipo", `Tipo associado ao evento "${et.title}" (${et.id})${p.ok ? " e regras publicadas" : `; publicação falhou: ${p.erro}`}.`, { atorId: usuario.id })
    revalidatePath(ROTA)
    return p.ok ? { ok: true, mensagem: "Associado e publicado." } : { ok: false, erro: `Associado, mas a publicação falhou: ${p.erro}` }
  } catch (e) {
    return { ok: false, erro: msg(e) }
  }
}

/** Cria o event type no Cal.com a partir do tipo interno (POST /v2/event-types). */
export async function criarEventTypeNoCalcomAction(tipoId: string): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  if (!ehUuid(tipoId)) return { ok: false, erro: "Tipo inválido." }
  if (!calcomConfigurado()) return { ok: false, erro: "Cal.com não configurado." }
  const d = await db()
  const { data: t } = await d.from("reunioes_tipos").select("*").eq("id", tipoId).maybeSingle()
  const tipo = t as TipoRow | null
  if (!tipo) return { ok: false, erro: "Tipo não encontrado." }
  if (tipo.calcom_event_type_id) return { ok: false, erro: "Este tipo já tem evento no Cal.com." }

  try {
    const integ = await lerIntegracao(d)
    const corpo = montarCorpoEventType({ ...tipo, scheduleId: null })
    const et = await calCriarEventType({ ...corpo, slug: slugDe(tipo.nome) })
    await d.from("reunioes_tipos").update({
      calcom_event_type_id: et.id,
      calcom_slug: et.slug,
      link_publico: linkDe(et, integ?.conta_username ?? null),
    }).eq("id", tipoId)
    const p = await publicarTipo(tipoId)
    await logSync(d, "info", "tipo", `Evento "${et.title}" criado no Cal.com (${et.id}).`, { atorId: usuario.id })
    revalidatePath(ROTA)
    return p.ok ? { ok: true, mensagem: "Evento criado no Cal.com." } : { ok: false, erro: `Criado, mas a publicação das regras falhou: ${p.erro}` }
  } catch (e) {
    await logSync(d, "erro", "tipo", `Criar evento no Cal.com: ${msg(e)}`, { atorId: usuario.id })
    return { ok: false, erro: msg(e) }
  }
}

export async function publicarTipoAction(tipoId: string): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  if (!ehUuid(tipoId)) return { ok: false, erro: "Tipo inválido." }
  const p = await publicarTipo(tipoId)
  revalidatePath(ROTA)
  return p.ok ? { ok: true, mensagem: "Regras publicadas no Cal.com." } : { ok: false, erro: p.erro }
}

// ============================================================
// Disponibilidade
// ============================================================

/**
 * Salva no Workspace e PUBLICA no Cal.com:
 *   1. schedule (cria na primeira vez; depois PATCH) com regra semanal +
 *      overrides (períodos e exceções);
 *   2. Out of Office para cada bloqueio novo; apaga os removidos;
 *   3. reaponta os event types dos tipos que usam esta disponibilidade.
 * Se o Cal.com recusar, o que foi salvo continua salvo e a tela mostra
 * "não publicado" com o motivo — nunca finge que publicou.
 */
export async function salvarDisponibilidadeAction(fd: FormData): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const d = await db()

  const id = String(fd.get("id") ?? "")
  if (!ehUuid(id)) return { ok: false, erro: "Disponibilidade inválida." }
  const nome = limparTexto(fd.get("nome"), 80)
  if (!nome) return { ok: false, erro: "Informe um nome." }
  const fuso = String(fd.get("fuso") ?? "America/Sao_Paulo")
  try {
    new Intl.DateTimeFormat("en", { timeZone: fuso })
  } catch {
    return { ok: false, erro: "Fuso horário inválido." }
  }

  let bruto: { janelas?: unknown; periodos?: unknown; excecoes?: unknown; bloqueios?: unknown }
  try {
    bruto = JSON.parse(String(fd.get("dados") ?? "{}"))
  } catch {
    return { ok: false, erro: "Dados inválidos." }
  }
  const j = validarJanelas(bruto.janelas ?? [])
  if (!j.ok) return { ok: false, erro: j.erro }
  const p = validarPeriodos(bruto.periodos ?? [])
  if (!p.ok) return { ok: false, erro: p.erro }
  const ex = validarExcecoes(bruto.excecoes ?? [])
  if (!ex.ok) return { ok: false, erro: ex.erro }
  const bl = validarBloqueios(bruto.bloqueios ?? [])
  if (!bl.ok) return { ok: false, erro: bl.erro }

  const { data: atualRow } = await d.from("reunioes_disponibilidades").select("calcom_schedule_id, bloqueios").eq("id", id).maybeSingle()
  if (!atualRow) return { ok: false, erro: "Disponibilidade não encontrada." }
  const responsavelBruto = String(fd.get("responsavel_id") ?? "")

  const salvar = async (extra: Record<string, unknown>) =>
    d.from("reunioes_disponibilidades").update({
      nome,
      fuso,
      responsavel_id: ehUuid(responsavelBruto) ? responsavelBruto : null,
      janelas: j.janelas,
      periodos: p.periodos,
      excecoes: ex.excecoes,
      ...extra,
    }).eq("id", id)

  if (!calcomConfigurado()) {
    await salvar({ bloqueios: bl.bloqueios, publicacao_erro: "Cal.com não configurado — salvo só no Workspace, NÃO publicado." })
    revalidatePath(ROTA)
    return { ok: false, erro: "Salvo no Workspace, mas NÃO publicado: o Cal.com não está configurado." }
  }

  // ---------- publicar ----------
  const corpo = montarCorpoSchedule({ nome, fuso, janelas: j.janelas, periodos: p.periodos, excecoes: ex.excecoes, hoje: hojeISO() })
  const erros: string[] = []
  let scheduleId = (atualRow.calcom_schedule_id as number | null) ?? null
  try {
    if (scheduleId) {
      await calAtualizarSchedule(scheduleId, corpo)
    } else {
      const s = await calCriarSchedule({ ...corpo, isDefault: false })
      scheduleId = s.id
    }
  } catch (e) {
    erros.push(`Horários: ${msg(e)}`)
  }

  // Bloqueios ↔ Out of Office
  const antigos = validarBloqueios(atualRow.bloqueios ?? [])
  const antigosLista: BloqueioDisp[] = antigos.ok ? antigos.bloqueios : []
  const novos: BloqueioDisp[] = []
  for (const b of bl.bloqueios) {
    const anterior = antigosLista.find((a) => a.id === b.id && a.de === b.de && a.ate === b.ate && a.calcom_ooo_id)
    if (anterior) {
      novos.push({ ...b, calcom_ooo_id: anterior.calcom_ooo_id })
      continue
    }
    try {
      const ooo = await calCriarOoo({
        start: brParaUtcIso(b.de, "00:00"),
        end: new Date(Date.parse(brParaUtcIso(b.ate, "23:59")) + 59_999).toISOString(),
        notes: b.motivo ?? "Bloqueio pelo Workspace",
        reason: "unspecified",
      })
      novos.push({ ...b, calcom_ooo_id: ooo.id })
    } catch (e) {
      erros.push(`Bloqueio ${b.de}–${b.ate}: ${msg(e)}`)
      novos.push({ ...b, calcom_ooo_id: null })
    }
  }
  for (const a of antigosLista) {
    const mantido = novos.some((n) => n.calcom_ooo_id && n.calcom_ooo_id === a.calcom_ooo_id)
    if (a.calcom_ooo_id && !mantido) {
      try {
        await calApagarOoo(a.calcom_ooo_id)
      } catch (e) {
        erros.push(`Remover bloqueio ${a.de}–${a.ate}: ${msg(e)}`)
      }
    }
  }

  await salvar({
    bloqueios: novos,
    calcom_schedule_id: scheduleId,
    publicado_em: erros.length === 0 ? new Date().toISOString() : null,
    publicacao_erro: erros.length > 0 ? erros.join(" | ").slice(0, 1000) : null,
  })

  // Tipos que usam esta disponibilidade passam a apontar pro schedule.
  if (scheduleId) {
    const { data: tipos } = await d.from("reunioes_tipos").select("id, calcom_event_type_id").eq("disponibilidade_id", id)
    for (const t of (tipos ?? []) as { id: string; calcom_event_type_id: number | null }[]) {
      if (!t.calcom_event_type_id) continue
      const r = await publicarTipo(t.id)
      if (!r.ok) erros.push(`Tipo: ${r.erro}`)
    }
  }

  await logSync(d, erros.length ? "erro" : "info", "disponibilidade", erros.length ? `Disponibilidade "${nome}" com falhas: ${erros.join(" | ")}` : `Disponibilidade "${nome}" publicada no Cal.com.`, { atorId: usuario.id })
  revalidatePath(ROTA)
  return erros.length
    ? { ok: false, erro: `Salvo no Workspace, mas parte não foi publicada: ${erros.join(" | ")}` }
    : { ok: true, mensagem: "Salvo e publicado no Cal.com." }
}

// ============================================================
// Tarefa que bloqueia a agenda pública
// ============================================================

export async function definirBloqueioTarefaAction(fd: FormData): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const d = await db()
  const tarefaId = String(fd.get("tarefa_id") ?? "")
  if (!ehUuid(tarefaId)) return { ok: false, erro: "Tarefa inválida." }
  const bloqueia = fd.get("bloqueia") === "1"

  const { data: t } = await d.from("ws_tarefas").select("id, source_gid, prazo_hora").eq("id", tarefaId).maybeSingle()
  if (!t) return { ok: false, erro: "Tarefa não encontrada." }
  if (String(t.source_gid ?? "").startsWith("calcom:")) {
    return { ok: false, erro: "Reuniões do Cal.com já ocupam o horário lá — não precisam de bloqueio." }
  }

  if (!bloqueia) {
    await d.from("ws_tarefa_bloqueios").delete().eq("tarefa_id", tarefaId)
  } else {
    const dur = Number(fd.get("duracao_min") ?? 60)
    if (!Number.isInteger(dur) || dur < 5 || dur > 720) return { ok: false, erro: "Duração entre 5 e 720 minutos." }
    const { error } = await d.from("ws_tarefa_bloqueios").upsert({ tarefa_id: tarefaId, duracao_min: dur, criado_por: usuario.id }, { onConflict: "tarefa_id" })
    if (error) return { ok: false, erro: "Não foi possível salvar (a migration das Reuniões foi aplicada?)." }
  }
  await d.from("ws_atividade").insert({
    tarefa_id: tarefaId,
    ator_id: usuario.id,
    evento: bloqueia ? "bloqueio_agenda_ligado" : "bloqueio_agenda_desligado",
    mudanca: null,
  })
  await d.from("ws_realtime_ping").insert({ tarefa_id: tarefaId, kind: "tarefa" })
  revalidatePath("/dashboard/workspace")
  return {
    ok: true,
    mensagem: bloqueia
      ? t.prazo_hora
        ? "Este horário passa a aparecer como ocupado na agenda pública (pelo feed ICS)."
        : "Marcado — mas só bloqueia quando a tarefa tiver data E horário."
      : "Não bloqueia mais a agenda pública.",
  }
}
