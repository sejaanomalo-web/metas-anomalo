"use client"

import { useEffect, useState, useTransition } from "react"
import {
  contarUsoCategoriaAction,
  excluirCategoriaAction,
} from "@/lib/financeiro-actions"
import type { CategoriaFinanceira } from "@/lib/financeiro"

/**
 * Diálogo de exclusão de categoria.
 *
 * A pergunta "tem certeza?" sozinha não ajuda ninguém: a pessoa não sabe o
 * que vai acontecer. Este diálogo abre CONTANDO o uso e só então oferece as
 * duas saídas — e deixa claro que nenhum lançamento é apagado em qualquer
 * um dos caminhos.
 */
export default function DialogoExcluirCategoria({
  categoria,
  fechar,
  aoConcluir,
}: {
  categoria: CategoriaFinanceira
  fechar: () => void
  aoConcluir: (mensagem: string) => void
}) {
  const [uso, setUso] = useState<{ lancamentos: number; recorrentes: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let vivo = true
    contarUsoCategoriaAction(categoria.id).then((r) => {
      if (!vivo) return
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível conferir o uso da categoria.")
        return
      }
      setUso({ lancamentos: r.lancamentos, recorrentes: r.recorrentes })
    })
    return () => {
      vivo = false
    }
  }, [categoria.id])

  const total = uso ? uso.lancamentos + uso.recorrentes : 0
  const emUso = total > 0

  function executar(modo: "desativar" | "excluir") {
    setErro(null)
    startTransition(async () => {
      const r = await excluirCategoriaAction(categoria.id, modo)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir.")
        return
      }
      aoConcluir(
        modo === "desativar"
          ? `"${categoria.nome}" foi desativada. O histórico continua com o nome.`
          : r.soltos
            ? `"${categoria.nome}" excluída. ${r.soltos} registro(s) ficaram sem categoria.`
            : `"${categoria.nome}" excluída.`
      )
    })
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.70)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar()
      }}
    >
      <div
        style={{
          width: "min(460px, 100%)",
          background: "var(--surface-1)",
          border: "0.5px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: "26px 24px",
        }}
      >
        <h2 style={{ fontSize: 19 }}>Excluir &quot;{categoria.nome}&quot;?</h2>

        <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 12, lineHeight: 1.55 }}>
          {uso === null ? (
            "Conferindo onde ela é usada…"
          ) : emUso ? (
            <>
              Em uso por{" "}
              <strong>
                {[
                  uso.lancamentos > 0 &&
                    `${uso.lancamentos} lançamento${uso.lancamentos === 1 ? "" : "s"}`,
                  uso.recorrentes > 0 &&
                    `${uso.recorrentes} recorrente${uso.recorrentes === 1 ? "" : "s"}`,
                ]
                  .filter(Boolean)
                  .join(" e ")}
              </strong>
              .
            </>
          ) : (
            "Nada depende dela — pode excluir com segurança."
          )}
        </p>

        {emUso && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              fontSize: 12,
              color: "var(--text-3)",
              lineHeight: 1.6,
            }}
          >
            <p>
              <strong style={{ color: "var(--text-2)" }}>Desativar</strong> tira a
              categoria das listas de escolha e mantém o histórico intacto, com o
              nome aparecendo nos lançamentos antigos.
            </p>
            <p style={{ marginTop: 8 }}>
              <strong style={{ color: "var(--text-2)" }}>Excluir mesmo assim</strong>{" "}
              solta os vínculos — os {total} registro(s) passam a aparecer como
              &quot;Sem categoria&quot;. <strong>Nenhum lançamento é apagado.</strong>
            </p>
          </div>
        )}

        {erro && (
          <p
            style={{
              marginTop: 14,
              padding: 10,
              borderRadius: 8,
              background: "rgba(239,68,68,0.12)",
              border: "0.5px solid rgba(239,68,68,0.38)",
              fontSize: 12,
              color: "var(--text-1)",
            }}
          >
            {erro}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={fechar}
            disabled={pending}
            style={{
              flex: "1 1 100px",
              padding: "10px 14px",
              background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.18)",
              borderRadius: 6,
              color: "var(--text-2)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Cancelar
          </button>

          {emUso ? (
            <>
              <button
                type="button"
                onClick={() => executar("desativar")}
                disabled={pending || uso === null}
                className="btn-gold-filled"
                style={{ flex: "2 1 180px" }}
              >
                {pending ? "…" : "Desativar (recomendado)"}
              </button>
              <button
                type="button"
                onClick={() => executar("excluir")}
                disabled={pending || uso === null}
                style={{
                  flex: "1 1 100%",
                  padding: "10px 14px",
                  background: "transparent",
                  border: "0.5px solid rgba(239,68,68,0.40)",
                  borderRadius: 6,
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Excluir mesmo assim
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => executar("excluir")}
              disabled={pending || uso === null}
              style={{
                flex: "2 1 160px",
                padding: "10px 14px",
                background: "transparent",
                border: "0.5px solid rgba(239,68,68,0.40)",
                borderRadius: 6,
                color: "#ef4444",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {pending ? "Excluindo…" : "Excluir"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
