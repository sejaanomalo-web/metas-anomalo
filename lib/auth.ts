import { cookies } from "next/headers"

// Troque aqui para alterar a senha de acesso ao painel.
export const SENHA_ACESSO = "anomalo2025"

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

export function validarSenha(senha: string): boolean {
  return senha === SENHA_ACESSO
}
