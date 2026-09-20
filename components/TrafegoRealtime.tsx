"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

// Mesma janela do CRM (1200ms) e do Workspace (1500ms). Aqui ela importa
// ainda mais: a Sentinela grava em LOTE — uma linha de dados_diarios_log por
// empresa processada — então um ciclo de coleta chegava como dezenas de
// eventos em rajada, e cada um disparava um router.refresh() completo numa
// página force-dynamic. Durante a rajada a rolagem engasgava e os cliques
// eram engolidos pela re-renderização.
const JANELA_MS = 1500

/**
 * Subscription Supabase Realtime que atualiza a tela de Tráfego quando o
 * agente Sentinela escreve dados novos.
 *
 * Duas assinaturas, com escopos diferentes de propósito:
 *
 *   • dados_diarios_log — filtrada por empresa. É o dado da tela.
 *   • logs_sentinela    — SEM filtro, porque a tabela não tem coluna de
 *     empresa: cada linha é uma execução inteira da Sentinela, um sinal
 *     global de "a coleta terminou". Como é ~1 linha por execução, ela não
 *     é fonte de rajada; quem precisava de coalesce era a primeira.
 *
 * O filtro de dados_diarios_log precisa de URL-encode: nomes com acento ou
 * espaço ("Mãe Divina Yoga") quebram o filter PG do realtime se passados crus.
 *
 * Requer Realtime habilitado pras tabelas no painel Supabase:
 *   Database → Replication → dados_diarios_log e logs_sentinela.
 *
 * Sem env do Supabase (build local sem .env) o componente é no-op.
 */
export default function TrafegoRealtime({
  empresaNome,
}: {
  empresaNome: string
}) {
  const router = useRouter()
  const ultimoRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    // Aba escondida não re-renderiza: guarda o evento e atualiza UMA vez na
    // volta. Sem isso, deixar o Tráfego aberto em segundo plano durante uma
    // coleta acumulava refreshes e a aba "travava" ao ser reaberta.
    let pendenteOculto = false

    function agendarRefresh() {
      if (document.hidden) {
        pendenteOculto = true
        return
      }
      const agora = Date.now()
      const desde = agora - ultimoRef.current
      if (desde >= JANELA_MS) {
        ultimoRef.current = agora
        router.refresh()
        return
      }
      // Já refrescou há pouco: agenda um único refresh "de rabo", pra a
      // última mudança da rajada não se perder.
      if (timerRef.current) return
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        ultimoRef.current = Date.now()
        router.refresh()
      }, JANELA_MS - desde)
    }

    function aoVoltar() {
      if (!document.hidden && pendenteOculto) {
        pendenteOculto = false
        ultimoRef.current = Date.now()
        router.refresh()
      }
    }
    document.addEventListener("visibilitychange", aoVoltar)

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
          filter: `empresa=eq.${encodeURIComponent(empresaNome)}`,
        },
        () => agendarRefresh()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "logs_sentinela" },
        () => agendarRefresh()
      )
      .subscribe()

    return () => {
      document.removeEventListener("visibilitychange", aoVoltar)
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [empresaNome, router])

  return null
}
