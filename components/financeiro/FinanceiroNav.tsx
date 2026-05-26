"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { Mes, Ano } from "@/lib/data"

interface Props {
  mes: Mes
  ano: Ano
}

const ITEMS: { rotulo: string; href: string; matchExact?: boolean }[] = [
  { rotulo: "Visão geral", href: "/dashboard/financeiro", matchExact: true },
  { rotulo: "Lançamentos", href: "/dashboard/financeiro/lancamentos" },
  { rotulo: "Recorrentes", href: "/dashboard/financeiro/recorrentes" },
  { rotulo: "Contas", href: "/dashboard/financeiro/contas" },
  { rotulo: "Categorias", href: "/dashboard/financeiro/categorias" },
  { rotulo: "Relatórios", href: "/dashboard/financeiro/relatorios" },
]

/**
 * Navegação interna do módulo financeiro. Pílulas com a tab ativa
 * em ouro sólido + texto preto, demais ghost com hairline. Carrega
 * o ?mes=X&ano=Y atual em todas as tabs pra manter o período entre
 * navegações. Substitui os chips quick-link antigos da overview.
 */
export default function FinanceiroNav({ mes, ano }: Props) {
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
        const href = `${item.href}?mes=${mes}&ano=${ano}`
        return (
          <Link
            key={item.href}
            href={href}
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
