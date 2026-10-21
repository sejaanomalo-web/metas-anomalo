/**
 * Testes do núcleo das Reuniões (Cal.com). Rodar: `npm run test`.
 *
 * Dados 100% fictícios (example.com, telefones inventados).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "crypto"

import { assinaturaCalValida } from "./reunioes-assinatura"
import {
  brParaUtcIso,
  dataBR,
  decidir,
  horaBR,
  limparTexto,
  montarCorpoEventType,
  montarCorpoSchedule,
  montarDescricao,
  montarIcs,
  normalizarBookingCal,
  normalizarWebhookCal,
  tituloReuniao,
  urlSegura,
  validarExcecoes,
  validarJanelas,
  validarPeriodos,
  type AgendamentoAtual,
  type EventoReuniao,
} from "./reunioes-nucleo"

function webhook(gatilho: string, extra: Record<string, unknown> = {}, createdAt = "2026-11-02T12:00:00.000Z") {
  return {
    triggerEvent: gatilho,
    createdAt,
    payload: {
      uid: "bkg_abc123",
      bookingId: 501,
      eventTypeId: 9001,
      eventTitle: "Demonstração do Sistema Imobiliário",
      startTime: "2026-11-04T12:30:00.000Z",
      endTime: "2026-11-04T13:00:00.000Z",
      status: "ACCEPTED",
      attendees: [{ name: "João Silva", email: "joao@example.com", timeZone: "America/Sao_Paulo", phoneNumber: "+55 45 90000-0000" }],
      organizer: { email: "agenda@example.com", name: "Organizador" },
      responses: { name: { value: "João Silva" }, email: { value: "joao@example.com" } },
      metadata: { videoCallUrl: "https://app.cal.com/video/xyz" },
      location: "integrations:daily",
      ...extra,
    },
  }
}

function evento(r: ReturnType<typeof normalizarWebhookCal>): EventoReuniao {
  assert.equal(r.tipo, "evento")
  return (r as { evento: EventoReuniao }).evento
}

// ------------------------------------------------------------ assinatura (G)

test("G: assinatura HMAC-SHA256 hex do corpo cru é aceita; qualquer desvio é recusado", () => {
  const corpo = JSON.stringify(webhook("BOOKING_CREATED"))
  const segredo = "segredo-de-teste"
  const sig = createHmac("sha256", segredo).update(corpo).digest("hex")
  assert.equal(assinaturaCalValida(corpo, sig, segredo), true)
  assert.equal(assinaturaCalValida(corpo + " ", sig, segredo), false, "corpo alterado")
  assert.equal(assinaturaCalValida(corpo, sig, "outro"), false, "segredo errado")
  assert.equal(assinaturaCalValida(corpo, null, segredo), false, "sem cabeçalho")
  assert.equal(assinaturaCalValida(corpo, "zzz", segredo), false, "lixo")
  assert.equal(assinaturaCalValida(corpo, sig, undefined), false, "fail-closed sem segredo")
})

// ------------------------------------------------------------ fuso (E)

test("E: 12:30Z vira 09:30 em Brasília, mesmo dia", () => {
  assert.equal(horaBR("2026-11-04T12:30:00.000Z"), "09:30")
  assert.equal(dataBR("2026-11-04T12:30:00.000Z"), "2026-11-04")
  assert.equal(tituloReuniao("2026-11-04T12:30:00.000Z", "João Silva"), "09:30 - Reunião com João Silva")
})

test("E: perto da meia-noite UTC a data local é a de Brasília", () => {
  // 02:30Z do dia 5 = 23:30 do dia 4 em Brasília
  assert.equal(dataBR("2026-11-05T02:30:00.000Z"), "2026-11-04")
  assert.equal(horaBR("2026-11-05T02:30:00.000Z"), "23:30")
  // 03:15Z do dia 5 = 00:15 do dia 5
  assert.equal(dataBR("2026-11-05T03:15:00.000Z"), "2026-11-05")
  assert.equal(horaBR("2026-11-05T03:15:00.000Z"), "00:15")
})

test("E: horário 24h (14:00, não 2:00 PM)", () => {
  assert.equal(tituloReuniao("2026-11-06T17:00:00.000Z", "Mariana Costa"), "14:00 - Reunião com Mariana Costa")
})

test("brParaUtcIso é o inverso de dataBR/horaBR", () => {
  assert.equal(brParaUtcIso("2026-11-04", "09:30"), "2026-11-04T12:30:00.000Z")
  assert.equal(brParaUtcIso("2026-11-04", "23:30"), "2026-11-05T02:30:00.000Z")
})

// ------------------------------------------------------------ normalização

test("normaliza BOOKING_CREATED com todos os campos", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_CREATED")))
  assert.equal(e.uid, "bkg_abc123")
  assert.equal(e.eventTypeId, 9001)
  assert.equal(e.statusAlvo, "confirmada")
  assert.equal(e.participante.nome, "João Silva")
  assert.equal(e.participante.email, "joao@example.com")
  assert.equal(e.participante.telefone, "+55 45 90000-0000")
  assert.equal(e.linkReuniao, "https://app.cal.com/video/xyz")
  assert.equal(e.localRotulo, "Cal Video")
  assert.equal(e.organizadorEmail, "agenda@example.com")
})

test("14: BOOKING_CREATED com status PENDING vira 'solicitada' — nunca confirmada", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_CREATED", { status: "PENDING" })))
  assert.equal(e.statusAlvo, "solicitada")
  assert.equal(tituloReuniao(e.inicio!, e.participante.nome, "solicitada"), "09:30 - Reunião com João Silva (a confirmar)")
  assert.equal(evento(normalizarWebhookCal(webhook("BOOKING_REQUESTED"))).statusAlvo, "solicitada")
  assert.equal(evento(normalizarWebhookCal(webhook("BOOKING_REJECTED"))).statusAlvo, "rejeitada")
})

test("reagendamento carrega o UID antigo", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_RESCHEDULED", { uid: "bkg_novo999", rescheduleUid: "bkg_abc123" })))
  assert.equal(e.uid, "bkg_novo999")
  assert.equal(e.reagendadoDeUid, "bkg_abc123")
})

test("payload malformado, sem uid, sem horário e eventos desconhecidos", () => {
  assert.equal(normalizarWebhookCal(null).tipo, "invalido")
  assert.equal(normalizarWebhookCal({ triggerEvent: "BOOKING_CREATED" }).tipo, "invalido")
  assert.equal(normalizarWebhookCal(webhook("BOOKING_CREATED", { uid: "../x" })).tipo, "invalido")
  assert.equal(normalizarWebhookCal(webhook("BOOKING_CREATED", { startTime: "ontem" })).tipo, "invalido")
  assert.deepEqual(normalizarWebhookCal({ triggerEvent: "PING" }), { tipo: "ignorar", motivo: "ping" })
  assert.equal(normalizarWebhookCal(webhook("RECORDING_READY")).tipo, "ignorar")
})

test("23: nome com HTML/controle é limpo; link javascript: é descartado", () => {
  const e = evento(
    normalizarWebhookCal(
      webhook("BOOKING_CREATED", {
        responses: { name: { value: "<script>alert(1)</script>Ana\u0000 \n Lima" } },
        metadata: { videoCallUrl: "javascript:alert(1)" },
        location: "http://inseguro.example.com",
      })
    )
  )
  assert.equal(e.participante.nome, "scriptalert(1)/scriptAna Lima")
  assert.equal(e.linkReuniao, null)
  assert.equal(urlSegura("https://user:senha@example.com"), null)
  assert.equal(urlSegura("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij")
  assert.equal(limparTexto("   "), null)
})

test("nome em {firstName,lastName} é montado", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_CREATED", { responses: { name: { value: { firstName: "Carlos", lastName: "Oliveira" } } } })))
  assert.equal(e.participante.nome, "Carlos Oliveira")
})

test("booking da API (reconciliação): cancelado por reagendamento vira 'reagendada'", () => {
  const b = normalizarBookingCal({
    uid: "bkg_abc123", id: 501, status: "cancelled", start: "2026-11-04T12:30:00.000Z", end: "2026-11-04T13:00:00.000Z",
    eventType: { id: 9001 }, attendees: [{ name: "João Silva", email: "joao@example.com" }], rescheduledToUid: "bkg_novo999",
    updatedAt: "2026-11-03T10:00:00.000Z",
  })
  assert.equal(b?.statusAlvo, "reagendada")
  assert.equal(b?.eventTypeId, 9001)
  const c = normalizarBookingCal({ uid: "bkg_x12345", status: "accepted", start: "2026-11-04T12:30:00Z", end: "2026-11-04T13:00:00Z" })
  assert.equal(c?.statusAlvo, "confirmada")
})

// ------------------------------------------------------------ máquina de estados

const agora = "2026-11-02T12:00:00.000Z"
function atual(status: AgendamentoAtual["status"], extra: Partial<AgendamentoAtual> = {}): AgendamentoAtual {
  return { id: "a1", booking_uid: "bkg_abc123", status, tarefa_id: "t1", ultimo_evento_em: agora, inicio: "2026-11-04T12:30:00.000Z", link_reuniao: "https://app.cal.com/video/xyz", ...extra }
}

test("B: o mesmo evento repetido não faz nada", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_CREATED")))
  const p = decidir(e, atual("confirmada"), null)
  assert.equal(p.ignorado, true)
  assert.equal(p.tarefa.acao, "nenhuma")
})

test("F: criação atrasada depois do cancelamento NÃO reabre", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_CREATED", {}, "2026-11-01T00:00:00.000Z")))
  const p = decidir(e, atual("cancelada"), null)
  assert.equal(p.ignorado, true)
})

test("F: cancelamento de UID desconhecido grava lápide sem tarefa", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_CANCELLED")))
  const p = decidir(e, null, null)
  assert.equal(p.principal?.status, "cancelada")
  assert.equal(p.tarefa.acao, "nenhuma")
})

test("solicitação antiga chegando depois da confirmação não rebaixa", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_REQUESTED", {}, "2026-11-01T00:00:00.000Z")))
  assert.equal(decidir(e, atual("confirmada"), null).ignorado, true)
})

test("solicitada → confirmada atualiza a tarefa", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_CREATED", {}, "2026-11-03T00:00:00.000Z")))
  const p = decidir(e, atual("solicitada"), null)
  assert.deepEqual(p.tarefa, { acao: "atualizar", tarefaId: "t1", status: "confirmada", desarquivar: false })
})

test("C: reagendamento herda a tarefa do UID antigo", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_RESCHEDULED", { uid: "bkg_novo999", rescheduleUid: "bkg_abc123" })))
  const p = decidir(e, null, atual("confirmada"))
  assert.equal(p.principal?.tarefaIdHerdada, "t1")
  assert.equal(p.anterior?.uid, "bkg_abc123")
  assert.deepEqual(p.tarefa, { acao: "atualizar", tarefaId: "t1", status: "confirmada", desarquivar: true })
})

test("linha sem tarefa (execução caiu no meio) → reenvio cria a tarefa", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_CREATED")))
  const p = decidir(e, atual("confirmada", { tarefa_id: null }), null)
  assert.equal(p.tarefa.acao, "criar")
})

// ------------------------------------------------------------ descrição

test("descrição tem os campos pedidos e nunca HTML", () => {
  const e = evento(normalizarWebhookCal(webhook("BOOKING_CREATED")))
  const d = montarDescricao({ tipoNome: "Demonstração do Sistema Imobiliário", campanha: "Sistema Imobiliário para Corretores", evento: e, status: "confirmada" })
  for (const trecho of ["**Tipo:** Demonstração", "**Participante:** João Silva", "**E-mail:** joao@example.com", "**Telefone:**", "**Início:** 04/11/2026 às 09:30", "**Fim:** 04/11/2026 às 10:00", "**Local:** Cal Video", "**Link:** https://app.cal.com/video/xyz", "**Origem:** Cal.com", "**Campanha:** Sistema", "**Status:** Confirmada"]) {
    assert.ok(d.includes(trecho), `faltou: ${trecho}`)
  }
  assert.ok(!/<[a-z]/i.test(d))
})

// ------------------------------------------------------------ disponibilidade

test("janelas: duas por dia são aceitas; sobreposição e início>=fim não", () => {
  const ok = validarJanelas([{ dia: 1, inicio: "14:00", fim: "15:00" }, { dia: 1, inicio: "09:00", fim: "11:00" }])
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.ok && ok.janelas.map((j) => j.inicio), ["09:00", "14:00"])
  assert.equal(validarJanelas([{ dia: 1, inicio: "09:00", fim: "11:00" }, { dia: 1, inicio: "10:30", fim: "12:00" }]).ok, false)
  assert.equal(validarJanelas([{ dia: 1, inicio: "11:00", fim: "09:00" }]).ok, false)
  assert.equal(validarJanelas([{ dia: 7, inicio: "09:00", fim: "10:00" }]).ok, false)
  assert.equal(validarJanelas([{ dia: 1, inicio: "9:00", fim: "10:00" }]).ok, false)
})

test("schedule: regra semanal agrupa dias; período vira override por dia; exceção vence o período", () => {
  const janelas = validarJanelas([
    { dia: 1, inicio: "09:00", fim: "11:00" }, { dia: 1, inicio: "14:00", fim: "15:00" },
    { dia: 3, inicio: "09:00", fim: "11:00" },
  ])
  const periodos = validarPeriodos([{ nome: "Novembro", de: "2026-11-02", ate: "2026-11-04", janelas: [{ dia: 1, inicio: "10:00", fim: "12:00" }] }])
  const excecoes = validarExcecoes([{ data: "2026-11-02", janelas: [] }])
  assert.ok(janelas.ok && periodos.ok && excecoes.ok)
  const corpo = montarCorpoSchedule({
    nome: "Agenda", fuso: "America/Sao_Paulo",
    janelas: janelas.ok ? janelas.janelas : [], periodos: periodos.ok ? periodos.periodos : [], excecoes: excecoes.ok ? excecoes.excecoes : [],
    hoje: "2026-11-01",
  })
  assert.deepEqual(corpo.availability, [
    { days: ["Monday", "Wednesday"], startTime: "09:00", endTime: "11:00" },
    { days: ["Monday"], startTime: "14:00", endTime: "15:00" },
  ])
  assert.deepEqual(corpo.overrides, [
    { date: "2026-11-02", startTime: "00:00", endTime: "00:00" }, // exceção: segunda bloqueada
    { date: "2026-11-03", startTime: "00:00", endTime: "00:00" }, // terça sem janela no período
    { date: "2026-11-04", startTime: "00:00", endTime: "00:00" }, // quarta sem janela no período
  ])
})

test("schedule: datas passadas não são enviadas", () => {
  const corpo = montarCorpoSchedule({ nome: "A", fuso: "America/Sao_Paulo", janelas: [], periodos: [], excecoes: [{ data: "2026-01-01", janelas: [] }], hoje: "2026-11-01" })
  assert.deepEqual(corpo.overrides, [])
})

test("períodos sobrepostos são recusados", () => {
  const r = validarPeriodos([
    { nome: "Out", de: "2026-10-01", ate: "2026-10-31", janelas: [] },
    { nome: "Fim de out", de: "2026-10-20", ate: "2026-11-05", janelas: [] },
  ])
  assert.equal(r.ok, false)
})

test("event type: regras viram os campos oficiais da API v2", () => {
  const c = montarCorpoEventType({
    nome: "Diagnóstico", descricao: "d", duracao_min: 30, antecedencia_min_horas: 12, intervalo_min: 15,
    limite_diario: 3, horizonte_dias: 14, local: "cal_video", scheduleId: 77,
  })
  assert.equal(c.minimumBookingNotice, 720)
  assert.equal(c.afterEventBuffer, 15)
  assert.deepEqual(c.bookingLimitsCount, { day: 3 })
  assert.deepEqual(c.bookingWindow, { type: "calendarDays", value: 14, rolling: true })
  assert.deepEqual(c.locations, [{ type: "integration", integration: "cal-video" }])
  assert.equal(c.scheduleId, 77)
})

// ------------------------------------------------------------ ICS

test("feed ICS: só 'Ocupado', horário em UTC correto, CRLF", () => {
  const ics = montarIcs([{ id: "t9", data: "2026-11-04", hora: "10:00", duracao_min: 60 }], new Date("2026-11-01T00:00:00Z"))
  assert.ok(ics.includes("DTSTART:20261104T130000Z"))
  assert.ok(ics.includes("DTEND:20261104T140000Z"))
  assert.ok(ics.includes("SUMMARY:Ocupado"))
  assert.ok(ics.includes("\r\n"))
})
