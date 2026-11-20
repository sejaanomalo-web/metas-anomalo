// =============================================================================
// Reuniões — LEITURAS da aba Reuniões. Só servidor.
// =============================================================================

import { getSupabaseAdmin } from "./supabase"
import { calcomConfigurado, calListarEventTypes, CONTA_PRINCIPAL, nomeEnvApiKey, nomeEnvWebhookSecret, webhookSecretConfigurado } from "./calcom"
import { lerIntegracoes, rotuloConta, type Integracao } from "./reunioes-sync"
import type {
  AgendamentoTela,
  DisponibilidadeTela,
  EstadoConexao,
  EventTypeExterno,
  EventoWebhookTela,
  IntegracaoTela,
  LogTela,
  PainelReunioes,
  TipoTela,
} from "./reunioes-tipos"

export * from "./reunioes-tipos"

const COLUNAS_AGEND =
  "id, booking_uid, status, inicio, fim, participante_nome, participante_email, participante_telefone, " +
  "origem_comercial, link_reuniao, local_rotulo, tarefa_id, sync_status, sync_erro, tipo_id, responsavel_id"

function estadoDe(i: Integracao | null, chave: string): EstadoConexao {
  if (!calcomConfigurado(chave)) return "nao_configurado"
  if (!i) return "pendente"
  if (i.status === "desconectado") return "desconectado"
  if (i.status === "conectado" && !i.webhook_id) return "pendente"
  return i.status
}

export function integracaoParaTela(i: Integracao | null): IntegracaoTela {
  const chave = i?.chave ?? CONTA_PRINCIPAL
  return {
    id: i?.id ?? "",
    chave,
    rotulo: i ? rotuloConta(i) : "Anômalo Hub",
    multi: i?.multi ?? false,
    bloquearOutrasContas: i?.bloquear_outras_contas ?? true,
    estado: estadoDe(i, chave),
    sincronizacaoAtiva: i?.sincronizacao_ativa ?? false,
    contaUsername: i?.conta_username ?? null,
    contaNome: i?.conta_nome ?? null,
    contaEmail: i?.conta_email ?? null,
    webhookRegistrado: Boolean(i?.webhook_id),
    feedIcsConectado: Boolean(i?.ics_credencial_id),
    ultimoTesteEm: i?.ultimo_teste_em ?? null,
    ultimoTesteOk: i?.ultimo_teste_ok ?? null,
    ultimaSincronizacaoEm: i?.ultima_sincronizacao_em ?? null,
    ultimoErro: i?.ultimo_erro ?? null,
    env: {
      apiKey: calcomConfigurado(chave),
      webhookSecret: webhookSecretConfigurado(chave),
      icsToken: (process.env.REUNIOES_ICS_TOKEN ?? "").length >= 24,
    },
    envNomes: { apiKey: nomeEnvApiKey(chave), webhookSecret: nomeEnvWebhookSecret(chave) },
  }
}

/** Ordem de "quão bem" está uma conta — o resumo mostra a melhor. */
const PESO: Record<EstadoConexao, number> = {
  conectado: 5, sincronizando: 4, erro: 3, pendente: 2, desconectado: 1, nao_configurado: 0,
}

export function resumoIntegracoes(lista: IntegracaoTela[]): IntegracaoTela {
  if (lista.length === 0) return integracaoParaTela(null)
  return [...lista].sort((a, b) => PESO[b.estado] - PESO[a.estado])[0]
}

const VAZIO: PainelReunioes = {
  migracaoAplicada: false,
  integracao: integracaoParaTela(null),
  integracoes: [],
  tipos: [],
  disponibilidades: [],
  proximas: [],
  encerradas: [],
  pendencias: [],
  eventosComErro: 0,
  eventos: [],
  log: [],
  usuarios: [],
  contextos: [],
  eventTypesExternos: {},
  eventTypesErro: {},
}

/**
 * Tudo que a aba precisa, numa ida. `comEventTypes` liga a consulta à API do
 * Cal.com (só na seção Tipos — o resto da aba não espera rede externa).
 * `verDetalhesTecnicos` = admin: só ele vê erros e eventos de webhook.
 */
export async function carregarPainelReunioes(opts: {
  comEventTypes: boolean
  verDetalhesTecnicos: boolean
}): Promise<PainelReunioes> {
  const db = getSupabaseAdmin()
  if (!db) return VAZIO

  // Sonda a migration: sem a tabela, a aba mostra o passo pendente em vez de
  // quebrar.
  const sonda = await db.from("reunioes_tipos").select("id", { count: "exact", head: true })
  if (sonda.error) return VAZIO

  const agora = new Date()
  const desde = new Date(agora.getTime() - 2 * 3_600_000).toISOString()
  const trintaDias = new Date(agora.getTime() - 30 * 86_400_000).toISOString()

  // Contas primeiro: dizem se a migration de várias contas existe (e, com
  // ela, a coluna integracao_id nas reuniões).
  const contas = await lerIntegracoes(db)
  const multi = contas.some((c) => c.multi)
  const colAgend = multi ? `${COLUNAS_AGEND}, integracao_id` : COLUNAS_AGEND

  const [tipos, disps, proximas, encerradas, pendencias, eventosErro, eventos, log, usuarios, contextos] =
    await Promise.all([
      db.from("reunioes_tipos").select("*").order("ordem").order("nome"),
      db.from("reunioes_disponibilidades").select("*").order("created_at"),
      db.from("reunioes_agendamentos").select(colAgend)
        .in("status", ["solicitada", "confirmada"]).gte("inicio", desde).order("inicio").limit(60),
      db.from("reunioes_agendamentos").select(colAgend)
        .in("status", ["cancelada", "rejeitada", "realizada"]).gte("updated_at", trintaDias)
        .order("inicio", { ascending: false }).limit(30),
      db.from("reunioes_agendamentos").select(colAgend)
        .neq("sync_status", "ok").order("updated_at", { ascending: false }).limit(30),
      db.from("reunioes_webhook_eventos").select("id", { count: "exact", head: true }).eq("status", "erro"),
      opts.verDetalhesTecnicos
        ? db.from("reunioes_webhook_eventos")
            .select("id, recebido_em, gatilho, status, resultado, erro, tentativas")
            .order("recebido_em", { ascending: false }).limit(40)
        : Promise.resolve({ data: [] }),
      opts.verDetalhesTecnicos
        ? db.from("reunioes_sync_log").select("id, nivel, acao, mensagem, created_at")
            .order("created_at", { ascending: false }).limit(40)
        : Promise.resolve({ data: [] }),
      db.from("usuarios").select("id, nome").eq("ativo", true).order("nome"),
      db.from("ws_contextos").select("id, nome, tipo").is("arquivado_em", null).order("nome"),
    ])

  const principal = contas.find((c) => c.chave === CONTA_PRINCIPAL) ?? null
  // Sem migration (ou registro antigo) não há integracao_id: é da principal.
  const contaDe = (id: string | null | undefined) => (id ?? principal?.id ?? null)
  const rotuloPorId = new Map(contas.map((c) => [c.id, rotuloConta(c)]))

  const listaTipos = ((tipos.data ?? []) as unknown as (TipoTela & { integracao_id?: string | null })[])
    .map((t) => ({ ...t, integracao_id: contaDe(t.integracao_id) }))
  const nomeTipo = new Map(listaTipos.map((t) => [t.id, t.nome]))
  const listaUsuarios = (usuarios.data ?? []) as { id: string; nome: string }[]
  const nomeUsuario = new Map(listaUsuarios.map((u) => [u.id, u.nome]))

  const paraTela = (rows: unknown): AgendamentoTela[] =>
    ((rows ?? []) as (AgendamentoTela & { tipo_id: string | null; responsavel_id: string | null; integracao_id?: string | null })[]).map(({ integracao_id, ...a }) => ({
      ...a,
      conta_rotulo: multi && contas.length > 1 ? rotuloPorId.get(contaDe(integracao_id) ?? "") ?? null : null,
      tipo_nome: a.tipo_id ? nomeTipo.get(a.tipo_id) ?? null : null,
      responsavel_nome: a.responsavel_id ? nomeUsuario.get(a.responsavel_id) ?? null : null,
      sync_erro: opts.verDetalhesTecnicos ? a.sync_erro : a.sync_erro ? "Pendente de configuração." : null,
    }))

  // Event types de CADA conta, em paralelo (uma conta fora do ar não
  // atrasa nem esconde a outra).
  const eventTypesExternos: Record<string, EventTypeExterno[]> = {}
  const eventTypesErro: Record<string, string> = {}
  if (opts.comEventTypes) {
    await Promise.all(
      contas
        .filter((c) => calcomConfigurado(c.chave) && c.status !== "desconectado")
        .map(async (c) => {
          try {
            const ets = await calListarEventTypes(c.chave, c.conta_username ?? undefined)
            eventTypesExternos[c.id] = ets.map((e) => ({
              id: e.id,
              title: e.title,
              slug: e.slug,
              lengthInMinutes: e.lengthInMinutes,
              bookingUrl: e.bookingUrl ?? null,
            }))
          } catch (e) {
            eventTypesErro[c.id] = e instanceof Error ? e.message : String(e)
          }
        })
    )
  }

  const integracoes = contas.map(integracaoParaTela)
  return {
    migracaoAplicada: true,
    integracao: resumoIntegracoes(integracoes),
    integracoes,
    tipos: listaTipos,
    disponibilidades: ((disps.data ?? []) as (DisponibilidadeTela & { integracao_id?: string | null })[])
      .map((d) => ({ ...d, integracao_id: contaDe(d.integracao_id) })),
    proximas: paraTela(proximas.data),
    encerradas: paraTela(encerradas.data),
    pendencias: paraTela(pendencias.data),
    eventosComErro: eventosErro.count ?? 0,
    eventos: (eventos.data ?? []) as EventoWebhookTela[],
    log: (log.data ?? []) as LogTela[],
    usuarios: listaUsuarios,
    contextos: ((contextos.data ?? []) as { id: string; nome: string; tipo: string }[])
      .filter((c) => c.tipo === "cliente" || c.tipo === "empresa" || c.tipo === "interno" || c.tipo === "geral")
      .map(({ id, nome }) => ({ id, nome })),
    eventTypesExternos,
    eventTypesErro,
  }
}

/** Reunião vinculada a uma tarefa, como o detalhe da tarefa precisa. */
export interface ReuniaoDaTarefa {
  /** id INTERNO do agendamento — é o que o botão "Cancelar reunião" envia. */
  id: string
  status: AgendamentoTela["status"]
  link: string | null
  local: string | null
  inicio: string | null
  participante: string | null
  tipo: string | null
  responsavelId: string | null
}

/**
 * Para o detalhe da tarefa: a reunião vinculada (se houver) e o bloqueio.
 *
 * Reagendamento deixa DUAS linhas apontando pra mesma tarefa (o UID antigo
 * 'reagendada' e o novo). Vale a ativa; sem ativa, a mais recente.
 */
export async function reuniaoDaTarefa(tarefaId: string): Promise<{
  reuniao: ReuniaoDaTarefa | null
  bloqueio: { duracao_min: number } | null
  disponivel: boolean
}> {
  const db = getSupabaseAdmin()
  if (!db) return { reuniao: null, bloqueio: null, disponivel: false }
  const [r, b] = await Promise.all([
    db.from("reunioes_agendamentos")
      .select("id, status, link_reuniao, local_rotulo, inicio, participante_nome, tipo_id, responsavel_id, updated_at")
      .eq("tarefa_id", tarefaId)
      .order("updated_at", { ascending: false })
      .limit(5),
    db.from("ws_tarefa_bloqueios").select("duracao_min").eq("tarefa_id", tarefaId).maybeSingle(),
  ])
  // Tabelas ausentes (migration não aplicada) → o bloco simplesmente não aparece.
  if (r.error || b.error) return { reuniao: null, bloqueio: null, disponivel: false }
  type Linha = {
    id: string; status: AgendamentoTela["status"]; link_reuniao: string | null; local_rotulo: string | null
    inicio: string | null; participante_nome: string | null; tipo_id: string | null; responsavel_id: string | null
  }
  const linhas = (r.data ?? []) as Linha[]
  const linha = linhas.find((l) => l.status === "confirmada" || l.status === "solicitada") ?? linhas[0]
  let tipo: string | null = null
  if (linha?.tipo_id) {
    const { data } = await db.from("reunioes_tipos").select("nome").eq("id", linha.tipo_id).maybeSingle()
    tipo = (data?.nome as string | undefined) ?? null
  }
  return {
    reuniao: linha
      ? {
          id: linha.id, status: linha.status, link: linha.link_reuniao, local: linha.local_rotulo, inicio: linha.inicio,
          participante: linha.participante_nome, tipo, responsavelId: linha.responsavel_id,
        }
      : null,
    bloqueio: (b.data as { duracao_min: number } | null) ?? null,
    disponivel: true,
  }
}
