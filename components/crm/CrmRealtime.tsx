"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

// Coalesce de refresh: durante uma conversa ativa chegam vários pings por
// segundo; um router.refresh() por ping re-busca a página inteira e trava a
// UI (o scroll da lista "engasga"). Agrupa numa janela e faz no máximo um
// refresh a cada JANELA_MS, com um refresh "de rabo" pra não perder o último.
const JANELA_MS = 1200

/**
 * Subscription Supabase Realtime na crm_realtime_ping — a ÚNICA tabela do
 * CRM legível pelo browser (sem PII). Dispara (throttled) router.refresh() em
 * qualquer INSERT (mensagem nova, lead novo, conexão/QR), cobrindo o inbox e
 * a tela de conexões com o mesmo componente.
 *
 * Se Supabase env não estiver configurado, o componente é no-op.
 */
export default function CrmRealtime() {
  const router = useRouter()
  const ultimoRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    function agendarRefresh() {
      const agora = Date.now()
      const desde = agora - ultimoRef.current
      if (desde >= JANELA_MS) {
        ultimoRef.current = agora
        router.refresh()
        return
      }
      // Já refrescou há pouco — agenda um único trailing refresh.
      if (timerRef.current) return
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        ultimoRef.current = Date.now()
        router.refresh()
      }, JANELA_MS - desde)
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 2 } },
    })

    const channel = supabase
      .channel("crm-realtime-ping")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crm_realtime_ping" },
        () => agendarRefresh()
      )
      .subscribe()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
