"use server"

import { revalidatePath } from "next/cache"
import {
  ANO_PADRAO,
  MESES,
  type Mes,
} from "./data"
import {
  type DadosReais,
  supabaseConfigurado,
} from "./supabase"
import { gravarDadosReaisComLog } from "./dados-reais"

export interface ResultadoFormulario {
  ok: boolean
  erro?: string
}

function parseInt0(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim()
  if (s === "") return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function parseNumero(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim().replace(/\./g, "").replace(",", ".")
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function mesValido(m: string): m is Mes {
  return (MESES as readonly string[]).includes(m)
}

/**
 * Server action única usada pelas duas variantes da nova UI:
 *   • /dashboard/formularios (admin, dentro da sidebar)
 *   • /formulario           (público, sem auth)
 *
 * Salva os campos manuais do dia em dados_diarios_log + dados_reais via
 * gravarDadosReaisComLog (mesma helper que o drawer admin usa). Campos
 * automáticos do Sentinela (investimento, leads, CPL) NÃO são tocados.
 *
 * O preenchedor é marcado como "Formulário público" pra distinguir de
 * escritas que vieram do drawer admin ("Drawer admin") ou do agente
 * Sentinela ("Sentinela Anomalo").
 */
export async function salvarFormularioManualAction(
  formData: FormData
): Promise<ResultadoFormulario> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }

  const empresa = String(formData.get("empresa") ?? "").trim()
  const mes = String(formData.get("mes") ?? "")
  const ano = parseInt0(formData.get("ano")) ?? ANO_PADRAO
  if (!empresa || !mesValido(mes)) {
    return { ok: false, erro: "Selecione empresa e período." }
  }

  // Origem fixa em "pago". Hoje o uso real do form é o gestor lançar
  // reuniões/contratos/faturamento, que entram no bucket pago.
  // Prospecção orgânica não tem fluxo manual ainda.
  const payload: DadosReais = {
    empresa,
    mes,
    ano,
    origem: "pago",
    investimento_real: null,
    leads_real: null,
    reunioes_real: parseInt0(formData.get("reunioes_real")),
    contratos_real: parseInt0(formData.get("contratos_real")),
    faturamento_real: parseNumero(formData.get("faturamento_real")),
    criativos_entregues: null,
    cpl_real: null,
    observacoes: String(formData.get("observacoes") ?? "").trim() || null,
    clientes_ativos: parseInt0(formData.get("clientes_ativos")),
    updated_at: new Date().toISOString(),
  }

  const resultado = await gravarDadosReaisComLog(payload, {
    id: null,
    nome: "Formulário público",
  })
  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro }
  }

  // Invalida toda a árvore /dashboard — mesma estratégia do drawer
  // admin (cobre /dashboard, /dashboard/empresas, /dashboard/<slug>,
  // /dashboard/<slug>/trafego, etc.)
  revalidatePath("/dashboard", "layout")

  return { ok: true }
}
