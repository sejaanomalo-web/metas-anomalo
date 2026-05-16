"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

/**
 * Nav em forma de pílulas para alternar entre as abas do painel de uma
 * empresa específica:
 *
 *   ┌──────────────┐ ┌──────────────────┐
 *   │ Visão Geral  │ │ ◆ Tráfego pago   │
 *   └──────────────┘ └──────────────────┘
 *
 * A aba ativa fica em ouro sólido (mesmo padrão do .btn-gold-filled);
 * a inativa fica em ghost/outline. Detecção da rota ativa via
 * usePathname (client component).
 *
 * O ícone "◆" na aba "Tráfego pago" sinaliza dado em tempo real
 * (atualizado pelo agente Sentinela). A diferença visual reforça que
 * é uma seção especial, conectada ao Meta Ads.
 */
export default function TabsEmpresa({
  slug,
  mes,
  ano,
  origem,
}: {
  slug: string
  mes: string
  ano: number
  origem?: string
}) {
  const pathname = usePathname()
  const qs = new URLSearchParams({ mes, ano: String(ano) })
  if (origem && origem !== "pago") qs.set("origem", origem)
  const visaoHref = `/dashboard/${slug}?${qs.toString()}`
  const trafegoHref = `/dashboard/${slug}/trafego?${qs.toString()}`

  const naVisao = pathname === `/dashboard/${slug}`
  const noTrafego = pathname === `/dashboard/${slug}/trafego`

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <TabLink href={visaoHref} ativa={naVisao}>
        Visão Geral
      </TabLink>
      <TabLink href={trafegoHref} ativa={noTrafego} destaque>
        <IconeRaio />
        Tráfego pago
      </TabLink>
    </div>
  )
}

function TabLink({
  href,
  ativa,
  destaque,
  children,
}: {
  href: string
  ativa: boolean
  destaque?: boolean
  children: React.ReactNode
}) {
  // Visual:
  //  - ativa (sempre): ouro sólido, texto preto, pequeno glow
  //  - inativa + destaque (Tráfego): outline em ouro forte com glow sutil
  //  - inativa normal: outline neutro em var(--surface-2)
  const style: React.CSSProperties = ativa
    ? {
        background: "var(--accent)",
        color: "#000",
        border: "1px solid var(--accent)",
        boxShadow: "0 0 16px rgba(201,149,58,0.22)",
      }
    : destaque
    ? {
        background: "rgba(201,149,58,0.08)",
        color: "var(--accent)",
        border: "1px solid rgba(201,149,58,0.45)",
        boxShadow: "0 0 12px rgba(201,149,58,0.10)",
      }
    : {
        background: "transparent",
        color: "var(--text-2)",
        border: "1px solid rgba(255,255,255,0.10)",
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

function IconeRaio() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}
