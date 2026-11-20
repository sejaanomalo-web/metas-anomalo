"use client"

import { useId } from "react"
import type { FunilComercial } from "@/lib/funil-tipos"
import { useMenuSuspenso } from "./useMenuSuspenso"
import estilos from "./funis.module.css"

/**
 * O "⋯" do cartão do funil: concentra as ações (lançar, editar, excluir) e a
 * troca de funil, para o topo da tela ficar só com o nome e as abas.
 */
export default function MenuFunil({
  funis,
  selecionado,
  aoLancar,
  aoEditar,
  aoExcluir,
  aoNovo,
  aoTrocar,
}: {
  funis: FunilComercial[]
  selecionado: FunilComercial | null
  aoLancar: () => void
  aoEditar: () => void
  aoExcluir: () => void
  aoNovo: () => void
  aoTrocar: (id: string) => void
}) {
  const { aberto, setAberto, raiz, botao, escolher } = useMenuSuspenso()
  const idMenu = useId()

  return (
    <div ref={raiz} className={estilos.menuRaiz}>
      <button
        ref={botao}
        type="button"
        className={estilos.menuBotao}
        aria-label="Ações e funis"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        onClick={() => setAberto((a) => !a)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>

      {aberto && (
        <div id={idMenu} role="menu" aria-label="Ações e funis" className={estilos.menu}>
          {selecionado && (
            <>
              <p className={estilos.menuGrupo}>Este funil</p>
              <button type="button" role="menuitem" className={estilos.menuItem} data-primario onClick={() => escolher(aoLancar)}>
                <span aria-hidden>+</span> Lançar números
              </button>
              <button type="button" role="menuitem" className={estilos.menuItem} onClick={() => escolher(aoEditar)}>
                <span aria-hidden>✎</span> Editar funil
              </button>
              <button type="button" role="menuitem" className={estilos.menuItem} data-perigo onClick={() => escolher(aoExcluir)}>
                <span aria-hidden>×</span> Excluir funil
              </button>
              <hr className={estilos.menuDivisor} />
            </>
          )}
          <p className={estilos.menuGrupo}>Funis</p>
          {funis.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitemradio"
              aria-checked={f.id === selecionado?.id}
              className={estilos.menuItem}
              title={f.nome}
              onClick={() => escolher(() => aoTrocar(f.id))}
            >
              <span aria-hidden>{f.id === selecionado?.id ? "✓" : ""}</span>
              <span className={estilos.menuTexto}>{f.nome}</span>
            </button>
          ))}
          <button type="button" role="menuitem" className={estilos.menuItem} data-acento onClick={() => escolher(aoNovo)}>
            <span aria-hidden>+</span> Novo funil
          </button>
        </div>
      )}
    </div>
  )
}
