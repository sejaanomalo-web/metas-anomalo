"use server"

import { revalidatePath } from "next/cache"
import type { DadosReais } from "./supabase"
import {
  getSupabase,
  supabaseConfigurado,
} from "./supabase"
import {
  ANO_PADRAO,
  empresas,
  type Mes,
  MESES,
  getFaturamentoMes,
  getDadosEmpresa,
  type LinhaPadrao,
  type LinhaAton,
  type LinhaHato,
} from "./data"
import { getDadosReaisMes } from "./dados-reais"

export interface ResultadoSemanal {
  ok: boolean
  erro?: string
  salvos?: number
}

function parseNum(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim().replace(/\./g, "").replace(",", ".")
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseInt0(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim()
  if (s === "") return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function mesValidoFn(m: string): m is Mes {
  return (MESES as readonly string[]).includes(m)
}

export async function salvarDadosSemanaAction(
  formData: FormData
): Promise<ResultadoSemanal> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado" }
  }
  const mes = String(formData.get("mes") ?? "")
  const ano = parseInt0(formData.get("ano")) ?? ANO_PADRAO
  if (!mesValidoFn(mes)) return { ok: false, erro: "Mês inválido" }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível" }

  let salvos = 0
  let temFaturamento = false

  // Faturamento por empresa (upsert — substitui)
  for (const empresa of empresas) {
    const fatReal = parseNum(formData.get(`fat_${empresa.db}`))
    const reunioesIncr = parseInt0(formData.get(`reu_${empresa.db}`))
    const contratosIncr = parseInt0(formData.get(`con_${empresa.db}`))

    if (fatReal === null && reunioesIncr === null && contratosIncr === null) {
      continue
    }

    const existente = await getDadosReaisMes(empresa.db, mes, ano)
    const merged: DadosReais = {
      empresa: empresa.db,
      mes,
      ano,
      investimento_real: existente?.investimento_real ?? null,
      leads_real: existente?.leads_real ?? null,
      reunioes_real:
        reunioesIncr !== null
          ? (existente?.reunioes_real ?? 0) + reunioesIncr
          : existente?.reunioes_real ?? null,
      contratos_real:
        contratosIncr !== null
          ? (existente?.contratos_real ?? 0) + contratosIncr
          : existente?.contratos_real ?? null,
      faturamento_real:
        fatReal !== null ? fatReal : existente?.faturamento_real ?? null,
      criativos_entregues: existente?.criativos_entregues ?? null,
      cpl_real: existente?.cpl_real ?? null,
      observacoes: existente?.observacoes ?? null,
      clientes_ativos: existente?.clientes_ativos ?? null,
      updated_at: new Date().toISOString(),
    }

    // Recalcula CPL
    if (
      merged.investimento_real !== null &&
      merged.leads_real !== null &&
      merged.leads_real > 0
    ) {
      merged.cpl_real = Number(
        (merged.investimento_real / merged.leads_real).toFixed(2)
      )
    }

    if (fatReal !== null) temFaturamento = true

    const { error } = await supabase
      .from("dados_reais")
      .upsert(merged, { onConflict: "empresa,mes,ano" })
    if (!error) salvos++
  }

  // Criativos — contabilizam-se em comissionamento (Vinicius/Emanuel)
  const vinicius = parseInt0(formData.get("criativos_vinicius"))
  const emanuel = parseInt0(formData.get("criativos_emanuel"))

  if (vinicius !== null) {
    const { data: atual } = await supabase
      .from("comissionamento")
      .select("entregas_validas")
      .eq("colaborador", "vinicius")
      .eq("mes", mes)
      .eq("ano", ano)
      .maybeSingle()
    const total = (atual?.entregas_validas ?? 0) + vinicius
    await supabase.from("comissionamento").upsert(
      {
        colaborador: "vinicius",
        mes,
        ano,
        entregas_validas: total,
        bonus_calculado: calcularBonusVinicius(total),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "colaborador,mes,ano" }
    )
    salvos++
  }

  if (emanuel !== null) {
    const { data: atual } = await supabase
      .from("comissionamento")
      .select("entregas_validas")
      .eq("colaborador", "emanuel")
      .eq("mes", mes)
      .eq("ano", ano)
      .maybeSingle()
    const total = (atual?.entregas_validas ?? 0) + emanuel
    await supabase.from("comissionamento").upsert(
      {
        colaborador: "emanuel",
        mes,
        ano,
        entregas_validas: total,
        bonus_calculado: calcularBonusEmanuel(total),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "colaborador,mes,ano" }
    )
    salvos++
  }

  if (salvos === 0) {
    return {
      ok: false,
      erro: "Nenhum campo preenchido. Preencha ao menos um faturamento.",
    }
  }

  // Log semanal
  const hoje = new Date()
  const semana = Math.ceil(hoje.getDate() / 7)
  await supabase.from("log_semanal").insert({
    semana,
    mes,
    ano,
    preenchido_por: String(formData.get("preenchido_por") ?? "") || null,
    dados_salvos: {
      temFaturamento,
      criativosVinicius: vinicius,
      criativosEmanuel: emanuel,
      total: salvos,
    },
  })

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/comissionamento")
  return { ok: true, salvos }
}

// Escalas (mesmas de lib/comissionamento.ts)
function calcularBonusVinicius(entregas: number): number {
  if (entregas < 10) return 0
  if (entregas < 15) return 100
  if (entregas < 20) return 200
  if (entregas < 25) return 350
  if (entregas < 30) return 500
  return 700
}

function calcularBonusEmanuel(entregas: number): number {
  if (entregas < 5) return 0
  if (entregas < 8) return 100
  if (entregas < 11) return 200
  if (entregas < 15) return 350
  return 500
}

// Helpers de leitura para a página
export async function getContextoSemanal(mes: Mes, ano: number) {
  const empresaDados: Record<
    string,
    {
      meta: number
      existente: DadosReais | null
    }
  > = {}
  for (const empresa of empresas) {
    const existente = await getDadosReaisMes(empresa.db, mes, ano)
    const meta = getFaturamentoMes(empresa.slug, mes, ano)
    empresaDados[empresa.db] = { meta, existente }
  }
  return empresaDados
}

export async function getComissionamentoAcumulado(mes: Mes, ano: number) {
  const supabase = getSupabase()
  if (!supabase) return { vinicius: 0, emanuel: 0 }
  const { data } = await supabase
    .from("comissionamento")
    .select("colaborador, entregas_validas")
    .eq("mes", mes)
    .eq("ano", ano)
  const vinicius =
    data?.find((d) => d.colaborador === "vinicius")?.entregas_validas ?? 0
  const emanuel =
    data?.find((d) => d.colaborador === "emanuel")?.entregas_validas ?? 0
  return { vinicius, emanuel }
}

// Reexport helpers úteis
export async function getMetaEmpresaMes(
  slug: string,
  mes: Mes,
  ano: number
): Promise<number> {
  const empresa = empresas.find((e) => e.slug === slug)
  if (!empresa) return 0
  const dados = getDadosEmpresa(empresa.slug, ano)
  const linha = dados.find((l) => l.mes === mes) as
    | LinhaPadrao
    | LinhaAton
    | LinhaHato
    | undefined
  if (!linha) return 0
  if (empresa.tipo === "hato") return (linha as LinhaHato).receita ?? 0
  if ("faturamento" in linha)
    return (linha as LinhaPadrao | LinhaAton).faturamento ?? 0
  return 0
}
