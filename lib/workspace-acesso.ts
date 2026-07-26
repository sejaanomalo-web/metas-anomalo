// =============================================================================
// Workspace — porta de entrada de autorização, compartilhada.
// =============================================================================
//
// Vive fora de workspace-actions.ts porque agora existem DOIS caminhos de
// escrita: as Server Actions e a rota /api/workspace/notas/salvar (usada com
// `fetch(keepalive)` quando a janela está fechando — uma action não é chamável
// nesse instante). Os dois precisam da MESMA checagem, e checagem de permissão
// duplicada é como divergência de segurança nasce.

import { getUsuarioAtual, type UsuarioSessao } from "./auth"

/**
 * Sessão + permissão de Workspace.
 *
 * O Postgres não conhece o usuário deste app (auth própria por cookie HMAC,
 * acesso via service_role), então a autorização REAL é aqui. admin passa por
 * cima; qualquer outro papel precisa de `permissoes.workspace === true` —
 * fail-closed se a chave não existir no JSONB.
 */
export async function exigirWorkspace(): Promise<{
  usuario: UsuarioSessao | null
  erro?: string
}> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { usuario: null, erro: "Sessão expirada. Entre de novo." }
  if (usuario.papel !== "admin" && usuario.permissoes.workspace !== true) {
    return { usuario: null, erro: "Sem permissão para o Workspace." }
  }
  return { usuario }
}
