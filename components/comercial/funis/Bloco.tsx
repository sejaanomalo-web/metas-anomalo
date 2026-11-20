import type { ReactNode } from "react"
import estilos from "./funis.module.css"

/**
 * Agrupamento visual da tela: um título curto em cima, uma linha que explica o
 * que está ali e o conteúdo logo abaixo. Cada assunto (fonte, custo, funil,
 * resultado) fica no seu bloco, para dar para entender a tela de relance.
 */
export default function Bloco({
  titulo,
  descricao,
  extra,
  children,
  rotulo,
}: {
  titulo: string
  descricao?: ReactNode
  /** Algo à direita do título (um selo, um atalho). */
  extra?: ReactNode
  children: ReactNode
  /** Nome acessível, quando o título visível não basta. */
  rotulo?: string
}) {
  return (
    <section aria-label={rotulo ?? titulo} className={estilos.bloco}>
      <header className={estilos.blocoTopo}>
        <div className={estilos.blocoTextos}>
          <h2 className={estilos.blocoTitulo}>{titulo}</h2>
          {descricao && <p className={estilos.blocoDescricao}>{descricao}</p>}
        </div>
        {extra}
      </header>
      {children}
    </section>
  )
}
