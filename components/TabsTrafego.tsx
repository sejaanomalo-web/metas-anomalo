"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

/**
 * Navegação DENTRO do fluxo de Tráfego de uma empresa: alterna apenas
 * entre "Tráfego pago" e "Tráfego por cliente". NÃO há aba "Visão geral"
 * (Metas) — os fluxos de Tráfego e Metas são separados de propósito: o
 * que se faz em Tráfego fica em Tráfego. Substitui o antigo TabsEmpresa
 * (que cruzava para Metas) nas páginas de tráfego.
 *
 * A bolinha dourada pulsando sinaliza dado "live" do agente Sentinela.
 */
export default function TabsTrafego({
  slug,
  mes,
  ano,
}: {
  slug: string
  mes: string
  ano: number
}) {
  const pathname = usePathname()
  const qs = new URLSearchParams({ mes, ano: String(ano) })
  const trafegoHref = `/dashboard/${slug}/trafego?${qs.toString()}`
  const clientesHref = `/dashboard/${slug}/clientes?${qs.toString()}`

  const noTrafego = pathname === `/dashboard/${slug}/trafego`
  const nosClientes = pathname.startsWith(`/dashboard/${slug}/clientes`)

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <TabLink href={trafegoHref} ativa={noTrafego}>
        <BolinhaLive ativa={noTrafego} />
        Tráfego pago
      </TabLink>
      <TabLink href={clientesHref} ativa={nosClientes}>
        <BolinhaLive ativa={nosClientes} />
        Tráfego por cliente
      </TabLink>
    </div>
  )
}

function BolinhaLive({ ativa }: { ativa: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: ativa ? "#000" : "var(--accent)",
        boxShadow: ativa
          ? "0 0 0 2px rgba(0,0,0,0.0)"
          : "0 0 6px rgba(201,149,58,0.7)",
        animation: "pulseGold 2s ease-in-out infinite",
        flexShrink: 0,
      }}
    />
  )
}

function TabLink({
  href,
  ativa,
  children,
}: {
  href: string
  ativa: boolean
  children: React.ReactNode
}) {
  const style: React.CSSProperties = ativa
    ? {
        background: "var(--accent)",
        color: "#000",
        border: "1px solid var(--accent)",
        boxShadow: "0 0 16px rgba(201,149,58,0.22)",
      }
    : {
        background: "rgba(201,149,58,0.08)",
        color: "var(--accent)",
        border: "1px solid rgba(201,149,58,0.45)",
        boxShadow: "0 0 12px rgba(201,149,58,0.10)",
      }

  return (
    <Link
      href={href}
      className="no-ds hover:brightness-110 transition"
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "none",
        textDecoration: "none",
        transition: "background 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      {children}
    </Link>
  )
}
