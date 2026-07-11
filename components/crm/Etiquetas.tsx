"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  atribuirEtiquetaAction,
  removerEtiquetaAction,
} from "@/lib/crm-etiquetas-actions"

interface EtiquetaResumo {
  id: string
  nome: string
  cor: string
}

/** Pílula colorida de etiqueta — usada no card do inbox, no Kanban e no
 *  header da thread. */
export function EtiquetaChip({
  nome,
  cor,
  onRemove,
}: {
  nome: string
  cor: string
  onRemove?: () => void
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 999,
        color: cor,
        background: `${cor}1f`,
        border: `1px solid ${cor}4d`,
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
    >
      {nome}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRemove()
          }}
          style={{ color: cor, lineHeight: 1, fontSize: 13 }}
          aria-label={`Remover etiqueta ${nome}`}
        >
          ×
        </button>
      )}
    </span>
  )
}

/** Popover de atribuição de etiquetas a um lead — checkboxes das etiquetas
 *  sincronizadas com as etapas do Kanban (Fase 6: não dá mais pra criar
 *  etiqueta nova aqui, só em Kanban → elas viram "fases"). */
export default function EtiquetasPicker({
  leadId,
  etiquetasDoLead,
  todasEtiquetas,
}: {
  leadId: string
  etiquetasDoLead: EtiquetaResumo[]
  todasEtiquetas: EtiquetaResumo[]
}) {
  const [aberto, setAberto] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const idsAtribuidas = new Set(etiquetasDoLead.map((e) => e.id))

  function alternar(etiquetaId: string, atribuida: boolean) {
    const fd = new FormData()
    fd.set("lead_id", leadId)
    fd.set("etiqueta_id", etiquetaId)
    startTransition(async () => {
      if (atribuida) await removerEtiquetaAction(fd)
      else await atribuirEtiquetaAction(fd)
      router.refresh()
    })
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          border: "1px dashed rgba(255,255,255,0.2)",
          borderRadius: 999,
          padding: "2px 8px",
        }}
      >
        + etiqueta
      </button>

      {aberto && (
        <>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
            style={{ position: "fixed", inset: 0, zIndex: 15, cursor: "default" }}
          />
          <div
            className="glass"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 6,
              padding: 10,
              minWidth: 200,
              zIndex: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              {todasEtiquetas.map((e) => (
                <label
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    cursor: "pointer",
                    padding: "3px 4px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={idsAtribuidas.has(e.id)}
                    onChange={() => alternar(e.id, idsAtribuidas.has(e.id))}
                    disabled={pending}
                  />
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: e.cor,
                      flexShrink: 0,
                    }}
                  />
                  {e.nome}
                </label>
              ))}
              {todasEtiquetas.length === 0 && (
                <p style={{ fontSize: 11, color: "var(--text-4)" }}>
                  Nenhuma etiqueta ainda. Crie fases no Kanban.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
