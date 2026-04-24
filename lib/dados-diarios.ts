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

function delta(novo: number | null, anterior: number | null): number {
  if (novo === null || novo === undefined) return 0
  const ant = anterior ?? 0
  const d = novo - ant
  return d > 0 ? d : 0
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
