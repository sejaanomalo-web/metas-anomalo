"use server"

// =============================================================================
// Reuniões — ESCRITAS (Server Actions).
// =============================================================================
//
// PERMISSÃO: integração, tipos e disponibilidade mexem em credencial externa e
// na agenda pública da agência — só ADMIN REAL com o Workspace visível na visão
// atual (lib/acesso-admin.ts): a visão simplificada esconde módulos, não tira o
// cargo. Quem tem Workspace só VÊ a aba e pode marcar uma
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
  calBuscarBooking,
  calCancelarBooking,
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
  CONTA_PRINCIPAL,
  nomeEnvApiKey,
  nomeEnvWebhookSecret,
  segredoWebhookDe,
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
import {
  chaveContaValida,
  lerIntegracao,
  lerIntegracaoPorId,
  lerIntegracoes,
  logSync,
  reconciliar,
  repararEncerramentosPendentes,
  reprocessarPendentes,
  rotuloConta,
  type Integracao,
} from "./reunioes-sync"
import { hojeISO } from "./workspace-datas"
import { ehAdminNoModulo } from "./acesso-admin"
import { cancelarReuniaoPeloWorkspace, podeCancelarReuniao } from "./reunioes-cancelar"
import { repoSupabase } from "./reunioes-repo"

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
  if (!ehAdminNoModulo(usuario, "workspace")) return { usuario: null, erro: "Só administradores alteram a integração e a agenda pública." }
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

async function integracaoOuErro(conta: string): Promise<Integracao> {
  const i = await lerIntegracao(await db(), chaveContaValida(conta))
  if (!i) {
    throw new Error(
      conta === CONTA_PRINCIPAL
        ? "Integração não encontrada — a migration 20261021_reunioes_calcom.sql foi aplicada?"
        : `Conta "${conta}" não encontrada — a migration 20261113_reunioes_calcom_multi_contas.sql foi aplicada?`
    )
  }
  return i
}

/** Endereço do webhook/feed de cada conta: a principal mantém a URL de
 *  sempre (o webhook já registrado continua válido); as outras levam ?conta=. */
function comConta(url: string, conta: string): string {
  return conta === CONTA_PRINCIPAL ? url : `${url}?conta=${encodeURIComponent(conta)}`
}

// ============================================================
// Conexão
// ============================================================

/** Verificação REAL: chama a API com a chave configurada e lista o que dá. */
export async function testarConexaoAction(contaBruta: string): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const conta = chaveContaValida(contaBruta)
  if (!calcomConfigurado(conta)) return { ok: false, erro: `${nomeEnvApiKey(conta)} não está configurada no servidor.` }

  const d = await db()
  const integ = await integracaoOuErro(conta)
  const itens: NonNullable<ResultadoReunioes["itens"]> = []
  let me: Awaited<ReturnType<typeof calMe>> | null = null

  try {
    me = await calMe(conta)
    itens.push({ rotulo: "API key válida (GET /v2/me)", ok: true, detalhe: `Conta: ${me.username}` })
    // A mesma API key colada nas duas variáveis faria as duas "contas" serem
    // uma só — e cada reserva chegaria duas vezes.
    const outra = (await lerIntegracoes(d)).find((i) => i.id !== integ.id && i.conta_id !== null && i.conta_id === me!.id)
    itens.push({
      rotulo: "Conta diferente das outras conectadas",
      ok: !outra,
      detalhe: outra ? `É a mesma conta de "${rotuloConta(outra)}" (@${me.username}). Confira ${nomeEnvApiKey(conta)}.` : "OK",
    })
  } catch (e) {
    itens.push({ rotulo: "API key válida (GET /v2/me)", ok: false, detalhe: msg(e) })
  }
  if (me) {
    for (const [rotulo, fn] of [
      ["Ler tipos de evento (GET /v2/event-types)", () => calListarEventTypes(conta, me!.username).then((x) => `${x.length} encontrados`)],
      ["Ler disponibilidades (GET /v2/schedules)", () => calListarSchedules(conta).then((x) => `${x.length} encontradas`)],
      ["Ler webhooks (GET /v2/webhooks)", () => calListarWebhooks(conta).then((x) => `${x.length} registrados`)],
      ["Apps de videochamada (GET /v2/conferencing)", () => calListarConferencias(conta).then((x) => x.map((c) => c.appSlug ?? c.type).filter(Boolean).join(", ") || "nenhum app listado (Cal Video é nativo)")],
    ] as const) {
      try {
        itens.push({ rotulo, ok: true, detalhe: await fn() })
      } catch (e) {
        itens.push({ rotulo, ok: false, detalhe: msg(e) })
      }
    }
  }
  const proprio = Boolean(process.env[nomeEnvWebhookSecret(conta)])
  itens.push({
    rotulo: `Segredo do webhook (${nomeEnvWebhookSecret(conta)}${conta === CONTA_PRINCIPAL ? "" : " ou CALCOM_WEBHOOK_SECRET"})`,
    ok: Boolean(segredoWebhookDe(conta)),
    detalhe: segredoWebhookDe(conta)
      ? proprio || conta === CONTA_PRINCIPAL ? "configurado" : "usando o segredo comum (CALCOM_WEBHOOK_SECRET)"
      : "ausente — webhooks seriam recusados",
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
  await logSync(d, ok ? "info" : "aviso", "testar_conexao", `${rotuloConta(integ)}: ${ok ? "teste de conexão OK." : "teste de conexão com falhas."}`, { atorId: usuario.id })
  revalidatePath(ROTA)
  return { ok, itens, erro: ok ? undefined : "Alguma verificação falhou — veja os itens." }
}

/**
 * Conectar = registrar (ou reativar) o webhook desta URL no Cal.com via
 * POST /v2/webhooks, com o segredo de CALCOM_WEBHOOK_SECRET. Idempotente:
 * se já existe webhook pra esta URL, só atualiza.
 */
export async function conectarAction(contaBruta: string): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const conta = chaveContaValida(contaBruta)
  if (!calcomConfigurado(conta)) return { ok: false, erro: `Configure ${nomeEnvApiKey(conta)} no servidor antes de conectar.` }
  const segredo = segredoWebhookDe(conta)
  if (!segredo) return { ok: false, erro: `Configure ${nomeEnvWebhookSecret(conta)} (ou CALCOM_WEBHOOK_SECRET) no servidor antes de conectar.` }
  const base = urlBaseApp()
  if (!base) return { ok: false, erro: "Não consegui descobrir a URL pública do app. Defina APP_PUBLIC_URL." }
  const url = comConta(`${base}/api/reunioes/calcom/webhook`, conta)
  if (!urlPublicaAlcancavel(url)) {
    return { ok: false, erro: `O Cal.com não alcança ${url}. Conecte a partir do app publicado (https) ou defina APP_PUBLIC_URL.` }
  }

  const d = await db()
  const integ = await integracaoOuErro(conta)
  try {
    const me = await calMe(conta)
    const outra = (await lerIntegracoes(d)).find((i) => i.id !== integ.id && i.conta_id !== null && i.conta_id === me.id)
    if (outra) {
      return { ok: false, erro: `Esta API key é da mesma conta de "${rotuloConta(outra)}" (@${me.username}). Gere a chave dentro da conta ${rotuloConta(integ)} e coloque em ${nomeEnvApiKey(conta)}.` }
    }
    const existentes = await calListarWebhooks(conta)
    const meu = existentes.find((w) => w.subscriberUrl === url)
    const wh = meu
      ? await calAtualizarWebhook(conta, String(meu.id), { active: true, triggers: GATILHOS, secret: segredo })
      : await calCriarWebhook(conta, { subscriberUrl: url, triggers: GATILHOS, secret: segredo, active: true })
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
    await logSync(d, "info", "conectar", `${rotuloConta(integ)}: webhook ${meu ? "reativado" : "registrado"} em ${url} (conta ${me.username}).`, { atorId: usuario.id })
    revalidatePath(ROTA)
    return { ok: true, mensagem: `Conectado à conta ${me.username}. Webhook ${meu ? "reativado" : "registrado"}.` }
  } catch (e) {
    await d.from("reunioes_integracoes").update({ status: "erro", ultimo_erro: msg(e) }).eq("id", integ.id)
    await logSync(d, "erro", "conectar", msg(e), { atorId: usuario.id })
    revalidatePath(ROTA)
    return { ok: false, erro: msg(e) }
  }
}

/** Sem conta = todas (o cron faz o mesmo). */
export async function sincronizarAgoraAction(contaBruta?: string): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const r = await reconciliar(await db(), contaBruta ? chaveContaValida(contaBruta) : undefined)
  revalidatePath(ROTA)
  revalidatePath("/dashboard/workspace")
  return { ok: r.erros === 0, mensagem: r.mensagem, erro: r.erros > 0 ? r.mensagem : undefined }
}

export async function reprocessarAction(): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const d = await db()
  const r = await reprocessarPendentes(d)
  // "Tentar de novo" também conclui reuniões canceladas cuja tarefa ficou
  // com cara de ativa — é o item que aparece em "aguardando sincronização".
  let rep = { reparadas: 0, erros: 0 }
  try {
    rep = await repararEncerramentosPendentes(d)
  } catch (e) {
    rep.erros++
    await logSync(d, "erro", "reprocessar", msg(e), { atorId: usuario.id })
  }
  const falhas = r.falhas + rep.erros
  await logSync(
    d, falhas > 0 ? "aviso" : "info", "reprocessar",
    `Reprocessados ${r.ok}/${r.total} eventos; ${rep.reparadas} encerramentos concluídos.`,
    { atorId: usuario.id }
  )
  revalidatePath("/dashboard/workspace", "layout")
  return {
    ok: falhas === 0,
    mensagem: `${r.ok} de ${r.total} eventos reprocessados; ${rep.reparadas} reunião(ões) cancelada(s) retirada(s) do calendário.`,
    erro: falhas > 0 ? `${falhas} continuam com erro — veja o log.` : undefined,
  }
}

/** Pausar/retomar: para de importar SEM apagar nada (histórico intacto). */
export async function alternarSincronizacaoAction(contaBruta: string, ativa: boolean): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const conta = chaveContaValida(contaBruta)
  const d = await db()
  const integ = await integracaoOuErro(conta)
  let aviso = ""
  if (integ.webhook_id && calcomConfigurado(conta)) {
    try {
      await calAtualizarWebhook(conta, integ.webhook_id, { active: ativa })
    } catch (e) {
      aviso = ` (o webhook no Cal.com não foi ${ativa ? "reativado" : "pausado"}: ${msg(e)}; eventos recebidos serão ignorados mesmo assim)`
    }
  }
  await d.from("reunioes_integracoes").update({ sincronizacao_ativa: ativa }).eq("id", integ.id)
  await logSync(d, "info", "sincronizacao", `${rotuloConta(integ)}: sincronização ${ativa ? "retomada" : "pausada"}.${aviso}`, { atorId: usuario.id })
  revalidatePath(ROTA)
  return { ok: true, mensagem: `Sincronização ${ativa ? "retomada" : "pausada"}.${aviso}` }
}

/**
 * Desconectar: apaga o webhook no Cal.com (best-effort), para a importação e
 * marca desconectado. NÃO cancela reservas, NÃO apaga tarefas nem histórico.
 * A API key em si vive na env — removê-la/revogá-la é passo manual (doc).
 */
export async function desconectarAction(contaBruta: string, confirmacao: string): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  if (confirmacao !== "DESCONECTAR") return { ok: false, erro: "Digite DESCONECTAR para confirmar." }
  const conta = chaveContaValida(contaBruta)
  const d = await db()
  const integ = await integracaoOuErro(conta)
  const avisos: string[] = []
  if (integ.webhook_id && calcomConfigurado(conta)) {
    try {
      await calApagarWebhook(conta, integ.webhook_id)
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
  await logSync(d, avisos.length ? "aviso" : "info", "desconectar", `${rotuloConta(integ)}: integração desconectada. ${avisos.join(" ")}`.trim(), { atorId: usuario.id })
  revalidatePath(ROTA)
  return {
    ok: true,
    mensagem: `Desconectado. Reuniões e tarefas existentes foram preservadas; novas reservas desta conta não serão importadas. Para encerrar de vez, revogue a API key no Cal.com e remova ${nomeEnvApiKey(conta)} do servidor.`,
    erro: avisos.length ? avisos.join(" ") : undefined,
  }
}

/** Cadastra no Cal.com o feed ICS de bloqueios do Workspace. */
export async function conectarFeedIcsAction(contaBruta: string): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const conta = chaveContaValida(contaBruta)
  const token = process.env.REUNIOES_ICS_TOKEN ?? ""
  if (token.length < 24) return { ok: false, erro: "Configure REUNIOES_ICS_TOKEN (mín. 24 caracteres aleatórios) no servidor." }
  if (!calcomConfigurado(conta)) return { ok: false, erro: `Configure ${nomeEnvApiKey(conta)} antes.` }
  const base = urlBaseApp()
  const url = base ? comConta(`${base}/api/reunioes/agenda-bloqueios/${token}.ics`, conta) : null
  if (!url || !urlPublicaAlcancavel(url)) return { ok: false, erro: "O feed precisa de uma URL https pública. Faça isso pelo app publicado ou defina APP_PUBLIC_URL." }
  const d = await db()
  const integ = await integracaoOuErro(conta)
  try {
    const r = await calSalvarFeedIcs(conta, url)
    await d.from("reunioes_integracoes").update({ ics_credencial_id: r.id }).eq("id", integ.id)
    await logSync(d, "info", "feed_ics", `${rotuloConta(integ)}: feed ICS de bloqueios cadastrado no Cal.com.`, { atorId: usuario.id })
    revalidatePath(ROTA)
    return { ok: true, mensagem: "Feed cadastrado. Confira em app.cal.com → Settings → Calendars (logado nesta conta) se ele aparece marcado para checar conflitos." }
  } catch (e) {
    await logSync(d, "erro", "feed_ics", `${rotuloConta(integ)}: ${msg(e)}`, { atorId: usuario.id })
    return { ok: false, erro: msg(e) }
  }
}

/**
 * Liga/desliga o bloqueio cruzado: o feed desta conta passa (ou deixa) de
 * marcar como ocupado o horário das reuniões das outras contas. Sem efeito
 * enquanto o feed não estiver cadastrado nesta conta.
 */
export async function alternarBloqueioOutrasContasAction(contaBruta: string, ativo: boolean): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirAdmin()
  if (!usuario) return { ok: false, erro }
  const conta = chaveContaValida(contaBruta)
  const d = await db()
  const integ = await integracaoOuErro(conta)
  if (!integ.multi) return { ok: false, erro: "Aplique a migration 20261113_reunioes_calcom_multi_contas.sql antes." }
  const { error } = await d.from("reunioes_integracoes").update({ bloquear_outras_contas: ativo }).eq("id", integ.id)
  if (error) return { ok: false, erro: "Não foi possível salvar." }
  await logSync(d, "info", "feed_ics", `${rotuloConta(integ)}: reuniões das outras contas ${ativo ? "passam a bloquear" : "deixam de bloquear"} esta agenda.`, { atorId: usuario.id })
  revalidatePath(ROTA)
  return {
    ok: true,
    mensagem: ativo
      ? "Ligado. Quando o Cal.com reler o feed, os horários das reuniões das outras contas aparecem ocupados aqui."
      : "Desligado. Esta conta volta a ignorar as reuniões das outras.",
  }
}

// ============================================================
// Tipos de reunião
// ============================================================

interface TipoRow {
  id: string
  /** undefined = migration de várias contas não aplicada (conta principal). */
  integracao_id?: string | null
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

/** Conta do Cal.com do tipo (sem coluna/valor = principal). */
async function contaDoTipo(tipo: Pick<TipoRow, "integracao_id">): Promise<Integracao | null> {
  return lerIntegracaoPorId(await db(), tipo.integracao_id ?? null)
}

/** Empurra as regras do tipo para o event type vinculado (PATCH). */
async function publicarTipo(tipoId: string): Promise<{ ok: boolean; erro?: string }> {
  const d = await db()
  const { data: t } = await d.from("reunioes_tipos").select("*").eq("id", tipoId).maybeSingle()
  const tipo = t as TipoRow | null
  if (!tipo) return { ok: false, erro: "Tipo não encontrado." }
  if (!tipo.calcom_event_type_id) return { ok: false, erro: "Tipo sem evento do Cal.com associado." }
  const integ = await contaDoTipo(tipo)
  if (!integ) return { ok: false, erro: "Conta do Cal.com do tipo não encontrada." }
  const conta = integ.chave
  if (!calcomConfigurado(conta)) return { ok: false, erro: `Cal.com não configurado (${nomeEnvApiKey(conta)}).` }

  // O schedule é de UM usuário do Cal.com: só vale se a disponibilidade for
  // da mesma conta do evento. De outra conta, o Cal.com recusaria.
  let scheduleId: number | null = null
  if (tipo.disponibilidade_id) {
    const { data: disp } = await d.from("reunioes_disponibilidades").select("*").eq("id", tipo.disponibilidade_id).maybeSingle()
    const dispConta = (disp as { integracao_id?: string | null } | null)?.integracao_id
    if (disp && integ.multi && dispConta && dispConta !== integ.id) {
      const erro = "A disponibilidade escolhida é de outra conta do Cal.com. Escolha uma disponibilidade da mesma conta do evento."
      await d.from("reunioes_tipos").update({ ultimo_erro: erro }).eq("id", tipoId)
      return { ok: false, erro }
    }
    scheduleId = (disp?.calcom_schedule_id as number | null) ?? null
  }
  try {
    const et = await calAtualizarEventType(conta, tipo.calcom_event_type_id, {
      ...montarCorpoEventType({ ...tipo, scheduleId }),
      hidden: !tipo.ativo,
    })
    await d.from("reunioes_tipos").update({
      calcom_slug: et.slug,
      link_publico: linkDe(et, integ.conta_username ?? null),
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

  // Trocar a conta do tipo desfaz a associação com o evento: o event type
  // antigo é da outra conta. O link público some até associar o novo.
  const { data: antes } = await d.from("reunioes_tipos").select("*").eq("id", id).maybeSingle()
  if (!antes) return { ok: false, erro: "Tipo não encontrado." }
  const contas = await lerIntegracoes(d)
  const multi = contas.some((c) => c.multi)
  const contaNova = uuidOuNull("integracao_id")
  if (multi && contaNova && !contas.some((c) => c.id === contaNova)) return { ok: false, erro: "Conta do Cal.com inválida." }
  const contaAntes = (antes as TipoRow).integracao_id ?? null
  const trocouConta = multi && contaNova !== null && contaNova !== contaAntes
  const dispId = uuidOuNull("disponibilidade_id")
  if (multi && dispId) {
    const { data: dsp } = await d.from("reunioes_disponibilidades").select("integracao_id").eq("id", dispId).maybeSingle()
    const contaFinal = contaNova ?? contaAntes
    if (dsp && dsp.integracao_id && contaFinal && dsp.integracao_id !== contaFinal) {
      return { ok: false, erro: "A disponibilidade escolhida é de outra conta do Cal.com. Escolha uma da mesma conta do tipo." }
    }
  }

  const { error } = await d.from("reunioes_tipos").update({
    ...(trocouConta
      ? { integracao_id: contaNova, calcom_event_type_id: null, calcom_slug: null, link_publico: null, ultimo_erro: null }
      : {}),
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
    disponibilidade_id: dispId,
    contexto_id: uuidOuNull("contexto_id"),
    ativo: fd.get("ativo") === "1",
  }).eq("id", id)
  if (error) return { ok: false, erro: "Não foi possível salvar o tipo." }

  const { data: t } = await d.from("reunioes_tipos").select("*").eq("id", id).maybeSingle()
  const contaDoSalvo = t ? await contaDoTipo(t as TipoRow) : null
  let mensagem = "Salvo no Workspace."
  if (trocouConta) {
    mensagem = "Conta trocada. Associe (ou crie) o evento desta conta no Cal.com para o link público voltar."
  } else if (t?.calcom_event_type_id && contaDoSalvo && calcomConfigurado(contaDoSalvo.chave)) {
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
  // Conta escolhida no formulário; a disponibilidade padrão é a 1ª dela.
  const contas = await lerIntegracoes(d)
  const multi = contas.some((c) => c.multi)
  const contaId = String(fd.get("integracao_id") ?? "")
  const conta = multi ? contas.find((c) => c.id === contaId) ?? contas.find((c) => c.chave === CONTA_PRINCIPAL) ?? null : null
  let qDisp = d.from("reunioes_disponibilidades").select("id").order("created_at").limit(1)
  if (conta) qDisp = qDisp.eq("integracao_id", conta.id)
  const { data: disp } = await qDisp.maybeSingle()
  const { error } = await d.from("reunioes_tipos").insert({
    ...(conta ? { integracao_id: conta.id } : {}),
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
    const { data: tRow } = await d.from("reunioes_tipos").select("*").eq("id", tipoId).maybeSingle()
    if (!tRow) return { ok: false, erro: "Tipo não encontrado." }
    const integ = await contaDoTipo(tRow as TipoRow)
    if (!integ) return { ok: false, erro: "Conta do Cal.com do tipo não encontrada." }
    const ets = await calListarEventTypes(integ.chave, integ.conta_username ?? undefined)
    const et = ets.find((e) => e.id === eventTypeId)
    // Só aceita evento que a API realmente devolve pra conta DO TIPO.
    if (!et) return { ok: false, erro: `Esse evento não pertence à conta ${rotuloConta(integ)}.` }
    const { error } = await d.from("reunioes_tipos").update({
      calcom_event_type_id: et.id,
      calcom_slug: et.slug,
      link_publico: linkDe(et, integ.conta_username ?? null),
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
  const d = await db()
  const { data: t } = await d.from("reunioes_tipos").select("*").eq("id", tipoId).maybeSingle()
  const tipo = t as TipoRow | null
  if (!tipo) return { ok: false, erro: "Tipo não encontrado." }
  if (tipo.calcom_event_type_id) return { ok: false, erro: "Este tipo já tem evento no Cal.com." }
  const integ = await contaDoTipo(tipo)
  if (!integ || !calcomConfigurado(integ.chave)) return { ok: false, erro: `Cal.com não configurado${integ ? ` (${nomeEnvApiKey(integ.chave)})` : ""}.` }

  try {
    const corpo = montarCorpoEventType({ ...tipo, scheduleId: null })
    const et = await calCriarEventType(integ.chave, { ...corpo, slug: slugDe(tipo.nome) })
    await d.from("reunioes_tipos").update({
      calcom_event_type_id: et.id,
      calcom_slug: et.slug,
      link_publico: linkDe(et, integ.conta_username ?? null),
    }).eq("id", tipoId)
    const p = await publicarTipo(tipoId)
    await logSync(d, "info", "tipo", `Evento "${et.title}" criado no Cal.com, conta ${rotuloConta(integ)} (${et.id}).`, { atorId: usuario.id })
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

  const { data: atualRow } = await d.from("reunioes_disponibilidades").select("*").eq("id", id).maybeSingle()
  if (!atualRow) return { ok: false, erro: "Disponibilidade não encontrada." }
  // Schedule e Out of Office são da conta DONA desta disponibilidade.
  const integ = await lerIntegracaoPorId(d, (atualRow as { integracao_id?: string | null }).integracao_id ?? null)
  const conta = integ?.chave ?? CONTA_PRINCIPAL
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

  if (!calcomConfigurado(conta)) {
    await salvar({ bloqueios: bl.bloqueios, publicacao_erro: `Cal.com não configurado (${nomeEnvApiKey(conta)}) — salvo só no Workspace, NÃO publicado.` })
    revalidatePath(ROTA)
    return { ok: false, erro: `Salvo no Workspace, mas NÃO publicado: ${nomeEnvApiKey(conta)} não está configurada.` }
  }

  // ---------- publicar ----------
  const corpo = montarCorpoSchedule({ nome, fuso, janelas: j.janelas, periodos: p.periodos, excecoes: ex.excecoes, hoje: hojeISO() })
  const erros: string[] = []
  let scheduleId = (atualRow.calcom_schedule_id as number | null) ?? null
  try {
    if (scheduleId) {
      await calAtualizarSchedule(conta, scheduleId, corpo)
    } else {
      const s = await calCriarSchedule(conta, { ...corpo, isDefault: false })
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
      const ooo = await calCriarOoo(conta, {
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
        await calApagarOoo(conta, a.calcom_ooo_id)
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
// Cancelar reunião pelo Workspace
// ============================================================

/** O Cal.com mostra o motivo ao participante. Sem motivo digitado, vai um
 *  texto neutro (alguns event types exigem motivo quando quem cancela é o
 *  anfitrião). */
const MOTIVO_PADRAO = "Reunião cancelada pela equipe ANÔMALO."

/**
 * "Cancelar reunião" (detalhe da tarefa e Próximas reuniões).
 *
 * Recebe o id INTERNO do agendamento — o booking UID sai do banco, nunca do
 * browser. Pode cancelar: o responsável pela reunião ou um admin do
 * Workspace (lib/acesso-admin.ts). O resto do fluxo, com confirmação real no
 * Cal.com e tratamento de falha parcial, está em lib/reunioes-cancelar.ts.
 */
export async function cancelarReuniaoAction(fd: FormData): Promise<ResultadoReunioes> {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) return { ok: false, erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Banco indisponível." }

  const id = String(fd.get("agendamento_id") ?? "")
  if (!ehUuid(id)) return { ok: false, erro: "Reunião inválida." }

  const { data: ag, error } = await db
    .from("reunioes_agendamentos")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) return { ok: false, erro: "Não foi possível ler a reunião. Tente de novo." }
  if (!ag || ag.provedor !== "calcom") return { ok: false, erro: "Reunião não encontrada." }

  if (!podeCancelarReuniao(usuario, (ag.responsavel_id as string | null) ?? null)) return { ok: false, erro: "Só o responsável pela reunião ou um administrador pode cancelá-la." }

  if (ag.status !== "solicitada" && ag.status !== "confirmada") {
    return { ok: true, mensagem: "Esta reunião já não está ativa — nada a cancelar." }
  }
  // A reserva é cancelada com a API key da conta onde ela foi feita.
  const integ = await lerIntegracaoPorId(db, (ag as { integracao_id?: string | null }).integracao_id ?? null)
  if (!integ) return { ok: false, erro: "Conta do Cal.com desta reunião não encontrada. Nada foi cancelado." }
  const conta = integ.chave
  if (!calcomConfigurado(conta)) return { ok: false, erro: `O Cal.com da conta ${rotuloConta(integ)} não está configurado no servidor (${nomeEnvApiKey(conta)}). Nada foi cancelado.` }
  if (integ.status === "desconectado") {
    return { ok: false, erro: `A conta ${rotuloConta(integ)} do Cal.com está desconectada. Nada foi cancelado.` }
  }

  const motivo = limparTexto(fd.get("motivo"), 300) ?? MOTIVO_PADRAO
  const r = await cancelarReuniaoPeloWorkspace(
    {
      repo: repoSupabase(db, integ.multi ? integ.id : null),
      cal: {
        cancelar: (uid, motivo) => calCancelarBooking(conta, uid, motivo),
        buscar: (uid) => calBuscarBooking(conta, uid),
      },
      log: (nivel, mensagem, detalhes) => logSync(db, nivel, "cancelamento", mensagem, { detalhes, atorId: usuario.id }),
    },
    ag.booking_uid as string,
    { atorId: usuario.id, motivo }
  )

  revalidatePath("/dashboard/workspace", "layout")
  const ok = r.estado === "cancelada" || r.estado === "ja_cancelada" || r.estado === "removida_no_cal"
  return ok ? { ok: true, mensagem: r.mensagem } : { ok: false, erro: r.mensagem }
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
