import { getSupabaseAdmin } from "./supabase"
import { getUsuarioIdSync } from "./auth"

export type TipoNotificacao = "nova_venda" | "lembrete"

export interface NotificacaoItem {
  // id da linha em notificacoes_usuario (usado pra marcar como lida)
  id: string
  tipo: TipoNotificacao
  empresa: string | null
  titulo: string
  mensagem: string
  payload: Record<string, unknown> | null
  criada_em: string
  lida_em: string | null
}

/**
 * Lista as últimas N notificações do usuário, mais recentes primeiro.
 * Faz JOIN com notificacoes pra trazer o conteúdo. Limite default 20.
 */
export async function listarNotificacoesDoUsuario(
  usuarioId: string,
  limite = 20
): Promise<NotificacaoItem[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("notificacoes_usuario")
    .select(
      `
      id,
      lida_em,
      created_at,
      notificacao:notificacoes (
        tipo,
        empresa,
        titulo,
        mensagem,
        payload,
        criada_em
      )
    `
    )
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) {
    console.error("[notificacoes] listar error", error.message)
    return []
  }
  return (data ?? []).map((row) => {
    // O join vem como objeto ou array dependendo do supabase-js — normaliza.
    const n = Array.isArray(row.notificacao)
      ? row.notificacao[0]
      : row.notificacao
    return {
      id: row.id as string,
      tipo: (n?.tipo ?? "lembrete") as TipoNotificacao,
      empresa: (n?.empresa ?? null) as string | null,
      titulo: (n?.titulo ?? "") as string,
      mensagem: (n?.mensagem ?? "") as string,
      payload: (n?.payload ?? null) as Record<string, unknown> | null,
      criada_em: (n?.criada_em ?? row.created_at) as string,
      lida_em: (row.lida_em ?? null) as string | null,
    }
  })
}

/**
 * Conta quantas notificações ainda não lidas o usuário tem.
 */
export async function contarNaoLidas(usuarioId: string): Promise<number> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return 0
  const { count, error } = await supabase
    .from("notificacoes_usuario")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
    .is("lida_em", null)
  if (error) {
    console.error("[notificacoes] contar error", error.message)
    return 0
  }
  return count ?? 0
}

/**
 * Endpoint usado pelo polling do client: retorna count + lista em uma
 * call só. Filtra pelo usuário da sessão atual (cookie).
 */
export async function getNotificacoesDaSessao(): Promise<{
  count: number
  itens: NotificacaoItem[]
}> {
  const usuarioId = getUsuarioIdSync()
  if (!usuarioId) return { count: 0, itens: [] }
  const [count, itens] = await Promise.all([
    contarNaoLidas(usuarioId),
    listarNotificacoesDoUsuario(usuarioId, 20),
  ])
  return { count, itens }
}
