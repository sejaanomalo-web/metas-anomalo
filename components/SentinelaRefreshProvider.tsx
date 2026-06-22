"use client"

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import {
  dispararRotinaMCP,
  dispararSentinelaDia,
  ultimaAtualizacaoMCP,
} from "@/lib/sentinela-trigger"

/**
 * Provider do "Atualizar dados" do Tráfego que roda em SEGUNDO PLANO.
 *
 * Vive no layout do /dashboard (AppShell), que NÃO desmonta ao trocar de
 * aba. Por isso o loop de atualização continua rodando mesmo que o usuário
 * saia da aba de Tráfego pago para Metas/Financeiro/etc. — e um indicador
 * flutuante mostra o progresso em qualquer aba.
 *
 * O botão (BotaoAtualizarTrafego) é só um consumidor deste contexto: ele
 * chama `iniciar()` e reflete o mesmo estado global.
 *
 * Limite honesto: isto roda no navegador (no realm da SPA). Trocar de aba
 * mantém; FECHAR a aba do navegador / dar reload interrompe. Para a
 * atualização garantida sem ninguém aberto existem os crons (09/15/21h).
 */
type Estado =
  | { fase: "idle" }
  | { fase: "rodando"; pct: number; etapa: string }
  | { fase: "ok"; resumo: string }
  | { fase: "erro"; msg: string }

interface Ctx {
  estado: Estado
  rodando: boolean
  iniciar: () => void
}

const SentinelaRefreshContext = createContext<Ctx | null>(null)

export function useSentinelaRefresh(): Ctx {
  const ctx = useContext(SentinelaRefreshContext)
  if (!ctx) {
    throw new Error(
      "useSentinelaRefresh precisa estar dentro de <SentinelaRefreshProvider>"
    )
  }
  return ctx
}

/** Data em BRT (UTC-3, sem DST) no formato YYYY-MM-DD, com offset de dias. */
function diaBRT(offset = 0): string {
  const agora = new Date()
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000
  const brt = new Date(utcMs - 3 * 60 * 60_000 + offset * 24 * 60 * 60_000)
  return brt.toISOString().slice(0, 10)
}

export default function SentinelaRefreshProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>({ fase: "idle" })
  // Ref pra travar reentrância de forma síncrona (o state é assíncrono).
  const rodandoRef = useRef(false)

  const iniciar = useCallback(async () => {
    if (rodandoRef.current) return
    rodandoRef.current = true

    // Estratégia: tenta o MCP primeiro (fonte de dados ativa enquanto o app
    // do Meta está fora). Se o token não estiver configurado no Vercel,
    // cai pra Sentinela legacy (que vai falhar rápido e sinalizar "MCP").
    setEstado({ fase: "rodando", pct: 3, etapa: "Disparando coleta…" })

    const snapshotAntes = await ultimaAtualizacaoMCP()
    const ultimaAntes = snapshotAntes.iso

    const disparo = await dispararRotinaMCP()

    // SEM token configurado → fallback honesto pra Sentinela legacy.
    if (!disparo.ok && disparo.semToken) {
      const r = await dispararSentinelaDia(diaBRT(0))
      router.refresh()
      const fonte = r.ok && r.fonte === "sentinela" ? "Sentinela" : "MCP"
      setEstado({
        fase: "ok",
        resumo: `${fonte} · próxima coleta automática 15h/20h`,
      })
      setTimeout(() => setEstado({ fase: "idle" }), 6000)
      rodandoRef.current = false
      return
    }

    if (!disparo.ok) {
      setEstado({ fase: "erro", msg: disparo.erro ?? "Falha ao disparar." })
      setTimeout(() => setEstado({ fase: "idle" }), 6000)
      rodandoRef.current = false
      return
    }

    // Polling do banco até detectar timestamp MAIOR que o snapshot. A barra
    // sobe pelo tempo decorrido vs. duração estimada (curva conservadora:
    // chega só a 90% até o dado realmente aparecer — evita "fingir" 100%).
    const inicio = Date.now()
    const estimadaMs = disparo.duracaoEstimadaSegundos * 1000
    const timeoutMs = Math.max(estimadaMs * 3, 180_000) // 3x o esperado, mín 3 min
    const intervaloMs = 2500

    while (Date.now() - inicio < timeoutMs) {
      await new Promise((r) => setTimeout(r, intervaloMs))

      const decorrido = Date.now() - inicio
      const fracao = Math.min(1, decorrido / estimadaMs)
      const pct = Math.max(3, Math.min(90, Math.round(fracao * 90)))
      setEstado({
        fase: "rodando",
        pct,
        etapa: `Coletando do Meta… ${Math.round(decorrido / 1000)}s`,
      })

      const snap = await ultimaAtualizacaoMCP()
      if (snap.ok && snap.iso && snap.iso !== ultimaAntes) {
        setEstado({ fase: "rodando", pct: 96, etapa: "Recarregando…" })
        router.refresh()
        const seg = Math.round((Date.now() - inicio) / 1000)
        setEstado({ fase: "ok", resumo: `MCP · ${seg}s` })
        setTimeout(() => setEstado({ fase: "idle" }), 4500)
        rodandoRef.current = false
        return
      }
    }

    // Timeout: a rotina pode ainda estar rodando — instrui o usuário a
    // recarregar em alguns minutos. Não é erro de sistema.
    setEstado({
      fase: "erro",
      msg: "Coleta MCP demorando mais que o esperado — recarregue em 1–2 min.",
    })
    setTimeout(() => setEstado({ fase: "idle" }), 8000)
    rodandoRef.current = false
  }, [router])

  const rodando = estado.fase === "rodando"

  return (
    <SentinelaRefreshContext.Provider value={{ estado, rodando, iniciar }}>
      {children}
      <IndicadorFlutuante estado={estado} />
    </SentinelaRefreshContext.Provider>
  )
}

/** Pílula fixa no canto inferior direito — visível em QUALQUER aba enquanto
 *  a atualização roda (e por alguns segundos ao concluir/falhar). */
function IndicadorFlutuante({ estado }: { estado: Estado }) {
  if (estado.fase === "idle") return null

  const rodando = estado.fase === "rodando"
  const ok = estado.fase === "ok"

  const texto = rodando
    ? `${estado.etapa} · ${estado.pct}%`
    : ok
    ? `Tráfego atualizado · ${estado.resumo}`
    : estado.msg

  const cor = ok ? "#4caf50" : estado.fase === "erro" ? "#e24b4a" : "#C9953A"

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 300,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 999,
        background: "rgba(15,15,18,0.92)",
        border: `1px solid ${cor}55`,
        boxShadow: `0 8px 30px rgba(0,0,0,0.45), 0 0 18px ${cor}22`,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        color: "var(--text-1)",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.02em",
        maxWidth: "calc(100vw - 36px)",
      }}
    >
      {rodando ? (
        <span
          aria-hidden="true"
          className="animate-spin"
          style={{
            width: 13,
            height: 13,
            borderRadius: "50%",
            border: "2px solid rgba(201,149,58,0.25)",
            borderTopColor: "#C9953A",
            flexShrink: 0,
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: cor,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {texto}
      </span>
    </div>
  )
}
