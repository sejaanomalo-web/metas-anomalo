"use client"

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"

/** useLayoutEffect avisa no SSR (não há layout pra medir). No servidor o
 *  efeito não roda mesmo, então cair pro useEffect só cala o aviso. */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * Anima a REORDENAÇÃO de uma lista usando FLIP (First, Last, Invert, Play).
 *
 * O problema: quando o React reordena os filhos, o navegador pinta a nova
 * posição de imediato — o item "teleporta". CSS não anima mudança de ordem
 * no fluxo, então não existe transição a declarar.
 *
 * O FLIP resolve medindo a posição ANTES (guardada do render anterior) e
 * DEPOIS do commit: se o item mudou de lugar, ele é jogado de volta ao ponto
 * antigo com um transform e animado até zero. O layout final já está correto
 * o tempo todo; a animação é puramente visual.
 *
 * Cada filho animável precisa de `data-flip-id` único e estável.
 *
 * `ativo=false` desliga tudo (usamos durante o arraste, onde quem controla a
 * posição é o dnd-kit — as duas animações brigariam).
 */
export function useFlipReorder(
  ref: RefObject<HTMLElement>,
  /** Muda quando a ordem muda — dispara a medição. */
  chave: string,
  ativo = true
): void {
  const anteriorRef = useRef<Map<string, number>>(new Map())

  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const filhos = Array.from(el.querySelectorAll<HTMLElement>("[data-flip-id]"))
    const atuais = new Map<string, number>()
    for (const f of filhos) {
      const id = f.dataset.flipId
      if (id) atuais.set(id, f.getBoundingClientRect().top)
    }

    if (ativo) {
      const anteriores = anteriorRef.current
      // prefers-reduced-motion: quem pediu menos movimento não recebe o
      // deslize — a lista só aparece já reordenada.
      const reduzido =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      if (!reduzido) {
        for (const f of filhos) {
          const id = f.dataset.flipId
          if (!id) continue
          const antes = anteriores.get(id)
          const agora = atuais.get(id)
          if (antes === undefined || agora === undefined) continue
          const delta = antes - agora
          if (Math.abs(delta) < 1) continue
          f.animate(
            [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
            { duration: 280, easing: "cubic-bezier(0.2, 0, 0, 1)" }
          )
        }
      }
    }

    anteriorRef.current = atuais
  }, [ref, chave, ativo])
}
