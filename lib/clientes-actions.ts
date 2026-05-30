"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { requererPermissao } from "./auth"

export interface ResultadoCliente {
  ok: boolean
  erro?: string
  id?: string
  slug?: string
}

function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function parseInt0(v: FormDataEntryValue | null): number {
  if (v === null) return 0
  const n = parseInt(String(v).trim(), 10)
  return Number.isFinite(n) ? n : 0
}

/** Valida se a string é um regex compilável. O campaign_filter vai
 *  direto pro new RegExp() na edge function — regex inválido quebraria
 *  a coleta daquele cliente. */
function regexValido(filtro: string): boolean {
  try {
    new RegExp(filtro)
    return true
  } catch {
    return false
  }
}

export async function criarClienteAction(
  formData: FormData
): Promise<ResultadoCliente> {
  await requererPermissao("dashboard_trafego")
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const empresa_nome = String(formData.get("empresa_nome") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim()
  const campaign_filter = String(formData.get("campaign_filter") ?? "").trim()
  const token_meta_id = String(formData.get("token_meta_id") ?? "").trim() || null
  const ativo = formData.get("ativo") === "on"
  const ordem = parseInt0(formData.get("ordem"))

  if (!empresa_nome) return { ok: false, erro: "Empresa-mãe obrigatória." }
  if (!nome) return { ok: false, erro: "Nome do cliente obrigatório." }
  if (!campaign_filter) return { ok: false, erro: "Filtro de campanha obrigatório." }
  if (!regexValido(campaign_filter)) {
    return { ok: false, erro: "Filtro de campanha não é um regex válido." }
  }

  const slug = slugify(nome)
  if (!slug) return { ok: false, erro: "Nome inválido (slug vazio)." }

  const { data, error } = await supabase
    .from("cliente_trafego")
    .insert({ empresa_nome, nome, slug, campaign_filter, token_meta_id, ativo, ordem })
    .select("id, slug")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um cliente com esse nome nessa empresa." }
    }
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard", "layout")
  return { ok: true, id: data.id as string, slug: data.slug as string }
}

export async function atualizarClienteAction(
  formData: FormData
): Promise<ResultadoCliente> {
  await requererPermissao("dashboard_trafego")
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const nome = String(formData.get("nome") ?? "").trim()
  const campaign_filter = String(formData.get("campaign_filter") ?? "").trim()
  const token_meta_id = String(formData.get("token_meta_id") ?? "").trim() || null
  const ativo = formData.get("ativo") === "on"
  const ordem = parseInt0(formData.get("ordem"))

  if (!nome) return { ok: false, erro: "Nome do cliente obrigatório." }
  if (!campaign_filter) return { ok: false, erro: "Filtro de campanha obrigatório." }
  if (!regexValido(campaign_filter)) {
    return { ok: false, erro: "Filtro de campanha não é um regex válido." }
  }

  const slug = slugify(nome)

  const { error } = await supabase
    .from("cliente_trafego")
    .update({ nome, slug, campaign_filter, token_meta_id, ativo, ordem })
    .eq("id", id)

  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um cliente com esse nome nessa empresa." }
    }
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard", "layout")
  return { ok: true, id, slug }
}

export async function excluirClienteAction(id: string): Promise<ResultadoCliente> {
  await requererPermissao("dashboard_trafego")
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  // Apaga métricas diárias do cliente junto (não há FK — limpeza manual).
  // Busca o cliente pra ter empresa_nome + nome.
  const { data: cli } = await supabase
    .from("cliente_trafego")
    .select("empresa_nome, nome")
    .eq("id", id)
    .maybeSingle()

  if (cli) {
    await supabase
      .from("dados_diarios_cliente")
      .delete()
      .eq("empresa_nome", cli.empresa_nome)
      .eq("cliente_nome", cli.nome)
  }

  const { error } = await supabase.from("cliente_trafego").delete().eq("id", id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard", "layout")
  return { ok: true, id }
}

/** Lista os tokens_meta de uma empresa (pra dropdown no drawer —
 *  o cliente herda ad_account + access_token do token escolhido). */
export async function listarTokensDaEmpresa(
  empresaNome: string
): Promise<{ id: string; ad_account_id: string }[]> {
  await requererPermissao("dashboard_trafego")
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("tokens_meta")
    .select("id, ad_account_id")
    .eq("empresa", empresaNome)
    .eq("ativo", true)
  if (error) {
    console.error("[clientes] listarTokensDaEmpresa error", error.message)
    return []
  }
  return (data ?? []) as { id: string; ad_account_id: string }[]
}
