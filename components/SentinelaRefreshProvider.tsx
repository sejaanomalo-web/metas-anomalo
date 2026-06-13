"use client"

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import { dispararSentinelaDia } from "@/lib/sentinela-trigger"

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
  | { fase: "rodando"; pct: number }
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

    // Hoje + ontem cobrem os dias voláteis; cada chamada processa TODAS as
    // empresas ativas. Sequencial → progresso real por etapa.
    const dias = [diaBRT(0), diaBRT(-1)]
    const total = dias.length
    let falhas = 0
    let ultimoErro = ""
    let contas = 0

    setEstado({ fase: "rodando", pct: 2 })
    for (let i = 0; i < total; i++) {
      setEstado({
        fase: "rodando",
        pct: Math.max(2, Math.round((i / total) * 100)),
      })
      const r = await dispararSentinelaDia(dias[i])
      if (!r.ok) {
        falhas++
        ultimoErro = r.erro ?? "Falha."
      } else if (typeof r.contasProcessadas === "number") {
        contas = Math.max(contas, r.contasProcessadas)
      }
      setEstado({ fase: "rodando", pct: Math.round(((i + 1) / total) * 100) })
    }

    rodandoRef.current = false

    if (falhas === total) {
      setEstado({ fase: "erro", msg: ultimoErro })
      setTimeout(() => setEstado({ fase: "idle" }), 5000)
      return
    }

    // Recarrega os Server Components da rota ATUAL com os dados novos —
    // funciona em qualquer aba onde o usuário esteja ao terminar.
    router.refresh()
    const resumo = contas > 0 ? `${contas} empresas` : "concluído"
    setEstado({
      fase: "ok",
      resumo: falhas > 0 ? `Parcial · ${resumo}` : resumo,
    })
    setTimeout(() => setEstado({ fase: "idle" }), 3200)
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
    ? `Atualizando tráfego… ${estado.pct}%`
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
