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
 * A bolinha dourada pulsando na aba "Tráfego pago" sinaliza dado
 * "live" — atualizado pelo agente Sentinela. Mesma linguagem visual
 * do BadgeStatusSentinela, dá coerência ao painel.
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
        <BolinhaLive ativa={noTrafego} />
        Tráfego pago
      </TabLink>
    </div>
  )
}

/**
 * Dot pulsando em ouro. Na aba ATIVA (ouro sólido) muda pra preto pra
 * ficar legível sobre o background. Na inativa mantém o ouro vivo.
 */
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
          : "0 0 6px rgba(76, 78, 84,0.7)",
        animation: "pulseGold 2s ease-in-out infinite",
        flexShrink: 0,
      }}
    />
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
        boxShadow: "0 0 16px rgba(76, 78, 84,0.22)",
      }
    : destaque
    ? {
        background: "rgba(76, 78, 84,0.08)",
        color: "var(--accent)",
        border: "1px solid rgba(76, 78, 84,0.45)",
        boxShadow: "0 0 12px rgba(76, 78, 84,0.10)",
      }
    : {
        background: "transparent",
        color: "var(--text-2)",
        border: "1px solid rgba(0,0,0,0.10)",
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

