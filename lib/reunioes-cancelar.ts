// =============================================================================
// Reuniões — cancelar PELO WORKSPACE (Workspace → Cal.com → Workspace).
// =============================================================================
//
// Não importa Supabase nem o cliente HTTP: recebe as dependências. A server
// action (reunioes-actions.ts) liga o repo real e lib/calcom.ts; os testes
// ligam um repo em memória e um Cal.com falso.
//
// Regra de ouro: o Workspace só tira a reunião da agenda DEPOIS que o Cal.com
// confirmou o cancelamento. Se a resposta se perde, pergunta o estado real
// antes de dizer qualquer coisa. Estado remoto desconhecido = "pendente", e a
// reunião continua ativa aqui até a confirmação (Sincronizar agora / cron).
//
// Sem loop: o webhook BOOKING_CANCELLED que o Cal.com manda depois encontra a
// reunião já 'cancelada' (estado terminal) e é ignorado. Nada aqui é chamado
// pelo webhook.

import { ehAdminNoModulo, type UsuarioParaAcesso } from "./acesso-admin"
import { ehTerminal, normalizarBookingCal, type EventoReuniao } from "./reunioes-nucleo"
import { processarEvento, type AgendamentoGravado, type RepoReunioes } from "./reunioes-processar"

/** Quem pode cancelar uma reunião pelo Workspace: o responsável por ela, ou
 *  um admin real com o Workspace visível. Mais ninguém — nem quem só tem
 *  acesso ao Workspace. */
export function podeCancelarReuniao(usuario: (UsuarioParaAcesso & { id: string }) | null, responsavelId: string | null): boolean {
  if (!usuario) return false
  if (ehAdminNoModulo(usuario, "workspace")) return true
  return responsavelId !== null && responsavelId === usuario.id
}

export interface CalParaCancelar {
  cancelar(uid: string, motivo: string | null): Promise<unknown>
  buscar(uid: string): Promise<unknown>
}

export type EstadoCancelamento =
  /** Cancelado no Cal.com e encerrado no Workspace. */
  | "cancelada"
  /** Já estava cancelada (outro clique, outra pessoa, ou pelo Cal.com). */
  | "ja_cancelada"
  /** Cal.com confirmou, mas o Workspace não conseguiu gravar. A
   *  reconciliação conserta; a tela diz isso com todas as letras. */
  | "parcial"
  /** Não deu pra saber se o Cal.com cancelou. Nada foi tirado da agenda. */
  | "pendente"
  /** O Cal.com recusou / estava fora. Nada mudou em lugar nenhum. */
  | "erro"

export interface ResultadoCancelamento {
  estado: EstadoCancelamento
  mensagem: string
}

export interface DepsCancelar {
  repo: RepoReunioes
  cal: CalParaCancelar
  log(nivel: "info" | "aviso" | "erro", mensagem: string, detalhes?: Record<string, unknown>): Promise<void>
}

function mensagemDe(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300)
}

function statusHttp(e: unknown): number | null {
  const s = (e as { httpStatus?: unknown } | null)?.httpStatus
  return typeof s === "number" ? s : null
}

/** O booking lido do Cal.com já está fora do ar (cancelado/recusado/reagendado)? */
function encerradoNoCal(booking: unknown): EventoReuniao | null {
  const ev = normalizarBookingCal(booking)
  return ev && ev.statusAlvo && ehTerminal(ev.statusAlvo) ? ev : null
}

/** Evento de cancelamento quando não deu pra ler o booking de volta (mas o
 *  POST /cancel respondeu 200 — isso já é a confirmação). */
function eventoLocal(ag: AgendamentoGravado, motivo: string | null): EventoReuniao {
  return {
    gatilho: "WORKSPACE",
    uid: ag.booking_uid,
    bookingId: null,
    eventTypeId: null,
    nomeTipoExterno: null,
    participante: { nome: ag.participante_nome ?? "Participante", email: ag.participante_email, telefone: ag.participante_telefone, fuso: null },
    inicio: ag.inicio,
    fim: ag.fim,
    statusAlvo: "cancelada",
    linkReuniao: null,
    localRotulo: null,
    reagendadoDeUid: null,
    reagendadoParaUid: null,
    motivoCancelamento: motivo,
    organizadorEmail: null,
    ocorridoEm: new Date().toISOString(),
  }
}

export async function cancelarReuniaoPeloWorkspace(
  deps: DepsCancelar,
  uid: string,
  opts: { atorId: string; motivo: string | null }
): Promise<ResultadoCancelamento> {
  const { repo, cal, log } = deps
  const ag = await repo.buscarAgendamento(uid)
  if (!ag) return { estado: "erro", mensagem: "Reunião não encontrada." }
  if (ehTerminal(ag.status) || ag.status === "realizada") {
    return { estado: "ja_cancelada", mensagem: ag.status === "realizada" ? "Esta reunião já foi realizada." : "Esta reunião já estava cancelada." }
  }

  const detalhes = { booking_uid: uid }

  // ---------- 1) pede ao Cal.com ----------
  let confirmado: EventoReuniao | null = null
  try {
    await cal.cancelar(uid, opts.motivo)
  } catch (e) {
    // Resposta ruim ou perdida: o cancelamento pode ter acontecido mesmo
    // assim (timeout depois de enviado, duplo clique, outra pessoa). Pergunta
    // o estado real antes de repetir ou de afirmar qualquer coisa.
    let booking: unknown
    try {
      booking = await cal.buscar(uid)
    } catch (e2) {
      await repo.atualizarAgendamento(
        uid,
        { sync_status: "pendente", sync_erro: `Cancelamento pedido pelo Workspace sem confirmação do Cal.com (${mensagemDe(e)}).` },
        ag.status
      )
      await log("aviso", "Cancelamento pendente de confirmação: o Cal.com não respondeu e a reserva não pôde ser consultada.", {
        ...detalhes, erro_cancelar: mensagemDe(e), erro_consultar: mensagemDe(e2),
      })
      return {
        estado: "pendente",
        mensagem:
          "Não foi possível confirmar o cancelamento com o Cal.com. A reunião continua ativa aqui até a confirmação — " +
          "confira em alguns minutos ou use Reuniões → Integrações → Sincronizar agora.",
      }
    }
    confirmado = encerradoNoCal(booking)
    if (!confirmado) {
      await log("erro", `Falha ao cancelar no Cal.com: ${mensagemDe(e)}`, { ...detalhes, http: statusHttp(e) })
      return {
        estado: "erro",
        mensagem: `O Cal.com não cancelou a reserva (${mensagemDe(e)}). Nada foi alterado — a reunião continua ativa nos dois sistemas.`,
      }
    }
  }

  // ---------- 2) estado confirmado no Cal.com ----------
  if (!confirmado) {
    try {
      confirmado = encerradoNoCal(await cal.buscar(uid))
    } catch {
      // O POST respondeu 200: isso basta como confirmação.
    }
  }
  if (confirmado?.statusAlvo === "reagendada") {
    // O horário foi trocado no Cal.com: este UID já não é a reunião ativa.
    await processarEvento(repo, confirmado).catch(() => undefined)
    await log("aviso", "Pedido de cancelamento de uma reserva que já tinha sido reagendada no Cal.com.", detalhes)
    return {
      estado: "erro",
      mensagem: "Esta reserva foi reagendada no Cal.com e ganhou um novo horário. Atualize a página e cancele a reunião nova, se for o caso.",
    }
  }
  const evento: EventoReuniao = confirmado
    ? { ...confirmado, gatilho: "WORKSPACE", motivoCancelamento: confirmado.motivoCancelamento ?? opts.motivo }
    : eventoLocal(ag, opts.motivo)

  // ---------- 3) aplica no Workspace pela MESMA máquina de estados ----------
  try {
    const r = await processarEvento(repo, evento, 0, { atorId: opts.atorId, origem: "workspace" })
    if (r.ignorado) {
      await log("info", "Reunião já estava cancelada (confirmado no Cal.com).", detalhes)
      return { estado: "ja_cancelada", mensagem: "Esta reunião já estava cancelada." }
    }
    await log("info", "Reunião cancelada no Workspace e sincronizada com o Cal.com.", { ...detalhes, ator_id: opts.atorId })
    return { estado: "cancelada", mensagem: "Reunião cancelada no Cal.com e retirada do calendário. O histórico foi preservado." }
  } catch (e) {
    await log("erro", `Cancelada no Cal.com, mas o Workspace não foi atualizado: ${mensagemDe(e)}`, detalhes)
    return {
      estado: "parcial",
      mensagem:
        "A reserva foi cancelada no Cal.com, mas o Workspace não conseguiu se atualizar. " +
        "Use Reuniões → Integrações → Sincronizar agora para concluir.",
    }
  }
}
