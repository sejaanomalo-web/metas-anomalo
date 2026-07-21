"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const ITEMS: { rotulo: string; href: string; matchExact?: boolean }[] = [
  { rotulo: "Tarefas", href: "/dashboard/workspace", matchExact: true },
  { rotulo: "Calendário", href: "/dashboard/workspace/calendario" },
  { rotulo: "Clientes", href: "/dashboard/workspace/clientes" },
  { rotulo: "Minhas", href: "/dashboard/workspace/minhas" },
  { rotulo: "Arquivo", href: "/dashboard/workspace/arquivo" },
]

/**
 * Navegação interna do Workspace. Mesmas pílulas do FinanceiroNav (ativa em
 * ouro sólido). NÃO propaga o período global da URL: o Workspace tem o próprio
 * conceito de tempo (prazo da tarefa), e herdar ?mes=&ano= do resto do app
 * confundiria os dois.
 */
export default function WorkspaceNav() {
  const pathname = usePathname()

  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        padding: 4,
        background: "var(--surface-1)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
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
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              borderRadius: 8,
              background: ativo ? "var(--accent)" : "transparent",
              color: ativo ? "#000" : "var(--text-2)",
              textDecoration: "none",
              transition: "background 0.15s ease, color 0.15s ease",
            }}
          >
            {item.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
