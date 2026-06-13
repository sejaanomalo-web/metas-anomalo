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
  /** Backfill: reprocessa o Sentinela dia a dia no intervalo [de, ate]
   *  (YYYY-MM-DD, inclusive). Usa o mesmo estado/indicador global. */
  iniciarBackfill: (de: string, ate: string) => void
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

/** Datas YYYY-MM-DD de `de` até `ate` (inclusive). [] se inválido OU se o
 *  intervalo passar de 62 dias (teto defensivo pra não martelar o Meta). */
function listaDias(de: string, ate: string): string[] {
  const re = /^\d{4}-\d{2}-\d{2}$/
  if (!re.test(de) || !re.test(ate) || de > ate) return []
  const out: string[] = []
  let d = new Date(`${de}T00:00:00Z`)
  const fim = new Date(`${ate}T00:00:00Z`)
  while (d <= fim) {
    out.push(d.toISOString().slice(0, 10))
    if (out.length > 62) return []
    d = new Date(d.getTime() + 24 * 60 * 60_000)
  }
  return out
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

  // Núcleo compartilhado: processa uma lista de dias em sequência (cada
  // chamada re-puxa TODAS as empresas), com progresso real e refresh no fim.
  const rodarDias = useCallback(
    async (dias: string[]) => {
      if (rodandoRef.current || dias.length === 0) return
      rodandoRef.current = true

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
      const resumo =
        total > 2
          ? `${total - falhas}/${total} dias`
          : contas > 0
          ? `${contas} empresas`
          : "concluído"
      setEstado({
        fase: "ok",
        resumo: falhas > 0 ? `Parcial · ${resumo}` : resumo,
      })
      setTimeout(() => setEstado({ fase: "idle" }), 3200)
    },
    [router]
  )

  // Hoje + ontem cobrem os dias voláteis; sequencial → progresso por etapa.
  const iniciar = useCallback(() => {
    rodarDias([diaBRT(0), diaBRT(-1)])
  }, [rodarDias])

  // Backfill de um intervalo (após corrigir filtro/nome de campanha).
  const iniciarBackfill = useCallback(
    (de: string, ate: string) => {
      rodarDias(listaDias(de, ate))
    },
    [rodarDias]
  )

  const rodando = estado.fase === "rodando"

  return (
    <SentinelaRefreshContext.Provider
      value={{ estado, rodando, iniciar, iniciarBackfill }}
    >
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
