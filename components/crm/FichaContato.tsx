"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { CrmLeadRow } from "@/lib/crm-leads"
import type { CrmTipoAtividadeRow } from "@/lib/crm-atividades-actions"
import { marcarLeadComoLidoAction } from "@/lib/crm-mensagens-actions"
import {
  renomearLeadAction,
  sincronizarContatoAction,
  excluirLeadAction,
  desarquivarLeadAction,
} from "@/lib/crm-leads-actions"
import Avatar from "@/components/crm/Avatar"
import EtiquetasPicker, { EtiquetaChip } from "@/components/crm/Etiquetas"
import InformacoesContato from "@/components/crm/InformacoesContato"

interface EtiquetaResumo {
  id: string
  nome: string
  cor: string
}

/**
 * Ficha do lead — a tela principal do CRM a partir da Fase 8, no lugar da
 * antiga tela de conversa. Ao clicar num contato, em vez de mensagens aparece
 * a ficha: identidade (avatar/nome/telefone, sincronizados do WhatsApp),
 * etiquetas, um botão que leva direto pro WhatsApp (wa.me) pra conversar de
 * fato, e a ficha rica (e-mail, redes sociais, reuniões, notas, campos).
 *
 * O CRM não manda mais mensagem: conversar é 1 clique pro WhatsApp, fora do
 * app — é o que derruba o risco de banimento do número.
 */
export default function FichaContato({
  lead,
  cor,
  todasEtiquetas,
  tiposCustom,
}: {
  lead: CrmLeadRow
  cor: string
  todasEtiquetas: EtiquetaResumo[]
  tiposCustom: CrmTipoAtividadeRow[]
}) {
  const router = useRouter()

  // Abrir a ficha zera o contador de não-lidas (igual abrir a conversa antes).
  useEffect(() => {
    if (lead.nao_lidas > 0) {
      marcarLeadComoLidoAction(lead.id)
    }
  }, [lead.id, lead.nao_lidas])

  // wa.me quer só os dígitos com DDI (o telefone já é guardado assim, E.164
  // sem "+"). Sem telefone (contato manual sem número), o botão fica desligado.
  const digitos = (lead.telefone_e164 ?? "").replace(/\D/g, "")
  const linkWhatsapp = digitos ? `https://wa.me/${digitos}` : null

  return (
    <div className="flex flex-col" style={{ height: "100%", minHeight: 0 }}>
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "0.5px solid rgba(255,255,255,0.08)",
          borderLeft: `3px solid ${cor}`,
          flexShrink: 0,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0" style={{ flex: 1 }}>
            <Link
              href="/dashboard/crm?view=conversas"
              className="crm-back-mobile"
              aria-label="Voltar pros contatos"
              style={{
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 8,
                color: "var(--text-2, #ddd)",
                flexShrink: 0,
                fontSize: 20,
                textDecoration: "none",
              }}
            >
              ‹
            </Link>
            <CabecalhoContato lead={lead} cor={cor} />
          </div>
          <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
            <EtiquetasPicker
              leadId={lead.id}
              nomeContato={lead.nome || lead.telefone_e164 || "Lead sem nome"}
              etiquetasDoLead={lead.etiquetas}
              todasEtiquetas={todasEtiquetas}
              tiposCustom={tiposCustom}
            />
            <MenuContato lead={lead} />
          </div>
        </div>

        {lead.etiquetas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {lead.etiquetas.map((e) => (
              <EtiquetaChip key={e.id} nome={e.nome} cor={e.cor} />
            ))}
          </div>
        )}
      </div>

      {/* Barra de ação: conversar de fato é no WhatsApp (fora do app). */}
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "0.5px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        {linkWhatsapp ? (
          <a
            href={linkWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gold-filled"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              padding: "9px 18px",
              textDecoration: "none",
            }}
          >
            💬 Conversar no WhatsApp
          </a>
        ) : (
          <p style={{ fontSize: 12, color: "var(--text-4)" }}>
            Contato sem telefone — sem link pro WhatsApp.
          </p>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <InformacoesContato lead={lead} cor={cor} cabecalho={false} onFechar={() => router.refresh()} />
      </div>
    </div>
  )
}

/** Cabeçalho do contato: avatar + nome editável (ou "adicionar nome" quando é
 *  só um número) + empresa/telefone + recado, e o botão de puxar o contato do
 *  WhatsApp. Auto-sincroniza nome/foto ao abrir (1 chamada throttled). */
function CabecalhoContato({ lead, cor }: { lead: CrmLeadRow; cor: string }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(lead.nome ?? "")
  const [status, setStatus] = useState<string | null>(null)
  const [pendingNome, startNome] = useTransition()
  const [pendingSync, startSync] = useTransition()
  const jaTentouRef = useRef(false)
  const router = useRouter()

  const nomeExibido = lead.nome || lead.telefone_e164 || "Lead sem nome"

  // Auto-sync silencioso: abrir uma ficha sem nome ou foto já dispara a busca
  // no WhatsApp sozinho, sem clicar em nada. Respeita nome_manual (nome
  // digitado à mão nunca é sobrescrito). Uma tentativa por abertura de ficha
  // (FichaContato remonta por lead — key={lead.id} na page). É a única chamada
  // de API por abertura, e é throttled no servidor (6h) — o "viewer" da Fase 8.
  useEffect(() => {
    if (jaTentouRef.current) return
    if (lead.nome && lead.foto_url) return
    jaTentouRef.current = true
    sincronizarContatoAction(lead.id).then((r) => {
      if (r.ok) router.refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  async function salvarNome() {
    const n = nome.trim()
    if (!n) return
    const r = await renomearLeadAction(lead.id, n)
    if (r.ok) {
      setEditando(false)
      setStatus(null)
      router.refresh()
    } else {
      setStatus(r.erro ?? "Erro ao salvar")
    }
  }

  async function atualizar() {
    setStatus("Buscando no WhatsApp…")
    const r = await sincronizarContatoAction(lead.id, { forcar: true })
    if (r.ok) {
      setStatus(null)
      router.refresh()
    } else {
      setStatus(r.erro ?? "Erro ao atualizar")
    }
  }

  return (
    <div className="flex items-center gap-3 min-w-0" style={{ flex: 1 }}>
      <Avatar nome={nomeExibido} cor={cor} fotoUrl={lead.foto_url} size={44} />
      <div className="min-w-0" style={{ flex: 1 }}>
        {editando ? (
          <div className="flex items-center gap-1.5">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  startNome(() => salvarNome())
                } else if (e.key === "Escape") {
                  setEditando(false)
                  setNome(lead.nome ?? "")
                }
              }}
              placeholder="Nome do contato"
              maxLength={80}
              autoFocus
              className="glass-input"
              style={{ fontSize: 13, padding: "4px 8px", flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              onClick={() => startNome(() => salvarNome())}
              disabled={pendingNome || !nome.trim()}
              className="btn-gold-filled"
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              ✓
            </button>
            <button
              type="button"
              onClick={() => {
                setEditando(false)
                setNome(lead.nome ?? "")
              }}
              style={{ fontSize: 12, color: "var(--text-3)", padding: "0 4px" }}
            >
              ✕
            </button>
          </div>
        ) : lead.nome ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <p style={{ fontSize: 14, fontWeight: 600 }} className="truncate">
              {lead.nome}
            </p>
            <button
              type="button"
              onClick={() => {
                setNome(lead.nome ?? "")
                setEditando(true)
              }}
              title="Editar nome"
              style={{ fontSize: 12, color: "var(--text-4)", flexShrink: 0 }}
            >
              ✎
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNome("")
              setEditando(true)
            }}
            style={{ fontSize: 13, fontWeight: 600, color: "var(--gold, #C9953A)" }}
          >
            ＋ Adicionar nome
          </button>
        )}

        <p style={{ fontSize: 11, color: cor, fontWeight: 500 }} className="truncate">
          {lead.empresa_nome}
          {lead.telefone_e164 ? ` · ${lead.telefone_e164}` : ""}
        </p>

        {lead.sobre && (
          <p
            style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}
            className="truncate"
          >
            “{lead.sobre}”
          </p>
        )}

        <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
          {!editando && (
            <button
              type="button"
              onClick={() => startSync(() => atualizar())}
              disabled={pendingSync}
              title="Puxar nome/recado/foto do WhatsApp"
              style={{ fontSize: 10, color: "var(--text-4)" }}
            >
              {pendingSync ? "Atualizando…" : "↻ Atualizar do WhatsApp"}
            </button>
          )}
          {status && (
            <span
              style={{
                fontSize: 10,
                color: status.includes("…") ? "var(--text-4)" : "var(--danger)",
              }}
            >
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Menu (⋮) do contato — excluir o lead (ou tirar do arquivo). Fase 8: sem a
// opção de "arquivar no WhatsApp" (o CRM virou viewer, não edita o celular).
// Nome/e-mail/etc. são editados no cabeçalho e na ficha logo abaixo.
// =============================================================================
function MenuContato({ lead }: { lead: CrmLeadRow }) {
  const [aberto, setAberto] = useState(false)
  const [modo, setModo] = useState<"menu" | "excluir">("menu")
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function fechar() {
    setAberto(false)
    setModo("menu")
    setErro(null)
  }

  function alternar() {
    if (aberto) fechar()
    else setAberto(true)
  }

  function excluir() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("lead_id", lead.id)
      const r = await excluirLeadAction(fd)
      if (r.ok) {
        fechar()
        router.push("/dashboard/crm?view=conversas")
        router.refresh()
      } else {
        setErro(r.erro ?? "Erro ao excluir")
      }
    })
  }

  function desarquivar() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("lead_id", lead.id)
      const r = await desarquivarLeadAction(fd)
      if (r.ok) {
        fechar()
        router.refresh()
      } else {
        setErro(r.erro ?? "Erro ao desarquivar")
      }
    })
  }

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={alternar}
        title="Opções do contato"
        style={{
          fontSize: 14,
          color: "var(--text-4)",
          padding: "6px 8px",
          border: "0.5px solid rgba(255,255,255,0.15)",
          borderRadius: 8,
          lineHeight: 1,
        }}
      >
        ⋮
      </button>

      {aberto && (
        <>
          <button
            type="button"
            aria-label="Fechar"
            onClick={fechar}
            style={{ position: "fixed", inset: 0, zIndex: 15, cursor: "default" }}
          />
          <div
            className="glass"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 6,
              padding: 12,
              width: "min(260px, calc(100vw - 32px))",
              zIndex: 20,
            }}
          >
            {modo === "menu" && (
              <div className="flex flex-col" style={{ gap: 2 }}>
                {lead.arquivado && (
                  <button
                    type="button"
                    onClick={desarquivar}
                    disabled={pending}
                    style={{ fontSize: 13, textAlign: "left", padding: "7px 8px", borderRadius: 8 }}
                  >
                    {pending ? "Tirando do arquivo..." : "Tirar do arquivo"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setModo("excluir")}
                  disabled={pending}
                  style={{
                    fontSize: 13,
                    textAlign: "left",
                    padding: "7px 8px",
                    borderRadius: 8,
                    color: "var(--danger)",
                  }}
                >
                  Excluir contato
                </button>
              </div>
            )}

            {modo === "excluir" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>
                  Excluir contato?
                </p>
                <p style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Apaga o contato, as atividades e etiquetas dele no CRM. A
                  conversa no WhatsApp do celular não é tocada. Não dá pra
                  desfazer.
                </p>
                {erro && <p style={{ fontSize: 11, color: "var(--danger)" }}>{erro}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={excluir}
                    disabled={pending}
                    style={{
                      fontSize: 11,
                      padding: "6px 12px",
                      borderRadius: 8,
                      color: "#fff",
                      background: "var(--danger)",
                      opacity: pending ? 0.5 : 1,
                    }}
                  >
                    {pending ? "Excluindo..." : "Excluir de vez"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModo("menu")}
                    disabled={pending}
                    style={{ fontSize: 11, color: "var(--text-3)" }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
