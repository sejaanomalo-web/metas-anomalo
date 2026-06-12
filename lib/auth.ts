import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createHmac, scryptSync, timingSafeEqual } from "crypto"
import { getSupabaseAdmin } from "./supabase"

export const COOKIE_SESSAO = "anomalo_session"
const DURACAO_SESSAO_SEG = 60 * 60 * 12 // 12h

// Segredo pra assinar cookie de sessão (HMAC-SHA256). Não confundir com
// SENHA_ACESSO, que era a senha única antiga — agora a senha vive em
// public.usuarios.senha_hash. O fallback existe pra ambiente local sem
// .env; em produção (Vercel) deve estar setado.
//
// SEGURANÇA: se SESSION_SECRET faltar em produção, o cookie passa a ser
// assinado com um valor público (presente no código), o que permitiria
// forjar sessões. Logamos um alerta alto nesse caso — sem derrubar um
// deploy já no ar — pra que a env seja corrigida na Vercel. Não muda
// comportamento: continua assinando/validando como antes.
let avisouSessionSecret = false
function getSessionSecret(): string {
  // Usa o segredo do ambiente EXATAMENTE como antes quando ele existe —
  // sem checar tamanho, pra não invalidar sessões já assinadas. Só quando
  // ausente cai no fallback (e, em produção, loga alerta alto pra correção).
  const secret = process.env.SESSION_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === "production" && !avisouSessionSecret) {
    avisouSessionSecret = true
    console.error(
      "[auth] SESSION_SECRET ausente em produção — usando fallback INSEGURO " +
        "(presente no código-fonte). Defina SESSION_SECRET (>=32 chars " +
        "aleatórios) nas variáveis de ambiente da Vercel imediatamente."
    )
  }
  return "anomalo-session-secret-fallback-v1"
}

function assinarUsuarioId(usuarioId: string): string {
  const sig = createHmac("sha256", getSessionSecret())
    .update(usuarioId)
    .digest("hex")
  return `${usuarioId}.${sig}`
}

function verificarCookie(valor: string): string | null {
  const idx = valor.indexOf(".")
  if (idx < 0) return null
  const usuarioId = valor.slice(0, idx)
  const sig = valor.slice(idx + 1)
  const esperado = createHmac("sha256", getSessionSecret())
    .update(usuarioId)
    .digest("hex")
  const a = Buffer.from(sig, "hex")
  const b = Buffer.from(esperado, "hex")
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  return usuarioId
}

export function criarSessao(usuarioId: string) {
  cookies().set(COOKIE_SESSAO, assinarUsuarioId(usuarioId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: DURACAO_SESSAO_SEG,
  })
}

export function destruirSessao() {
  cookies().delete(COOKIE_SESSAO)
}

/**
 * Confere se há cookie válido (sem hit no DB). Use em gates de página
 * onde só importa "tem sessão?". Falso-positivo possível se o usuário
 * foi desativado depois — pra ter certeza, use getUsuarioAtual.
 */
export function estaAutenticado(): boolean {
  const cookie = cookies().get(COOKIE_SESSAO)?.value
  if (!cookie) return false
  return verificarCookie(cookie) !== null
}

/**
 * Retorna o usuario_id do cookie sem hit no DB. null se ausente/inválido.
 */
export function getUsuarioIdSync(): string | null {
  const cookie = cookies().get(COOKIE_SESSAO)?.value
  if (!cookie) return null
  return verificarCookie(cookie)
}

// ============================================================
// RBAC: papéis e permissões
// ============================================================

export type PapelUsuario =
  | "admin"
  | "gestor_trafego"
  | "comercial"
  | "custom"

export type ChavePermissao =
  | "dashboard_principal"
  | "dashboard_empresas"
  | "dashboard_empresa_detalhe"
  | "dashboard_trafego"
  | "dashboard_comercial"
  | "dashboard_financeiro"
  | "formularios"
  | "formulario_comercial"
  | "formulario_trafego"
  | "configuracoes"
  | "gerenciar_usuarios"
  | "ver_notificacoes"

export type Permissoes = Record<ChavePermissao, boolean>

/** Preset de permissões por papel. admin não usa (bypassa via temPermissao).
 *  gestor_trafego ganha SÓ as duas chaves de tráfego + notificações. custom
 *  começa zerado e o admin escolhe os checkboxes. */
export const PRESETS_PERMISSOES: Record<PapelUsuario, Permissoes> = {
  admin: {
    dashboard_principal: true,
    dashboard_empresas: true,
    dashboard_empresa_detalhe: true,
    dashboard_trafego: true,
    dashboard_comercial: true,
    dashboard_financeiro: true,
    formularios: true,
    formulario_comercial: true,
    formulario_trafego: true,
    configuracoes: true,
    gerenciar_usuarios: true,
    ver_notificacoes: true,
  },
  gestor_trafego: {
    dashboard_principal: false,
    dashboard_empresas: false,
    dashboard_empresa_detalhe: false,
    dashboard_trafego: true,
    dashboard_comercial: false,
    dashboard_financeiro: false,
    formularios: true,
    formulario_comercial: false,
    formulario_trafego: true,
    configuracoes: true,
    gerenciar_usuarios: false,
    ver_notificacoes: true,
  },
  comercial: {
    dashboard_principal: false,
    dashboard_empresas: false,
    dashboard_empresa_detalhe: false,
    dashboard_trafego: false,
    dashboard_comercial: true,
    dashboard_financeiro: false,
    formularios: true,
    formulario_comercial: true,
    formulario_trafego: false,
    configuracoes: true,
    gerenciar_usuarios: false,
    ver_notificacoes: true,
  },
  custom: {
    dashboard_principal: false,
    dashboard_empresas: false,
    dashboard_empresa_detalhe: false,
    dashboard_trafego: false,
    dashboard_comercial: false,
    dashboard_financeiro: false,
    formularios: false,
    formulario_comercial: false,
    formulario_trafego: false,
    configuracoes: false,
    gerenciar_usuarios: false,
    ver_notificacoes: false,
  },
}

export interface UsuarioSessao {
  id: string
  email: string
  nome: string
  papel: PapelUsuario
  permissoes: Permissoes
}

/**
 * Confere se o usuário tem permissão pra uma chave específica. admin
 * sempre passa (bypassa o JSONB). Outros papéis respeitam exatamente o
 * que está em usuario.permissoes — fail-closed (ausência = bloqueio).
 */
export function temPermissao(
  usuario: UsuarioSessao | null,
  chave: ChavePermissao
): boolean {
  if (!usuario) return false
  if (usuario.papel === "admin") return true
  return usuario.permissoes[chave] === true
}

/**
 * Rota padrão pra onde redirecionar o usuário ao logar ou quando ele
 * tenta acessar uma URL sem permissão. Prioriza: principal > tráfego >
 * empresas > formulários > configurações. Se nenhuma permissão estiver
 * ativa (config quebrada), volta pro /login (defensivo).
 */
export function rotaPadraoDoUsuario(usuario: UsuarioSessao): string {
  if (temPermissao(usuario, "dashboard_principal")) return "/dashboard"
  if (temPermissao(usuario, "dashboard_trafego")) return "/dashboard/trafego"
  if (temPermissao(usuario, "dashboard_comercial")) return "/dashboard/comercial"
  if (temPermissao(usuario, "dashboard_financeiro")) return "/dashboard/financeiro"
  if (temPermissao(usuario, "dashboard_empresas")) return "/dashboard/empresas"
  if (temPermissao(usuario, "formularios")) return "/dashboard/formularios"
  if (temPermissao(usuario, "configuracoes")) return "/dashboard/configuracoes"
  return "/login"
}

/**
 * Server-side guard: usa em Server Components no topo da page. Se não
 * autenticado, redireciona pro login; se autenticado mas sem a
 * permissão exigida, redireciona pra rota padrão do usuário (não dá
 * 403 frio — UX mais limpa).
 *
 * Retorna o UsuarioSessao pra evitar fetch duplicado na page.
 */
export async function requererPermissao(
  chave: ChavePermissao
): Promise<UsuarioSessao> {
  const usuario = await getUsuarioAtual()
  if (!usuario) redirect("/login")
  if (!temPermissao(usuario, chave)) {
    redirect(rotaPadraoDoUsuario(usuario))
  }
  return usuario
}

/**
 * Guard ESTRITO de admin (papel === 'admin'). Usar em ferramentas
 * destrutivas (excluir/editar dados inseridos no sistema), onde a
 * permissão 'configuracoes' seria ampla demais — um 'custom' poderia
 * tê-la. Redireciona pra rota padrão se não for admin.
 */
export async function requererAdmin(): Promise<UsuarioSessao> {
  const usuario = await getUsuarioAtual()
  if (!usuario) redirect("/login")
  if (usuario.papel !== "admin") {
    redirect(rotaPadraoDoUsuario(usuario))
  }
  return usuario
}

/**
 * Retorna o usuário da sessão atual com os campos da tabela usuarios.
 * null se não autenticado / cookie inválido / usuário não existe ou foi
 * desativado. Inclui papel e permissoes pra checagem RBAC nas pages.
 */
export async function getUsuarioAtual(): Promise<UsuarioSessao | null> {
  const usuarioId = getUsuarioIdSync()
  if (!usuarioId) return null
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data } = await supabase
    .from("usuarios")
    .select("id, email, nome, ativo, papel, permissoes")
    .eq("id", usuarioId)
    .maybeSingle()
  if (!data || !data.ativo) return null
  // Fail-CLOSED: papel/permissoes ausentes ou inválidos caem no MENOR
  // privilégio (custom = tudo false), nunca em admin. Hoje todos os
  // usuários têm esses campos preenchidos, então isto não muda nada — só
  // evita escalonamento de privilégio se uma linha vier corrompida/legada.
  const PAPEIS_VALIDOS: readonly PapelUsuario[] = [
    "admin",
    "gestor_trafego",
    "comercial",
    "custom",
  ]
  const papel: PapelUsuario = PAPEIS_VALIDOS.includes(
    data.papel as PapelUsuario
  )
    ? (data.papel as PapelUsuario)
    : "custom"
  const permissoes: Permissoes =
    data.permissoes && typeof data.permissoes === "object"
      ? (data.permissoes as Permissoes)
      : PRESETS_PERMISSOES.custom
  return {
    id: data.id as string,
    email: data.email as string,
    nome: data.nome as string,
    papel,
    permissoes,
  }
}

/**
 * Compara senha em texto puro contra hash scrypt no formato
 * "<salt_hex>:<derived_hex>". timing-safe.
 */
function compararSenha(senha: string, hash: string): boolean {
  const partes = hash.split(":")
  if (partes.length !== 2) return false
  const salt = Buffer.from(partes[0], "hex")
  const esperado = Buffer.from(partes[1], "hex")
  if (salt.length === 0 || esperado.length === 0) return false
  const tentativa = scryptSync(senha, salt, esperado.length)
  return timingSafeEqual(tentativa, esperado)
}

/**
 * Valida email+senha contra public.usuarios. Retorna usuario_id em caso
 * de sucesso, null caso contrário. Email é case-insensitive.
 */
export async function validarLogin(
  email: string,
  senha: string
): Promise<string | null> {
  if (!email || !senha) return null
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, senha_hash, ativo")
    .eq("email", email.toLowerCase().trim())
    .eq("ativo", true)
    .maybeSingle()
  if (error || !data) return null
  if (!compararSenha(senha, data.senha_hash)) return null
  return data.id as string
}
