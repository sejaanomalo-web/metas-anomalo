"use server"

import { revalidatePath } from "next/cache"
import { requererAdmin, requererPermissao } from "./auth"
import { getSupabaseAdmin } from "./supabase"

/**
 * Roster do TIME COMERCIAL, desacoplado dos usuários de login.
 *
 * Por que existe: o seletor "Responsável" do formulário comercial e a aba Time
 * vinham SÓ de public.usuarios (lib/time.ts → listarTimePorPapel). Isso obrigava
 * cada integrante a ser um usuário de login (e-mail + senha) e a bater uma regra
 * sutil de papel/permissão — e deixava admins de fora. Esta tabela permite
 * cadastrar integrantes do comercial diretamente (inclusive vendedores que só
 * preenchem o formulário público, sem acesso ao painel). O id (uuid) serve como
 * colaborador_id em relatorios_comerciais (vínculo soft, sem FK), então a
 * atribuição por pessoa na aba Time funciona sem mudança no schema de relatórios.
 *
 * RLS sem policy → acesso só via service_role (getSupabaseAdmin), igual ao
 * restante do comercial. Gate de escrita: 'dashboard_comercial' (quem opera a
 * área comercial gerencia o próprio time; admin sempre passa).
 *
 * "use server": só exporta async functions. As interfaces de tipo simples ficam
 * aqui mesmo (são serializáveis e usadas por client components via props).
 */

export interface ColaboradorComercial {
  id: string
  nome: string
  email: string | null
  ativo: boolean
  created_at: string
  updated_at?: string
}

export interface ResultadoColaborador {
  ok: boolean
  erro?: string
  /** Linha criada (em criarColaboradorComercialAction) — permite à UI inserir
   *  o novo integrante na lista sem recarregar a página. */
  colaborador?: ColaboradorComercial
}

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Revalida todas as superfícies que consomem o roster comercial. */
function revalidarSuperficiesComercial() {
  // Formulário público + aba Time + Configurações leem o time via
  // listarTimePorPapel; o layout do dashboard cobre as páginas internas.
  revalidatePath("/formulario-comercial")
  revalidatePath("/dashboard/comercial/time")
  revalidatePath("/dashboard/configuracoes")
  revalidatePath("/dashboard", "layout")
}

// ============================================================
// Leitura (gerência — inclui inativos)
// ============================================================

/** Todos os integrantes do roster comercial (ativos + inativos), por nome.
 *  Para a tela de gerência. Gate: dashboard_comercial. */
export async function listarColaboradoresComerciais(): Promise<
  ColaboradorComercial[]
> {
  await requererPermissao("dashboard_comercial")
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("colaboradores_comerciais")
    .select("id, nome, email, ativo, created_at, updated_at")
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true })
  if (error) {
    console.error("[colaboradores-comerciais] listar error", error.message)
    return []
  }
  return (data ?? []) as ColaboradorComercial[]
}

// ============================================================
// CRUD
// ============================================================

export async function criarColaboradorComercialAction(
  formData: FormData
): Promise<ResultadoColaborador> {
  await requererPermissao("dashboard_comercial")

  const nome = String(formData.get("nome") ?? "").trim()
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!nome) return { ok: false, erro: "Nome obrigatório." }
  if (emailRaw && !emailValido(emailRaw)) {
    return { ok: false, erro: "E-mail inválido." }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { data, error } = await supabase
    .from("colaboradores_comerciais")
    .insert({ nome, email: emailRaw || null, ativo: true })
    .select("id, nome, email, ativo, created_at, updated_at")
    .single()
  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um integrante com esse e-mail." }
    }
    console.error("[colaboradores-comerciais] criar error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidarSuperficiesComercial()
  return { ok: true, colaborador: data as ColaboradorComercial }
}

export async function atualizarColaboradorComercialAction(
  formData: FormData
): Promise<ResultadoColaborador> {
  await requererPermissao("dashboard_comercial")

  const id = String(formData.get("id") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim()
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!id) return { ok: false, erro: "ID inválido." }
  if (!nome) return { ok: false, erro: "Nome obrigatório." }
  if (emailRaw && !emailValido(emailRaw)) {
    return { ok: false, erro: "E-mail inválido." }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase
    .from("colaboradores_comerciais")
    .update({
      nome,
      email: emailRaw || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um integrante com esse e-mail." }
    }
    console.error("[colaboradores-comerciais] atualizar error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidarSuperficiesComercial()
  return { ok: true }
}

/** Liga/desliga o integrante. Inativo sai do seletor do formulário e da aba
 *  Time, mas os relatórios históricos (keyed por colaborador_id) permanecem. */
export async function alternarAtivoColaboradorComercialAction(
  formData: FormData
): Promise<ResultadoColaborador> {
  await requererPermissao("dashboard_comercial")

  const id = String(formData.get("id") ?? "").trim()
  const ativoNovo = formData.get("ativo") === "true"
  if (!id) return { ok: false, erro: "ID inválido." }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase
    .from("colaboradores_comerciais")
    .update({ ativo: ativoNovo, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) {
    console.error(
      "[colaboradores-comerciais] alternar ativo error",
      error.message
    )
    return { ok: false, erro: error.message }
  }

  revalidarSuperficiesComercial()
  return { ok: true }
}

/**
 * Exclusão definitiva. Gate ESTRITO de admin (requererAdmin), igual às demais
 * ações destrutivas sobre dados inseridos (excluirRelatorioComercialAction):
 * criar/editar/desativar o roster é do time comercial, mas apagar de vez é só
 * do admin. Exige também confirmação textual "Excluir" (defesa em profundidade).
 *
 * Remoção TOTAL (decisão de produto): além de remover o integrante, PURGA os
 * relatórios comerciais lançados por ele (relatorios_comerciais.colaborador_id —
 * uuid soft, sem FK) — o funil e as metas orgânicas passam a somar sem ele.
 * Para só tirar do seletor preservando o histórico, use Desativar.
 */
export async function excluirColaboradorComercialAction(
  formData: FormData
): Promise<ResultadoColaborador> {
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
    .from("colaboradores_comerciais")
    .delete()
    .eq("id", id)
  if (error) {
    console.error("[colaboradores-comerciais] excluir error", error.message)
    return { ok: false, erro: error.message }
  }

  // Remoção TOTAL: purga os relatórios comerciais lançados por essa pessoa
  // (keyed por colaborador_id = id do roster). Não falha a exclusão se o purge
  // der erro — loga e segue.
  const { error: errRel } = await supabase
    .from("relatorios_comerciais")
    .delete()
    .eq("colaborador_id", id)
  if (errRel) {
    console.error(
      "[colaboradores-comerciais] excluir relatorios error",
      errRel.message
    )
  }

  revalidarSuperficiesComercial()
  return { ok: true }
}
