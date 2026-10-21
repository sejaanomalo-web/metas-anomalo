/**
 * Repositório EM MEMÓRIA para os testes das Reuniões, com as mesmas
 * garantias do banco real (UID único, source_gid único, update condicionado
 * ao status, lixeira que não apaga a tarefa). Só usado por *.test.ts.
 */
import assert from "node:assert/strict"

import { normalizarWebhookCal, type EventoReuniao } from "./reunioes-nucleo"
import type { AgendamentoGravado, LinhaAgendamento, RepoReunioes, TipoParaProcessar } from "./reunioes-processar"

export interface TarefaMem {
  id: string
  titulo: string
  descricao: string | null
  prazo_em: string
  prazo_hora: string
  arquivada_em: string | null
  excluida_em: string | null
  concluida_em: string | null
  versao: number
  chave: string
  responsavelId: string | null
  contextoId: string | null
}

export const BRUNO = "00000000-0000-4000-8000-000000000001"
const TIPOS: TipoParaProcessar[] = [
  { id: "tipo-mkt", nome: "Diagnóstico de Marketing para Corretores", campanha_rotulo: "Marketing para Corretores", origem_comercial: "marketing_corretores", responsavel_id: BRUNO, contexto_id: null },
  { id: "tipo-sis", nome: "Demonstração do Sistema Imobiliário", campanha_rotulo: "Sistema Imobiliário para Corretores", origem_comercial: "sistema_imobiliario", responsavel_id: BRUNO, contexto_id: null },
]
const EVENT_TYPES: Record<number, string> = { 1001: "tipo-mkt", 1002: "tipo-sis" }

export function repoMemoria() {
  const agend = new Map<string, LinhaAgendamento & { id: string }>()
  const tarefas = new Map<string, TarefaMem>()
  const atividade: { tarefaId: string; evento: string; mudanca?: Record<string, unknown>; atorId?: string | null }[] = []
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
      tarefas.set(id, { id, titulo: t.titulo, descricao: t.descricao, prazo_em: t.prazo_em, prazo_hora: t.prazo_hora, arquivada_em: null, excluida_em: null, concluida_em: null, versao: 1, chave: t.chave, responsavelId: t.responsavelId, contextoId: t.contextoId })
      return id
    },
    async lerTarefa(id) {
      const t = tarefas.get(id)
      return t ? { titulo: t.titulo, descricao: t.descricao, arquivada_em: t.arquivada_em, excluida_em: t.excluida_em, concluida_em: t.concluida_em, versao: t.versao } : null
    },
    async outroAtivoNaTarefa(tarefaId, excetoUid) {
      return [...agend.values()].some((a) => a.tarefa_id === tarefaId && a.booking_uid !== excetoUid && (a.status === "solicitada" || a.status === "confirmada"))
    },
    async atualizarTarefa(id, patch) { Object.assign(tarefas.get(id)!, patch) },
    async registrarAtividade(tarefaId, evento, mudanca, atorId) { atividade.push({ tarefaId, evento, mudanca, atorId }) },
    async ping() {},
    async notificar(_ids, titulo) { notificacoes.push(titulo) },
    async log() {},
  }

  /** O que o calendário mostra: tarefas nem arquivadas nem na lixeira. */
  const ativas = () => [...tarefas.values()].filter((t) => !t.arquivada_em && !t.excluida_em)
  return { repo, agend, tarefas, atividade, notificacoes, ativas }
}

export function ev(gatilho: string, extra: Record<string, unknown> = {}, createdAt = "2026-11-02T12:00:00.000Z"): EventoReuniao {
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

