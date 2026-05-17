import webpush from "web-push"
import { getSupabaseAdmin } from "./supabase"

let configurado = false

function garantirVAPID() {
  if (configurado) return
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? "mailto:sejaanomalo@gmail.com"
  if (!pub || !priv) return
  webpush.setVapidDetails(subject, pub, priv)
  configurado = true
}

export interface PushPayload {
  titulo: string
  mensagem: string
  url?: string
  tag?: string
  notificacaoUsuarioId?: string
}

/**
 * Dispara push pra todas subscriptions ativas de um usuário. Marca como
 * inativa qualquer subscription que retorne 404/410 (expirou no provider).
 */
export async function enviarPushParaUsuario(
  usuarioId: string,
  payload: PushPayload
): Promise<{ enviadas: number; falhas: number }> {
  garantirVAPID()
  if (!configurado) return { enviadas: 0, falhas: 0 }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { enviadas: 0, falhas: 0 }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("usuario_id", usuarioId)
    .eq("ativo", true)

  if (error || !subs || subs.length === 0) {
    return { enviadas: 0, falhas: 0 }
  }

  const corpo = JSON.stringify(payload)
  let enviadas = 0
  let falhas = 0

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint as string,
            keys: {
              p256dh: s.p256dh as string,
              auth: s.auth as string,
            },
          },
          corpo
        )
        enviadas += 1
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode ?? 0
        if (status === 404 || status === 410) {
          // Subscription morta — marca inativa pra parar de tentar
          await supabase
            .from("push_subscriptions")
            .update({ ativo: false })
            .eq("id", s.id as string)
        }
        falhas += 1
        console.error(
          "[push] envio falhou",
          status,
          err instanceof Error ? err.message : String(err)
        )
      }
    })
  )

  return { enviadas, falhas }
}
