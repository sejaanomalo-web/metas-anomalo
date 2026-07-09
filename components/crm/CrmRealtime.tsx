"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

/**
 * Subscription Supabase Realtime na crm_realtime_ping — a ÚNICA tabela do
 * CRM legível pelo browser (sem PII). Dispara router.refresh() em qualquer
 * INSERT (mensagem nova, lead novo, ou mudança de conexão/QR), cobrindo
 * tanto o inbox quanto a tela de conexões com o mesmo componente.
 *
 * Sem filtro por empresa/lead: a tabela não tem PII e o router.refresh() é
 * idempotente e barato (mesmo padrão de TrafegoRealtime).
 *
 * Se Supabase env não estiver configurado, o componente é no-op.
 */
export default function CrmRealtime() {
  const router = useRouter()

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    const supabase = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 2 } },
    })

    const channel = supabase
      .channel("crm-realtime-ping")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crm_realtime_ping" },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
