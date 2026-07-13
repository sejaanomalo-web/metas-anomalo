"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  atribuirEtiquetaAction,
} from "@/lib/crm-etiquetas-actions"
import {
  criarFollowUpAction,
  criarTipoAtividadeAction,
  excluirTipoAtividadeAction,
} from "@/lib/crm-atividades-actions"
import type { CrmTipoAtividadeRow } from "@/lib/crm-atividades-actions"
import { agoraLocalInput, emojiDaEtapa, precisaAgendar } from "@/lib/crm-tipos-atividade"

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
      {emojiDaEtapa(nome)} {nome}
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

/**
 * Botão + popover unificado: marcar a etapa do funil (etiqueta) do lead E
 * agendar compromisso, num só fluxo (Fase 9). Etapas "de agendamento"
 * (reunião/follow-up/fechamento — ver precisaAgendar) abrem o formulário de
 * data com o detalhe já preenchido ("Reunião agendada com Fulano"); as
 * demais (Novo contato, Em conversa, Qualificado, Proposta, Cliente,
 * Perdido...) só trocam a fase na hora, sem pedir data. Substitui o antigo
 * botão separado "+ Agendar" (removido do header do Thread).
 */
export default function EtiquetasPicker({
  leadId,
  nomeContato,
  etiquetasDoLead,
  todasEtiquetas,
  tiposCustom,
}: {
  leadId: string
  nomeContato: string
  etiquetasDoLead: EtiquetaResumo[]
  todasEtiquetas: EtiquetaResumo[]
  tiposCustom: CrmTipoAtividadeRow[]
}) {
  const [aberto, setAberto] = useState(false)
  const [agendando, setAgendando] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const idsAtribuidas = new Set(etiquetasDoLead.map((e) => e.id))

  function fechar() {
    setAberto(false)
    setAgendando(null)
  }

  function escolherEtapa(etapa: EtiquetaResumo) {
    if (idsAtribuidas.has(etapa.id)) return
    if (precisaAgendar(etapa.nome)) {
      setAgendando(etapa.nome)
      return
    }
    const fd = new FormData()
    fd.set("lead_id", leadId)
    fd.set("etiqueta_id", etapa.id)
    startTransition(async () => {
      await atribuirEtiquetaAction(fd)
      router.refresh()
    })
    fechar()
  }

  function escolherTipoCustom(nome: string) {
    setAgendando(nome)
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title="Marcar etapa / agendar"
        style={{
          fontSize: 11,
          color: "var(--text-2, #ddd)",
          border: "0.5px solid rgba(255,255,255,0.15)",
          borderRadius: 8,
          padding: "6px 10px",
          whiteSpace: "nowrap",
        }}
      >
        🏷️ Etapa
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
              width: 300,
              zIndex: 20,
            }}
          >
            {agendando ? (
              <FormAgendar
                leadId={leadId}
                categoria={agendando}
                tituloInicial={`${agendando} com ${nomeContato}`}
                onVoltar={() => setAgendando(null)}
                onClose={fechar}
              />
            ) : (
              <MenuEtapas
                todasEtiquetas={todasEtiquetas}
                idsAtribuidas={idsAtribuidas}
                tiposCustom={tiposCustom}
                pending={pending}
                onEscolherEtapa={escolherEtapa}
                onEscolherTipoCustom={escolherTipoCustom}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MenuEtapas({
  todasEtiquetas,
  idsAtribuidas,
  tiposCustom,
  pending,
  onEscolherEtapa,
  onEscolherTipoCustom,
}: {
  todasEtiquetas: EtiquetaResumo[]
  idsAtribuidas: Set<string>
  tiposCustom: CrmTipoAtividadeRow[]
  pending: boolean
  onEscolherEtapa: (etapa: EtiquetaResumo) => void
  onEscolherTipoCustom: (nome: string) => void
}) {
  const [novoTipo, setNovoTipo] = useState("")
  const [criando, startCriar] = useTransition()
  const router = useRouter()

  function criarTipo() {
    const nome = novoTipo.trim()
    if (!nome) return
    startCriar(async () => {
      const fd = new FormData()
      fd.set("nome", nome)
      await criarTipoAtividadeAction(fd)
      setNovoTipo("")
      router.refresh()
    })
  }

  function excluirTipo(id: string) {
    startCriar(async () => {
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
        Marcar etapa do lead
      </p>
      <div
        className="flex flex-col gap-1 scrollbar-thin"
        style={{ maxHeight: 260, overflowY: "auto" }}
      >
        {todasEtiquetas.map((e) => {
          const atual = idsAtribuidas.has(e.id)
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onEscolherEtapa(e)}
              disabled={pending || atual}
              className="flex items-center gap-2"
              style={{
                fontSize: 13,
                fontWeight: atual ? 700 : 500,
                padding: "8px 10px",
                borderRadius: 9,
                textAlign: "left",
                background: atual ? `${e.cor}22` : "rgba(255,255,255,0.03)",
                border: atual ? `1px solid ${e.cor}66` : "1px solid transparent",
                color: atual ? e.cor : "var(--text-1, #fff)",
                opacity: pending ? 0.6 : 1,
                cursor: atual ? "default" : "pointer",
              }}
            >
              <span style={{ fontSize: 16 }}>{emojiDaEtapa(e.nome)}</span>
              <span style={{ flex: 1 }}>{e.nome}</span>
              {atual && <span style={{ fontSize: 10 }}>· atual</span>}
            </button>
          )
        })}
        {todasEtiquetas.length === 0 && (
          <p style={{ fontSize: 11, color: "var(--text-4)" }}>
            Nenhuma etapa ainda. Crie fases no Kanban.
          </p>
        )}
      </div>

      {tiposCustom.length > 0 && (
        <>
          <p
            style={{
              fontSize: 9,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "var(--text-4)",
              fontWeight: 500,
              margin: "10px 0 8px",
              borderTop: "0.5px solid rgba(255,255,255,0.08)",
              paddingTop: 10,
            }}
          >
            Tipos personalizados
          </p>
          <div className="flex flex-col gap-1">
            {tiposCustom.map((t) => (
              <div key={t.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEscolherTipoCustom(t.nome)}
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
                  disabled={criando}
                  title="Remover tipo"
                  style={{ fontSize: 13, color: "var(--text-4)", padding: "4px 6px" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

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
          disabled={criando || !novoTipo.trim()}
          className="btn-gold-filled"
          style={{ fontSize: 13, padding: "6px 10px" }}
        >
          ＋
        </button>
      </div>
    </div>
  )
}

/** Formulário de data — reaproveitado tanto pras etapas de agendamento
 *  quanto pros tipos personalizados. `categoria` decide a fase que
 *  criarFollowUpAction tenta aplicar ao lead (só move quando o nome bate com
 *  uma etapa existente — ver sincronizarLeadComEtapaDaCategoria). */
function FormAgendar({
  leadId,
  categoria,
  tituloInicial,
  onVoltar,
  onClose,
}: {
  leadId: string
  categoria: string
  tituloInicial: string
  onVoltar: () => void
  onClose: () => void
}) {
  const [titulo, setTitulo] = useState(tituloInicial)
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
        <span style={{ fontSize: 16 }}>{emojiDaEtapa(categoria)}</span>
        <p style={{ fontSize: 13, fontWeight: 600 }}>{categoria}</p>
      </div>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Detalhe (ex: com o nome do contato)"
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
