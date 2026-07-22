"use client"

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  criarClienteWorkspaceAction,
  criarEmpresaWsAction,
  excluirClienteWorkspaceAction,
  excluirEmpresaWsAction,
  garantirContextoDoClienteAction,
  renomearEmpresaWsAction,
  reordenarContextosAction,
} from "@/lib/workspace-actions"
import { PALETA_ASANA, textoSobre } from "@/lib/workspace-cores"

export interface ItemCliente {
  /** Contexto já existente (área de trabalho pronta e reordenável). */
  contextoId: string | null
  /** Cliente do cadastro de tráfego ainda sem contexto (nasce no clique). */
  clienteId: string | null
  nome: string
  cor: string | null
  fotoUrl: string | null
  pendentes: number
  atrasadas: number
}

export interface GrupoEmpresa {
  empresa: string
  /** Contexto tipo 'empresa' que ancora o grupo (permite grupo vazio). */
  ancoraId: string | null
  itens: ItemCliente[]
}

const PREFIXO_GRUPO = "grupo:"

/**
 * Aba Clientes em LISTA vertical (um cliente por linha), com a alça de
 * arraste (⋮⋮) que o dia a dia pede: arrastar cliente pra cima/baixo dentro
 * do grupo, arrastar pra OUTRO grupo (muda a empresa), e arrastar o grupo
 * inteiro pela alça do cabeçalho. A ordem final persiste em
 * ws_contextos.ordem via reordenarContextosAction — otimista, com reversão.
 */
export default function ClientesPainel({
  grupos,
  empresas,
}: {
  grupos: GrupoEmpresa[]
  empresas: string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [criandoCliente, setCriandoCliente] = useState(false)
  const [criandoEmpresa, setCriandoEmpresa] = useState(false)

  // Estado otimista do arraste: ordem dos grupos + itens por grupo.
  const estadoServidor = useMemo(() => {
    const ordem = grupos.map((g) => g.empresa)
    const itens: Record<string, ItemCliente[]> = {}
    const ancoras: Record<string, string | null> = {}
    for (const g of grupos) {
      itens[g.empresa] = g.itens
      ancoras[g.empresa] = g.ancoraId
    }
    return { ordem, itens, ancoras }
  }, [grupos])

  const [ordemGrupos, setOrdemGrupos] = useState(estadoServidor.ordem)
  const [itensPorGrupo, setItensPorGrupo] = useState(estadoServidor.itens)
  useEffect(() => {
    setOrdemGrupos(estadoServidor.ordem)
    setItensPorGrupo(estadoServidor.itens)
  }, [estadoServidor])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function grupoDe(id: string): string | null {
    if (id.startsWith(PREFIXO_GRUPO)) return id.slice(PREFIXO_GRUPO.length)
    for (const [empresa, itens] of Object.entries(itensPorGrupo)) {
      if (itens.some((i) => i.contextoId === id)) return empresa
    }
    return null
  }

  /** Persiste a ordem atual inteira (âncoras + clientes, grupo a grupo). */
  function persistir(
    ordem: string[],
    itens: Record<string, ItemCliente[]>
  ) {
    const payload: { id: string; empresa?: string }[] = []
    for (const empresa of ordem) {
      const ancora = estadoServidor.ancoras[empresa]
      if (ancora) payload.push({ id: ancora })
      for (const item of itens[empresa] ?? []) {
        if (item.contextoId) payload.push({ id: item.contextoId, empresa })
      }
    }
    if (payload.length === 0) return
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("itens", JSON.stringify(payload))
      const r = await reordenarContextosAction(fd)
      if (!r.ok) {
        setOrdemGrupos(estadoServidor.ordem)
        setItensPorGrupo(estadoServidor.itens)
        setErro(r.erro ?? "Não foi possível reordenar.")
        return
      }
      router.refresh()
    })
  }

  function aoArrastarSobre(e: DragOverEvent) {
    const ativo = String(e.active.id)
    const sobre = e.over ? String(e.over.id) : null
    if (!sobre || ativo.startsWith(PREFIXO_GRUPO)) return
    const de = grupoDe(ativo)
    const para = grupoDe(sobre)
    if (!de || !para || de === para) return

    // Cliente atravessando de grupo: preview em tempo real.
    setItensPorGrupo((m) => {
      const item = m[de]?.find((i) => i.contextoId === ativo)
      if (!item) return m
      const origem = m[de].filter((i) => i.contextoId !== ativo)
      const destino = [...(m[para] ?? [])]
      const idx = destino.findIndex((i) => i.contextoId === sobre)
      if (idx >= 0) destino.splice(idx, 0, item)
      else destino.push(item)
      return { ...m, [de]: origem, [para]: destino }
    })
  }

  function aoSoltar(e: DragEndEvent) {
    const ativo = String(e.active.id)
    const sobre = e.over ? String(e.over.id) : null
    if (!sobre) return

    // ---- Grupo arrastado ----
    if (ativo.startsWith(PREFIXO_GRUPO)) {
      if (!sobre.startsWith(PREFIXO_GRUPO)) return
      const de = ativo.slice(PREFIXO_GRUPO.length)
      const para = sobre.slice(PREFIXO_GRUPO.length)
      if (de === para) return
      const nova = [...ordemGrupos]
      const deIdx = nova.indexOf(de)
      const paraIdx = nova.indexOf(para)
      if (deIdx === -1 || paraIdx === -1) return
      nova.splice(deIdx, 1)
      nova.splice(paraIdx, 0, de)
      setOrdemGrupos(nova)
      persistir(nova, itensPorGrupo)
      return
    }

    // ---- Cliente arrastado ----
    // Calcula o estado final a partir do snapshot ATUAL (o cross-grupo já
    // aconteceu no onDragOver), aplica e persiste o mesmo objeto — nada de
    // depender do timing do setState.
    const para = grupoDe(sobre)
    if (!para) return
    const lista = [...(itensPorGrupo[para] ?? [])]
    const deIdx = lista.findIndex((i) => i.contextoId === ativo)
    if (deIdx === -1) return
    let alvoIdx = sobre.startsWith(PREFIXO_GRUPO)
      ? lista.length - 1
      : lista.findIndex((i) => i.contextoId === sobre)
    if (alvoIdx === -1) alvoIdx = lista.length - 1
    const [item] = lista.splice(deIdx, 1)
    if (alvoIdx > deIdx) alvoIdx -= 1
    lista.splice(alvoIdx, 0, item)
    const itensFinais = { ...itensPorGrupo, [para]: lista }
    setItensPorGrupo(itensFinais)
    persistir(ordemGrupos, itensFinais)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setCriandoCliente((v) => !v)
            setCriandoEmpresa(false)
          }}
          className="no-ds"
          style={botaoPrimario}
        >
          <MaisIcone /> Adicionar cliente
        </button>
        <button
          type="button"
          onClick={() => {
            setCriandoEmpresa((v) => !v)
            setCriandoCliente(false)
          }}
          className="no-ds"
          style={{ ...botaoPrimario, background: "transparent", color: "var(--text-2)", border: "1px solid rgba(255,255,255,0.18)" }}
        >
          <MaisIcone /> Adicionar empresa
        </button>
        {pending && <span style={{ fontSize: 11, color: "var(--text-4)" }}>Salvando…</span>}
        {erro && <span style={{ fontSize: 11, color: "#e24b4a" }}>{erro}</span>}
      </div>

      {criandoCliente && (
        <NovoCliente empresas={empresas} aoFechar={() => setCriandoCliente(false)} />
      )}
      {criandoEmpresa && <NovaEmpresa aoFechar={() => setCriandoEmpresa(false)} />}

      {ordemGrupos.length === 0 && (
        <div
          className="glass"
          style={{ padding: "28px 16px", borderRadius: 12, textAlign: "center", fontSize: 12, color: "var(--text-4)" }}
        >
          Nenhum cliente ainda. Crie o primeiro no botão acima.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragOver={aoArrastarSobre}
        onDragEnd={aoSoltar}
      >
        <SortableContext
          items={ordemGrupos.map((g) => `${PREFIXO_GRUPO}${g}`)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ordemGrupos.map((empresa) => (
              <Grupo
                key={empresa}
                empresa={empresa}
                itens={itensPorGrupo[empresa] ?? []}
                // Só grupo com ÂNCORA (contexto tipo 'empresa') pode ser
                // excluído — os que vêm do cadastro de tráfego não têm linha
                // própria aqui, e o botão só frustraria.
                podeExcluir={Boolean(estadoServidor.ancoras[empresa])}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function MaisIcone() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

/** Alça de arraste (⋮⋮) — a "mãozinha" do pedido. Os listeners do dnd-kit
 *  vêm por spread; sem ref (o nó raiz sortable já está registrado). */
function Alca(props: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="Arrastar para reordenar"
      className="no-ds ws-alca"
      {...props}
    >
      <svg width="12" height="14" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
        <circle cx="2.5" cy="2.5" r="1.5" />
        <circle cx="7.5" cy="2.5" r="1.5" />
        <circle cx="2.5" cy="8" r="1.5" />
        <circle cx="7.5" cy="8" r="1.5" />
        <circle cx="2.5" cy="13.5" r="1.5" />
        <circle cx="7.5" cy="13.5" r="1.5" />
      </svg>
    </button>
  )
}

/* =================== Grupo (empresa) =================== */

function Grupo({
  empresa,
  itens,
  podeExcluir,
}: {
  empresa: string
  itens: ItemCliente[]
  podeExcluir: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(empresa)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `${PREFIXO_GRUPO}${empresa}` })

  function excluir() {
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("nome", empresa)
      const r = await excluirEmpresaWsAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível excluir.")
        setConfirmandoExcluir(false)
        return
      }
      router.refresh()
    })
  }

  function renomear() {
    const n = nome.trim()
    if (!n || n === empresa) {
      setEditando(false)
      return
    }
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("de", empresa)
      fd.set("para", n)
      const r = await renomearEmpresaWsAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível renomear.")
        return
      }
      setEditando(false)
      router.refresh()
    })
  }

  const idsOrdenaveis = itens.filter((i) => i.contextoId).map((i) => i.contextoId as string)

  return (
    <section
      ref={setNodeRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Alca {...listeners} />
        {editando ? (
          <input
            autoFocus
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={renomear}
            onKeyDown={(e) => {
              if (e.key === "Enter") renomear()
              if (e.key === "Escape") setEditando(false)
            }}
            maxLength={120}
            className="glass-input"
            style={{ fontSize: 13, fontWeight: 700, padding: "5px 9px", borderRadius: 6 }}
            disabled={pending}
          />
        ) : (
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>
            {empresa}
          </h2>
        )}
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          aria-label={`Renomear ${empresa}`}
          title="Renomear empresa (só no Workspace)"
          className="no-ds ws-btn-icone"
          style={{ width: 24, height: 24 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </button>
        {editando && podeExcluir &&
          (confirmandoExcluir ? (
            <>
              <button
                type="button"
                onClick={excluir}
                disabled={pending}
                className="no-ds"
                style={botaoExcluirGrupo}
              >
                Confirmar exclusão
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoExcluir(false)}
                className="no-ds"
                style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmandoExcluir(true)}
              disabled={pending}
              className="no-ds"
              style={botaoExcluirGrupo}
              title="Excluir empresa (só com o grupo vazio)"
            >
              Excluir
            </button>
          ))}
        <span style={{ fontSize: 10, color: "var(--text-4)" }}>{itens.length}</span>
        {erro && <span style={{ fontSize: 10, color: "#e24b4a" }}>{erro}</span>}
      </div>

      <SortableContext items={idsOrdenaveis} strategy={verticalListSortingStrategy}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 6 }}>
          {itens.map((item) =>
            item.contextoId ? (
              <LinhaCliente key={item.contextoId} item={item} />
            ) : (
              <LinhaClienteSemContexto key={item.clienteId ?? item.nome} item={item} />
            )
          )}
          {itens.length === 0 && (
            <p style={{ fontSize: 11, color: "var(--text-4)", margin: "2px 0 2px 24px" }}>
              Arraste clientes para cá ou crie um novo nesta empresa.
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

/* =================== Linhas de cliente =================== */

function ConteudoLinha({ item }: { item: ItemCliente }) {
  const corIcone = item.cor ?? "#6d6e6f"
  return (
    <>
      {item.fotoUrl ? (
        <img
          src={item.fotoUrl}
          alt=""
          width={26}
          height={26}
          style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: corIcone,
            color: textoSobre(corIcone),
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {item.nome.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-1)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          textAlign: "left",
        }}
      >
        {item.nome}
      </span>
      {item.atrasadas > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "rgba(226,75,74,0.16)", color: "#e24b4a", flexShrink: 0 }}>
          {item.atrasadas} atrasada{item.atrasadas === 1 ? "" : "s"}
        </span>
      )}
      {item.pendentes > 0 && (
        <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, background: "var(--surface-3)", color: "var(--text-3)", flexShrink: 0 }}>
          {item.pendentes} pendente{item.pendentes === 1 ? "" : "s"}
        </span>
      )}
    </>
  )
}

/** Linha com contexto: sortable, alça à esquerda, clique abre a área e
 *  lixeira à direita que só aparece no hover. */
function LinhaCliente({ item }: { item: ItemCliente }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.contextoId as string })

  function excluir() {
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", item.contextoId as string)
      const r = await excluirClienteWorkspaceAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível excluir.")
        setConfirmando(false)
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      ref={setNodeRef}
      className="ws-linha-wrap"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 5 : undefined,
      }}
      {...attributes}
    >
      <Alca {...listeners} />
      <button
        type="button"
        onClick={() => router.push(`/dashboard/workspace/c/${item.contextoId}`)}
        className="no-ds ws-linha-cliente"
      >
        <ConteudoLinha item={item} />
        {erro && <span style={{ fontSize: 10, color: "#e24b4a" }}>{erro}</span>}
      </button>

      {confirmando ? (
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
          <button type="button" onClick={excluir} disabled={pending} className="no-ds" style={botaoExcluirGrupo}>
            Confirmar
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="no-ds"
            style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
          >
            Cancelar
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={pending}
          aria-label={`Excluir ${item.nome}`}
          title="Excluir este cliente do Workspace (as tarefas continuam no banco)"
          className="no-ds ws-linha-lixeira"
        >
          <IconeLixeira />
        </button>
      )}
    </div>
  )
}

function IconeLixeira() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

/** Cliente do cadastro sem pasta ainda: sem alça (a ordem nasce com a pasta). */
function LinhaClienteSemContexto({ item }: { item: ItemCliente }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function abrir() {
    if (!item.clienteId) return
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("cliente_id", item.clienteId as string)
      const r = await garantirContextoDoClienteAction(fd)
      if (!r.ok || !r.id) {
        setErro(r.erro ?? "Não foi possível abrir.")
        return
      }
      router.push(`/dashboard/workspace/c/${r.id}`)
    })
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 22, flexShrink: 0 }} aria-hidden="true" />
      <button
        type="button"
        onClick={abrir}
        disabled={pending}
        className="no-ds ws-linha-cliente"
        style={{ opacity: pending ? 0.6 : 1, cursor: pending ? "wait" : "pointer" }}
      >
        <ConteudoLinha item={item} />
        {erro && <span style={{ fontSize: 10, color: "#e24b4a" }}>{erro}</span>}
      </button>
    </div>
  )
}

/* =================== Formulários =================== */

function NovaEmpresa({ aoFechar }: { aoFechar: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState("")

  function criar() {
    const n = nome.trim()
    if (!n) return
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("nome", n)
      const r = await criarEmpresaWsAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível criar.")
        return
      }
      aoFechar()
      router.refresh()
    })
  }

  return (
    <div className="glass" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 12, borderRadius: 10 }}>
      <input
        autoFocus
        type="text"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") criar()
          if (e.key === "Escape") aoFechar()
        }}
        placeholder="Nome da empresa (ex: ASSESSORIA NOVA)"
        maxLength={120}
        className="glass-input"
        style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, flex: "1 1 220px" }}
        disabled={pending}
      />
      <button
        type="button"
        onClick={criar}
        disabled={pending || !nome.trim()}
        className="no-ds"
        style={{ ...botaoPrimario, opacity: pending || !nome.trim() ? 0.5 : 1 }}
      >
        Criar empresa
      </button>
      <button type="button" onClick={aoFechar} className="no-ds" style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}>
        Cancelar
      </button>
      {erro && <span style={{ fontSize: 11, color: "#e24b4a" }}>{erro}</span>}
    </div>
  )
}

function NovoCliente({ empresas, aoFechar }: { empresas: string[]; aoFechar: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState("")
  const [empresa, setEmpresa] = useState("")
  const [cor, setCor] = useState("#cf9338")
  const [fotoBase64, setFotoBase64] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function escolherFoto(f: File | undefined) {
    if (!f) return
    if (f.size > 3 * 1024 * 1024) {
      setErro("Foto grande demais (máx. 3MB).")
      return
    }
    const leitor = new FileReader()
    leitor.onload = () => setFotoBase64(String(leitor.result))
    leitor.readAsDataURL(f)
  }

  function criar() {
    const n = nome.trim()
    if (!n) {
      setErro("Informe o nome do cliente.")
      return
    }
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("nome", n)
      fd.set("empresa_nome", empresa.trim())
      fd.set("cor", cor)
      if (fotoBase64) fd.set("foto_base64", fotoBase64)
      const r = await criarClienteWorkspaceAction(fd)
      if (!r.ok || !r.id) {
        setErro(r.erro ?? "Não foi possível criar.")
        return
      }
      router.push(`/dashboard/workspace/c/${r.id}`)
      router.refresh()
    })
  }

  return (
    <div className="glass" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={rotuloCampo}>
          Nome do cliente
          <input
            autoFocus
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criar()}
            maxLength={120}
            className="glass-input"
            style={inputCampo}
            disabled={pending}
          />
        </label>
        <label style={rotuloCampo}>
          Empresa
          <input
            type="text"
            list="ws-empresas"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            maxLength={120}
            placeholder="Escolha ou digite uma nova"
            className="glass-input"
            style={inputCampo}
            disabled={pending}
          />
          <datalist id="ws-empresas">
            {empresas.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </label>
      </div>

      <div>
        <span style={miniRotulo}>Cor da identidade visual</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 5 }}>
          {PALETA_ASANA.filter((c) => c.nome !== "Nenhuma").map((c) => (
            <button
              key={c.hex}
              type="button"
              aria-label={c.nome}
              title={c.nome}
              onClick={() => setCor(c.hex)}
              className="no-ds"
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: c.hex,
                border: cor === c.hex ? "2px solid #fff" : "2px solid transparent",
                cursor: "pointer",
              }}
            />
          ))}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>
            <input
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              style={{ width: 26, height: 26, border: "none", background: "none", padding: 0, cursor: "pointer" }}
            />
            {cor.toUpperCase()}
          </label>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={miniRotulo}>Foto de perfil (opcional)</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => escolherFoto(e.target.files?.[0])}
          style={{ display: "none" }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="no-ds" style={botaoSecundario}>
          {fotoBase64 ? "Trocar foto" : "Subir foto"}
        </button>
        {fotoBase64 && (
          <img src={fotoBase64} alt="Prévia" width={30} height={30} style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover" }} />
        )}
      </div>

      {erro && <p style={{ fontSize: 11, color: "#e24b4a", margin: 0 }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={criar}
          disabled={pending || !nome.trim()}
          className="no-ds"
          style={{ ...botaoPrimario, opacity: pending || !nome.trim() ? 0.5 : 1 }}
        >
          {pending ? "Criando…" : "Criar cliente e abrir workspace"}
        </button>
        <button type="button" onClick={aoFechar} className="no-ds" style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* =================== Estilos =================== */

const botaoExcluirGrupo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid rgba(226,75,74,0.4)",
  background: "transparent",
  color: "#e24b4a",
  cursor: "pointer",
}

const botaoPrimario: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 16px",
  borderRadius: 8,
  background: "#4573d2",
  color: "#fff",
  border: "none",
  cursor: "pointer",
}

const rotuloCampo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 10,
  color: "var(--text-4)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  flex: "1 1 200px",
}

const inputCampo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 10px",
  borderRadius: 8,
}

const miniRotulo: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-4)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
}

const botaoSecundario: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "var(--text-2)",
  cursor: "pointer",
}
