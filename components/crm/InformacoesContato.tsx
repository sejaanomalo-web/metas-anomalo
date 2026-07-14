"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { CrmLeadRow, CampoPersonalizado } from "@/lib/crm-leads"
import { editarInformacoesContatoAction } from "@/lib/crm-leads-actions"
import Avatar from "@/components/crm/Avatar"

function gerarId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `campo_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/**
 * Ficha de informações do contato: nome, telefone (só leitura — é o vínculo
 * com a conversa do WhatsApp), e-mail, notas com formatação básica
 * (negrito/itálico/sublinhado/lista) e campos personalizados livres
 * (nome+valor definidos pelo usuário).
 *
 * Não assume nada sobre onde é montado — o Kanban usa num popup centralizado,
 * Conversas embute na própria thread (ver `onFechar`, que em Conversas volta
 * pra tela de mensagens em vez de fechar um modal).
 */
export default function InformacoesContato({
  lead,
  cor,
  onFechar,
}: {
  lead: CrmLeadRow
  cor: string
  onFechar: () => void
}) {
  const [nome, setNome] = useState(lead.nome ?? "")
  const [email, setEmail] = useState(lead.email ?? "")
  const [campos, setCampos] = useState<CampoPersonalizado[]>(
    lead.campos_personalizados ?? []
  )
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const notasRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // execCommand é deprecated mas ainda é o jeito mais simples de fazer
  // negrito/itálico/sublinhado/lista num contentEditable sem trazer uma lib
  // de editor de texto (tiptap/slate/etc) — o app inteiro é zero-dependency
  // pra UI. onMouseDown com preventDefault evita que o botão roube o foco/
  // seleção do texto ANTES do comando rodar (senão a seleção se perde).
  function formatar(comando: string) {
    notasRef.current?.focus()
    document.execCommand(comando)
  }

  // Força colar como texto puro — a nota só deve ganhar tags via os botões
  // de formatação (que sempre produzem b/i/u/ul/li), nunca via HTML colado
  // de outra origem. O servidor sanitiza de qualquer forma, mas isso evita
  // que um `<div style="...">` de um Google Docs colado polua a nota.
  function aoColar(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    const texto = e.clipboardData.getData("text/plain")
    document.execCommand("insertText", false, texto)
  }

  function adicionarCampo() {
    setCampos((atual) => [...atual, { id: gerarId(), nome: "", valor: "" }])
  }
  function removerCampo(id: string) {
    setCampos((atual) => atual.filter((c) => c.id !== id))
  }
  function mudarCampo(id: string, patch: Partial<CampoPersonalizado>) {
    setCampos((atual) => atual.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function salvar() {
    const n = nome.trim()
    if (!n) {
      setErro("Nome obrigatório.")
      return
    }
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("lead_id", lead.id)
      fd.set("nome", n)
      fd.set("email", email.trim())
      fd.set("notas_html", notasRef.current?.innerHTML ?? "")
      fd.set("campos_personalizados", JSON.stringify(campos))
      const r = await editarInformacoesContatoAction(fd)
      if (r.ok) {
        router.refresh()
        onFechar()
      } else {
        setErro(r.erro ?? "Erro ao salvar")
      }
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        className="flex items-center justify-between gap-3"
        style={{
          padding: "14px 18px",
          borderBottom: "0.5px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Avatar
            nome={nome || lead.telefone_e164 || "Contato"}
            cor={cor}
            fotoUrl={lead.foto_url}
            size={32}
          />
          <p style={{ fontSize: 14, fontWeight: 600 }} className="truncate">
            Informações do contato
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar e voltar"
          title="Voltar"
          style={{
            fontSize: 16,
            color: "var(--text-3)",
            width: 30,
            height: 30,
            borderRadius: 8,
            flexShrink: 0,
            border: "0.5px solid rgba(255,255,255,0.12)",
          }}
        >
          ✕
        </button>
      </div>

      <div
        className="scrollbar-thin"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
          <Campo label="Nome">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={80}
              className="glass-input"
              style={{ fontSize: 13, padding: "7px 10px", width: "100%" }}
            />
          </Campo>

          <Campo label="Telefone">
            <p style={{ fontSize: 13, color: "var(--text-2, #ddd)", padding: "7px 2px" }}>
              {lead.telefone_e164 || "— (contato manual, sem telefone)"}
            </p>
          </Campo>

          <Campo label="E-mail">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              maxLength={120}
              placeholder="Opcional"
              className="glass-input"
              style={{ fontSize: 13, padding: "7px 10px", width: "100%" }}
            />
          </Campo>

          <Campo label="Notas">
            <div
              className="flex items-center gap-1 flex-wrap"
              style={{
                marginBottom: 6,
                padding: 4,
                borderRadius: 8,
                border: "0.5px solid rgba(255,255,255,0.1)",
                width: "fit-content",
              }}
            >
              <BotaoFormato label="B" title="Negrito" onClick={() => formatar("bold")} negrito />
              <BotaoFormato label="I" title="Itálico" onClick={() => formatar("italic")} italico />
              <BotaoFormato
                label="S"
                title="Sublinhado"
                onClick={() => formatar("underline")}
                sublinhado
              />
              <BotaoFormato
                label="•"
                title="Lista com marcadores"
                onClick={() => formatar("insertUnorderedList")}
              />
            </div>
            <div
              ref={notasRef}
              contentEditable
              suppressContentEditableWarning
              onPaste={aoColar}
              dangerouslySetInnerHTML={{ __html: lead.notas_html ?? "" }}
              className="glass-input"
              style={{
                fontSize: 13,
                padding: "10px 12px",
                minHeight: 110,
                lineHeight: 1.5,
                outline: "none",
              }}
            />
          </Campo>

          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <p style={rotuloEstilo}>Campos personalizados</p>
              <button
                type="button"
                onClick={adicionarCampo}
                style={{ fontSize: 11, color: cor, fontWeight: 600, flexShrink: 0 }}
              >
                + Adicionar campo
              </button>
            </div>
            {campos.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-4)" }}>
                Nenhum campo extra ainda. Ex: CPF, aniversário, indicação…
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {campos.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <input
                      value={c.nome}
                      onChange={(e) => mudarCampo(c.id, { nome: e.target.value })}
                      placeholder="Nome do campo"
                      maxLength={40}
                      className="glass-input"
                      style={{ fontSize: 12, padding: "6px 8px", width: "38%", minWidth: 0 }}
                    />
                    <input
                      value={c.valor}
                      onChange={(e) => mudarCampo(c.id, { valor: e.target.value })}
                      placeholder="Valor"
                      maxLength={500}
                      className="glass-input"
                      style={{ fontSize: 12, padding: "6px 8px", flex: 1, minWidth: 0 }}
                    />
                    <button
                      type="button"
                      onClick={() => removerCampo(c.id)}
                      aria-label="Remover campo"
                      title="Remover campo"
                      style={{ fontSize: 13, color: "var(--danger)", flexShrink: 0, padding: "4px 6px" }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {erro && <p style={{ fontSize: 12, color: "var(--danger)" }}>{erro}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={pending}
              className="btn-gold-filled"
              style={{ fontSize: 12, padding: "8px 16px", opacity: pending ? 0.6 : 1 }}
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={onFechar}
              disabled={pending}
              style={{ fontSize: 12, color: "var(--text-3)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={rotuloEstilo}>{label}</p>
      {children}
    </div>
  )
}

function BotaoFormato({
  label,
  title,
  onClick,
  negrito,
  italico,
  sublinhado,
}: {
  label: string
  title: string
  onClick: () => void
  negrito?: boolean
  italico?: boolean
  sublinhado?: boolean
}) {
  return (
    <button
      type="button"
      // preventDefault no mousedown é o que importa: sem isso o clique no
      // botão tira o foco/seleção do contentEditable ANTES do onClick
      // disparar o execCommand, que passaria a atuar sem nenhum texto
      // selecionado (ou perderia o cursor de digitação).
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 26,
        height: 26,
        fontSize: 12,
        fontWeight: negrito ? 800 : 600,
        fontStyle: italico ? "italic" : "normal",
        textDecoration: sublinhado ? "underline" : "none",
        color: "var(--text-2, #ddd)",
        borderRadius: 6,
      }}
    >
      {label}
    </button>
  )
}

const rotuloEstilo: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: "var(--text-4)",
  fontWeight: 600,
  marginBottom: 6,
}
