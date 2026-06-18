"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { periodoQSFromParams } from "@/lib/periodo-url"

/**
 * Navegação DENTRO do fluxo de Metas de uma empresa: alterna entre "Metas"
 * (dashboard da empresa, /dashboard/[slug]) e "Metas por cliente"
 * (/dashboard/[slug]/metas). Espelha o TabsTrafego do fluxo de Tráfego —
 * mesma ideia de drill Hub → empresa → cliente, agora para metas.
 *
 * Empresas sem clientes de tráfego não mostram a aba "Metas por cliente".
 */
export default function TabsMetas({
  slug,
  mes,
  ano,
  temClientes = true,
}: {
  slug: string
  mes: string
  ano: number
  temClientes?: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const qs = periodoQSFromParams(searchParams, { mes, ano })
  const sufixo = qs ? `?${qs}` : ""
  const metasHref = `/dashboard/${slug}${sufixo}`
  const clientesHref = `/dashboard/${slug}/metas${sufixo}`

  // "Metas" ativa só na raiz da empresa; "Metas por cliente" em /metas[/...].
  const nasMetas = pathname === `/dashboard/${slug}`
  const nosClientes = pathname.startsWith(`/dashboard/${slug}/metas`)

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <TabLink href={metasHref} ativa={nasMetas}>
        <Bolinha ativa={nasMetas} />
        Metas
      </TabLink>
      {temClientes && (
        <TabLink href={clientesHref} ativa={nosClientes}>
          <Bolinha ativa={nosClientes} />
          Metas por cliente
        </TabLink>
      )}
    </div>
  )
}

function Bolinha({ ativa }: { ativa: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: ativa ? "#000" : "var(--accent)",
        boxShadow: ativa ? "none" : "0 0 6px rgba(201,149,58,0.6)",
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
