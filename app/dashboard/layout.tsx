import { redirect } from "next/navigation"
import AppShell from "@/components/AppShell"
import { estaAutenticado } from "@/lib/auth"
import {
  listarEmpresas,
  listarEmpresasInativas,
} from "@/lib/empresas-actions"
import { supabaseConfigurado } from "@/lib/supabase"

/**
 * Layout que envolve todas as rotas /dashboard/*. Fornece:
 *   • Guard de autenticação (redirect pra /login se não autenticado)
 *   • Sidebar global (AppShell) com seções Empresas, Time,
 *     Configurações e Sair — mesma navegação em todas as páginas
 *   • Estado da sidebar persistido em localStorage (colapsada por
 *     padrão; expande ao clicar no logo do header)
 *
 * As empresas são carregadas aqui pra ficarem disponíveis na sidebar
 * em qualquer rota (sem cada page precisar refetch).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const [empresas, empresasInativas] = await Promise.all([
    listarEmpresas(true),
    listarEmpresasInativas(),
  ])
  const supabaseOk = supabaseConfigurado()

  return (
    <AppShell
      empresas={empresas}
      empresasInativas={empresasInativas}
      supabaseOk={supabaseOk}
    >
      {children}
    </AppShell>
  )
}
