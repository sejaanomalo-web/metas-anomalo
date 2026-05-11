import type { ReactNode } from "react"

/**
 * Header de seção dentro de uma página: título sentence case (h2/h3
 * conforme nível) à esquerda, ações ou descrição opcional à direita.
 */
export default function SectionHeader({
  titulo,
  descricao,
  acao,
  nivel = 2,
  className,
}: {
  titulo: string
  descricao?: string
  acao?: ReactNode
  nivel?: 2 | 3
  className?: string
}) {
  const tamanho = nivel === 2 ? 20 : 16
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <p
          style={{
            fontSize: tamanho,
            fontWeight: 600,
            color: "var(--text-1)",
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
          }}
        >
          {titulo}
        </p>
        {descricao && (
          <p
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: "var(--text-3)",
              marginTop: 4,
            }}
          >
            {descricao}
          </p>
        )}
      </div>
      {acao && (
        <div className="flex items-center gap-2 flex-wrap">{acao}</div>
      )}
    </div>
  )
}
