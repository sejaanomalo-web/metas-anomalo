"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const ITEMS: { rotulo: string; href: string; matchExact?: boolean }[] = [
  { rotulo: "Lista", href: "/dashboard/workspace", matchExact: true },
  { rotulo: "Calendário", href: "/dashboard/workspace/calendario" },
  { rotulo: "Clientes", href: "/dashboard/workspace/clientes" },
  { rotulo: "Minhas", href: "/dashboard/workspace/minhas" },
  { rotulo: "Arquivo", href: "/dashboard/workspace/arquivo" },
]

/**
 * Cabeçalho do Workspace no desenho do Asana: ícone do projeto (quadrado
 * arredondado âmbar com glifo de calendário — o mesmo do "Calendário de
 * conteúdo" dos prints), título ao lado e a régua de abas SUBLINHADAS
 * (aba ativa com barra branca embaixo), substituindo as pílulas antigas.
 *
 * NÃO propaga o período global da URL: o Workspace tem o próprio conceito de
 * tempo (prazo da tarefa), e herdar ?mes=&ano= do resto do app confundiria
 * os dois.
 */
export default function WorkspaceNav() {
  const pathname = usePathname()

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0 8px" }}>
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: "#cf9338",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e1f21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "var(--text-1)" }}>
          Workspace
        </h1>
      </div>

      <nav
        style={{
          display: "flex",
          gap: 2,
          flexWrap: "wrap",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {ITEMS.map((item) => {
          const ativo = item.matchExact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "7px 10px",
                fontSize: 13,
                fontWeight: ativo ? 600 : 400,
                color: ativo ? "var(--text-1)" : "var(--text-3)",
                textDecoration: "none",
                borderBottom: ativo ? "2px solid var(--text-1)" : "2px solid transparent",
                marginBottom: -1,
                transition: "color 0.15s ease",
              }}
            >
              {item.rotulo}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
