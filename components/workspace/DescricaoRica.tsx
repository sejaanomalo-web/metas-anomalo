import { Fragment } from "react"
import { analisarDescricao, type Bloco, type Trecho } from "@/lib/workspace-markdown"

/**
 * Renderiza a descrição (markdown-lite) como NÓS REACT.
 *
 * Não existe `dangerouslySetInnerHTML` aqui, e não pode passar a existir: o
 * texto do banco nunca é interpretado como HTML, então nenhuma tag colada por
 * alguém vira elemento. Links já chegam filtrados pelo parser (só http/https).
 *
 * Server Component — é só transformação de dados, não precisa de JS no browser.
 */
export default function DescricaoRica({
  texto,
  className,
}: {
  texto: string | null | undefined
  className?: string
}) {
  const blocos = analisarDescricao(texto)
  if (blocos.length === 0) return null

  return (
    <div
      className={className}
      style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-2)" }}
    >
      {blocos.map((b, i) => (
        <BlocoView key={i} bloco={b} />
      ))}
    </div>
  )
}

function BlocoView({ bloco }: { bloco: Bloco }) {
  if (bloco.tipo === "lista") {
    return (
      <ul style={{ margin: "6px 0", paddingLeft: 18, listStyle: "disc" }}>
        {bloco.itens.map((trechos, i) => (
          <li key={i} style={{ margin: "2px 0" }}>
            <Trechos trechos={trechos} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    // pre-wrap preserva indentação e espaços múltiplos que a pessoa digitou.
    // As quebras de linha vêm como <br> (trecho "quebra"), não como \n — o
    // parser já separou as linhas —, então pre-wrap aqui cuida só do espaço
    // horizontal, sem risco de quebra dupla.
    <p style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>
      <Trechos trechos={bloco.trechos} />
    </p>
  )
}

function Trechos({ trechos }: { trechos: Trecho[] }) {
  return (
    <>
      {trechos.map((t, i) => (
        <Fragment key={i}>
          <TrechoView trecho={t} />
        </Fragment>
      ))}
    </>
  )
}

function TrechoView({ trecho }: { trecho: Trecho }) {
  switch (trecho.tipo) {
    case "texto":
      return <>{trecho.valor}</>
    case "quebra":
      // O Enter que a pessoa digitou. Sem isto, o texto chega embolado.
      return <br />
    case "negrito":
      return <strong style={{ color: "var(--text-1)" }}>{trecho.valor}</strong>
    case "italico":
      return <em>{trecho.valor}</em>
    case "riscado":
      return (
        <s style={{ color: "var(--text-4)" }}>{trecho.valor}</s>
      )
    case "codigo":
      return (
        <code
          className="ds-mono"
          style={{
            background: "var(--surface-3)",
            padding: "1px 5px",
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {trecho.valor}
        </code>
      )
    case "mencao":
      return (
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
          @{trecho.nome}
        </span>
      )
    case "link":
      return (
        <a
          href={trecho.href}
          target="_blank"
          // noopener: sem isto a página aberta ganha window.opener e pode
          // redirecionar a nossa aba. nofollow porque são links colados por
          // usuário, não curadoria nossa.
          rel="noopener noreferrer nofollow"
          style={{
            color: "var(--accent)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
            wordBreak: "break-word",
          }}
        >
          {trecho.rotulo}
        </a>
      )
  }
}
