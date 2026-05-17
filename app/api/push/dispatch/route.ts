import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase"
import { enviarPushParaUsuario } from "@/lib/push"

export const runtime = "nodejs"

interface DispatchBody {
  notificacao_usuario_id?: string
}

function autorizado(req: Request): boolean {
  const esperado = process.env.INTERNAL_PUSH_SECRET ?? ""
  const recebido = req.headers.get("x-internal-secret") ?? ""
  if (!esperado || !recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Endpoint chamado pelo trigger Postgres (via pg_net) toda vez que
 * uma linha em notificacoes_usuario é criada. Lê a notificação +
 * subscriptions ativas do usuário e dispara Web Push. Marca
 * enviada_push_em quando termina.
 *
 * Autenticação: header x-internal-secret comparado em tempo-constante
 * contra INTERNAL_PUSH_SECRET. Sem este env, retorna 503.
 */
export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 403 })
  }

  let body: DispatchBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ erro: "json_invalido" }, { status: 400 })
  }
  const nuId = body?.notificacao_usuario_id
  if (!nuId) {
    return NextResponse.json({ erro: "id_faltando" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ erro: "supabase_indisponivel" }, { status: 500 })
  }

  // Lê notificacao_usuario + join com notificacoes pro conteúdo
  const { data, error } = await supabase
    .from("notificacoes_usuario")
    .select(
      `
      id,
      usuario_id,
      enviada_push_em,
      notificacao:notificacoes (
        tipo,
        empresa,
        titulo,
        mensagem
      )
    `
    )
    .eq("id", nuId)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json(
      { erro: "notificacao_nao_encontrada" },
      { status: 404 }
    )
  }
  // Idempotência: se já foi enviada, no-op (trigger pode disparar 2x
  // em retries do pg_net)
  if (data.enviada_push_em) {
    return NextResponse.json({ ok: true, ja_enviada: true })
  }

  const n = Array.isArray(data.notificacao) ? data.notificacao[0] : data.notificacao
  const tagBase = (n?.tipo as string | undefined) ?? "notificacao"
  const empresa = (n?.empresa as string | null) ?? null

  const resultado = await enviarPushParaUsuario(data.usuario_id as string, {
    titulo: (n?.titulo as string | undefined) ?? "Anômalo Hub",
    mensagem: (n?.mensagem as string | undefined) ?? "",
    url: "/dashboard",
    tag: empresa ? `${tagBase}-${empresa}` : tagBase,
    notificacaoUsuarioId: data.id as string,
  })

  await supabase
    .from("notificacoes_usuario")
    .update({ enviada_push_em: new Date().toISOString() })
    .eq("id", data.id as string)

  return NextResponse.json({ ok: true, ...resultado })
}
