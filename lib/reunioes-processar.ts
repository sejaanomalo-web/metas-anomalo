// =============================================================================
// Reuniões — EXECUTOR: aplica no banco o plano decidido em reunioes-nucleo.ts.
// =============================================================================
//
// Não importa Supabase: fala com um `RepoReunioes`. Em produção é o repo de
// lib/reunioes-repo.ts; nos testes (reunioes-processar.test.ts) é um repo em
// memória — é assim que os fluxos A–H do plano de testes rodam sem banco.
//
// A tarefa criada é uma tarefa NORMAL do Workspace (ws_tarefas + responsáveis
// + contexto + seguidor + atividade + ping de realtime), com prazo_em/
// prazo_hora no horário de Brasília. Por isso aparece no calendário como
// qualquer tarefa criada à mão.

import {
  dataBR,
  dataHoraBRLegivel,
  decidir,
  ehTerminal,
  horaBR,
  montarDescricao,
  tituloReuniao,
  type AgendamentoAtual,
  type EventoReuniao,
  type StatusReuniao,
} from "./reunioes-nucleo"

export interface AgendamentoGravado extends AgendamentoAtual {
  tipo_id: string | null
  responsavel_id: string | null
  participante_nome: string | null
  participante_email: string | null
  participante_telefone: string | null
  fim: string | null
  local_rotulo: string | null
  descricao_gerada: string | null
  sync_status: "ok" | "pendente" | "erro"
}

export interface TipoParaProcessar {
  id: string
  nome: string
  campanha_rotulo: string | null
  origem_comercial: string
  responsavel_id: string | null
  contexto_id: string | null
}

export interface TarefaLida {
  titulo: string
  descricao: string | null
  arquivada_em: string | null
  /** Lixeira do Workspace. A tarefa ainda existe e PRECISA receber o
   *  cancelamento — senão quem a restaurar vê uma reunião cancelada como
   *  ativa (foi exatamente o caso de 2026-10-21). */
  excluida_em: string | null
  concluida_em: string | null
  versao: number
}

export interface LinhaAgendamento {
  booking_uid: string
  booking_id: number | null
  tipo_id: string | null
  calcom_event_type_id: number | null
  tarefa_id: string | null
  responsavel_id: string | null
  participante_nome: string | null
  participante_email: string | null
  participante_telefone: string | null
  participante_fuso: string | null
  inicio: string | null
  fim: string | null
  status: StatusReuniao
  reagendada_de_uid: string | null
  reagendada_para_uid: string | null
  link_reuniao: string | null
  local_rotulo: string | null
  origem_comercial: string | null
  cancelamento_motivo: string | null
  ultimo_evento_em: string
  ultimo_gatilho: string
  descricao_gerada: string | null
  sync_status: "ok" | "pendente" | "erro"
  sync_erro: string | null
}

export interface RepoReunioes {
  buscarAgendamento(uid: string): Promise<AgendamentoGravado | null>
  /** INSERT puro. 'conflito' = o UID já existe (outra entrega chegou antes). */
  inserirAgendamento(linha: LinhaAgendamento): Promise<"ok" | "conflito">
  /** UPDATE condicionado ao status lido (trava otimista). false = mudou no meio. */
  atualizarAgendamento(uid: string, patch: Partial<LinhaAgendamento>, statusEsperado: StatusReuniao): Promise<boolean>
  tipoPorEventType(eventTypeId: number): Promise<TipoParaProcessar | null>
  tipoPorId(id: string): Promise<TipoParaProcessar | null>
  /** Usuário interno ATIVO com este e-mail (organizador do Cal.com). */
  usuarioPorEmail(email: string): Promise<string | null>
  usuarioAtivo(id: string): Promise<boolean>
  /** Cria a tarefa; `chave` (source_gid) garante 1 tarefa por booking mesmo
   *  com duas entregas simultâneas. Devolve o id (o existente, se colidir). */
  criarTarefa(t: {
    chave: string
    titulo: string
    descricao: string
    prazo_em: string
    prazo_hora: string
    responsavelId: string | null
    contextoId: string | null
  }): Promise<string>
  /** A tarefa, INCLUSIVE na lixeira. null só se ela foi apagada de vez.
   *  Erro de banco LANÇA — nunca vira "não existe". */
  lerTarefa(id: string): Promise<TarefaLida | null>
  /** Existe OUTRO booking ativo (solicitada/confirmada) usando esta tarefa?
   *  Reagendamento faz dois UIDs apontarem pra mesma tarefa: encerrar pelo
   *  UID velho não pode derrubar a reunião nova. */
  outroAtivoNaTarefa(tarefaId: string, excetoUid: string): Promise<boolean>
  atualizarTarefa(id: string, patch: Record<string, unknown>): Promise<void>
  /** atorId null = sistema (webhook/reconciliação). */
  registrarAtividade(tarefaId: string, evento: string, mudanca: Record<string, unknown>, atorId?: string | null): Promise<void>
  ping(tarefaId: string): Promise<void>
  notificar(usuarioIds: string[], titulo: string, mensagem: string, tarefaId: string): Promise<void>
  log(nivel: "info" | "aviso" | "erro", acao: string, mensagem: string, detalhes?: Record<string, unknown>): Promise<void>
}

/** Quem disparou: o Cal.com (webhook/reconciliação) ou uma pessoa no
 *  Workspace (botão "Cancelar reunião"). Vai pro histórico da tarefa. */
export interface ContextoProcessamento {
  atorId?: string | null
  origem?: "calcom" | "workspace"
}

export interface ResultadoProcessamento {
  ignorado: boolean
  resultado: string
  tarefaId: string | null
  avisos: string[]
}

/** Completa o evento com o que já sabemos: MEETING_ENDED e afins chegam sem
 *  participante/horário, e não podem apagar o nome do título. */
function mesclar(evento: EventoReuniao, ag: AgendamentoGravado | null): EventoReuniao {
  if (!ag) return evento
  const nomeGenerico = evento.participante.nome === "Participante"
  return {
    ...evento,
    participante: {
      nome: nomeGenerico && ag.participante_nome ? ag.participante_nome : evento.participante.nome,
      email: evento.participante.email ?? ag.participante_email,
      telefone: evento.participante.telefone ?? ag.participante_telefone,
      fuso: evento.participante.fuso,
    },
    inicio: evento.inicio ?? ag.inicio,
    fim: evento.fim ?? ag.fim,
    linkReuniao: evento.linkReuniao ?? ag.link_reuniao,
    localRotulo: evento.localRotulo ?? ag.local_rotulo,
  }
}

const PRESERVAR_SE_NULO = [
  "reagendada_de_uid",
  "reagendada_para_uid",
  "booking_id",
  "calcom_event_type_id",
  "participante_fuso",
  "cancelamento_motivo",
  "tipo_id",
  "origem_comercial",
] as const

export async function processarEvento(
  repo: RepoReunioes,
  eventoBruto: EventoReuniao,
  tentativa = 0,
  contexto: ContextoProcessamento = {}
): Promise<ResultadoProcessamento> {
  const avisos: string[] = []
  const origem = contexto.origem ?? "calcom"
  const atorId = contexto.atorId ?? null
  const atual = await repo.buscarAgendamento(eventoBruto.uid)
  const anterior = eventoBruto.reagendadoDeUid
    ? await repo.buscarAgendamento(eventoBruto.reagendadoDeUid)
    : null
  const evento = mesclar(eventoBruto, atual ?? anterior)
  const plano = decidir(evento, atual, anterior)

  if (plano.ignorado || !plano.principal) {
    // Cancelamento repetido de algo cujo encerramento ficou pela metade (a
    // tarefa não foi arquivada): a reentrega é a chance de terminar o serviço.
    if (atual && (atual.status === "cancelada" || atual.status === "rejeitada") && atual.sync_status !== "ok") {
      const r = await repararEncerramento(repo, atual.booking_uid)
      if (r.reparado) return { ignorado: false, resultado: r.resultado, tarefaId: atual.tarefa_id, avisos }
    }
    return { ignorado: plano.ignorado, resultado: plano.resultado, tarefaId: atual?.tarefa_id ?? null, avisos }
  }
  const status = plano.principal.status

  // ---------- tipo e responsável ----------
  let tipo: TipoParaProcessar | null = null
  if (evento.eventTypeId) tipo = await repo.tipoPorEventType(evento.eventTypeId)
  if (!tipo && (atual?.tipo_id ?? anterior?.tipo_id)) tipo = await repo.tipoPorId((atual?.tipo_id ?? anterior?.tipo_id)!)
  if (!tipo) avisos.push(`Tipo de reunião não associado (event type ${evento.eventTypeId ?? "?"}). Associe na aba Reuniões → Tipos.`)

  let responsavelId: string | null = atual?.responsavel_id ?? anterior?.responsavel_id ?? null
  if (!responsavelId && tipo?.responsavel_id && (await repo.usuarioAtivo(tipo.responsavel_id))) {
    responsavelId = tipo.responsavel_id
  }
  // Identificação segura: só por e-mail EXATO do organizador = e-mail de
  // login de um usuário ativo. Nunca por nome.
  if (!responsavelId && evento.organizadorEmail) responsavelId = await repo.usuarioPorEmail(evento.organizadorEmail)
  if (!responsavelId) avisos.push("Responsável interno não identificado — tarefa criada sem responsável.")

  const linhaBase = (): LinhaAgendamento => ({
    booking_uid: evento.uid,
    booking_id: evento.bookingId,
    tipo_id: tipo?.id ?? null,
    calcom_event_type_id: evento.eventTypeId,
    tarefa_id: plano.principal!.tarefaIdHerdada ?? atual?.tarefa_id ?? null,
    responsavel_id: responsavelId,
    participante_nome: evento.participante.nome,
    participante_email: evento.participante.email,
    participante_telefone: evento.participante.telefone,
    participante_fuso: evento.participante.fuso,
    inicio: evento.inicio,
    fim: evento.fim,
    status,
    reagendada_de_uid: evento.reagendadoDeUid,
    reagendada_para_uid: evento.reagendadoParaUid,
    link_reuniao: evento.linkReuniao,
    local_rotulo: evento.localRotulo,
    origem_comercial: tipo?.origem_comercial ?? null,
    cancelamento_motivo: evento.motivoCancelamento,
    ultimo_evento_em: evento.ocorridoEm,
    ultimo_gatilho: evento.gatilho,
    descricao_gerada: atual?.descricao_gerada ?? null,
    sync_status: plano.tarefa.acao === "criar" ? "pendente" : "ok",
    sync_erro: avisos.length > 0 ? avisos.join(" ") : null,
  })

  // ---------- 1) reivindica o UID ANTES de criar a tarefa ----------
  // Duas entregas simultâneas do mesmo evento: só uma consegue o INSERT; a
  // outra reprocessa e já enxerga a linha.
  if (!atual) {
    const r = await repo.inserirAgendamento(linhaBase())
    if (r === "conflito") {
      if (tentativa >= 2) throw new Error("Conflito persistente ao gravar agendamento.")
      return processarEvento(repo, eventoBruto, tentativa + 1, contexto)
    }
  } else {
    // Evento posterior (ex.: cancelamento) costuma vir sem estes campos; null
    // aqui apagaria o que já sabemos — inclusive o elo do reagendamento.
    const patch: Partial<LinhaAgendamento> = linhaBase()
    for (const k of PRESERVAR_SE_NULO) if (patch[k] === null) delete patch[k]
    const ok = await repo.atualizarAgendamento(evento.uid, patch, atual.status)
    if (!ok) {
      if (tentativa >= 2) throw new Error("Agendamento mudou durante o processamento.")
      return processarEvento(repo, eventoBruto, tentativa + 1, contexto)
    }
  }

  // ---------- 2) UID anterior (reagendamento) ----------
  if (plano.anterior) {
    const ant = plano.anterior.existente
    if (ant) {
      if (!ehTerminal(ant.status) || ant.status === "cancelada") {
        await repo.atualizarAgendamento(
          plano.anterior.uid,
          { status: "reagendada", reagendada_para_uid: evento.uid, ultimo_evento_em: evento.ocorridoEm, ultimo_gatilho: evento.gatilho },
          ant.status
        )
      }
    } else {
      // Lápide: barra a criação atrasada do UID antigo.
      await repo.inserirAgendamento({
        ...linhaBase(),
        booking_uid: plano.anterior.uid,
        booking_id: null,
        status: "reagendada",
        reagendada_de_uid: null,
        reagendada_para_uid: evento.uid,
        tarefa_id: null,
        sync_status: "ok",
        sync_erro: null,
      })
    }
  }

  // ---------- 3) tarefa ----------
  const tipoNome = tipo?.nome ?? null
  const campanha = tipo?.campanha_rotulo ?? null
  let tarefaId: string | null = linhaBase().tarefa_id
  let descricaoGerada: string | null = atual?.descricao_gerada ?? null
  const novaDescricao = montarDescricao({ tipoNome, campanha, evento, status })

  try {
    const acao = plano.tarefa
    if (acao.acao === "criar") {
      if (!evento.inicio) throw new Error("Reunião sem horário de início.")
      tarefaId = await repo.criarTarefa({
        chave: `calcom:${evento.uid}`,
        titulo: tituloReuniao(evento.inicio, evento.participante.nome, status),
        descricao: novaDescricao,
        prazo_em: dataBR(evento.inicio),
        prazo_hora: horaBR(evento.inicio),
        responsavelId,
        contextoId: tipo?.contexto_id ?? null,
      })
      descricaoGerada = novaDescricao
      await repo.registrarAtividade(tarefaId, "criada", { origem, booking_uid: evento.uid, status }, atorId)
      await repo.ping(tarefaId)
      if (responsavelId) {
        await repo.notificar(
          [responsavelId],
          status === "solicitada" ? "Nova solicitação de reunião" : "Nova reunião agendada",
          `${evento.participante.nome} — ${dataHoraBRLegivel(evento.inicio)}${tipoNome ? ` (${tipoNome})` : ""}.`,
          tarefaId
        )
      }
    } else if (acao.acao === "encerrar" && (await repo.outroAtivoNaTarefa(acao.tarefaId, evento.uid))) {
      // A tarefa já pertence a um booking NOVO e ativo (reagendamento): o
      // cancelamento do UID velho fica só no registro dele.
      tarefaId = acao.tarefaId
      avisos.push("Cancelamento de um horário antigo (reagendado); a reunião ativa não foi alterada.")
    } else if (acao.acao === "atualizar" || acao.acao === "encerrar") {
      tarefaId = acao.tarefaId
      const t = await repo.lerTarefa(tarefaId)
      if (!t) {
        avisos.push("A tarefa vinculada foi apagada de vez do Workspace; o registro da reunião foi atualizado mesmo assim.")
      } else {
        if (t.excluida_em && acao.acao === "atualizar") {
          avisos.push("A tarefa desta reunião está na lixeira do Workspace; restaure-a para vê-la no Calendário.")
        }
        const inicio = evento.inicio
        const patch: Record<string, unknown> = { versao: t.versao + 1 }
        if (inicio) {
          patch.titulo = tituloReuniao(inicio, evento.participante.nome, status)
          patch.prazo_em = dataBR(inicio)
          patch.prazo_hora = horaBR(inicio)
        }
        // Descrição: se ninguém editou desde a última geração, regenera; se a
        // equipe anotou algo, só acrescenta uma linha (nunca apaga anotação).
        if (t.descricao === null || t.descricao === descricaoGerada) {
          patch.descricao = novaDescricao
          descricaoGerada = novaDescricao
        } else {
          const linha = `**Atualização Cal.com:** ${plano.resultado}${inicio ? ` — ${dataHoraBRLegivel(inicio)}` : ""}${evento.linkReuniao ? ` — ${evento.linkReuniao}` : ""}`
          patch.descricao = `${t.descricao}\n\n${linha}`.slice(0, 20_000)
          descricaoGerada = null
        }
        if (acao.acao === "encerrar") {
          if (!t.arquivada_em) patch.arquivada_em = new Date().toISOString()
        } else {
          if (acao.desarquivar && t.arquivada_em) patch.arquivada_em = null
          if (status === "realizada" && !t.concluida_em) patch.concluida_em = new Date().toISOString()
        }
        await repo.atualizarTarefa(tarefaId, patch)
        const evento_ =
          acao.acao === "encerrar" ? `reuniao_${status}` :
          plano.anterior ? "reuniao_reagendada" : "reuniao_atualizada"
        await repo.registrarAtividade(tarefaId, evento_, {
          origem,
          booking_uid: evento.uid,
          status,
          ...(acao.acao === "encerrar" && evento.motivoCancelamento ? { motivo: evento.motivoCancelamento } : {}),
          ...(patch.prazo_em ? { prazo: { para: patch.prazo_em, hora: patch.prazo_hora } } : {}),
        }, atorId)
        await repo.ping(tarefaId)
        // Quem cancelou pelo Workspace não precisa ser avisado do próprio clique.
        const destinatario = responsavelId && responsavelId !== atorId ? [responsavelId] : []
        if (destinatario.length > 0 && (acao.acao === "encerrar" || plano.anterior)) {
          await repo.notificar(
            destinatario,
            acao.acao === "encerrar" ? `Reunião ${status === "rejeitada" ? "recusada" : "cancelada"}` : "Reunião reagendada",
            `${evento.participante.nome}${inicio ? ` — ${dataHoraBRLegivel(inicio)}` : ""}.`,
            tarefaId
          )
        }
      }
    }

    await repo.atualizarAgendamento(
      evento.uid,
      { tarefa_id: tarefaId, descricao_gerada: descricaoGerada, sync_status: avisos.length > 0 ? "pendente" : "ok", sync_erro: avisos.length > 0 ? avisos.join(" ") : null },
      status
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await repo.atualizarAgendamento(evento.uid, { sync_status: "erro", sync_erro: msg.slice(0, 500) }, status)
    throw e
  }

  for (const a of avisos) await repo.log("aviso", "processar", a, { booking_uid: evento.uid })
  return { ignorado: false, resultado: plano.resultado, tarefaId, avisos }
}

/**
 * Termina um encerramento que ficou pela metade: o booking já está
 * cancelado/recusado no nosso registro, mas a tarefa continua com cara de
 * reunião ativa (não arquivada ou sem o "[Cancelada]" no título).
 *
 * Origem real (2026-10-21): a tarefa foi pra lixeira do Workspace minutos
 * antes do cancelamento no Cal.com; a leitura antiga ignorava a lixeira, o
 * webhook achou que a tarefa "não existia" e não encerrou nada. Chamado pela
 * reentrega do webhook e pelo "Sincronizar agora". Idempotente.
 */
export async function repararEncerramento(
  repo: RepoReunioes,
  uid: string
): Promise<{ reparado: boolean; resultado: string }> {
  const ag = await repo.buscarAgendamento(uid)
  if (!ag || (ag.status !== "cancelada" && ag.status !== "rejeitada")) {
    return { reparado: false, resultado: "nada a reparar" }
  }
  const marcarOk = () => repo.atualizarAgendamento(uid, { sync_status: "ok", sync_erro: null }, ag.status)

  if (!ag.tarefa_id || (await repo.outroAtivoNaTarefa(ag.tarefa_id, uid))) {
    await marcarOk()
    return { reparado: false, resultado: "sem tarefa a encerrar" }
  }
  const t = await repo.lerTarefa(ag.tarefa_id)
  if (!t) {
    await marcarOk()
    return { reparado: false, resultado: "tarefa apagada de vez" }
  }

  const titulo = ag.inicio ? tituloReuniao(ag.inicio, ag.participante_nome ?? "Participante", ag.status) : t.titulo
  if (t.arquivada_em && t.titulo === titulo) {
    await marcarOk()
    return { reparado: false, resultado: "já encerrada" }
  }

  const patch: Record<string, unknown> = { versao: t.versao + 1, titulo }
  if (!t.arquivada_em) patch.arquivada_em = new Date().toISOString()
  await repo.atualizarTarefa(ag.tarefa_id, patch)
  await repo.registrarAtividade(ag.tarefa_id, `reuniao_${ag.status}`, { origem: "calcom", booking_uid: uid, status: ag.status, reparo: true })
  await repo.ping(ag.tarefa_id)
  await marcarOk()
  return { reparado: true, resultado: `encerramento concluído (reunião ${ag.status})` }
}
