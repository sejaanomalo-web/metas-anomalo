"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Re-busca os dados do Server Component ao voltar o foco para a aba (router
 * .refresh, sem reload cheio). Os formulários são links públicos compartilhados
 * que ficam abertos; o revalidatePath do servidor não invalida o Router Cache
 * em memória de uma aba já aberta de OUTRO usuário. Com isto, ao reabrir/focar a
 * aba o seletor "Responsável" e as listas de empresa/cliente refletem quem foi
 * removido/adicionado, sem precisar de refresh manual — fecha a janela de "removi
 * mas ainda aparece" em abas abertas. As páginas são force-dynamic, então o
 * refresh re-executa as queries no servidor.
 */
export default function RefreshOnFocus() {
  const router = useRouter()
  useEffect(() => {
    function aoFocar() {
      if (document.visibilityState === "visible") router.refresh()
    }
    document.addEventListener("visibilitychange", aoFocar)
    window.addEventListener("focus", aoFocar)
    return () => {
      document.removeEventListener("visibilitychange", aoFocar)
      window.removeEventListener("focus", aoFocar)
    }
  }, [router])
  return null
}
