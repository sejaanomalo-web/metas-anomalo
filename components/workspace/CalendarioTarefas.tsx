"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { criarTarefaAction, moverPrazoAction } from "@/lib/workspace-actions"
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

/**
 * Calendário no desenho do Asana (pasta RefsAsana/): visão SEMANAL como
 * padrão — sete colunas DOM→SÁB, cartões-pill na cor do contexto, avatar de
 * quem faz, ✓ quando concluída e "+ Adicionar tarefa" no pé de cada coluna.
 * O zoom "Meses" mantém a grade mensal antiga, com os mesmos cartões.
 *
 * Continua sendo uma VISUALIZAÇÃO DERIVADA de prazo_em — arrastar um cartão
 * altera exatamente um campo (o prazo), de forma otimista e com reversão se
 * o Supabase recusar. Semana/mês/zoom vivem na URL: abrir e fechar o detalhe
 * de uma tarefa não perde a posição.
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
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarSemData, setMostrarSemData] = useState(false)
  // Sobrescreve o prazo enquanto o servidor não confirma (update otimista).
  const [otimista, setOtimista] = useState<Record<string, string | null>>({})

  const sensors = useSensors(
    // 6px de folga: sem isso, um clique pra abrir a tarefa viraria arraste.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

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

  // Navegação: semana anda de 7 em 7 dias; mês usa ano/mes.
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
  function irHoje() {
    navegar({ semana: null, ano: null, mes: null })
  }

  const dias = useMemo(() => diasDaSemana(semana), [semana])
  const celulasMes = useMemo(() => gradeDoMes(ano, mes), [ano, mes])

  return (
    <DndContext sensors={sensors} onDragEnd={aoSoltar}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* ---------- Barra de ferramentas (como a do Asana) ---------- */}
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
            onClick={irHoje}
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

          {/* Sem data (n) — igual ao "No date (2)" do topo do Asana */}
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
            Sem data ({bandeja.length})
          </button>

          {/* Zoom Semanas/Meses — o dropdown "Weeks | Months" do Asana */}
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
                    tarefas={porDia[iso] ?? []}
                    meuUsuarioId={meuUsuarioId}
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
                      tarefas={porDia[c.iso] ?? []}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Bandeja "Sem data" — painel lateral, origem e destino de arraste */}
          {mostrarSemData && <Bandeja tarefas={bandeja} />}
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
  tarefas,
  meuUsuarioId,
}: {
  iso: string
  rotuloDia: string
  ehHoje: boolean
  tarefas: TarefaComRelacoes[]
  meuUsuarioId: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: iso })
  const dia = Number(iso.slice(8, 10))

  return (
    <div
      ref={setNodeRef}
      className="ws-cal-coluna"
      style={{ outline: isOver ? "1.5px solid #4573d2" : "none", outlineOffset: -1 }}
    >
      <div style={{ padding: "8px 8px 4px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "var(--text-4)" }}>
          {rotuloDia}
        </div>
        <div style={{ marginTop: 4 }}>
          {/* Hoje = número em selo azul, igual ao Asana */}
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

      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 8px 10px", flex: 1 }}>
        {tarefas.map((t) => (
          <CartaoTarefa key={t.id} tarefa={t} />
        ))}
        <QuickAdd iso={iso} meuUsuarioId={meuUsuarioId} />
      </div>
    </div>
  )
}

/**
 * "+ Adicionar tarefa" no pé da coluna, como no Asana: vira um cartão-input
 * inline; Enter cria a tarefa já com o prazo daquele dia.
 */
function QuickAdd({ iso, meuUsuarioId }: { iso: string; meuUsuarioId: string }) {
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
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="no-ds ws-add-task"
      >
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
  const visiveis = expandido ? tarefas : tarefas.slice(0, MAX_POR_DIA_MES)
  const restantes = tarefas.length - visiveis.length

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
      {visiveis.map((t) => (
        <CartaoTarefa key={t.id} tarefa={t} compacto />
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

/* =================== Bandeja "Sem data" =================== */

function Bandeja({ tarefas }: { tarefas: TarefaComRelacoes[] }) {
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
        background: "var(--surface-1)",
      }}
    >
      <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", margin: "0 0 4px" }}>
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

/* =================== Cartão-pill (o coração visual do Asana) =================== */

function CartaoTarefa({
  tarefa,
  compacto,
}: {
  tarefa: TarefaComRelacoes
  compacto?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: tarefa.id,
  })
  const concluida = Boolean(tarefa.concluida_em)
  const cor = tarefa.contextos[0]?.cor ?? null
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
        opacity: isDragging ? 0.4 : 1,
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      {!compacto && <Avatar nome={tarefa.responsavel_nome} tamanho={18} />}
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
