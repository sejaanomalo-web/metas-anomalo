import { NextResponse } from "next/server"
import { getUsuarioIdSync } from "@/lib/auth"
import { getSupabaseAdmin } from "@/lib/supabase"

// Roda no Node runtime — web-push depende de APIs Node
export const runtime = "nodejs"

interface SubscribeBody {
  endpoint?: string
  keys?: {
    p256dh?: string
    auth?: string
  }
}

/**
 * Registra (upsert) uma Web Push subscription pro usuário logado.
 * Body = JSON da PushSubscription.toJSON() do browser.
 *
 * Endpoint é UNIQUE — o mesmo dispositivo registrando de novo apenas
 * atualiza chaves e marca ativo=true.
 */
export async function POST(req: Request) {
  const usuarioId = getUsuarioIdSync()
  if (!usuarioId) {
    return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 })
  }

  let body: SubscribeBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ erro: "json_invalido" }, { status: 400 })
  }

  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ erro: "campos_faltando" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ erro: "supabase_indisponivel" }, { status: 500 })
  }

  const userAgent = req.headers.get("user-agent") ?? null

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        usuario_id: usuarioId,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
        ativo: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    )

  if (error) {
    console.error("[push/subscribe] upsert error", error.message)
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const usuarioId = getUsuarioIdSync()
  if (!usuarioId) {
    return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 })
  }
  let body: { endpoint?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ erro: "json_invalido" }, { status: 400 })
  }
  if (!body?.endpoint) {
    return NextResponse.json({ erro: "endpoint_faltando" }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ erro: "supabase_indisponivel" }, { status: 500 })
  }
  await supabase
    .from("push_subscriptions")
    .update({ ativo: false })
    .eq("usuario_id", usuarioId)
    .eq("endpoint", body.endpoint)
  return NextResponse.json({ ok: true })
}
