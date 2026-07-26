// =============================================================================
// Workspace — gravação de nota. Um caminho só, dois chamadores.
// =============================================================================
//
// Chamado por:
//   • salvarNotaAction (lib/workspace-actions.ts) — o autosave normal;
//   • POST /api/workspace/notas/salvar — o flush de emergência que o editor
//     dispara com fetch(keepalive) em pagehide/visibilitychange, quando a
//     janela está indo embora e uma Server Action não sai mais.
//
// Os dois PRECISAM sanitizar igual e escrever nas mesmas colunas. Com a regra
// aqui, não existe o cenário de um caminho salvar HTML que o outro recusaria.

import { getSupabaseAdmin } from "./supabase"
import { sanitizarHtmlNota } from "./workspace-notas"

export const MAX_TITULO_NOTA = 200
export const MAX_CORPO_NOTA = 200_000

export interface CamposNota {
  titulo?: string
  corpo_html?: string
}

/**
 * Atualiza os campos informados de uma nota. Campo ausente NÃO é mexido — é o
 * que permite salvar título e corpo de forma independente sem um sobrescrever
 * o outro com valor velho.
 */
export async function gravarNota(
  usuarioId: string,
  id: string,
  campos: CamposNota
): Promise<{ ok: boolean; erro?: string }> {
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const patch: Record<string, unknown> = {
    atualizado_por: usuarioId,
    updated_at: new Date().toISOString(),
  }
  if (campos.titulo !== undefined) {
    // trim + corte AQUI (e não em cada chamador) pra que a action e a rota
    // keepalive gravem exatamente a mesma coisa a partir do mesmo texto.
    patch.titulo = campos.titulo.trim().slice(0, MAX_TITULO_NOTA)
  }
  if (campos.corpo_html !== undefined) {
    patch.corpo_html = sanitizarHtmlNota(campos.corpo_html, MAX_CORPO_NOTA)
  }

  // Nada além de autoria/data pra atualizar: não gasta ida ao banco.
  if (patch.titulo === undefined && patch.corpo_html === undefined) {
    return { ok: true }
  }

  const { error } = await db
    .from("ws_notas")
    .update(patch)
    .eq("id", id)
    .is("excluida_em", null)
  if (error) {
    console.error("[workspace] gravarNota error", error.message)
    return { ok: false, erro: "Não foi possível salvar a nota." }
  }
  return { ok: true }
}
