import { redirect } from "next/navigation"

/**
 * O painel "Empresas" foi renomeado para "Metas" e vive em
 * /dashboard/metas. Esta rota antiga redireciona pra lá (preserva
 * bookmarks). Preserva os query params do período.
 */
export default function EmpresasPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === "string") qs.set(k, v)
  }
  const query = qs.toString()
  redirect(`/dashboard/metas${query ? `?${query}` : ""}`)
}
