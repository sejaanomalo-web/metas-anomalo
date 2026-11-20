"use client"

import { useEffect, useId, useState, type ReactNode } from "react"
import estilos from "./funis.module.css"

const PREFIXO = "comercial:analise:"

/**
 * Bloco da aba Análise que começa fechado: título e descrição sempre à mostra,
 * e uma setinha à esquerda da barra amarela abre e fecha o conteúdo. A escolha
 * fica salva no navegador. Fechado, o conteúdo nem é montado.
 */
export default function BlocoRecolhivel({
  chave,
  titulo,
  descricao,
  extra,
  children,
}: {
  /** Identifica a preferência salva. */
  chave: string
  titulo: string
  descricao?: ReactNode
  extra?: ReactNode
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const idConteudo = useId()

  useEffect(() => {
    try {
      if (localStorage.getItem(PREFIXO + chave) === "1") setAberto(true)
    } catch {
      // Sem acesso ao armazenamento (modo privado): segue fechado.
    }
  }, [chave])

  function alternar() {
    setAberto((atual) => {
      const proximo = !atual
      try {
        localStorage.setItem(PREFIXO + chave, proximo ? "1" : "0")
      } catch {}
      return proximo
    })
  }

  return (
    <section aria-label={titulo} className={estilos.bloco} data-aberto={aberto}>
      <header className={estilos.blocoTopo} style={aberto ? undefined : { marginBottom: 0 }}>
        <div className={estilos.blocoTextos}>
          <h2 className={estilos.blocoTituloRecolhivel}>
            <button
              type="button"
              aria-expanded={aberto}
              aria-controls={idConteudo}
              onClick={alternar}
              className={estilos.blocoAlternar}
            >
              <span aria-hidden className={estilos.blocoSeta}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className={estilos.blocoTitulo}>{titulo}</span>
            </button>
          </h2>
          {descricao && <p className={estilos.blocoDescricao}>{descricao}</p>}
        </div>
        {aberto && extra}
      </header>
      <div id={idConteudo} hidden={!aberto}>
        {aberto && children}
      </div>
    </section>
  )
}
