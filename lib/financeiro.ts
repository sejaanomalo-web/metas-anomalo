import { getSupabaseAdmin } from "./supabase"
import { MESES, type Mes } from "./data"
import { getResumoMensalPorEmpresa } from "./sentinela"

// ============================================================
// Tipos
// ============================================================

export type TipoLancamento = "receita" | "despesa"
export type StatusLancamento = "previsto" | "realizado" | "cancelado"
export type TipoConta = "banco" | "caixa" | "cartao_credito" | "investimento"
export type Periodicidade = "mensal" | "anual" | "semanal"

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
  data: string
  data_pagamento: string | null
  tipo: TipoLancamento
  valor: number
  categoria_id: string | null
  conta_id: string | null
  descricao: string
  observacoes: string | null
  recorrente_id: string | null
  empresa_cliente: string | null
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

export function tipoContaRotulo(tipo: TipoConta): string {
  switch (tipo) {
    case "banco": return "Banco"
    case "caixa": return "Caixa"
    case "cartao_credito": return "Cartão de crédito"
    case "investimento": return "Investimento"
  }
}

export function statusRotulo(status: StatusLancamento): string {
  switch (status) {
    case "previsto": return "Previsto"
    case "realizado": return "Realizado"
    case "cancelado": return "Cancelado"
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

export interface FiltrosLancamento {
  mes?: Mes
  ano?: number
  tipo?: TipoLancamento
  status?: StatusLancamento
  conta_id?: string
  categoria_id?: string
  limit?: number
}

export async function listarLancamentos(
  filtros: FiltrosLancamento = {}
): Promise<LancamentoFinanceiro[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  let q = supabase
    .from("lancamento_financeiro")
    .select(
      "id, data, data_pagamento, tipo, valor, categoria_id, conta_id, descricao, observacoes, recorrente_id, empresa_cliente, status, anexo_url, criado_por, created_at, updated_at"
    )
    .is("deletado_em", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })

  if (filtros.mes && filtros.ano) {
    const { inicio, fim } = rangeDoMesISO(filtros.mes, filtros.ano)
    q = q.gte("data", inicio).lte("data", fim)
  } else if (filtros.ano) {
    q = q.gte("data", `${filtros.ano}-01-01`).lte("data", `${filtros.ano}-12-31`)
  }
  if (filtros.tipo) q = q.eq("tipo", filtros.tipo)
  if (filtros.status) q = q.eq("status", filtros.status)
  if (filtros.conta_id) q = q.eq("conta_id", filtros.conta_id)
  if (filtros.categoria_id) q = q.eq("categoria_id", filtros.categoria_id)
  if (filtros.limit) q = q.limit(filtros.limit)

  const { data, error } = await q
  if (error) {
    console.error("[financeiro] listarLancamentos error", error.message)
    return []
  }
  return (data ?? []) as LancamentoFinanceiro[]
}

export async function getLancamentoPorId(id: string): Promise<LancamentoFinanceiro | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select("*")
    .eq("id", id)
    .is("deletado_em", null)
    .maybeSingle()
  if (error) {
    console.error("[financeiro] getLancamentoPorId error", error.message)
    return null
  }
  return (data ?? null) as LancamentoFinanceiro | null
}

/**
 * Resumo do mês — total de receitas/despesas realizadas, previstas
 * e resultado líquido. Base para os KPI cards do overview.
 */
export async function getResumoFinanceiroMes(
  mes: Mes,
  ano: number
): Promise<ResumoFinanceiroMes> {
  const supabase = getSupabaseAdmin()
  const base: ResumoFinanceiroMes = {
    mes,
    ano,
    total_receitas: 0,
    total_despesas: 0,
    resultado: 0,
    qtd_lancamentos: 0,
    receitas_previstas: 0,
    despesas_previstas: 0,
  }
  if (!supabase) return base
  const { inicio, fim } = rangeDoMesISO(mes, ano)
  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select("tipo, valor, status")
    .is("deletado_em", null)
    .gte("data", inicio)
    .lte("data", fim)
  if (error) {
    console.error("[financeiro] getResumoFinanceiroMes error", error.message)
    return base
  }
  for (const r of (data ?? []) as {
    tipo: TipoLancamento
    valor: number
    status: StatusLancamento
  }[]) {
    if (r.status === "cancelado") continue
    base.qtd_lancamentos += 1
    const valor = Number(r.valor)
    if (r.status === "realizado") {
      if (r.tipo === "receita") base.total_receitas += valor
      else base.total_despesas += valor
    } else if (r.status === "previsto") {
      if (r.tipo === "receita") base.receitas_previstas += valor
      else base.despesas_previstas += valor
    }
  }
  base.resultado = base.total_receitas - base.total_despesas
  return base
}

/**
 * Saldo atual de uma conta = saldo_inicial + soma de receitas
 * realizadas - soma de despesas realizadas (lançamentos com
 * data_pagamento posterior a data_saldo_inicial).
 */
export async function getSaldoPorConta(): Promise<SaldoConta[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const contas = await listarContas(false) // inclui inativas pra mostrar saldo histórico
  if (contas.length === 0) return []

  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select("conta_id, tipo, valor, data_pagamento")
    .is("deletado_em", null)
    .eq("status", "realizado")
    .not("data_pagamento", "is", null)
  if (error) {
    console.error("[financeiro] getSaldoPorConta error", error.message)
    return contas.map((c) => ({ conta: c, saldo_atual: Number(c.saldo_inicial) }))
  }

  type Row = {
    conta_id: string | null
    tipo: TipoLancamento
    valor: number
    data_pagamento: string
  }
  const movPorConta = new Map<string, number>()
  for (const r of (data ?? []) as Row[]) {
    if (!r.conta_id) continue
    const delta = r.tipo === "receita" ? Number(r.valor) : -Number(r.valor)
    movPorConta.set(r.conta_id, (movPorConta.get(r.conta_id) ?? 0) + delta)
  }

  return contas.map((conta) => ({
    conta,
    saldo_atual: Number(conta.saldo_inicial) + (movPorConta.get(conta.id) ?? 0),
  }))
}

export async function getSaldoTotal(): Promise<number> {
  const saldos = await getSaldoPorConta()
  return saldos.reduce((acc, s) => acc + s.saldo_atual, 0)
}

/**
 * Série mensal de receita/despesa/resultado pro ano informado.
 * Alimenta o GraficoFluxoCaixa do overview. Só lançamentos
 * realizados com data_pagamento entram.
 */
export async function getFluxoCaixaAnual(ano: number): Promise<
  { mes: Mes; receitas: number; despesas: number; resultado: number }[]
> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return MESES.map((mes) => ({ mes, receitas: 0, despesas: 0, resultado: 0 }))
  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select("tipo, valor, data_pagamento")
    .is("deletado_em", null)
    .eq("status", "realizado")
    .not("data_pagamento", "is", null)
    .gte("data_pagamento", `${ano}-01-01`)
    .lte("data_pagamento", `${ano}-12-31`)
  if (error) {
    console.error("[financeiro] getFluxoCaixaAnual error", error.message)
    return MESES.map((mes) => ({ mes, receitas: 0, despesas: 0, resultado: 0 }))
  }
  const acc = new Map<Mes, { receitas: number; despesas: number }>()
  for (const r of (data ?? []) as {
    tipo: TipoLancamento
    valor: number
    data_pagamento: string
  }[]) {
    const m = new Date(r.data_pagamento + "T12:00:00Z").getMonth() + 1
    const mesNome = MESES.find((nome) => MES_NUM[nome] === m)
    if (!mesNome) continue
    const bucket = acc.get(mesNome) ?? { receitas: 0, despesas: 0 }
    if (r.tipo === "receita") bucket.receitas += Number(r.valor)
    else bucket.despesas += Number(r.valor)
    acc.set(mesNome, bucket)
  }
  return MESES.map((mes) => {
    const b = acc.get(mes) ?? { receitas: 0, despesas: 0 }
    return { ...b, mes, resultado: b.receitas - b.despesas }
  })
}

/**
 * Próximos N lançamentos previstos (status=previsto), ordenados
 * por data. Usado no card "Próximos vencimentos" do overview.
 */
export async function getProximosPrevistos(limit = 5): Promise<LancamentoFinanceiro[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const hoje = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select("*")
    .is("deletado_em", null)
    .eq("status", "previsto")
    .gte("data", hoje)
    .order("data", { ascending: true })
    .limit(limit)
  if (error) {
    console.error("[financeiro] getProximosPrevistos error", error.message)
    return []
  }
  return (data ?? []) as LancamentoFinanceiro[]
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
  const supabase = getSupabaseAdmin()
  const base: DREMes = {
    mes, ano,
    receitas: [], despesas: [],
    total_receitas: 0, total_despesas: 0, resultado: 0,
  }
  if (!supabase) return base

  const { inicio, fim } = rangeDoMesISO(mes, ano)
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
    valor: number
    categoria_id: string | null
  }[]) {
    const valor = Number(l.valor)
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
        cor: cat?.cor ?? "#4c4e54",
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
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  const resumoMes = await getResumoMensalPorEmpresa(mes, ano, "pago")

  const { inicio, fim } = rangeDoMesISO(mes, ano)
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
  for (const r of (receitas ?? []) as { empresa_cliente: string; valor: number }[]) {
    receitaPorEmpresa.set(
      r.empresa_cliente,
      (receitaPorEmpresa.get(r.empresa_cliente) ?? 0) + Number(r.valor)
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
