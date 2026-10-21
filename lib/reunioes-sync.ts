// =============================================================================
// Reuniões — entrada (webhook), reprocessamento e reconciliação. Só servidor.
// =============================================================================

import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { calBuscarBooking, calListarBookings, calcomConfigurado, ErroCalcom } from "./calcom"
import { assinaturaCalValida } from "./reunioes-assinatura"
import { normalizarBookingCal, normalizarWebhookCal } from "./reunioes-nucleo"
import { processarEvento, repararEncerramento } from "./reunioes-processar"
import { eventoEncerramentoLocal, MOTIVO_REMOVIDA_NO_CAL } from "./reunioes-cancelar"
import { decidirReservaSumida } from "./reunioes-nucleo"
import { repoSupabase } from "./reunioes-repo"

export interface Integracao {
  id: string
  status: "pendente" | "conectado" | "sincronizando" | "erro" | "desconectado"
  sincronizacao_ativa: boolean
  conta_id: number | null
  conta_username: string | null
  conta_email: string | null
  conta_nome: string | null
  conta_fuso: string | null
  webhook_id: string | null
  webhook_url: string | null
  ics_credencial_id: number | null
  ultimo_teste_em: string | null
  ultimo_teste_ok: boolean | null
  ultima_sincronizacao_em: string | null
  ultimo_erro: string | null
  desconectado_em: string | null
}

export async function lerIntegracao(db: SupabaseClient): Promise<Integracao | null> {
  const { data, error } = await db.from("reunioes_integracoes").select("*").eq("provedor", "calcom").maybeSingle()
  if (error) {
    console.error("[reunioes] lerIntegracao", error.message)
    return null
  }
  return (data as Integracao | null) ?? null
}

export async function logSync(
  db: SupabaseClient,
  nivel: "info" | "aviso" | "erro",
  acao: string,
  mensagem: string,
  extra: { detalhes?: Record<string, unknown>; atorId?: string | null } = {}
): Promise<void> {
  const { error } = await db.from("reunioes_sync_log").insert({
    nivel,
    acao,
    mensagem: mensagem.slice(0, 1000),
    detalhes: extra.detalhes ?? null,
    ator_id: extra.atorId ?? null,
  })
  if (error) console.error("[reunioes] log", error.message)
}

// ============================================================
// Webhook
// ============================================================

export interface RespostaWebhook {
  http: number
  corpo: Record<string, unknown>
}

/**
 * Tudo que /api/reunioes/calcom/webhook faz, fora do Next (testável).
 *
 * Contrato:
 *   • assinatura ausente/errada → 401 e NADA é gravado;
 *   • corpo assinado e válido   → gravado ANTES de processar (rede de
 *     segurança: se o processamento falhar, dá pra reprocessar daqui);
 *   • mesmo corpo de novo       → 200 "duplicado", sem efeito;
 *   • falha transitória         → 500, pro Cal.com tentar de novo (seguro,
 *     porque tudo é idempotente) — e o evento fica 'erro' na aba Reuniões.
 */
export async function receberWebhook(
  db: SupabaseClient,
  corpoCru: string,
  assinatura: string | null
): Promise<RespostaWebhook> {
  if (!assinaturaCalValida(corpoCru, assinatura, process.env.CALCOM_WEBHOOK_SECRET)) {
    return { http: 401, corpo: { erro: "assinatura_invalida" } }
  }

  let payload: unknown
  try {
    payload = JSON.parse(corpoCru)
  } catch {
    await logSync(db, "erro", "webhook", "Webhook assinado com JSON inválido (descartado).")
    return { http: 200, corpo: { ok: false, erro: "json_invalido" } }
  }

  const chave = createHash("sha256").update(corpoCru).digest("hex")
  const raiz = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>
  const p = (raiz.payload && typeof raiz.payload === "object" ? raiz.payload : raiz) as Record<string, unknown>

  const { data: novo, error: errIns } = await db
    .from("reunioes_webhook_eventos")
    .insert({
      chave_idempotencia: chave,
      gatilho: typeof raiz.triggerEvent === "string" ? raiz.triggerEvent.slice(0, 60) : null,
      booking_uid: typeof p.uid === "string" ? p.uid.slice(0, 128) : null,
      evento_criado_em: typeof raiz.createdAt === "string" && Number.isFinite(Date.parse(raiz.createdAt)) ? raiz.createdAt : null,
      payload,
    })
    .select("id")
    .maybeSingle()

  let eventoId = (novo?.id as string | undefined) ?? null
  if (!eventoId) {
    const duplicado = errIns && (errIns.code === "23505" || /duplicate|unique/i.test(errIns.message))
    if (!duplicado) {
      console.error("[reunioes/webhook] falha ao gravar evento", errIns?.message)
      return { http: 500, corpo: { ok: false, erro: "falha_ao_gravar" } }
    }
    const { data: existente } = await db
      .from("reunioes_webhook_eventos")
      .select("id, status")
      .eq("chave_idempotencia", chave)
      .maybeSingle()
    if (!existente) return { http: 500, corpo: { ok: false, erro: "falha_ao_gravar" } }
    if (existente.status === "processado" || existente.status === "ignorado") {
      return { http: 200, corpo: { ok: true, duplicado: true } }
    }
    // Reentrega de algo que falhou antes: é a retentativa. Processa de novo.
    eventoId = existente.id as string
  }

  return processarEventoGravado(db, eventoId, payload)
}

/** Processa um evento já gravado em reunioes_webhook_eventos. */
export async function processarEventoGravado(
  db: SupabaseClient,
  eventoId: string,
  payload: unknown
): Promise<RespostaWebhook> {
  const marcar = async (campos: Record<string, unknown>) => {
    await db.from("reunioes_webhook_eventos").update({ ...campos, processado_em: new Date().toISOString() }).eq("id", eventoId)
  }

  const integ = await lerIntegracao(db)
  if (!integ || !integ.sincronizacao_ativa || integ.status === "desconectado") {
    await marcar({ status: "ignorado", resultado: "sincronização desativada" })
    return { http: 200, corpo: { ok: true, ignorado: "sincronizacao_desativada" } }
  }

  const norm = normalizarWebhookCal(payload)
  if (norm.tipo === "ignorar") {
    await marcar({ status: "ignorado", resultado: norm.motivo })
    return { http: 200, corpo: { ok: true, ignorado: norm.motivo } }
  }
  if (norm.tipo === "invalido") {
    await marcar({ status: "erro", erro: `payload inválido: ${norm.motivo}` })
    await logSync(db, "erro", "webhook", `Payload inválido (${norm.motivo}).`)
    // 200: reenviar o mesmo corpo não conserta payload ruim.
    return { http: 200, corpo: { ok: false, erro: norm.motivo } }
  }

  const { data: atual } = await db.from("reunioes_webhook_eventos").select("tentativas").eq("id", eventoId).maybeSingle()
  const tentativas = ((atual?.tentativas as number | undefined) ?? 0) + 1
  try {
    const r = await processarEvento(repoSupabase(db), norm.evento)
    await marcar({ status: r.ignorado ? "ignorado" : "processado", resultado: r.resultado, erro: null, tentativas })
    await db
      .from("reunioes_integracoes")
      .update({ ultima_sincronizacao_em: new Date().toISOString() })
      .eq("id", integ.id)
    if (norm.evento.gatilho === "BOOKING_CANCELLED") {
      await logSync(
        db, "info", "webhook",
        r.ignorado
          ? "Cancelamento recebido do Cal.com: a reunião já estava cancelada."
          : `Cancelamento recebido do Cal.com: ${r.resultado}.`,
        { detalhes: { booking_uid: norm.evento.uid } }
      )
    } else if (!r.ignorado) {
      await logSync(db, "info", "webhook", `${norm.evento.gatilho}: ${r.resultado}`, { detalhes: { booking_uid: norm.evento.uid } })
    }
    return { http: 200, corpo: { ok: true, resultado: r.resultado } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await marcar({ status: "erro", erro: msg.slice(0, 500), tentativas })
    await logSync(db, "erro", "webhook", `Falha ao processar ${norm.evento.gatilho}: ${msg.slice(0, 300)}`, { detalhes: { booking_uid: norm.evento.uid } })
    return { http: 500, corpo: { ok: false, erro: "erro_processamento" } }
  }
}

/** Reprocessa eventos com erro (ou presos em 'recebido' há mais de 5 min). */
export async function reprocessarPendentes(db: SupabaseClient, limite = 50): Promise<{ total: number; ok: number; falhas: number }> {
  const corte = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data } = await db
    .from("reunioes_webhook_eventos")
    .select("id, payload, status, recebido_em")
    .or(`status.eq.erro,and(status.eq.recebido,recebido_em.lt."${corte}")`)
    .order("recebido_em", { ascending: true })
    .limit(limite)
  let ok = 0
  let falhas = 0
  for (const ev of (data ?? []) as { id: string; payload: unknown }[]) {
    const r = await processarEventoGravado(db, ev.id, ev.payload)
    if (r.http === 200 && r.corpo.ok !== false) ok++
    else falhas++
  }
  return { total: (data ?? []).length, ok, falhas }
}

/**
 * Conclui encerramentos que ficaram pela metade: reunião já cancelada/recusada
 * no registro, tarefa ainda com cara de ativa (sync_status != 'ok'). Não fala
 * com o Cal.com — só com o banco. Usado pelo "Sincronizar agora" e pelo
 * "Tentar de novo".
 */
export async function repararEncerramentosPendentes(db: SupabaseClient): Promise<{ reparadas: number; erros: number }> {
  const repo = repoSupabase(db)
  let reparadas = 0
  let erros = 0
  const { data: meias, error } = await db
    .from("reunioes_agendamentos")
    .select("booking_uid")
    .eq("provedor", "calcom")
    .in("status", ["cancelada", "rejeitada"])
    .neq("sync_status", "ok")
    .not("tarefa_id", "is", null)
    .limit(50)
  if (error) throw new Error(`Falha ao ler encerramentos pendentes: ${error.message}`)
  for (const { booking_uid } of (meias ?? []) as { booking_uid: string }[]) {
    try {
      const r = await repararEncerramento(repo, booking_uid)
      if (r.reparado) {
        reparadas++
        await logSync(db, "info", "reconciliacao", `Reserva ${booking_uid}: ${r.resultado}.`, { detalhes: { booking_uid } })
      }
    } catch (e) {
      erros++
      await logSync(db, "erro", "reconciliacao", `Falha ao concluir o encerramento de ${booking_uid}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500))
    }
  }
  return { reparadas, erros }
}

// ============================================================
// Reconciliação com GET /v2/bookings
// ============================================================

/**
 * Pergunta ao Cal.com o que existe e aplica pela MESMA máquina de estados.
 * Cobre webhook perdido (deploy no meio, Cal.com fora do ar). Idempotente.
 * Janela: reservas que começam de 7 dias atrás até o futuro.
 *
 * Três passos:
 *  1. listagens (upcoming / unconfirmed / cancelled);
 *  2. toda reunião ATIVA aqui que não apareceu nas listagens é consultada
 *     UMA A UMA (GET /v2/bookings/{uid}) — sumir de uma listagem não prova
 *     cancelamento, e uma 404 não cancela nada (só avisa);
 *  3. encerramentos que ficaram pela metade (reunião cancelada, tarefa ainda
 *     com cara de ativa) são concluídos.
 */
export async function reconciliar(db: SupabaseClient): Promise<{
  lidos: number
  aplicados: number
  ignorados: number
  erros: number
  mensagem: string
}> {
  if (!calcomConfigurado()) {
    return { lidos: 0, aplicados: 0, ignorados: 0, erros: 0, mensagem: "CALCOM_API_KEY não configurada." }
  }
  const integ = await lerIntegracao(db)
  if (!integ || !integ.sincronizacao_ativa || integ.status === "desconectado") {
    return { lidos: 0, aplicados: 0, ignorados: 0, erros: 0, mensagem: "Sincronização desativada." }
  }

  await db.from("reunioes_integracoes").update({ status: "sincronizando" }).eq("id", integ.id)
  const afterStart = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const repo = repoSupabase(db)
  let lidos = 0, aplicados = 0, ignorados = 0, erros = 0
  let verificadas = 0, reparadas = 0
  const vistos = new Set<string>()

  try {
    // Ordem importa pouco (a máquina é tolerante), mas processar cancelados
    // por último evita "criar e logo encerrar" num booking que já nasceu
    // cancelado e era desconhecido.
    for (const status of ["upcoming", "unconfirmed", "cancelled"] as const) {
      let cursor: string | undefined
      for (let pagina = 0; pagina < 10; pagina++) {
        const r = await calListarBookings({ status, afterStart, cursor })
        for (const b of r.data) {
          const ev = normalizarBookingCal(b)
          if (!ev) continue
          vistos.add(ev.uid)
          lidos++
          try {
            const res = await processarEvento(repo, ev)
            if (res.ignorado) ignorados++
            else aplicados++
          } catch (e) {
            erros++
            await logSync(db, "erro", "reconciliacao", `Booking ${ev.uid}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500))
          }
        }
        if (!r.nextCursor) break
        cursor = r.nextCursor
      }
    }
    // ---------- 2) ativas aqui que a listagem não trouxe ----------
    const { data: ativas, error: errAtivas } = await db
      .from("reunioes_agendamentos")
      .select("booking_uid")
      .eq("provedor", "calcom")
      .in("status", ["solicitada", "confirmada"])
      .gte("inicio", afterStart)
      .order("inicio")
      .limit(100)
    if (errAtivas) throw new Error(`Falha ao ler reuniões ativas: ${errAtivas.message}`)
    const faltando = ((ativas ?? []) as { booking_uid: string }[]).map((a) => a.booking_uid).filter((u) => !vistos.has(u)).slice(0, 50)
    for (const uid of faltando) {
      try {
        const ev = normalizarBookingCal(await calBuscarBooking(uid))
        verificadas++
        if (!ev) {
          await logSync(db, "aviso", "reconciliacao", `Reserva ${uid}: resposta do Cal.com sem dados reconhecíveis; mantida como está.`)
          continue
        }
        const res = await processarEvento(repo, ev)
        if (res.ignorado) ignorados++
        else {
          aplicados++
          await logSync(db, "info", "reconciliacao", `Reserva ${uid} conferida individualmente: ${res.resultado}.`, { detalhes: { booking_uid: uid } })
        }
      } catch (e) {
        if (e instanceof ErroCalcom && e.httpStatus === 404) {
          // Reserva removida no Cal.com sem BOOKING_CANCELLED. Um 404 isolado
          // pode ser soluço da API: só encerra quando a 2ª conferência, com
          // pelo menos 30 min de intervalo, confirma.
          const ag = await repo.buscarAgendamento(uid)
          const { data: linha } = await db.from("reunioes_agendamentos").select("sync_erro").eq("provedor", "calcom").eq("booking_uid", uid).maybeSingle()
          const d = decidirReservaSumida((linha?.sync_erro as string | null) ?? null, new Date())
          if (ag && d.acao === "encerrar") {
            const res = await processarEvento(repo, eventoEncerramentoLocal(ag, MOTIVO_REMOVIDA_NO_CAL, "RECONCILIACAO"))
            aplicados++
            await logSync(db, "info", "reconciliacao", `Reserva ${uid} continua inexistente no Cal.com (2ª conferência): ${res.resultado}.`, { detalhes: { booking_uid: uid } })
          } else if (ag && d.acao === "marcar") {
            await repo.atualizarAgendamento(uid, { sync_status: "pendente", sync_erro: d.marca }, ag.status)
            await logSync(db, "aviso", "reconciliacao", `Reserva ${uid} não encontrada no Cal.com. Se continuar assim na próxima conferência (30 min+), sai do Workspace.`, { detalhes: { booking_uid: uid } })
          }
        } else {
          erros++
          await logSync(db, "erro", "reconciliacao", `Falha ao consultar reserva ${uid}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500), { detalhes: { booking_uid: uid } })
        }
      }
    }

    // ---------- 3) encerramentos pela metade ----------
    const rep = await repararEncerramentosPendentes(db)
    reparadas += rep.reparadas
    erros += rep.erros

    const reproc = await reprocessarPendentes(db)
    const mensagem =
      `Reconciliação: ${lidos} reservas lidas, ${verificadas} conferidas uma a uma, ${aplicados} aplicadas, ` +
      `${reparadas} encerramentos concluídos, ${ignorados} já em dia, ${erros} com erro. Eventos reprocessados: ${reproc.ok}/${reproc.total}.`
    await db
      .from("reunioes_integracoes")
      .update({ status: "conectado", ultima_sincronizacao_em: new Date().toISOString(), ultimo_erro: erros > 0 ? mensagem : null })
      .eq("id", integ.id)
    await logSync(db, erros > 0 ? "aviso" : "info", "reconciliacao", mensagem)
    return { lidos, aplicados, ignorados, erros, mensagem }
  } catch (e) {
    const msg = e instanceof ErroCalcom || e instanceof Error ? e.message : String(e)
    await db.from("reunioes_integracoes").update({ status: "erro", ultimo_erro: msg.slice(0, 500) }).eq("id", integ.id)
    await logSync(db, "erro", "reconciliacao", msg)
    return { lidos, aplicados, ignorados, erros: erros + 1, mensagem: msg }
  }
}
