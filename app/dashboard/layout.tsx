import { redirect } from "next/navigation"
import AppShell from "@/components/AppShell"
import SentinelaRefreshProvider from "@/components/SentinelaRefreshProvider"
import { getUsuarioAtual, temPermissao } from "@/lib/auth"
import { getNotificacoesDaSessao } from "@/lib/notificacoes"

/**
 * Layout que envolve todas as rotas /dashboard/*. Fornece:
 *   • Guard de autenticação (redirect pra /login se não autenticado)
 *   • Carrega o usuário atual e passa pro AppShell — sidebar adapta
 *     os items visíveis baseado nas permissões (RBAC)
 *   • Hidrata dados iniciais de notificações (count + últimas 20) pra
 *     evitar piscar zero antes do primeiro polling do client
 *   • Esconde o sino flutuante se o usuário não tem ver_notificacoes
 *
 * Como o layout é Server Component, o fetch acontece a cada navegação
 * — mas o resultado é cacheado por request e desserializado pro client.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const usuario = await getUsuarioAtual()
  if (!usuario) {
    redirect("/login")
  }

  // Só carrega notificações se o usuário pode vê-las (gestor de
  // tráfego com ver_notificacoes=true continua recebendo; quem tiver
  // a chave false economiza o fetch).
  const podeVerSino = temPermissao(usuario, "ver_notificacoes")
  const notificacoesIniciais = podeVerSino
    ? await getNotificacoesDaSessao()
    : { count: 0, itens: [] }

  return (
    <AppShell
      usuarioAtual={usuario}
      notificacoesIniciais={notificacoesIniciais}
      mostrarSino={podeVerSino}
    >
      {/* Provider do "Atualizar dados" do Tráfego: vive aqui (não desmonta
          ao trocar de aba), então a atualização do Sentinela segue rodando
          em segundo plano com indicador flutuante em qualquer aba. */}
      <SentinelaRefreshProvider>{children}</SentinelaRefreshProvider>
    </AppShell>
  )
}
