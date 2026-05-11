"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { sairAction } from "@/app/login/actions"
import DrawerEmpresas from "@/components/DrawerEmpresas"
import type { Ano, EmpresaMeta, Mes } from "@/lib/data"

/**
 * Sidebar global do /dashboard/*. Existe em dois modos:
 *
 *   • Colapsado (default): rail de 64px na extrema esquerda, mostrando
 *     só ícones quadrados pra cada seção. Hover mostra tooltip nativo.
 *   • Expandido: rail vira sidebar de 240px com rótulos e sub-items
 *     visíveis (lista de empresas, links do time, etc.).
 *
 * Toggle: clicar no logo Anômalo (que vive no Header, usa o context
 * exposto por este componente via LogoToggle).
 *
 * Estado persistido em localStorage pra sobreviver navegação entre
 * rotas — recolhido por padrão na primeira visita.
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

export default function AppShell({
  empresas,
  empresasInativas,
  supabaseOk,
  children,
}: {
  empresas: EmpresaMeta[]
  empresasInativas: EmpresaMeta[]
  supabaseOk: boolean
  children: ReactNode
}) {
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
  const railWidth = expandido ? 240 : 64

  return (
    <SidebarContext.Provider value={value}>
      <SidebarRail
        empresas={empresas}
        empresasInativas={empresasInativas}
        supabaseOk={supabaseOk}
        expandido={hydrated ? expandido : false}
      />
      <div
        style={{
          marginLeft: hydrated ? railWidth : 64,
          transition: "margin-left 0.18s ease",
          minHeight: "100vh",
        }}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function SidebarRail({
  empresas,
  empresasInativas,
  supabaseOk,
  expandido,
}: {
  empresas: EmpresaMeta[]
  empresasInativas: EmpresaMeta[]
  supabaseOk: boolean
  expandido: boolean
}) {
  // Mes/ano não chegam aqui — o rail é montado uma vez no layout e os
  // links da seção Empresas usam a URL "limpa" da empresa. A página de
  // empresa preserva mes/ano via SeletorPeriodo no próprio header.
  return (
    <aside
      data-expandido={expandido}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width: expandido ? 240 : 64,
        background: "var(--surface-1)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        transition: "width 0.18s ease",
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      {/* Spacer pra alinhar com o header de 64px */}
      <div style={{ height: 64, flexShrink: 0 }} />

      {/* Itens principais */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: expandido ? "8px 12px" : "8px 8px",
          flex: 1,
        }}
      >
        <SecaoEmpresas
          empresas={empresas}
          empresasInativas={empresasInativas}
          supabaseOk={supabaseOk}
          expandido={expandido}
        />
        <SecaoTime expandido={expandido} />
      </div>

      {/* Rodapé: Configurações + Sair */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: expandido ? "8px 12px 16px" : "8px 8px 16px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <ItemMenu
          icon="⚙"
          rotulo="Configurações"
          href="/dashboard/configuracoes"
          expandido={expandido}
        />
        <form action={sairAction} style={{ width: "100%" }}>
          <ItemMenu
            icon="⎋"
            rotulo="Sair"
            type="submit"
            expandido={expandido}
          />
        </form>
      </div>
    </aside>
  )
}

function SecaoEmpresas({
  empresas,
  empresasInativas,
  supabaseOk,
  expandido,
}: {
  empresas: EmpresaMeta[]
  empresasInativas: EmpresaMeta[]
  supabaseOk: boolean
  expandido: boolean
}) {
  const [aberto, setAberto] = useState(true)

  return (
    <div>
      <ItemMenu
        icon="▦"
        rotulo="Empresas"
        contagem={empresas.length}
        expandido={expandido}
        chevron={expandido}
        chevronAberto={aberto}
        onClick={() => expandido && setAberto((v) => !v)}
      />
      {expandido && aberto && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            paddingLeft: 38,
            marginTop: 4,
            marginBottom: 6,
          }}
        >
          {empresas.length === 0 && (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-4)",
                fontStyle: "italic",
                padding: "6px 8px",
              }}
            >
              Nenhuma cadastrada
            </p>
          )}
          {empresas.map((e) => (
            <Link
              key={e.slug}
              href={`/dashboard/${e.slug}`}
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                padding: "5px 8px",
                borderRadius: 6,
                fontWeight: 500,
                lineHeight: 1.3,
              }}
              className="hover:bg-[rgba(255,255,255,0.04)] hover:text-white transition"
            >
              {e.nome}
            </Link>
          ))}
          <div style={{ marginTop: 6 }}>
            <DrawerEmpresas
              empresas={empresas}
              empresasInativas={empresasInativas}
              supabaseOk={supabaseOk}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SecaoTime({ expandido }: { expandido: boolean }) {
  const [aberto, setAberto] = useState(true)

  return (
    <div>
      <ItemMenu
        icon="◐"
        rotulo="Time"
        expandido={expandido}
        chevron={expandido}
        chevronAberto={aberto}
        onClick={() => expandido && setAberto((v) => !v)}
      />
      {expandido && aberto && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            paddingLeft: 38,
            marginTop: 4,
            marginBottom: 6,
          }}
        >
          <Link
            href="/dashboard/comissionamento"
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              padding: "5px 8px",
              borderRadius: 6,
              fontWeight: 500,
            }}
            className="hover:bg-[rgba(255,255,255,0.04)] hover:text-white transition"
          >
            Comissionamento
          </Link>
          <Link
            href="/dashboard/preenchedores"
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              padding: "5px 8px",
              borderRadius: 6,
              fontWeight: 500,
            }}
            className="hover:bg-[rgba(255,255,255,0.04)] hover:text-white transition"
          >
            Formulários diários
          </Link>
        </div>
      )}
    </div>
  )
}

/**
 * Item visual do menu rail. Em modo colapsado: quadrado 40x40 com
 * só o ícone. Em modo expandido: ícone + rótulo + contagem opcional +
 * chevron opcional (se for header de seção colapsável).
 */
function ItemMenu({
  icon,
  rotulo,
  href,
  type,
  contagem,
  expandido,
  chevron,
  chevronAberto,
  onClick,
}: {
  icon: string
  rotulo: string
  href?: string
  type?: "submit"
  contagem?: number
  expandido: boolean
  chevron?: boolean
  chevronAberto?: boolean
  onClick?: () => void
}) {
  const conteudoInterno = (
    <>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          fontSize: 14,
          color: "var(--text-2)",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      {expandido && (
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-2)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {rotulo}
        </span>
      )}
      {expandido && typeof contagem === "number" && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-4)",
            background: "rgba(255,255,255,0.05)",
            padding: "2px 6px",
            borderRadius: 999,
          }}
        >
          {contagem}
        </span>
      )}
      {expandido && chevron && (
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
  )

  const sharedStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: expandido ? "8px 10px" : "8px",
    borderRadius: 8,
    width: "100%",
    transition: "background 0.15s ease",
    cursor: "pointer",
    background: "transparent",
    border: "none",
    color: "inherit",
    textAlign: "left" as const,
    fontFamily: "inherit",
    fontSize: "inherit",
    textTransform: "none" as const,
    letterSpacing: "normal",
  }

  if (href) {
    return (
      <Link
        href={href}
        title={!expandido ? rotulo : undefined}
        style={sharedStyle}
        className="hover:bg-[rgba(255,255,255,0.04)] no-ds"
      >
        {conteudoInterno}
      </Link>
    )
  }

  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      title={!expandido ? rotulo : undefined}
      style={sharedStyle}
      className="hover:bg-[rgba(255,255,255,0.04)] no-ds"
    >
      {conteudoInterno}
    </button>
  )
}
