"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual, temPermissao } from "./auth"
import { traduzirErroBanco } from "./financeiro-erros"
import { ErroOFX, parseOFX } from "./ofx"

/**
 * Importação de extrato, em dois tempos.
 *
 * Tempo 1 (`lerExtratoAction`): o arquivo é lido, as linhas são gravadas como
 * `pendente` e as regras aprendidas dão um palpite de conta/categoria.
 * NENHUM lançamento é criado.
 *
 * Tempo 2 (`confirmarExtratoAction`): a pessoa revisa e confirma. Só aí
 * viram lançamento.
 *
 * O motivo de não ser um passo só: um extrato do mês inteiro entrando direto
 * no caixa, com categorias adivinhadas, seria impossível de desfazer.
 */

export interface LinhaExtratoUI {
  id: string
  fitid: string
  data: string
  hora: string | null
  valor: number
  tipo: "receita" | "despesa"
  descricao: string
  trntype: string | null
  conta_id: string | null
  categoria_id: string | null
  classificacao_origem: "regra" | "manual" | null
}

/**
 * O placar que a tela mostra depois de ler o arquivo. Ele existe pra
 * responder de cara a pergunta que todo mundo faz ao reimportar: "isso vai
 * duplicar alguma coisa?".
 */
export interface PlacarExtrato {
  /** Transações lidas do arquivo. */
  noArquivo: number
  /** Já viraram lançamento numa importação anterior — ficam de fora. */
  jaLancadas: number
  /** Estavam pendentes de um envio anterior e voltam para esta revisão. */
  retomadas: number
  /** Foram ignoradas antes e continuam de fora. */
  ignoradasAntes: number
  /** Entraram agora, pela primeira vez. */
  novas: number
  /** novas + retomadas — o que realmente precisa de conferência. */
  aRevisar: number
  /** Dessas, quantas já chegaram com palpite das regras. */
  jaClassificadas: number
  /** Repetidas dentro do próprio arquivo. */
  duplicadasNoArquivo: number
}

export interface ResultadoLeitura {
  ok: boolean
  erro?: string
  extratoId?: string
  arquivo?: string
  placar?: PlacarExtrato
  linhas?: LinhaExtratoUI[]
}

async function exigirPermissao(): Promise<{ usuarioId: string; erro?: string }> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { usuarioId: "", erro: "nao_autenticado" }
  if (!temPermissao(usuario, "dashboard_financeiro")) {
    return { usuarioId: "", erro: "sem_permissao" }
  }
  return { usuarioId: usuario.id }
}

function revalidar(): void {
  revalidatePath("/dashboard/financeiro", "layout")
  revalidatePath("/dashboard")
}

// ============================================================
// Tempo 1 — ler e registrar
// ============================================================

export async function lerExtratoAction(formData: FormData): Promise<ResultadoLeitura> {
  const { usuarioId, erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Escolha um arquivo .ofx exportado do seu banco." }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  // Quem valida o formato é o servidor, não o `accept` do input — ver o
  // comentário na página sobre o iPhone.
  let extrato
  try {
    extrato = parseOFX(new Uint8Array(await arquivo.arrayBuffer()))
  } catch (e) {
    if (e instanceof ErroOFX) return { ok: false, erro: e.message }
    console.error("[extrato] parse error", e)
    return { ok: false, erro: "Não foi possível ler o arquivo." }
  }

  const fitids = extrato.transacoes.map((t) => t.fitid)

  // O que o banco já conhece desses FITIDs. É o que separa "já lançada" de
  // "retomada" de "ignorada antes".
  const { data: conhecidas, error: errConhecidas } = await supabase
    .from("extrato_linhas")
    .select("id, fitid, status")
    .in("fitid", fitids)
  if (errConhecidas) {
    return { ok: false, erro: traduzirErroBanco(errConhecidas, "conferir o histórico") }
  }

  const porFitid = new Map(
    ((conhecidas ?? []) as { id: string; fitid: string; status: string }[]).map((l) => [
      l.fitid,
      l,
    ])
  )

  const { data: cabecalho, error: errCab } = await supabase
    .from("extratos_importados")
    .insert({
      arquivo_nome: arquivo.name,
      banco_id: extrato.banco_id,
      conta_externa: extrato.conta_externa,
      periodo_de: extrato.periodo_de,
      periodo_ate: extrato.periodo_ate,
      saldo_final: extrato.saldo_final,
      total_linhas: extrato.transacoes.length,
      importado_por: usuarioId,
    })
    .select("id")
    .single()
  if (errCab || !cabecalho) {
    return { ok: false, erro: traduzirErroBanco(errCab, "registrar o extrato") }
  }
  const extratoId = cabecalho.id as string

  const placar: PlacarExtrato = {
    noArquivo: extrato.transacoes.length,
    jaLancadas: 0,
    retomadas: 0,
    ignoradasAntes: 0,
    novas: 0,
    aRevisar: 0,
    jaClassificadas: 0,
    duplicadasNoArquivo: extrato.duplicadasNoArquivo,
  }

  const inserir: Record<string, unknown>[] = []
  const retomar: string[] = []

  for (const t of extrato.transacoes) {
    const conhecida = porFitid.get(t.fitid)

    if (conhecida?.status === "importada") {
      placar.jaLancadas += 1
      continue
    }
    if (conhecida?.status === "ignorada") {
      placar.ignoradasAntes += 1
      continue
    }
    if (conhecida?.status === "pendente") {
      // Ficou pendente de um envio anterior: em vez de duplicar, traz a
      // mesma linha para esta revisão.
      retomar.push(conhecida.id)
      placar.retomadas += 1
      continue
    }

    inserir.push({
      extrato_id: extratoId,
      fitid: t.fitid,
      data: t.data,
      hora: t.hora,
      valor: t.valor,
      tipo: t.tipo,
      descricao: t.descricao,
      trntype: t.trntype,
      status: "pendente",
    })
    placar.novas += 1
  }

  if (retomar.length > 0) {
    const { error } = await supabase
      .from("extrato_linhas")
      .update({ extrato_id: extratoId })
      .in("id", retomar)
    if (error) return { ok: false, erro: traduzirErroBanco(error, "retomar linhas pendentes") }
  }

  if (inserir.length > 0) {
    const { error } = await supabase.from("extrato_linhas").insert(inserir)
    if (error) return { ok: false, erro: traduzirErroBanco(error, "gravar as linhas") }
  }

  placar.aRevisar = placar.novas + placar.retomadas

  // Palpite das regras aprendidas, numa chamada só para o extrato inteiro.
  if (placar.aRevisar > 0) {
    const { data: classificadas, error: errSug } = await supabase.rpc(
      "fn_sugerir_classificacao_extrato",
      { p_extrato_id: extratoId }
    )
    if (errSug) {
      // Falhar aqui não invalida a importação: as linhas estão gravadas e a
      // pessoa classifica à mão.
      console.error("[extrato] sugerir error", errSug.message)
    } else {
      placar.jaClassificadas = Number(classificadas ?? 0)
    }
  }

  const linhas = await listarLinhasPendentes(extratoId)
  revalidar()
  return { ok: true, extratoId, arquivo: arquivo.name, placar, linhas }
}

async function listarLinhasPendentes(extratoId: string): Promise<LinhaExtratoUI[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("extrato_linhas")
    .select(
      "id, fitid, data, hora, valor, tipo, descricao, trntype, conta_id, categoria_id, classificacao_origem"
    )
    .eq("extrato_id", extratoId)
    .eq("status", "pendente")
    .order("data", { ascending: true })
  if (error) {
    console.error("[extrato] listar pendentes error", error.message)
    return []
  }
  return (data ?? []) as unknown as LinhaExtratoUI[]
}

// ============================================================
// Tempo 2 — confirmar e ignorar
// ============================================================

export interface LinhaParaConfirmar {
  id: string
  conta_id: string | null
  categoria_id: string | null
  descricao: string
}

export async function confirmarExtratoAction(
  linhas: LinhaParaConfirmar[]
): Promise<{ ok: boolean; criados: number; semConta: number; erro?: string }> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, criados: 0, semConta: 0, erro }
  if (linhas.length === 0) {
    return { ok: false, criados: 0, semConta: 0, erro: "Nenhuma linha marcada." }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, criados: 0, semConta: 0, erro: "supabase_indisponivel" }

  // Toda a criação acontece dentro da função do banco, numa transação só.
  const { data, error } = await supabase.rpc("fn_confirmar_extrato", {
    p_linhas: linhas,
  })

  if (error) {
    console.error("[extrato] confirmar error", error.message)
    return { ok: false, criados: 0, semConta: 0, erro: traduzirErroBanco(error, "importar") }
  }

  const r = (data ?? {}) as { criados?: number; sem_conta?: number }
  revalidar()
  return { ok: true, criados: Number(r.criados ?? 0), semConta: Number(r.sem_conta ?? 0) }
}

export async function ignorarLinhasAction(
  ids: string[]
): Promise<{ ok: boolean; ignoradas: number; erro?: string }> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, ignoradas: 0, erro }
  if (ids.length === 0) return { ok: false, ignoradas: 0, erro: "Nenhuma linha marcada." }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, ignoradas: 0, erro: "supabase_indisponivel" }

  // Ignorada ≠ apagada: a linha continua guardada e, no próximo arquivo com o
  // mesmo FITID, o placar sabe dizer "você já tinha ignorado isso".
  const { data, error } = await supabase
    .from("extrato_linhas")
    .update({ status: "ignorada" })
    .in("id", ids)
    .eq("status", "pendente")
    .select("id")

  if (error) return { ok: false, ignoradas: 0, erro: traduzirErroBanco(error, "ignorar") }
  revalidar()
  return { ok: true, ignoradas: data?.length ?? 0 }
}

/** Marca a classificação de uma linha como MANUAL — a partir daí, nenhuma
 *  regra sobrescreve a escolha da pessoa. */
export async function classificarLinhaAction(
  id: string,
  conta_id: string | null,
  categoria_id: string | null
): Promise<{ ok: boolean; erro?: string }> {
  const { erro } = await exigirPermissao()
  if (erro) return { ok: false, erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "supabase_indisponivel" }

  const { error } = await supabase
    .from("extrato_linhas")
    .update({ conta_id, categoria_id, classificacao_origem: "manual" })
    .eq("id", id)
    .eq("status", "pendente")

  if (error) return { ok: false, erro: traduzirErroBanco(error, "classificar") }
  return { ok: true }
}
