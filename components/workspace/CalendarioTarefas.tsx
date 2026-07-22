"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  criarTarefaAction,
  moverTarefaCalendarioAction,
  reordenarDiaAction,
} from "@/lib/workspace-actions"
import { type TarefaComRelacoes } from "@/lib/workspace-tipos"
import { estiloCartao } from "@/lib/workspace-cores"
import Avatar from "./Avatar"
import {
  DIAS_SEMANA_CURTO,
  DIAS_SEMANA_LONGO,
  NOMES_MES,
  diasDaSemana,
  gradeDoMes,
  mesAnterior,
  mesSeguinte,
  rotuloMesDaSemana,
  somarDiasISO,
} from "@/lib/workspace-datas"

const BANDEJA = "sem-data"
const PREFIXO_DIA = "dia:"

/**
 * Calendário compartilhado no desenho do Asana. A visão semanal tem altura
 * FIXA (a página não cresce): cada coluna rola sozinha, então um dia com 100
 * tarefas continua navegável. Arrastar move entre dias E reordena dentro do
 * dia — a ordem final da coluna vai inteira pro servidor (reordenarDiaAction),
 * que renumera `ordem` de forma determinística.
 *
 * Continua uma VISUALIZAÇÃO DERIVADA de prazo_em/ordem — otimista, com
 * refresh do servidor confirmando (ou revertendo) cada gesto.
 */
export default function CalendarioTarefas({
  modo,
  semana,
  ano,
  mes,
  tarefas,
  semData,
  hoje,
  meuUsuarioId,
  contextoFixoId,
  modoCor = "colorido",
}: {
  modo: "semana" | "mes"
  /** Domingo da semana exibida (modo semana). */
  semana: string
  ano: number
  mes: number
  tarefas: TarefaComRelacoes[]
  semData: TarefaComRelacoes[]
  hoje: string
  meuUsuarioId: string
  /** Calendário de um cliente/aba: quick-add já vincula este contexto. */
  contextoFixoId?: string
  /** Preferência do usuário: 'mono' tira a cor dos cartões. */
  modoCor?: "colorido" | "mono"
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarSemData, setMostrarSemData] = useState(false)

  const sensors = useSensors(
    // 6px de folga: sem isso, um clique pra abrir a tarefa viraria arraste.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const porId = useMemo(() => {
    const m = new Map<string, TarefaComRelacoes>()
    for (const t of [...tarefas, ...semData]) m.set(t.id, t)
    return m
  }, [tarefas, semData])

  // Layout otimista: dia -> ids ordenados. Reconstrói quando o servidor manda
  // dados novos; durante o arraste é a única fonte da verdade visual.
  const layoutServidor = useMemo(() => {
    const mapa: Record<string, string[]> = { [BANDEJA]: [] }
    const ordenadas = [...tarefas].sort(
      (a, b) =>
        a.ordem - b.ordem ||
        (a.prazo_hora ?? "").localeCompare(b.prazo_hora ?? "") ||
        a.created_at.localeCompare(b.created_at)
    )
    for (const t of ordenadas) {
      if (!t.prazo_em) continue
      ;(mapa[t.prazo_em] ??= []).push(t.id)
    }
    for (const t of semData) mapa[BANDEJA].push(t.id)
    return mapa
  }, [tarefas, semData])

  const [layout, setLayout] = useState(layoutServidor)
  useEffect(() => setLayout(layoutServidor), [layoutServidor])

  function navegar(mudancas: Record<string, string | null>) {
    const qs = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null) qs.delete(k)
      else qs.set(k, v)
    }
    qs.delete("tarefa")
    const s = qs.toString()
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false })
  }
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /** Coluna (dia ISO ou BANDEJA) que contém o id — ou o próprio container. */
  function colunaDe(id: string): string | null {
    if (id === BANDEJA) return BANDEJA
    if (id.startsWith(PREFIXO_DIA)) return id.slice(PREFIXO_DIA.length)
    for (const [dia, ids] of Object.entries(layout)) {
      if (ids.includes(id)) return dia
    }
    return null
  }

  function aoArrastarSobre(e: DragOverEvent) {
    const ativo = String(e.active.id)
    const sobre = e.over ? String(e.over.id) : null
    if (!sobre) return
    const de = colunaDe(ativo)
    const para = colunaDe(sobre)
    if (!de || !para || de === para) return

    // Move o cartão pro novo dia em tempo real (preview suave do dnd-kit).
    setLayout((l) => {
      const origem = l[de]?.filter((x) => x !== ativo) ?? []
      const destino = [...(l[para] ?? [])]
      const idx = destino.indexOf(sobre)
      if (idx >= 0) destino.splice(idx, 0, ativo)
      else destino.push(ativo)
      return { ...l, [de]: origem, [para]: destino }
    })
  }

  function aoSoltar(e: DragEndEvent) {
    const ativo = String(e.active.id)
    const sobre = e.over ? String(e.over.id) : null
    if (!sobre) return

    const para = colunaDe(sobre)
    if (!para) return

    // Reordena dentro da coluna final (o cross-coluna já aconteceu no over).
    let idsFinais: string[] = []
    setLayout((l) => {
      const lista = [...(l[para] ?? [])]
      const deIdx = lista.indexOf(ativo)
      let alvoIdx = sobre.startsWith(PREFIXO_DIA) || sobre === BANDEJA
        ? lista.length - 1
        : lista.indexOf(sobre)
      if (deIdx === -1 || alvoIdx === -1) {
        idsFinais = lista
        return l
      }
      lista.splice(deIdx, 1)
      if (alvoIdx > deIdx) alvoIdx -= 1
      lista.splice(alvoIdx, 0, ativo)
      idsFinais = lista
      return { ...l, [para]: lista }
    })

    setErro(null)
    startTransition(async () => {
      let r: { ok: boolean; erro?: string }
      if (para === BANDEJA) {
        const fd = new FormData()
        fd.set("id", ativo)
        fd.set("prazo_em", "")
        r = await moverTarefaCalendarioAction(fd)
      } else {
        const fd = new FormData()
        fd.set("movida_id", ativo)
        fd.set("prazo_em", para)
        fd.set("ids", JSON.stringify(idsFinais.length ? idsFinais : [ativo]))
        r = await reordenarDiaAction(fd)
      }
      if (!r.ok) {
        setLayout(layoutServidor) // reverte o gesto inteiro
        setErro(r.erro ?? "Não foi possível mover a tarefa.")
        return
      }
      router.refresh()
    })
  }

  const ant = mesAnterior(ano, mes)
  const seg = mesSeguinte(ano, mes)
  const rotulo =
    modo === "semana" ? rotuloMesDaSemana(semana) : `${NOMES_MES[mes - 1]} ${ano}`

  function irAnterior() {
    if (modo === "semana") navegar({ semana: somarDiasISO(semana, -7) })
    else navegar({ ano: String(ant.ano), mes: String(ant.mes) })
  }
  function irSeguinte() {
    if (modo === "semana") navegar({ semana: somarDiasISO(semana, 7) })
    else navegar({ ano: String(seg.ano), mes: String(seg.mes) })
  }

  const dias = useMemo(() => diasDaSemana(semana), [semana])
  const celulasMes = useMemo(() => gradeDoMes(ano, mes), [ano, mes])
  const bandejaIds = layout[BANDEJA] ?? []

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragOver={aoArrastarSobre}
      onDragEnd={aoSoltar}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* ---------- Barra de ferramentas ---------- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "10px 0",
          }}
        >
          <button type="button" onClick={irAnterior} className="no-ds ws-btn-icone" aria-label="Anterior">
            <Seta dir="esq" />
          </button>
          <button
            type="button"
            onClick={() => navegar({ semana: null, ano: null, mes: null })}
            className="no-ds"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-2)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: 6,
            }}
          >
            Hoje
          </button>
          <button type="button" onClick={irSeguinte} className="no-ds ws-btn-icone" aria-label="Seguinte">
            <Seta dir="dir" />
          </button>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-2)" }}>{rotulo}</span>

          {pending && <span style={{ fontSize: 11, color: "var(--text-4)" }}>Salvando…</span>}
          {erro && <span style={{ fontSize: 11, color: "#e24b4a" }}>{erro}</span>}

          <span style={{ flex: 1 }} />

          <button
            type="button"
            onClick={() => setMostrarSemData((v) => !v)}
            className="no-ds"
            style={{
              fontSize: 13,
              color: mostrarSemData ? "var(--text-1)" : "var(--text-3)",
              background: mostrarSemData ? "var(--surface-3)" : "transparent",
              border: "none",
              borderRadius: 6,
              padding: "5px 10px",
              cursor: "pointer",
            }}
          >
            Sem data ({bandejaIds.length})
          </button>

          <select
            value={modo}
            onChange={(e) =>
              navegar({ zoom: e.target.value === "mes" ? "mes" : null })
            }
            className="glass-input"
            aria-label="Zoom do calendário"
            style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6 }}
          >
            <option value="semana" style={{ color: "#111" }}>Semanas</option>
            <option value="mes" style={{ color: "#111" }}>Meses</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {modo === "semana" ? (
              <div className="ws-cal-semana">
                {dias.map((iso, i) => (
                  <ColunaDia
                    key={iso}
                    iso={iso}
                    rotuloDia={DIAS_SEMANA_LONGO[i]}
                    ehHoje={iso === hoje}
                    ids={layout[iso] ?? []}
                    porId={porId}
                    modoCor={modoCor}
                    meuUsuarioId={meuUsuarioId}
                    contextoFixoId={contextoFixoId}
                  />
                ))}
              </div>
            ) : (
              <>
                <div className="ws-calendario-grade" style={{ marginBottom: 4 }}>
                  {DIAS_SEMANA_CURTO.map((d, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 10,
                        color: "var(--text-4)",
                        textAlign: "center",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        padding: "2px 0",
                      }}
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="ws-calendario-grade">
                  {celulasMes.map((c) => (
                    <DiaMes
                      key={c.iso}
                      iso={c.iso}
                      dia={c.dia}
                      doMes={c.doMes}
                      ehHoje={c.iso === hoje}
                      ids={layout[c.iso] ?? []}
                      porId={porId}
                      modoCor={modoCor}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {mostrarSemData && (
            <Bandeja ids={bandejaIds} porId={porId} modoCor={modoCor} />
          )}
        </div>
      </div>
    </DndContext>
  )
}

function Seta({ dir }: { dir: "esq" | "dir" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === "esq" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

/* =================== Visão semanal =================== */

function ColunaDia({
  iso,
  rotuloDia,
  ehHoje,
  ids,
  porId,
  modoCor,
  meuUsuarioId,
  contextoFixoId,
}: {
  iso: string
  rotuloDia: string
  ehHoje: boolean
  ids: string[]
  porId: Map<string, TarefaComRelacoes>
  modoCor: "colorido" | "mono"
  meuUsuarioId: string
  contextoFixoId?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${PREFIXO_DIA}${iso}` })
  const dia = Number(iso.slice(8, 10))

  return (
    <div
      ref={setNodeRef}
      className="ws-cal-coluna"
      style={{ outline: isOver ? "1.5px solid #4573d2" : "none", outlineOffset: -1 }}
    >
      <div className="ws-cal-cabecalho-dia">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "var(--text-4)" }}>
          {rotuloDia}
        </div>
        <div style={{ marginTop: 4 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 30,
              height: 30,
              padding: "0 4px",
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 600,
              background: ehHoje ? "#4573d2" : "transparent",
              color: ehHoje ? "#fff" : "var(--text-2)",
              marginLeft: -4,
            }}
          >
            {dia}
          </span>
        </div>
      </div>

      <div className="ws-cal-coluna-corpo">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const t = porId.get(id)
            return t ? <CartaoTarefa key={id} tarefa={t} modoCor={modoCor} /> : null
          })}
        </SortableContext>
        <QuickAdd iso={iso} meuUsuarioId={meuUsuarioId} contextoFixoId={contextoFixoId} />
      </div>
    </div>
  )
}

/**
 * "Adicionar tarefa" no pé da coluna — sempre visível, opacidade baixa como
 * pedido; vira um cartão-input inline e Enter cria já com o prazo do dia
 * (e no contexto do cliente, quando o calendário é de um cliente).
 */
function QuickAdd({
  iso,
  meuUsuarioId,
  contextoFixoId,
}: {
  iso: string
  meuUsuarioId: string
  contextoFixoId?: string
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState("")
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const idRef = useRef<string>(novoId())

  function novoId(): string {
    try {
      return crypto.randomUUID()
    } catch {
      return ""
    }
  }

  function salvar() {
    const t = titulo.trim()
    if (!t) {
      setAberto(false)
      return
    }
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      if (idRef.current) fd.set("id", idRef.current)
      fd.set("titulo", t)
      fd.set("prazo_em", iso)
      fd.set("responsavel_id", meuUsuarioId)
      if (contextoFixoId) fd.append("contexto_ids", contextoFixoId)
      const r = await criarTarefaAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível criar.")
        return
      }
      idRef.current = novoId()
      setTitulo("")
      router.refresh()
    })
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="no-ds ws-add-task">
        + Adicionar tarefa
      </button>
    )
  }

  return (
    <div
      style={{
        border: "1px solid #4573d2",
        borderRadius: 8,
        background: "var(--surface-1)",
        padding: "8px 10px",
        flexShrink: 0,
      }}
    >
      <textarea
        autoFocus
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            salvar()
          }
          if (e.key === "Escape") {
            setTitulo("")
            setAberto(false)
          }
        }}
        onBlur={() => {
          if (!titulo.trim()) setAberto(false)
          else salvar()
        }}
        rows={2}
        maxLength={300}
        disabled={pending}
        placeholder="Escreva um nome de tarefa"
        className="no-ds"
        style={{
          width: "100%",
          fontSize: 12,
          lineHeight: 1.35,
          color: "var(--text-1)",
          background: "transparent",
          border: "none",
          resize: "none",
          padding: 0,
          fontFamily: "inherit",
        }}
      />
      {erro && <p style={{ fontSize: 10, color: "#e24b4a", margin: "4px 0 0" }}>{erro}</p>}
    </div>
  )
}

/* =================== Visão mensal =================== */

const MAX_POR_DIA_MES = 3

function DiaMes({
  iso,
  dia,
  doMes,
  ehHoje,
  ids,
  porId,
  modoCor,
}: {
  iso: string
  dia: number
  doMes: boolean
  ehHoje: boolean
  ids: string[]
  porId: Map<string, TarefaComRelacoes>
  modoCor: "colorido" | "mono"
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${PREFIXO_DIA}${iso}` })
  const [expandido, setExpandido] = useState(false)
  const visiveis = expandido ? ids : ids.slice(0, MAX_POR_DIA_MES)
  const restantes = ids.length - visiveis.length

  return (
    <div
      ref={setNodeRef}
      className="ws-calendario-dia"
      style={{
        opacity: doMes ? 1 : 0.4,
        outline: isOver ? "1.5px solid #4573d2" : "none",
      }}
    >
      <span
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 20,
          height: 20,
          borderRadius: 6,
          fontSize: 10,
          fontWeight: ehHoje ? 700 : 500,
          background: ehHoje ? "#4573d2" : "transparent",
          color: ehHoje ? "#fff" : "var(--text-4)",
        }}
      >
        {dia}
      </span>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {visiveis.map((id) => {
          const t = porId.get(id)
          return t ? <CartaoTarefa key={id} tarefa={t} modoCor={modoCor} compacto /> : null
        })}
      </SortableContext>
      {restantes > 0 && (
        <button
          type="button"
          onClick={() => setExpandido(true)}
          className="no-ds"
          style={{
            fontSize: 9,
            color: "var(--text-4)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textAlign: "left",
          }}
        >
          +{restantes} mais
        </button>
      )}
    </div>
  )
}

/* =================== Bandeja "Sem data" =================== */

function Bandeja({
  ids,
  porId,
  modoCor,
}: {
  ids: string[]
  porId: Map<string, TarefaComRelacoes>
  modoCor: "colorido" | "mono"
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BANDEJA })
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: "0 0 240px",
        minWidth: 220,
        padding: 10,
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        outline: isOver ? "1.5px solid #4573d2" : "none",
        outlineOffset: -1,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "var(--ws-cal-fundo, var(--surface-1))",
        maxHeight: "70vh",
        overflowY: "auto",
      }}
    >
      <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", margin: "0 0 4px" }}>
        Sem data · {ids.length}
      </h3>
      {ids.length === 0 && (
        <p style={{ fontSize: 10, color: "var(--text-4)", margin: 0 }}>
          Arraste uma tarefa para cá para tirar o prazo.
        </p>
      )}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id) => {
          const t = porId.get(id)
          return t ? <CartaoTarefa key={id} tarefa={t} modoCor={modoCor} /> : null
        })}
      </SortableContext>
    </div>
  )
}

/* =================== Cartão-pill =================== */

function CartaoTarefa({
  tarefa,
  modoCor,
  compacto,
}: {
  tarefa: TarefaComRelacoes
  modoCor: "colorido" | "mono"
  compacto?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tarefa.id })
  const concluida = Boolean(tarefa.concluida_em)
  const cor = modoCor === "mono" ? null : tarefa.contextos[0]?.cor ?? null
  const estilo = estiloCartao(cor)

  function abrir() {
    const qs = new URLSearchParams(searchParams.toString())
    qs.set("tarefa", tarefa.id)
    router.push(`${pathname}?${qs.toString()}`, { scroll: false })
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={abrir}
      {...listeners}
      {...attributes}
      title={tarefa.titulo}
      className="no-ds ws-pill"
      style={{
        background: estilo.background,
        color: estilo.color,
        border: estilo.border,
        padding: compacto ? "3px 6px" : "6px 8px",
        cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.35 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        flexShrink: 0,
      }}
    >
      {!compacto && (
        <Avatar nome={tarefa.responsavel_nome} foto={tarefa.responsavel_foto} tamanho={18} />
      )}
      {concluida && (
        <svg
          width={compacto ? 10 : 12}
          height={compacto ? 10 : 12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-label="Concluída"
          style={{ flexShrink: 0, opacity: 0.9 }}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      <span className={compacto ? "ws-pill-titulo-1l" : "ws-pill-titulo"}>
        {tarefa.prazo_hora ? `${tarefa.prazo_hora.slice(0, 5)} ` : ""}
        {tarefa.titulo}
      </span>
    </button>
  )
}
