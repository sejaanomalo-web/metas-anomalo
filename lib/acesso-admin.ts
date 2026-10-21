// =============================================================================
// Admin DENTRO de um módulo — separa "quem a pessoa é" de "o que ela vê".
// =============================================================================
//
// Puro (sem Supabase, sem next/headers): roda no servidor, no browser e nos
// testes.
//
// • papelReal (gravado no banco) diz QUEM é admin. Só ele dá poder de admin.
// • A visão simplificada ("Meu nível de acesso") só decide QUAIS módulos
//   aparecem. Ela não rebaixa o cargo.
//
// Então: admin real + módulo visível na visão atual = admin daquele módulo.
// Módulo oculto pela visão continua fechado (inclusive para admin), e quem
// não é admin no banco nunca passa — a visão só existe pra admin real
// (lib/auth.ts › getUsuarioAtual).
//
// Gates de módulos que NÃO usam esta função continuam no papel EFETIVO
// (requererAdmin), como sempre foram.

import type { ChavePermissao, PapelUsuario, Permissoes } from "./auth"

export interface UsuarioParaAcesso {
  papel: PapelUsuario
  papelReal: PapelUsuario
  permissoes: Permissoes
}

/** O módulo aparece pra esta pessoa? Mesma regra do menu (AppShell) e de
 *  temPermissao: papel efetivo admin vê tudo; fora isso, só as chaves ligadas
 *  (numa visão simplificada, as que a própria visão deixou ligadas). */
export function moduloVisivel(usuario: UsuarioParaAcesso | null, modulo: ChavePermissao): boolean {
  if (!usuario) return false
  return usuario.papel === "admin" || usuario.permissoes[modulo] === true
}

export function ehAdminNoModulo(usuario: UsuarioParaAcesso | null, modulo: ChavePermissao): boolean {
  if (!usuario || usuario.papelReal !== "admin") return false
  return moduloVisivel(usuario, modulo)
}
