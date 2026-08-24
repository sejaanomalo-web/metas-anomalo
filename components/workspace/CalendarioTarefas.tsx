"use client"

import { forwardRef, useEffect, useMemo, useRef, useState, useTransition } from "react"
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
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useFlipReorder } from "@/lib/useFlipReorder"
import {
  alternarConclusaoAction,
  criarTarefaAction,
  reordenarDiaAction,
} from "@/lib/workspace-actions"
import { type TarefaComRelacoes } from "@/lib/workspace-tipos"
import { corDaTarefa, estiloCartao } from "@/lib/workspace-cores"
import Avatares from "./Avatares"
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
type LayoutCalendario = Record<string, string[]>

function copiarLayout(layout: LayoutCalendario): LayoutCalendario {
  return Object.fromEntries(
    Object.entries(layout).map(([coluna, ids]) => [coluna, [...ids]])
  )
}

function colunaNoLayout(layout: LayoutCalendario, id: string): string | null {
  if (id === BANDEJA) return BANDEJA
  if (id.startsWith(PREFIXO_DIA)) return id.slice(PREFIXO_DIA.length)
  for (const [coluna, ids] of Object.entries(layout)) {
    if (ids.includes(id)) return coluna
  }
  return null
}

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
  busca = "",
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
  /** Pesquisa livre (?q=): filtra por título, data, cliente e responsável. */
  busca?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // Transição de navegação separada: trocar de semana/mês mantém a grade
  // atual na tela (sem flash de skeleton) até o servidor responder.
  const [navPending, startNav] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarSemData, setMostrarSemData] = useState(false)
  // Conclusão otimista: o cartão desce pro fim da coluna no clique, sem
  // esperar o servidor. Some quando os dados novos chegam (efeito abaixo).
  const [concluidasOtim, setConcluidasOtim] = useState<Record<string, boolean>>({})
  // Durante o arraste quem posiciona é o dnd-kit — o FLIP fica desligado
  // pra as duas animações não brigarem pelo mesmo transform.
  const [arrastando, setArrastando] = useState(false)

  const sensors = useSensors(
    // 6px de folga: sem isso, um clique pra abrir a tarefa viraria arraste.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  // No celular a grade rola na horizontal e cabe UM dia por vez — abrir a
  // semana mostrando domingo obrigaria a arrastar até hoje toda vez. Aqui a
  // coluna de hoje já entra centralizada. No desktop os 7 dias cabem juntos,
  // então não há o que rolar e o efeito não faz nada.
  const gradeRef = useRef<HTMLDivElement>(null)
  const colunaHojeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const grade = gradeRef.current
    const coluna = colunaHojeRef.current
    if (!grade || !coluna) return
    if (grade.scrollWidth <= grade.clientWidth) return // desktop: cabe tudo
    grade.scrollLeft =
      coluna.offsetLeft - (grade.clientWidth - coluna.clientWidth) / 2
  }, [semana, modo])

  // Pesquisa geral: título, descrição, data (ISO e DD/MM), cliente/contexto
  // e responsável — tudo client-side sobre o período já carregado.
  const [tarefasVisiveis, semDataVisiveis] = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return [tarefas, semData] as const
    const bate = (t: TarefaComRelacoes) => {
      if (t.titulo.toLowerCase().includes(q)) return true
      if (t.descricao?.toLowerCase().includes(q)) return true
      // Busca em TODOS os responsáveis: procurar por alguém que é o segundo
      // responsável tem que achar a tarefa igual.
      if (t.responsaveis.some((r) => r.nome.toLowerCase().includes(q))) return true
      if (t.contextos.some((c) => c.nome.toLowerCase().includes(q))) return true
      if (t.prazo_em) {
        const [a, m, d] = t.prazo_em.split("-")
        if (t.prazo_em.includes(q) || `${d}/${m}`.includes(q) || `${d}/${m}/${a}`.includes(q)) {
          return true
        }
      }
      return false
    }
    return [tarefas.filter(bate), semData.filter(bate)] as const
  }, [tarefas, semData, busca])

  const porId = useMemo(() => {
    const m = new Map<string, TarefaComRelacoes>()
    for (const t of [...tarefasVisiveis, ...semDataVisiveis]) m.set(t.id, t)
    return m
  }, [tarefasVisiveis, semDataVisiveis])

  // Layout otimista: dia -> ids ordenados. Reconstrói quando o servidor manda
  // dados novos; durante o arraste é a única fonte da verdade visual.
  const layoutServidor = useMemo(() => {
    const mapa: Record<string, string[]> = { [BANDEJA]: [] }
    const ordenadas = [...tarefasVisiveis].sort(
      (a, b) =>
        // CONCLUÍDA VAI PRO FIM da coluna: some da área de trabalho ativa sem
        // sair da tela (fica apagada lá embaixo). Só depois vale a ordem
        // manual — dentro de cada bloco a organização do time é respeitada.
        Number(Boolean(a.concluida_em)) - Number(Boolean(b.concluida_em)) ||
        a.ordem - b.ordem ||
        (a.prazo_hora ?? "").localeCompare(b.prazo_hora ?? "") ||
        a.created_at.localeCompare(b.created_at)
    )
    for (const t of ordenadas) {
      if (!t.prazo_em) continue
      ;(mapa[t.prazo_em] ??= []).push(t.id)
    }
    for (const t of semDataVisiveis) mapa[BANDEJA].push(t.id)
    return mapa
  }, [tarefasVisiveis, semDataVisiveis])

  const [layout, setLayout] = useState(layoutServidor)
  // O cálculo do drop precisa ser síncrono. Ler `layout` logo depois de
  // setLayout pode devolver o valor anterior do React, que era a causa da
  // ordem incompleta enviada ao servidor.
  const layoutRef = useRef<LayoutCalendario>(layoutServidor)
  const inicioArrasteRef = useRef<LayoutCalendario | null>(null)
  const ultimoSobreRef = useRef<string | null>(null)
  useEffect(() => {
    layoutRef.current = layoutServidor
    setLayout(layoutServidor)
    setConcluidasOtim({})
  }, [layoutServidor])

  function aplicarLayout(proximo: LayoutCalendario) {
    layoutRef.current = proximo
    setLayout(proximo)
  }

  /** Conclusão vista pela UI: a otimista vence o servidor enquanto existir. */
  function estaConcluida(id: string): boolean {
    const local = concluidasOtim[id]
    if (local !== undefined) return local
    return Boolean(porId.get(id)?.concluida_em)
  }

  /**
   * Marca/desmarca e JÁ reordena a coluna — concluída cai pro fim, o FLIP
   * anima o deslize e as outras sobem.
   *
   * A reordenação entra no `layout`, não numa ordenação de render: o arraste
   * calcula índices em cima do layout, e se a tela mostrasse uma ordem
   * diferente da guardada, soltar um cartão o colocaria na posição errada.
   * Uma ordem só, para exibir e para arrastar.
   */
  function marcarConcluida(id: string, valor: boolean) {
    const mapaNovo = { ...concluidasOtim, [id]: valor }
    setConcluidasOtim(mapaNovo)
    const concluida = (x: string) =>
      mapaNovo[x] ?? Boolean(porId.get(x)?.concluida_em)
    setLayout((l) => {
      const coluna = Object.keys(l).find((k) => l[k].includes(id))
      if (!coluna) return l
      // Sort ESTÁVEL: dentro de cada bloco a ordem manual continua valendo.
      const reordenada = [...l[coluna]].sort(
        (a, b) => Number(concluida(a)) - Number(concluida(b))
      )
      return { ...l, [coluna]: reordenada }
    })
  }

  function navegar(mudancas: Record<string, string | null>) {
    const qs = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null) qs.delete(k)
      else qs.set(k, v)
    }
    qs.delete("tarefa")
    const s = qs.toString()
    // startTransition: a grade atual permanece na tela enquanto a nova
    // semana carrega — sem corte seco nem flash de skeleton.
    startNav(() => {
      router.push(s ? `${pathname}?${s}` : pathname, { scroll: false })
    })
  }
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /**
   * Reordena somente dentro do bloco da tarefa arrastada. Abertas e concluídas
   * nunca se misturam: as abertas ficam primeiro, mas cada bloco mantém a
   * liberdade total de ordenação.
   */
  function reordenarBloco(
    ids: string[],
    ativo: string,
    sobre: string
  ): string[] {
    const ativoConcluido = estaConcluida(ativo)
    const abertas = ids.filter((id) => id !== ativo && !estaConcluida(id))
    const concluidas = ids.filter((id) => id !== ativo && estaConcluida(id))
    const grupo = ativoConcluido ? concluidas : abertas

    const original = ids.filter((id) => estaConcluida(id) === ativoConcluido)
    const de = original.indexOf(ativo)
    const para = original.indexOf(sobre)

    if (de >= 0 && para >= 0) {
      const reordenado = arrayMove(original, de, para)
      return ativoConcluido
        ? [...abertas, ...reordenado]
        : [...reordenado, ...concluidas]
    }

    // Mudança de coluna ou soltura sobre o outro bloco:
    // aberta entra no fim das abertas; concluída, no fim das concluídas.
    const alvoMesmoBloco = grupo.indexOf(sobre)
    const posicao = alvoMesmoBloco >= 0 ? alvoMesmoBloco : grupo.length
    grupo.splice(posicao, 0, ativo)
    return ativoConcluido
      ? [...abertas, ...grupo]
      : [...grupo, ...concluidas]
  }

  function calcularDrop(ativo: string, sobre: string): {
    layout: LayoutCalendario
    colunaDestino: string
    idsDestino: string[]
  } | null {
    const base = inicioArrasteRef.current ?? layoutRef.current
    const origem = colunaNoLayout(base, ativo)
    const destino = colunaNoLayout(base, sobre)
    if (!origem || !destino) return null

    const proximo = copiarLayout(base)
    if (origem !== destino) {
      proximo[origem] = (proximo[origem] ?? []).filter((id) => id !== ativo)
    }
    proximo[destino] = reordenarBloco(
      proximo[destino] ?? [],
      ativo,
      sobre
    )
    return {
      layout: proximo,
      colunaDestino: destino,
      idsDestino: proximo[destino],
    }
  }

  function aoArrastarSobre(e: DragOverEvent) {
    const ativo = String(e.active.id)
    const sobre = e.over ? String(e.over.id) : null
    if (!sobre) return
    if (sobre !== ativo) ultimoSobreRef.current = sobre
    const base = inicioArrasteRef.current ?? layoutRef.current
    const de = colunaNoLayout(base, ativo)
    const para = colunaNoLayout(base, sobre)
    if (!de || !para || de === para) return

    // Preview entre colunas calculado sempre a partir do retrato inicial,
    // sem acumular movimentos intermediários do ponteiro.
    const preview = calcularDrop(ativo, sobre)
    if (preview) aplicarLayout(preview.layout)
  }

  function aoSoltar(e: DragEndEvent) {
    const ativo = String(e.active.id)
    const sobreAtual = e.over ? String(e.over.id) : null
    // Depois do preview entre colunas o dnd-kit pode reportar o próprio cartão
    // como último alvo. Guardamos o último alvo real para não desfazer o gesto
    // justamente na soltada.
    const sobre =
      sobreAtual && sobreAtual !== ativo ? sobreAtual : ultimoSobreRef.current
    ultimoSobreRef.current = null
    if (!sobre) {
      if (inicioArrasteRef.current) aplicarLayout(inicioArrasteRef.current)
      inicioArrasteRef.current = null
      return
    }

    const resultado = calcularDrop(ativo, sobre)
    inicioArrasteRef.current = null
    if (!resultado) return
    aplicarLayout(resultado.layout)

    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("movida_id", ativo)
      fd.set(
        "prazo_em",
        resultado.colunaDestino === BANDEJA ? "" : resultado.colunaDestino
      )
      fd.set("ids", JSON.stringify(resultado.idsDestino))
      const r = await reordenarDiaAction(fd)
      if (!r.ok) {
        aplicarLayout(layoutServidor) // reverte o gesto inteiro
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
      onDragStart={() => {
        inicioArrasteRef.current = copiarLayout(layoutRef.current)
        ultimoSobreRef.current = null
        setArrastando(true)
      }}
      onDragCancel={() => {
        if (inicioArrasteRef.current) aplicarLayout(inicioArrasteRef.current)
        inicioArrasteRef.current = null
        ultimoSobreRef.current = null
        setArrastando(false)
      }}
      onDragOver={aoArrastarSobre}
      onDragEnd={(e) => {
        setArrastando(false)
        aoSoltar(e)
      }}
    >
      <div className="ws-cal-raiz" style={{ opacity: navPending ? 0.55 : 1, transition: "opacity 0.15s ease" }}>
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

          {(pending || navPending) && (
            <span style={{ fontSize: 11, color: "var(--text-4)" }}>
              {navPending ? "Carregando…" : "Salvando…"}
            </span>
          )}
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

        <div style={{ display: "flex", gap: 0, alignItems: "stretch", flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, height: "100%" }}>
            {modo === "semana" ? (
              <div className="ws-cal-semana" ref={gradeRef}>
                {dias.map((iso, i) => (
                  <ColunaDia
                    key={iso}
                    ref={iso === hoje ? colunaHojeRef : undefined}
                    iso={iso}
                    rotuloDia={DIAS_SEMANA_LONGO[i]}
                    ehHoje={iso === hoje}
                    ids={layout[iso] ?? []}
                    porId={porId}
                    modoCor={modoCor}
                    meuUsuarioId={meuUsuarioId}
                    contextoFixoId={contextoFixoId}
                    animar={!arrastando}
                    estaConcluida={estaConcluida}
                    onConcluir={marcarConcluida}
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
                      estaConcluida={estaConcluida}
                      onConcluir={marcarConcluida}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {mostrarSemData && (
            <Bandeja
              ids={bandejaIds}
              porId={porId}
              modoCor={modoCor}
              estaConcluida={estaConcluida}
              onConcluir={marcarConcluida}
            />
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

const ColunaDia = forwardRef<HTMLDivElement, {
  iso: string
  rotuloDia: string
  ehHoje: boolean
  ids: string[]
  porId: Map<string, TarefaComRelacoes>
  modoCor: "colorido" | "mono"
  meuUsuarioId: string
  contextoFixoId?: string
  animar: boolean
  estaConcluida: (id: string) => boolean
  onConcluir: (id: string, valor: boolean) => void
}>(function ColunaDia({
  iso,
  rotuloDia,
  ehHoje,
  ids,
  porId,
  modoCor,
  meuUsuarioId,
  contextoFixoId,
  animar,
  estaConcluida,
  onConcluir,
}, refExterna) {
  const { setNodeRef, isOver } = useDroppable({ id: `${PREFIXO_DIA}${iso}` })
  const dia = Number(iso.slice(8, 10))
  // FLIP: quando uma tarefa é concluída ela desce pro fim da coluna, e as
  // outras sobem — tudo deslizando, em vez de pular de posição.
  const corpoRef = useRef<HTMLDivElement>(null)
  useFlipReorder(corpoRef, ids.join("|"), animar)

  return (
    <div
      // Dois donos do mesmo nó: o dnd-kit (alvo de soltura) e o pai, que
      // precisa medir esta coluna pra centralizar "hoje" no celular.
      ref={(node) => {
        setNodeRef(node)
        if (typeof refExterna === "function") refExterna(node)
        else if (refExterna) refExterna.current = node
      }}
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

      <div className="ws-cal-coluna-corpo" ref={corpoRef}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const t = porId.get(id)
            return t ? (
              <CartaoTarefa
                key={id}
                tarefa={t}
                modoCor={modoCor}
                concluida={estaConcluida(id)}
                onConcluir={onConcluir}
              />
            ) : null
          })}
        </SortableContext>
        <QuickAdd iso={iso} meuUsuarioId={meuUsuarioId} contextoFixoId={contextoFixoId} />
      </div>
    </div>
  )
})

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
    // Sem caixa e sem fundo próprio: enquanto se digita, é só texto sobre a
    // coluna. Só ao salvar aquilo VIRA um cartão de tarefa de verdade.
    <div
      style={{
        borderRadius: 8,
        background: "transparent",
        padding: "6px 8px",
        flexShrink: 0,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
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
  estaConcluida,
  onConcluir,
}: {
  iso: string
  dia: number
  doMes: boolean
  ehHoje: boolean
  ids: string[]
  porId: Map<string, TarefaComRelacoes>
  modoCor: "colorido" | "mono"
  estaConcluida: (id: string) => boolean
  onConcluir: (id: string, valor: boolean) => void
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
          return t ? (
            <CartaoTarefa
              key={id}
              tarefa={t}
              modoCor={modoCor}
              concluida={estaConcluida(id)}
              onConcluir={onConcluir}
              compacto
            />
          ) : null
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
  estaConcluida,
  onConcluir,
}: {
  ids: string[]
  porId: Map<string, TarefaComRelacoes>
  modoCor: "colorido" | "mono"
  estaConcluida: (id: string) => boolean
  onConcluir: (id: string, valor: boolean) => void
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
        height: "100%",
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
          return t ? (
            <CartaoTarefa
              key={id}
              tarefa={t}
              modoCor={modoCor}
              concluida={estaConcluida(id)}
              onConcluir={onConcluir}
            />
          ) : null
        })}
      </SortableContext>
    </div>
  )
}

/* =================== Cartão-pill =================== */

function CartaoTarefa({
  tarefa,
  modoCor,
  concluida,
  onConcluir,
  compacto,
}: {
  tarefa: TarefaComRelacoes
  modoCor: "colorido" | "mono"
  /** Estado VISTO (otimista) — mora no pai, que reordena a coluna com ele. */
  concluida: boolean
  onConcluir: (id: string, valor: boolean) => void
  compacto?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendingCheck, startCheck] = useTransition()

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tarefa.id })
  // Cor do CLIENTE vence a do contexto genérico (Calendário de conteúdo).
  const cor = modoCor === "mono" ? null : corDaTarefa(tarefa.contextos)
  const estilo = estiloCartao(cor)

  function abrir() {
    const qs = new URLSearchParams(searchParams.toString())
    qs.set("tarefa", tarefa.id)
    router.push(`${pathname}?${qs.toString()}`, { scroll: false })
  }

  function alternarConclusao(e: React.MouseEvent) {
    e.stopPropagation()
    if (pendingCheck) return
    const alvo = !concluida
    // O pai reordena a coluna na hora (concluída vai pro fim) e o FLIP
    // anima o deslize; o servidor só confirma depois.
    onConcluir(tarefa.id, alvo)
    startCheck(async () => {
      const fd = new FormData()
      fd.set("id", tarefa.id)
      fd.set("concluir", alvo ? "1" : "0")
      const r = await alternarConclusaoAction(fd)
      if (!r.ok) {
        onConcluir(tarefa.id, !alvo) // reverte
        return
      }
      router.refresh()
    })
  }

  return (
    // div[role=button], não <button>: a bolinha interna também é interativa
    // e botão dentro de botão é HTML inválido (foco e Enter quebram).
    // attributes do dnd-kit já trazem role="button" e tabIndex.
    <div
      ref={setNodeRef}
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.key === "Enter") abrir()
      }}
      {...listeners}
      {...attributes}
      data-flip-id={tarefa.id}
      title={tarefa.titulo}
      className="no-ds ws-pill"
      style={{
        background: estilo.background,
        color: estilo.color,
        border: estilo.border,
        padding: compacto ? "3px 6px" : "6px 8px",
        // Mão de clicar por padrão; a de agarrar só DURANTE o arraste.
        cursor: isDragging ? "grabbing" : "pointer",
        // Concluída APAGA o cartão: além da bolinha marcada e da posição no
        // fim da coluna, o olho precisa distinguir feito de pendente de
        // relance, sem ler. 0.45 (e não 0.38) mantém o título legível mesmo
        // nas cores escuras.
        opacity: isDragging ? 0.35 : concluida ? 0.45 : 1,
        transform: CSS.Transform.toString(transform),
        transition: transition
          ? `${transition}, opacity 0.18s ease`
          : "opacity 0.18s ease",
        zIndex: isDragging ? 10 : undefined,
        flexShrink: 0,
      }}
    >
      {/* Círculo de concluir: nasce com largura 0 e se abre no hover (refs
          bolinha/bolinhaCheck) — o título encolhe e a caixa não cresce.
          pointerDown parado: clicar nele não inicia arraste nem abre a tarefa. */}
      <span
        role="button"
        tabIndex={0}
        aria-label={concluida ? "Reabrir tarefa" : "Concluir tarefa"}
        data-concluida={concluida ? "1" : "0"}
        className="ws-pill-bolinha"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={alternarConclusao}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            alternarConclusao(e as unknown as React.MouseEvent)
          }
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      {!compacto && <Avatares pessoas={tarefa.responsaveis} tamanho={26} max={3} />}
      <span className={compacto ? "ws-pill-titulo-1l" : "ws-pill-titulo"}>
        {tarefa.prazo_hora ? `${tarefa.prazo_hora.slice(0, 5)} ` : ""}
        {tarefa.titulo}
      </span>
    </div>
  )
}
