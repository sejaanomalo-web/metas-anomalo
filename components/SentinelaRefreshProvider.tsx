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

/** Horário do cron automático da Sentinela em BRT (09:00, único — ver
 *  migration 20260720_sentinela_cron_9h.sql). Devolve "09:00 de amanhã" se
 *  já passou das 09:00 hoje, senão "09:00". */
function proximaRotinaBRT(): string {
  const agoraUTC = new Date()
  const ms = agoraUTC.getTime() + agoraUTC.getTimezoneOffset() * 60_000
  const brt = new Date(ms - 3 * 60 * 60_000)
  const h = brt.getUTCHours()
  return h < 9 ? "09:00" : "09:00 de amanhã"
}

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
 * atualização garantida sem ninguém aberto existe o cron automático das
 * 09:00 BRT (ver migration 20260720_sentinela_cron_9h.sql).
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

    // Chamada síncrona: a edge function processa ontem+hoje pra todas as
    // empresas e devolve o resultado direto na resposta — sem polling.
    setEstado({ fase: "rodando", pct: 20, etapa: "Chamando a Sentinela…" })
    const inicio = Date.now()

    const resultado = await dispararSentinelaDia()

    if (!resultado.ok && resultado.semSecret) {
      setEstado({
        fase: "erro",
        msg: `Sentinela precisa do SENTINELA_SECRET no Vercel. Próxima coleta automática: ${proximaRotinaBRT()} BRT.`,
      })
      setTimeout(() => setEstado({ fase: "idle" }), 12000)
      rodandoRef.current = false
      return
    }

    if (!resultado.ok) {
      setEstado({ fase: "erro", msg: resultado.erro ?? "Falha ao atualizar." })
      setTimeout(() => setEstado({ fase: "idle" }), 6000)
      rodandoRef.current = false
      return
    }

    setEstado({ fase: "rodando", pct: 96, etapa: "Recarregando…" })
    router.refresh()
    const seg = Math.round((Date.now() - inicio) / 1000)
    const t = resultado.totais
    const resumo = t
      ? `${t.contas_processadas} contas · R$ ${t.investimento_total.toFixed(2)} · ${seg}s`
      : `concluído · ${seg}s`
    setEstado({ fase: "ok", resumo })
    setTimeout(() => setEstado({ fase: "idle" }), 4500)
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
