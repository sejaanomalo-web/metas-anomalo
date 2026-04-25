import { cookies } from "next/headers"
import { timingSafeEqual } from "crypto"

// Senha vem da env var SENHA_ACESSO (sem prefixo NEXT_PUBLIC, fica
// só no servidor). Fallback para o valor antigo evita quebrar setups
// que ainda não migraram a env, mas em produção o ideal é setar a
// variável no Vercel e remover esse fallback no futuro.
function getSenhaConfigurada(): string {
  return process.env.SENHA_ACESSO ?? "anomalo2025"
}

export const COOKIE_SESSAO = "anomalo_session"
const COOKIE_VALOR = "autenticado"
const DURACAO_SESSAO_SEG = 60 * 60 * 12 // 12h

export function criarSessao() {
  cookies().set(COOKIE_SESSAO, COOKIE_VALOR, {
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

export function estaAutenticado(): boolean {
  return cookies().get(COOKIE_SESSAO)?.value === COOKIE_VALOR
}

/**
 * Compara em tempo constante para não vazar informação por timing
 * attack — diferença é mínima neste sistema de senha única, mas é
 * boa prática.
 */
export function validarSenha(senha: string): boolean {
  const esperada = getSenhaConfigurada()
  const a = Buffer.from(senha)
  const b = Buffer.from(esperada)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
