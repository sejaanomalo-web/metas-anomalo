"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { getUsuarioAtual, temPermissao, type UsuarioSessao } from "./auth"
import { dataValida } from "./funil-calculo"
import { parseNumeroForm } from "./parse-numero"
import { getSupabaseAdmin } from "./supabase"
import { erroDeTabelaAusente } from "./funis-comerciais"
import {
  MAX_ETAPAS,
  MAX_NOME_ETAPA,
  MAX_NOME_FUNIL,
  MAX_OBSERVACOES,
  MAX_VALOR_ETAPA,
  MIN_ETAPAS,
  type EtapaFunil,
  type FunilComercial,
  type ResultadoFunil,
} from "./funil-tipos"

/**
 * Escrita dos funis comerciais. Toda action de "use server" é um endpoint
 * público, chamável sem passar pela tela. Por isso cada uma confere a sessão, a
 * permissão do Comercial e o DONO do funil, sempre a partir do registro no
 * banco e nunca de um dado enviado pelo formulário.
 *
 * Regra de acesso: cada pessoa mexe só nos próprios funis. Admin mexe em todos.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEM_ACESSO = "Você não tem acesso a este funil."
const MIGRATION_PENDENTE =
  "O banco ainda não tem as tabelas dos funis. Aplique a migration 20261106_comercial_funis."

async function usuarioDoComercial(): Promise<UsuarioSessao | null> {
  const usuario = await getUsuarioAtual()
  return temPermissao(usuario, "dashboard_comercial") ? usuario : null
}

function podeMexerNoFunil(
  usuario: UsuarioSessao,
  funil: { usuario_id: string }
): boolean {
  return usuario.papel === "admin" || funil.usuario_id === usuario.id
}

async function buscarFunil(id: unknown): Promise<FunilComercial | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("funis_comerciais")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    console.error("[funis] buscar funil error", error.message)
    return null
  }
  return (data as FunilComercial | null) ?? null
}

function revalidar() {
  revalidatePath("/dashboard/comercial", "layout")
}

function erroDeGravacao(
  contexto: string,
  error: { code?: string; message: string }
): ResultadoFunil {
  if (erroDeTabelaAusente(error)) return { ok: false, erro: MIGRATION_PENDENTE }
  console.error(`[funis] ${contexto} error`, error.message)
  return { ok: false, erro: "Não foi possível salvar. Tente de novo." }
}

// ── Funil ───────────────────────────────────────────────────────────────────

export interface EntradaFunil {
  /** Ausente = criar. */
  id?: string
  /** Só admin usa, para criar funil para outra pessoa. */
  usuarioId?: string
  nome: string
  descricao?: string
  etapas: { id?: string; nome: string }[]
}

/**
 * Valida a lista de etapas. Id só é mantido se já existe no funil: é ele que
 * liga a etapa aos números lançados. Qualquer outro recebe um id novo gerado
 * aqui.
 */
function normalizarEtapas(
  entrada: unknown,
  idsExistentes: Set<string>
): { etapas: EtapaFunil[] } | { erro: string } {
  if (!Array.isArray(entrada)) return { erro: "Etapas inválidas." }
  if (entrada.length < MIN_ETAPAS) {
    return { erro: `O funil precisa de pelo menos ${MIN_ETAPAS} etapas.` }
  }
  if (entrada.length > MAX_ETAPAS) {
    return { erro: `O funil pode ter no máximo ${MAX_ETAPAS} etapas.` }
  }
  const nomes = new Set<string>()
  const ids = new Set<string>()
  const etapas: EtapaFunil[] = []
  for (const bruta of entrada as { id?: unknown; nome?: unknown }[]) {
    const nome = String(bruta?.nome ?? "").trim()
    if (!nome) return { erro: "Dê um nome para todas as etapas." }
    if (nome.length > MAX_NOME_ETAPA) {
      return { erro: `Nome de etapa com mais de ${MAX_NOME_ETAPA} caracteres.` }
    }
    const chave = nome.toLocaleLowerCase("pt-BR")
    if (nomes.has(chave)) return { erro: `A etapa "${nome}" está repetida.` }
    nomes.add(chave)
    const idBruto = typeof bruta?.id === "string" ? bruta.id : ""
    const id =
      idsExistentes.has(idBruto) && !ids.has(idBruto) ? idBruto : randomUUID()
    ids.add(id)
    etapas.push({ id, nome })
  }
  return { etapas }
}

export async function salvarFunilAction(
  entrada: EntradaFunil
): Promise<ResultadoFunil> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const nome = String(entrada?.nome ?? "").trim()
  if (!nome) return { ok: false, erro: "Dê um nome para o funil." }
  if (nome.length > MAX_NOME_FUNIL) {
    return { ok: false, erro: `Nome com mais de ${MAX_NOME_FUNIL} caracteres.` }
  }
  const descricao = String(entrada?.descricao ?? "").trim().slice(0, 300) || null

  const existente = entrada?.id ? await buscarFunil(entrada.id) : null
  if (entrada?.id) {
    if (!existente || !podeMexerNoFunil(usuario, existente)) {
      return { ok: false, erro: SEM_ACESSO }
    }
  }

  const normalizadas = normalizarEtapas(
    entrada?.etapas,
    new Set((existente?.etapas ?? []).map((e) => e.id))
  )
  if ("erro" in normalizadas) return { ok: false, erro: normalizadas.erro }

  const consulta = existente
    ? supabase
        .from("funis_comerciais")
        .update({
          nome,
          descricao,
          etapas: normalizadas.etapas,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existente.id)
    : supabase.from("funis_comerciais").insert({
        // Só admin escolhe o dono. Qualquer outro cria sempre para si.
        usuario_id:
          usuario.papel === "admin" &&
          typeof entrada?.usuarioId === "string" &&
          UUID.test(entrada.usuarioId)
            ? entrada.usuarioId
            : usuario.id,
        nome,
        descricao,
        etapas: normalizadas.etapas,
      })
  const { data, error } = await consulta.select("id").single()
  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um funil com esse nome." }
    }
    return erroDeGravacao("salvar funil", error)
  }
  revalidar()
  return { ok: true, id: (data as { id: string }).id }
}

/** Apaga o funil e, por CASCADE, todos os lançamentos dele. */
export async function excluirFunilAction(id: string): Promise<ResultadoFunil> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  const funil = await buscarFunil(id)
  if (!funil || !podeMexerNoFunil(usuario, funil)) {
    return { ok: false, erro: SEM_ACESSO }
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }
  const { error } = await supabase
    .from("funis_comerciais")
    .delete()
    .eq("id", funil.id)
  if (error) return erroDeGravacao("excluir funil", error)
  revalidar()
  return { ok: true }
}

// ── Lançamento ──────────────────────────────────────────────────────────────

function moedaDoForm(
  v: FormDataEntryValue | null,
  rotulo: string
): { valor: number } | { erro: string } {
  const r = parseNumeroForm(v)
  if (r.erro) return { erro: r.erro }
  const valor = r.value ?? 0
  if (valor < 0) return { erro: `${rotulo} não pode ser negativo.` }
  if (valor >= 1e12) return { erro: `${rotulo} acima do limite.` }
  return { valor }
}

function inteiroDoForm(v: FormDataEntryValue | null): number | null {
  const bruto = String(v ?? "").trim()
  if (bruto === "") return 0
  if (!/^\d+$/.test(bruto)) return null
  const n = parseInt(bruto, 10)
  return n <= MAX_VALOR_ETAPA ? n : null
}

/** Cria ou edita. Lançamento novo soma com os demais da mesma data. */
export async function salvarLancamentoAction(
  formData: FormData
): Promise<ResultadoFunil> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const lancamentoId = String(formData.get("id") ?? "").trim()
  let funilId = String(formData.get("funil_id") ?? "").trim()

  // Na edição, o funil vem do registro gravado. Um funil_id enviado pelo
  // formulário permitiria mover o lançamento para o funil de outra pessoa.
  if (lancamentoId) {
    if (!UUID.test(lancamentoId)) return { ok: false, erro: SEM_ACESSO }
    const { data, error } = await supabase
      .from("funil_lancamentos")
      .select("funil_id")
      .eq("id", lancamentoId)
      .maybeSingle()
    if (error) return erroDeGravacao("buscar lancamento", error)
    if (!data) return { ok: false, erro: "Esse lançamento não existe mais." }
    funilId = (data as { funil_id: string }).funil_id
  }

  const funil = await buscarFunil(funilId)
  if (!funil || !podeMexerNoFunil(usuario, funil)) {
    return { ok: false, erro: SEM_ACESSO }
  }

  const data = String(formData.get("data") ?? "").trim()
  if (!dataValida(data)) return { ok: false, erro: "Informe uma data válida." }

  const investimento = moedaDoForm(formData.get("investimento"), "Investimento")
  if ("erro" in investimento) return { ok: false, erro: investimento.erro }
  const faturamento = moedaDoForm(formData.get("faturamento"), "Faturamento")
  if ("erro" in faturamento) return { ok: false, erro: faturamento.erro }

  const perdidos = inteiroDoForm(formData.get("perdidos"))
  if (perdidos === null) return { ok: false, erro: "Perdidos inválido." }

  // Só as etapas que existem no funil são gravadas.
  const valores: Record<string, number> = {}
  for (const etapa of funil.etapas) {
    const n = inteiroDoForm(formData.get(`etapa_${etapa.id}`))
    if (n === null) {
      return { ok: false, erro: `Valor inválido em "${etapa.nome}".` }
    }
    if (n > 0) valores[etapa.id] = n
  }

  if (
    Object.keys(valores).length === 0 &&
    investimento.valor === 0 &&
    faturamento.valor === 0 &&
    perdidos === 0
  ) {
    return { ok: false, erro: "Preencha pelo menos um número." }
  }

  const campos = {
    data,
    investimento: investimento.valor,
    faturamento: faturamento.valor,
    perdidos,
    valores,
    observacoes:
      String(formData.get("observacoes") ?? "")
        .trim()
        .slice(0, MAX_OBSERVACOES) || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = lancamentoId
    ? await supabase
        .from("funil_lancamentos")
        .update(campos)
        .eq("id", lancamentoId)
    : await supabase
        .from("funil_lancamentos")
        .insert({ ...campos, funil_id: funil.id, criado_por: usuario.id })
  if (error) return erroDeGravacao("salvar lancamento", error)
  revalidar()
  return { ok: true }
}

export async function excluirLancamentoAction(
  id: string
): Promise<ResultadoFunil> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  if (typeof id !== "string" || !UUID.test(id)) {
    return { ok: false, erro: SEM_ACESSO }
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }
  const { data, error: erroBusca } = await supabase
    .from("funil_lancamentos")
    .select("funil_id")
    .eq("id", id)
    .maybeSingle()
  if (erroBusca) return erroDeGravacao("buscar lancamento", erroBusca)
  // Já não existe: é o resultado que a pessoa queria, sem erro para mostrar.
  if (!data) return { ok: true }
  const funil = await buscarFunil((data as { funil_id: string }).funil_id)
  if (!funil || !podeMexerNoFunil(usuario, funil)) {
    return { ok: false, erro: SEM_ACESSO }
  }
  const { error } = await supabase
    .from("funil_lancamentos")
    .delete()
    .eq("id", id)
  if (error) return erroDeGravacao("excluir lancamento", error)
  revalidar()
  return { ok: true }
}
