"use server"

import { revalidatePath } from "next/cache"
import { randomBytes, scryptSync } from "crypto"
import {
  PRESETS_PERMISSOES,
  getUsuarioAtual,
  requererPermissao,
  type ChavePermissao,
  type PapelUsuario,
  type Permissoes,
} from "./auth"
import { getSupabaseAdmin } from "./supabase"

/**
 * Revalida TODAS as superfícies onde um usuário aparece, ao criar/editar/
 * desativar/excluir/redefinir senha. Inclui os formulários públicos
 * (/formulario e /formulario-comercial) — antes só revalidava
 * /dashboard/configuracoes, então uma pessoa desativada/excluída continuava
 * aparecendo no seletor "Responsável" do formulário. `/dashboard` com "layout"
 * cobre configurações, comercial/time e demais páginas internas.
 */
function revalidarSuperficiesUsuarios() {
  revalidatePath("/dashboard", "layout")
  revalidatePath("/formulario")
  revalidatePath("/formulario-comercial")
}

export interface UsuarioRow {
  id: string
  email: string
  nome: string
  papel: PapelUsuario
  permissoes: Permissoes
  ativo: boolean
  created_at: string
  updated_at?: string
}

export interface ResultadoUsuario {
  ok: boolean
  erro?: string
  senha_temporaria?: string
}

// ============================================================
// Hash de senha (scrypt — mesma estratégia do lib/auth.ts)
// ============================================================

function hashSenha(senha: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(senha, salt, 64)
  return salt.toString("hex") + ":" + derived.toString("hex")
}

function gerarSenhaTemporaria(): string {
  // 12 bytes hex = 24 chars alfanuméricos — suficiente pra senha
  // temporária que o usuário trocará depois.
  return randomBytes(9).toString("base64").slice(0, 12)
}

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const CHAVES: ChavePermissao[] = [
  "dashboard_principal",
  "dashboard_empresas",
  "dashboard_empresa_detalhe",
  "dashboard_trafego",
  "dashboard_comercial",
  "dashboard_financeiro",
  "formularios",
  "formulario_comercial",
  "formulario_trafego",
  "configuracoes",
  "gerenciar_usuarios",
  "ver_notificacoes",
  "crm",
  "workspace",
]

function permissoesFromFormData(formData: FormData): Permissoes {
  const result = {} as Permissoes
  for (const chave of CHAVES) {
    result[chave] = formData.get(`perm_${chave}`) === "on"
  }
  return result
}

function permissoesFromPapel(papel: PapelUsuario): Permissoes {
  return { ...PRESETS_PERMISSOES[papel] }
}

// ============================================================
// Queries
// ============================================================

export async function listarUsuariosAction(): Promise<UsuarioRow[]> {
  await requererPermissao("gerenciar_usuarios")
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, email, nome, papel, permissoes, ativo, created_at, updated_at")
    .order("created_at", { ascending: true })
  if (error) {
    console.error("[usuarios] listar error", error.message)
    return []
  }
  return (data ?? []) as UsuarioRow[]
}

// ============================================================
// CRUD
// ============================================================

export async function criarUsuarioAction(
  formData: FormData
): Promise<ResultadoUsuario> {
  await requererPermissao("gerenciar_usuarios")

  const email = String(formData.get("email") ?? "").toLowerCase().trim()
  const nome = String(formData.get("nome") ?? "").trim()
  const papelRaw = String(formData.get("papel") ?? "custom")
  const papel: PapelUsuario =
    papelRaw === "admin" ||
    papelRaw === "gestor_trafego" ||
    papelRaw === "comercial"
      ? (papelRaw as PapelUsuario)
      : "custom"
  const senhaInput = String(formData.get("senha") ?? "").trim()

  if (!emailValido(email)) {
    return { ok: false, erro: "E-mail inválido." }
  }
  if (!nome) {
    return { ok: false, erro: "Nome obrigatório." }
  }
  if (senhaInput && senhaInput.length < 8) {
    return { ok: false, erro: "Senha mínima de 8 caracteres." }
  }

  // Se papel é admin ou gestor_trafego, usa o preset. Se custom, lê
  // os checkboxes do form.
  const permissoes =
    papel === "custom"
      ? permissoesFromFormData(formData)
      : permissoesFromPapel(papel)

  const senha = senhaInput || gerarSenhaTemporaria()
  const senha_hash = hashSenha(senha)

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { ok: false, erro: "Supabase indisponível." }
  }

  const { error } = await supabase.from("usuarios").insert({
    email,
    nome,
    papel,
    permissoes,
    senha_hash,
    ativo: true,
  })
  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "E-mail já cadastrado." }
    }
    if (error.code === "23514") {
      return {
        ok: false,
        erro: "Papel inválido no banco — aplique a migration usuarios_papel_check.",
      }
    }
    console.error("[usuarios] criar error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidarSuperficiesUsuarios()
  // Devolve a senha temporária se foi gerada (admin precisa pra
  // entregar pro usuário). Se o admin colocou senha custom, não devolve.
  return {
    ok: true,
    senha_temporaria: senhaInput ? undefined : senha,
  }
}

export async function atualizarUsuarioAction(
  formData: FormData
): Promise<ResultadoUsuario> {
  const admin = await requererPermissao("gerenciar_usuarios")

  const id = String(formData.get("id") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim()
  const papelRaw = String(formData.get("papel") ?? "custom")
  const papel: PapelUsuario =
    papelRaw === "admin" ||
    papelRaw === "gestor_trafego" ||
    papelRaw === "comercial"
      ? (papelRaw as PapelUsuario)
      : "custom"

  if (!id || !nome) {
    return { ok: false, erro: "Dados inválidos." }
  }

  // Defesa: admin não pode rebaixar a si mesmo (evita lockout do sistema).
  if (admin.id === id && papel !== "admin") {
    return {
      ok: false,
      erro: "Você não pode rebaixar seu próprio papel de admin.",
    }
  }

  const permissoes =
    papel === "custom"
      ? permissoesFromFormData(formData)
      : permissoesFromPapel(papel)

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { ok: false, erro: "Supabase indisponível." }
  }

  const { error } = await supabase
    .from("usuarios")
    .update({
      nome,
      papel,
      permissoes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) {
    if (error.code === "23514") {
      return {
        ok: false,
        erro: "Papel inválido no banco — aplique a migration usuarios_papel_check.",
      }
    }
    console.error("[usuarios] atualizar error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidarSuperficiesUsuarios()
  return { ok: true }
}

export async function alternarAtivoUsuarioAction(
  formData: FormData
): Promise<ResultadoUsuario> {
  const admin = await requererPermissao("gerenciar_usuarios")

  const id = String(formData.get("id") ?? "").trim()
  const ativoNovo = formData.get("ativo") === "true"
  if (!id) return { ok: false, erro: "ID inválido." }

  // Defesa: admin não pode desativar a si mesmo.
  if (admin.id === id && !ativoNovo) {
    return { ok: false, erro: "Você não pode desativar sua própria conta." }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { ok: false, erro: "Supabase indisponível." }
  }

  const { error } = await supabase
    .from("usuarios")
    .update({ ativo: ativoNovo, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) {
    console.error("[usuarios] alternar ativo error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidarSuperficiesUsuarios()
  return { ok: true }
}

/**
 * Exclusão definitiva do usuário. Diferente de desativar (preserva a
 * linha com ativo=false), o delete remove a linha de public.usuarios
 * por completo. FKs cuidam do resto:
 *   • notificacoes_usuario → CASCADE (notificações vão junto)
 *   • push_subscriptions   → CASCADE (subscriptions push vão junto)
 *   • lancamento_financeiro.criado_por → SET NULL (lançamentos
 *     financeiros do user permanecem, só esquece quem criou)
 *
 * O client exige digitar "Excluir" antes de chamar essa action —
 * camada extra de UX, mas a validação textual server-side abaixo é
 * defesa em profundidade contra request direta.
 */
export async function excluirUsuarioAction(
  formData: FormData
): Promise<ResultadoUsuario> {
  const admin = await requererPermissao("gerenciar_usuarios")

  const id = String(formData.get("id") ?? "").trim()
  const confirmacao = String(formData.get("confirmacao") ?? "")
  if (!id) return { ok: false, erro: "ID inválido." }

  if (admin.id === id) {
    return { ok: false, erro: "Você não pode excluir sua própria conta." }
  }

  if (confirmacao !== "Excluir") {
    return {
      ok: false,
      erro: 'Digite exatamente "Excluir" pra confirmar a exclusão.',
    }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { ok: false, erro: "Supabase indisponível." }
  }

  const { error } = await supabase.from("usuarios").delete().eq("id", id)
  if (error) {
    console.error("[usuarios] excluir error", error.message)
    return { ok: false, erro: error.message }
  }

  // Remoção TOTAL (decisão de produto) — gate ESTRITO de admin (apagar dados
  // inseridos é só do admin; 'gerenciar_usuarios' é amplo demais, um 'custom'
  // poderia tê-lo). Purga os relatórios comerciais lançados por essa pessoa
  // (relatorios_comerciais.colaborador_id, uuid soft sem FK) — o funil e as
  // metas orgânicas passam a somar SEM ela. DESATIVAR não faz isso (preserva
  // histórico). Best-effort: loga e segue (o usuário já saiu).
  if (admin.papel === "admin") {
    const { error: errRel } = await supabase
      .from("relatorios_comerciais")
      .delete()
      .eq("colaborador_id", id)
    if (errRel) {
      console.error("[usuarios] excluir relatorios comerciais error", errRel.message)
    }
  }

  revalidarSuperficiesUsuarios()
  return { ok: true }
}

export async function redefinirSenhaAction(
  formData: FormData
): Promise<ResultadoUsuario> {
  await requererPermissao("gerenciar_usuarios")

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const novaSenha = gerarSenhaTemporaria()
  const senha_hash = hashSenha(novaSenha)

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { ok: false, erro: "Supabase indisponível." }
  }

  const { error } = await supabase
    .from("usuarios")
    .update({ senha_hash, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) {
    console.error("[usuarios] redefinir senha error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidarSuperficiesUsuarios()
  return { ok: true, senha_temporaria: novaSenha }
}

/**
 * Troca a SENHA DO PRÓPRIO usuário pra uma escolhida por ele (sem precisar
 * da permissão 'gerenciar_usuarios'). Usado pelo botão "Reset senha" quando
 * o alvo é o próprio perfil: em vez de gerar uma senha temporária, ele
 * pode definir a nova senha na hora. Sem fluxo de "senha atual" — o usuário
 * já está autenticado por sessão; trocar a própria senha é low-risk.
 */
export async function definirMinhaSenhaAction(
  formData: FormData
): Promise<ResultadoUsuario> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }

  const novaSenha = String(formData.get("nova_senha") ?? "")
  if (novaSenha.length < 6) {
    return { ok: false, erro: "Senha precisa ter pelo menos 6 caracteres." }
  }
  if (novaSenha.length > 200) {
    return { ok: false, erro: "Senha muito longa (máx 200 caracteres)." }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const senha_hash = hashSenha(novaSenha)
  const { error } = await supabase
    .from("usuarios")
    .update({ senha_hash, updated_at: new Date().toISOString() })
    .eq("id", usuario.id)
  if (error) {
    console.error("[usuarios] definir minha senha error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidarSuperficiesUsuarios()
  return { ok: true }
}

// Re-export pra uso em pages que querem checar permissão na UI inline.
export async function getUsuarioAtualAction() {
  return getUsuarioAtual()
}
