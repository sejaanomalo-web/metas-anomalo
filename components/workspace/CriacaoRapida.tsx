"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { criarTarefaAction } from "@/lib/workspace-actions"
import type { Contexto } from "@/lib/workspace-tipos"

/**
 * Criação rápida — o fluxo mais usado do módulo, por isso mora no topo da
 * lista e exige o mínimo: título, responsável, prazo e (opcional) contexto.
 * Descrição, subtarefas e comentários ficam para o detalhe.
 *
 * IDEMPOTÊNCIA: o id da tarefa é gerado AQUI (crypto.randomUUID) e vai no
 * formulário. O insert no servidor é upsert com ignoreDuplicates, então duplo
 * clique, retry de rede ou reenvio do form não criam uma segunda tarefa. Um id
 * novo só é sorteado depois de um sucesso.
 */
export default function CriacaoRapida({
  contextos,
  usuarios,
  contextoPadraoId,
  meuUsuarioId,
}: {
  contextos: Contexto[]
  usuarios: { id: string; nome: string }[]
  contextoPadraoId?: string
  meuUsuarioId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [expandido, setExpandido] = useState(false)
  const [titulo, setTitulo] = useState("")
  const [responsavelId, setResponsavelId] = useState(meuUsuarioId)
  const [prazoEm, setPrazoEm] = useState("")
  const [contextoId, setContextoId] = useState(contextoPadraoId ?? "")
  const idRef = useRef<string>(novoId())
  const inputRef = useRef<HTMLInputElement>(null)

  function novoId(): string {
    // randomUUID exige contexto seguro (https/localhost). O fallback cobre
    // ambientes sem ele — o servidor gera o id se este vier inválido.
    try {
      return crypto.randomUUID()
    } catch {
      return ""
    }
  }

  function salvar() {
    const t = titulo.trim()
    if (!t) {
      setErro("Informe um título.")
      inputRef.current?.focus()
      return
    }
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      if (idRef.current) fd.set("id", idRef.current)
      fd.set("titulo", t)
      if (responsavelId) fd.set("responsavel_id", responsavelId)
      if (prazoEm) fd.set("prazo_em", prazoEm)
      if (contextoId) fd.append("contexto_ids", contextoId)

      const r = await criarTarefaAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível criar.")
        return
      }
      // Só depois do OK do servidor: limpa e sorteia um id NOVO. Se limpasse
      // antes, um erro de rede deixaria o usuário achando que salvou.
      idRef.current = novoId()
      setTitulo("")
      setPrazoEm("")
      setExpandido(false)
      router.refresh()
      inputRef.current?.focus()
    })
  }

  return (
    <div className="glass" style={{ padding: 12, borderRadius: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={inputRef}
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onFocus={() => setExpandido(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              salvar()
            }
            if (e.key === "Escape") setExpandido(false)
          }}
          placeholder="Nova tarefa… (Enter para salvar)"
          className="glass-input"
          style={{ flex: "1 1 240px", minWidth: 0, fontSize: 13, padding: "9px 12px", borderRadius: 9 }}
          disabled={pending}
          maxLength={300}
        />
        <button
          type="button"
          onClick={salvar}
          disabled={pending || titulo.trim() === ""}
          className="btn-gold-filled"
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "9px 18px",
            borderRadius: 9,
            opacity: pending || titulo.trim() === "" ? 0.5 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          {pending ? "Salvando…" : "Adicionar"}
        </button>
      </div>

      {expandido && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 10,
            paddingTop: 10,
            borderTop: "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          <Campo rotulo="Responsável">
            <select
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
              className="glass-input"
              style={seletor}
              disabled={pending}
            >
              <option value="" style={{ color: "#111" }}>Sem responsável</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id} style={{ color: "#111" }}>
                  {u.nome}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Prazo">
            <input
              type="date"
              value={prazoEm}
              onChange={(e) => setPrazoEm(e.target.value)}
              className="glass-input"
              style={seletor}
              disabled={pending}
            />
          </Campo>

          <Campo rotulo="Contexto">
            <select
              value={contextoId}
              onChange={(e) => setContextoId(e.target.value)}
              className="glass-input"
              style={seletor}
              disabled={pending}
            >
              <option value="" style={{ color: "#111" }}>Nenhum</option>
              {contextos.map((c) => (
                <option key={c.id} value={c.id} style={{ color: "#111" }}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      )}

      {erro && (
        <p style={{ fontSize: 11, color: "#e24b4a", marginTop: 8 }}>{erro}</p>
      )}
    </div>
  )
}

const seletor = {
  fontSize: 12,
  padding: "7px 10px",
  borderRadius: 8,
  minWidth: 140,
} as const

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        style={{
          fontSize: 10,
          color: "var(--text-4)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {rotulo}
      </span>
      {children}
    </label>
  )
}
