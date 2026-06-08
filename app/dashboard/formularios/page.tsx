import { redirect } from "next/navigation"

/**
 * A gestão de formulários foi movida para Configurações → seção
 * "Formulários" (links públicos + preenchimento). Esta rota antiga
 * redireciona pra lá pra não quebrar bookmarks.
 */
export default function FormulariosPage() {
  redirect("/dashboard/configuracoes")
}
