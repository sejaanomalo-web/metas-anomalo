"use client"

import { useEffect, useId, useState, type ReactNode } from "react"
import estilos from "./funis.module.css"

const PREFIXO = "comercial:secao:"

/**
 * Seção que começa recolhida, mostrando só o título e um resumo de uma linha.
 * A setinha abre o conteúdo completo. A escolha fica salva no navegador, então
 * quem prefere a seção aberta não precisa abrir de novo a cada visita.
 *
 * Fechada, o conteúdo nem é montado: a tabela e a lista longa só custam algo
 * quando alguém quer vê-las.
 */
export default function SecaoRecolhivel({
  chave,
  titulo,
  descricao,
  resumo,
  children,
}: {
  /** Identifica a preferência salva. */
  chave: string
  titulo: string
  descricao?: string
  /** O que aparece com a seção fechada. */
  resumo: string
  children: ReactNode
}) {
  const [aberta, setAberta] = useState(false)
  const idConteudo = useId()

  useEffect(() => {
    try {
      if (localStorage.getItem(PREFIXO + chave) === "1") setAberta(true)
    } catch {
      // Sem acesso ao armazenamento (modo privado): segue recolhida.
    }
  }, [chave])

  function alternar() {
    setAberta((atual) => {
      const proxima = !atual
      try {
        localStorage.setItem(PREFIXO + chave, proxima ? "1" : "0")
      } catch {}
      return proxima
    })
  }

  return (
    <section className={estilos.secao} data-aberta={aberta}>
      <h2 className={estilos.secaoTitulo}>
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls={idConteudo}
          onClick={alternar}
          className={estilos.secaoBotao}
        >
          <span className={estilos.secaoTextos}>
            <span className={estilos.secaoNome}>{titulo}</span>
            <span className={estilos.secaoResumo}>
              {aberta && descricao ? descricao : resumo}
            </span>
          </span>
          <span aria-hidden className={estilos.secaoSeta}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      </h2>
      <div id={idConteudo} hidden={!aberta} className={estilos.secaoConteudo}>
        {aberta && children}
      </div>
    </section>
  )
}
