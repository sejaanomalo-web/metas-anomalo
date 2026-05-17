import { redirect } from "next/navigation"
import AppShell from "@/components/AppShell"
import { estaAutenticado } from "@/lib/auth"
import { getNotificacoesDaSessao } from "@/lib/notificacoes"

/**
 * Layout que envolve todas as rotas /dashboard/*. Fornece:
 *   • Guard de autenticação (redirect pra /login se não autenticado)
 *   • Sidebar global (AppShell) com seções Dashboard, Empresas,
 *     Formulários, Notificações, Configurações e Sair
 *   • Hidrata dados iniciais de notificações (count + últimas 20) pra
 *     evitar piscar zero antes do primeiro polling do client
 *
 * Como o layout é Server Component, o fetch acontece a cada navegação
 * — mas o resultado é cacheado por request e desserializado pro client.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const notificacoesIniciais = await getNotificacoesDaSessao()

  return (
    <AppShell notificacoesIniciais={notificacoesIniciais}>{children}</AppShell>
  )
}
