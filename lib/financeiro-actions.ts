"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual, temPermissao } from "./auth"
import { parseNumeroForm } from "./parse-numero"
import { conferirLinhasAfetadas, traduzirErroBanco } from "./financeiro-erros"
import { proximaCorLivre } from "./financeiro-regras"
import { type Mes } from "./data"
import {
  contarUsoCategoria,
  mesNumero,
  rangeDoMesNumISO,
  type TipoLancamento,
  type StatusLancamento,
  type TipoConta,
  type Periodicidade,
} from "./financeiro"
import { recorrentesAMaterializar } from "./financeiro-regras"

/**
 * Invalida o financeiro E o painel. O painel mostra dinheiro do mês; se só o
 * financeiro fosse revalidado, o número do painel continuaria velho até a
 * próxima navegação completa.
 */
function revalidarFinanceiro(): void {
  revalidatePath("/dashboard/financeiro", "layout")
  revalidatePath("/dashboard")
}

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

function texto(fd: FormData, campo: string): string | null {
  return String(fd.get(campo) ?? "").trim() || null
}

/** Hoje em São Paulo. `new Date().toISOString()` daria o dia seguinte depois
 *  das 21h, jogando o pagamento pro mês errado na virada do mês. */
function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/**
 * Campos que criar e editar compartilham. Devolve o payload ou a mensagem de
 * erro — as duas actions divergiam em validação antes de existir este ponto
 * comum (só uma checava tamanho mínimo, por exemplo).
 */
function lerCamposLancamento(
  formData: FormData
): { erro: string } | { payload: Record<string, unknown> } {
  const tipo = String(formData.get("tipo") ?? "")
  if (!tipoValido(tipo)) return { erro: "Tipo inválido (receita/despesa)." }

  const status = String(formData.get("status") ?? "previsto")
  if (!statusValido(status)) return { erro: "Status inválido." }

  const valorParsed = parseNumeroForm(formData.get("valor"))
  if (valorParsed.erro) return { erro: `Valor: ${valorParsed.erro}` }
  if (valorParsed.value === null || valorParsed.value <= 0) {
    return { erro: "Valor é obrigatório e maior que zero." }
  }

  const descricao = String(formData.get("descricao") ?? "").trim()
  if (descricao.length < 2) {
    return { erro: "Descrição precisa de pelo menos 2 caracteres." }
  }

  const data = isoDate(formData.get("data"))
  if (!data) return { erro: "Data de competência inválida (use AAAA-MM-DD)." }

  const data_vencimento = isoDate(formData.get("data_vencimento"))
  let data_pagamento = isoDate(formData.get("data_pagamento"))

  // R8. Realizado sem data de pagamento assume HOJE em vez de recusar o
  // salvamento. Antes isso barrava quem só queria registrar algo já pago, e a
  // data acabava digitada errada na pressa.
  if (status === "realizado" && !data_pagamento) data_pagamento = hojeISO()
  // Voltar para previsto solta a data de pagamento: um previsto com data de
  // pagamento preenchida entraria no saldo da conta sem estar realizado.
  if (status !== "realizado") data_pagamento = null

  return {
    payload: {
      data,
      data_vencimento,
      data_pagamento,
      tipo,
      valor: valorParsed.value,
      categoria_id: texto(formData, "categoria_id"),
      conta_id: texto(formData, "conta_id"),
      descricao,
      observacoes: texto(formData, "observacoes"),
      empresa_cliente: texto(formData, "empresa_cliente"),
      origem: texto(formData, "origem"),
      forma_pagamento: texto(formData, "forma_pagamento"),
      status,
    },
  }
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

  const lido = lerCamposLancamento(formData)
  if ("erro" in lido) return { ok: false, erro: lido.erro }

  const { data: row, error } = await supabase
    .from("lancamento_financeiro")
    .insert({ ...lido.payload, criado_por: usuarioId })
    .select("id")
    .single()

  if (error) {
    console.error("[financeiro] criarLancamento error", error.message)
    return { ok: false, erro: traduzirErroBanco(error) }
  }

  revalidarFinanceiro()
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

  const lido = lerCamposLancamento(formData)
  if ("erro" in lido) return { ok: false, erro: lido.erro }

  const { error } = await supabase
    .from("lancamento_financeiro")
    .update(lido.payload)
    .eq("id", id)

  if (error) {
    console.error("[financeiro] atualizarLancamento error", error.message)
    return { ok: false, erro: traduzirErroBanco(error) }
  }

  revalidarFinanceiro()
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
  revalidarFinanceiro()
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
  revalidarFinanceiro()
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
    revalidarFinanceiro()
    return { ok: true, id }
  } else {
    const { data, error } = await supabase
      .from("categoria_financeira")
      .insert(payload)
      .select("id")
      .single()
    if (error) return { ok: false, erro: error.message }
    revalidarFinanceiro()
    return { ok: true, id: data.id as string }
  }
}

/**
 * Cria (ou reaproveita) uma categoria a partir do nome digitado no combobox.
 *
 * Reaproveitar é o ponto: digitar "aluguel" quando já existe "Aluguel" tem que
 * selecionar a que existe, não criar uma segunda. Sem isso, o DRE acaba com a
 * mesma despesa dividida em duas linhas por diferença de maiúscula.
 *
 * A cor não é escolhida aqui: a categoria nasce com a primeira cor livre da
 * paleta, pra não sair tudo cinza nem repetir a cor da vizinha.
 */
export async function criarCategoriaRapidaAction(
  nome: string,
  tipo: string
): Promise<ResultadoFinanceiro & { nome?: string; cor?: string }> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }
  if (!tipoValido(tipo)) return { ok: false, erro: "Tipo inválido." }

  const limpo = nome.trim()
  if (limpo.length < 2) {
    return { ok: false, erro: "Nome precisa de pelo menos 2 caracteres." }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  const { data: existentes, error: errBusca } = await supabase
    .from("categoria_financeira")
    .select("id, nome, cor, ativa")
    .eq("tipo", tipo)
  if (errBusca) return { ok: false, erro: traduzirErroBanco(errBusca) }

  const lista = (existentes ?? []) as {
    id: string
    nome: string
    cor: string | null
    ativa: boolean
  }[]

  const igual = lista.find(
    (c) => c.nome.trim().toLowerCase() === limpo.toLowerCase()
  )
  if (igual) {
    // Se estava desativada, reativa: o usuário acabou de pedir por ela.
    if (!igual.ativa) {
      await supabase
        .from("categoria_financeira")
        .update({ ativa: true })
        .eq("id", igual.id)
    }
    revalidarFinanceiro()
    return { ok: true, id: igual.id, nome: igual.nome, cor: igual.cor ?? undefined }
  }

  const cor = proximaCorLivre(lista.map((c) => c.cor))
  const { data, error } = await supabase
    .from("categoria_financeira")
    .insert({ nome: limpo, tipo, cor, ativa: true, ordem: 0 })
    .select("id, nome, cor")
    .single()
  if (error) return { ok: false, erro: traduzirErroBanco(error) }

  revalidarFinanceiro()
  return { ok: true, id: data.id as string, nome: data.nome as string, cor: data.cor as string }
}

/** O que o usuário escolheu no diálogo de exclusão. */
export type ModoExclusaoCategoria = "desativar" | "excluir"

export interface ResultadoExclusaoCategoria extends ResultadoFinanceiro {
  /** Quantos vínculos ficaram sem categoria. */
  soltos?: number
}

/**
 * R9. Exclusão de categoria com as duas saídas honestas.
 *
 * Antes isto simplesmente BLOQUEAVA quando a categoria estava em uso, e a
 * pessoa ficava sem opção: a categoria errada continuava na lista pra sempre.
 * Agora o diálogo conta o uso e oferece o que realmente se quer em cada caso:
 *
 *   • desativar — some das listas de escolha, o histórico continua exibindo
 *     o nome. É o recomendado, e é o que quase todo mundo quer de fato.
 *
 *   • excluir — os vínculos são SOLTOS (viram "Sem categoria") e a categoria
 *     some. Nenhum lançamento é apagado: dinheiro não sai em cascata.
 *
 * Não é transacional (são passos sequenciais). É aceitável porque nenhum
 * passo destrói informação: se parar no meio, sobram lançamentos sem
 * categoria e a categoria ainda existe — estado consistente e reversível.
 */
export async function excluirCategoriaAction(
  id: string,
  modo: ModoExclusaoCategoria = "excluir"
): Promise<ResultadoExclusaoCategoria> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  if (modo === "desativar") {
    const { data, error } = await supabase
      .from("categoria_financeira")
      .update({ ativa: false })
      .eq("id", id)
      .select("id")
    if (error) return { ok: false, erro: traduzirErroBanco(error) }
    const semPermissao = conferirLinhasAfetadas(data, "desativar a categoria")
    if (semPermissao) return { ok: false, erro: semPermissao }
    revalidarFinanceiro()
    return { ok: true, id }
  }

  // Solta os vínculos antes de remover. A FK é ON DELETE SET NULL, mas fazer
  // explicitamente permite CONTAR quantos foram soltos e avisar o usuário.
  let soltos = 0

  const { data: lancSoltos, error: errLanc } = await supabase
    .from("lancamento_financeiro")
    .update({ categoria_id: null })
    .eq("categoria_id", id)
    .select("id")
  if (errLanc) return { ok: false, erro: traduzirErroBanco(errLanc) }
  soltos += lancSoltos?.length ?? 0

  const { data: recSoltos, error: errRec } = await supabase
    .from("pagamento_recorrente")
    .update({ categoria_id: null })
    .eq("categoria_id", id)
    .select("id")
  if (errRec) return { ok: false, erro: traduzirErroBanco(errRec) }
  soltos += recSoltos?.length ?? 0

  // `.select()` no delete não é enfeite: um delete barrado pela RLS devolve
  // ZERO linhas SEM erro, e a tela diria "excluída" com a categoria ainda lá.
  const { data: removidas, error } = await supabase
    .from("categoria_financeira")
    .delete()
    .eq("id", id)
    .select("id")
  if (error) return { ok: false, erro: traduzirErroBanco(error) }
  const semPermissao = conferirLinhasAfetadas(removidas, "excluir a categoria")
  if (semPermissao) return { ok: false, erro: semPermissao }

  revalidarFinanceiro()
  return { ok: true, id, soltos }
}

/** Contagem de uso, pro diálogo perguntar já sabendo o tamanho do estrago. */
export async function contarUsoCategoriaAction(
  id: string
): Promise<{ ok: boolean; lancamentos: number; recorrentes: number; erro?: string }> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, lancamentos: 0, recorrentes: 0, erro }
  const uso = await contarUsoCategoria(id)
  return { ok: true, lancamentos: uso.lancamentos, recorrentes: uso.recorrentes }
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
    revalidarFinanceiro()
    return { ok: true, id }
  } else {
    const { data, error } = await supabase
      .from("conta_financeira")
      .insert(payload)
      .select("id")
      .single()
    if (error) return { ok: false, erro: error.message }
    revalidarFinanceiro()
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
  revalidarFinanceiro()
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
    // Recorrente sempre materializa como previsto; mantém a coluna fixa
    // por compatibilidade (status_padrao foi descontinuado na UI).
    status_padrao: "previsto",
  }

  if (id) {
    const { error } = await supabase
      .from("pagamento_recorrente")
      .update(payload)
      .eq("id", id)
    if (error) return { ok: false, erro: error.message }
    revalidarFinanceiro()
    return { ok: true, id }
  } else {
    const { data, error } = await supabase
      .from("pagamento_recorrente")
      .insert(payload)
      .select("id")
      .single()
    if (error) return { ok: false, erro: error.message }
    revalidarFinanceiro()
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
  revalidarFinanceiro()
  return { ok: true, id }
}

// ============================================================
// MATERIALIZAÇÃO DE RECORRENTES
// ============================================================

export interface ResultadoMaterializacao {
  ok: boolean
  criados: number
  erro?: string
}

/**
 * Server action chamável do client (com auth). Wrapper sobre
 * materializarRecorrentesDoPeriodo que evita o round-trip HTTP via
 * /api/financeiro/materializar (que dependia de cookie de sessão que o
 * Service Worker às vezes intercepta/bloqueia).
 *
 * `mes` é o mês do CALENDÁRIO (1–12), não o tipo `Mes`: gerar os recorrentes
 * de janeiro precisa ser possível.
 */
export async function materializarPeriodoAction(
  ano: number,
  mes: number
): Promise<ResultadoMaterializacao> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, criados: 0, erro }
  return materializarRecorrentesDoPeriodo(ano, mes)
}

/** Forma antiga, por nome de mês. Mantida para os call-sites existentes. */
export async function materializarMesAction(
  mes: Mes,
  ano: number
): Promise<ResultadoMaterializacao> {
  return materializarPeriodoAction(ano, mesNumero(mes))
}

/** Idem, sem checagem de permissão (uso interno/cron). */
export async function materializarRecorrentesDoMes(
  mes: Mes,
  ano: number
): Promise<ResultadoMaterializacao> {
  return materializarRecorrentesDoPeriodo(ano, mesNumero(mes))
}

/**
 * Gera os lançamentos previstos de um mês para todos os recorrentes ativos.
 *
 * Quem decide o QUE gerar e em QUE DIA é `recorrentesAMaterializar`
 * (lib/financeiro-regras.ts) — função pura, coberta por teste, inclusive nos
 * casos de borda que sempre mordem: dia 31 em fevereiro, recorrente já
 * encerrado, e rodar duas vezes o mesmo mês.
 *
 * Idempotência em duas camadas: a consulta dos já gerados (aqui) e o índice
 * único parcial no banco (migração 20260920), que cobre o caso de dois
 * cliques simultâneos passarem juntos pela consulta. Por isso o erro 23505 é
 * tratado como "já existe" e não como falha.
 *
 * Retorna quantos lançamentos foram criados.
 */
export async function materializarRecorrentesDoPeriodo(
  ano: number,
  mes: number
): Promise<ResultadoMaterializacao> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, criados: 0, erro: "supabase_indisponivel" }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return { ok: false, criados: 0, erro: "Mês inválido." }
  }

  const { inicio, fim } = rangeDoMesNumISO(ano, mes)

  // 1. Recorrentes ativos que podem cobrir o mês. O filtro fino (periodicidade,
  //    dia, início/fim) é da função pura — aqui só evitamos trazer a tabela toda.
  const { data: recs, error: errRecs } = await supabase
    .from("pagamento_recorrente")
    .select(
      "id, tipo, valor, categoria_id, conta_id, periodicidade, dia_vencimento, inicio, fim, nome, ativo"
    )
    .eq("ativo", true)
    .lte("inicio", fim)
    .or(`fim.is.null,fim.gte.${inicio}`)

  if (errRecs) {
    console.error("[financeiro] materializar recorrentes error", errRecs.message)
    return { ok: false, criados: 0, erro: errRecs.message }
  }
  if (!recs || recs.length === 0) return { ok: true, criados: 0 }

  // 2. Quem já tem lançamento no mês (uma consulta só, não uma por recorrente).
  const { data: existentes, error: errExist } = await supabase
    .from("lancamento_financeiro")
    .select("recorrente_id")
    .not("recorrente_id", "is", null)
    .gte("data", inicio)
    .lte("data", fim)
    .is("deletado_em", null)

  if (errExist) {
    console.error("[financeiro] materializar existentes error", errExist.message)
    return { ok: false, criados: 0, erro: errExist.message }
  }

  const jaGerados = ((existentes ?? []) as { recorrente_id: string }[]).map(
    (e) => e.recorrente_id
  )

  type RecRow = {
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
    ativo: boolean
  }

  const aCriar = recorrentesAMaterializar(recs as RecRow[], jaGerados, ano, mes)
  if (aCriar.length === 0) return { ok: true, criados: 0 }

  let criados = 0
  for (const { recorrente: rec, data: dataLanc } of aCriar) {
    // Nasce PREVISTO e sem data de pagamento: aparece em "Vencimentos em
    // aberto" e só entra no caixa quando alguém marcar como pago.
    // Competência e vencimento coincidem — é uma conta do mês.
    const { error: errInsert } = await supabase.from("lancamento_financeiro").insert({
      data: dataLanc,
      data_vencimento: dataLanc,
      data_pagamento: null,
      tipo: rec.tipo,
      valor: rec.valor,
      categoria_id: rec.categoria_id,
      conta_id: rec.conta_id,
      descricao: rec.nome,
      recorrente_id: rec.id,
      origem: "Recorrente",
      status: "previsto",
    })

    if (errInsert) {
      // 23505 = o índice único pegou uma corrida. O lançamento existe, que é
      // o resultado desejado — não é erro.
      if (errInsert.code === "23505") continue
      console.error("[financeiro] materializar insert error", errInsert.message, rec.id)
      continue
    }

    await supabase
      .from("pagamento_recorrente")
      .update({ ultimo_lancamento_gerado: dataLanc })
      .eq("id", rec.id)

    criados += 1
  }

  revalidarFinanceiro()
  return { ok: true, criados }
}
