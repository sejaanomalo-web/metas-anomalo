"use server"

import type {
  CriativoDetalhe,
  DadosDiariosLog,
  PublicoProspectado,
} from "./supabase"
import { getSupabase } from "./supabase"
import {
  ANO_PADRAO,
  ORIGEM_PADRAO,
  type Mes,
  type OrigemDadosReais,
} from "./data"

/**
 * Detalhamento do dia — soma dos deltas de cada métrica reportados em
 * submissões daquele dia. Snapshots (clientes_ativos, CPL, CPA) ficam
 * com o último valor não-nulo do dia; texto (observacoes) idem.
 * criativosAdicionados lista os novos pares {nome, publico} incluídos
 * naquele dia (comparação entre o detalhe novo e o anterior em cada
 * submissão).
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
  criativosUsados: number
  respostas: number
  cpl: number | null
  cpa: number | null
  clientesAtivos: number | null
  observacoes: string | null
  criativosAdicionados: CriativoDetalhe[]
  publicosAdicionados: PublicoProspectado[]
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

/**
 * Delta de uma submissão. Permite valores negativos: se alguém corrigir
 * um total pra baixo via drawer, o resumo do dia desconta a diferença e
 * o somatório segue batendo com o estado atual de dados_reais. Sem o
 * negativo, correções gerariam divergência entre o resumo e o
 * dashboard.
 */
function delta(novo: number | null, anterior: number | null): number {
  if (novo === null || novo === undefined) return 0
  const ant = anterior ?? 0
  return novo - ant
}

function chaveCriativo(c: CriativoDetalhe): string {
  return `${c.nome.trim().toLowerCase()}|${c.publico.trim().toLowerCase()}`
}

function diferencaCriativos(
  novo: CriativoDetalhe[] | null,
  anterior: CriativoDetalhe[] | null
): CriativoDetalhe[] {
  const novos = Array.isArray(novo) ? novo : []
  const antigos = Array.isArray(anterior) ? anterior : []
  const setAnt = new Set(antigos.map(chaveCriativo))
  return novos.filter(
    (c) => (c.nome.trim() || c.publico.trim()) && !setAnt.has(chaveCriativo(c))
  )
}

function chavePublico(p: PublicoProspectado): string {
  return p.publico.trim().toLowerCase()
}

function diferencaPublicos(
  novo: PublicoProspectado[] | null,
  anterior: PublicoProspectado[] | null
): PublicoProspectado[] {
  const novos = Array.isArray(novo) ? novo : []
  const antigos = Array.isArray(anterior) ? anterior : []
  const antMap = new Map<string, number>()
  for (const a of antigos) {
    if (!a.publico.trim()) continue
    antMap.set(
      chavePublico(a),
      (antMap.get(chavePublico(a)) ?? 0) + (a.leads || 0)
    )
  }
  const out: PublicoProspectado[] = []
  for (const n of novos) {
    if (!n.publico.trim()) continue
    const ant = antMap.get(chavePublico(n)) ?? 0
    const diff = (n.leads || 0) - ant
    if (diff > 0 || ant === 0) {
      // Novo público ou incremento de leads nele no dia.
      out.push({ publico: n.publico, leads: diff > 0 ? diff : n.leads || 0 })
    }
  }
  return out
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
      criativosUsados: 0,
      respostas: 0,
      cpl: null,
      cpa: null,
      clientesAtivos: null,
      observacoes: null,
      criativosAdicionados: [] as CriativoDetalhe[],
      publicosAdicionados: [] as PublicoProspectado[],
      submissoes: 0,
      preenchedores: [],
    }

    atual.investimento += delta(l.investimento_real, l.investimento_anterior)
    atual.leads += delta(l.leads_real, l.leads_anterior)
    atual.reunioes += delta(l.reunioes_real, l.reunioes_anterior)
    atual.contratos += delta(l.contratos_real, l.contratos_anterior)
    atual.faturamento += delta(l.faturamento_real, l.faturamento_anterior)
    atual.criativos += delta(l.criativos_entregues, l.criativos_anterior)
    atual.criativosUsados += delta(
      l.criativos_usados,
      l.criativos_usados_anterior
    )
    atual.respostas += delta(l.respostas, l.respostas_anterior)

    if (l.cpl_real !== null && l.cpl_real !== undefined) atual.cpl = l.cpl_real
    if (l.cpa_real !== null && l.cpa_real !== undefined) atual.cpa = l.cpa_real
    if (l.clientes_ativos !== null && l.clientes_ativos !== undefined) {
      atual.clientesAtivos = l.clientes_ativos
    }
    if (l.observacoes && l.observacoes.trim().length > 0) {
      atual.observacoes = l.observacoes
    }

    // Acumula criativos adicionados: compara detalhe novo com o anterior
    // em cada submissão, deduplicando entre submissões do mesmo dia.
    const adicionadosNaSubmissao = diferencaCriativos(
      l.criativos_detalhe as CriativoDetalhe[] | null,
      l.criativos_detalhe_anterior as CriativoDetalhe[] | null
    )
    if (adicionadosNaSubmissao.length > 0) {
      const jaNoDia = new Set(atual.criativosAdicionados.map(chaveCriativo))
      for (const c of adicionadosNaSubmissao) {
        if (!jaNoDia.has(chaveCriativo(c))) {
          atual.criativosAdicionados.push(c)
          jaNoDia.add(chaveCriativo(c))
        }
      }
    }

    // Públicos prospectados: registra novos públicos ou incrementos de
    // leads sobre públicos já existentes. Agrupa por nome do público no
    // mesmo dia.
    const publicosNaSubmissao = diferencaPublicos(
      l.publicos_prospectados as PublicoProspectado[] | null,
      l.publicos_prospectados_anterior as PublicoProspectado[] | null
    )
    if (publicosNaSubmissao.length > 0) {
      for (const p of publicosNaSubmissao) {
        const existente = atual.publicosAdicionados.find(
          (x) => chavePublico(x) === chavePublico(p)
        )
        if (existente) {
          existente.leads += p.leads
        } else {
          atual.publicosAdicionados.push({ ...p })
        }
      }
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

/**
 * Agrega os deltas de todas as submissões registradas em um intervalo
 * fechado de datas (formato YYYY-MM-DD), independentemente da empresa
 * ou da origem. Usado pelos resumos para mostrar "o que aconteceu hoje"
 * ou "o que aconteceu na semana", em contraste ao acumulado mensal.
 *
 * - Cumulativos (investimento, leads, reuniões, contratos, faturamento,
 *   criativos, respostas) = soma de (novo - anterior) das submissões.
 *   investimento só conta na origem 'pago'.
 *   leads/reuniões/contratos/faturamento contam pago + orgânico.
 */
export interface DeltaEmpresaPeriodo {
  empresa: string
  investimento: number
  leads: number
  reunioes: number
  contratos: number
  faturamento: number
  criativos: number
  respostas: number
}

export interface AgregadoPeriodo {
  somaInvestimento: number
  somaLeads: number
  somaReunioes: number
  somaContratos: number
  somaFaturamento: number
  somaCriativos: number
  somaRespostas: number
  porEmpresa: Map<string, DeltaEmpresaPeriodo>
}

export async function getDeltasDoPeriodo(
  dataInicioISO: string,
  dataFimISO: string
): Promise<AgregadoPeriodo> {
  const vazio: AgregadoPeriodo = {
    somaInvestimento: 0,
    somaLeads: 0,
    somaReunioes: 0,
    somaContratos: 0,
    somaFaturamento: 0,
    somaCriativos: 0,
    somaRespostas: 0,
    porEmpresa: new Map(),
  }

  const supabase = getSupabase()
  if (!supabase) return vazio
  const { data, error } = await supabase
    .from("dados_diarios_log")
    .select("*")
    .gte("data", dataInicioISO)
    .lte("data", dataFimISO)
    .order("created_at", { ascending: true })
  if (error) {
    console.error("[dados_diarios] periodo error", error.message)
    return vazio
  }
  const logs = (data ?? []) as DadosDiariosLog[]
  if (logs.length === 0) return vazio

  const acc: AgregadoPeriodo = { ...vazio, porEmpresa: new Map() }
  for (const l of logs) {
    const ehPago = l.origem === "pago"

    const dInv = ehPago
      ? delta(l.investimento_real, l.investimento_anterior)
      : 0
    const dCri = ehPago
      ? delta(l.criativos_entregues, l.criativos_anterior)
      : 0
    const dLeads = delta(l.leads_real, l.leads_anterior)
    const dReu = delta(l.reunioes_real, l.reunioes_anterior)
    const dCon = delta(l.contratos_real, l.contratos_anterior)
    const dFat = delta(l.faturamento_real, l.faturamento_anterior)
    const dResp = delta(l.respostas, l.respostas_anterior)

    acc.somaInvestimento += dInv
    acc.somaCriativos += dCri
    acc.somaLeads += dLeads
    acc.somaReunioes += dReu
    acc.somaContratos += dCon
    acc.somaFaturamento += dFat
    acc.somaRespostas += dResp

    const ag = acc.porEmpresa.get(l.empresa) ?? {
      empresa: l.empresa,
      investimento: 0,
      leads: 0,
      reunioes: 0,
      contratos: 0,
      faturamento: 0,
      criativos: 0,
      respostas: 0,
    }
    ag.investimento += dInv
    ag.criativos += dCri
    ag.leads += dLeads
    ag.reunioes += dReu
    ag.contratos += dCon
    ag.faturamento += dFat
    ag.respostas += dResp
    acc.porEmpresa.set(l.empresa, ag)
  }
  return acc
}
