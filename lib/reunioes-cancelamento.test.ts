/**
 * Cancelamento bidirecional Cal.com ↔ Workspace. Rodar: `npm run test`.
 *
 * Repo em memória (mesmas garantias do banco) + um Cal.com FALSO controlável
 * (responde, falha, fica fora do ar). Nenhum dado real: nomes, e-mails e UIDs
 * são fictícios. O teste com o Cal.com de verdade está no roteiro da doc.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import type { SupabaseClient } from "@supabase/supabase-js"
import { decidirReservaSumida, normalizarBookingCal } from "./reunioes-nucleo"
import { processarEvento, repararEncerramento } from "./reunioes-processar"
import { cancelarReuniaoPeloWorkspace, podeCancelarReuniao, type CalParaCancelar } from "./reunioes-cancelar"
import { tarefaEhReuniaoAtiva } from "./reunioes-guarda"
import { BRUNO, ev, repoMemoria } from "./reunioes-repo-memoria"
import { PRESET_ADMIN, PRESET_CUSTOM } from "./permissoes-ui"

const UID = "bkg_joao01"
const OUTRA_PESSOA = "00000000-0000-4000-8000-000000000002"

/** Booking como GET /v2/bookings/{uid} devolve (campos que usamos). */
function booking(status: "accepted" | "cancelled", extra: Record<string, unknown> = {}) {
  return {
    uid: UID,
    id: 1,
    status,
    start: "2026-11-04T12:30:00.000Z",
    end: "2026-11-04T13:00:00.000Z",
    eventTypeId: 1002,
    attendees: [{ name: "João Silva", email: "joao@example.com" }],
    updatedAt: "2026-11-02T13:00:00.000Z",
    ...(status === "cancelled" ? { cancellationReason: "Teste" } : {}),
    ...extra,
  }
}

class ErroHttp extends Error {
  constructor(msg: string, readonly httpStatus: number | null) {
    super(msg)
  }
}

/** Cal.com falso: guarda o estado da reserva e conta as chamadas. */
function calFalso(opts: { cancelarFalha?: unknown; buscarFalha?: unknown } = {}) {
  let estado: "accepted" | "cancelled" = "accepted"
  const chamadas = { cancelar: 0, buscar: 0, motivos: [] as (string | null)[] }
  const cal: CalParaCancelar = {
    async cancelar(_uid, motivo) {
      chamadas.cancelar++
      chamadas.motivos.push(motivo)
      if (opts.cancelarFalha) throw opts.cancelarFalha
      if (estado === "cancelled") throw new ErroHttp("Booking already cancelled", 400)
      estado = "cancelled"
      return booking("cancelled")
    },
    async buscar() {
      chamadas.buscar++
      if (opts.buscarFalha) throw opts.buscarFalha
      return booking(estado)
    },
  }
  return { cal, chamadas, cancelarLaFora: () => { estado = "cancelled" } }
}

const logs: string[] = []
const log = async (_n: string, m: string) => { logs.push(m) }

async function reuniaoCriada() {
  const m = repoMemoria()
  await processarEvento(m.repo, ev("BOOKING_CREATED"))
  const tarefa = [...m.tarefas.values()][0]
  return { m, tarefa }
}

// ---------------------------------------------------------------------------
// Fluxo A — cancelamento pelo Cal.com
// ---------------------------------------------------------------------------

test("1/A: cancelado no Cal.com → sai do calendário, histórico preservado", async () => {
  const { m, tarefa } = await reuniaoCriada()
  await processarEvento(m.repo, ev("BOOKING_CANCELLED", {}, "2026-11-02T13:00:00.000Z"))
  assert.equal(m.ativas().length, 0)
  assert.ok(m.tarefas.get(tarefa.id)!.arquivada_em, "arquivada (Arquivo), não apagada")
  assert.equal(m.tarefas.get(tarefa.id)!.titulo, "[Cancelada] 09:30 - Reunião com João Silva")
  assert.equal(m.agend.get(UID)?.status, "cancelada")
  assert.equal(m.agend.get(UID)?.sync_status, "ok")
})

test("incidente 2026-10-21: tarefa na lixeira ANTES do cancelamento ainda recebe o encerramento", async () => {
  const { m, tarefa } = await reuniaoCriada()
  m.tarefas.get(tarefa.id)!.excluida_em = "2026-11-02T12:55:00.000Z" // alguém mandou pra lixeira
  await processarEvento(m.repo, ev("BOOKING_CANCELLED", {}, "2026-11-02T13:00:00.000Z"))
  const t = m.tarefas.get(tarefa.id)!
  assert.equal(t.titulo, "[Cancelada] 09:30 - Reunião com João Silva")
  assert.ok(t.arquivada_em, "restaurar da lixeira não traz a reunião de volta como ativa")
  assert.equal(m.agend.get(UID)?.sync_status, "ok")
})

test("estado preso de produção (cancelada + tarefa com cara de ativa) é concluído pelo reparo e pela reentrega", async () => {
  const { m, tarefa } = await reuniaoCriada()
  // Exatamente o que o banco ficou: agendamento cancelado, sync 'pendente', tarefa intocada.
  Object.assign(m.agend.get(UID)!, { status: "cancelada", sync_status: "pendente", sync_erro: "A tarefa vinculada não existe mais; nada a atualizar." })
  m.tarefas.get(tarefa.id)!.excluida_em = "2026-11-02T12:55:00.000Z"

  // Reentrega do mesmo BOOKING_CANCELLED conserta...
  const r = await processarEvento(m.repo, ev("BOOKING_CANCELLED", {}, "2026-11-02T13:00:00.000Z"))
  assert.equal(r.ignorado, false)
  assert.equal(m.tarefas.get(tarefa.id)!.titulo, "[Cancelada] 09:30 - Reunião com João Silva")
  assert.ok(m.tarefas.get(tarefa.id)!.arquivada_em)
  assert.equal(m.agend.get(UID)?.sync_status, "ok")

  // ...e repetir é inócuo (idempotente).
  const antes = m.tarefas.get(tarefa.id)!.versao
  assert.equal((await repararEncerramento(m.repo, UID)).reparado, false)
  assert.equal(m.tarefas.get(tarefa.id)!.versao, antes)
})

// ---------------------------------------------------------------------------
// Fluxo B — cancelamento pelo Workspace
// ---------------------------------------------------------------------------

test("2/B: botão do Workspace cancela no Cal.com, depois tira do calendário e registra quem fez", async () => {
  const { m, tarefa } = await reuniaoCriada()
  const f = calFalso()
  const r = await cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: BRUNO, motivo: "Precisamos remarcar." })
  assert.equal(r.estado, "cancelada")
  assert.equal(f.chamadas.cancelar, 1)
  assert.deepEqual(f.chamadas.motivos, ["Precisamos remarcar."])
  assert.equal(m.ativas().length, 0)
  assert.equal(m.agend.get(UID)?.status, "cancelada")
  assert.equal(m.agend.get(UID)?.ultimo_gatilho, "WORKSPACE")
  const reg = m.atividade.find((a) => a.evento === "reuniao_cancelada")
  assert.equal(reg?.atorId, BRUNO)
  assert.equal(reg?.mudanca?.origem, "workspace")
  assert.equal(m.tarefas.get(tarefa.id)!.titulo, "[Cancelada] 09:30 - Reunião com João Silva")
})

test("sem loop: o webhook de cancelamento que o Cal.com manda depois é só 'já estava cancelada'", async () => {
  const { m } = await reuniaoCriada()
  const f = calFalso()
  await cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: BRUNO, motivo: null })
  const r = await processarEvento(m.repo, ev("BOOKING_CANCELLED", {}, "2026-11-02T14:00:00.000Z"))
  assert.equal(r.ignorado, true)
  assert.equal(f.chamadas.cancelar, 1, "nenhuma nova chamada ao Cal.com")
  assert.equal(m.atividade.filter((a) => a.evento === "reuniao_cancelada").length, 1)
})

// ---------------------------------------------------------------------------
// Falhas
// ---------------------------------------------------------------------------

test("4: dois cancelamentos simultâneos → um estado final, sem erro indevido", async () => {
  const { m } = await reuniaoCriada()
  const f = calFalso()
  const [a, b] = await Promise.all([
    cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: BRUNO, motivo: null }),
    cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: OUTRA_PESSOA, motivo: null }),
  ])
  const estados = [a.estado, b.estado].sort()
  assert.ok(estados.every((e) => e === "cancelada" || e === "ja_cancelada"), `estados: ${estados}`)
  assert.equal(m.ativas().length, 0)
  assert.equal(m.atividade.filter((x) => x.evento === "reuniao_cancelada").length, 1)
  // E o mesmo webhook 3x depois não muda nada.
  for (let i = 0; i < 3; i++) await processarEvento(m.repo, ev("BOOKING_CANCELLED", {}, "2026-11-02T14:00:00.000Z"))
  assert.equal(m.atividade.filter((x) => x.evento === "reuniao_cancelada").length, 1)
})

test("5a: Cal.com recusa e a reserva segue ativa lá → erro, nada muda no Workspace", async () => {
  const { m } = await reuniaoCriada()
  const f = calFalso({ cancelarFalha: new ErroHttp("Cal.com POST → 503", 503) })
  const r = await cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: BRUNO, motivo: null })
  assert.equal(r.estado, "erro")
  assert.equal(m.ativas().length, 1, "sem falso sucesso: continua no calendário")
  assert.equal(m.agend.get(UID)?.status, "confirmada")
})

test("5b: timeout e Cal.com fora do ar → 'pendente', reunião continua ativa; a reconciliação conclui depois", async () => {
  const { m } = await reuniaoCriada()
  const fora = new ErroHttp("Falha de rede com o Cal.com", null)
  const f = calFalso({ cancelarFalha: fora, buscarFalha: fora })
  const r = await cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: BRUNO, motivo: null })
  assert.equal(r.estado, "pendente")
  assert.equal(m.ativas().length, 1, "estado remoto desconhecido: nada sai da agenda")
  assert.equal(m.agend.get(UID)?.sync_status, "pendente")
  assert.match(m.agend.get(UID)?.sync_erro ?? "", /sem confirmação/)

  // Mais tarde: o Cal.com tinha cancelado sim. A conferência individual (GET)
  // traz 'cancelled' e o Workspace se ajusta.
  const lido = normalizarBookingCal(booking("cancelled"))!
  await processarEvento(m.repo, lido)
  assert.equal(m.ativas().length, 0)
  assert.equal(m.agend.get(UID)?.status, "cancelada")
})

test("5c: resposta perdida mas o cancelamento aconteceu → confirma pelo GET antes de repetir", async () => {
  const { m } = await reuniaoCriada()
  const f = calFalso({ cancelarFalha: new ErroHttp("timeout", null) })
  f.cancelarLaFora() // o POST chegou ao Cal.com; só a resposta se perdeu
  const r = await cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: BRUNO, motivo: null })
  assert.equal(r.estado, "cancelada")
  assert.equal(f.chamadas.cancelar, 1, "não repete o POST")
  assert.equal(m.ativas().length, 0)
})

test("6: Cal.com cancelou mas o banco falhou → 'parcial' (sem falso sucesso) e o reparo recupera", async () => {
  const { m, tarefa } = await reuniaoCriada()
  const f = calFalso()
  const original = m.repo.atualizarTarefa
  m.repo.atualizarTarefa = async () => { throw new Error("banco indisponível") }
  const r = await cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: BRUNO, motivo: null })
  assert.equal(r.estado, "parcial")
  assert.match(r.mensagem, /Sincronizar agora/)
  m.repo.atualizarTarefa = original

  // "Sincronizar agora" → passo 3 da reconciliação.
  const rep = await repararEncerramento(m.repo, UID)
  assert.equal(rep.reparado, true)
  assert.equal(m.ativas().length, 0)
  assert.equal(m.tarefas.get(tarefa.id)!.titulo, "[Cancelada] 09:30 - Reunião com João Silva")
})

// ---------------------------------------------------------------------------
// Reagendamento
// ---------------------------------------------------------------------------

test("7: cancelamento do horário ANTIGO de um reagendamento não derruba a reunião nova", async () => {
  const { m, tarefa } = await reuniaoCriada()
  await processarEvento(
    m.repo,
    ev("BOOKING_RESCHEDULED", { uid: "bkg_joao02", rescheduleUid: UID, startTime: "2026-11-06T17:00:00.000Z", endTime: "2026-11-06T17:30:00.000Z" }, "2026-11-02T13:00:00.000Z")
  )
  await processarEvento(m.repo, ev("BOOKING_CANCELLED", {}, "2026-11-02T14:00:00.000Z")) // UID antigo
  assert.equal(m.ativas().length, 1)
  assert.equal(m.tarefas.get(tarefa.id)!.titulo, "14:00 - Reunião com João Silva")
  assert.equal(m.agend.get("bkg_joao02")?.status, "confirmada")

  // Pelo Workspace, o UID antigo também não vira chamada ao Cal.com.
  const f = calFalso()
  const r = await cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: BRUNO, motivo: null })
  assert.equal(r.estado, "ja_cancelada")
  assert.equal(f.chamadas.cancelar, 0)
})

test("7b: UID antigo 'cancelada' com reparo pendente não arquiva a tarefa que a reunião nova usa", async () => {
  const { m, tarefa } = await reuniaoCriada()
  await processarEvento(
    m.repo,
    ev("BOOKING_RESCHEDULED", { uid: "bkg_joao02", rescheduleUid: UID, startTime: "2026-11-06T17:00:00.000Z", endTime: "2026-11-06T17:30:00.000Z" }, "2026-11-02T13:00:00.000Z")
  )
  Object.assign(m.agend.get(UID)!, { status: "cancelada", sync_status: "pendente" })
  await repararEncerramento(m.repo, UID)
  assert.equal(m.tarefas.get(tarefa.id)!.arquivada_em, null)
  assert.equal(m.ativas().length, 1)
})

// ---------------------------------------------------------------------------
// Tarefa comum, autorização, já cancelada, Google Meet
// ---------------------------------------------------------------------------

/** Supabase mínimo pro select da guarda. */
function dbFalso(linhas: unknown[], erro: { message: string } | null = null): SupabaseClient {
  const q = { select: () => q, eq: () => q, in: () => q, limit: async () => ({ data: erro ? null : linhas, error: erro }) }
  return { from: () => q } as unknown as SupabaseClient
}

test("8: tarefa comum (sem vínculo) exclui/arquiva como sempre; reunião ativa é barrada", async () => {
  assert.equal(await tarefaEhReuniaoAtiva(dbFalso([]), "t-comum"), false)
  assert.equal(await tarefaEhReuniaoAtiva(dbFalso([{ id: "ag1" }]), "t-reuniao"), true)
  // Sem a migration das Reuniões: não trava a lixeira das tarefas comuns.
  assert.equal(await tarefaEhReuniaoAtiva(dbFalso([], { message: "relation does not exist" }), "t-comum"), false)
})

test("9: só o responsável ou um admin do Workspace podem cancelar", () => {
  const admin = { id: "a", papel: "admin", papelReal: "admin", permissoes: PRESET_ADMIN } as const
  const comum = { id: OUTRA_PESSOA, papel: "custom", papelReal: "custom", permissoes: { ...PRESET_CUSTOM, workspace: true } } as const
  const responsavel = { ...comum, id: BRUNO }
  assert.equal(podeCancelarReuniao(admin, BRUNO), true)
  assert.equal(podeCancelarReuniao(responsavel, BRUNO), true)
  assert.equal(podeCancelarReuniao(comum, BRUNO), false, "acesso ao Workspace não basta")
  assert.equal(podeCancelarReuniao(comum, null), false, "reunião sem responsável: só admin")
  assert.equal(podeCancelarReuniao(null, BRUNO), false)
})

test("10: 'Sincronizar agora' com reserva já cancelada → sem duplicar, sem reativar", async () => {
  const { m } = await reuniaoCriada()
  await processarEvento(m.repo, ev("BOOKING_CANCELLED", {}, "2026-11-02T13:00:00.000Z"))
  const versoes = [...m.tarefas.values()].map((t) => t.versao)
  for (let i = 0; i < 2; i++) {
    const r = await processarEvento(m.repo, normalizarBookingCal(booking("cancelled"))!)
    assert.equal(r.ignorado, true)
  }
  // Criação atrasada também não reativa.
  await processarEvento(m.repo, ev("BOOKING_CREATED", {}, "2026-11-02T11:00:00.000Z"))
  assert.equal(m.ativas().length, 0)
  assert.equal(m.tarefas.size, 1)
  assert.deepEqual([...m.tarefas.values()].map((t) => t.versao), versoes)
  assert.equal((await repararEncerramento(m.repo, UID)).reparado, false)
})

test("11: Google Meet — reunião com Meet é cancelada como qualquer outra e o link deixa de valer", async () => {
  const m = repoMemoria()
  const meet = { location: "integrations:google:meet", metadata: { videoCallUrl: "https://meet.google.com/abc-defg-hij" } }
  await processarEvento(m.repo, ev("BOOKING_CREATED", meet))
  assert.equal(m.agend.get(UID)?.local_rotulo, "Google Meet")
  assert.equal(m.agend.get(UID)?.link_reuniao, "https://meet.google.com/abc-defg-hij")
  await processarEvento(m.repo, ev("BOOKING_CANCELLED", meet, "2026-11-02T13:00:00.000Z"))
  assert.equal(m.ativas().length, 0)
  // A tela só mostra "Entrar na reunião" para status ativo (BlocoReuniaoTarefa/ListaReunioes).
  assert.equal(m.agend.get(UID)?.status, "cancelada")
})

// ---------------------------------------------------------------------------
// Reserva removida no Cal.com sem BOOKING_CANCELLED (caso real de 2026-10-21)
// ---------------------------------------------------------------------------

test("removida no Cal.com: 'Cancelar reunião' com 404 no cancelamento E na consulta retira do Workspace (sem ficar pendente)", async () => {
  const { m, tarefa } = await reuniaoCriada()
  m.tarefas.get(tarefa.id)!.excluida_em = "2026-11-02T12:55:00.000Z" // estava na lixeira, como no caso real
  const nf = new ErroHttp("Cal.com POST → 404 (não encontrado): Booking not found", 404)
  const f = calFalso({ cancelarFalha: nf, buscarFalha: new ErroHttp("Cal.com GET → 404", 404) })
  const r = await cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: BRUNO, motivo: null })
  assert.equal(r.estado, "removida_no_cal")
  assert.equal(m.agend.get(UID)?.status, "cancelada")
  assert.equal(m.agend.get(UID)?.sync_status, "ok")
  assert.equal(m.tarefas.get(tarefa.id)!.titulo, "[Cancelada] 09:30 - Reunião com João Silva")
  assert.ok(m.tarefas.get(tarefa.id)!.arquivada_em)
})

test("404 só no cancelamento, mas a consulta responde que está ativa → erro, nada muda", async () => {
  const { m } = await reuniaoCriada()
  const f = calFalso({ cancelarFalha: new ErroHttp("404", 404) })
  const r = await cancelarReuniaoPeloWorkspace({ repo: m.repo, cal: f.cal, log }, UID, { atorId: BRUNO, motivo: null })
  assert.equal(r.estado, "erro")
  assert.equal(m.ativas().length, 1)
})

test("reconciliação: 1º 404 só marca; 2º 404 antes de 30 min aguarda; depois de 30 min encerra", () => {
  const t0 = new Date("2026-10-21T19:00:00.000Z")
  const d1 = decidirReservaSumida(null, t0)
  assert.equal(d1.acao, "marcar")
  const marca = (d1 as { marca: string }).marca
  assert.equal(decidirReservaSumida(marca, new Date("2026-10-21T19:10:00.000Z")).acao, "aguardar")
  assert.equal(decidirReservaSumida(marca, new Date("2026-10-21T19:31:00.000Z")).acao, "encerrar")
  // Outro erro qualquer gravado antes não conta como 1ª conferência.
  assert.equal(decidirReservaSumida("Cancelamento pedido pelo Workspace sem confirmação", t0).acao, "marcar")
})
