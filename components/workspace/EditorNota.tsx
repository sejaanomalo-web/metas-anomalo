"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { excluirNotaAction, salvarNotaAction } from "@/lib/workspace-actions"
import {
  CORES_NOTA,
  FONTES_NOTA,
  TAMANHOS_NOTA,
} from "@/lib/workspace-notas"
import type { Nota } from "@/lib/workspace-tipos"

/**
 * Editor de nota no espírito do Notas do iPhone: blocos (Título, Subtítulo,
 * Corpo), fonte, tamanho, cor, negrito/itálico/sublinhado/tachado, listas,
 * alinhamento e caixa do texto (MAIÚSCULAS / minúsculas / Primeira Maiúscula).
 *
 * Implementação: contentEditable + document.execCommand. É API antiga, mas é
 * a única que edita seleção rica sem trazer um framework de editor inteiro
 * (TipTap/Lexical) pra dentro do bundle — e o contrato de segurança não
 * depende dela: TODO corpo é re-sanitizado no servidor
 * (lib/workspace-notas.ts) antes de tocar o banco.
 *
 * Duas correções que o execCommand exige:
 *  • styleWithCSS(true): sem isso ele emite <font> e tags legadas que o
 *    sanitizador descarta — a formatação "sumia" ao salvar.
 *  • fontSize só aceita 1..7; aplicamos e trocamos o <font size> resultante
 *    por um <span style="font-size:Npx"> logo em seguida.
 */
export default function EditorNota({
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

  // Salva o que estiver pendente ao trocar de nota / desmontar — sem isto,
  // clicar em outra nota dentro da janela de debounce perdia o último trecho.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

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

  function salvarCorpo() {
    if (corpoRef.current) agendarSalvar({ corpo: corpoRef.current.innerHTML })
  }

  /** Executa um comando mantendo o foco no texto e agendando o autosave. */
  function comando(cmd: string, valor?: string) {
    const el = corpoRef.current
    if (!el) return
    el.focus()
    // CSS em vez de <font>/<b>: o sanitizador guarda style, não tag legada.
    try {
      document.execCommand("styleWithCSS", false, "true")
    } catch {
      /* navegador antigo — segue com o padrão dele */
    }
    document.execCommand(cmd, false, valor)
    salvarCorpo()
  }

  /** Tamanho em px: execCommand só aceita 1..7, então convertemos depois. */
  function aplicarTamanho(px: number) {
    const el = corpoRef.current
    if (!el) return
    el.focus()
    try {
      document.execCommand("styleWithCSS", false, "false")
    } catch {}
    // 7 é um valor sentinela improvável de existir no texto — marcamos com
    // ele e trocamos todos os <font size="7"> pelo px real logo abaixo.
    document.execCommand("fontSize", false, "7")
    for (const f of Array.from(el.querySelectorAll<HTMLElement>('font[size="7"]'))) {
      const span = document.createElement("span")
      span.style.fontSize = `${px}px`
      while (f.firstChild) span.appendChild(f.firstChild)
      f.replaceWith(span)
    }
    salvarCorpo()
  }

  /**
   * Caixa do texto na SELEÇÃO. Reescreve o texto de verdade (não usa
   * text-transform do CSS): o conteúdo copiado pra fora da nota sai como a
   * pessoa vê, e a busca encontra o que está escrito.
   */
  function aplicarCaixa(modo: "maiuscula" | "minuscula" | "capitalizada") {
    const el = corpoRef.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    const texto = sel?.toString() ?? ""
    if (!texto) {
      onErro("Selecione o texto que você quer mudar.")
      return
    }
    onErro(null)
    const novo =
      modo === "maiuscula"
        ? texto.toLocaleUpperCase("pt-BR")
        : modo === "minuscula"
          ? texto.toLocaleLowerCase("pt-BR")
          : texto
              .toLocaleLowerCase("pt-BR")
              .replace(/(^|[\s(["'¿¡])(\p{L})/gu, (_m, antes, letra) =>
                antes + letra.toLocaleUpperCase("pt-BR")
              )
    // insertText preserva a formatação do trecho e entra no undo do browser.
    document.execCommand("insertText", false, novo)
    salvarCorpo()
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
      {/* ---------- Barra de formatação ---------- */}
      <div className="ws-nota-barra">
        {/* Bloco: título / subtítulo / corpo */}
        <select
          aria-label="Estilo do parágrafo"
          title="Título, subtítulo ou corpo"
          defaultValue=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (!e.target.value) return
            comando("formatBlock", e.target.value)
            e.target.value = ""
          }}
          className="ws-nota-select"
        >
          <option value="" style={opt}>Estilo…</option>
          <option value="h1" style={opt}>Título</option>
          <option value="h2" style={opt}>Subtítulo</option>
          <option value="h3" style={opt}>Subtítulo menor</option>
          <option value="p" style={opt}>Corpo</option>
          <option value="blockquote" style={opt}>Citação</option>
        </select>

        {/* Fonte */}
        <select
          aria-label="Fonte"
          title="Fonte"
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return
            comando("fontName", e.target.value)
            e.target.value = ""
          }}
          className="ws-nota-select"
        >
          <option value="" style={opt}>Fonte…</option>
          {FONTES_NOTA.map((f) => (
            <option key={f.nome} value={f.css} style={opt}>
              {f.nome}
            </option>
          ))}
        </select>

        {/* Tamanho */}
        <select
          aria-label="Tamanho da fonte"
          title="Tamanho"
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return
            aplicarTamanho(Number(e.target.value))
            e.target.value = ""
          }}
          className="ws-nota-select"
          style={{ minWidth: 74 }}
        >
          <option value="" style={opt}>Tam.</option>
          {TAMANHOS_NOTA.map((t) => (
            <option key={t} value={t} style={opt}>
              {t}px
            </option>
          ))}
        </select>

        <span className="ws-nota-sep" aria-hidden="true" />

        <Botao rotulo="B" aria="Negrito" onAplicar={() => comando("bold")} estilo={{ fontWeight: 800 }} />
        <Botao rotulo="I" aria="Itálico" onAplicar={() => comando("italic")} estilo={{ fontStyle: "italic" }} />
        <Botao rotulo="U" aria="Sublinhado" onAplicar={() => comando("underline")} estilo={{ textDecoration: "underline" }} />
        <Botao rotulo="S" aria="Tachado" onAplicar={() => comando("strikeThrough")} estilo={{ textDecoration: "line-through" }} />

        <span className="ws-nota-sep" aria-hidden="true" />

        {/* Cor */}
        <select
          aria-label="Cor do texto"
          title="Cor do texto"
          defaultValue=""
          onChange={(e) => {
            const hex = e.target.value
            e.target.value = ""
            comando("foreColor", hex || "#e8e8ea")
          }}
          className="ws-nota-select"
        >
          <option value="" style={opt}>Cor…</option>
          {CORES_NOTA.map((c) => (
            <option key={c.nome} value={c.hex} style={opt}>
              {c.nome}
            </option>
          ))}
        </select>

        <span className="ws-nota-sep" aria-hidden="true" />

        <Botao rotulo="•" aria="Lista" onAplicar={() => comando("insertUnorderedList")} />
        <Botao rotulo="1." aria="Lista numerada" onAplicar={() => comando("insertOrderedList")} />

        <span className="ws-nota-sep" aria-hidden="true" />

        {/* Caixa do texto */}
        <Botao rotulo="AA" aria="MAIÚSCULAS" onAplicar={() => aplicarCaixa("maiuscula")} />
        <Botao rotulo="aa" aria="minúsculas" onAplicar={() => aplicarCaixa("minuscula")} />
        <Botao rotulo="Aa" aria="Primeira Maiúscula" onAplicar={() => aplicarCaixa("capitalizada")} />

        <span className="ws-nota-sep" aria-hidden="true" />

        <Botao rotulo="⟲" aria="Desfazer" onAplicar={() => comando("undo")} />
        <Botao rotulo="⟳" aria="Refazer" onAplicar={() => comando("redo")} />
        <Botao rotulo="⌫" aria="Limpar formatação" onAplicar={() => comando("removeFormat")} />

        <span style={{ flex: 1 }} />

        {confirmando ? (
          <>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={excluir}
              className="no-ds"
              style={{ fontSize: 11, fontWeight: 600, color: "#e24b4a", background: "none", border: "1px solid rgba(226,75,74,0.4)", borderRadius: 6, padding: "4px 9px", cursor: "pointer" }}
            >
              Confirmar exclusão
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
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
            onMouseDown={(e) => e.preventDefault()}
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
        onInput={salvarCorpo}
        className="ws-nota-corpo"
        data-placeholder="Escreva aqui… selecione um trecho e use a barra acima para formatar."
      />
    </div>
  )
}

/**
 * Botão da barra. preventDefault no mousedown é OBRIGATÓRIO: sem ele o clique
 * tira o foco do contentEditable, a seleção morre e o execCommand não tem
 * onde aplicar.
 */
function Botao({
  rotulo,
  aria,
  onAplicar,
  estilo,
}: {
  rotulo: string
  aria: string
  onAplicar: () => void
  estilo?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      title={aria}
      onMouseDown={(e) => {
        e.preventDefault()
        onAplicar()
      }}
      className="no-ds ws-btn-icone"
      style={{ width: 28, height: 26, fontSize: 12, ...estilo }}
    >
      {rotulo}
    </button>
  )
}

const opt: React.CSSProperties = { color: "#111" }
