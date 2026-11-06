"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatBRL, formatNumero } from "@/lib/data"
import { excluirLancamentoAction } from "@/lib/funis-comerciais-actions"
import { formatarDataCurta } from "@/lib/funil-calculo"
import type { FunilComercial, LancamentoFunil } from "@/lib/funil-tipos"
import FormularioLancamento from "./FormularioLancamento"
import ModalComercial, { MensagemErro } from "./ModalComercial"

const POR_PAGINA = 30

const estiloBotao: React.CSSProperties = {
  padding: "8px 12px",
  minHeight: 36,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-2)",
  background: "transparent",
  border: "1px solid var(--input-border)",
  borderRadius: 8,
  cursor: "pointer",
}

/** Os lançamentos do período, cada um com editar e excluir. */
export default function ListaLancamentos({
  funil,
  lancamentos,
  dataPadrao,
}: {
  funil: FunilComercial
  lancamentos: LancamentoFunil[]
  dataPadrao: string
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<LancamentoFunil | null>(null)
  const [excluindo, setExcluindo] = useState<LancamentoFunil | null>(null)
  const [limite, setLimite] = useState(POR_PAGINA)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (lancamentos.length === 0) {
    return (
      <p
        className="glass"
        style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}
      >
        Nenhum lançamento neste período.
      </p>
    )
  }

  function confirmarExclusao() {
    if (!excluindo) return
    setErro(null)
    startTransition(async () => {
      const r = await excluirLancamentoAction(excluindo.id)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível excluir.")
        return
      }
      setExcluindo(null)
      router.refresh()
    })
  }

  return (
    <>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {lancamentos.slice(0, limite).map((l) => {
          const partes = funil.etapas
            .filter((e) => (l.valores?.[e.id] ?? 0) > 0)
            .map((e) => `${e.nome}: ${formatNumero(l.valores[e.id])}`)
          if (l.perdidos > 0) partes.push(`Perdidos: ${formatNumero(l.perdidos)}`)
          if (Number(l.faturamento) > 0) {
            partes.push(`Faturamento: ${formatBRL(Number(l.faturamento))}`)
          }
          return (
            <li
              key={l.id}
              data-lancamento={l.data}
              className="glass"
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 280px" }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>
                  {formatarDataCurta(l.data)}
                  {Number(l.investimento) > 0 && (
                    <span style={{ fontWeight: 500, color: "var(--text-2)" }}>
                      {` · ${formatBRL(Number(l.investimento))} investidos`}
                    </span>
                  )}
                </p>
                {partes.length > 0 && (
                  <p style={{ marginTop: 3, fontSize: 12, color: "var(--text-2)" }}>
                    {partes.join(" · ")}
                  </p>
                )}
                {l.observacoes && (
                  <p style={{ marginTop: 3, fontSize: 12, color: "var(--text-3)" }}>
                    {l.observacoes}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  style={estiloBotao}
                  aria-label={`Editar lançamento de ${formatarDataCurta(l.data)}`}
                  onClick={() => setEditando(l)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  style={estiloBotao}
                  aria-label={`Excluir lançamento de ${formatarDataCurta(l.data)}`}
                  onClick={() => {
                    setErro(null)
                    setExcluindo(l)
                  }}
                >
                  Excluir
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {lancamentos.length > limite && (
        <button
          type="button"
          className="btn-ghost"
          style={{ marginTop: 10 }}
          onClick={() => setLimite((n) => n + POR_PAGINA)}
        >
          Mostrar mais ({lancamentos.length - limite})
        </button>
      )}

      {editando && (
        <FormularioLancamento
          funil={funil}
          lancamento={editando}
          dataPadrao={dataPadrao}
          fechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            router.refresh()
          }}
        />
      )}

      {excluindo && (
        <ModalComercial
          titulo="Excluir lançamento?"
          fechar={() => setExcluindo(null)}
          largura={420}
        >
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-2)" }}>
            O lançamento de {formatarDataCurta(excluindo.data)} sai dos números
            do funil. Não dá para desfazer.
          </p>
          <MensagemErro erro={erro} />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 20,
            }}
          >
            <button
              type="button"
              data-autofoco
              className="btn-gold-outline"
              onClick={() => setExcluindo(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={confirmarExclusao}
              style={{
                padding: "12px 22px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1.17px",
                textTransform: "uppercase",
                borderRadius: 10,
                color: "#fff",
                background: "#dc2626",
                border: "1px solid #dc2626",
                cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.5 : 1,
              }}
            >
              {pending ? "Excluindo…" : "Excluir lançamento"}
            </button>
          </div>
        </ModalComercial>
      )}
    </>
  )
}
