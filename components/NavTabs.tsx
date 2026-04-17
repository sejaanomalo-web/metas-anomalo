"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

interface Aba {
  chave: string
  rotulo: string
  href?: string
  matches?: (pathname: string) => boolean
}

const ABAS: Aba[] = [
  {
    chave: "visao",
    rotulo: "Visão Geral",
    href: "/dashboard",
    matches: (p) => p === "/dashboard",
  },
  {
    chave: "empresas",
    rotulo: "Empresas",
    matches: (p) =>
      p.startsWith("/dashboard/") && p !== "/dashboard/comissionamento",
  },
  { chave: "funil", rotulo: "Funil" },
  {
    chave: "comissionamento",
    rotulo: "Comissionamento",
    href: "/dashboard/comissionamento",
    matches: (p) => p === "/dashboard/comissionamento",
  },
  { chave: "criativos", rotulo: "Criativos" },
]

export default function NavTabs() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const mes = searchParams.get("mes")
  const ano = searchParams.get("ano")
  const params = new URLSearchParams()
  if (mes) params.set("mes", mes)
  if (ano) params.set("ano", ano)
  const query = params.toString() ? `?${params.toString()}` : ""

  return (
    <nav className="flex items-center h-[50px]">
      {ABAS.map((aba) => {
        const ativa = aba.matches ? aba.matches(pathname) : false
        const indisponivel = !aba.href
        const classe = "nav-label uppercase px-4 h-full flex items-center"
        const estiloAtiva = ativa
          ? { color: "#C9953A", borderBottom: "1.5px solid #C9953A" }
          : indisponivel
          ? { color: "#1c1c1c", cursor: "default" as const }
          : { color: "#242424" }

        if (aba.href && !indisponivel) {
          return (
            <Link
              key={aba.chave}
              href={`${aba.href}${query}`}
              className={`${classe} hover:text-[#484848] transition`}
              style={estiloAtiva}
            >
              {aba.rotulo}
            </Link>
          )
        }
        return (
          <span
            key={aba.chave}
            className={classe}
            style={estiloAtiva}
            title="Em breve"
          >
            {aba.rotulo}
          </span>
        )
      })}
    </nav>
  )
}
