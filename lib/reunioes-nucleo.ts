// =============================================================================
// Reuniões (Cal.com) — núcleo PURO. Sem I/O, sem Supabase, sem fetch.
// =============================================================================
//
// Tudo que decide "o que fazer com um agendamento" mora aqui, pra ser testado
// sem banco (lib/reunioes-nucleo.test.ts): normalizar o webhook, converter horário pra Brasília, montar o título, e a máquina de
// estados que protege contra evento repetido e fora de ordem.
//
// lib/reunioes-processar.ts só EXECUTA o plano que sai daqui. Sem import de
// Node: os validadores de disponibilidade também rodam no browser (editor da
// aba Reuniões). A assinatura HMAC mora em reunioes-assinatura.ts.

export const FUSO_BR = "America/Sao_Paulo"

// ============================================================
// Tipos
// ============================================================

export type StatusReuniao =
  | "solicitada"
  | "confirmada"
  | "reagendada"
  | "cancelada"
  | "rejeitada"
  | "realizada"

export const ROTULO_STATUS: Record<StatusReuniao, string> = {
  solicitada: "Aguardando confirmação",
  confirmada: "Confirmada",
  reagendada: "Reagendada",
  cancelada: "Cancelada",
  rejeitada: "Recusada",
  realizada: "Realizada",
}

/** Estados dos quais um booking UID nunca sai. No Cal.com um UID cancelado
 *  não "descancela" — reagendar gera UID novo. Por isso um webhook atrasado
 *  de criação nunca ressuscita uma reunião cancelada. */
export const STATUS_TERMINAIS: readonly StatusReuniao[] = ["cancelada", "rejeitada", "reagendada"]

export function ehTerminal(s: StatusReuniao): boolean {
  return STATUS_TERMINAIS.includes(s)
}

const RANK: Record<StatusReuniao, number> = {
  solicitada: 1,
  confirmada: 2,
  realizada: 3,
  cancelada: 4,
  rejeitada: 4,
  reagendada: 4,
}

export type Gatilho =
  | "BOOKING_CREATED"
  | "BOOKING_REQUESTED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_CANCELLED"
  | "BOOKING_REJECTED"
  | "BOOKING_LOCATION_UPDATED"
  | "MEETING_ENDED"
  | "RECONCILIACAO"
  /** Cancelamento pedido pelo botão do Workspace e confirmado pela API. */
  | "WORKSPACE"

export const GATILHOS_ASSINADOS: readonly Exclude<Gatilho, "RECONCILIACAO" | "WORKSPACE">[] = [
  "BOOKING_CREATED",
  "BOOKING_REQUESTED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_REJECTED",
  "BOOKING_LOCATION_UPDATED",
  "MEETING_ENDED",
]

/** O que importa de um agendamento, já validado e sanitizado — venha do
 *  webhook ou da API de bookings (reconciliação). */
export interface EventoReuniao {
  gatilho: Gatilho
  uid: string
  bookingId: number | null
  eventTypeId: number | null
  nomeTipoExterno: string | null
  participante: {
    nome: string
    email: string | null
    telefone: string | null
    fuso: string | null
  }
  /** ISO UTC. */
  inicio: string | null
  fim: string | null
  /** Estado que este evento quer aplicar. null = não mexe no status
   *  (ex.: troca de local). */
  statusAlvo: StatusReuniao | null
  linkReuniao: string | null
  localRotulo: string | null
  reagendadoDeUid: string | null
  reagendadoParaUid: string | null
  motivoCancelamento: string | null
  organizadorEmail: string | null
  /** Quando o evento aconteceu no provedor (createdAt do webhook /
   *  updatedAt do booking). Usado pra ordenar eventos. */
  ocorridoEm: string
}

export type ResultadoNormalizacao =
  | { tipo: "evento"; evento: EventoReuniao }
  | { tipo: "ignorar"; motivo: string }
  | { tipo: "invalido"; motivo: string }

// ============================================================
// Sanitização
// ============================================================

/** Texto vindo de terceiro: sem controle, sem <>, espaços colapsados, limitado.
 *  A descrição da tarefa é markdown-lite renderizado como nós React (nunca
 *  HTML), mas limpar aqui também protege título, notificação e feed ICS. */
export function limparTexto(v: unknown, max = 120): string | null {
  if (typeof v !== "string") return null
  const s = v
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim()
  return s === "" ? null : s
}

export function limparEmail(v: unknown): string | null {
  const s = limparTexto(v, 254)
  if (!s) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null
}

export function limparTelefone(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.replace(/[^\d+()\-\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 30)
  return /\d{6,}/.test(s.replace(/\D/g, "")) ? s : null
}

/** Só https, sem credencial embutida. Qualquer outra coisa vira null — o
 *  botão "Entrar na reunião" nunca abre javascript:, data: ou http:. */
export function urlSegura(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 2000) return null
  let u: URL
  try {
    u = new URL(v.trim())
  } catch {
    return null
  }
  if (u.protocol !== "https:") return null
  if (u.username || u.password) return null
  return u.toString()
}

function inteiro(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null
}

function isoValido(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

function uidValido(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(v) ? v : null
}

// ============================================================
// Horário de Brasília
// ============================================================

const fmtData = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_BR,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO_BR,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** Instante UTC → 'YYYY-MM-DD' no dia de Brasília (é o prazo_em da tarefa). */
export function dataBR(iso: string): string {
  return fmtData.format(new Date(iso))
}

/** Instante UTC → 'HH:mm' 24h em Brasília. */
export function horaBR(iso: string): string {
  return fmtHora.format(new Date(iso))
}

/** "qua., 04/11, 09:30" — para listas na tela. */
export function formatarDataHora(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: FUSO_BR,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
}

export function dataHoraBRLegivel(iso: string): string {
  const [a, m, d] = dataBR(iso).split("-")
  return `${d}/${m}/${a} às ${horaBR(iso)}`
}

/** Título EXATO pedido: "HH:mm - Reunião com Nome". Estados que não são
 *  "confirmada" ganham marca visível, pra uma solicitação nunca parecer
 *  reunião confirmada no calendário. */
export function tituloReuniao(inicioIso: string, nome: string, status: StatusReuniao = "confirmada"): string {
  const base = `${horaBR(inicioIso)} - Reunião com ${nome}`
  switch (status) {
    case "solicitada": return `${base} (a confirmar)`
    case "cancelada": return `[Cancelada] ${base}`
    case "rejeitada": return `[Recusada] ${base}`
    default: return base
  }
}

// ============================================================
// Normalização do webhook do Cal.com (versão 2021-10-20 e 2026-07-27)
// ============================================================

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** responses.name pode ser string ou { firstName, lastName }; e cada
 *  resposta pode vir como { value } ou valor direto. */
function valorResposta(responses: Record<string, unknown> | null, chave: string): unknown {
  if (!responses) return undefined
  const r = responses[chave]
  const o = obj(r)
  const v = o && "value" in o ? o.value : r
  const nome = obj(v)
  if (nome && ("firstName" in nome || "lastName" in nome)) {
    return [nome.firstName, nome.lastName].filter((x) => typeof x === "string").join(" ")
  }
  return v
}

function rotuloLocal(location: unknown, link: string | null): string | null {
  const loc = typeof location === "string" ? location : ""
  const host = link ? new URL(link).hostname : ""
  if (host === "meet.google.com" || /google:meet|google-meet/i.test(loc)) return "Google Meet"
  const calVideo =
    /daily|cal-video|calvideo/i.test(loc) ||
    host.endsWith("daily.co") ||
    (host.endsWith("cal.com") && link !== null && new URL(link).pathname.startsWith("/video/"))
  if (calVideo) return "Cal Video"
  if (/zoom/i.test(loc) || host.endsWith("zoom.us")) return "Zoom"
  if (/teams/i.test(loc) || host.endsWith("teams.microsoft.com")) return "Microsoft Teams"
  if (loc && !loc.startsWith("integrations:") && !link) return limparTexto(loc, 120)
  return link ? "Online" : null
}

function statusDoProvedor(v: unknown): StatusReuniao | null {
  const s = typeof v === "string" ? v.toUpperCase() : ""
  if (s === "ACCEPTED") return "confirmada"
  if (s === "PENDING" || s === "AWAITING_HOST") return "solicitada"
  if (s === "CANCELLED") return "cancelada"
  if (s === "REJECTED") return "rejeitada"
  return null
}

/**
 * Corpo do webhook (já parseado) → EventoReuniao. Não confia em nada: cada
 * campo é validado e o que for estranho vira null ou "invalido".
 */
export function normalizarWebhookCal(corpo: unknown): ResultadoNormalizacao {
  const raiz = obj(corpo)
  if (!raiz) return { tipo: "invalido", motivo: "corpo_nao_objeto" }
  const gatilho = typeof raiz.triggerEvent === "string" ? raiz.triggerEvent : ""
  if (gatilho === "PING") return { tipo: "ignorar", motivo: "ping" }
  if (!GATILHOS_ASSINADOS.includes(gatilho as (typeof GATILHOS_ASSINADOS)[number])) {
    return { tipo: "ignorar", motivo: `gatilho_nao_tratado:${gatilho.slice(0, 60) || "vazio"}` }
  }

  // MEETING_* vêm "achatados" (sem wrapper payload) — doc oficial.
  const p = obj(raiz.payload) ?? (gatilho.startsWith("MEETING_") ? raiz : null)
  if (!p) return { tipo: "invalido", motivo: "payload_ausente" }

  const uid = uidValido(p.uid)
  if (!uid) return { tipo: "invalido", motivo: "uid_ausente" }

  const responses = obj(p.responses)
  const attendees = Array.isArray(p.attendees) ? p.attendees.map(obj).filter(Boolean) : []
  const att = (attendees[0] ?? null) as Record<string, unknown> | null
  const organizer = obj(p.organizer)
  const metadata = obj(p.metadata)
  const videoCallData = obj(p.videoCallData)

  const inicio = isoValido(p.startTime)
  const fim = isoValido(p.endTime)
  const nome =
    limparTexto(valorResposta(responses, "name")) ??
    limparTexto(att?.name) ??
    "Participante"

  const link =
    urlSegura(metadata?.videoCallUrl) ??
    urlSegura(videoCallData?.url) ??
    urlSegura(p.location)

  const g = gatilho as Exclude<Gatilho, "RECONCILIACAO" | "WORKSPACE">
  let statusAlvo: StatusReuniao | null
  switch (g) {
    case "BOOKING_CREATED":
    case "BOOKING_RESCHEDULED":
      statusAlvo = statusDoProvedor(p.status) === "solicitada" ? "solicitada" : "confirmada"
      break
    case "BOOKING_REQUESTED": statusAlvo = "solicitada"; break
    case "BOOKING_CANCELLED": statusAlvo = "cancelada"; break
    case "BOOKING_REJECTED": statusAlvo = "rejeitada"; break
    case "MEETING_ENDED": statusAlvo = "realizada"; break
    case "BOOKING_LOCATION_UPDATED": statusAlvo = null; break
  }

  if ((statusAlvo === "confirmada" || statusAlvo === "solicitada") && (!inicio || !fim)) {
    return { tipo: "invalido", motivo: "horario_ausente" }
  }

  return {
    tipo: "evento",
    evento: {
      gatilho: g,
      uid,
      bookingId: inteiro(p.bookingId) ?? inteiro(p.id),
      eventTypeId: inteiro(p.eventTypeId),
      nomeTipoExterno: limparTexto(p.eventTitle) ?? limparTexto(p.type),
      participante: {
        nome,
        email: limparEmail(valorResposta(responses, "email")) ?? limparEmail(att?.email),
        telefone:
          limparTelefone(valorResposta(responses, "attendeePhoneNumber")) ??
          limparTelefone(att?.phoneNumber),
        fuso: limparTexto(att?.timeZone, 64),
      },
      inicio,
      fim,
      statusAlvo,
      linkReuniao: link,
      localRotulo: rotuloLocal(p.location, link),
      reagendadoDeUid: g === "BOOKING_RESCHEDULED" ? uidValido(p.rescheduleUid) : null,
      reagendadoParaUid: null,
      motivoCancelamento: limparTexto(p.cancellationReason, 300),
      organizadorEmail: limparEmail(organizer?.email),
      ocorridoEm: isoValido(raiz.createdAt) ?? new Date().toISOString(),
    },
  }
}

/**
 * Item de GET /v2/bookings (BookingOutput) → EventoReuniao, para a
 * reconciliação. Mesmas regras de validação do webhook.
 */
export function normalizarBookingCal(b: unknown): EventoReuniao | null {
  const o = obj(b)
  if (!o) return null
  const uid = uidValido(o.uid)
  const inicio = isoValido(o.start)
  const fim = isoValido(o.end)
  if (!uid || !inicio || !fim) return null

  const attendees = Array.isArray(o.attendees) ? o.attendees.map(obj).filter(Boolean) : []
  const att = (attendees[0] ?? null) as Record<string, unknown> | null
  const hosts = Array.isArray(o.hosts) ? o.hosts.map(obj).filter(Boolean) : []
  const host = (hosts[0] ?? null) as Record<string, unknown> | null
  const respostas = obj(o.bookingFieldsResponses)
  const eventType = obj(o.eventType)

  const paraUid = uidValido(o.rescheduledToUid)
  let statusAlvo = statusDoProvedor(o.status)
  // Booking cancelado POR reagendamento: no nosso modelo é 'reagendada'.
  if (statusAlvo === "cancelada" && paraUid) statusAlvo = "reagendada"
  if (!statusAlvo) return null

  const link = urlSegura(o.meetingUrl) ?? urlSegura(o.location)

  return {
    gatilho: "RECONCILIACAO",
    uid,
    bookingId: inteiro(o.id),
    eventTypeId: inteiro(eventType?.id) ?? inteiro(o.eventTypeId),
    nomeTipoExterno: limparTexto(o.title),
    participante: {
      nome: limparTexto(att?.name) ?? limparTexto(valorResposta(respostas, "name")) ?? "Participante",
      email: limparEmail(att?.email) ?? limparEmail(valorResposta(respostas, "email")),
      telefone: limparTelefone(att?.phoneNumber) ?? limparTelefone(valorResposta(respostas, "attendeePhoneNumber")),
      fuso: limparTexto(att?.timeZone, 64),
    },
    inicio,
    fim,
    statusAlvo,
    linkReuniao: link,
    localRotulo: rotuloLocal(o.location, link),
    reagendadoDeUid: uidValido(o.rescheduledFromUid),
    reagendadoParaUid: paraUid,
    motivoCancelamento: limparTexto(o.cancellationReason, 300),
    organizadorEmail: limparEmail(host?.email),
    ocorridoEm: isoValido(o.updatedAt) ?? new Date(0).toISOString(),
  }
}

// ============================================================
// Máquina de estados
// ============================================================

/** O que já está gravado para um booking UID. */
export interface AgendamentoAtual {
  id: string
  booking_uid: string
  status: StatusReuniao
  tarefa_id: string | null
  ultimo_evento_em: string | null
  inicio: string | null
  link_reuniao: string | null
}

export type AcaoTarefa =
  /** Criar a tarefa no Workspace. */
  | { acao: "criar"; status: StatusReuniao }
  /** Atualizar título/data/descrição da tarefa existente. */
  | { acao: "atualizar"; tarefaId: string; status: StatusReuniao; desarquivar: boolean }
  /** Tirar do calendário (cancelada/recusada) preservando histórico. */
  | { acao: "encerrar"; tarefaId: string; status: StatusReuniao }
  | { acao: "nenhuma" }

export interface Plano {
  /** Linha do UID do evento: inserir ou atualizar com este status. */
  principal: { status: StatusReuniao; tarefaIdHerdada: string | null } | null
  /** UID anterior (reagendamento): marcar 'reagendada' / criar lápide. */
  anterior: { uid: string; existente: AgendamentoAtual | null } | null
  tarefa: AcaoTarefa
  /** Descrição curta, vai pro log e pra tela de histórico. */
  resultado: string
  /** true = nada mudou (evento repetido ou atrasado). */
  ignorado: boolean
}

function maisAntigo(a: string, b: string | null): boolean {
  if (!b) return false
  return Date.parse(a) < Date.parse(b)
}

/**
 * Decide o que um evento faz, dado o que já existe. PURA — o executor
 * (reunioes-sync.ts) aplica o plano.
 *
 * Garantias:
 *  • estado terminal é absorvente: criação atrasada não ressuscita cancelada;
 *  • evento mais antigo que o último aplicado não rebaixa o status;
 *  • reagendamento reaproveita a MESMA tarefa (move de dia, troca o título);
 *  • reagendamento que chega antes da criação do original deixa uma "lápide"
 *    no UID antigo — a criação atrasada dele cai na regra do terminal.
 */
export function decidir(
  evento: EventoReuniao,
  atual: AgendamentoAtual | null,
  anterior: AgendamentoAtual | null
): Plano {
  const alvo = evento.statusAlvo

  // ---------- já conhecemos este UID ----------
  if (atual) {
    if (ehTerminal(atual.status)) {
      return {
        principal: null, anterior: null, tarefa: { acao: "nenhuma" }, ignorado: true,
        resultado: `ignorado: reunião já ${atual.status} (evento ${evento.gatilho} não reabre)`,
      }
    }

    // Sem mudança de status (ex.: local atualizado).
    if (alvo === null) {
      if (maisAntigo(evento.ocorridoEm, atual.ultimo_evento_em)) {
        return { principal: null, anterior: null, tarefa: { acao: "nenhuma" }, ignorado: true, resultado: "ignorado: evento de local mais antigo" }
      }
      return {
        principal: { status: atual.status, tarefaIdHerdada: null }, anterior: null,
        tarefa: atual.tarefa_id ? { acao: "atualizar", tarefaId: atual.tarefa_id, status: atual.status, desarquivar: false } : { acao: "criar", status: atual.status },
        ignorado: false, resultado: "local/link atualizado",
      }
    }

    if (ehTerminal(alvo)) {
      // Cancelamento sempre vence, venha quando vier. 'reagendada' (só vem da
      // reconciliação) NÃO encerra a tarefa: ela pertence ao UID novo, que a
      // move quando for processado.
      return {
        principal: { status: alvo, tarefaIdHerdada: null }, anterior: null,
        tarefa: atual.tarefa_id && alvo !== "reagendada"
          ? { acao: "encerrar", tarefaId: atual.tarefa_id, status: alvo }
          : { acao: "nenhuma" },
        ignorado: false, resultado: `reunião ${alvo}`,
      }
    }

    const rebaixa = RANK[alvo] < RANK[atual.status]
    const atrasado = maisAntigo(evento.ocorridoEm, atual.ultimo_evento_em)
    if (rebaixa || (atrasado && RANK[alvo] <= RANK[atual.status])) {
      return {
        principal: null, anterior: null, tarefa: { acao: "nenhuma" }, ignorado: true,
        resultado: `ignorado: evento ${evento.gatilho} ${rebaixa ? "rebaixaria" : "mais antigo que"} o estado atual (${atual.status})`,
      }
    }

    const mudouAlgo =
      alvo !== atual.status ||
      evento.inicio !== atual.inicio ||
      (evento.linkReuniao !== null && evento.linkReuniao !== atual.link_reuniao)
    // Linha gravada mas tarefa não criada (execução anterior caiu no meio):
    // o reenvio do mesmo evento é justamente o que conserta.
    if (!mudouAlgo && !atual.tarefa_id) {
      return {
        principal: { status: alvo, tarefaIdHerdada: null }, anterior: null,
        tarefa: { acao: "criar", status: alvo }, ignorado: false,
        resultado: "tarefa que faltava foi criada",
      }
    }
    if (!mudouAlgo) {
      return { principal: null, anterior: null, tarefa: { acao: "nenhuma" }, ignorado: true, resultado: "ignorado: nada mudou (evento repetido)" }
    }

    return {
      principal: { status: alvo, tarefaIdHerdada: null }, anterior: null,
      tarefa: atual.tarefa_id
        ? { acao: "atualizar", tarefaId: atual.tarefa_id, status: alvo, desarquivar: false }
        : { acao: "criar", status: alvo },
      ignorado: false,
      resultado: alvo !== atual.status ? `${atual.status} → ${alvo}` : "dados atualizados",
    }
  }

  // ---------- UID novo ----------
  if (alvo === null) {
    return { principal: null, anterior: null, tarefa: { acao: "nenhuma" }, ignorado: true, resultado: "ignorado: atualização de local para reunião desconhecida" }
  }

  // Cancelamento/recusa de algo que nunca vimos: grava lápide sem tarefa, pra
  // que a criação atrasada seja barrada.
  if (ehTerminal(alvo)) {
    return {
      principal: { status: alvo, tarefaIdHerdada: null }, anterior: null,
      tarefa: { acao: "nenhuma" }, ignorado: false,
      resultado: `lápide gravada: ${alvo} antes da criação`,
    }
  }

  // Reagendamento: o UID antigo leva a tarefa junto.
  if (evento.reagendadoDeUid) {
    const tarefaAnterior = anterior?.tarefa_id ?? null
    return {
      principal: { status: alvo, tarefaIdHerdada: tarefaAnterior },
      anterior: { uid: evento.reagendadoDeUid, existente: anterior },
      tarefa: tarefaAnterior
        ? { acao: "atualizar", tarefaId: tarefaAnterior, status: alvo, desarquivar: true }
        : { acao: "criar", status: alvo },
      ignorado: false,
      resultado: tarefaAnterior ? "reagendada: tarefa movida" : "reagendada: original desconhecida, tarefa criada",
    }
  }

  return {
    principal: { status: alvo, tarefaIdHerdada: null }, anterior: null,
    tarefa: { acao: "criar", status: alvo }, ignorado: false,
    resultado: `nova reunião (${alvo})`,
  }
}

// ============================================================
// Descrição da tarefa
// ============================================================

export interface DadosDescricao {
  tipoNome: string | null
  campanha: string | null
  evento: EventoReuniao
  status: StatusReuniao
}

/** Texto markdown-lite (o mesmo formato da descrição de qualquer tarefa —
 *  nunca HTML). Autolink do parser torna o link clicável. */
export function montarDescricao({ tipoNome, campanha, evento, status }: DadosDescricao): string {
  const l: string[] = []
  l.push(`**Tipo:** ${tipoNome ?? evento.nomeTipoExterno ?? "Não associado"}`)
  l.push(`**Participante:** ${evento.participante.nome}`)
  if (evento.participante.email) l.push(`**E-mail:** ${evento.participante.email}`)
  if (evento.participante.telefone) l.push(`**Telefone:** ${evento.participante.telefone}`)
  if (evento.inicio) l.push(`**Início:** ${dataHoraBRLegivel(evento.inicio)} (Brasília)`)
  if (evento.fim) l.push(`**Fim:** ${dataHoraBRLegivel(evento.fim)} (Brasília)`)
  l.push(`**Local:** ${evento.localRotulo ?? "A definir"}`)
  l.push(`**Link:** ${evento.linkReuniao ?? "ainda não disponível"}`)
  l.push(`**Origem:** Cal.com`)
  if (campanha) l.push(`**Campanha:** ${campanha}`)
  l.push(`**Status:** ${ROTULO_STATUS[status]}`)
  if (evento.motivoCancelamento && (status === "cancelada" || status === "rejeitada")) {
    l.push(`**Motivo:** ${evento.motivoCancelamento}`)
  }
  return l.join("\n")
}

// ============================================================
// Disponibilidade
// ============================================================

export interface Janela {
  /** 0 = domingo … 6 = sábado (mesma convenção da recorrência do Workspace). */
  dia: number
  inicio: string
  fim: string
}

export interface PeriodoDisp {
  id: string
  nome: string
  de: string
  ate: string
  janelas: Janela[]
}

export interface ExcecaoDisp {
  data: string
  /** [] = dia todo indisponível. */
  janelas: { inicio: string; fim: string }[]
}

export interface BloqueioDisp {
  id: string
  de: string
  ate: string
  motivo: string | null
  calcom_ooo_id: number | null
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DATA = /^\d{4}-\d{2}-\d{2}$/

function minutos(h: string): number {
  const [a, b] = h.split(":").map(Number)
  return a * 60 + b
}

/** Valida e ordena janelas: formato, início < fim, sem sobreposição no dia. */
export function validarJanelas(janelas: unknown): { ok: true; janelas: Janela[] } | { ok: false; erro: string } {
  if (!Array.isArray(janelas)) return { ok: false, erro: "Janelas inválidas." }
  if (janelas.length > 70) return { ok: false, erro: "Janelas demais." }
  const out: Janela[] = []
  for (const j of janelas) {
    const o = obj(j)
    const dia = Number(o?.dia)
    const inicio = String(o?.inicio ?? "")
    const fim = String(o?.fim ?? "")
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) return { ok: false, erro: "Dia da semana inválido." }
    if (!HHMM.test(inicio) || !HHMM.test(fim)) return { ok: false, erro: "Use horários no formato HH:MM." }
    if (minutos(inicio) >= minutos(fim)) return { ok: false, erro: `Janela ${inicio}–${fim}: o início precisa ser antes do fim.` }
    out.push({ dia, inicio, fim })
  }
  out.sort((a, b) => a.dia - b.dia || minutos(a.inicio) - minutos(b.inicio))
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1]
    const b = out[i]
    if (a.dia === b.dia && minutos(b.inicio) < minutos(a.fim)) {
      return { ok: false, erro: `Janelas sobrepostas em ${NOMES_DIA[a.dia]}: ${a.inicio}–${a.fim} e ${b.inicio}–${b.fim}.` }
    }
  }
  return { ok: true, janelas: out }
}

export const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const
const DIAS_CAL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10)
}

export function validarPeriodos(v: unknown): { ok: true; periodos: PeriodoDisp[] } | { ok: false; erro: string } {
  if (!Array.isArray(v)) return { ok: false, erro: "Períodos inválidos." }
  const out: PeriodoDisp[] = []
  for (const p of v) {
    const o = obj(p)
    const de = String(o?.de ?? "")
    const ate = String(o?.ate ?? "")
    if (!DATA.test(de) || !DATA.test(ate) || de > ate) return { ok: false, erro: "Período com datas inválidas." }
    const dias = (Date.parse(ate) - Date.parse(de)) / 86_400_000
    if (dias > 366) return { ok: false, erro: "Período maior que um ano." }
    const j = validarJanelas(o?.janelas)
    if (!j.ok) return j
    out.push({
      id: limparTexto(o?.id, 64) ?? `${de}_${ate}`,
      nome: limparTexto(o?.nome, 60) ?? `${de} a ${ate}`,
      de, ate, janelas: j.janelas,
    })
  }
  out.sort((a, b) => a.de.localeCompare(b.de))
  for (let i = 1; i < out.length; i++) {
    if (out[i].de <= out[i - 1].ate) return { ok: false, erro: `Períodos "${out[i - 1].nome}" e "${out[i].nome}" se sobrepõem.` }
  }
  return { ok: true, periodos: out }
}

export function validarExcecoes(v: unknown): { ok: true; excecoes: ExcecaoDisp[] } | { ok: false; erro: string } {
  if (!Array.isArray(v)) return { ok: false, erro: "Exceções inválidas." }
  const out: ExcecaoDisp[] = []
  const vistas = new Set<string>()
  for (const e of v) {
    const o = obj(e)
    const data = String(o?.data ?? "")
    if (!DATA.test(data)) return { ok: false, erro: "Exceção com data inválida." }
    if (vistas.has(data)) return { ok: false, erro: `Duas exceções para ${data}.` }
    vistas.add(data)
    const brutas = Array.isArray(o?.janelas) ? (o!.janelas as unknown[]) : []
    const j = validarJanelas(brutas.map((x) => ({ ...(obj(x) ?? {}), dia: diaDaSemana(data) })))
    if (!j.ok) return j
    out.push({ data, janelas: j.janelas.map(({ inicio, fim }) => ({ inicio, fim })) })
  }
  out.sort((a, b) => a.data.localeCompare(b.data))
  return { ok: true, excecoes: out }
}

export function validarBloqueios(v: unknown): { ok: true; bloqueios: BloqueioDisp[] } | { ok: false; erro: string } {
  if (!Array.isArray(v)) return { ok: false, erro: "Bloqueios inválidos." }
  const out: BloqueioDisp[] = []
  for (const b of v) {
    const o = obj(b)
    const de = String(o?.de ?? "")
    const ate = String(o?.ate ?? "")
    if (!DATA.test(de) || !DATA.test(ate) || de > ate) return { ok: false, erro: "Bloqueio com datas inválidas." }
    out.push({
      id: limparTexto(o?.id, 64) ?? `${de}_${ate}`,
      de, ate,
      motivo: limparTexto(o?.motivo, 120),
      calcom_ooo_id: inteiro(o?.calcom_ooo_id),
    })
  }
  out.sort((a, b) => a.de.localeCompare(b.de))
  return { ok: true, bloqueios: out }
}

/**
 * Monta o corpo de PATCH /v2/schedules/{id} (cal-api-version 2024-06-11).
 *
 * O Cal.com tem: regra semanal (availability) + overrides POR DATA. Não tem
 * "regra semanal que só vale em novembro". Então:
 *   • regra semanal recorrente → availability;
 *   • período (de/até) → um override para CADA dia do período, com as
 *     janelas daquele dia da semana (dia sem janela = indisponível);
 *   • exceção de data → override daquela data (vence o período).
 * Dia indisponível vira override 00:00–00:00, que é como o próprio Cal.com
 * representa "indisponível o dia todo" num override.
 *
 * Datas no passado não são enviadas (não mudam nada e incham o schedule).
 */
export function montarCorpoSchedule(opts: {
  nome: string
  fuso: string
  janelas: Janela[]
  periodos: PeriodoDisp[]
  excecoes: ExcecaoDisp[]
  hoje: string
}) {
  const availability: { days: string[]; startTime: string; endTime: string }[] = []
  // Agrupa dias com a MESMA janela num item só (formato do Cal.com).
  const porJanela = new Map<string, number[]>()
  for (const j of opts.janelas) {
    const k = `${j.inicio}-${j.fim}`
    porJanela.set(k, [...(porJanela.get(k) ?? []), j.dia])
  }
  for (const [k, dias] of porJanela) {
    const [startTime, endTime] = k.split("-")
    availability.push({ days: dias.sort().map((d) => DIAS_CAL[d]), startTime, endTime })
  }

  const overrides = new Map<string, { date: string; startTime: string; endTime: string }[]>()
  for (const p of opts.periodos) {
    for (let d = p.de; d <= p.ate; d = somarDias(d, 1)) {
      if (d < opts.hoje) continue
      const doDia = p.janelas.filter((j) => j.dia === diaDaSemana(d))
      overrides.set(
        d,
        doDia.length > 0
          ? doDia.map((j) => ({ date: d, startTime: j.inicio, endTime: j.fim }))
          : [{ date: d, startTime: "00:00", endTime: "00:00" }]
      )
    }
  }
  for (const e of opts.excecoes) {
    if (e.data < opts.hoje) continue
    overrides.set(
      e.data,
      e.janelas.length > 0
        ? e.janelas.map((j) => ({ date: e.data, startTime: j.inicio, endTime: j.fim }))
        : [{ date: e.data, startTime: "00:00", endTime: "00:00" }]
    )
  }

  return {
    name: opts.nome,
    timeZone: opts.fuso,
    availability,
    overrides: [...overrides.keys()].sort().flatMap((k) => overrides.get(k)!),
  }
}

/** Corpo de PATCH /v2/event-types/{id} com as regras do tipo. */
export function montarCorpoEventType(t: {
  nome: string
  descricao: string | null
  duracao_min: number
  antecedencia_min_horas: number
  intervalo_min: number
  limite_diario: number | null
  horizonte_dias: number
  local: "google_meet" | "cal_video" | "definido_no_calcom"
  scheduleId: number | null
}) {
  const corpo: Record<string, unknown> = {
    title: t.nome,
    description: t.descricao ?? "",
    lengthInMinutes: t.duracao_min,
    minimumBookingNotice: t.antecedencia_min_horas * 60,
    afterEventBuffer: t.intervalo_min,
    bookingLimitsCount: t.limite_diario ? { day: t.limite_diario } : { disabled: true },
    bookingWindow: { type: "calendarDays", value: t.horizonte_dias, rolling: true },
  }
  if (t.scheduleId) corpo.scheduleId = t.scheduleId
  if (t.local === "google_meet") corpo.locations = [{ type: "integration", integration: "google-meet" }]
  if (t.local === "cal_video") corpo.locations = [{ type: "integration", integration: "cal-video" }]
  return corpo
}

/** Slug a partir do nome ("Demonstração do Sistema" → "demonstracao-do-sistema"). */
export function slugDe(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

// ============================================================
// Feed ICS de bloqueios
// ============================================================

function icsData(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

/** Data+hora de Brasília → instante UTC ISO. Brasil sem horário de verão
 *  desde 2019; ainda assim calcula o offset pelo Intl, sem fixar -03:00. */
export function brParaUtcIso(data: string, hora: string): string {
  const palpite = Date.parse(`${data}T${hora}:00Z`)
  const ajuste = (iso: number) => {
    const d = new Date(iso)
    const local = Date.parse(`${dataBR(d.toISOString())}T${horaBR(d.toISOString())}:00Z`)
    return iso - (local - palpite)
  }
  return new Date(ajuste(ajuste(palpite))).toISOString()
}

/**
 * VCALENDAR com os horários ocupados. O resumo é sempre "Ocupado" — o feed é
 * lido pelo Cal.com por uma URL com token, e não precisa (nem deve) carregar
 * título de tarefa, nome de cliente ou qualquer dado interno.
 */
export function montarIcs(bloqueios: { id: string; data: string; hora: string; duracao_min: number }[], agora: Date = new Date()): string {
  const carimbo = icsData(agora.toISOString())
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ANOMALO//Workspace Bloqueios//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ANÔMALO — bloqueios do Workspace",
  ]
  for (const b of bloqueios) {
    const inicio = brParaUtcIso(b.data, b.hora)
    const fim = new Date(Date.parse(inicio) + b.duracao_min * 60_000).toISOString()
    linhas.push(
      "BEGIN:VEVENT",
      `UID:ws-${b.id}@anomalo`,
      `DTSTAMP:${carimbo}`,
      `DTSTART:${icsData(inicio)}`,
      `DTEND:${icsData(fim)}`,
      "SUMMARY:Ocupado",
      "TRANSP:OPAQUE",
      "END:VEVENT"
    )
  }
  linhas.push("END:VCALENDAR")
  return linhas.join("\r\n") + "\r\n"
}
