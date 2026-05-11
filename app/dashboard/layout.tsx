import { redirect } from "next/navigation"
import AppShell from "@/components/AppShell"
import { estaAutenticado } from "@/lib/auth"

/**
 * Layout que envolve todas as rotas /dashboard/*. Fornece:
 *   • Guard de autenticação (redirect pra /login se não autenticado)
 *   • Sidebar global (AppShell) com seções Dashboard, Empresas, Time,
 *     Configurações e Sair
 *
 * Rail é puramente estático (links fixos) — sem fetch server-side aqui.
 * A lista de empresas vive na seção "Empresas do Hub" da página inicial.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  return <AppShell>{children}</AppShell>
}
