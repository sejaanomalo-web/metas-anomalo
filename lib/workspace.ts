// =============================================================================
// Workspace — tipos e LEITURAS. Server-only (usa service_role).
// =============================================================================
//
// Espelha o padrão de lib/financeiro.ts: tipos escritos à mão (não há
// `supabase gen types` neste repo), leituras puras aqui e escritas em
// lib/workspace-actions.ts.
//
// REGRA ESTRUTURAL: a tarefa existe uma vez só em ws_tarefas. Toda "visão"
// (lista, calendário, cliente, minhas) é uma CONSULTA diferente sobre a mesma
// linha — nunca uma cópia. Ver docs/WORKSPACE-PLANO.md.

import { getSupabaseAdmin } from "./supabase"
import { hojeISO, rangeDoMes, somarDiasISO } from "./workspace-datas"
import type {
  Aba,
  Comentario,
  Contexto,
  EscopoNotas,
  EventoAtividade,
  FiltroTarefas,
  Nota,
  PreferenciaUsuario,
  Tarefa,
  TarefaComRelacoes,
} from "./workspace-tipos"

// Tipos e helpers puros vivem em workspace-tipos.ts (seguro pro browser) e
// sao reexportados aqui pra quem for server nao precisar saber da divisao.
export * from "./workspace-tipos"

export const COLUNAS_TAREFA =
  "id, titulo, descricao, tarefa_pai_id, responsavel_id, criado_por, prazo_em, " +
  "prazo_hora, inicio_em, prioridade, concluida_em, concluida_por, recorrencia, " +
  "ordem, versao, arquivada_em, excluida_em, created_at, updated_at"

export const COLUNAS_CONTEXTO =
  "id, nome, tipo, empresa_nome, cliente_id, cor, foto_url, grupo_id, ordem, arquivado_em"

// ============================================================
// Contextos
// ============================================================

export async function listarContextos(
  incluirArquivados = false
): Promise<Contexto[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  let q = supabase
    .from("ws_contextos")
    .select(COLUNAS_CONTEXTO)
    .order("ordem")
    .order("nome")
  if (!incluirArquivados) q = q.is("arquivado_em", null)
  const { data, error } = await q
  if (error) {
    console.error("[workspace] listarContextos error", error.message)
    return []
  }
  return (data ?? []) as Contexto[]
}

export async function getContexto(id: string): Promise<Contexto | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("ws_contextos")
    .select(COLUNAS_CONTEXTO)
    .eq("id", id)
    .maybeSingle()
  if (error || !data) return null
  return data as Contexto
}

/** Contexto de um cliente, se já existir. A criação sob demanda vive na
 *  action garantirContextoDoCliente (escrita não pertence a este módulo). */
export async function getContextoDoCliente(
  clienteId: string
): Promise<Contexto | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("ws_contextos")
    .select(COLUNAS_CONTEXTO)
    .eq("cliente_id", clienteId)
    .is("arquivado_em", null)
    .maybeSingle()
  if (error || !data) return null
  return data as Contexto
}

// ============================================================
// Tarefas
// ============================================================

/**
 * Enriquece um lote de tarefas com contextos, nome do responsável, progresso
 * de subtarefas e contagem de comentários — tudo em 4 queries fixas,
 * independente do tamanho do lote (nada de N+1).
 */
async function enriquecer(tarefas: Tarefa[]): Promise<TarefaComRelacoes[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase || tarefas.length === 0) {
    return tarefas.map((t) => ({
      ...t,
      contextos: [],
      responsavel_nome: null,
      responsavel_foto: null,
      subtarefas_total: 0,
      subtarefas_concluidas: 0,
      comentarios_total: 0,
    }))
  }
  const ids = tarefas.map((t) => t.id)
  // Só os responsáveis que APARECEM nesta página. Antes as duas consultas de
  // pessoa vinham sem filtro ("todos os usuários", "todas as preferências"):
  // funciona com 6 pessoas e piora sozinho conforme o time cresce, buscando
  // dezenas de linhas e fotos pra preencher três avatares.
  const responsaveis = Array.from(
    new Set(tarefas.map((t) => t.responsavel_id).filter((v): v is string => Boolean(v)))
  )

  const [vinculos, usuarios, subtarefas, comentarios, prefs] = await Promise.all([
    supabase
      .from("ws_tarefa_contextos")
      .select("tarefa_id, contexto_id, ws_contextos(id, nome, tipo, empresa_nome, cliente_id, cor, foto_url, grupo_id, ordem, arquivado_em)")
      .in("tarefa_id", ids),
    responsaveis.length > 0
      ? supabase.from("usuarios").select("id, nome").in("id", responsaveis)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    supabase
      .from("ws_tarefas")
      .select("tarefa_pai_id, concluida_em")
      .in("tarefa_pai_id", ids)
      .is("excluida_em", null),
    supabase.from("ws_comentarios").select("tarefa_id").in("tarefa_id", ids).is("excluido_em", null),
    responsaveis.length > 0
      ? supabase.from("ws_preferencias").select("usuario_id, foto_url").in("usuario_id", responsaveis)
      : Promise.resolve({ data: [] as { usuario_id: string; foto_url: string | null }[] }),
  ])

  const porTarefa = new Map<string, Contexto[]>()
  for (const v of (vinculos.data ?? []) as unknown as {
    tarefa_id: string
    ws_contextos: Contexto | Contexto[] | null
  }[]) {
    // O supabase-js tipa embed como array ou objeto dependendo da relação;
    // normaliza os dois casos.
    const ctx = Array.isArray(v.ws_contextos) ? v.ws_contextos[0] : v.ws_contextos
    if (!ctx) continue
    const lista = porTarefa.get(v.tarefa_id) ?? []
    lista.push(ctx)
    porTarefa.set(v.tarefa_id, lista)
  }

  const nomePorUsuario = new Map<string, string>()
  for (const u of (usuarios.data ?? []) as { id: string; nome: string }[]) {
    nomePorUsuario.set(u.id, u.nome)
  }

  const fotoPorUsuario = new Map<string, string>()
  for (const p of (prefs.data ?? []) as { usuario_id: string; foto_url: string | null }[]) {
    if (p.foto_url) fotoPorUsuario.set(p.usuario_id, p.foto_url)
  }

  const progresso = new Map<string, { total: number; feitas: number }>()
  for (const s of (subtarefas.data ?? []) as {
    tarefa_pai_id: string
    concluida_em: string | null
  }[]) {
    const p = progresso.get(s.tarefa_pai_id) ?? { total: 0, feitas: 0 }
    p.total += 1
    if (s.concluida_em) p.feitas += 1
    progresso.set(s.tarefa_pai_id, p)
  }

  const comentPorTarefa = new Map<string, number>()
  for (const c of (comentarios.data ?? []) as { tarefa_id: string }[]) {
    comentPorTarefa.set(c.tarefa_id, (comentPorTarefa.get(c.tarefa_id) ?? 0) + 1)
  }

  return tarefas.map((t) => {
    const p = progresso.get(t.id)
    return {
      ...t,
      contextos: (porTarefa.get(t.id) ?? []).sort((a, b) => a.ordem - b.ordem),
      responsavel_nome: t.responsavel_id
        ? nomePorUsuario.get(t.responsavel_id) ?? null
        : null,
      responsavel_foto: t.responsavel_id
        ? fotoPorUsuario.get(t.responsavel_id) ?? null
        : null,
      subtarefas_total: p?.total ?? 0,
      subtarefas_concluidas: p?.feitas ?? 0,
      comentarios_total: comentPorTarefa.get(t.id) ?? 0,
    }
  })
}

/**
 * Consulta principal — atende Lista, Minhas tarefas, Arquivo e a página do
 * cliente. Sempre paginada no servidor; nunca traz a tabela inteira pro
 * browser filtrar.
 *
 * Só tarefas de topo (tarefa_pai_id is null). Subtarefas aparecem dentro do
 * detalhe do pai, via listarSubtarefas.
 */
export async function listarTarefas(
  filtro: FiltroTarefas = {}
): Promise<{ tarefas: TarefaComRelacoes[]; temMais: boolean }> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { tarefas: [], temMais: false }

  const limite = Math.min(filtro.limite ?? 50, 200)
  const offset = filtro.offset ?? 0
  const situacao = filtro.situacao ?? "pendentes"

  // Contexto é N:N (ws_tarefa_contextos) e entra como JOIN no próprio select,
  // não como lista de ids. A versão anterior lia TODOS os tarefa_id do vínculo
  // e mandava um `.in("id", [...])`: com algumas centenas de tarefas no
  // cliente, o querystring do PostgREST passa do limite aceito, a resposta vira
  // 414 e a página do cliente aparecia VAZIA, sem erro na tela. Com `!inner` o
  // banco resolve em uma query, sem limite de tamanho — e o embed é aninhado,
  // então nenhuma tarefa vem duplicada.
  const selecao = filtro.contextoId
    ? `${COLUNAS_TAREFA}, ws_tarefa_contextos!inner(contexto_id)`
    : COLUNAS_TAREFA

  let q = supabase.from("ws_tarefas").select(selecao).is("tarefa_pai_id", null)

  if (filtro.contextoId) {
    q = q.eq("ws_tarefa_contextos.contexto_id", filtro.contextoId)
  }

  if (filtro.incluirArquivadas) {
    // Aba Arquivo: mostra arquivadas e excluídas (soft), nunca some nada.
  } else {
    q = q.is("excluida_em", null).is("arquivada_em", null)
  }

  if (situacao === "pendentes") q = q.is("concluida_em", null)
  if (situacao === "concluidas") q = q.not("concluida_em", "is", null)

  if (filtro.responsavelId) q = q.eq("responsavel_id", filtro.responsavelId)
  if (filtro.prazoDe) q = q.gte("prazo_em", filtro.prazoDe)
  if (filtro.prazoAte) q = q.lte("prazo_em", filtro.prazoAte)
  if (filtro.apenasSemPrazo) q = q.is("prazo_em", null)
  if (filtro.apenasAtrasadas) {
    q = q.lt("prazo_em", hojeISO()).is("concluida_em", null)
  }
  if (filtro.busca && filtro.busca.trim() !== "") {
    // ILIKE com escape dos coringas do LIKE: sem isso, um '%' digitado pelo
    // usuário viraria "qualquer coisa" e a busca traria a tabela inteira.
    // Duas coisas precisam ser neutralizadas aqui, por motivos diferentes:
    //
    //  1. % e _ são coringas do LIKE. Um '%' digitado viraria "qualquer
    //     coisa" e a busca traria a tabela inteira.
    //  2. vírgula e parênteses são a SINTAXE do filtro `or` do PostgREST
    //     (`or=(a.ilike.x,b.ilike.x)`). Buscar "reunião, alinhamento" quebraria
    //     a query em filtros inválidos e o Supabase devolveria 400 — a busca
    //     apareceria como "nenhum resultado" em vez de erro, que é pior.
    const termo = filtro.busca
      .trim()
      .replace(/[(),]/g, " ")
      .replace(/[%_\\]/g, (c) => `\\${c}`)
      .trim()
    if (termo !== "") {
      q = q.or(`titulo.ilike.%${termo}%,descricao.ilike.%${termo}%`)
    }
  }

  // Pendentes primeiro por prazo (sem prazo no fim); concluídas, mais
  // recentes primeiro.
  if (situacao === "concluidas") {
    q = q.order("concluida_em", { ascending: false })
  } else {
    q = q
      .order("prazo_em", { ascending: true, nullsFirst: false })
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: false })
  }

  // Pede 1 a mais que o limite pra saber se existe próxima página sem count.
  const { data, error } = await q.range(offset, offset + limite)
  if (error) {
    console.error("[workspace] listarTarefas error", error.message)
    return { tarefas: [], temMais: false }
  }
  // O embed do JOIN vem junto na linha; tira ele pra que o objeto entregue às
  // telas seja exatamente uma Tarefa, sem um campo fantasma viajando adiante.
  // O `select` é montado em runtime (com ou sem o JOIN), então o supabase-js
  // não consegue inferir a linha — daí o unknown antes do shape final.
  const brutas = (data ?? []) as unknown as Record<string, unknown>[]
  const linhas = brutas.map((linha) => {
    const { ws_tarefa_contextos: _embed, ...resto } = linha
    return resto as unknown as Tarefa
  })
  const temMais = linhas.length > limite
  const pagina = temMais ? linhas.slice(0, limite) : linhas
  return { tarefas: await enriquecer(pagina), temMais }
}

export async function getTarefa(id: string): Promise<TarefaComRelacoes | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("ws_tarefas")
    .select(COLUNAS_TAREFA)
    .eq("id", id)
    .maybeSingle()
  if (error || !data) return null
  const [t] = await enriquecer([data as unknown as Tarefa])
  return t ?? null
}

export async function listarSubtarefas(
  tarefaPaiId: string
): Promise<Tarefa[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("ws_tarefas")
    .select(COLUNAS_TAREFA)
    .eq("tarefa_pai_id", tarefaPaiId)
    .is("excluida_em", null)
    .order("ordem")
    .order("created_at")
  if (error) {
    console.error("[workspace] listarSubtarefas error", error.message)
    return []
  }
  return (data ?? []) as unknown as Tarefa[]
}

/**
 * Tarefas de um mês para o calendário. É uma VIEW derivada de prazo_em — não
 * existe vínculo "tarefa ↔ calendário". Concluídas entram (a UI decide se
 * mostra em cinza ou esconde por filtro).
 */
export async function listarTarefasDoMes(
  ano: number,
  mes: number,
  filtro: Pick<FiltroTarefas, "responsavelId" | "contextoId" | "situacao"> = {}
): Promise<TarefaComRelacoes[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { inicio, fim } = rangeDoMes(ano, mes)
  // A grade mostra dias vizinhos das semanas de borda — busca com folga de 7
  // dias dos dois lados pra esses dias não aparecerem vazios.
  const de = somarDiasISO(inicio, -7)
  const ate = somarDiasISO(fim, 7)

  let q = supabase
    .from("ws_tarefas")
    .select(COLUNAS_TAREFA)
    .is("tarefa_pai_id", null)
    .is("excluida_em", null)
    .is("arquivada_em", null)
    .gte("prazo_em", de)
    .lte("prazo_em", ate)
    .order("prazo_hora", { ascending: true, nullsFirst: true })
    .order("ordem")

  if (filtro.responsavelId) q = q.eq("responsavel_id", filtro.responsavelId)
  if (filtro.situacao === "pendentes") q = q.is("concluida_em", null)

  if (filtro.contextoId) {
    const { data: vinc } = await supabase
      .from("ws_tarefa_contextos")
      .select("tarefa_id")
      .eq("contexto_id", filtro.contextoId)
    const ids = (vinc ?? []).map((v) => (v as { tarefa_id: string }).tarefa_id)
    if (ids.length === 0) return []
    q = q.in("id", ids)
  }

  const { data, error } = await q.limit(500)
  if (error) {
    console.error("[workspace] listarTarefasDoMes error", error.message)
    return []
  }
  return enriquecer((data ?? []) as unknown as Tarefa[])
}

/**
 * Tarefas com prazo dentro de um intervalo fechado [de, ate] — a consulta da
 * visão semanal do calendário. Mesmas regras do mês: view derivada de
 * prazo_em, concluídas entram (a UI decide o que fazer com elas).
 */
export async function listarTarefasDoIntervalo(
  de: string,
  ate: string,
  filtro: Pick<FiltroTarefas, "responsavelId" | "contextoId" | "situacao"> = {}
): Promise<TarefaComRelacoes[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  let q = supabase
    .from("ws_tarefas")
    .select(COLUNAS_TAREFA)
    .is("tarefa_pai_id", null)
    .is("excluida_em", null)
    .is("arquivada_em", null)
    .gte("prazo_em", de)
    .lte("prazo_em", ate)
    .order("prazo_hora", { ascending: true, nullsFirst: true })
    .order("ordem")

  if (filtro.responsavelId) q = q.eq("responsavel_id", filtro.responsavelId)
  if (filtro.situacao === "pendentes") q = q.is("concluida_em", null)

  if (filtro.contextoId) {
    const { data: vinc } = await supabase
      .from("ws_tarefa_contextos")
      .select("tarefa_id")
      .eq("contexto_id", filtro.contextoId)
    const ids = (vinc ?? []).map((v) => (v as { tarefa_id: string }).tarefa_id)
    if (ids.length === 0) return []
    q = q.in("id", ids)
  }

  const { data, error } = await q.limit(500)
  if (error) {
    console.error("[workspace] listarTarefasDoIntervalo error", error.message)
    return []
  }
  return enriquecer((data ?? []) as unknown as Tarefa[])
}

/** Bandeja "Sem data" do calendário. */
export async function listarTarefasSemPrazo(
  limite = 50
): Promise<TarefaComRelacoes[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("ws_tarefas")
    .select(COLUNAS_TAREFA)
    .is("tarefa_pai_id", null)
    .is("prazo_em", null)
    .is("concluida_em", null)
    .is("excluida_em", null)
    .is("arquivada_em", null)
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) {
    console.error("[workspace] listarTarefasSemPrazo error", error.message)
    return []
  }
  return enriquecer((data ?? []) as unknown as Tarefa[])
}

// ============================================================
// Minhas tarefas — os baldes da aba
// ============================================================

export interface BaldesMinhasTarefas {
  atrasadas: TarefaComRelacoes[]
  hoje: TarefaComRelacoes[]
  proximos7: TarefaComRelacoes[]
  semPrazo: TarefaComRelacoes[]
  concluidasRecentes: TarefaComRelacoes[]
}

export async function getMinhasTarefas(
  usuarioId: string
): Promise<BaldesMinhasTarefas> {
  const supabase = getSupabaseAdmin()
  const vazio: BaldesMinhasTarefas = {
    atrasadas: [], hoje: [], proximos7: [], semPrazo: [], concluidasRecentes: [],
  }
  if (!supabase) return vazio

  const hoje = hojeISO()
  const daquiA7 = somarDiasISO(hoje, 7)
  const haSete = somarDiasISO(hoje, -7)

  const [pendentes, concluidas] = await Promise.all([
    supabase
      .from("ws_tarefas")
      .select(COLUNAS_TAREFA)
      .eq("responsavel_id", usuarioId)
      .is("concluida_em", null)
      .is("excluida_em", null)
      .is("arquivada_em", null)
      .order("prazo_em", { ascending: true, nullsFirst: false })
      .limit(300),
    supabase
      .from("ws_tarefas")
      .select(COLUNAS_TAREFA)
      .eq("responsavel_id", usuarioId)
      .not("concluida_em", "is", null)
      .is("excluida_em", null)
      .gte("concluida_em", `${haSete}T00:00:00Z`)
      .order("concluida_em", { ascending: false })
      .limit(50),
  ])

  const todas = await enriquecer([
    ...((pendentes.data ?? []) as unknown as Tarefa[]),
    ...((concluidas.data ?? []) as unknown as Tarefa[]),
  ])

  const out: BaldesMinhasTarefas = { ...vazio, atrasadas: [], hoje: [], proximos7: [], semPrazo: [], concluidasRecentes: [] }
  for (const t of todas) {
    if (t.concluida_em) { out.concluidasRecentes.push(t); continue }
    if (!t.prazo_em) { out.semPrazo.push(t); continue }
    if (t.prazo_em < hoje) { out.atrasadas.push(t); continue }
    if (t.prazo_em === hoje) { out.hoje.push(t); continue }
    if (t.prazo_em <= daquiA7) out.proximos7.push(t)
  }
  return out
}

// ============================================================
// Contagens por contexto (aba Clientes)
// ============================================================

export interface ContagemContexto {
  contexto_id: string
  pendentes: number
  atrasadas: number
}

/**
 * Pendentes e atrasadas por contexto, em 2 queries — não uma por cliente.
 */
export async function contarPorContexto(): Promise<Map<string, ContagemContexto>> {
  const out = new Map<string, ContagemContexto>()
  const supabase = getSupabaseAdmin()
  if (!supabase) return out

  const hoje = hojeISO()
  const { data: pendentes } = await supabase
    .from("ws_tarefas")
    .select("id, prazo_em")
    .is("tarefa_pai_id", null)
    .is("concluida_em", null)
    .is("excluida_em", null)
    .is("arquivada_em", null)
    .limit(5000)

  const linhas = (pendentes ?? []) as { id: string; prazo_em: string | null }[]
  if (linhas.length === 0) return out
  const atrasadaPorId = new Map(
    linhas.map((t) => [t.id, Boolean(t.prazo_em && t.prazo_em < hoje)])
  )

  const { data: vinc } = await supabase
    .from("ws_tarefa_contextos")
    .select("tarefa_id, contexto_id")
    .in("tarefa_id", [...atrasadaPorId.keys()])

  for (const v of (vinc ?? []) as { tarefa_id: string; contexto_id: string }[]) {
    const atual = out.get(v.contexto_id) ?? {
      contexto_id: v.contexto_id, pendentes: 0, atrasadas: 0,
    }
    atual.pendentes += 1
    if (atrasadaPorId.get(v.tarefa_id)) atual.atrasadas += 1
    out.set(v.contexto_id, atual)
  }
  return out
}

// ============================================================
// Comentários, seguidores e histórico
// ============================================================

export async function listarComentarios(tarefaId: string): Promise<Comentario[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("ws_comentarios")
    .select(
      "id, tarefa_id, autor_id, corpo, created_at, updated_at, autor_nome_hist, usuarios(nome)"
    )
    .eq("tarefa_id", tarefaId)
    .is("excluido_em", null)
    .order("created_at")
  if (error) {
    console.error("[workspace] listarComentarios error", error.message)
    return []
  }

  // Foto de perfil do autor (ws_preferencias) — 1 query pro lote inteiro,
  // pra o avatar do comentário ser o MESMO que aparece no calendário.
  const linhas = (data ?? []) as unknown as (Comentario & {
    usuarios: { nome: string } | { nome: string }[] | null
    autor_nome_hist: string | null
  })[]
  const autores = [...new Set(linhas.map((c) => c.autor_id).filter(Boolean))] as string[]
  const fotoPorUsuario = new Map<string, string>()
  if (autores.length > 0) {
    const { data: prefs } = await supabase
      .from("ws_preferencias")
      .select("usuario_id, foto_url")
      .in("usuario_id", autores)
    for (const p of (prefs ?? []) as { usuario_id: string; foto_url: string | null }[]) {
      if (p.foto_url) fotoPorUsuario.set(p.usuario_id, p.foto_url)
    }
  }

  return linhas.map((c) => {
    const u = Array.isArray(c.usuarios) ? c.usuarios[0] : c.usuarios
    // Conta viva manda no nome (a pessoa pode ter se renomeado depois). Só
    // quando ela não existe mais é que vale o nome preservado na exclusão —
    // sem ele o comentário viraria um "—" anônimo no meio da conversa.
    const nomeVivo = u?.nome ?? null
    return {
      id: c.id,
      tarefa_id: c.tarefa_id,
      autor_id: c.autor_id,
      autor_nome: nomeVivo ?? c.autor_nome_hist ?? null,
      autor_removido: nomeVivo === null && c.autor_nome_hist !== null,
      autor_foto: c.autor_id ? fotoPorUsuario.get(c.autor_id) ?? null : null,
      corpo: c.corpo,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }
  })
}

export async function listarSeguidores(
  tarefaId: string
): Promise<{ usuario_id: string; nome: string }[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("ws_seguidores")
    .select("usuario_id, usuarios(nome)")
    .eq("tarefa_id", tarefaId)
  if (error) {
    console.error("[workspace] listarSeguidores error", error.message)
    return []
  }
  return ((data ?? []) as unknown as {
    usuario_id: string
    usuarios: { nome: string } | { nome: string }[] | null
  }[]).map((s) => {
    const u = Array.isArray(s.usuarios) ? s.usuarios[0] : s.usuarios
    return { usuario_id: s.usuario_id, nome: u?.nome ?? "—" }
  })
}

export async function listarAtividade(
  tarefaId: string,
  limite = 100
): Promise<EventoAtividade[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("ws_atividade")
    .select("id, tarefa_id, ator_id, evento, mudanca, created_at, usuarios(nome)")
    .eq("tarefa_id", tarefaId)
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) {
    console.error("[workspace] listarAtividade error", error.message)
    return []
  }
  return ((data ?? []) as unknown as (EventoAtividade & {
    usuarios: { nome: string } | { nome: string }[] | null
  })[]).map((e) => {
    const u = Array.isArray(e.usuarios) ? e.usuarios[0] : e.usuarios
    return {
      id: e.id,
      tarefa_id: e.tarefa_id,
      ator_id: e.ator_id,
      ator_nome: u?.nome ?? null,
      evento: e.evento,
      mudanca: e.mudanca,
      created_at: e.created_at,
    }
  })
}

/**
 * Usuários ativos — opções de responsável e de menção.
 *
 * Traz `foto_url` (de ws_preferencias) porque o seletor de responsável mostra
 * avatar na lista: com o time todo tendo nome curto e parecido, a foto é o que
 * a pessoa reconhece antes de ler. Duas queries em paralelo em vez de embed:
 * ws_preferencias pode não existir antes da migration da Fase 2, e nesse caso
 * a lista de nomes precisa continuar funcionando.
 */
export async function listarUsuariosAtivos(): Promise<
  { id: string; nome: string; email: string; foto_url: string | null }[]
> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const [{ data, error }, prefs] = await Promise.all([
    supabase.from("usuarios").select("id, nome, email").eq("ativo", true).order("nome"),
    supabase.from("ws_preferencias").select("usuario_id, foto_url"),
  ])
  if (error) {
    console.error("[workspace] listarUsuariosAtivos error", error.message)
    return []
  }
  const fotos = new Map<string, string>()
  for (const p of (prefs.data ?? []) as { usuario_id: string; foto_url: string | null }[]) {
    if (p.foto_url) fotos.set(p.usuario_id, p.foto_url)
  }
  return ((data ?? []) as { id: string; nome: string; email: string }[]).map((u) => ({
    ...u,
    foto_url: fotos.get(u.id) ?? null,
  }))
}

// ============================================================
// Abas customizadas (Fase 2)
// ============================================================

const COLUNAS_ABA = "id, nome, tipo, contexto_id, ordem"

export async function listarAbas(): Promise<Aba[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("ws_abas")
    .select(COLUNAS_ABA)
    .is("excluida_em", null)
    .order("ordem")
    .order("created_at")
  if (error) {
    // Antes da migration da Fase 2 a tabela não existe — a régua só mostra
    // as abas fixas, sem quebrar a página.
    return []
  }
  return (data ?? []) as Aba[]
}

export async function getAba(id: string): Promise<Aba | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("ws_abas")
    .select(COLUNAS_ABA)
    .eq("id", id)
    .is("excluida_em", null)
    .maybeSingle()
  if (error || !data) return null
  return data as Aba
}

// ============================================================
// Notas (Fase 2)
// ============================================================

function filtroEscopo(escopo: EscopoNotas): { coluna: string; valor: string } {
  if ("contextoId" in escopo) return { coluna: "contexto_id", valor: escopo.contextoId }
  if ("abaId" in escopo) return { coluna: "aba_id", valor: escopo.abaId }
  return { coluna: "fixa", valor: escopo.fixa }
}

export async function listarNotas(escopo: EscopoNotas): Promise<Nota[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { coluna, valor } = filtroEscopo(escopo)
  const { data, error } = await supabase
    .from("ws_notas")
    .select("id, titulo, corpo_html, updated_at")
    .eq(coluna, valor)
    .is("excluida_em", null)
    .order("updated_at", { ascending: false })
  if (error) return []
  return (data ?? []) as Nota[]
}

// ============================================================
// Preferências por usuário (Fase 2)
// ============================================================

export async function getPreferencia(
  usuarioId: string
): Promise<PreferenciaUsuario> {
  const padrao: PreferenciaUsuario = {
    usuario_id: usuarioId,
    foto_url: null,
    modo_cor: "colorido",
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return padrao
  const { data, error } = await supabase
    .from("ws_preferencias")
    .select("usuario_id, foto_url, modo_cor")
    .eq("usuario_id", usuarioId)
    .maybeSingle()
  if (error || !data) return padrao
  return data as PreferenciaUsuario
}
