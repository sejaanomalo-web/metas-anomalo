"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { criarNotaAction, excluirNotaAction, salvarNotaAction } from "@/lib/workspace-actions"
import type { Nota } from "@/lib/workspace-tipos"

interface EscopoForm {
  contexto_id?: string
  aba_id?: string
  fixa?: "arquivos" | "estudos"
}

/**
 * Notas no estilo iPhone Notes: lista à esquerda (título + data), editor à
 * direita com negrito/itálico/sublinhado/tachado e listas. "+ Nova nota"
 * cria outra nota DENTRO do mesmo workspace/escopo — é assim que se "linka"
 * conteúdo novo sem sair da tela.
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

/** Botões da barra: comando execCommand + rótulo acessível. */
const FERRAMENTAS: { cmd: string; rotulo: string; aria: string; estilo?: React.CSSProperties }[] = [
  { cmd: "bold", rotulo: "B", aria: "Negrito", estilo: { fontWeight: 800 } },
  { cmd: "italic", rotulo: "I", aria: "Itálico", estilo: { fontStyle: "italic" } },
  { cmd: "underline", rotulo: "U", aria: "Sublinhado", estilo: { textDecoration: "underline" } },
  { cmd: "strikeThrough", rotulo: "S", aria: "Tachado", estilo: { textDecoration: "line-through" } },
  { cmd: "insertUnorderedList", rotulo: "•", aria: "Lista" },
  { cmd: "insertOrderedList", rotulo: "1.", aria: "Lista numerada" },
]

function EditorNota({
  nota,
  onErro,
  onSalvo,
  onTitulo,
  onExcluida,
}: {
  nota: Nota
  onErro: (e: string | null) => void
  onSalvo: () => void
  onTitulo: (titulo: string) => void
  onExcluida: () => void
}) {
  const [titulo, setTitulo] = useState(nota.titulo)
  const [confirmando, setConfirmando] = useState(false)
  const corpoRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, startTransition] = useTransition()

  // Conteúdo inicial: o HTML já veio SANITIZADO do servidor (toda gravação
  // passa por sanitizarHtmlNota) — é seguro injetar no contentEditable.
  useEffect(() => {
    if (corpoRef.current) corpoRef.current.innerHTML = nota.corpo_html
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota.id])

  function agendarSalvar(campos: { titulo?: string; corpo?: string }) {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onErro(null)
      startTransition(async () => {
        const fd = new FormData()
        fd.set("id", nota.id)
        if (campos.titulo !== undefined) fd.set("titulo", campos.titulo)
        if (campos.corpo !== undefined) fd.set("corpo_html", campos.corpo)
        const r = await salvarNotaAction(fd)
        if (!r.ok) onErro(r.erro ?? "Não foi possível salvar.")
        else onSalvo()
      })
    }, 700)
  }

  function excluir() {
    onErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", nota.id)
      const r = await excluirNotaAction(fd)
      if (!r.ok) onErro(r.erro ?? "Não foi possível excluir.")
      else onExcluida()
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Barra de formatação */}
      <div
        style={{
          display: "flex",
          gap: 2,
          alignItems: "center",
          padding: "6px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {FERRAMENTAS.map((f) => (
          <button
            key={f.cmd}
            type="button"
            aria-label={f.aria}
            title={f.aria}
            // preventDefault no mousedown: senão o clique tira o foco do
            // contentEditable e o execCommand não sabe onde aplicar.
            onMouseDown={(e) => {
              e.preventDefault()
              document.execCommand(f.cmd)
              if (corpoRef.current) agendarSalvar({ corpo: corpoRef.current.innerHTML })
            }}
            className="no-ds ws-btn-icone"
            style={{ width: 28, height: 26, fontSize: 12, ...f.estilo }}
          >
            {f.rotulo}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {confirmando ? (
          <>
            <button
              type="button"
              onClick={excluir}
              className="no-ds"
              style={{ fontSize: 11, fontWeight: 600, color: "#e24b4a", background: "none", border: "1px solid rgba(226,75,74,0.4)", borderRadius: 6, padding: "4px 9px", cursor: "pointer" }}
            >
              Confirmar exclusão
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="no-ds"
              style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            aria-label="Excluir nota"
            title="Excluir nota"
            className="no-ds ws-btn-icone"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>

      <input
        type="text"
        value={titulo}
        onChange={(e) => {
          setTitulo(e.target.value)
          onTitulo(e.target.value) // lista da esquerda atualiza na hora
          agendarSalvar({ titulo: e.target.value })
        }}
        placeholder="Título da nota"
        maxLength={200}
        className="no-ds"
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "var(--text-1)",
          background: "transparent",
          border: "none",
          padding: "14px 16px 6px",
          fontFamily: "inherit",
        }}
      />

      <div
        ref={corpoRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Corpo da nota"
        onInput={() => {
          if (corpoRef.current) agendarSalvar({ corpo: corpoRef.current.innerHTML })
        }}
        className="ws-nota-corpo"
        data-placeholder="Escreva aqui… selecione um trecho e use B / I / U para formatar."
      />
    </div>
  )
}
