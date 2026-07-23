"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { criarNotaAction } from "@/lib/workspace-actions"
import EditorNota from "./EditorNota"
import type { Nota } from "@/lib/workspace-tipos"

interface EscopoForm {
  contexto_id?: string
  aba_id?: string
  fixa?: "arquivos"
}

/**
 * Notas no estilo iPhone Notes: lista à esquerda (título + data) e o editor
 * rico à direita (EditorNota — títulos, fonte, tamanho, cor, caixa do texto).
 * "+ Nova nota" cria outra nota DENTRO do mesmo workspace/escopo — é assim
 * que se encadeia conteúdo sem sair da tela.
 *
 * O corpo é salvo com debounce e SEMPRE re-sanitizado no servidor
 * (sanitizarHtmlNota) — o innerHTML daqui nunca chega cru no banco.
 */
export default function NotasWorkspace({
  notas,
  escopo,
}: {
  notas: Nota[]
  escopo: EscopoForm
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [ativaId, setAtivaId] = useState<string | null>(notas[0]?.id ?? null)
  // Título digitado agora: reflete na lista da esquerda INSTANTANEAMENTE,
  // sem esperar o autosave + refresh do servidor.
  const [titulosLocais, setTitulosLocais] = useState<Record<string, string>>({})

  const ativa = notas.find((n) => n.id === ativaId) ?? notas[0] ?? null

  function tituloDe(n: Nota): string {
    return titulosLocais[n.id] ?? n.titulo
  }

  function nova() {
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      if (escopo.contexto_id) fd.set("contexto_id", escopo.contexto_id)
      if (escopo.aba_id) fd.set("aba_id", escopo.aba_id)
      if (escopo.fixa) fd.set("fixa", escopo.fixa)
      const r = await criarNotaAction(fd)
      if (!r.ok || !r.id) {
        setErro(r.erro ?? "Não foi possível criar a nota.")
        return
      }
      setAtivaId(r.id)
      router.refresh()
    })
  }

  return (
    <div className="ws-notas">
      {/* -------- Lista de notas -------- */}
      <aside className="ws-notas-lista">
        <button
          type="button"
          onClick={nova}
          disabled={pending}
          className="no-ds"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "#4573d2",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "8px 10px",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nova nota
        </button>

        {notas.length === 0 && (
          <p style={{ fontSize: 11, color: "var(--text-4)", padding: "4px 10px" }}>
            Nenhuma nota ainda.
          </p>
        )}

        {notas.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setAtivaId(n.id)}
            className="no-ds"
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "9px 10px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: ativa?.id === n.id ? "rgba(69,115,210,0.18)" : "transparent",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-1)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {tituloDe(n) || "Sem título"}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-4)" }}>
              {new Date(n.updated_at).toLocaleDateString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
          </button>
        ))}
      </aside>

      {/* -------- Editor -------- */}
      <div className="ws-notas-editor">
        {ativa ? (
          <EditorNota
            key={ativa.id}
            nota={ativa}
            onErro={setErro}
            onSalvo={() => setSalvo(true)}
            onTitulo={(t) =>
              setTitulosLocais((m) => ({ ...m, [ativa.id]: t }))
            }
            onExcluida={() => {
              setAtivaId(null)
              router.refresh()
            }}
          />
        ) : (
          <div style={{ padding: 24, fontSize: 12, color: "var(--text-4)" }}>
            Crie a primeira nota com o botão &ldquo;Nova nota&rdquo;.
          </div>
        )}
        {(erro || salvo) && (
          <p role="status" style={{ fontSize: 11, margin: "6px 12px", color: erro ? "#e24b4a" : "#5da283" }}>
            {erro ?? "Salvo"}
          </p>
        )}
      </div>
    </div>
  )
}
