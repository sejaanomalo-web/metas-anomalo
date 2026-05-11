"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import logo from "@/public/logo-anomalo.png"
import { sairAction } from "@/app/login/actions"

/**
 * Sidebar global do /dashboard/*. Dois modos:
 *
 *   • Colapsado (default): rail de 72px na extrema esquerda mostrando
 *     o logo Anômalo no topo + ícones quadrados de cada seção.
 *   • Expandido: rail vira sidebar de 240px com rótulos visíveis ao
 *     lado dos ícones.
 *
 * Toggle: clicar no logo do topo do rail (ItemLogo).
 *
 * Indicador de rota ativa: barra vertical ouro (3px) à esquerda do
 * item + cor do ícone em ouro + texto em text-1. Muda conforme o
 * pathname:
 *   /dashboard                  → Dashboard
 *   /dashboard/empresas         → Empresas
 *   /dashboard/<slug>           → Empresas (página de empresa individual)
 *   /dashboard/comissionamento  → Time
 *   /dashboard/preenchedores    → Time
 *   /dashboard/configuracoes    → Configurações
 */

interface SidebarCtx {
  expandido: boolean
  toggle: () => void
  setExpandido: (v: boolean) => void
}

const SidebarContext = createContext<SidebarCtx>({
  expandido: false,
  toggle: () => {},
  setExpandido: () => {},
})

export function useSidebar(): SidebarCtx {
  return useContext(SidebarContext)
}

const STORAGE_KEY = "anomalo-sidebar-expandido"
const RAIL_COLLAPSED = 72
const RAIL_EXPANDED = 240

// Rotas das outras seções — usadas pra deduzir quando Empresas está ativo
// (qualquer rota /dashboard/<slug> que NÃO seja uma dessas).
const ROTAS_NAO_EMPRESA = new Set([
  "/dashboard/empresas",
  "/dashboard/comissionamento",
  "/dashboard/preenchedores",
  "/dashboard/configuracoes",
])

function ehRotaEmpresa(pathname: string): boolean {
  if (pathname === "/dashboard/empresas") return true
  if (!pathname.startsWith("/dashboard/")) return false
  if (pathname === "/dashboard") return false
  // /dashboard/<algo>  →  empresa (a menos que seja uma rota especial)
  return !ROTAS_NAO_EMPRESA.has(pathname.replace(/\/$/, "").split("/").slice(0, 3).join("/"))
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [expandido, setExpandido] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "true") setExpandido(true)
    } catch {}
    setHydrated(true)
  }, [])

  function toggle() {
    setExpandido((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {}
      return next
    })
  }

  const value: SidebarCtx = { expandido, toggle, setExpandido }
  const railWidth = hydrated && expandido ? RAIL_EXPANDED : RAIL_COLLAPSED

  return (
    <SidebarContext.Provider value={value}>
      <SidebarRail expandido={hydrated ? expandido : false} onToggle={toggle} />
      <div
        style={{
          marginLeft: railWidth,
          transition: "margin-left 0.2s ease",
          minHeight: "100vh",
        }}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function SidebarRail({
  expandido,
  onToggle,
}: {
  expandido: boolean
  onToggle: () => void
}) {
  const [timeAberto, setTimeAberto] = useState(true)
  const pathname = usePathname()
  const width = expandido ? RAIL_EXPANDED : RAIL_COLLAPSED

  const dashboardAtivo = pathname === "/dashboard"
  const empresasAtivo = ehRotaEmpresa(pathname)
  const timeAtivo =
    pathname === "/dashboard/comissionamento" ||
    pathname === "/dashboard/preenchedores"
  const configAtivo = pathname === "/dashboard/configuracoes"

  return (
    <aside
      data-expandido={expandido}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width,
        background: "var(--surface-1)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        transition: "width 0.2s ease",
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      {/* Logo Anômalo (botão de toggle) */}
      <div style={{ padding: "16px 14px 8px 14px" }}>
        <ItemLogo expandido={expandido} onClick={onToggle} />
      </div>

      {/* Navegação principal */}
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "8px 14px",
          flex: 1,
        }}
      >
        <ItemMenu
          icon={<IconeDashboard />}
          rotulo="Dashboard"
          href="/dashboard"
          expandido={expandido}
          ativo={dashboardAtivo}
        />
        <ItemMenu
          icon={<IconeEmpresas />}
          rotulo="Empresas"
          href="/dashboard/empresas"
          expandido={expandido}
          ativo={empresasAtivo}
        />
        <SecaoTime
          expandido={expandido}
          aberto={timeAberto}
          onToggle={() => expandido && setTimeAberto((v) => !v)}
          pathname={pathname}
          ativo={timeAtivo}
        />
      </nav>

      {/* Rodapé: Configurações + Sair */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "12px 14px 16px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <ItemMenu
          icon={<IconeConfig />}
          rotulo="Configurações"
          href="/dashboard/configuracoes"
          expandido={expandido}
          ativo={configAtivo}
        />
        <form action={sairAction} style={{ width: "100%" }}>
          <ItemMenu
            icon={<IconeSair />}
            rotulo="Sair"
            type="submit"
            expandido={expandido}
            ativo={false}
          />
        </form>
      </div>
    </aside>
  )
}

function SecaoTime({
  expandido,
  aberto,
  onToggle,
  pathname,
  ativo,
}: {
  expandido: boolean
  aberto: boolean
  onToggle: () => void
  pathname: string
  ativo: boolean
}) {
  return (
    <div>
      <ItemMenu
        icon={<IconeTime />}
        rotulo="Time"
        expandido={expandido}
        chevron={expandido}
        chevronAberto={aberto}
        onClick={onToggle}
        ativo={ativo}
      />
      {expandido && aberto && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            marginTop: 4,
            marginLeft: 14,
            paddingLeft: 14,
            borderLeft: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <SubItemMenu
            href="/dashboard/comissionamento"
            rotulo="Comissionamento"
            ativo={pathname === "/dashboard/comissionamento"}
          />
          <SubItemMenu
            href="/dashboard/preenchedores"
            rotulo="Formulários diários"
            ativo={pathname === "/dashboard/preenchedores"}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Logo Anômalo no topo do rail. Clicar toggla expand/collapse.
 * Não tem barra ativa nem indicador (é só o branding + toggle).
 */
function ItemLogo({
  expandido,
  onClick,
}: {
  expandido: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expandido ? "Recolher menu" : "Expandir menu"}
      title={expandido ? "Recolher menu" : "Expandir menu"}
      className="no-ds hover:bg-[var(--surface-2)]"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: expandido ? "flex-start" : "center",
        gap: 12,
        width: "100%",
        height: 44,
        padding: expandido ? "0 12px" : "0",
        background: "transparent",
        border: "none",
        borderRadius: 10,
        cursor: "pointer",
        color: "inherit",
        fontFamily: "inherit",
        fontSize: "inherit",
        textTransform: "none",
        letterSpacing: "normal",
        transition: "background 0.15s ease",
      }}
    >
      <Image
        src={logo}
        alt="Anômalo"
        height={28}
        style={{ height: 28, width: "auto", flexShrink: 0 }}
        priority
      />
    </button>
  )
}

function ItemMenu({
  icon,
  rotulo,
  href,
  type,
  expandido,
  ativo,
  chevron,
  chevronAberto,
  onClick,
}: {
  icon: ReactNode
  rotulo: string
  href?: string
  type?: "submit"
  expandido: boolean
  ativo: boolean
  chevron?: boolean
  chevronAberto?: boolean
  onClick?: () => void
}) {
  const conteudo = (
    <>
      {ativo && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            background: "var(--accent)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      )}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
          color: ativo ? "var(--accent)" : "var(--text-2)",
          flexShrink: 0,
          transition: "color 0.15s ease",
        }}
      >
        {icon}
      </span>
      {expandido && (
        <>
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: ativo ? 600 : 500,
              color: ativo ? "var(--text-1)" : "var(--text-2)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              transition: "color 0.15s ease",
            }}
          >
            {rotulo}
          </span>
          {chevron && (
            <span
              aria-hidden="true"
              style={{
                fontSize: 10,
                color: "var(--text-3)",
                transform: chevronAberto ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              ▾
            </span>
          )}
        </>
      )}
    </>
  )

  const baseStyle = {
    position: "relative" as const,
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    height: 44,
    padding: expandido ? "0 12px" : "0",
    justifyContent: expandido ? ("flex-start" as const) : ("center" as const),
    background: ativo ? "var(--surface-2)" : "transparent",
    border: "none",
    borderRadius: 10,
    color: "inherit",
    cursor: "pointer",
    textAlign: "left" as const,
    fontFamily: "inherit",
    fontSize: "inherit",
    textTransform: "none" as const,
    letterSpacing: "normal",
    transition: "background 0.15s ease",
  }

  if (href) {
    return (
      <Link
        href={href}
        title={!expandido ? rotulo : undefined}
        style={baseStyle}
        className="hover:bg-[var(--surface-2)] no-ds"
      >
        {conteudo}
      </Link>
    )
  }

  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      title={!expandido ? rotulo : undefined}
      style={baseStyle}
      className="hover:bg-[var(--surface-2)] no-ds"
    >
      {conteudo}
    </button>
  )
}

function SubItemMenu({
  href,
  rotulo,
  ativo,
}: {
  href: string
  rotulo: string
  ativo: boolean
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "8px 10px",
        fontSize: 12,
        fontWeight: ativo ? 600 : 500,
        color: ativo ? "var(--accent)" : "var(--text-3)",
        borderRadius: 8,
        transition: "background 0.15s ease, color 0.15s ease",
      }}
      className="hover:bg-[rgba(255,255,255,0.04)]"
    >
      {rotulo}
    </Link>
  )
}

/* =================== Ícones (SVG inline 20x20) =================== */

function IconeDashboard() {
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
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  )
}

function IconeEmpresas() {
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
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
    </svg>
  )
}

function IconeTime() {
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
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconeConfig() {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function IconeSair() {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
