"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { requererAdmin } from "./auth"
import { parseNumeroForm } from "./parse-numero"

/**
 * Admin (Configurações → Gerenciar dados): editar/excluir entradas de
 * dados_diarios_log (tráfego pago + orgânico). Gate ESTRITO por papel
 * admin.
 *
 * AVISO: editar/excluir aqui NÃO recomputa os totais mensais de fechamento
 * (dados_reais) automaticamente — a UI mostra esse aviso antes de confirmar.
 * É correção pontual da linha do log diário, não da consolidação mensal.
 */

export interface DadoDiarioRow {
  id: string
  empresa: string
  data: string
  origem: string
  preenchedor_nome: string | null
  investimento_real: number | null
  leads_real: number | null
  reunioes_real: number | null
  contratos_real: number | null
  faturamento_real: number | null
  observacoes: string | null
}

export interface ResultadoDado {
  ok: boolean
  erro?: string
}

function intOuNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim()
  if (s === "") return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const COLUNAS =
  "id, empresa, data, origem, preenchedor_nome, investimento_real, leads_real, reunioes_real, contratos_real, faturamento_real, observacoes"

/** Lista entradas filtradas por intervalo (obrigatório, pra não varrer a
 *  tabela inteira) e empresa (opcional). */
export async function listarDadosDiariosAdmin(
  formData: FormData
): Promise<DadoDiarioRow[]> {
  await requererAdmin()
  const empresa = String(formData.get("empresa") ?? "").trim()
  const inicio = String(formData.get("inicio") ?? "").trim()
  const fim = String(formData.get("fim") ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    return []
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  let q = supabase
    .from("dados_diarios_log")
    .select(COLUNAS)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: false })
    .order("empresa", { ascending: true })
    .limit(500)
  if (empresa) q = q.eq("empresa", empresa)
  const { data, error } = await q
  if (error) {
    console.error("[dados-admin] listar error", error.message)
    return []
  }
  return (data ?? []) as DadoDiarioRow[]
}

/** Exclusão definitiva de uma linha do log diário. Confirmação "Excluir". */
export async function excluirDadoDiarioAction(
  formData: FormData
): Promise<ResultadoDado> {
  await requererAdmin()
  const id = String(formData.get("id") ?? "").trim()
  const confirmacao = String(formData.get("confirmacao") ?? "")
  if (!id) return { ok: false, erro: "ID inválido." }
  if (confirmacao !== "Excluir") {
    return { ok: false, erro: 'Digite exatamente "Excluir" pra confirmar.' }
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }
  const { error } = await supabase
    .from("dados_diarios_log")
    .delete()
    .eq("id", id)
  if (error) {
    console.error("[dados-admin] excluir error", error.message)
    return { ok: false, erro: error.message }
  }
  revalidatePath("/dashboard", "layout")
  return { ok: true }
}

/** Edição por id dos campos de negócio (investimento, leads, reuniões,
 *  contratos, faturamento, observações). Campo vazio = null (limpa). */
export async function atualizarDadoDiarioAction(
  formData: FormData
): Promise<ResultadoDado> {
  await requererAdmin()
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const invParse = parseNumeroForm(formData.get("investimento_real"))
  if (invParse.erro) return { ok: false, erro: `Investimento: ${invParse.erro}` }
  const fatParse = parseNumeroForm(formData.get("faturamento_real"))
  if (fatParse.erro) return { ok: false, erro: `Faturamento: ${fatParse.erro}` }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase
    .from("dados_diarios_log")
    .update({
      investimento_real: invParse.value,
      leads_real: intOuNull(formData.get("leads_real")),
      reunioes_real: intOuNull(formData.get("reunioes_real")),
      contratos_real: intOuNull(formData.get("contratos_real")),
      faturamento_real: fatParse.value,
      observacoes: (String(formData.get("observacoes") ?? "").trim() ||
        null) as string | null,
    })
    .eq("id", id)
  if (error) {
    console.error("[dados-admin] atualizar error", error.message)
    return { ok: false, erro: error.message }
  }
  revalidatePath("/dashboard", "layout")
  return { ok: true }
}
