import { cookies } from "next/headers"
import { createHmac, scryptSync, timingSafeEqual } from "crypto"
import { getSupabaseAdmin } from "./supabase"

export const COOKIE_SESSAO = "anomalo_session"
const DURACAO_SESSAO_SEG = 60 * 60 * 12 // 12h

// Segredo pra assinar cookie de sessão (HMAC-SHA256). Não confundir com
// SENHA_ACESSO, que era a senha única antiga — agora a senha vive em
// public.usuarios.senha_hash. O fallback existe pra ambiente local sem
// .env; em produção (Vercel) deve estar setado.
function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? "anomalo-session-secret-fallback-v1"
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

export interface UsuarioSessao {
  id: string
  email: string
  nome: string
}

/**
 * Retorna o usuário da sessão atual com os campos da tabela usuarios.
 * null se não autenticado / cookie inválido / usuário não existe ou foi
 * desativado.
 */
export async function getUsuarioAtual(): Promise<UsuarioSessao | null> {
  const usuarioId = getUsuarioIdSync()
  if (!usuarioId) return null
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data } = await supabase
    .from("usuarios")
    .select("id, email, nome, ativo")
    .eq("id", usuarioId)
    .maybeSingle()
  if (!data || !data.ativo) return null
  return { id: data.id, email: data.email, nome: data.nome }
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
