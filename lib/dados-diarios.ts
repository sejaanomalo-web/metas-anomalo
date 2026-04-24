"use server"

import type { DadosDiariosLog } from "./supabase"
import { getSupabase } from "./supabase"
import {
  ANO_PADRAO,
  ORIGEM_PADRAO,
  type Mes,
  type OrigemDadosReais,
} from "./data"

/**
 * Detalhamento do dia — soma dos deltas de cada métrica reportados em
 * submissões daquele dia. Snapshots (clientes_ativos) e texto
 * (observacoes) ficam com o último valor não-nulo do dia.
 */
export interface DiaDetalhado {
  data: string // YYYY-MM-DD
  diaMes: number
  investimento: number
  leads: number
  reunioes: number
  contratos: number
  faturamento: number
  criativos: number
  clientesAtivos: number | null
  observacoes: string | null
  submissoes: number
  preenchedores: string[]
}

const MESES_NUM: Record<Mes, number> = {
  Abril: 4,
  Maio: 5,
  Junho: 6,
  Julho: 7,
  Agosto: 8,
  Setembro: 9,
  Outubro: 10,
  Novembro: 11,
  Dezembro: 12,
}

function rangeDoMes(mes: Mes, ano: number): { inicio: string; fim: string } {
  const m = MESES_NUM[mes]
  const inicio = `${ano}-${String(m).padStart(2, "0")}-01`
  // Dia seguinte ao último do mês — usamos < no filtro.
  const proximoMes = m === 12 ? 1 : m + 1
  const proximoAno = m === 12 ? ano + 1 : ano
  const fim = `${proximoAno}-${String(proximoMes).padStart(2, "0")}-01`
  return { inicio, fim }
}

function delta(novo: number | null, anterior: number | null): number {
  if (novo === null || novo === undefined) return 0
  const ant = anterior ?? 0
  const d = novo - ant
  return d > 0 ? d : 0
}

export async function getDadosDiariosDoMes(
  empresa: string,
  mes: Mes,
  ano: number = ANO_PADRAO,
  origem: OrigemDadosReais = ORIGEM_PADRAO
): Promise<DiaDetalhado[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { inicio, fim } = rangeDoMes(mes, ano)
  const { data, error } = await supabase
    .from("dados_diarios_log")
    .select("*")
    .eq("empresa", empresa)
    .eq("origem", origem)
    .gte("data", inicio)
    .lt("data", fim)
    .order("created_at", { ascending: true })
  if (error) {
    console.error("[dados_diarios] list error", error.message)
    return []
  }

  const logs = (data ?? []) as DadosDiariosLog[]
  if (logs.length === 0) return []

  const mapa = new Map<string, DiaDetalhado>()
  for (const l of logs) {
    const data = l.data
    const diaMes = Number(data.slice(8, 10))
    const atual = mapa.get(data) ?? {
      data,
      diaMes,
      investimento: 0,
      leads: 0,
      reunioes: 0,
      contratos: 0,
      faturamento: 0,
      criativos: 0,
      clientesAtivos: null,
      observacoes: null,
      submissoes: 0,
      preenchedores: [],
    }

    atual.investimento += delta(l.investimento_real, l.investimento_anterior)
    atual.leads += delta(l.leads_real, l.leads_anterior)
    atual.reunioes += delta(l.reunioes_real, l.reunioes_anterior)
    atual.contratos += delta(l.contratos_real, l.contratos_anterior)
    atual.faturamento += delta(l.faturamento_real, l.faturamento_anterior)
    atual.criativos += delta(l.criativos_entregues, l.criativos_anterior)

    if (l.clientes_ativos !== null && l.clientes_ativos !== undefined) {
      atual.clientesAtivos = l.clientes_ativos
    }
    if (l.observacoes && l.observacoes.trim().length > 0) {
      atual.observacoes = l.observacoes
    }
    atual.submissoes += 1
    if (l.preenchedor_nome && !atual.preenchedores.includes(l.preenchedor_nome)) {
      atual.preenchedores.push(l.preenchedor_nome)
    }

    mapa.set(data, atual)
  }

  return Array.from(mapa.values()).sort((a, b) =>
    a.data.localeCompare(b.data)
  )
}
