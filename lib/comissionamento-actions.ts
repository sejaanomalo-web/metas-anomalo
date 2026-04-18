"use server"

import { revalidatePath } from "next/cache"
import {
  type Comissionamento,
  getSupabase,
  supabaseConfigurado,
} from "./supabase"
import { ANO_PADRAO, type Mes, MESES } from "./data"
import {
  COLABORADORES,
  GATILHOS_FELIPE,
  type Colaborador,
  calcularBonusEmanuel,
  calcularBonusFelipe,
  calcularBonusVinicius,
} from "./comissionamento"

function parseInt0(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim()
  if (s === "") return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function mesValido(mes: string): mes is Mes {
  return (MESES as readonly string[]).includes(mes)
}

function colaboradorValido(c: string): c is Colaborador {
  return COLABORADORES.includes(c as Colaborador)
}

// Aceita felipe/vinicius/emanuel (tipos legados com cálculo embutido)
// ou qualquer nome livre vindo da tabela colaboradores.
function colaboradorValidoGenerico(c: string): boolean {
  return /^[a-z0-9-_çáàâãéèêíïóôõöúñ ]+$/i.test(c) && c.length > 0
}

export async function getComissionamentoMes(
  mes: Mes,
  ano: number = ANO_PADRAO
): Promise<Comissionamento[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("comissionamento")
    .select("*")
    .eq("mes", mes)
    .eq("ano", ano)
  if (error) {
    console.error("[comissionamento] get error", error.message)
    return []
  }
  return (data ?? []) as Comissionamento[]
}

export interface ResultadoComissao {
  ok: boolean
  erro?: string
}

export async function salvarComissaoAction(
  formData: FormData
): Promise<ResultadoComissao> {
  if (!supabaseConfigurado()) {
    return {
      ok: false,
      erro: "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    }
  }

  const colaborador = String(formData.get("colaborador") ?? "")
  const mes = String(formData.get("mes") ?? "")
  const ano = parseInt0(formData.get("ano")) ?? ANO_PADRAO

  if (!mesValido(mes) || !colaboradorValidoGenerico(colaborador)) {
    return { ok: false, erro: "Colaborador ou mês inválidos." }
  }

  let entregas_validas: number | null = null
  let bonus_calculado = 0
  let detalhes: Record<string, boolean> | null = null

  if (colaborador === "felipe") {
    const flags: Record<string, boolean> = {}
    for (const g of GATILHOS_FELIPE) {
      flags[g.chave] = formData.get(g.chave) === "on"
    }
    detalhes = flags
    bonus_calculado = calcularBonusFelipe(flags)
  } else if (colaborador === "vinicius") {
    entregas_validas = parseInt0(formData.get("entregas_validas")) ?? 0
    bonus_calculado = calcularBonusVinicius(entregas_validas)
  } else if (colaborador === "emanuel") {
    entregas_validas = parseInt0(formData.get("entregas_validas")) ?? 0
    bonus_calculado = calcularBonusEmanuel(entregas_validas)
  } else {
    // Colaborador dinâmico: busca a config em metas_comissionamento e
    // calcula baseado em tipo escala/gatilhos.
    const supabase = getSupabase()
    if (!supabase) return { ok: false, erro: "Supabase indisponível." }
    const { data: meta } = await supabase
      .from("metas_comissionamento")
      .select("configuracao")
      .eq("colaborador", colaborador)
      .eq("mes", mes)
      .eq("ano", ano)
      .maybeSingle()
    const config = meta?.configuracao as
      | { tipo: "escala"; faixas: { minimo: number; bonus: number }[] }
      | { tipo: "gatilhos"; gatilhos: { chave: string; valor: number }[] }
      | undefined
    if (config?.tipo === "gatilhos") {
      const flags: Record<string, boolean> = {}
      for (const g of config.gatilhos) {
        flags[g.chave] = formData.get(g.chave) === "on"
      }
      detalhes = flags
      bonus_calculado = config.gatilhos.reduce(
        (acc, g) => acc + (flags[g.chave] ? g.valor : 0),
        0
      )
    } else if (config?.tipo === "escala") {
      entregas_validas = parseInt0(formData.get("entregas_validas")) ?? 0
      const ordenado = [...config.faixas].sort((a, b) => a.minimo - b.minimo)
      let bonus = 0
      for (const f of ordenado) {
        if (entregas_validas >= f.minimo) bonus = f.bonus
      }
      bonus_calculado = bonus
    }
  }

  const payload: Comissionamento = {
    colaborador,
    mes,
    ano,
    entregas_validas,
    bonus_calculado,
    detalhes,
    updated_at: new Date().toISOString(),
  }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase
    .from("comissionamento")
    .upsert(payload, { onConflict: "colaborador,mes,ano" })

  if (error) {
    console.error("[comissionamento] upsert error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard/comissionamento")
  return { ok: true }
}
