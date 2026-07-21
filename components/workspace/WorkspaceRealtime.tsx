"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

// Mesma janela de coalesce do CRM: várias pessoas mexendo em tarefas geram
// pings em rajada, e um router.refresh() por ping re-renderiza a página
// inteira e trava a rolagem.
const JANELA_MS = 1500

/**
 * Realtime do Workspace. Assina ws_realtime_ping — a ÚNICA tabela do módulo
 * legível pelo browser, e que não tem PII (id, tarefa_id, kind, timestamp).
 * Nenhum dado de tarefa trafega por aqui: o ping só diz "mudou alguma coisa",
 * e o router.refresh() rebusca pelo servidor, que é a fonte de verdade.
 *
 * No-op se o Supabase não estiver configurado no ambiente.
 */
export default function WorkspaceRealtime() {
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
      .channel("ws-realtime-ping")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ws_realtime_ping" },
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
