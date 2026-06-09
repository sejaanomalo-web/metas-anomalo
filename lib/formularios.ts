"use server"

import { revalidatePath } from "next/cache"
import { MESES, type EmpresaMeta, type Mes } from "./data"
import {
  type DadosReais,
  getSupabaseAdmin,
  supabaseConfigurado,
} from "./supabase"
import { gravarDadosReaisComLog } from "./dados-reais"
import { parseNumeroForm } from "./parse-numero"
import { listarEmpresas } from "./empresas-actions"
import { getResumoMensalDaEmpresa } from "./sentinela"
import { getMetasOverrideEmpresa } from "./metas-empresa"
import { criarNotificacao } from "./notificacoes"

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

// parseNumero local removido — usa parseNumeroForm de lib/dados-reais
// (parser robusto, rejeita ambiguidade tipo "22.275" em vez de
// silenciosamente trocar por 22275).

/** Converte YYYY-MM-DD em { dataISO, mes, ano }. mes/ano são derivados
 *  da data — fonte única de verdade evita inconsistência entre o que
 *  vai em dados_diarios_log.data e em dados_reais.{mes,ano}.
 *
 *  Mes em formato canônico ("Abril".."Dezembro"); retorna null se a
 *  data não estiver dentro dos meses suportados pelo dashboard. */
function derivarPeriodoDaData(
  dataISO: string
): { dataISO: string; mes: Mes; ano: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return null
  // Constrói Date em UTC pra evitar shift de timezone que mudaria o dia
  const [anoStr, mesStr] = dataISO.split("-")
  const ano = parseInt(anoStr, 10)
  const mesNum = parseInt(mesStr, 10)
  if (!Number.isFinite(ano) || !Number.isFinite(mesNum)) return null
  // Tabela mes_num → nome (mesma usada em lib/data.ts MES_NUM)
  const nomes: Record<number, Mes> = {
    4: "Abril", 5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
  }
  const mes = nomes[mesNum]
  if (!mes || !(MESES as readonly string[]).includes(mes)) return null
  return { dataISO, mes, ano }
}

/**
 * Server action única usada pelas duas variantes da nova UI:
 *   • /dashboard/formularios (admin, dentro da sidebar)
 *   • /formulario           (público, sem auth)
 *
 * Recebe `data` (YYYY-MM-DD) do formulário, deriva mes/ano dela e grava
 * em dados_diarios_log (na linha do dia exato) + dados_reais (agregado
 * mensal). Permite lançamento histórico — não trava em "hoje".
 *
 * Campos automáticos do Sentinela (investimento, leads, CPL) NÃO são
 * tocados — apenas reuniões, contratos, faturamento, observações.
 *
 * O preenchedor é marcado como "Formulário público" em
 * dados_diarios_log.preenchedor_nome.
 */
export async function salvarFormularioManualAction(
  formData: FormData
): Promise<ResultadoFormulario> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }

  const empresa = String(formData.get("empresa") ?? "").trim()
  const dataInput = String(formData.get("data") ?? "")
  if (!empresa) {
    return { ok: false, erro: "Selecione uma empresa." }
  }
  const periodo = derivarPeriodoDaData(dataInput)
  if (!periodo) {
    return {
      ok: false,
      erro: "Data inválida (use o seletor — entre Abril e Dezembro).",
    }
  }

  const fatParsed = parseNumeroForm(formData.get("faturamento_real"))
  if (fatParsed.erro) {
    return { ok: false, erro: `Faturamento: ${fatParsed.erro}` }
  }

  // Origem fixa em "pago". O fluxo manual hoje é o gestor lançar
  // reuniões/contratos/faturamento, que entram no bucket pago.
  const payload: DadosReais = {
    empresa,
    mes: periodo.mes,
    ano: periodo.ano,
    origem: "pago",
    investimento_real: null,
    leads_real: null,
    reunioes_agendadas_real: parseInt0(
      formData.get("reunioes_agendadas_real")
    ),
    reunioes_real: parseInt0(formData.get("reunioes_real")),
    contratos_real: parseInt0(formData.get("contratos_real")),
    faturamento_real: fatParsed.value,
    criativos_entregues: null,
    cpl_real: null,
    observacoes: String(formData.get("observacoes") ?? "").trim() || null,
    clientes_ativos: parseInt0(formData.get("clientes_ativos")),
    updated_at: new Date().toISOString(),
  }

  // Responsável do seletor (atribuição por pessoa) com fallback público.
  const respId = String(formData.get("preenchedor_id") ?? "").trim() || null
  const respNome =
    String(formData.get("preenchedor_nome") ?? "").trim() ||
    "Formulário público"
  const resultado = await gravarDadosReaisComLog(
    payload,
    { id: respId, nome: respNome },
    { dataISO: periodo.dataISO }
  )
  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro }
  }

  // Notifica (dados_trafego) e checa meta batida. Resolve o nome de
  // exibição pelo db slug enviado pelo form. Falhas aqui não derrubam o
  // submit — criarNotificacao só loga.
  const empresas = await listarEmpresas(true)
  const emp = empresas.find((e) => e.db === empresa)
  const nome = emp?.nome ?? empresa
  await criarNotificacao({
    tipo: "dados_trafego",
    empresa: nome,
    titulo: `Tráfego · ${nome}`,
    mensagem: `Dados de tráfego de ${nome} foram enviados (${periodo.dataISO}).`,
    payload: { empresa: nome, data: periodo.dataISO },
  })
  if (emp) {
    await verificarMetaBatida(emp, periodo.mes, periodo.ano)
  }

  // Invalida toda a árvore /dashboard — mesma estratégia do drawer
  // admin (cobre /dashboard, /dashboard/empresas, /dashboard/<slug>,
  // /dashboard/<slug>/trafego, etc.)
  revalidatePath("/dashboard", "layout")

  return { ok: true }
}

/**
 * Se o faturamento realizado (pago) da empresa no mês atingiu a meta
 * definida (override em metas_empresa), dispara a notificação meta_batida
 * — uma única vez por (empresa, mes, ano). Sem meta definida → nada.
 */
async function verificarMetaBatida(
  emp: EmpresaMeta,
  mes: Mes,
  ano: number
): Promise<void> {
  const resumo = await getResumoMensalDaEmpresa(emp.nome, mes, ano, "pago")
  const realizado = resumo?.faturamento ?? 0
  if (realizado <= 0) return

  const overrides = await getMetasOverrideEmpresa(emp.db, ano, "pago")
  const ov = overrides.get(mes)
  if (!ov) return
  const chaveFat =
    emp.tipo === "hato"
      ? "receita"
      : emp.tipo === "diego"
      ? "receita_hub"
      : "faturamento"
  const meta = Number((ov as Record<string, number>)[chaveFat] ?? 0)
  if (meta <= 0 || realizado < meta) return

  // Dedup: já notificou meta batida dessa empresa nesse mês/ano?
  const supabase = getSupabaseAdmin()
  if (!supabase) return
  const { data: existente } = await supabase
    .from("notificacoes")
    .select("id")
    .eq("tipo", "meta_batida")
    .eq("empresa", emp.nome)
    .eq("payload->>mes", mes)
    .eq("payload->>ano", String(ano))
    .limit(1)
  if (existente && existente.length > 0) return

  await criarNotificacao({
    tipo: "meta_batida",
    empresa: emp.nome,
    titulo: `🎯 Meta batida · ${emp.nome}`,
    mensagem: `${emp.nome} atingiu a meta de faturamento de ${mes}/${ano} (R$ ${realizado.toLocaleString(
      "pt-BR"
    )}).`,
    payload: { empresa: emp.nome, mes, ano, meta, realizado },
  })
}
