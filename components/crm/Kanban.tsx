"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { CrmEtapaRow } from "@/lib/crm-etapas"
import type { CrmLeadRow } from "@/lib/crm-leads"
import {
  moverLeadAction,
  criarEtapaAction,
  excluirEtapaAction,
} from "@/lib/crm-kanban-actions"
import { CORES_ETIQUETA } from "@/lib/crm-cores"
import Avatar from "@/components/crm/Avatar"
import { EtiquetaChip } from "@/components/crm/Etiquetas"

// Passo de espaçamento pra inserção por ponto médio (ordem_na_etapa foi
// desenhada assim no schema pra não precisar renumerar a coluna inteira a
// cada arrasto).
const GAP_ORDEM = 1000
const SEM_ETAPA = "__sem_etapa__"

function calcularNovaOrdem(leadsColuna: CrmLeadRow[], leadIdMovido: string): number {
  const idx = leadsColuna.findIndex((l) => l.id === leadIdMovido)
  const antes = idx > 0 ? leadsColuna[idx - 1].ordem_na_etapa : undefined
  const depois =
    idx >= 0 && idx < leadsColuna.length - 1
      ? leadsColuna[idx + 1].ordem_na_etapa
      : undefined
  if (antes === undefined && depois === undefined) return GAP_ORDEM
  if (antes === undefined) return (depois as number) - GAP_ORDEM
  if (depois === undefined) return antes + GAP_ORDEM
  return (antes + depois) / 2
}

function agrupar(
  etapas: CrmEtapaRow[],
  leads: CrmLeadRow[]
): Record<string, CrmLeadRow[]> {
  const map: Record<string, CrmLeadRow[]> = {}
  for (const et of etapas) map[et.id] = []
  for (const lead of leads) {
    const chave = lead.etapa_id ?? SEM_ETAPA
    if (!map[chave]) map[chave] = []
    map[chave].push(lead)
  }
  for (const key of Object.keys(map)) {
    map[key] = [...map[key]].sort((a, b) => a.ordem_na_etapa - b.ordem_na_etapa)
  }
  return map
}

function encontrarColuna(
  id: string,
  colunas: Record<string, CrmLeadRow[]>
): string | null {
  if (colunas[id]) return id
  for (const [etapaId, leadsDaColuna] of Object.entries(colunas)) {
    if (leadsDaColuna.some((l) => l.id === id)) return etapaId
  }
  return null
}

export default function Kanban({
  etapas,
  leads,
  corPorEmpresa,
}: {
  etapas: CrmEtapaRow[]
  leads: CrmLeadRow[]
  corPorEmpresa: Record<string, string>
}) {
  const router = useRouter()
  const [colunas, setColunas] = useState<Record<string, CrmLeadRow[]>>(() =>
    agrupar(etapas, leads)
  )
  const [ativoId, setAtivoId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Ressincroniza quando o servidor manda leads/etapas atualizados
  // (router.refresh() após qualquer ação).
  useEffect(() => {
    setColunas(agrupar(etapas, leads))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapas, leads])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function handleDragStart(e: DragStartEvent) {
    setAtivoId(String(e.active.id))
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return
    const colunaAtiva = encontrarColuna(String(active.id), colunas)
    const colunaSobre = encontrarColuna(String(over.id), colunas)
    if (!colunaAtiva || !colunaSobre || colunaAtiva === colunaSobre) return

    setColunas((prev) => {
      const origem = [...prev[colunaAtiva]]
      const destino = [...prev[colunaSobre]]
      const idxOrigem = origem.findIndex((l) => l.id === active.id)
      if (idxOrigem === -1) return prev
      const [movido] = origem.splice(idxOrigem, 1)
      const idxDestino = destino.findIndex((l) => l.id === over.id)
      const posicao = idxDestino === -1 ? destino.length : idxDestino
      destino.splice(posicao, 0, movido)
      return { ...prev, [colunaAtiva]: origem, [colunaSobre]: destino }
    })
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setAtivoId(null)
    if (!over) return

    const colunaFinal = encontrarColuna(String(over.id), colunas)
    if (!colunaFinal) return

    let listaFinal: CrmLeadRow[] = []
    setColunas((prev) => {
      const lista = [...prev[colunaFinal]]
      const idxAtivo = lista.findIndex((l) => l.id === active.id)
      const idxOver = lista.findIndex((l) => l.id === over.id)
      const novaLista =
        idxAtivo !== -1 && idxOver !== -1 && idxAtivo !== idxOver
          ? arrayMove(lista, idxAtivo, idxOver)
          : lista
      listaFinal = novaLista
      return { ...prev, [colunaFinal]: novaLista }
    })

    const novaOrdem = calcularNovaOrdem(listaFinal, String(active.id))
    startTransition(() => {
      const fd = new FormData()
      fd.set("lead_id", String(active.id))
      fd.set("etapa_id", colunaFinal)
      fd.set("nova_ordem", String(novaOrdem))
      moverLeadAction(fd).then(() => router.refresh())
    })
  }

  const leadAtivo = ativoId
    ? Object.values(colunas)
        .flat()
        .find((l) => l.id === ativoId)
    : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-3 overflow-x-auto scrollbar-thin"
        style={{ height: "100%", paddingBottom: 8 }}
      >
        {etapas.map((etapa) => (
          <Coluna
            key={etapa.id}
            etapa={etapa}
            leads={colunas[etapa.id] ?? []}
            corPorEmpresa={corPorEmpresa}
          />
        ))}
        <NovaColuna />
      </div>
      <DragOverlay>
        {leadAtivo && (
          <Cartao
            lead={leadAtivo}
            cor={corPorEmpresa[leadAtivo.empresa_slug] ?? "#C9953A"}
            arrastando
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}

function Coluna({
  etapa,
  leads,
  corPorEmpresa,
}: {
  etapa: CrmEtapaRow
  leads: CrmLeadRow[]
  corPorEmpresa: Record<string, string>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  const [pending, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  const router = useRouter()

  function pedirExclusao() {
    if (!confirmando) {
      setConfirmando(true)
      setTimeout(() => setConfirmando(false), 3000)
      return
    }
    setConfirmando(false)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", etapa.id)
      await excluirEtapaAction(fd)
      router.refresh()
    })
  }

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col"
      style={{
        width: 280,
        flexShrink: 0,
        height: "100%",
        background: isOver ? "rgba(201,149,58,0.06)" : "transparent",
        borderRadius: 10,
        padding: 8,
        border: etapa.propria
          ? "0.5px dashed rgba(201,149,58,0.3)"
          : "0.5px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-between px-1 mb-2" style={{ flexShrink: 0 }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: etapa.cor || "var(--text-4)",
              flexShrink: 0,
            }}
          />
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: etapa.cor || "var(--text-2, #ddd)",
            }}
            className="truncate"
          >
            {etapa.nome}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span style={{ fontSize: 11, color: "var(--text-4)" }}>{leads.length}</span>
          {etapa.propria && (
            <button
              type="button"
              onClick={pedirExclusao}
              disabled={pending}
              title={confirmando ? "Clique de novo pra confirmar" : "Excluir etapa"}
              style={{
                fontSize: confirmando ? 9 : 12,
                fontWeight: confirmando ? 600 : 400,
                color: confirmando ? "var(--danger)" : "var(--text-4)",
                whiteSpace: "nowrap",
              }}
            >
              {confirmando ? "confirmar ×" : "×"}
            </button>
          )}
        </div>
      </div>
      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        {/* Ocupa a altura restante da coluna (agora que o Kanban tem a tela
            inteira pra ele) e rola por dentro quando tem muitos leads. */}
        <div
          className="space-y-2 scrollbar-thin"
          style={{ flex: 1, minHeight: 40, overflowY: "auto", paddingRight: 2 }}
        >
          {leads.map((lead) => (
            <CartaoArrastavel
              key={lead.id}
              lead={lead}
              cor={corPorEmpresa[lead.empresa_slug] ?? "#C9953A"}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

/** Coluna especial no fim da lista: "+ Nova etapa" — abre um form inline pra
 *  criar uma etapa custom do usuário (nome + cor). */
function NovaColuna() {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState("")
  const [cor, setCor] = useState(CORES_ETIQUETA[0])
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function criar() {
    const n = nome.trim()
    if (!n) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set("nome", n)
      fd.set("cor", cor)
      await criarEtapaAction(fd)
      setNome("")
      setAberto(false)
      router.refresh()
    })
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        style={{
          width: 200,
          flexShrink: 0,
          height: 40,
          alignSelf: "flex-start",
          fontSize: 12,
          color: "var(--text-3)",
          border: "1px dashed rgba(255,255,255,0.15)",
          borderRadius: 10,
        }}
      >
        ＋ Nova etapa
      </button>
    )
  }

  return (
    <div
      className="glass"
      style={{ width: 220, flexShrink: 0, padding: 10, alignSelf: "flex-start" }}
    >
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            criar()
          } else if (e.key === "Escape") {
            setAberto(false)
          }
        }}
        placeholder="Nome da etapa..."
        maxLength={60}
        autoFocus
        className="glass-input"
        style={{ fontSize: 12, padding: "6px 8px", width: "100%" }}
      />
      <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 8 }}>
        {CORES_ETIQUETA.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCor(c)}
            aria-label={`Cor ${c}`}
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: c,
              border:
                c.toLowerCase() === cor.toLowerCase()
                  ? "2px solid #fff"
                  : "1px solid rgba(255,255,255,0.25)",
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={criar}
          disabled={pending || !nome.trim()}
          className="btn-gold-filled"
          style={{ fontSize: 11, padding: "5px 10px" }}
        >
          {pending ? "Criando..." : "Criar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          style={{ fontSize: 11, color: "var(--text-3)" }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function CartaoArrastavel({ lead, cor }: { lead: CrmLeadRow; cor: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lead.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Cartao lead={lead} cor={cor} />
    </div>
  )
}

function Cartao({
  lead,
  cor,
  arrastando,
}: {
  lead: CrmLeadRow
  cor: string
  arrastando?: boolean
}) {
  const nomeExibido = lead.nome || lead.telefone_e164 || "Lead sem nome"
  return (
    <Link
      href={`/dashboard/crm?view=conversas&lead=${lead.id}`}
      className="block"
      style={{
        background: "var(--surface-2, rgba(255,255,255,0.04))",
        border: `1px solid ${cor}33`,
        borderLeft: `3px solid ${cor}`,
        borderRadius: 8,
        padding: 10,
        cursor: arrastando ? "grabbing" : "grab",
        boxShadow: arrastando ? "0 8px 24px rgba(0,0,0,0.4)" : "none",
      }}
    >
      <div className="flex items-center gap-2">
        <Avatar nome={nomeExibido} cor={cor} fotoUrl={lead.foto_url} size={26} />
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 12, fontWeight: 500 }} className="truncate">
            {nomeExibido}
          </p>
          <p style={{ fontSize: 10, color: cor }} className="truncate">
            {lead.empresa_nome}
          </p>
        </div>
      </div>
      {lead.etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {lead.etiquetas.map((e) => (
            <EtiquetaChip key={e.id} nome={e.nome} cor={e.cor} />
          ))}
        </div>
      )}
    </Link>
  )
}
