/**
 * Fluxos de ponta a ponta do executor (webhook → agendamento → tarefa) contra
 * um repositório EM MEMÓRIA com as mesmas garantias do banco real (UID único,
 * source_gid único, update condicionado ao status). Rodar: `npm run test`.
 *
 * Não substitui o teste com o Cal.com real (ver docs/CALCOM_WORKSPACE_INTEGRATION.md
 * §12), mas prova a lógica de idempotência, ordem e reagendamento.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import { normalizarWebhookCal, type EventoReuniao } from "./reunioes-nucleo"
import {
  processarEvento,
  type AgendamentoGravado,
  type LinhaAgendamento,
  type RepoReunioes,
  type TipoParaProcessar,
} from "./reunioes-processar"

interface TarefaMem {
  id: string
  titulo: string
  descricao: string | null
  prazo_em: string
  prazo_hora: string
  arquivada_em: string | null
  concluida_em: string | null
  versao: number
  chave: string
  responsavelId: string | null
  contextoId: string | null
}

const BRUNO = "00000000-0000-4000-8000-000000000001"
const TIPOS: TipoParaProcessar[] = [
  { id: "tipo-mkt", nome: "Diagnóstico de Marketing para Corretores", campanha_rotulo: "Marketing para Corretores", origem_comercial: "marketing_corretores", responsavel_id: BRUNO, contexto_id: null },
  { id: "tipo-sis", nome: "Demonstração do Sistema Imobiliário", campanha_rotulo: "Sistema Imobiliário para Corretores", origem_comercial: "sistema_imobiliario", responsavel_id: BRUNO, contexto_id: null },
]
const EVENT_TYPES: Record<number, string> = { 1001: "tipo-mkt", 1002: "tipo-sis" }

function repoMemoria() {
  const agend = new Map<string, LinhaAgendamento & { id: string }>()
  const tarefas = new Map<string, TarefaMem>()
  const atividade: { tarefaId: string; evento: string }[] = []
  const notificacoes: string[] = []
  let seq = 0
  // Cede a vez entre awaits, pra simular entregas concorrentes de verdade.
  const tick = () => new Promise((r) => setImmediate(r))

  const repo: RepoReunioes = {
    async buscarAgendamento(uid) {
      await tick()
      const a = agend.get(uid)
      return a ? ({ ...a } as unknown as AgendamentoGravado) : null
    },
    async inserirAgendamento(l) {
      await tick()
      if (agend.has(l.booking_uid)) return "conflito"
      agend.set(l.booking_uid, { ...l, id: `ag${++seq}` })
      return "ok"
    },
    async atualizarAgendamento(uid, patch, esperado) {
      await tick()
      const a = agend.get(uid)
      if (!a || a.status !== esperado) return false
      Object.assign(a, patch)
      return true
    },
    async tipoPorEventType(id) { return TIPOS.find((t) => t.id === EVENT_TYPES[id]) ?? null },
    async tipoPorId(id) { return TIPOS.find((t) => t.id === id) ?? null },
    async usuarioPorEmail() { return null },
    async usuarioAtivo(id) { return id === BRUNO },
    async criarTarefa(t) {
      await tick()
      const existente = [...tarefas.values()].find((x) => x.chave === t.chave)
      if (existente) return existente.id
      const id = `t${++seq}`
      tarefas.set(id, { id, titulo: t.titulo, descricao: t.descricao, prazo_em: t.prazo_em, prazo_hora: t.prazo_hora, arquivada_em: null, concluida_em: null, versao: 1, chave: t.chave, responsavelId: t.responsavelId, contextoId: t.contextoId })
      return id
    },
    async lerTarefa(id) {
      const t = tarefas.get(id)
      return t ? { descricao: t.descricao, arquivada_em: t.arquivada_em, concluida_em: t.concluida_em, versao: t.versao } : null
    },
    async atualizarTarefa(id, patch) { Object.assign(tarefas.get(id)!, patch) },
    async registrarAtividade(tarefaId, evento) { atividade.push({ tarefaId, evento }) },
    async ping() {},
    async notificar(_ids, titulo) { notificacoes.push(titulo) },
    async log() {},
  }

  /** O que o calendário mostra: tarefas não arquivadas. */
  const ativas = () => [...tarefas.values()].filter((t) => !t.arquivada_em)
  return { repo, agend, tarefas, atividade, notificacoes, ativas }
}

function ev(gatilho: string, extra: Record<string, unknown> = {}, createdAt = "2026-11-02T12:00:00.000Z"): EventoReuniao {
  const r = normalizarWebhookCal({
    triggerEvent: gatilho,
    createdAt,
    payload: {
      uid: "bkg_joao01",
      bookingId: 1,
      eventTypeId: 1002,
      // quarta 04/11/2026 09:30 em Brasília
      startTime: "2026-11-04T12:30:00.000Z",
      endTime: "2026-11-04T13:00:00.000Z",
      status: "ACCEPTED",
      attendees: [{ name: "João Silva", email: "joao@example.com", timeZone: "America/Sao_Paulo" }],
      metadata: { videoCallUrl: "https://app.cal.com/video/abc" },
      location: "integrations:daily",
      ...extra,
    },
  })
  assert.equal(r.tipo, "evento")
  return (r as { evento: EventoReuniao }).evento
}

test("A: novo agendamento cria UMA tarefa na data/hora certas, com o responsável do tipo", async () => {
  const m = repoMemoria()
  const r = await processarEvento(m.repo, ev("BOOKING_CREATED"))
  assert.equal(r.ignorado, false)
  assert.equal(m.tarefas.size, 1)
  const t = [...m.tarefas.values()][0]
  assert.equal(t.titulo, "09:30 - Reunião com João Silva")
  assert.equal(t.prazo_em, "2026-11-04")
  assert.equal(t.prazo_hora, "09:30")
  assert.equal(t.responsavelId, BRUNO)
  assert.ok(t.descricao?.includes("**Campanha:** Sistema Imobiliário para Corretores"))
  assert.equal(m.agend.get("bkg_joao01")?.status, "confirmada")
  assert.equal(m.agend.get("bkg_joao01")?.tarefa_id, t.id)
  assert.equal(m.agend.get("bkg_joao01")?.sync_status, "ok")
  assert.deepEqual(m.notificacoes, ["Nova reunião agendada"])
})

test("B: o mesmo webhook 3x (inclusive simultâneo) gera uma única tarefa", async () => {
  const m = repoMemoria()
  await Promise.all([
    processarEvento(m.repo, ev("BOOKING_CREATED")),
    processarEvento(m.repo, ev("BOOKING_CREATED")),
  ])
  await processarEvento(m.repo, ev("BOOKING_CREATED"))
  assert.equal(m.tarefas.size, 1)
  assert.equal(m.agend.size, 1)
})

test("C: reagendar de quarta 09:30 pra sexta 14:00 move a MESMA tarefa", async () => {
  const m = repoMemoria()
  await processarEvento(m.repo, ev("BOOKING_CREATED"))
  const idOriginal = [...m.tarefas.keys()][0]
  await processarEvento(m.repo, ev("BOOKING_RESCHEDULED", {
    uid: "bkg_joao02", rescheduleUid: "bkg_joao01",
    startTime: "2026-11-06T17:00:00.000Z", endTime: "2026-11-06T17:30:00.000Z",
  }, "2026-11-03T12:00:00.000Z"))
  assert.equal(m.tarefas.size, 1, "não duplicou")
  const t = m.tarefas.get(idOriginal)!
  assert.equal(t.titulo, "14:00 - Reunião com João Silva")
  assert.equal(t.prazo_em, "2026-11-06")
  assert.equal(m.ativas().length, 1)
  assert.equal(m.agend.get("bkg_joao01")?.status, "reagendada")
  assert.equal(m.agend.get("bkg_joao01")?.reagendada_para_uid, "bkg_joao02")
  assert.equal(m.agend.get("bkg_joao02")?.status, "confirmada")
  assert.equal(m.agend.get("bkg_joao02")?.tarefa_id, idOriginal)
})

test("D: cancelar tira do calendário e preserva o histórico", async () => {
  const m = repoMemoria()
  await processarEvento(m.repo, ev("BOOKING_CREATED"))
  await processarEvento(m.repo, ev("BOOKING_CANCELLED", { status: "CANCELLED", cancellationReason: "Imprevisto" }, "2026-11-03T00:00:00.000Z"))
  assert.equal(m.ativas().length, 0)
  const t = [...m.tarefas.values()][0]
  assert.ok(t.arquivada_em, "arquivada (some do calendário, fica no Arquivo)")
  assert.equal(t.titulo, "[Cancelada] 09:30 - Reunião com João Silva")
  assert.ok(t.descricao?.includes("**Status:** Cancelada"))
  assert.ok(t.descricao?.includes("**Motivo:** Imprevisto"))
  assert.equal(m.agend.get("bkg_joao01")?.status, "cancelada")
  assert.ok(m.atividade.some((a) => a.evento === "reuniao_cancelada"))
})

test("F: cancelamento chega ANTES da criação — a criação atrasada não cria tarefa", async () => {
  const m = repoMemoria()
  await processarEvento(m.repo, ev("BOOKING_CANCELLED", { status: "CANCELLED" }, "2026-11-03T00:00:00.000Z"))
  const r = await processarEvento(m.repo, ev("BOOKING_CREATED", {}, "2026-11-02T00:00:00.000Z"))
  assert.equal(r.ignorado, true)
  assert.equal(m.tarefas.size, 0)
})

test("F: reagendamento chega ANTES da criação original — fica só a nova", async () => {
  const m = repoMemoria()
  await processarEvento(m.repo, ev("BOOKING_RESCHEDULED", {
    uid: "bkg_joao02", rescheduleUid: "bkg_joao01",
    startTime: "2026-11-06T17:00:00.000Z", endTime: "2026-11-06T17:30:00.000Z",
  }, "2026-11-03T12:00:00.000Z"))
  await processarEvento(m.repo, ev("BOOKING_CREATED", {}, "2026-11-02T12:00:00.000Z"))
  assert.equal(m.tarefas.size, 1)
  assert.equal([...m.tarefas.values()][0].titulo, "14:00 - Reunião com João Silva")
})

test("D+: cancelar depois de reagendar encerra a tarefa movida", async () => {
  const m = repoMemoria()
  await processarEvento(m.repo, ev("BOOKING_CREATED"))
  await processarEvento(m.repo, ev("BOOKING_RESCHEDULED", { uid: "bkg_joao02", rescheduleUid: "bkg_joao01", startTime: "2026-11-06T17:00:00.000Z", endTime: "2026-11-06T17:30:00.000Z" }, "2026-11-03T12:00:00.000Z"))
  await processarEvento(m.repo, ev("BOOKING_CANCELLED", { uid: "bkg_joao02", status: "CANCELLED", startTime: "2026-11-06T17:00:00.000Z", endTime: "2026-11-06T17:30:00.000Z" }, "2026-11-04T12:00:00.000Z"))
  assert.equal(m.ativas().length, 0)
  assert.equal(m.tarefas.size, 1)
  assert.equal(m.agend.get("bkg_joao02")?.reagendada_de_uid, "bkg_joao01", "elo do reagendamento preservado")
})

test("H: Marketing e Sistema mantêm cada um a sua origem", async () => {
  const m = repoMemoria()
  await processarEvento(m.repo, ev("BOOKING_CREATED", { uid: "bkg_mkt001", eventTypeId: 1001, attendees: [{ name: "Mariana Costa", email: "mariana@example.com" }], startTime: "2026-11-05T17:00:00.000Z", endTime: "2026-11-05T17:30:00.000Z" }))
  await processarEvento(m.repo, ev("BOOKING_CREATED", { uid: "bkg_sis001", eventTypeId: 1002 }))
  assert.equal(m.agend.get("bkg_mkt001")?.origem_comercial, "marketing_corretores")
  assert.equal(m.agend.get("bkg_sis001")?.origem_comercial, "sistema_imobiliario")
  const titulos = [...m.tarefas.values()].map((t) => t.titulo).sort()
  assert.deepEqual(titulos, ["09:30 - Reunião com João Silva", "14:00 - Reunião com Mariana Costa"])
})

test("14: solicitação pendente aparece marcada '(a confirmar)' e vira normal ao confirmar", async () => {
  const m = repoMemoria()
  await processarEvento(m.repo, ev("BOOKING_REQUESTED", { status: "PENDING" }))
  assert.equal([...m.tarefas.values()][0].titulo, "09:30 - Reunião com João Silva (a confirmar)")
  await processarEvento(m.repo, ev("BOOKING_CREATED", {}, "2026-11-03T00:00:00.000Z"))
  assert.equal(m.tarefas.size, 1)
  assert.equal([...m.tarefas.values()][0].titulo, "09:30 - Reunião com João Silva")
})

test("tipo não associado: tarefa criada mesmo assim, marcada como pendente de configuração", async () => {
  const m = repoMemoria()
  const r = await processarEvento(m.repo, ev("BOOKING_CREATED", { eventTypeId: 4242 }))
  assert.equal(m.tarefas.size, 1, "nenhuma reserva é perdida")
  assert.equal(m.agend.get("bkg_joao01")?.sync_status, "pendente")
  assert.ok(r.avisos.some((a) => a.includes("não associado")))
})

test("anotação da equipe na descrição não é apagada no reagendamento", async () => {
  const m = repoMemoria()
  await processarEvento(m.repo, ev("BOOKING_CREATED"))
  const t = [...m.tarefas.values()][0]
  t.descricao = `${t.descricao}\n\nLevar proposta impressa.`
  await processarEvento(m.repo, ev("BOOKING_RESCHEDULED", { uid: "bkg_joao02", rescheduleUid: "bkg_joao01", startTime: "2026-11-06T17:00:00.000Z", endTime: "2026-11-06T17:30:00.000Z" }, "2026-11-03T12:00:00.000Z"))
  assert.ok(t.descricao?.includes("Levar proposta impressa."))
  assert.ok(t.descricao?.includes("**Atualização Cal.com:**"))
})

test("link do Cal Video chegando depois complementa a tarefa", async () => {
  const m = repoMemoria()
  await processarEvento(m.repo, ev("BOOKING_CREATED", { metadata: {}, location: "integrations:daily" }))
  assert.ok([...m.tarefas.values()][0].descricao?.includes("ainda não disponível"))
  await processarEvento(m.repo, ev("BOOKING_LOCATION_UPDATED", { metadata: { videoCallUrl: "https://app.cal.com/video/novo" } }, "2026-11-02T13:00:00.000Z"))
  assert.ok([...m.tarefas.values()][0].descricao?.includes("https://app.cal.com/video/novo"))
})
