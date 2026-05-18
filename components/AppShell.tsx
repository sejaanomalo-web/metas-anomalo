"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import logo from "@/public/logo-capa-app.png"
import { sairAction } from "@/app/login/actions"
import SinoNotificacoes from "./SinoNotificacoes"
import type { NotificacaoItem } from "@/lib/notificacoes"

/**
 * Shell global de /dashboard/*:
 *
 *   • Desktop (lg+): rail fixo à esquerda, 72px colapsado ou 240px
 *     expandido. Toggle via logo "A" no topo do rail.
 *   • Mobile (< lg): rail sai do fluxo e fica como overlay drawer
 *     (sempre 240px quando visível). Por padrão escondido; um botão
 *     hambúrguer com logo no canto superior esquerdo abre o drawer.
 *     Backdrop atrás do drawer fecha ao clicar.
 *
 * Items do rail: Dashboard, Empresas, Formulários, Configurações, Sair.
 * Formulários é link direto pra /dashboard/formularios — preenchimento
 * manual com seletor de empresa. Substitui o antigo /dashboard/preenchedores
 * (sistema de tokens individuais), agora é um link público único.
 *
 * Indicador de rota ativa: barra vertical ouro à esquerda do item +
 * ícone em ouro + texto em text-1. Calculado via usePathname.
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

// Rotas que NÃO são empresa — usadas pra deduzir quando Empresas está ativo
// (qualquer rota /dashboard/<algo> que não seja uma dessas).
const ROTAS_NAO_EMPRESA = new Set([
  "/dashboard",
  "/dashboard/empresas",
  "/dashboard/formularios",
  "/dashboard/configuracoes",
])

function ehRotaEmpresa(pathname: string): boolean {
  if (pathname === "/dashboard/empresas") return true
  if (!pathname.startsWith("/dashboard/")) return false
  const segmentos = pathname.split("/").filter(Boolean)
  // Primeiro segmento depois de /dashboard: se for um slug livre (não uma
  // rota especial), é página de empresa individual.
  const rotaBase = `/${segmentos.slice(0, 2).join("/")}`
  return !ROTAS_NAO_EMPRESA.has(rotaBase)
}

export default function AppShell({
  children,
  notificacoesIniciais,
}: {
  children: ReactNode
  notificacoesIniciais: { count: number; itens: NotificacaoItem[] }
}) {
  const [expandido, setExpandido] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "true") setExpandido(true)
    } catch {}
    setHydrated(true)
  }, [])

  // Em mobile, ao mudar de rota fecha o drawer automaticamente — é o
  // padrão esperado de menus tipo hambúrguer.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setExpandido(false)
    }
  }, [pathname])

  function toggle() {
    setExpandido((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {}
      return next
    })
  }

  function fechar() {
    setExpandido(false)
  }

  const value: SidebarCtx = { expandido, toggle, setExpandido }
  const railWidth = hydrated && expandido ? RAIL_EXPANDED : RAIL_COLLAPSED

  return (
    <SidebarContext.Provider value={value}>
      {/* Trigger mobile (hambúrguer com logo). Só aparece em < lg. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={expandido ? "Fechar menu" : "Abrir menu"}
        className="app-mobile-trigger no-ds"
      >
        <Image
          src={logo}
          alt="Anômalo"
          height={24}
          style={{ height: 24, width: "auto" }}
          priority
        />
        <IconeHamburger />
      </button>

      {/* Backdrop mobile — só visível em < lg quando drawer está aberto. */}
      {hydrated && expandido && (
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar menu"
          className="app-mobile-backdrop no-ds"
        />
      )}

      <SidebarRail
        expandido={hydrated ? expandido : false}
        onToggle={toggle}
      />

      {/* Sino flutuante no canto superior direito — sempre visível
       * em qualquer rota /dashboard (desktop e mobile). */}
      <SinoNotificacoes inicial={notificacoesIniciais} />

      <div
        className="app-main"
        style={{
          // CSS var permite que a regra mobile sobrescreva pra 0 sem
          // que precisemos checar matchMedia no React.
          ["--rail-width" as string]: `${railWidth}px`,
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
  const pathname = usePathname()
  const width = expandido ? RAIL_EXPANDED : RAIL_COLLAPSED

  const dashboardAtivo = pathname === "/dashboard"
  const empresasAtivo = ehRotaEmpresa(pathname)
  const formulariosAtivo = pathname === "/dashboard/formularios"
  const configAtivo = pathname === "/dashboard/configuracoes"

  return (
    <aside
      data-expandido={expandido}
      className="app-rail"
      style={{
        width,
        background: "var(--surface-1)",
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
        <ItemMenu
          icon={<IconeFormularios />}
          rotulo="Formulários"
          href="/dashboard/formularios"
          expandido={expandido}
          ativo={formulariosAtivo}
        />
      </nav>

      {/* Rodapé: Configurações + Sair (sino vive agora no topo direito
       * flutuante, fora do rail) */}
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

/**
 * Logo Anômalo no topo do rail. Clicar toggla expand/collapse.
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
  onClick,
}: {
  icon: ReactNode
  rotulo: string
  href?: string
  type?: "submit"
  expandido: boolean
  ativo: boolean
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

/* =================== Ícones (SVG inline) =================== */

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

function IconeFormularios() {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
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

function IconeHamburger() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}
