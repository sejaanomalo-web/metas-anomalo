"use client"

import { useRef, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { criarTarefaAction } from "@/lib/workspace-actions"
import type { Contexto } from "@/lib/workspace-tipos"

/**
 * Criação de tarefa — o fluxo mais usado do módulo.
 *
 * Botão em OURO (a cor de ação do sistema) que abre um campo só: o título.
 * Enter cria e ABRE O PAINEL da tarefa (?tarefa=<id>), que é onde moram
 * responsável, cliente, prazo, repetição, subtarefas e comentários. Assim
 * não existem dois formulários concorrentes para os mesmos campos — o
 * painel é sempre a fonte única de edição.
 *
 * IDEMPOTÊNCIA: o id da tarefa é gerado AQUI (crypto.randomUUID) e vai no
 * formulário. O insert no servidor é upsert com ignoreDuplicates, então duplo
 * clique, retry de rede ou reenvio do form não criam uma segunda tarefa. Um id
 * novo só é sorteado depois de um sucesso.
 */
export default function CriacaoRapida({
  contextos,
  contextoPadraoId,
  meuUsuarioId,
}: {
  /** Só usado pra pré-vincular o cliente quando a lista já está filtrada. */
  contextos: Contexto[]
  contextoPadraoId?: string
  meuUsuarioId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState("")
  const idRef = useRef<string>(novoId())
  const inputRef = useRef<HTMLInputElement>(null)

  const contextoPadrao = contextos.find((c) => c.id === contextoPadraoId)

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
      // Responsável fica VAZIO de propósito: atribuir dispara notificação,
      // e o dono da tarefa é escolhido no painel que abre em seguida.
      if (contextoPadraoId) fd.append("contexto_ids", contextoPadraoId)

      const r = await criarTarefaAction(fd)
      if (!r.ok || !r.id) {
        setErro(r.erro ?? "Não foi possível criar.")
        return
      }
      // Só depois do OK do servidor: limpa e sorteia um id NOVO. Se limpasse
      // antes, um erro de rede deixaria o usuário achando que salvou.
      idRef.current = novoId()
      setTitulo("")
      setAberto(false)
      // Abre o painel da tarefa recém-criada pra completar cliente,
      // responsável, prazo e o resto sem trocar de tela.
      const qs = new URLSearchParams(searchParams.toString())
      qs.set("tarefa", r.id)
      router.push(`${pathname}?${qs.toString()}`, { scroll: false })
      router.refresh()
    })
  }

  if (!aberto) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setAberto(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className="btn-gold-filled"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontSize: 12.5,
            fontWeight: 700,
            padding: "9px 18px",
            borderRadius: 9,
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Adicionar nova tarefa
        </button>
        {contextoPadrao && (
          <span style={{ fontSize: 11, color: "var(--text-4)" }}>
            será criada em <strong style={{ color: "var(--text-3)" }}>{contextoPadrao.nome}</strong>
          </span>
        )}
        {erro && <span style={{ fontSize: 11, color: "#e24b4a" }}>{erro}</span>}
      </div>
    )
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        padding: 10,
        borderRadius: 10,
        background: "var(--ws-cal-fundo, var(--surface-1))",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            salvar()
          }
          if (e.key === "Escape") {
            setTitulo("")
            setAberto(false)
          }
        }}
        placeholder="Nome da tarefa… (Enter abre os detalhes)"
        className="glass-input"
        style={{ flex: "1 1 260px", minWidth: 0, fontSize: 13, padding: "9px 12px", borderRadius: 9 }}
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
        {pending ? "Criando…" : "Criar e abrir"}
      </button>
      <button
        type="button"
        onClick={() => {
          setTitulo("")
          setAberto(false)
        }}
        className="no-ds"
        style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
      >
        Cancelar
      </button>
      {erro && <span style={{ fontSize: 11, color: "#e24b4a" }}>{erro}</span>}
    </div>
  )
}
