"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import logo from "@/public/logo-capa-app.png"
import { sairAction } from "@/app/login/actions"
import SinoNotificacoes from "./SinoNotificacoes"
import type { NotificacaoItem } from "@/lib/notificacoes"
import {
  type ChavePermissao,
  type Permissoes,
  type UsuarioSessao,
} from "@/lib/auth"

// Helper local (não importa temPermissao do server pra evitar bundle
// de server module no client). Replica a lógica: admin bypassa.
function temPermissao(
  usuario: UsuarioSessao,
  chave: ChavePermissao
): boolean {
  if (usuario.papel === "admin") return true
  return (usuario.permissoes as Permissoes)[chave] === true
}

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

// Rotas que NÃO são empresa — usadas pra deduzir quando Metas está ativo
// (qualquer rota /dashboard/<algo> que não seja uma dessas).
const ROTAS_NAO_EMPRESA = new Set([
  "/dashboard",
  "/dashboard/metas",
  "/dashboard/empresas",
  "/dashboard/trafego",
  "/dashboard/comercial",
  "/dashboard/financeiro",
  "/dashboard/formularios",
  "/dashboard/configuracoes",
])

function ehRotaEmpresa(pathname: string): boolean {
  if (pathname === "/dashboard/metas" || pathname === "/dashboard/empresas")
    return true
  if (!pathname.startsWith("/dashboard/")) return false
  const segmentos = pathname.split("/").filter(Boolean)
  // Primeiro segmento depois de /dashboard: se for um slug livre (não uma
  // rota especial), é página de empresa individual.
  const rotaBase = `/${segmentos.slice(0, 2).join("/")}`
  return !ROTAS_NAO_EMPRESA.has(rotaBase)
}

// Rotas do fluxo de TRÁFEGO — mantêm o item "Tráfego" ativo no rail:
//   • /dashboard/trafego                     (overview)
//   • /dashboard/[empresa]/trafego           (tráfego pago da empresa)
//   • /dashboard/[empresa]/clientes[/...]    (tráfego POR CLIENTE)
// Tráfego e Metas são fluxos separados: estar numa página de cliente NÃO
// deve acender "Metas" só porque a URL começa com /dashboard/[empresa].
function ehRotaTrafego(pathname: string): boolean {
  if (pathname === "/dashboard/trafego") return true
  const segmentos = pathname.split("/").filter(Boolean) // [dashboard, emp, sub]
  if (segmentos[0] !== "dashboard" || segmentos.length < 3) return false
  const sub = segmentos[2]
  return sub === "trafego" || sub === "clientes"
}

export default function AppShell({
  children,
  usuarioAtual,
  notificacoesIniciais,
  mostrarSino,
}: {
  children: ReactNode
  usuarioAtual: UsuarioSessao
  notificacoesIniciais: { count: number; itens: NotificacaoItem[] }
  mostrarSino: boolean
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
        usuarioAtual={usuarioAtual}
      />

      {/* Sino flutuante no canto superior direito. Renderizado só pra
       * usuários com permissão ver_notificacoes (gestor de tráfego sem
       * essa permissão não vê o sino). */}
      {mostrarSino && <SinoNotificacoes inicial={notificacoesIniciais} />}

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
  usuarioAtual,
}: {
  expandido: boolean
  onToggle: () => void
  usuarioAtual: UsuarioSessao
}) {
  const pathname = usePathname()
  const width = expandido ? RAIL_EXPANDED : RAIL_COLLAPSED

  const dashboardAtivo = pathname === "/dashboard"
  const trafegoAtivo = ehRotaTrafego(pathname)
  const financeiroAtivo = pathname.startsWith("/dashboard/financeiro")
  const comercialAtivo =
    pathname === "/dashboard/comercial" || pathname.endsWith("/comercial")
  // Metas (antigo Empresas) só ativa quando NÃO estamos em tráfego,
  // comercial nem financeiro — evita destacar dois items ao mesmo tempo
  // em rotas aninhadas. Cobre /dashboard/metas e o detalhe de empresa
  // /dashboard/[empresa] (pelado), mas NÃO as sub-rotas de tráfego da
  // empresa (/trafego e /clientes), que ficam com "Tráfego".
  const metasAtivo =
    !trafegoAtivo &&
    !financeiroAtivo &&
    !comercialAtivo &&
    ehRotaEmpresa(pathname)
  const configAtivo = pathname === "/dashboard/configuracoes"

  // RBAC: cada item só aparece se o usuário tem a permissão correspondente.
  // Admin (papel='admin') vê tudo via bypass dentro de temPermissao.
  const podeDashboard = temPermissao(usuarioAtual, "dashboard_principal")
  const podeEmpresas = temPermissao(usuarioAtual, "dashboard_empresas")
  const podeTrafego = temPermissao(usuarioAtual, "dashboard_trafego")
  const podeComercial = temPermissao(usuarioAtual, "dashboard_comercial")
  const podeFinanceiro = temPermissao(usuarioAtual, "dashboard_financeiro")
  const podeConfig = temPermissao(usuarioAtual, "configuracoes")

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
        {podeDashboard && (
          <ItemMenu
            icon={<IconeDashboard />}
            rotulo="Dashboard"
            href="/dashboard"
            expandido={expandido}
            ativo={dashboardAtivo}
          />
        )}
        {podeEmpresas && (
          <ItemMenu
            icon={<IconeEmpresas />}
            rotulo="Metas"
            href="/dashboard/metas"
            expandido={expandido}
            ativo={metasAtivo}
          />
        )}
        {podeTrafego && (
          <ItemMenu
            icon={<IconeTrafego />}
            rotulo="Tráfego"
            href="/dashboard/trafego"
            expandido={expandido}
            ativo={trafegoAtivo}
          />
        )}
        {podeComercial && (
          <ItemMenu
            icon={<IconeComercial />}
            rotulo="Comercial"
            href="/dashboard/comercial"
            expandido={expandido}
            ativo={comercialAtivo}
          />
        )}
        {podeFinanceiro && (
          <ItemMenu
            icon={<IconeFinanceiro />}
            rotulo="Financeiro"
            href="/dashboard/financeiro"
            expandido={expandido}
            ativo={financeiroAtivo}
          />
        )}
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
        {podeConfig && (
          <ItemMenu
            icon={<IconeConfig />}
            rotulo="Configurações"
            href="/dashboard/configuracoes"
            expandido={expandido}
            ativo={configAtivo}
          />
        )}
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

// Parâmetros do período global que devem ser PRESERVADOS ao navegar entre
// abas — assim o filtro de data escolhido (Mês/Dia/Intervalo) se mantém até
// o usuário trocá-lo de novo, em vez de resetar a cada clique no menu.
const PARAMS_PERIODO = ["modo", "de", "ate", "mes", "ano"] as const

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
  const searchParams = useSearchParams()
  let hrefFinal = href
  if (href) {
    const qs = new URLSearchParams()
    for (const k of PARAMS_PERIODO) {
      const v = searchParams.get(k)
      if (v) qs.set(k, v)
    }
    const s = qs.toString()
    if (s) hrefFinal = `${href}?${s}`
  }
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
        href={hrefFinal ?? href}
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

function IconeTrafego() {
  // Raio com sinalização de live data (mesma linguagem do dot pulsante
  // da aba /trafego). Outline pra combinar com os outros ícones do rail.
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
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function IconeFinanceiro() {
  // Carteira (wallet) — semântico de caixa/dinheiro guardado. Outline
  // pra combinar com o resto do rail.
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
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  )
}

function IconeComercial() {
  // Funil — semântico do processo comercial (etapas do funil de vendas).
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
      <path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" />
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
