import { getSupabaseAdmin } from "./supabase"
import { MESES, type Mes } from "./data"
import { getResumoPorIntervaloPorEmpresa } from "./sentinela"
import {
  anoMesDeISO,
  chaveMes,
  corDaCategoria,
  dataDoPeriodo,
  dentroDoPeriodo,
  dentroDoPeriodoPorVencimento,
  filtroPeriodoPostgREST,
  filtroVencimentoPostgREST,
  baldesDaGranularidade,
  janelaDaGranularidade,
  montarSerie,
  recorrentesAMaterializar,
  rotuloMes,
  rotuloMesCurto,
  saldoDaConta,
  somarLancamentos,
  valorNumerico,
  vencimentoEfetivo,
  PALETA_CATEGORIAS,
  type BaldeSerie,
  type EixoPeriodo,
  type Granularidade,
  type LancamentoParaRegra,
  type SituacaoFinanceira,
  type TotaisFinanceiros,
} from "./financeiro-regras"

// ============================================================
// Tipos
// ============================================================

// O vocabulário e as regras moram em lib/financeiro-regras.ts (puro, sem
// banco). Aqui só re-exportamos para que os imports existentes
// (`from "@/lib/financeiro"`) continuem valendo — e para que não exista uma
// segunda definição de "o que é um status" em lugar nenhum.
export {
  corDaCategoria,
  corDeterministica,
  dataDoEixo,
  dataDoPeriodo,
  entraNaSituacao,
  estaAtrasado,
  proximaCorLivre,
  rotuloMes,
  rotuloMesCurto,
  rotulosDaSituacao,
  rotuloSituacaoCurto,
  saldoDaConta,
  somarLancamentos,
  statusRotulo,
  statusRotuloComAtraso,
  tipoContaRotulo,
  valorNumerico,
  vencimentoEfetivo,
  CORES_DISPONIVEIS,
  FORMAS_PAGAMENTO,
  FORMA_PAGAMENTO_PADRAO,
  PALETA_CATEGORIAS,
  SITUACOES,
} from "./financeiro-regras"

export {
  GRANULARIDADES,
  chaveDaGranularidade,
  janelaDaGranularidade,
  rotuloGranularidade,
} from "./financeiro-regras"

export type {
  BaldeSerie,
  EixoPeriodo,
  Granularidade,
  LancamentoParaRegra,
  Periodicidade,
  SituacaoFinanceira,
  StatusLancamento,
  TipoConta,
  TipoLancamento,
  TotaisFinanceiros,
} from "./financeiro-regras"

import type {
  Periodicidade,
  StatusLancamento,
  TipoConta,
  TipoLancamento,
} from "./financeiro-regras"

export interface CategoriaFinanceira {
  id: string
  nome: string
  tipo: TipoLancamento
  parent_id: string | null
  cor: string
  ativa: boolean
  ordem: number
}

export interface ContaFinanceira {
  id: string
  nome: string
  tipo: TipoConta
  saldo_inicial: number
  data_saldo_inicial: string
  ativa: boolean
  ordem: number
}

export interface LancamentoFinanceiro {
  id: string
  /** Competência: quando o fato aconteceu. */
  data: string
  /** Quando o dinheiro deve andar. Nulo = usar a competência (R3). */
  data_vencimento: string | null
  data_pagamento: string | null
  tipo: TipoLancamento
  valor: number
  categoria_id: string | null
  conta_id: string | null
  descricao: string
  observacoes: string | null
  recorrente_id: string | null
  empresa_cliente: string | null
  /** Texto livre de procedência: "Recorrente", "Extrato", "Fornecedor X". */
  origem: string | null
  forma_pagamento: string | null
  status: StatusLancamento
  anexo_url: string | null
  criado_por: string | null
  created_at: string
  updated_at: string
}

export interface PagamentoRecorrente {
  id: string
  nome: string
  tipo: TipoLancamento
  valor: number
  categoria_id: string | null
  conta_id: string | null
  periodicidade: Periodicidade
  dia_vencimento: number | null
  inicio: string
  fim: string | null
  ativo: boolean
  ultimo_lancamento_gerado: string | null
  observacoes: string | null
  /** Status com que o lançamento nasce ao materializar:
   *  - 'realizado' contabiliza no KPI do mês imediatamente
   *  - 'previsto' só aparece em "Próximos vencimentos" */
  status_padrao: "previsto" | "realizado"
}

export interface MetaFinanceira {
  id: string
  mes: Mes
  ano: number
  tipo: TipoLancamento
  categoria_id: string | null
  valor_meta: number
}

export interface ResumoFinanceiroMes {
  mes: Mes
  ano: number
  total_receitas: number
  total_despesas: number
  resultado: number
  qtd_lancamentos: number
  receitas_previstas: number
  despesas_previstas: number
}

export interface SaldoConta {
  conta: ContaFinanceira
  saldo_atual: number
}

/** Uma barra da série anual. `mes` é o mês do calendário (1–12). */
export interface PontoFluxoMensal {
  mes: number
  rotulo: string
  receitas: number
  despesas: number
  resultado: number
}

/** Colunas do lançamento lidas pelas telas. Uma lista só: um SELECT que
 *  esquece `data_vencimento` faz a regra R3 silenciosamente cair no ramo
 *  "sem vencimento" e o lançamento aparece no mês errado. */
const COLUNAS_LANCAMENTO =
  "id, data, data_vencimento, data_pagamento, tipo, valor, categoria_id, " +
  "conta_id, descricao, observacoes, recorrente_id, empresa_cliente, origem, " +
  "forma_pagamento, status, anexo_url, criado_por, created_at, updated_at"

// ============================================================
// Helpers
// ============================================================

// O tipo `Mes` do app cobre só Abril–Dezembro (range operacional do
// produto). Janeiro/Fevereiro/Março existem no CHECK do Postgres mas
// não são geráveis pelo seletor — futuros se a Anômalo expandir o
// range, ajustar `lib/data.ts` MESES e este map em conjunto.
const MES_NUM: Record<Mes, number> = {
  Abril: 4, Maio: 5, Junho: 6, Julho: 7, Agosto: 8,
  Setembro: 9, Outubro: 10, Novembro: 11, Dezembro: 12,
}

export function mesNumero(mes: Mes): number {
  return MES_NUM[mes]
}

export function rangeDoMesISO(mes: Mes, ano: number): { inicio: string; fim: string } {
  const m = MES_NUM[mes]
  const inicio = `${ano}-${String(m).padStart(2, "0")}-01`
  const ultimoDia = new Date(ano, m, 0).getDate()
  const fim = `${ano}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`
  return { inicio, fim }
}

/**
 * Intervalo fechado de um mês do CALENDÁRIO (1–12) — sem passar pelo tipo
 * `Mes`, que só cobre Abril–Dezembro. É esta a função que o financeiro usa
 * internamente; `rangeDoMesISO` fica para quem já dependia dela.
 */
export function rangeDoMesNumISO(
  ano: number,
  mes: number
): { inicio: string; fim: string } {
  const mm = String(mes).padStart(2, "0")
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return {
    inicio: `${ano}-${mm}-01`,
    fim: `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`,
  }
}

// ============================================================
// Leituras
// ============================================================

export async function listarCategorias(
  tipo?: TipoLancamento,
  ativasApenas = true
): Promise<CategoriaFinanceira[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  let q = supabase
    .from("categoria_financeira")
    .select("id, nome, tipo, parent_id, cor, ativa, ordem")
    .order("ordem")
    .order("nome")
  if (tipo) q = q.eq("tipo", tipo)
  if (ativasApenas) q = q.eq("ativa", true)
  const { data, error } = await q
  if (error) {
    console.error("[financeiro] listarCategorias error", error.message)
    return []
  }
  return (data ?? []) as CategoriaFinanceira[]
}

export async function listarContas(ativasApenas = true): Promise<ContaFinanceira[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  let q = supabase
    .from("conta_financeira")
    .select("id, nome, tipo, saldo_inicial, data_saldo_inicial, ativa, ordem")
    .order("ordem")
    .order("nome")
  if (ativasApenas) q = q.eq("ativa", true)
  const { data, error } = await q
  if (error) {
    console.error("[financeiro] listarContas error", error.message)
    return []
  }
  return (data ?? []) as ContaFinanceira[]
}

/** Teto de linhas por consulta. Acima disso a tela avisa que os totais
 *  somam só o que foi carregado — um total menor que o real, sem aviso, é
 *  pior do que nenhum total. */
export const LIMITE_LANCAMENTOS = 500

export interface FiltrosLancamento {
  mes?: Mes
  ano?: number
  /** Intervalo arbitrário (YYYY-MM-DD, inclusivos). Tem PRIORIDADE sobre
   *  mes/ano quando ambos presentes — usado pelo período global em modo
   *  dia/intervalo. */
  de?: string
  ate?: string
  tipo?: TipoLancamento
  status?: StatusLancamento
  /** Recorte de soma (R1). Não filtra a lista: cancelado continua visível,
   *  só não entra nos totais. */
  situacao?: SituacaoFinanceira
  conta_id?: string
  categoria_id?: string
  /** 'competencia' (padrão, R3) ou 'vencimento' (R6, links externos). */
  eixo?: EixoPeriodo
  limit?: number
  /** Busca livre em descrição e origem. */
  busca?: string
}

export interface ResultadoLancamentos {
  lancamentos: LancamentoFinanceiro[]
  /** true quando a consulta bateu no teto — a tela precisa avisar. */
  truncado: boolean
  limite: number
}

/**
 * Lista lançamentos aplicando a regra R3 (ou R6, no eixo de vencimento).
 *
 * O recorte não é "where data between": um lançamento em aberto cai no mês do
 * VENCIMENTO, e um pago cai no mês da competência. O filtro correspondente
 * tem três ramos e é gerado por `filtroPeriodoPostgREST`, a partir da mesma
 * declaração que alimenta o predicado em memória — é o que impede a lista e
 * os totais de discordarem.
 *
 * A ordenação usa sempre a MESMA data que recortou.
 */
export async function listarLancamentosDetalhado(
  filtros: FiltrosLancamento = {}
): Promise<ResultadoLancamentos> {
  const limite = filtros.limit ?? LIMITE_LANCAMENTOS
  const vazio = { lancamentos: [], truncado: false, limite }
  const supabase = getSupabaseAdmin()
  if (!supabase) return vazio

  const eixo: EixoPeriodo = filtros.eixo ?? "competencia"

  let de = filtros.de
  let ate = filtros.ate
  if ((!de || !ate) && filtros.mes && filtros.ano) {
    const r = rangeDoMesISO(filtros.mes, filtros.ano)
    de = r.inicio
    ate = r.fim
  } else if (!de && !ate && filtros.ano) {
    de = `${filtros.ano}-01-01`
    ate = `${filtros.ano}-12-31`
  }

  let q = supabase
    .from("lancamento_financeiro")
    .select(COLUNAS_LANCAMENTO)
    .is("deletado_em", null)

  if (de && ate) {
    q = q.or(
      eixo === "vencimento"
        ? filtroVencimentoPostgREST(de, ate)
        : filtroPeriodoPostgREST(de, ate)
    )
  }

  if (filtros.tipo) q = q.eq("tipo", filtros.tipo)
  if (filtros.status) q = q.eq("status", filtros.status)
  if (filtros.conta_id) q = q.eq("conta_id", filtros.conta_id)
  if (filtros.categoria_id) q = q.eq("categoria_id", filtros.categoria_id)
  if (filtros.busca) {
    const termo = filtros.busca.replace(/[%,()]/g, " ").trim()
    if (termo) q = q.or(`descricao.ilike.%${termo}%,origem.ilike.%${termo}%`)
  }

  // Ordena pelas duas datas porque o Postgres não sabe aplicar a regra R3 num
  // ORDER BY simples; a ordenação fina (pela data que recortou) é feita em
  // memória logo abaixo, sobre o conjunto já limitado.
  q = q
    .order("data_vencimento", { ascending: false, nullsFirst: false })
    .order("data", { ascending: false })
    .limit(limite + 1)

  const { data, error } = await q
  if (error) {
    console.error("[financeiro] listarLancamentos error", error.message)
    throw error
  }

  const linhas = (data ?? []) as unknown as LancamentoFinanceiro[]
  const truncado = linhas.length > limite
  const lancamentos = truncado ? linhas.slice(0, limite) : linhas

  const dataDeOrdenacao = (l: LancamentoFinanceiro) =>
    eixo === "vencimento" ? vencimentoEfetivo(l) : dataDoPeriodo(l)
  lancamentos.sort((a, b) => {
    const da = dataDeOrdenacao(a)
    const db = dataDeOrdenacao(b)
    if (da !== db) return da < db ? 1 : -1
    return a.created_at < b.created_at ? 1 : -1
  })

  return { lancamentos, truncado, limite }
}

/** Forma antiga (só a lista). Mantida para os call-sites existentes. */
export async function listarLancamentos(
  filtros: FiltrosLancamento = {}
): Promise<LancamentoFinanceiro[]> {
  try {
    const { lancamentos } = await listarLancamentosDetalhado(filtros)
    return lancamentos
  } catch {
    return []
  }
}

export async function getLancamentoPorId(id: string): Promise<LancamentoFinanceiro | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select(COLUNAS_LANCAMENTO)
    .eq("id", id)
    .is("deletado_em", null)
    .maybeSingle()
  if (error) {
    console.error("[financeiro] getLancamentoPorId error", error.message)
    return null
  }
  return (data ?? null) as unknown as LancamentoFinanceiro | null
}

/**
 * Resumo do mês — total de receitas/despesas realizadas, previstas
 * e resultado líquido. Base para os KPI cards do overview.
 */
export async function getResumoFinanceiroMes(
  mes: Mes,
  ano: number
): Promise<ResumoFinanceiroMes> {
  const { inicio, fim } = rangeDoMesISO(mes, ano)
  return getResumoFinanceiroPeriodo(inicio, fim, mes, ano)
}

/**
 * Igual a getResumoFinanceiroMes, mas para um INTERVALO arbitrário de datas.
 *
 * Passa pelo MESMO recorte (R3) e pela MESMA soma (`somarLancamentos`) que a
 * lista de lançamentos usa. Antes esta função recortava por `data` e somava
 * inline, então o KPI e a lista podiam discordar sem que nada acusasse.
 */
export async function getResumoFinanceiroPeriodo(
  inicio: string,
  fim: string,
  mes: Mes,
  ano: number
): Promise<ResumoFinanceiroMes> {
  const base: ResumoFinanceiroMes = {
    mes, ano,
    total_receitas: 0, total_despesas: 0, resultado: 0,
    qtd_lancamentos: 0,
    receitas_previstas: 0, despesas_previstas: 0,
  }

  let lancamentos: LancamentoFinanceiro[]
  try {
    lancamentos = (await listarLancamentosDetalhado({ de: inicio, ate: fim })).lancamentos
  } catch (e) {
    console.error("[financeiro] getResumoFinanceiroPeriodo error", e)
    return base
  }

  const realizado = somarLancamentos(lancamentos, "realizado")
  const previsto = somarLancamentos(lancamentos, "previsto")
  const total = somarLancamentos(lancamentos, "total")

  base.total_receitas = realizado.entradas
  base.total_despesas = realizado.saidas
  base.resultado = realizado.saldo
  base.receitas_previstas = previsto.entradas
  base.despesas_previstas = previsto.saidas
  base.qtd_lancamentos = total.quantidade
  return base
}

/** Totais por situação de um período — alimenta os totalizadores da lista. */
export async function getTotaisDoPeriodo(
  filtros: FiltrosLancamento
): Promise<Record<SituacaoFinanceira, TotaisFinanceiros>> {
  const { lancamentos } = await listarLancamentosDetalhado(filtros)
  return {
    realizado: somarLancamentos(lancamentos, "realizado"),
    previsto: somarLancamentos(lancamentos, "previsto"),
    total: somarLancamentos(lancamentos, "total"),
  }
}

/**
 * R5. Saldo atual de cada conta = saldo inicial + receitas pagas − despesas
 * pagas. Contas inativas entram: o saldo histórico delas continua sendo
 * dinheiro da empresa.
 */
export async function getSaldoPorConta(): Promise<SaldoConta[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  const [contas, movRes] = await Promise.all([
    listarContas(false),
    supabase
      .from("lancamento_financeiro")
      .select("conta_id, tipo, valor, status, data, data_pagamento")
      .is("deletado_em", null)
      .eq("status", "realizado")
      .not("data_pagamento", "is", null),
  ])
  if (contas.length === 0) return []

  const { data, error } = movRes
  if (error) {
    console.error("[financeiro] getSaldoPorConta error", error.message)
    return contas.map((c) => ({ conta: c, saldo_atual: valorNumerico(c.saldo_inicial) }))
  }

  const porConta = new Map<string, LancamentoParaRegra[]>()
  for (const r of (data ?? []) as (LancamentoParaRegra & { conta_id: string | null })[]) {
    if (!r.conta_id) continue
    const lista = porConta.get(r.conta_id) ?? []
    lista.push(r)
    porConta.set(r.conta_id, lista)
  }

  return contas.map((conta) => ({
    conta,
    saldo_atual: saldoDaConta(conta.saldo_inicial, porConta.get(conta.id) ?? []),
  }))
}

export async function getSaldoTotal(): Promise<number> {
  const saldos = await getSaldoPorConta()
  return saldos.reduce((acc, s) => acc + s.saldo_atual, 0)
}

/**
 * R4. Série dos DOZE meses do ano: receita, despesa e resultado REALIZADOS,
 * agrupados por COMPETÊNCIA.
 *
 * Duas correções em relação ao que havia antes:
 *
 *  1. Agrupava por `data_pagamento`, enquanto o DRE da mesma página agrupa
 *     por competência. Como 17 das 79 linhas realizadas têm pagamento em mês
 *     diferente da competência, o DRE e o "Histórico do ano" logo abaixo
 *     podiam mostrar números diferentes para o mesmo mês. Agora os dois usam
 *     competência — a regra da referência (R4) e a que o DRE já seguia.
 *
 *  2. Devolvia só Abril–Dezembro, porque iterava o tipo `Mes`. O caixa existe
 *     nos doze meses.
 */
export async function getFluxoCaixaAnual(ano: number): Promise<PontoFluxoMensal[]> {
  const vazio = (): PontoFluxoMensal[] =>
    Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      rotulo: rotuloMesCurto(i + 1),
      receitas: 0,
      despesas: 0,
      resultado: 0,
    }))

  const supabase = getSupabaseAdmin()
  if (!supabase) return vazio()

  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select("tipo, valor, data")
    .is("deletado_em", null)
    .eq("status", "realizado")
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`)
  if (error) {
    console.error("[financeiro] getFluxoCaixaAnual error", error.message)
    return vazio()
  }

  const serie = vazio()
  for (const r of (data ?? []) as { tipo: TipoLancamento; valor: number | string; data: string }[]) {
    const { mes } = anoMesDeISO(r.data)
    const ponto = serie[mes - 1]
    if (!ponto) continue
    const v = valorNumerico(r.valor)
    if (r.tipo === "receita") ponto.receitas += v
    else ponto.despesas += v
  }
  for (const p of serie) p.resultado = p.receitas - p.despesas
  return serie
}

/**
 * Lançamentos em aberto, ordenados pelo vencimento — vencidos primeiro,
 * depois os próximos. Inclui atrasados de propósito: como tudo nasce
 * previsto, uma conta que venceu não pode sumir do radar.
 */
export async function getProximosPrevistos(limit = 6): Promise<LancamentoFinanceiro[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select(COLUNAS_LANCAMENTO)
    .is("deletado_em", null)
    .eq("status", "previsto")
    .order("data_vencimento", { ascending: true, nullsFirst: false })
    .order("data", { ascending: true })
    .limit(limit * 3)
  if (error) {
    console.error("[financeiro] getProximosPrevistos error", error.message)
    return []
  }
  const linhas = (data ?? []) as unknown as LancamentoFinanceiro[]
  // A ordenação final é pelo vencimento EFETIVO (coalesce), que o Postgres
  // não expressa num order by simples sem índice de expressão.
  linhas.sort((a, b) => (vencimentoEfetivo(a) < vencimentoEfetivo(b) ? -1 : 1))
  return linhas.slice(0, limit)
}

export async function listarRecorrentes(ativosApenas = true): Promise<PagamentoRecorrente[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  let q = supabase
    .from("pagamento_recorrente")
    .select(
      "id, nome, tipo, valor, categoria_id, conta_id, periodicidade, dia_vencimento, inicio, fim, ativo, ultimo_lancamento_gerado, observacoes, status_padrao"
    )
    .order("nome")
  if (ativosApenas) q = q.eq("ativo", true)
  const { data, error } = await q
  if (error) {
    console.error("[financeiro] listarRecorrentes error", error.message)
    return []
  }
  return (data ?? []) as PagamentoRecorrente[]
}

/**
 * DRE simplificado do mês: total e detalhamento por categoria
 * para cada tipo (receita / despesa).
 */
export interface LinhaDRE {
  categoria_id: string | null
  categoria_nome: string
  cor: string
  total: number
  qtd: number
}

export interface DREMes {
  mes: Mes
  ano: number
  receitas: LinhaDRE[]
  despesas: LinhaDRE[]
  total_receitas: number
  total_despesas: number
  resultado: number
}

export async function getDREMes(mes: Mes, ano: number): Promise<DREMes> {
  const { inicio, fim } = rangeDoMesISO(mes, ano)
  return getDREPeriodo(inicio, fim, mes, ano)
}

/**
 * R4. DRE do intervalo: só lançamentos REALIZADOS, agrupados por
 * COMPETÊNCIA (`data`) — regime de competência, não de caixa.
 *
 * É a mesma regra que `getFluxoCaixaAnual` passou a usar, e é por isso que o
 * DRE e o "Histórico do ano" na mesma página agora mostram o mesmo número
 * para o mesmo mês.
 */
export async function getDREPeriodo(
  inicio: string,
  fim: string,
  mes: Mes,
  ano: number
): Promise<DREMes> {
  const supabase = getSupabaseAdmin()
  const base: DREMes = {
    mes, ano,
    receitas: [], despesas: [],
    total_receitas: 0, total_despesas: 0, resultado: 0,
  }
  if (!supabase) return base

  const [{ data: lancamentos }, categorias] = await Promise.all([
    supabase
      .from("lancamento_financeiro")
      .select("tipo, valor, categoria_id")
      .is("deletado_em", null)
      .eq("status", "realizado")
      .gte("data", inicio)
      .lte("data", fim),
    listarCategorias(undefined, false),
  ])

  const catById = new Map(categorias.map((c) => [c.id, c]))
  type Acc = { total: number; qtd: number }
  const receitaAcc = new Map<string | null, Acc>()
  const despesaAcc = new Map<string | null, Acc>()

  for (const l of (lancamentos ?? []) as {
    tipo: TipoLancamento
    valor: number | string
    categoria_id: string | null
  }[]) {
    const valor = valorNumerico(l.valor)
    const acc = l.tipo === "receita" ? receitaAcc : despesaAcc
    const entry = acc.get(l.categoria_id) ?? { total: 0, qtd: 0 }
    entry.total += valor
    entry.qtd += 1
    acc.set(l.categoria_id, entry)
  }

  const construir = (acc: Map<string | null, Acc>): LinhaDRE[] => {
    const linhas: LinhaDRE[] = []
    for (const [catId, { total, qtd }] of acc) {
      const cat = catId ? catById.get(catId) : null
      linhas.push({
        categoria_id: catId,
        categoria_nome: cat?.nome ?? "Sem categoria",
        // Categoria sem cor gravada recebe sempre a MESMA cor (hash do id),
        // pra não trocar de cor entre a Visão geral e a aba Categorias.
        cor: corDaCategoria(cat),
        total, qtd,
      })
    }
    return linhas.sort((a, b) => b.total - a.total)
  }

  base.receitas = construir(receitaAcc)
  base.despesas = construir(despesaAcc)
  base.total_receitas = base.receitas.reduce((s, l) => s + l.total, 0)
  base.total_despesas = base.despesas.reduce((s, l) => s + l.total, 0)
  base.resultado = base.total_receitas - base.total_despesas
  return base
}

// ============================================================
// Categorias — uso, detalhe e evolução
// ============================================================

export interface UsoCategoria {
  lancamentos: number
  recorrentes: number
  total: number
}

/**
 * Quantos registros dependem de uma categoria. É o que o diálogo de exclusão
 * mostra ANTES de perguntar: "em uso por 3 lançamentos" muda completamente a
 * decisão de quem ia clicar em excluir sem pensar.
 */
export async function contarUsoCategoria(id: string): Promise<UsoCategoria> {
  const vazio = { lancamentos: 0, recorrentes: 0, total: 0 }
  const supabase = getSupabaseAdmin()
  if (!supabase) return vazio

  const [lanc, rec] = await Promise.all([
    supabase
      .from("lancamento_financeiro")
      .select("id", { count: "exact", head: true })
      .eq("categoria_id", id)
      .is("deletado_em", null),
    supabase
      .from("pagamento_recorrente")
      .select("id", { count: "exact", head: true })
      .eq("categoria_id", id),
  ])

  const lancamentos = lanc.count ?? 0
  const recorrentes = rec.count ?? 0
  return { lancamentos, recorrentes, total: lancamentos + recorrentes }
}

export async function getCategoriaPorId(
  id: string
): Promise<CategoriaFinanceira | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("categoria_financeira")
    .select("id, nome, tipo, parent_id, cor, ativa, ordem")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    console.error("[financeiro] getCategoriaPorId error", error.message)
    return null
  }
  return (data ?? null) as CategoriaFinanceira | null
}

/**
 * Série de evolução de uma categoria (ou dos lançamentos SEM categoria,
 * quando `categoriaId` é null) na granularidade pedida.
 *
 * A consulta recorta pela janela da própria granularidade — 5 anos, 12 meses,
 * 12 semanas ou os dias do mês — e não pelo período global: o gráfico existe
 * justamente pra olhar além do período selecionado.
 */
export async function getEvolucaoCategoria(opts: {
  categoriaId: string | null
  tipo?: TipoLancamento
  granularidade: Granularidade
  referencia: string
  situacao?: SituacaoFinanceira
}): Promise<BaldeSerie[]> {
  const { de, ate } = janelaDaGranularidade(opts.granularidade, opts.referencia)
  const supabase = getSupabaseAdmin()
  if (!supabase) return baldesDaGranularidade(opts.granularidade, opts.referencia)

  let q = supabase
    .from("lancamento_financeiro")
    .select("tipo, valor, status, data, data_vencimento, data_pagamento")
    .is("deletado_em", null)
    .or(filtroPeriodoPostgREST(de, ate))

  if (opts.categoriaId) q = q.eq("categoria_id", opts.categoriaId)
  else q = q.is("categoria_id", null)
  if (opts.tipo) q = q.eq("tipo", opts.tipo)

  const { data, error } = await q
  if (error) {
    console.error("[financeiro] getEvolucaoCategoria error", error.message)
    return baldesDaGranularidade(opts.granularidade, opts.referencia)
  }

  return montarSerie(
    (data ?? []) as LancamentoParaRegra[],
    opts.granularidade,
    opts.referencia,
    opts.situacao ?? "realizado"
  )
}

/** Lançamentos de uma categoria (ou sem categoria) num período. */
export async function listarLancamentosDaCategoria(opts: {
  categoriaId: string | null
  tipo?: TipoLancamento
  de: string
  ate: string
  busca?: string
}): Promise<LancamentoFinanceiro[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  let q = supabase
    .from("lancamento_financeiro")
    .select(COLUNAS_LANCAMENTO)
    .is("deletado_em", null)
    .or(filtroPeriodoPostgREST(opts.de, opts.ate))
    .limit(LIMITE_LANCAMENTOS)

  if (opts.categoriaId) q = q.eq("categoria_id", opts.categoriaId)
  else q = q.is("categoria_id", null)
  if (opts.tipo) q = q.eq("tipo", opts.tipo)
  if (opts.busca) {
    const termo = opts.busca.replace(/[%,()]/g, " ").trim()
    if (termo) q = q.or(`descricao.ilike.%${termo}%,origem.ilike.%${termo}%`)
  }

  const { data, error } = await q
  if (error) {
    console.error("[financeiro] listarLancamentosDaCategoria error", error.message)
    return []
  }
  const linhas = (data ?? []) as unknown as LancamentoFinanceiro[]
  linhas.sort((a, b) => (dataDoPeriodo(a) < dataDoPeriodo(b) ? 1 : -1))
  return linhas
}

// ============================================================
// Contas — detalhe
// ============================================================

export async function getContaPorId(id: string): Promise<ContaFinanceira | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("conta_financeira")
    .select("id, nome, tipo, saldo_inicial, data_saldo_inicial, ativa, ordem")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    console.error("[financeiro] getContaPorId error", error.message)
    return null
  }
  return (data ?? null) as ContaFinanceira | null
}

/** Movimentações de uma conta no período, já ordenadas pela regra R3. */
export async function listarLancamentosDaConta(opts: {
  contaId: string
  de: string
  ate: string
}): Promise<LancamentoFinanceiro[]> {
  const { lancamentos } = await listarLancamentosDetalhado({
    de: opts.de,
    ate: opts.ate,
    conta_id: opts.contaId,
  })
  return lancamentos
}

/** Série mensal do ano de UMA conta — alimenta o gráfico do detalhe. */
export async function getFluxoAnualDaConta(
  contaId: string,
  ano: number
): Promise<PontoFluxoMensal[]> {
  const serie: PontoFluxoMensal[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    rotulo: rotuloMesCurto(i + 1),
    receitas: 0,
    despesas: 0,
    resultado: 0,
  }))

  const supabase = getSupabaseAdmin()
  if (!supabase) return serie

  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select("tipo, valor, data")
    .is("deletado_em", null)
    .eq("conta_id", contaId)
    .eq("status", "realizado")
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`)
  if (error) {
    console.error("[financeiro] getFluxoAnualDaConta error", error.message)
    return serie
  }

  for (const r of (data ?? []) as { tipo: TipoLancamento; valor: number | string; data: string }[]) {
    const { mes } = anoMesDeISO(r.data)
    const ponto = serie[mes - 1]
    if (!ponto) continue
    const v = valorNumerico(r.valor)
    if (r.tipo === "receita") ponto.receitas += v
    else ponto.despesas += v
  }
  for (const p of serie) p.resultado = p.receitas - p.despesas
  return serie
}

/**
 * Comparativo mês a mês de TODAS as contas no ano — duas barras por conta.
 * Uma consulta só; separar por conta em memória é mais barato que N consultas.
 */
export interface ComparativoContas {
  contas: { id: string; nome: string; cor: string }[]
  meses: { mes: number; rotulo: string; valores: Record<string, { receitas: number; despesas: number }> }[]
}

export async function getComparativoContas(ano: number): Promise<ComparativoContas> {
  const contas = await listarContas(false)
  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    rotulo: rotuloMesCurto(i + 1),
    valores: Object.fromEntries(
      contas.map((c) => [c.id, { receitas: 0, despesas: 0 }])
    ) as Record<string, { receitas: number; despesas: number }>,
  }))

  const base: ComparativoContas = {
    contas: contas.map((c, i) => ({
      id: c.id,
      nome: c.nome,
      // Cor estável por posição — conta não tem cor no banco, e mudar de cor
      // entre visitas tornaria o gráfico ilegível.
      cor: PALETA_CATEGORIAS[i % PALETA_CATEGORIAS.length],
    })),
    meses,
  }
  if (contas.length === 0) return base

  const supabase = getSupabaseAdmin()
  if (!supabase) return base

  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select("conta_id, tipo, valor, data")
    .is("deletado_em", null)
    .not("conta_id", "is", null)
    .eq("status", "realizado")
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`)
  if (error) {
    console.error("[financeiro] getComparativoContas error", error.message)
    return base
  }

  for (const r of (data ?? []) as {
    conta_id: string
    tipo: TipoLancamento
    valor: number | string
    data: string
  }[]) {
    const { mes } = anoMesDeISO(r.data)
    const balde = meses[mes - 1]?.valores[r.conta_id]
    if (!balde) continue
    const v = valorNumerico(r.valor)
    if (r.tipo === "receita") balde.receitas += v
    else balde.despesas += v
  }

  return base
}

// ============================================================
// Integração com Sentinela: faturamento operacional vs receita
// ============================================================

export interface ConferenciaSentinela {
  empresa: string
  faturamento_operacional: number    // soma de faturamento_real em dados_diarios_log
  receita_registrada: number         // soma de lancamento_financeiro com empresa_cliente
  diferenca: number                  // operacional − registrada (positivo = falta lançar)
  status: "ok" | "atencao" | "ausente"
}

/**
 * Cruza o faturamento operacional reportado pelos gestores de tráfego
 * (dados_diarios_log via Sentinela) com as receitas registradas no
 * financeiro para o mês. Sinaliza:
 *   - ok: diferença <= R$ 1,00 ou < 5% do operacional
 *   - atencao: diferença > 5% (lançamento financeiro divergente)
 *   - ausente: operacional > 0 mas zero registrado (esquecido)
 *
 * Útil pra detectar venda confirmada operacionalmente que ainda não
 * virou receita no caixa (atraso de cobrança ou esquecimento).
 */
export async function getConferenciaSentinela(
  mes: Mes,
  ano: number
): Promise<ConferenciaSentinela[]> {
  const { inicio, fim } = rangeDoMesISO(mes, ano)
  return getConferenciaSentinelaPeriodo(inicio, fim)
}

/** Variante por intervalo de getConferenciaSentinela. */
export async function getConferenciaSentinelaPeriodo(
  inicio: string,
  fim: string
): Promise<ConferenciaSentinela[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  const resumoMes = await getResumoPorIntervaloPorEmpresa(inicio, fim, "pago")

  const { data: receitas } = await supabase
    .from("lancamento_financeiro")
    .select("empresa_cliente, valor")
    .is("deletado_em", null)
    .eq("tipo", "receita")
    .eq("status", "realizado")
    .gte("data", inicio)
    .lte("data", fim)
    .not("empresa_cliente", "is", null)

  const receitaPorEmpresa = new Map<string, number>()
  for (const r of (receitas ?? []) as { empresa_cliente: string; valor: number | string }[]) {
    receitaPorEmpresa.set(
      r.empresa_cliente,
      (receitaPorEmpresa.get(r.empresa_cliente) ?? 0) + valorNumerico(r.valor)
    )
  }

  const linhas: ConferenciaSentinela[] = []
  for (const [empresa, resumo] of resumoMes) {
    const operacional = resumo.faturamento ?? 0
    if (operacional <= 0) continue
    const registrada = receitaPorEmpresa.get(empresa) ?? 0
    const diferenca = operacional - registrada
    const status: ConferenciaSentinela["status"] =
      registrada === 0 ? "ausente"
        : Math.abs(diferenca) <= 1 || Math.abs(diferenca) / operacional < 0.05
          ? "ok"
          : "atencao"
    linhas.push({
      empresa,
      faturamento_operacional: operacional,
      receita_registrada: registrada,
      diferenca,
      status,
    })
  }

  return linhas.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
}
