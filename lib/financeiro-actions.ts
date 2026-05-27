"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual, temPermissao } from "./auth"
import { parseNumeroForm } from "./parse-numero"
import { type Mes } from "./data"
import {
  mesNumero,
  type TipoLancamento,
  type StatusLancamento,
  type TipoConta,
  type Periodicidade,
} from "./financeiro"

export interface ResultadoFinanceiro {
  ok: boolean
  erro?: string
  id?: string
}

async function exigirPermissao(): Promise<{ usuarioId: string; erro?: string }> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { usuarioId: "", erro: "nao_autenticado" }
  if (!temPermissao(usuario, "dashboard_financeiro")) {
    return { usuarioId: "", erro: "sem_permissao" }
  }
  return { usuarioId: usuario.id }
}

function parseInt0(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim()
  if (s === "") return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function tipoValido(v: string): v is TipoLancamento {
  return v === "receita" || v === "despesa"
}

function statusValido(v: string): v is StatusLancamento {
  return v === "previsto" || v === "realizado" || v === "cancelado"
}

function tipoContaValido(v: string): v is TipoConta {
  return ["banco", "caixa", "cartao_credito", "investimento"].includes(v)
}

function periodicidadeValida(v: string): v is Periodicidade {
  return v === "mensal" || v === "anual" || v === "semanal"
}

function isoDate(v: FormDataEntryValue | null): string | null {
  if (v === null) return null
  const s = String(v).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

// ============================================================
// LANCAMENTOS
// ============================================================

export async function criarLancamentoAction(
  formData: FormData
): Promise<ResultadoFinanceiro> {
  const { usuarioId, erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  const tipo = String(formData.get("tipo") ?? "")
  if (!tipoValido(tipo)) return { ok: false, erro: "Tipo inválido (receita/despesa)." }

  const status = String(formData.get("status") ?? "realizado")
  if (!statusValido(status)) return { ok: false, erro: "Status inválido." }

  const valorParsed = parseNumeroForm(formData.get("valor"))
  if (valorParsed.erro) return { ok: false, erro: `Valor: ${valorParsed.erro}` }
  if (valorParsed.value === null || valorParsed.value <= 0) {
    return { ok: false, erro: "Valor é obrigatório e maior que zero." }
  }

  const data = isoDate(formData.get("data"))
  if (!data) return { ok: false, erro: "Data inválida (use AAAA-MM-DD)." }

  const data_pagamento = isoDate(formData.get("data_pagamento"))
  const descricao = String(formData.get("descricao") ?? "").trim()
  if (!descricao) return { ok: false, erro: "Descrição obrigatória." }

  const categoria_id = String(formData.get("categoria_id") ?? "").trim() || null
  const conta_id = String(formData.get("conta_id") ?? "").trim() || null
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null
  const empresa_cliente = String(formData.get("empresa_cliente") ?? "").trim() || null

  // Regra: status=realizado exige data_pagamento.
  if (status === "realizado" && !data_pagamento) {
    return { ok: false, erro: "Lançamento realizado precisa de data de pagamento." }
  }

  const { data: row, error } = await supabase
    .from("lancamento_financeiro")
    .insert({
      data,
      data_pagamento,
      tipo,
      valor: valorParsed.value,
      categoria_id,
      conta_id,
      descricao,
      observacoes,
      empresa_cliente,
      status,
      criado_por: usuarioId,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[financeiro] criarLancamento error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard/financeiro", "layout")
  return { ok: true, id: row.id as string }
}

export async function atualizarLancamentoAction(
  formData: FormData
): Promise<ResultadoFinanceiro> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const tipo = String(formData.get("tipo") ?? "")
  if (!tipoValido(tipo)) return { ok: false, erro: "Tipo inválido." }

  const status = String(formData.get("status") ?? "")
  if (!statusValido(status)) return { ok: false, erro: "Status inválido." }

  const valorParsed = parseNumeroForm(formData.get("valor"))
  if (valorParsed.erro) return { ok: false, erro: `Valor: ${valorParsed.erro}` }
  if (valorParsed.value === null || valorParsed.value <= 0) {
    return { ok: false, erro: "Valor é obrigatório e maior que zero." }
  }

  const data = isoDate(formData.get("data"))
  if (!data) return { ok: false, erro: "Data inválida." }

  const data_pagamento = isoDate(formData.get("data_pagamento"))
  const descricao = String(formData.get("descricao") ?? "").trim()
  if (!descricao) return { ok: false, erro: "Descrição obrigatória." }

  if (status === "realizado" && !data_pagamento) {
    return { ok: false, erro: "Lançamento realizado precisa de data de pagamento." }
  }

  const categoria_id = String(formData.get("categoria_id") ?? "").trim() || null
  const conta_id = String(formData.get("conta_id") ?? "").trim() || null
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null
  const empresa_cliente = String(formData.get("empresa_cliente") ?? "").trim() || null

  const { error } = await supabase
    .from("lancamento_financeiro")
    .update({
      data,
      data_pagamento,
      tipo,
      valor: valorParsed.value,
      categoria_id,
      conta_id,
      descricao,
      observacoes,
      empresa_cliente,
      status,
    })
    .eq("id", id)

  if (error) {
    console.error("[financeiro] atualizarLancamento error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard/financeiro", "layout")
  return { ok: true, id }
}

export async function excluirLancamentoAction(id: string): Promise<ResultadoFinanceiro> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  const { error } = await supabase
    .from("lancamento_financeiro")
    .update({ deletado_em: new Date().toISOString() })
    .eq("id", id)

  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/financeiro", "layout")
  return { ok: true, id }
}

export async function marcarRealizadoAction(
  id: string,
  dataPagamento: string
): Promise<ResultadoFinanceiro> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
    return { ok: false, erro: "Data de pagamento inválida." }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  const { error } = await supabase
    .from("lancamento_financeiro")
    .update({ status: "realizado", data_pagamento: dataPagamento })
    .eq("id", id)

  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/financeiro", "layout")
  return { ok: true, id }
}

// ============================================================
// CATEGORIAS
// ============================================================

export async function salvarCategoriaAction(
  formData: FormData
): Promise<ResultadoFinanceiro> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  const id = String(formData.get("id") ?? "").trim() || null
  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { ok: false, erro: "Nome obrigatório." }

  const tipo = String(formData.get("tipo") ?? "")
  if (!tipoValido(tipo)) return { ok: false, erro: "Tipo inválido." }

  const cor = String(formData.get("cor") ?? "#4c4e54").trim() || "#4c4e54"
  const ativa = formData.get("ativa") === "on"
  const ordem = parseInt0(formData.get("ordem")) ?? 0

  const payload = { nome, tipo, cor, ativa, ordem }

  if (id) {
    const { error } = await supabase
      .from("categoria_financeira")
      .update(payload)
      .eq("id", id)
    if (error) return { ok: false, erro: error.message }
    revalidatePath("/dashboard/financeiro", "layout")
    return { ok: true, id }
  } else {
    const { data, error } = await supabase
      .from("categoria_financeira")
      .insert(payload)
      .select("id")
      .single()
    if (error) return { ok: false, erro: error.message }
    revalidatePath("/dashboard/financeiro", "layout")
    return { ok: true, id: data.id as string }
  }
}

export async function excluirCategoriaAction(id: string): Promise<ResultadoFinanceiro> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  // Bloqueia exclusão se a categoria está em uso (lançamentos ou recorrentes).
  const { data: lanc } = await supabase
    .from("lancamento_financeiro")
    .select("id")
    .eq("categoria_id", id)
    .is("deletado_em", null)
    .limit(1)
  if (lanc && lanc.length > 0) {
    return {
      ok: false,
      erro: "Categoria está em uso em lançamentos. Desative em vez de excluir.",
    }
  }
  const { data: rec } = await supabase
    .from("pagamento_recorrente")
    .select("id")
    .eq("categoria_id", id)
    .limit(1)
  if (rec && rec.length > 0) {
    return {
      ok: false,
      erro: "Categoria está em uso em pagamentos recorrentes. Desative em vez de excluir.",
    }
  }

  const { error } = await supabase.from("categoria_financeira").delete().eq("id", id)
  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/financeiro", "layout")
  return { ok: true, id }
}

// ============================================================
// CONTAS
// ============================================================

export async function salvarContaAction(
  formData: FormData
): Promise<ResultadoFinanceiro> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  const id = String(formData.get("id") ?? "").trim() || null
  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { ok: false, erro: "Nome obrigatório." }

  const tipo = String(formData.get("tipo") ?? "")
  if (!tipoContaValido(tipo)) return { ok: false, erro: "Tipo de conta inválido." }

  const saldoParsed = parseNumeroForm(formData.get("saldo_inicial"))
  if (saldoParsed.erro) return { ok: false, erro: `Saldo inicial: ${saldoParsed.erro}` }
  const saldo_inicial = saldoParsed.value ?? 0

  const data_saldo_inicial =
    isoDate(formData.get("data_saldo_inicial")) ?? new Date().toISOString().slice(0, 10)

  const ativa = formData.get("ativa") === "on"
  const ordem = parseInt0(formData.get("ordem")) ?? 0

  const payload = { nome, tipo, saldo_inicial, data_saldo_inicial, ativa, ordem }

  if (id) {
    const { error } = await supabase
      .from("conta_financeira")
      .update(payload)
      .eq("id", id)
    if (error) return { ok: false, erro: error.message }
    revalidatePath("/dashboard/financeiro", "layout")
    return { ok: true, id }
  } else {
    const { data, error } = await supabase
      .from("conta_financeira")
      .insert(payload)
      .select("id")
      .single()
    if (error) return { ok: false, erro: error.message }
    revalidatePath("/dashboard/financeiro", "layout")
    return { ok: true, id: data.id as string }
  }
}

export async function excluirContaAction(id: string): Promise<ResultadoFinanceiro> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  const { data: lanc } = await supabase
    .from("lancamento_financeiro")
    .select("id")
    .eq("conta_id", id)
    .is("deletado_em", null)
    .limit(1)
  if (lanc && lanc.length > 0) {
    return {
      ok: false,
      erro: "Conta está em uso em lançamentos. Desative em vez de excluir.",
    }
  }

  const { error } = await supabase.from("conta_financeira").delete().eq("id", id)
  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/financeiro", "layout")
  return { ok: true, id }
}

// ============================================================
// PAGAMENTOS RECORRENTES
// ============================================================

export async function salvarRecorrenteAction(
  formData: FormData
): Promise<ResultadoFinanceiro> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  const id = String(formData.get("id") ?? "").trim() || null
  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { ok: false, erro: "Nome obrigatório." }

  const tipo = String(formData.get("tipo") ?? "")
  if (!tipoValido(tipo)) return { ok: false, erro: "Tipo inválido." }

  const valorParsed = parseNumeroForm(formData.get("valor"))
  if (valorParsed.erro) return { ok: false, erro: `Valor: ${valorParsed.erro}` }
  if (valorParsed.value === null || valorParsed.value <= 0) {
    return { ok: false, erro: "Valor é obrigatório e maior que zero." }
  }

  const periodicidade = String(formData.get("periodicidade") ?? "")
  if (!periodicidadeValida(periodicidade)) {
    return { ok: false, erro: "Periodicidade inválida (mensal/anual/semanal)." }
  }

  const dia_vencimento = parseInt0(formData.get("dia_vencimento"))
  if (periodicidade === "mensal" && (dia_vencimento === null || dia_vencimento < 1 || dia_vencimento > 31)) {
    return { ok: false, erro: "Dia de vencimento (1-31) é obrigatório para periodicidade mensal." }
  }

  const inicio = isoDate(formData.get("inicio"))
  if (!inicio) return { ok: false, erro: "Data de início inválida." }
  const fim = isoDate(formData.get("fim"))

  const categoria_id = String(formData.get("categoria_id") ?? "").trim() || null
  const conta_id = String(formData.get("conta_id") ?? "").trim() || null
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null
  const ativo = formData.get("ativo") === "on"

  const payload = {
    nome,
    tipo,
    valor: valorParsed.value,
    categoria_id,
    conta_id,
    periodicidade,
    dia_vencimento,
    inicio,
    fim,
    ativo,
    observacoes,
  }

  if (id) {
    const { error } = await supabase
      .from("pagamento_recorrente")
      .update(payload)
      .eq("id", id)
    if (error) return { ok: false, erro: error.message }
    revalidatePath("/dashboard/financeiro", "layout")
    return { ok: true, id }
  } else {
    const { data, error } = await supabase
      .from("pagamento_recorrente")
      .insert(payload)
      .select("id")
      .single()
    if (error) return { ok: false, erro: error.message }
    revalidatePath("/dashboard/financeiro", "layout")
    return { ok: true, id: data.id as string }
  }
}

export async function excluirRecorrenteAction(id: string): Promise<ResultadoFinanceiro> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  // Detacha lançamentos já gerados (FK ON DELETE SET NULL no schema).
  // Recorrentes inativos podem ser desativados em vez de excluídos.
  const { error } = await supabase.from("pagamento_recorrente").delete().eq("id", id)
  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/financeiro", "layout")
  return { ok: true, id }
}

// ============================================================
// MATERIALIZAÇÃO DE RECORRENTES
// ============================================================

/**
 * Server action chamável do client (com auth). Wrapper sobre
 * materializarRecorrentesDoMes que evita o round-trip HTTP via
 * /api/financeiro/materializar (que dependia de cookie de sessão
 * que o Service Worker às vezes intercepta/bloqueia).
 *
 * Os drawers de Lançamento e Recorrente chamam essa direto.
 */
export async function materializarMesAction(
  mes: Mes,
  ano: number
): Promise<{ ok: boolean; criados: number; erro?: string }> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, criados: 0, erro }
  return materializarRecorrentesDoMes(mes, ano)
}

/**
 * Gera os lancamentos previstos do mês/ano informado para todos os
 * recorrentes ativos. Idempotente: antes de inserir, verifica se já
 * existe lançamento com (recorrente_id, ano, mes). Chamado por cron
 * mensal e também via endpoint admin manual.
 *
 * Retorna quantos lançamentos foram criados.
 */
export async function materializarRecorrentesDoMes(
  mes: Mes,
  ano: number
): Promise<{ ok: boolean; criados: number; erro?: string }> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, criados: 0, erro: "supabase_indisponivel" }

  // mesNumero retorna o número do calendário (Abril=4, Maio=5, ...).
  // Não confundir com MESES.indexOf(mes)+1 que dá o índice no array
  // (Abril=1, Maio=2) — esse era o bug: queries filtravam por mês
  // errado e nunca encontravam recorrentes elegíveis.
  const mesNum = mesNumero(mes)
  if (!mesNum || mesNum < 1) return { ok: false, criados: 0, erro: "Mes inválido." }

  const inicio = `${ano}-${String(mesNum).padStart(2, "0")}-01`
  const ultimoDia = new Date(ano, mesNum, 0).getDate()
  const fim = `${ano}-${String(mesNum).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`

  // 1. Recorrentes ativos que cobrem o mês alvo.
  const { data: recs } = await supabase
    .from("pagamento_recorrente")
    .select("id, tipo, valor, categoria_id, conta_id, periodicidade, dia_vencimento, inicio, fim, nome")
    .eq("ativo", true)
    .lte("inicio", fim)
    .or(`fim.is.null,fim.gte.${inicio}`)

  if (!recs || recs.length === 0) return { ok: true, criados: 0 }

  // 2. Para cada recorrente, checar se já existe lancamento no mês (idempotência).
  let criados = 0
  for (const rec of recs as {
    id: string
    tipo: TipoLancamento
    valor: number
    categoria_id: string | null
    conta_id: string | null
    periodicidade: Periodicidade
    dia_vencimento: number | null
    inicio: string
    fim: string | null
    nome: string
  }[]) {
    // Só periodicidade=mensal entra no MVP (anual/semanal viram refinamento depois).
    if (rec.periodicidade !== "mensal") continue
    if (!rec.dia_vencimento) continue

    const { data: existente } = await supabase
      .from("lancamento_financeiro")
      .select("id")
      .eq("recorrente_id", rec.id)
      .gte("data", inicio)
      .lte("data", fim)
      .is("deletado_em", null)
      .maybeSingle()

    if (existente) continue

    // Clampa dia ao último dia do mês se passar (ex.: dia 31 em fevereiro).
    const diaEfetivo = Math.min(rec.dia_vencimento, ultimoDia)
    const dataLanc = `${ano}-${String(mesNum).padStart(2, "0")}-${String(diaEfetivo).padStart(2, "0")}`

    const { error: errInsert } = await supabase.from("lancamento_financeiro").insert({
      data: dataLanc,
      data_pagamento: null,
      tipo: rec.tipo,
      valor: rec.valor,
      categoria_id: rec.categoria_id,
      conta_id: rec.conta_id,
      descricao: rec.nome,
      recorrente_id: rec.id,
      status: "previsto",
    })

    if (errInsert) {
      console.error("[financeiro] materializar insert error", errInsert.message, rec.id)
      continue
    }

    await supabase
      .from("pagamento_recorrente")
      .update({ ultimo_lancamento_gerado: dataLanc })
      .eq("id", rec.id)

    criados += 1
  }

  revalidatePath("/dashboard/financeiro", "layout")
  return { ok: true, criados }
}
