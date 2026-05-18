"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import {
  getNotificacoesDaSessaoAction,
  marcarComoLidaAction,
  marcarTodasComoLidasAction,
} from "@/lib/notificacoes-actions"
import type { NotificacaoItem } from "@/lib/notificacoes"
import { useSidebar } from "./AppShell"

/**
 * Sino global de notificações — botão flutuante no canto superior
 * direito (fixed, sempre visível em qualquer rota /dashboard).
 *
 *   • Ícone glass com badge dourado quando há não-lidas
 *   • Click abre PainelNotificacoes (full-screen no mobile com slide
 *     do topo, drawer 400px à direita no desktop)
 *   • Polling de 30s pra atualizar count/lista sem Realtime
 *     (Realtime ficaria pra futuro sprint integrado com Supabase Auth)
 *   • Fecha o rail drawer no mobile ao abrir, pra UX limpa ao fechar
 *
 * Dados iniciais vêm SSR do dashboard/layout.tsx.
 */
export default function SinoNotificacoes({
  inicial,
}: {
  inicial: { count: number; itens: NotificacaoItem[] }
}) {
  const [count, setCount] = useState(inicial.count)
  const [itens, setItens] = useState(inicial.itens)
  const [aberto, setAberto] = useState(false)
  const [, startTransition] = useTransition()
  const { setExpandido } = useSidebar()

  function abrirPainel() {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      setExpandido(false)
    }
    setAberto(true)
  }

  // Polling de 30s. Não pinga quando aba está em background pra
  // economizar request — pega só quando volta o foco.
  useEffect(() => {
    let cancelado = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function buscar() {
      if (cancelado) return
      if (typeof document !== "undefined" && document.hidden) return
      const { count: c, itens: i } = await getNotificacoesDaSessaoAction()
      if (cancelado) return
      setCount(c)
      setItens(i)
    }

    timer = setInterval(buscar, 30_000)

    function onVisibility() {
      if (document.visibilityState === "visible") buscar()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelado = true
      if (timer) clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  function marcarLida(id: string) {
    // Optimistic: tira do count e marca lida_em local
    setItens((atual) =>
      atual.map((n) =>
        n.id === id && n.lida_em == null
          ? { ...n, lida_em: new Date().toISOString() }
          : n
      )
    )
    setCount((c) => Math.max(0, c - 1))
    startTransition(() => {
      const fd = new FormData()
      fd.set("id", id)
      marcarComoLidaAction(fd)
    })
  }

  function marcarTodas() {
    setItens((atual) =>
      atual.map((n) =>
        n.lida_em == null ? { ...n, lida_em: new Date().toISOString() } : n
      )
    )
    setCount(0)
    startTransition(() => {
      marcarTodasComoLidasAction()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrirPainel())}
        aria-label={
          count > 0
            ? `${count} notificações não lidas`
            : "Notificações"
        }
        className="sino-trigger no-ds"
        data-tem-nao-lidas={count > 0 ? "true" : undefined}
        data-aberto={aberto ? "true" : undefined}
      >
        <span
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
          }}
        >
          <IconeSino />
          {count > 0 && <Badge count={count} />}
        </span>
      </button>

      {aberto && (
        <PainelNotificacoes
          itens={itens}
          onFechar={() => setAberto(false)}
          onMarcarLida={marcarLida}
          onMarcarTodas={marcarTodas}
          temNaoLidas={count > 0}
        />
      )}
    </>
  )
}

function Badge({ count }: { count: number }) {
  const texto = count > 99 ? "99+" : String(count)
  return (
    <span
      aria-label={`${count} notificações não lidas`}
      style={{
        position: "absolute",
        top: -4,
        right: -6,
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        borderRadius: 8,
        background: "var(--accent)",
        color: "#000",
        fontSize: 9,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
        boxShadow: "0 0 0 2px var(--surface-1)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {texto}
    </span>
  )
}

function PainelNotificacoes({
  itens,
  onFechar,
  onMarcarLida,
  onMarcarTodas,
  temNaoLidas,
}: {
  itens: NotificacaoItem[]
  onFechar: () => void
  onMarcarLida: (id: string) => void
  onMarcarTodas: () => void
  temNaoLidas: boolean
}) {
  // ESC fecha + bloqueia scroll do body enquanto aberto
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar()
    }
    document.addEventListener("keydown", onKey)
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflowAntes
    }
  }, [onFechar])

  return (
    <>
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar painel"
        className="no-ds painel-notif-backdrop"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          border: "none",
          padding: 0,
          cursor: "default",
          zIndex: 200,
        }}
      />
      <aside
        role="dialog"
        aria-label="Notificações"
        className="painel-notif"
        style={{
          position: "fixed",
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-1)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 20px 14px",
            paddingTop: "max(20px, env(safe-area-inset-top))",
            borderBottom: "0.5px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 10,
                letterSpacing: "1.5px",
                color: "var(--text-3)",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              Notificações
            </p>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-1)",
                marginTop: 4,
                letterSpacing: "-0.01em",
              }}
            >
              {itens.length === 0
                ? "Tudo em dia"
                : `${itens.length} ${itens.length === 1 ? "evento" : "eventos"}`}
            </h2>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {temNaoLidas && (
              <button
                type="button"
                onClick={onMarcarTodas}
                title="Marcar todas como lidas"
                className="no-ds hover:text-[var(--accent)]"
                style={{
                  padding: "8px 12px",
                  fontSize: 10,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  background: "transparent",
                  border: "0.5px solid rgba(255,255,255,0.15)",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                Marcar todas
              </button>
            )}
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="no-ds hover:text-[var(--text-1)]"
              style={{
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.04)",
                border: "none",
                borderRadius: 8,
                color: "var(--text-2)",
                cursor: "pointer",
              }}
            >
              <IconeFechar />
            </button>
          </div>
        </header>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "12px 14px",
            paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          }}
        >
          {itens.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {itens.map((n) => (
                <ItemNotificacao
                  key={n.id}
                  notificacao={n}
                  onMarcarLida={() => onMarcarLida(n.id)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

function ItemNotificacao({
  notificacao: n,
  onMarcarLida,
}: {
  notificacao: NotificacaoItem
  onMarcarLida: () => void
}) {
  const naoLida = n.lida_em == null
  const [deltaX, setDeltaX] = useState(0)
  const [saindo, setSaindo] = useState(false)
  const inicioX = useRef<number | null>(null)
  const arrastando = useRef(false)

  const LIMITE_DISMISS = 100 // px de arrasto pra dispensar

  function onTouchStart(e: React.TouchEvent) {
    inicioX.current = e.touches[0].clientX
    arrastando.current = false
  }

  function onTouchMove(e: React.TouchEvent) {
    if (inicioX.current == null) return
    const dx = e.touches[0].clientX - inicioX.current
    // Pequeno deadzone pra distinguir tap de swipe
    if (Math.abs(dx) > 6) arrastando.current = true
    // Permite arrastar nos dois sentidos com resistência
    setDeltaX(dx)
  }

  function onTouchEnd() {
    inicioX.current = null
    if (Math.abs(deltaX) >= LIMITE_DISMISS) {
      // Dispensa: anima pra fora e marca como lida
      setSaindo(true)
      setDeltaX(deltaX > 0 ? 400 : -400)
      setTimeout(onMarcarLida, 180)
    } else {
      // Volta pra posição
      setDeltaX(0)
    }
  }

  function onClick() {
    if (arrastando.current) return // não dispara click após swipe
    if (naoLida) onMarcarLida()
  }

  const opacity = saindo ? 0 : 1 - Math.min(0.5, Math.abs(deltaX) / 400)

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 14,
      }}
    >
      {/* Fundo revelado durante swipe — indica "dispensar" */}
      {Math.abs(deltaX) > 6 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: deltaX > 0 ? "flex-start" : "flex-end",
            padding: "0 22px",
            background:
              Math.abs(deltaX) >= LIMITE_DISMISS
                ? "rgba(76,175,80,0.18)"
                : "rgba(255,255,255,0.04)",
            color:
              Math.abs(deltaX) >= LIMITE_DISMISS
                ? "#4caf50"
                : "var(--text-3)",
            fontSize: 11,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            fontWeight: 600,
            transition: "background 0.15s ease",
            pointerEvents: "none",
          }}
        >
          {Math.abs(deltaX) >= LIMITE_DISMISS ? "Solte pra dispensar" : "Dispensar"}
        </div>
      )}

      <button
        type="button"
        onClick={onClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="no-ds"
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "14px 16px",
          background: naoLida
            ? "linear-gradient(180deg, rgba(201,149,58,0.10), rgba(201,149,58,0.04))"
            : "var(--surface-2)",
          border: naoLida
            ? "0.5px solid rgba(201,149,58,0.35)"
            : "0.5px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          cursor: naoLida ? "pointer" : "default",
          fontFamily: "inherit",
          color: "inherit",
          position: "relative",
          transform: `translateX(${deltaX}px)`,
          opacity,
          transition: arrastando.current
            ? "none"
            : "transform 0.2s ease, opacity 0.2s ease",
          touchAction: "pan-y",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: naoLida ? 600 : 500,
              color: naoLida ? "var(--text-1)" : "var(--text-2)",
              letterSpacing: "-0.01em",
            }}
          >
            {n.titulo}
          </span>
          <time
            dateTime={n.criada_em}
            style={{
              fontSize: 10,
              color: "var(--text-4)",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
              flexShrink: 0,
            }}
          >
            {tempoRelativo(n.criada_em)}
          </time>
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: naoLida ? "var(--text-2)" : "var(--text-3)",
            marginTop: 6,
            fontWeight: 400,
            lineHeight: 1.5,
          }}
        >
          {n.mensagem}
        </p>
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "60px 24px",
        textAlign: "center",
        color: "var(--text-3)",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          borderRadius: 24,
          background: "rgba(255,255,255,0.04)",
          color: "var(--text-4)",
          marginBottom: 14,
        }}
      >
        <IconeSino />
      </span>
      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)" }}>
        Sem notificações por enquanto
      </p>
      <p
        style={{
          fontSize: 11,
          color: "var(--text-4)",
          marginTop: 6,
          fontWeight: 400,
          lineHeight: 1.5,
        }}
      >
        Você vai receber aqui novos contratos fechados e lembretes diários
        às 6h.
      </p>
    </div>
  )
}

function tempoRelativo(iso: string): string {
  const agora = Date.now()
  const t = new Date(iso).getTime()
  const segundos = Math.floor((agora - t) / 1000)
  if (segundos < 30) return "agora"
  if (segundos < 60) return `há ${segundos}s`
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas}h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return "ontem"
  if (dias < 7) return `há ${dias}d`
  // > 7 dias: data dd/mm
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

function IconeSino() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function IconeFechar() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
