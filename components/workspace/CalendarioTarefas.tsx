"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { moverPrazoAction } from "@/lib/workspace-actions"
import { corDoContexto, type TarefaComRelacoes } from "@/lib/workspace-tipos"
import {
  DIAS_SEMANA_CURTO,
  NOMES_MES,
  gradeDoMes,
  mesAnterior,
  mesSeguinte,
} from "@/lib/workspace-datas"

const MAX_POR_DIA = 3
const BANDEJA = "sem-data"

/**
 * Calendário mensal. É uma VISUALIZAÇÃO DERIVADA de prazo_em — não existe
 * vínculo "tarefa ↔ calendário", nem cópia da tarefa. Arrastar um cartão
 * altera exatamente um campo: o prazo.
 *
 * O arraste é otimista e REVERTE se o Supabase recusar. Sem isso o cartão
 * ficaria no dia novo na tela e no dia velho no banco — o tipo de divergência
 * que faz perder confiança na ferramenta inteira.
 *
 * Mês e filtros vivem na URL, então abrir/fechar o detalhe da tarefa não
 * perde a posição.
 */
export default function CalendarioTarefas({
  ano,
  mes,
  tarefas,
  semData,
  hoje,
}: {
  ano: number
  mes: number
  tarefas: TarefaComRelacoes[]
  semData: TarefaComRelacoes[]
  hoje: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  // Sobrescreve o prazo enquanto o servidor não confirma (update otimista).
  const [otimista, setOtimista] = useState<Record<string, string | null>>({})

  const sensors = useSensors(
    // 6px de folga: sem isso, um clique pra abrir a tarefa viraria arraste.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const celulas = useMemo(() => gradeDoMes(ano, mes), [ano, mes])

  const { porDia, bandeja } = useMemo(() => {
    const mapa: Record<string, TarefaComRelacoes[]> = {}
    const semPrazo: TarefaComRelacoes[] = []
    const todas = [...tarefas, ...semData]
    for (const t of todas) {
      const prazo = t.id in otimista ? otimista[t.id] : t.prazo_em
      if (!prazo) {
        semPrazo.push(t)
        continue
      }
      ;(mapa[prazo] ??= []).push(t)
    }
    return { porDia: mapa, bandeja: semPrazo }
  }, [tarefas, semData, otimista])

  function urlMes(a: number, m: number): string {
    const qs = new URLSearchParams(searchParams.toString())
    qs.set("ano", String(a))
    qs.set("mes", String(m))
    qs.delete("tarefa")
    return `${pathname}?${qs.toString()}`
  }

  function aoSoltar(e: DragEndEvent) {
    const tarefaId = String(e.active.id)
    const destino = e.over ? String(e.over.id) : null
    if (!destino) return

    const novoPrazo = destino === BANDEJA ? null : destino
    const atual =
      tarefaId in otimista
        ? otimista[tarefaId]
        : [...tarefas, ...semData].find((t) => t.id === tarefaId)?.prazo_em ?? null
    if (atual === novoPrazo) return

    setErro(null)
    setOtimista((o) => ({ ...o, [tarefaId]: novoPrazo }))

    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", tarefaId)
      fd.set("prazo_em", novoPrazo ?? "")
      const r = await moverPrazoAction(fd)
      if (!r.ok) {
        // Reverte: remove a sobrescrita otimista e o cartão volta pro lugar.
        setOtimista((o) => {
          const copia = { ...o }
          delete copia[tarefaId]
          return copia
        })
        setErro(r.erro ?? "Não foi possível mover a tarefa.")
        return
      }
      router.refresh()
    })
  }

  const anterior = mesAnterior(ano, mes)
  const seguinte = mesSeguinte(ano, mes)

  return (
    <DndContext sensors={sensors} onDragEnd={aoSoltar}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Cabeçalho: navegação de mês */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href={urlMes(anterior.ano, anterior.mes)} scroll={false} style={botaoMes}>
            ‹
          </Link>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, minWidth: 160 }}>
            {NOMES_MES[mes - 1]} {ano}
          </h2>
          <Link href={urlMes(seguinte.ano, seguinte.mes)} scroll={false} style={botaoMes}>
            ›
          </Link>
          {pending && (
            <span style={{ fontSize: 11, color: "var(--text-4)" }}>Salvando…</span>
          )}
          {erro && <span style={{ fontSize: 11, color: "#e24b4a" }}>{erro}</span>}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Grade */}
          <div style={{ flex: "1 1 560px", minWidth: 0 }}>
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
              {celulas.map((c) => (
                <Dia
                  key={c.iso}
                  iso={c.iso}
                  dia={c.dia}
                  doMes={c.doMes}
                  ehHoje={c.iso === hoje}
                  tarefas={porDia[c.iso] ?? []}
                />
              ))}
            </div>
          </div>

          {/* Bandeja "Sem data" — origem e destino de arraste */}
          <Bandeja tarefas={bandeja} />
        </div>
      </div>
    </DndContext>
  )
}

const botaoMes = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: 8,
  background: "var(--surface-2)",
  color: "var(--text-2)",
  textDecoration: "none",
  fontSize: 16,
} as const

function Dia({
  iso,
  dia,
  doMes,
  ehHoje,
  tarefas,
}: {
  iso: string
  dia: number
  doMes: boolean
  ehHoje: boolean
  tarefas: TarefaComRelacoes[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: iso })
  const [expandido, setExpandido] = useState(false)
  const visiveis = expandido ? tarefas : tarefas.slice(0, MAX_POR_DIA)
  const restantes = tarefas.length - visiveis.length

  return (
    <div
      ref={setNodeRef}
      className="ws-calendario-dia"
      style={{
        opacity: doMes ? 1 : 0.4,
        outline: isOver ? "1.5px solid var(--accent)" : "none",
        background: ehHoje ? "rgba(201,149,58,0.07)" : undefined,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: ehHoje ? 700 : 500,
          color: ehHoje ? "var(--accent)" : "var(--text-4)",
        }}
      >
        {dia}
      </span>
      {visiveis.map((t) => (
        <CartaoTarefa key={t.id} tarefa={t} />
      ))}
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

function Bandeja({ tarefas }: { tarefas: TarefaComRelacoes[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: BANDEJA })
  return (
    <div
      ref={setNodeRef}
      className="glass"
      style={{
        flex: "0 1 240px",
        minWidth: 200,
        padding: 10,
        borderRadius: 10,
        outline: isOver ? "1.5px solid var(--accent)" : "none",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <h3 className="ds-label" style={{ fontSize: 10, color: "var(--text-3)", margin: "0 0 4px" }}>
        Sem data · {tarefas.length}
      </h3>
      {tarefas.length === 0 && (
        <p style={{ fontSize: 10, color: "var(--text-4)", margin: 0 }}>
          Arraste uma tarefa para cá para tirar o prazo.
        </p>
      )}
      {tarefas.map((t) => (
        <CartaoTarefa key={t.id} tarefa={t} />
      ))}
    </div>
  )
}

function CartaoTarefa({ tarefa }: { tarefa: TarefaComRelacoes }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: tarefa.id,
  })
  const concluida = Boolean(tarefa.concluida_em)
  const cor = tarefa.contextos[0] ? corDoContexto(tarefa.contextos[0]) : "var(--text-4)"

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
      className="no-ds"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        width: "100%",
        textAlign: "left",
        fontSize: 10,
        padding: "3px 5px",
        borderRadius: 5,
        background: "var(--surface-3)",
        border: "none",
        color: concluida ? "var(--text-4)" : "var(--text-2)",
        textDecoration: concluida ? "line-through" : "none",
        cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.4 : 1,
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        zIndex: isDragging ? 10 : undefined,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 5, height: 5, borderRadius: 999, background: cor, flexShrink: 0 }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {tarefa.prazo_hora ? `${tarefa.prazo_hora.slice(0, 5)} ` : ""}
        {tarefa.titulo}
      </span>
    </button>
  )
}
