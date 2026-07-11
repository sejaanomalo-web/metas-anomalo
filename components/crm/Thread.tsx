"use client"

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { CrmLeadRow, CrmMensagemRow } from "@/lib/crm-leads"
import type { CrmTipoAtividadeRow } from "@/lib/crm-atividades-actions"
import {
  enviarMensagemAction,
  enviarAudioAction,
  marcarLeadComoLidoAction,
  carregarMensagensAntigasAction,
} from "@/lib/crm-mensagens-actions"
import {
  criarFollowUpAction,
  criarTipoAtividadeAction,
  excluirTipoAtividadeAction,
} from "@/lib/crm-atividades-actions"
import {
  renomearLeadAction,
  sincronizarContatoAction,
} from "@/lib/crm-leads-actions"
import { TIPOS_ATIVIDADE_PADRAO } from "@/lib/crm-tipos-atividade"
import Avatar from "@/components/crm/Avatar"
import EtiquetasPicker, { EtiquetaChip } from "@/components/crm/Etiquetas"

interface EtiquetaResumo {
  id: string
  nome: string
  cor: string
}

// Balões: meus (enviados) à direita em AMARELO; do cliente à esquerda em cinza.
const BOLHA_MINHA = "rgba(240, 199, 94, 0.22)"
const BOLHA_MINHA_BORDA = "rgba(240, 199, 94, 0.34)"
const BOLHA_CLIENTE = "rgba(255,255,255,0.06)"

function formatarHora(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** "agora" local no formato do input datetime-local (YYYY-MM-DDTHH:mm). */
function agoraLocalInput(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function Thread({
  lead,
  mensagensIniciais,
  temMaisAntigasInicial,
  cor,
  todasEtiquetas,
  tiposCustom,
}: {
  lead: CrmLeadRow
  mensagensIniciais: CrmMensagemRow[]
  temMaisAntigasInicial: boolean
  cor: string
  todasEtiquetas: EtiquetaResumo[]
  tiposCustom: CrmTipoAtividadeRow[]
}) {
  const [texto, setTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [mensagens, setMensagens] = useState(mensagensIniciais)
  const [temMaisAntigas, setTemMaisAntigas] = useState(temMaisAntigasInicial)
  const [carregandoAntigas, setCarregandoAntigas] = useState(false)
  const router = useRouter()
  const fimRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ultimoIdRef = useRef<string | null>(null)
  const alturaAntesCarregarRef = useRef<number | null>(null)

  useEffect(() => {
    if (lead.nao_lidas > 0) {
      marcarLeadComoLidoAction(lead.id)
    }
  }, [lead.id, lead.nao_lidas])

  // Mescla o que o servidor manda (via router.refresh() — ex: mensagem nova
  // chegando por realtime) com o que já está carregado no cliente. Sem isso,
  // cada refresh() jogaria fora as páginas antigas que "Carregar anteriores"
  // já tinha buscado.
  useEffect(() => {
    setMensagens((atual) => {
      const porId = new Map(atual.map((m) => [m.id, m]))
      for (const m of mensagensIniciais) porId.set(m.id, m)
      return Array.from(porId.values()).sort((a, b) => {
        const ta = a.wa_timestamp ?? a.created_at
        const tb = b.wa_timestamp ?? b.created_at
        return ta.localeCompare(tb)
      })
    })
  }, [mensagensIniciais])

  // Sobe automaticamente só quando uma mensagem NOVA chega no final (append) —
  // não quando "Carregar anteriores" insere mensagens no topo (prepend).
  useEffect(() => {
    const ultimo = mensagens[mensagens.length - 1]?.id ?? null
    if (ultimo && ultimo !== ultimoIdRef.current) {
      ultimoIdRef.current = ultimo
      fimRef.current?.scrollIntoView({ block: "end" })
    }
  }, [mensagens])

  // Depois de prepender mensagens antigas, mantém a MESMA posição visual
  // (senão o conteúdo "pula" — o navegador ancora no topo por padrão).
  useLayoutEffect(() => {
    const alturaAntes = alturaAntesCarregarRef.current
    const el = scrollRef.current
    if (alturaAntes != null && el) {
      el.scrollTop += el.scrollHeight - alturaAntes
      alturaAntesCarregarRef.current = null
    }
  }, [mensagens])

  async function carregarAntigas() {
    const maisAntiga = mensagens[0]
    if (!maisAntiga || carregandoAntigas) return
    setCarregandoAntigas(true)
    alturaAntesCarregarRef.current = scrollRef.current?.scrollHeight ?? null
    const cursor = maisAntiga.wa_timestamp ?? maisAntiga.created_at
    const pagina = await carregarMensagensAntigasAction(lead.id, cursor)
    setMensagens((atual) => {
      const porId = new Map(pagina.mensagens.map((m) => [m.id, m]))
      for (const m of atual) porId.set(m.id, m)
      return Array.from(porId.values()).sort((a, b) => {
        const ta = a.wa_timestamp ?? a.created_at
        const tb = b.wa_timestamp ?? b.created_at
        return ta.localeCompare(tb)
      })
    })
    setTemMaisAntigas(pagina.temMaisAntigas)
    setCarregandoAntigas(false)
  }

  async function enviar() {
    const corpo = texto.trim()
    if (!corpo) return
    setErro(null)
    const r = await enviarMensagemAction(lead.id, corpo)
    if (r.ok) {
      setTexto("")
      router.refresh()
    } else {
      setErro(r.erro ?? "Erro ao enviar")
    }
  }

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
              aria-label="Voltar pras conversas"
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
          <AtribuirAtividade leadId={lead.id} tiposCustom={tiposCustom} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {lead.etiquetas.map((e) => (
            <EtiquetaChip key={e.id} nome={e.nome} cor={e.cor} />
          ))}
          <EtiquetasPicker
            leadId={lead.id}
            etiquetasDoLead={lead.etiquetas}
            todasEtiquetas={todasEtiquetas}
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin"
        style={{
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minHeight: 0,
        }}
      >
        {mensagens.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>
            Sem mensagens ainda.
          </p>
        )}
        {temMaisAntigas && (
          <button
            type="button"
            onClick={carregarAntigas}
            disabled={carregandoAntigas}
            style={{
              alignSelf: "center",
              fontSize: 11,
              color: "var(--text-3)",
              padding: "6px 14px",
              borderRadius: 999,
              border: "0.5px solid rgba(255,255,255,0.12)",
              marginBottom: 4,
            }}
          >
            {carregandoAntigas ? "Carregando…" : "↑ Carregar mensagens anteriores"}
          </button>
        )}
        {mensagens.map((m) => {
          const meu = m.from_me || m.direcao === "out"
          return (
            <div
              key={m.id}
              style={{
                alignSelf: meu ? "flex-end" : "flex-start",
                maxWidth: "74%",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  borderTopRightRadius: meu ? 4 : 12,
                  borderTopLeftRadius: meu ? 12 : 4,
                  background: meu ? BOLHA_MINHA : BOLHA_CLIENTE,
                  border: meu
                    ? `0.5px solid ${BOLHA_MINHA_BORDA}`
                    : "0.5px solid transparent",
                  fontSize: 13,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                <ConteudoMensagem mensagem={m} />
              </div>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--text-4)",
                  marginTop: 2,
                  textAlign: meu ? "right" : "left",
                }}
              >
                {formatarHora(m.wa_timestamp)}
                {m.status === "falha" && (
                  <span style={{ color: "var(--danger)" }}>
                    {" "}
                    · falhou{m.erro ? `: ${m.erro}` : ""}
                  </span>
                )}
              </p>
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>

      <div
        style={{
          padding: "12px 18px",
          borderTop: "0.5px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        {erro && (
          <p style={{ fontSize: 11, color: "var(--danger)", marginBottom: 8 }}>{erro}</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                startTransition(() => enviar())
              }
            }}
            placeholder="Escreva uma mensagem..."
            rows={2}
            autoFocus
            className="glass-input"
            style={{ flex: 1, padding: "8px 12px", fontSize: 13, resize: "none" }}
          />
          <GravadorAudio leadId={lead.id} onErro={setErro} />
          <button
            type="button"
            onClick={() => startTransition(() => enviar())}
            disabled={pending || !texto.trim()}
            className="btn-gold-filled uppercase"
            style={{ opacity: pending || !texto.trim() ? 0.5 : 1 }}
          >
            {pending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Renderiza o conteúdo por tipo: áudio toca inline, imagem exibe, resto é
 *  texto (com fallback pro rótulo do tipo quando não há corpo). */
function ConteudoMensagem({ mensagem: m }: { mensagem: CrmMensagemRow }) {
  if (m.tipo === "audio" && m.midia_url) {
    return (
      <audio
        controls
        preload="none"
        src={m.midia_url}
        style={{ maxWidth: 240, height: 36, display: "block" }}
      />
    )
  }
  if (m.tipo === "imagem" && m.midia_url) {
    return (
      <div>
        <img
          src={m.midia_url}
          alt={m.conteudo ?? "Imagem"}
          style={{ maxWidth: 240, borderRadius: 8, display: "block" }}
        />
        {m.conteudo && <p style={{ marginTop: 6 }}>{m.conteudo}</p>}
      </div>
    )
  }
  if (m.conteudo) return <>{m.conteudo}</>
  // Sem corpo (mídia sem legenda, ou texto que não pôde ser extraído): rótulo
  // discreto por tipo, em vez do cru "[texto]".
  const rotulos: Record<string, string> = {
    audio: "🎤 Áudio",
    imagem: "🖼️ Imagem",
    video: "🎬 Vídeo",
    documento: "📄 Documento",
    figurinha: "🌟 Figurinha",
    localizacao: "📍 Localização",
    contato: "👤 Contato",
  }
  return (
    <span style={{ opacity: 0.7, fontStyle: "italic" }}>
      {rotulos[m.tipo] ?? "Mensagem"}
    </span>
  )
}

/** Cabeçalho do contato: avatar + nome editável (ou "adicionar nome" quando é
 *  só um número) + empresa/telefone + recado, e o botão de puxar o contato do
 *  WhatsApp. */
function CabecalhoContato({ lead, cor }: { lead: CrmLeadRow; cor: string }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(lead.nome ?? "")
  const [status, setStatus] = useState<string | null>(null)
  const [pendingNome, startNome] = useTransition()
  const [pendingSync, startSync] = useTransition()
  const jaTentouRef = useRef(false)
  const router = useRouter()

  const nomeExibido = lead.nome || lead.telefone_e164 || "Lead sem nome"

  // Auto-sync silencioso: abrir uma conversa sem nome ou foto já dispara a
  // busca no WhatsApp sozinho, sem precisar clicar em nada. Respeita
  // nome_manual (nome digitado à mão nunca é sobrescrito). Uma tentativa por
  // abertura de conversa (Thread remonta por lead — key={lead.id} na page).
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
// Gravador de áudio (nota de voz) — MediaRecorder no navegador.
// =============================================================================
function GravadorAudio({
  leadId,
  onErro,
}: {
  leadId: string
  onErro: (m: string | null) => void
}) {
  const [gravando, setGravando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelarRef = useRef(false)
  const montadoRef = useRef(true)
  const router = useRouter()

  function pararTudo() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      pararTudo()
    }
  }, [])

  async function iniciar() {
    onErro(null)
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onErro("Seu navegador não suporta gravação de áudio.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Se o componente desmontou durante o prompt de permissão (ex: troca de
      // conversa), desliga o microfone e sai — senão o stream fica vivo.
      if (!montadoRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      chunksRef.current = []
      cancelarRef.current = false
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        pararTudo()
        setGravando(false)
        if (cancelarRef.current) return
        const blob = new Blob(chunksRef.current, {
          type: chunksRef.current[0]?.type || "audio/webm",
        })
        if (blob.size === 0) return
        await enviar(blob)
      }
      recorderRef.current = rec
      rec.start()
      setGravando(true)
      setSegundos(0)
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    } catch {
      // Falha após o getUserMedia (ex: MediaRecorder não suportado) também
      // precisa desligar o microfone que já pode estar aberto.
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      onErro("Não foi possível acessar o microfone (permita o acesso no navegador).")
    }
  }

  function parar() {
    recorderRef.current?.stop()
  }

  function cancelar() {
    cancelarRef.current = true
    recorderRef.current?.stop()
  }

  async function enviar(blob: Blob) {
    setEnviando(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = () => reject(fr.error)
        fr.readAsDataURL(blob)
      })
      const r = await enviarAudioAction(leadId, dataUrl, blob.type || null)
      if (r.ok) router.refresh()
      else onErro(r.erro ?? "Erro ao enviar áudio")
    } catch {
      onErro("Erro ao processar o áudio.")
    } finally {
      setEnviando(false)
    }
  }

  const mm = String(Math.floor(segundos / 60)).padStart(2, "0")
  const ss = String(segundos % 60).padStart(2, "0")

  if (gravando) {
    return (
      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
        <span
          style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)" }}
        />
        <span style={{ fontSize: 12, color: "var(--text-2, #ddd)", fontVariantNumeric: "tabular-nums" }}>
          {mm}:{ss}
        </span>
        <button
          type="button"
          onClick={cancelar}
          title="Cancelar"
          style={{ fontSize: 11, color: "var(--text-3)", padding: "6px 8px" }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={parar}
          title="Enviar áudio"
          className="btn-gold-filled"
          style={{ fontSize: 12, padding: "8px 12px" }}
        >
          ➤
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={iniciar}
      disabled={enviando}
      title="Gravar áudio"
      style={{
        flexShrink: 0,
        fontSize: 18,
        padding: "6px 10px",
        borderRadius: 8,
        border: "0.5px solid rgba(255,255,255,0.15)",
        color: "var(--text-2, #ddd)",
        opacity: enviando ? 0.5 : 1,
      }}
    >
      {enviando ? "…" : "🎤"}
    </button>
  )
}

// =============================================================================
// Atribuir atividade — menu de tipos (Follow-up / Reunião / Fechamento / +) e
// formulário com data. Substitui o antigo botão "Follow-up".
// =============================================================================
function AtribuirAtividade({
  leadId,
  tiposCustom,
}: {
  leadId: string
  tiposCustom: CrmTipoAtividadeRow[]
}) {
  const [aberto, setAberto] = useState(false)
  const [categoria, setCategoria] = useState<string | null>(null)

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => {
          setAberto((v) => !v)
          setCategoria(null)
        }}
        style={{
          fontSize: 11,
          color: "var(--text-2, #ddd)",
          border: "0.5px solid rgba(255,255,255,0.15)",
          borderRadius: 8,
          padding: "6px 10px",
          whiteSpace: "nowrap",
        }}
      >
        ＋ Agendar
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
              right: 0,
              marginTop: 6,
              padding: 12,
              width: 280,
              zIndex: 20,
            }}
          >
            {categoria ? (
              <FormAtividade
                leadId={leadId}
                categoria={categoria}
                onVoltar={() => setCategoria(null)}
                onClose={() => setAberto(false)}
              />
            ) : (
              <MenuTipos
                tiposCustom={tiposCustom}
                onEscolher={setCategoria}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MenuTipos({
  tiposCustom,
  onEscolher,
}: {
  tiposCustom: CrmTipoAtividadeRow[]
  onEscolher: (categoria: string) => void
}) {
  const [novoTipo, setNovoTipo] = useState("")
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function criarTipo() {
    const nome = novoTipo.trim()
    if (!nome) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set("nome", nome)
      await criarTipoAtividadeAction(fd)
      setNovoTipo("")
      router.refresh()
    })
  }

  function excluirTipo(id: string) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", id)
      await excluirTipoAtividadeAction(fd)
      router.refresh()
    })
  }

  return (
    <div>
      <p
        style={{
          fontSize: 9,
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          color: "var(--text-4)",
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        Registrar ponto de contato
      </p>
      <div className="flex flex-col gap-1">
        {TIPOS_ATIVIDADE_PADRAO.map((t) => (
          <button
            key={t.nome}
            type="button"
            onClick={() => onEscolher(t.nome)}
            className="flex items-center gap-2"
            style={{
              fontSize: 13,
              padding: "7px 8px",
              borderRadius: 8,
              textAlign: "left",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span>{t.emoji}</span>
            {t.nome}
          </button>
        ))}
        {tiposCustom.map((t) => (
          <div key={t.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEscolher(t.nome)}
              className="flex items-center gap-2 flex-1"
              style={{
                fontSize: 13,
                padding: "7px 8px",
                borderRadius: 8,
                textAlign: "left",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <span>🏷️</span>
              {t.nome}
            </button>
            <button
              type="button"
              onClick={() => excluirTipo(t.id)}
              disabled={pending}
              title="Remover tipo"
              style={{ fontSize: 13, color: "var(--text-4)", padding: "4px 6px" }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginTop: 10,
          borderTop: "0.5px solid rgba(255,255,255,0.08)",
          paddingTop: 10,
        }}
      >
        <input
          value={novoTipo}
          onChange={(e) => setNovoTipo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              criarTipo()
            }
          }}
          placeholder="Novo tipo de atividade..."
          maxLength={60}
          className="glass-input"
          style={{ flex: 1, fontSize: 12, padding: "6px 8px" }}
        />
        <button
          type="button"
          onClick={criarTipo}
          disabled={pending || !novoTipo.trim()}
          className="btn-gold-filled"
          style={{ fontSize: 13, padding: "6px 10px" }}
        >
          ＋
        </button>
      </div>
    </div>
  )
}

function FormAtividade({
  leadId,
  categoria,
  onVoltar,
  onClose,
}: {
  leadId: string
  categoria: string
  onVoltar: () => void
  onClose: () => void
}) {
  const [titulo, setTitulo] = useState("")
  const [quando, setQuando] = useState(agoraLocalInput())
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  async function salvar() {
    if (!quando) {
      setStatus("Escolha data e hora.")
      return
    }
    const fd = new FormData()
    fd.set("lead_id", leadId)
    fd.set("categoria", categoria)
    fd.set("titulo", titulo)
    fd.set("agendado_para", quando)
    const r = await criarFollowUpAction(fd)
    if (r.ok) {
      setStatus("Marcado ✓")
      router.refresh()
      setTimeout(onClose, 700)
    } else {
      setStatus(r.erro ?? "Erro")
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onVoltar}
          style={{ fontSize: 13, color: "var(--text-3)" }}
        >
          ‹
        </button>
        <p style={{ fontSize: 13, fontWeight: 600 }}>{categoria}</p>
      </div>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Detalhe (opcional)"
        maxLength={100}
        className="glass-input"
        style={{ fontSize: 12, padding: "6px 10px" }}
      />
      <input
        type="datetime-local"
        value={quando}
        onChange={(e) => setQuando(e.target.value)}
        className="glass-input"
        style={{ fontSize: 12, padding: "6px 10px" }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => startTransition(() => salvar())}
          disabled={pending}
          className="btn-gold-filled"
          style={{ fontSize: 11, padding: "6px 12px", opacity: pending ? 0.5 : 1 }}
        >
          {pending ? "Salvando..." : "Marcar"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ fontSize: 11, color: "var(--text-3)" }}
        >
          Cancelar
        </button>
        {status && (
          <span
            style={{
              fontSize: 11,
              color: status.includes("✓") ? "var(--success)" : "var(--danger)",
            }}
          >
            {status}
          </span>
        )}
      </div>
    </div>
  )
}
