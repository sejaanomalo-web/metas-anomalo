"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Comportamento comum dos menus suspensos da tela de funis: abre focando o
 * primeiro item (ou o marcado), fecha com Esc (devolvendo o foco ao botão),
 * com clique fora, e as setas percorrem os itens.
 */
export function useMenuSuspenso() {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!aberto) return
    const itens = () =>
      Array.from(raiz.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])
    const marcado = raiz.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
    ;(marcado ?? itens()[0])?.focus()
    function fora(ev: PointerEvent) {
      if (!raiz.current?.contains(ev.target as Node)) setAberto(false)
    }
    function tecla(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        setAberto(false)
        botao.current?.focus()
        return
      }
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return
      ev.preventDefault()
      const lista = itens()
      const atual = lista.indexOf(document.activeElement as HTMLButtonElement)
      const passo = ev.key === "ArrowDown" ? 1 : -1
      lista[(atual + passo + lista.length) % lista.length]?.focus()
    }
    document.addEventListener("pointerdown", fora)
    document.addEventListener("keydown", tecla)
    return () => {
      document.removeEventListener("pointerdown", fora)
      document.removeEventListener("keydown", tecla)
    }
  }, [aberto])

  /** Fecha o menu e então executa a escolha. */
  function escolher(fn: () => void) {
    setAberto(false)
    fn()
  }

  return { aberto, setAberto, raiz, botao, escolher }
}
