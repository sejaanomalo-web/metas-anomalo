"use client"

import { useId } from "react"
import type { FunilComercial } from "@/lib/funil-tipos"
import { useMenuSuspenso } from "./useMenuSuspenso"
import estilos from "./funis.module.css"

/**
 * Título do cartão com uma setinha à esquerda: um toque abre a lista de funis
 * para trocar ali mesmo (a troca também segue disponível no ⋯).
 */
export default function SeletorFunil({
  funis,
  selecionado,
  aoTrocar,
}: {
  funis: FunilComercial[]
  selecionado: FunilComercial
  aoTrocar: (id: string) => void
}) {
  const { aberto, setAberto, raiz, botao, escolher } = useMenuSuspenso()
  const idMenu = useId()

  return (
    <div ref={raiz} className={estilos.seletorRaiz}>
      <h2 className={estilos.seletorTitulo}>
        <button
          ref={botao}
          type="button"
          className={estilos.seletorBotao}
          aria-haspopup="menu"
          aria-expanded={aberto}
          aria-controls={aberto ? idMenu : undefined}
          aria-label={`Funil: ${selecionado.nome}. Trocar de funil`}
          onClick={() => setAberto((a) => !a)}
        >
          <span aria-hidden className={estilos.seletorSeta}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={estilos.seletorNome}>{selecionado.nome}</span>
        </button>
      </h2>

      {aberto && (
        <div id={idMenu} role="menu" aria-label="Trocar de funil" className={`${estilos.menu} ${estilos.menuEsquerda}`}>
          <p className={estilos.menuGrupo}>Seus funis</p>
          {funis.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitemradio"
              aria-checked={f.id === selecionado.id}
              className={estilos.menuItem}
              title={f.nome}
              onClick={() => escolher(() => f.id !== selecionado.id && aoTrocar(f.id))}
            >
              <span aria-hidden>{f.id === selecionado.id ? "✓" : ""}</span>
              <span className={estilos.menuTexto}>{f.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
