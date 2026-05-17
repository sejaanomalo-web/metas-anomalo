"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import {
  getNotificacoesDaSessaoAction,
  marcarComoLidaAction,
  marcarTodasComoLidasAction,
} from "@/lib/notificacoes-actions"
import type { NotificacaoItem } from "@/lib/notificacoes"

/**
 * Sino global de notificações. Renderizado no rail do AppShell (via prop).
 *
 *   • Mostra ícone com badge dourado quando há não-lidas
 *   • Click abre PainelNotificacoes (drawer da direita em mobile,
 *     popover ancorado no desktop)
 *   • Polling de 30s pra atualizar count/lista sem Realtime
 *     (Realtime ficaria pra um futuro sprint quando integrarmos com
 *     Supabase Auth — auth.uid() não bate com o cookie custom atual)
 *
 * Dados iniciais vêm SSR do dashboard/layout.tsx pra não piscar zero
 * antes do primeiro polling.
 */
export default function SinoNotificacoes({
  expandido,
  inicial,
}: {
  expandido: boolean
  inicial: { count: number; itens: NotificacaoItem[] }
}) {
  const [count, setCount] = useState(inicial.count)
  const [itens, setItens] = useState(inicial.itens)
  const [aberto, setAberto] = useState(false)
  const [, startTransition] = useTransition()

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
        onClick={() => setAberto((v) => !v)}
        title={!expandido ? "Notificações" : undefined}
        aria-label="Notificações"
        className="hover:bg-[var(--surface-2)] no-ds"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          height: 44,
          padding: expandido ? "0 12px" : "0",
          justifyContent: expandido ? "flex-start" : "center",
          background: aberto ? "var(--surface-2)" : "transparent",
          border: "none",
          borderRadius: 10,
          color: "inherit",
          cursor: "pointer",
          fontFamily: "inherit",
          textTransform: "none",
          letterSpacing: "normal",
          transition: "background 0.15s ease",
        }}
      >
        <span
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            color: count > 0 ? "var(--accent)" : "var(--text-2)",
            flexShrink: 0,
          }}
        >
          <IconeSino />
          {count > 0 && <Badge count={count} />}
        </span>
        {expandido && (
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: count > 0 ? 600 : 500,
              color: count > 0 ? "var(--text-1)" : "var(--text-2)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Notificações
          </span>
        )}
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
  // ESC fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onFechar])

  return (
    <>
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar painel"
        className="no-ds"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          border: "none",
          padding: 0,
          cursor: "default",
          zIndex: 60,
        }}
      />
      <aside
        role="dialog"
        aria-label="Notificações"
        className="glass"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(400px, 100vw)",
          zIndex: 61,
          display: "flex",
          flexDirection: "column",
          borderRadius: 0,
          borderLeft: "0.5px solid rgba(255,255,255,0.08)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 22px 14px",
            borderBottom: "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          <div>
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
          <div style={{ display: "flex", gap: 6 }}>
            {temNaoLidas && (
              <button
                type="button"
                onClick={onMarcarTodas}
                title="Marcar todas como lidas"
                className="no-ds hover:text-[var(--accent)]"
                style={{
                  padding: "6px 10px",
                  fontSize: 10,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  background: "transparent",
                  border: "0.5px solid rgba(255,255,255,0.15)",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 500,
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
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                color: "var(--text-3)",
                cursor: "pointer",
              }}
            >
              <IconeFechar />
            </button>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {itens.length === 0 ? (
            <EmptyState />
          ) : (
            itens.map((n) => (
              <ItemNotificacao
                key={n.id}
                notificacao={n}
                onMarcarLida={() => onMarcarLida(n.id)}
              />
            ))
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
  return (
    <button
      type="button"
      onClick={naoLida ? onMarcarLida : undefined}
      className="no-ds hover:bg-[var(--surface-2)]"
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "14px 22px",
        background: naoLida ? "rgba(201,149,58,0.04)" : "transparent",
        border: "none",
        borderBottom: "0.5px solid rgba(255,255,255,0.04)",
        cursor: naoLida ? "pointer" : "default",
        fontFamily: "inherit",
        color: "inherit",
        position: "relative",
        transition: "background 0.15s ease",
      }}
    >
      {naoLida && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 8,
            top: 22,
            width: 6,
            height: 6,
            borderRadius: 3,
            background: "var(--accent)",
          }}
        />
      )}
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
            fontSize: 13,
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
          fontSize: 12,
          color: "var(--text-3)",
          marginTop: 4,
          fontWeight: 400,
          lineHeight: 1.5,
        }}
      >
        {n.mensagem}
      </p>
    </button>
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
