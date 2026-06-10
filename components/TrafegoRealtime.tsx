"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

/**
 * Subscription Supabase Realtime que dispara router.refresh() sempre
 * que o agente Sentinela escreve em dados_diarios_log ou logs_sentinela
 * para a empresa atual.
 *
 * Filtra por `empresa = empresaNome` (filtro pg do realtime) pra evitar
 * disparar refresh em mudanças de outras empresas. Filtro adicional por
 * preenchedor_nome não é aplicado no realtime (não dá pra combinar dois
 * eq no filter de uma só subscription) — mas o router.refresh() é
 * idempotente e barato em SSR cache, então não tem custo perceptível.
 *
 * Requer que Realtime esteja habilitado pras tabelas no painel Supabase:
 *   Database → Replication → marcar dados_diarios_log e logs_sentinela.
 *
 * Se Supabase env não estiver configurado (build local sem .env), o
 * componente é no-op — não quebra.
 */
export default function TrafegoRealtime({
  empresaNome,
}: {
  empresaNome: string
}) {
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
      .channel(`trafego-${empresaNome}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dados_diarios_log",
          // URL-encode obrigatório: nomes com acento ou espaço (ex:
          // "Tato Estofados", "Mãe Divina Yoga") quebram o filter PG
          // do realtime se passados crus.
          filter: `empresa=eq.${encodeURIComponent(empresaNome)}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "logs_sentinela",
        },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [empresaNome, router])

  return null
}
