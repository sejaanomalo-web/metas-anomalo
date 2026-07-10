import { getSupabaseAdmin } from "./supabase"
import { getUsuarioIdSync } from "./auth"

export type TipoNotificacao =
  | "nova_venda"
  | "lembrete"
  | "dados_comercial"
  | "dados_trafego"
  | "meta_batida"
  | "dados_sentinela"
  | "crm_lembrete"

// Papéis que podem receber notificações (filtrados depois por
// ver_notificacoes + preferência do usuário).
const PAPEIS_NOTIFICAVEIS = ["admin", "gestor_trafego", "comercial", "custom"]

/**
 * Cria uma notificação e faz fan-out para os destinatários.
 *
 * Dois modos:
 *   - `usuarioIds` informado: fan-out DIRETO só pra esses usuários (ainda
 *     respeitando a preferência do tipo) — usado por fluxos que já sabem
 *     exatamente quem notificar (ex: lembrete de follow-up do CRM, que é do
 *     dono do lead, não de um papel inteiro).
 *   - `usuarioIds` ausente: comportamento original — fan-out por papelAlvo +
 *     ver_notificacoes (admin bypassa), igual antes.
 *
 * O push é enviado automaticamente: existe um trigger em
 * notificacoes_usuario (fn_dispatch_push_async) que chama /api/push/dispatch
 * ao inserir cada linha. Server-only (usa service role).
 */
export async function criarNotificacao(opts: {
  tipo: TipoNotificacao
  empresa?: string | null
  titulo: string
  mensagem: string
  payload?: Record<string, unknown> | null
  papelAlvo?: string[]
  usuarioIds?: string[]
}): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return
  const papelAlvo = opts.papelAlvo ?? PAPEIS_NOTIFICAVEIS

  const { data: notif, error } = await supabase
    .from("notificacoes")
    .insert({
      tipo: opts.tipo,
      empresa: opts.empresa ?? null,
      titulo: opts.titulo,
      mensagem: opts.mensagem,
      payload: opts.payload ?? null,
      papel_alvo: papelAlvo,
    })
    .select("id")
    .single()
  if (error || !notif) {
    console.error("[notificacoes] criar error", error?.message)
    return
  }

  let elegiveis: { id: string }[]
  if (opts.usuarioIds && opts.usuarioIds.length > 0) {
    const { data: users, error: errUsers } = await supabase
      .from("usuarios")
      .select("id")
      .eq("ativo", true)
      .in("id", opts.usuarioIds)
    if (errUsers || !users || users.length === 0) return
    elegiveis = users as { id: string }[]
  } else {
    const { data: users, error: errUsers } = await supabase
      .from("usuarios")
      .select("id, papel, permissoes")
      .eq("ativo", true)
      .in("papel", papelAlvo)
    if (errUsers || !users || users.length === 0) return
    elegiveis = users.filter(
      (u) =>
        u.papel === "admin" ||
        (u.permissoes as Record<string, boolean> | null)?.ver_notificacoes ===
          true
    )
  }
  if (elegiveis.length === 0) return

  // Filtra por preferência do tipo (default ligado se não houver linha).
  const ids = elegiveis.map((u) => u.id as string)
  const { data: prefs } = await supabase
    .from("preferencias_notificacao")
    .select(`usuario_id, ${opts.tipo}`)
    .in("usuario_id", ids)
  const desligados = new Set(
    (prefs ?? [])
      .filter((p) => (p as Record<string, unknown>)[opts.tipo] === false)
      .map((p) => (p as { usuario_id: string }).usuario_id)
  )
  const destinatarios = elegiveis.filter((u) => !desligados.has(u.id as string))
  if (destinatarios.length === 0) return

  const linhas = destinatarios.map((u) => ({
    notificacao_id: notif.id as string,
    usuario_id: u.id as string,
  }))
  const { error: errFan } = await supabase
    .from("notificacoes_usuario")
    .insert(linhas)
  if (errFan) console.error("[notificacoes] fan-out error", errFan.message)
}

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
