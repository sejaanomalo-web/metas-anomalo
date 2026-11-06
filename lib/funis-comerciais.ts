import { cache } from "react"
import { getSupabaseAdmin } from "./supabase"
import type { FunilComercial, LancamentoFunil } from "./funil-tipos"

/**
 * Leituras dos funis comerciais, usadas só por server components. Fica fora do
 * arquivo de actions de propósito: tudo que é exportado de um módulo
 * "use server" vira endpoint público, e estas funções não checam sessão. Quem
 * decide de quem é o funil que aparece é a página.
 */

/** A migration é aplicada à mão: a tela avisa em vez de quebrar sem ela. */
export function erroDeTabelaAusente(erro: { code?: string } | null): boolean {
  return erro?.code === "42P01" || erro?.code === "PGRST205"
}

export interface UsuarioComercial {
  id: string
  nome: string
}

/** Quem tem interface comercial: admin ou quem tem a permissão do Comercial. */
export const listarUsuariosComercial = cache(
  async function listarUsuariosComercial(): Promise<UsuarioComercial[]> {
    const supabase = getSupabaseAdmin()
    if (!supabase) return []
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nome, papel, permissoes")
      .eq("ativo", true)
      .order("nome")
    if (error) {
      console.error("[funis] listar usuarios error", error.message)
      return []
    }
    type Linha = UsuarioComercial & {
      papel: string
      permissoes: Record<string, boolean> | null
    }
    return ((data ?? []) as Linha[])
      .filter(
        (u) => u.papel === "admin" || u.permissoes?.dashboard_comercial === true
      )
      .map((u) => ({ id: u.id, nome: u.nome }))
  }
)

export async function listarFunis(
  usuarioId?: string
): Promise<{ funis: FunilComercial[]; tabelaAusente: boolean }> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { funis: [], tabelaAusente: false }
  let consulta = supabase
    .from("funis_comerciais")
    .select("*")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
  if (usuarioId) consulta = consulta.eq("usuario_id", usuarioId)
  const { data, error } = await consulta
  if (error) {
    if (!erroDeTabelaAusente(error)) {
      console.error("[funis] listar error", error.message)
    }
    return { funis: [], tabelaAusente: erroDeTabelaAusente(error) }
  }
  return { funis: (data ?? []) as FunilComercial[], tabelaAusente: false }
}

const TAMANHO_PAGINA = 1000

/**
 * Lançamentos dos funis no período, mais recentes primeiro. Pagina porque o
 * PostgREST corta a resposta em 1000 linhas sem avisar, e uma soma feita em
 * cima de lista cortada sairia errada sem nenhum erro aparente.
 */
export async function listarLancamentos(
  funilIds: string[],
  de: string,
  ate: string
): Promise<LancamentoFunil[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase || funilIds.length === 0) return []
  const linhas: LancamentoFunil[] = []
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from("funil_lancamentos")
      .select("*")
      .in("funil_id", funilIds)
      .gte("data", de)
      .lte("data", ate)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA - 1)
    if (error) {
      console.error("[funis] listar lancamentos error", error.message)
      return linhas
    }
    const pagina = (data ?? []) as LancamentoFunil[]
    linhas.push(...pagina)
    if (pagina.length < TAMANHO_PAGINA) return linhas
  }
}

/** Total de lançamentos do funil em qualquer data (diálogo de exclusão). */
export async function contarLancamentos(funilId: string): Promise<number> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return 0
  const { count, error } = await supabase
    .from("funil_lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("funil_id", funilId)
  if (error) {
    console.error("[funis] contar lancamentos error", error.message)
    return 0
  }
  return count ?? 0
}
