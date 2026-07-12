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
  editarEtapaAction,
  moverEtapaAction,
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
        className="flex gap-4 overflow-x-auto scrollbar-thin"
        style={{ height: "100%", paddingBottom: 8 }}
      >
        {etapas.map((etapa, index) => (
          <Coluna
            key={etapa.id}
            etapa={etapa}
            leads={colunas[etapa.id] ?? []}
            corPorEmpresa={corPorEmpresa}
            isFirst={index === 0}
            isLast={index === etapas.length - 1}
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
  isFirst,
  isLast,
}: {
  etapa: CrmEtapaRow
  leads: CrmLeadRow[]
  corPorEmpresa: Record<string, string>
  isFirst: boolean
  isLast: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  const corEtapa = etapa.cor || "#8e7cc3"

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col"
      style={{
        width: 280,
        flexShrink: 0,
        height: "100%",
        background: isOver ? `${corEtapa}1a` : "rgba(255,255,255,0.015)",
        borderRadius: 12,
        border: etapa.propria
          ? "0.5px dashed rgba(201,149,58,0.35)"
          : `1px solid ${corEtapa}33`,
        overflow: "hidden",
        transition: "background 0.15s ease",
      }}
    >
      {/* Faixa de topo com o fundo tingido na cor da etapa — separa
          visualmente o cabeçalho (nome da fase) da área de cards, pra bater
          o olho e entender o fluxo do funil sem precisar ler cada coluna. */}
      <div
        className="flex items-center justify-between"
        style={{
          flexShrink: 0,
          padding: "10px 12px",
          background: `${corEtapa}26`,
          borderBottom: `1px solid ${corEtapa}4d`,
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: corEtapa,
              flexShrink: 0,
            }}
          />
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: corEtapa,
              letterSpacing: "0.01em",
            }}
            className="truncate"
          >
            {etapa.nome}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span style={{ fontSize: 11, color: "var(--text-4)" }}>{leads.length}</span>
          <MenuEtapa etapa={etapa} isFirst={isFirst} isLast={isLast} />
        </div>
      </div>
      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        {/* Ocupa a altura restante da coluna (agora que o Kanban tem a tela
            inteira pra ele) e rola por dentro quando tem muitos leads. */}
        <div
          className="space-y-2 scrollbar-thin"
          style={{ flex: 1, minHeight: 40, overflowY: "auto", padding: 8 }}
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

/** Menu (⋮) do cabeçalho de cada coluna — editar nome/cor, mover pra
 *  esquerda/direita (reordena o Kanban) e excluir a fase. Vale pra QUALQUER
 *  etapa, inclusive as padrão (Novo/Em conversa/Qualificado/...): excluir ou
 *  editar uma etapa padrão afeta todo mundo que usa o CRM, não só quem
 *  criou (elas não têm dono). */
function MenuEtapa({
  etapa,
  isFirst,
  isLast,
}: {
  etapa: CrmEtapaRow
  isFirst: boolean
  isLast: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [nome, setNome] = useState(etapa.nome)
  const [cor, setCor] = useState(etapa.cor || CORES_ETIQUETA[0])
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function fechar() {
    setAberto(false)
    setEditando(false)
    setConfirmando(false)
    setErro(null)
  }

  // Ressincroniza nome/cor a partir das props no momento de abrir o form —
  // não em fechar(): logo após salvar, fechar() roda antes do
  // router.refresh() terminar, então a prop `etapa` ainda é a versão velha;
  // resetar por ali deixaria o form com o nome antigo numa próxima abertura.
  // Também desarma a exclusão e limpa erro de uma tentativa anterior — senão
  // "Excluir" fica armado (1 clique = exclui) ou o form reabre mostrando um
  // erro de outra edição já abandonada.
  function abrirEdicao() {
    setNome(etapa.nome)
    setCor(etapa.cor || CORES_ETIQUETA[0])
    setConfirmando(false)
    setErro(null)
    setEditando(true)
  }

  function mover(direcao: "esquerda" | "direita") {
    setConfirmando(false)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", etapa.id)
      fd.set("direcao", direcao)
      await moverEtapaAction(fd)
      router.refresh()
    })
  }

  function salvarEdicao() {
    const n = nome.trim()
    if (!n) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", etapa.id)
      fd.set("nome", n)
      fd.set("cor", cor)
      const r = await editarEtapaAction(fd)
      if (r.ok) {
        fechar()
        router.refresh()
      } else {
        setErro(r.erro ?? "Erro ao salvar")
      }
    })
  }

  function excluir() {
    if (!confirmando) {
      setConfirmando(true)
      setTimeout(() => setConfirmando(false), 3000)
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", etapa.id)
      await excluirEtapaAction(fd)
      fechar()
      router.refresh()
    })
  }

  // Alterna abrir/fechar pelo próprio botão ⋮ — fechar por AQUI (em vez de
  // só alternar `aberto`) importa pro caso de teclado (Tab + Enter/Espaço no
  // botão): esse clique não passa pela hit-test do overlay de fundo, então é
  // o único jeito de fechar que não passava por fechar() e podia deixar
  // editando/confirmando/erro "presos" pra próxima abertura.
  function alternar() {
    if (aberto) fechar()
    else setAberto(true)
  }

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={alternar}
        title="Opções da etapa"
        style={{ fontSize: 14, color: "var(--text-4)", padding: "2px 4px", lineHeight: 1 }}
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
              padding: 10,
              width: 200,
              zIndex: 20,
            }}
          >
            {editando ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      salvarEdicao()
                    } else if (e.key === "Escape") {
                      fechar()
                    }
                  }}
                  placeholder="Nome da etapa..."
                  maxLength={60}
                  autoFocus
                  className="glass-input"
                  style={{ fontSize: 12, padding: "6px 8px", width: "100%" }}
                />
                <div className="flex items-center gap-1.5 flex-wrap">
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
                {erro && <p style={{ fontSize: 10, color: "var(--danger)" }}>{erro}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={salvarEdicao}
                    disabled={pending || !nome.trim()}
                    className="btn-gold-filled"
                    style={{ fontSize: 11, padding: "5px 10px" }}
                  >
                    {pending ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(false)}
                    style={{ fontSize: 11, color: "var(--text-3)" }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: 2 }}>
                <BotaoMenu label="Editar nome" onClick={abrirEdicao} />
                <BotaoMenu
                  label="← Mover pra esquerda"
                  onClick={() => mover("esquerda")}
                  disabled={isFirst || pending}
                />
                <BotaoMenu
                  label="Mover pra direita →"
                  onClick={() => mover("direita")}
                  disabled={isLast || pending}
                />
                <BotaoMenu
                  label={confirmando ? "Confirmar exclusão?" : "Excluir fase"}
                  onClick={excluir}
                  disabled={pending}
                  perigo
                />
                {!etapa.propria && (
                  <p style={{ fontSize: 9, color: "var(--text-4)", padding: "4px 8px 0" }}>
                    Etapa compartilhada — afeta todos os usuários.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BotaoMenu({
  label,
  onClick,
  disabled,
  perigo,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  perigo?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 12,
        textAlign: "left",
        padding: "6px 8px",
        borderRadius: 6,
        color: perigo ? "var(--danger)" : "var(--text-2, #ddd)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
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
    // Sem isso, o touch-scroll nativo da coluna disputa com o dnd-kit no
    // celular (o toque tenta rolar E arrastar ao mesmo tempo) — trava o
    // gesto de rolar a coluna.
    touchAction: "none" as const,
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
