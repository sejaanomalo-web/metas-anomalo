"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

/**
 * Botão "Atualizar dados" — força os Server Components da rota atual
 * a refetchar do banco via router.refresh(). Útil quando dados são
 * mudados FORA do app (ex: DELETE/UPDATE direto no SQL editor do
 * Supabase) e portanto nenhum revalidatePath foi disparado.
 *
 * Por que isso é necessário mesmo com `export const dynamic =
 * "force-dynamic"`: force-dynamic só desabilita o Data Cache server-
 * side. O Router Cache (client-side, em memória) sobrevive — quando
 * o usuário navega de volta pra uma rota recém-visitada, ele serve
 * da memória sem revalidar. router.refresh() é a única primitiva
 * que invalida esse cache sob demanda.
 */
export default function BotaoAtualizar({
  rotulo = "Atualizar dados",
}: {
  rotulo?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [atualizado, setAtualizado] = useState(false)

  function atualizar() {
    setAtualizado(false)
    startTransition(() => {
      router.refresh()
      // router.refresh dispara re-render do Server Component; o
      // useTransition mantém `pending=true` até a árvore terminar
      // de re-renderizar, daí o feedback "Atualizado ✓".
      setTimeout(() => {
        setAtualizado(true)
        setTimeout(() => setAtualizado(false), 1800)
      }, 200)
    })
  }

  return (
    <button
      type="button"
      onClick={atualizar}
      disabled={pending}
      className="hover:text-[#C9953A] hover:border-[#C9953A55] transition no-ds"
      style={{
        padding: "8px 14px",
        fontSize: 11,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        color: atualizado ? "#4caf50" : "rgba(255,255,255,0.55)",
        border: `0.5px solid ${
          atualizado ? "rgba(76,175,80,0.45)" : "rgba(255,255,255,0.15)"
        }`,
        borderRadius: 6,
        background: "transparent",
        fontWeight: 500,
        opacity: pending ? 0.6 : 1,
        cursor: pending ? "wait" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {pending ? "Atualizando…" : atualizado ? "Atualizado ✓" : rotulo}
    </button>
  )
}
