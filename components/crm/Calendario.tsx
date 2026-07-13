"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { CrmAtividadeRow } from "@/lib/crm-atividades-actions"
import {
  concluirAtividadeAction,
  excluirAtividadeAction,
} from "@/lib/crm-atividades-actions"
import { casaBusca } from "@/lib/crm-busca"

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"]
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
const MESES_CURTO = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

const ACCENT = "#C9953A"

// ── Períodos do filtro (todos ancorados em "hoje", calculados no client) ──
type PeriodoKey =
  | "hoje" | "ontem" | "esta_semana" | "ult_7" | "semana_passada" | "ult_14"
  | "ult_30" | "este_mes" | "mes_passado" | "ult_60" | "ult_90" | "ult_6m"
  | "este_ano" | "ult_365" | "personalizado"

const PERIODOS: { chave: PeriodoKey; label: string }[] = [
  { chave: "hoje", label: "Hoje" },
  { chave: "ontem", label: "Ontem" },
  { chave: "esta_semana", label: "Esta Semana" },
  { chave: "ult_7", label: "Últimos 7 dias" },
  { chave: "semana_passada", label: "Semana Passada" },
  { chave: "ult_14", label: "Últimos 14 dias" },
  { chave: "ult_30", label: "Últimos 30 dias" },
  { chave: "este_mes", label: "Este Mês" },
  { chave: "mes_passado", label: "Mês Passado" },
  { chave: "ult_60", label: "Últimos 60 dias" },
  { chave: "ult_90", label: "Últimos 90 dias" },
  { chave: "ult_6m", label: "Últimos 6 Meses" },
  { chave: "este_ano", label: "Este Ano" },
  { chave: "ult_365", label: "Últimos 365 dias" },
  { chave: "personalizado", label: "Personalizado…" },
]

function chaveDia(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dia}`
}
function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function addDias(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Intervalo [inicio, fim] (ambos em midnight local) do período escolhido. */
function calcularRange(chave: PeriodoKey, hoje: Date): { inicio: Date; fim: Date } {
  const h = inicioDoDia(hoje)
  switch (chave) {
    case "hoje":
      return { inicio: h, fim: h }
    case "ontem": {
      const o = addDias(h, -1)
      return { inicio: o, fim: o }
    }
    case "esta_semana": {
      const ini = addDias(h, -h.getDay())
      return { inicio: ini, fim: addDias(ini, 6) }
    }
    case "ult_7":
      return { inicio: addDias(h, -6), fim: h }
    case "semana_passada": {
      const iniEsta = addDias(h, -h.getDay())
      return { inicio: addDias(iniEsta, -7), fim: addDias(iniEsta, -1) }
    }
    case "ult_14":
      return { inicio: addDias(h, -13), fim: h }
    case "ult_30":
      return { inicio: addDias(h, -29), fim: h }
    case "este_mes":
      return {
        inicio: new Date(h.getFullYear(), h.getMonth(), 1),
        fim: new Date(h.getFullYear(), h.getMonth() + 1, 0),
      }
    case "mes_passado":
      return {
        inicio: new Date(h.getFullYear(), h.getMonth() - 1, 1),
        fim: new Date(h.getFullYear(), h.getMonth(), 0),
      }
    case "ult_60":
      return { inicio: addDias(h, -59), fim: h }
    case "ult_90":
      return { inicio: addDias(h, -89), fim: h }
    case "ult_6m":
      return { inicio: new Date(h.getFullYear(), h.getMonth() - 6, h.getDate()), fim: h }
    case "este_ano":
      return { inicio: new Date(h.getFullYear(), 0, 1), fim: new Date(h.getFullYear(), 11, 31) }
    case "ult_365":
      return { inicio: addDias(h, -364), fim: h }
    case "personalizado":
      // Fallback antes do usuário escolher as duas datas — o componente
      // sobrescreve com o intervalo real assim que "de"/"até" são preenchidos.
      return { inicio: h, fim: h }
  }
}

function formatarDataBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Lista de meses (ano+mês) que o intervalo cobre, do primeiro ao último. */
function listarMeses(inicio: Date, fim: Date): { ano: number; mes: number }[] {
  const out: { ano: number; mes: number }[] = []
  let y = inicio.getFullYear()
  let m = inicio.getMonth()
  const endY = fim.getFullYear()
  const endM = fim.getMonth()
  // trava defensiva: no máximo 15 meses (o período mais largo é ~13)
  while ((y < endY || (y === endY && m <= endM)) && out.length < 15) {
    out.push({ ano: y, mes: m })
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  return out
}

/**
 * Calendário do CRM com FILTRO DE PERÍODO: o seletor define um intervalo
 * (Hoje … Últimos 365 dias); o intervalo aparece destacado no calendário
 * visual (um mini-mês por mês do período, com scroll quando são muitos) e a
 * lista de compromissos passa a mostrar só o que cai nele. Clicar num
 * compromisso abre o detalhe com Concluir/Excluir/Cancelar.
 *
 * Tudo local — sem round-trip: a page já busca uma janela larga de
 * atividades (ver listarAtividadesCalendario), suficiente pro filtro.
 */
export default function Calendario({
  atividades,
  proximas,
}: {
  atividades: CrmAtividadeRow[]
  proximas: CrmAtividadeRow[]
}) {
  const hoje = useMemo(() => new Date(), [])
  const [periodo, setPeriodo] = useState<PeriodoKey>("este_mes")
  const [diaFoco, setDiaFoco] = useState<string | null>(null)
  const [aberta, setAberta] = useState<CrmAtividadeRow | null>(null)
  const [de, setDe] = useState("")
  const [ate, setAte] = useState("")
  const [busca, setBusca] = useState("")
  const router = useRouter()

  // Período "Personalizado…": enquanto o usuário não preencheu as duas
  // datas, cai no fallback hoje..hoje de calcularRange (evita quebrar o
  // useMemo abaixo); assim que "de" e "até" existem, sobrescreve o range.
  const rangeCustom = useMemo(() => {
    if (periodo !== "personalizado" || !de || !ate) return null
    const iniD = new Date(`${de}T00:00:00`)
    const fimD = new Date(`${ate}T00:00:00`)
    return iniD.getTime() <= fimD.getTime()
      ? { inicio: iniD, fim: fimD }
      : { inicio: fimD, fim: iniD }
  }, [periodo, de, ate])

  const { inicio, fim } = useMemo(
    () => rangeCustom ?? calcularRange(periodo, hoje),
    [rangeCustom, periodo, hoje]
  )
  const inicioKey = chaveDia(inicio)
  const fimKey = chaveDia(fim)
  const meses = useMemo(() => listarMeses(inicio, fim), [inicio, fim])
  const compacto = meses.length > 3

  const atividadesFiltradas = useMemo(
    () =>
      busca.trim()
        ? atividades.filter((a) =>
            casaBusca(busca, a.lead_nome, a.lead_telefone, a.lead_empresa_nome, a.titulo, a.categoria)
          )
        : atividades,
    [atividades, busca]
  )
  const proximasFiltradas = useMemo(
    () =>
      busca.trim()
        ? proximas.filter((a) =>
            casaBusca(busca, a.lead_nome, a.lead_telefone, a.lead_empresa_nome, a.titulo, a.categoria)
          )
        : proximas,
    [proximas, busca]
  )

  const porDia = useMemo(() => {
    const map: Record<string, CrmAtividadeRow[]> = {}
    for (const a of atividadesFiltradas) {
      if (!a.agendado_para) continue
      const chave = a.agendado_para.slice(0, 10)
      if (!map[chave]) map[chave] = []
      map[chave].push(a)
    }
    return map
  }, [atividadesFiltradas])

  // Dias do período que têm compromisso, em ordem.
  const diasComEventos = useMemo(
    () =>
      Object.keys(porDia)
        .filter((k) => k >= inicioKey && k <= fimKey)
        .sort(),
    [porDia, inicioKey, fimKey]
  )
  const totalNoPeriodo = useMemo(
    () => diasComEventos.reduce((s, k) => s + porDia[k].length, 0),
    [diasComEventos, porDia]
  )

  const periodoLabel =
    periodo === "personalizado" && rangeCustom
      ? `${formatarDataBR(inicio)} – ${formatarDataBR(fim)}`
      : PERIODOS.find((p) => p.chave === periodo)?.label ?? ""

  function trocarPeriodo(p: PeriodoKey) {
    setPeriodo(p)
    setDiaFoco(null)
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Toolbar: seletor de período */}
      <div
        className="flex items-center justify-between flex-wrap gap-3"
        style={{ flexShrink: 0 }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 11, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Período
          </span>
          <select
            value={periodo}
            onChange={(e) => trocarPeriodo(e.target.value as PeriodoKey)}
            className="glass-input"
            style={{ fontSize: 13, padding: "7px 12px", borderRadius: 8, fontWeight: 600, color: ACCENT }}
          >
            {PERIODOS.map((p) => (
              <option key={p.chave} value={p.chave} style={{ color: "#111" }}>
                {p.label}
              </option>
            ))}
          </select>
          {periodo === "personalizado" && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                className="glass-input"
                style={{ fontSize: 12, padding: "6px 8px", borderRadius: 8 }}
              />
              <span style={{ fontSize: 11, color: "var(--text-4)" }}>até</span>
              <input
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                className="glass-input"
                style={{ fontSize: 12, padding: "6px 8px", borderRadius: 8 }}
              />
            </div>
          )}
          <span style={{ fontSize: 11, color: "var(--text-4)" }}>
            {totalNoPeriodo} compromisso{totalNoPeriodo === 1 ? "" : "s"}
          </span>
        </div>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, telefone ou empresa…"
          className="glass-input"
          style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, minWidth: 220 }}
        />
      </div>

      {/* Conteúdo: calendário multi-mês + painel de compromissos.
          SEM flexWrap: com wrap, a "linha" do flex passa a se dimensionar
          pelo conteúdo em vez de esticar pra altura do pai — é isso que
          fazia o minHeight:0 + overflowY:auto de baixo nunca ter uma altura
          fixa contra a qual rolar, e o container externo (overflow:hidden)
          simplesmente cortava os meses excedentes. */}
      <div
        className="crm-calendario-grid"
        style={{ flex: 1, minHeight: 0, display: "flex", gap: 16 }}
      >
        {/* Calendário visual (um mini-mês por mês do período) */}
        <div
          className="crm-calendario-mes-pane scrollbar-thin"
          style={{
            flex: "1 1 440px",
            minWidth: 0,
            // minHeight:0 é o que faz o overflowY funcionar: sem ele o
            // min-height:auto do flex item cresce com o conteúdo (muitos meses)
            // e é cortado pelo overflow:hidden do container, em vez de rolar.
            minHeight: 0,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          <div className="flex flex-wrap" style={{ gap: 14, alignContent: "flex-start" }}>
            {meses.map(({ ano, mes }) => (
              <MiniMes
                key={`${ano}-${mes}`}
                ano={ano}
                mes={mes}
                hojeKey={chaveDia(hoje)}
                inicioKey={inicioKey}
                fimKey={fimKey}
                porDia={porDia}
                diaFoco={diaFoco}
                compacto={compacto}
                onSelecionarDia={(k) => setDiaFoco((atual) => (atual === k ? null : k))}
              />
            ))}
          </div>
        </div>

        {/* Painel de compromissos do período */}
        <div
          className="crm-calendario-compromissos-pane scrollbar-thin glass"
          style={{
            flex: "1 1 300px",
            minWidth: 264,
            maxWidth: 420,
            minHeight: 0,
            overflowY: "auto",
            padding: 14,
          }}
        >
          <div className="flex items-center justify-between gap-2" style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>
              {diaFoco
                ? new Date(`${diaFoco}T00:00:00`).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                : periodoLabel}
            </p>
            {diaFoco && (
              <button
                type="button"
                onClick={() => setDiaFoco(null)}
                style={{ fontSize: 11, color: ACCENT, flexShrink: 0 }}
              >
                ‹ Período todo
              </button>
            )}
          </div>

          {diaFoco ? (
            (porDia[diaFoco] ?? []).length === 0 ? (
              <Vazio texto={busca.trim() ? "Nenhum compromisso neste dia bate com a busca." : "Nenhum compromisso neste dia."} />
            ) : (
              <div className="space-y-2">
                {porDia[diaFoco].map((a) => (
                  <CartaoCompromisso key={a.id} atividade={a} onAbrir={() => setAberta(a)} />
                ))}
              </div>
            )
          ) : diasComEventos.length === 0 ? (
            <Vazio texto={busca.trim() ? "Nenhum compromisso no período bate com a busca." : "Nenhum compromisso no período selecionado."} />
          ) : (
            <div className="space-y-3">
              {diasComEventos.map((k) => (
                <div key={k}>
                  <p style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 4, fontWeight: 600 }}>
                    {new Date(`${k}T00:00:00`).toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                  <div className="space-y-2">
                    {porDia[k].map((a) => (
                      <CartaoCompromisso key={a.id} atividade={a} onAbrir={() => setAberta(a)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Próximos compromissos (futuros, mesmo além do período) */}
          <div style={{ marginTop: 20, borderTop: "0.5px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
            <p
              style={{
                fontSize: 9,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--text-4)",
                fontWeight: 500,
                marginBottom: 10,
              }}
            >
              Próximos compromissos
            </p>
            {proximasFiltradas.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-4)" }}>
                {busca.trim() ? "Nenhum compromisso futuro bate com a busca." : "Nenhum compromisso futuro marcado."}
              </p>
            ) : (
              <div className="space-y-2">
                {proximasFiltradas.map((a) => (
                  <CartaoCompromisso key={a.id} atividade={a} onAbrir={() => setAberta(a)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {aberta && (
        <DetalheCompromisso
          atividade={aberta}
          onFechar={() => setAberta(null)}
          onMudou={() => {
            setAberta(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p style={{ fontSize: 12, color: "var(--text-4)" }}>{texto}</p>
}

/** Um mês em miniatura, com os dias do período destacados. */
function MiniMes({
  ano,
  mes,
  hojeKey,
  inicioKey,
  fimKey,
  porDia,
  diaFoco,
  compacto,
  onSelecionarDia,
}: {
  ano: number
  mes: number
  hojeKey: string
  inicioKey: string
  fimKey: string
  porDia: Record<string, CrmAtividadeRow[]>
  diaFoco: string | null
  compacto: boolean
  onSelecionarDia: (chave: string) => void
}) {
  const celulas = useMemo(() => {
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay()
    const totalDias = new Date(ano, mes + 1, 0).getDate()
    const lista: (Date | null)[] = []
    for (let i = 0; i < primeiroDiaSemana; i++) lista.push(null)
    for (let d = 1; d <= totalDias; d++) lista.push(new Date(ano, mes, d))
    return lista
  }, [ano, mes])

  const larguraCard = compacto ? 208 : 250
  const fonteDia = compacto ? 10 : 12

  return (
    <div
      className="glass"
      style={{ width: larguraCard, padding: compacto ? 10 : 12, flexShrink: 0 }}
    >
      <div
        style={{
          fontSize: compacto ? 11 : 12,
          fontWeight: 700,
          color: ACCENT,
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: `1px solid ${ACCENT}33`,
        }}
      >
        {compacto ? MESES_CURTO[mes] : MESES[mes]} {ano}
      </div>
      <div className="grid grid-cols-7" style={{ gap: 2, marginBottom: 2 }}>
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} style={{ fontSize: 9, textAlign: "center", color: "var(--text-4)" }}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gap: 2 }}>
        {celulas.map((data, i) => {
          if (!data) return <div key={i} />
          const chave = chaveDia(data)
          const eventos = porDia[chave] ?? []
          const noRange = chave >= inicioKey && chave <= fimKey
          const ehHoje = hojeKey === chave
          const focado = diaFoco === chave
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelecionarDia(chave)}
              style={{
                aspectRatio: "1",
                borderRadius: 7,
                fontSize: fonteDia,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                position: "relative",
                background: focado
                  ? `${ACCENT}40`
                  : noRange
                  ? `${ACCENT}1c`
                  : "transparent",
                border: ehHoje ? `1px solid ${ACCENT}` : "1px solid transparent",
                color: noRange || focado ? "var(--text-1, #fff)" : "var(--text-4)",
                fontWeight: noRange ? 600 : 400,
              }}
            >
              {data.getDate()}
              {eventos.length > 0 && (
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: ACCENT,
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Cartão clicável de um compromisso (na lista do período e nos próximos) —
 *  a data vem em destaque num "selo" à esquerda (dia grande + mês/semana),
 *  com o nome/objetivo do compromisso ao lado. */
function CartaoCompromisso({
  atividade,
  onAbrir,
}: {
  atividade: CrmAtividadeRow
  onAbrir: () => void
}) {
  const nome = atividade.lead_nome || atividade.lead_telefone || "Lead sem nome"
  const quando = atividade.agendado_para ? new Date(atividade.agendado_para) : null
  const hora = quando
    ? quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : ""
  const diaSemana = quando
    ? quando.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
    : ""

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="w-full flex items-stretch"
      style={{
        textAlign: "left",
        gap: 10,
        padding: 8,
        borderRadius: 10,
        background: "var(--surface-2, rgba(255,255,255,0.04))",
        border: `1px solid ${ACCENT}2b`,
        opacity: atividade.concluido_em ? 0.55 : 1,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 44,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          background: `${ACCENT}22`,
          border: `1px solid ${ACCENT}55`,
          color: ACCENT,
          padding: "4px 2px",
        }}
      >
        <span style={{ fontSize: 9, textTransform: "uppercase", fontWeight: 700, lineHeight: 1 }}>
          {diaSemana}
        </span>
        <span style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.3 }}>
          {quando ? String(quando.getDate()).padStart(2, "0") : "--"}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1 }}>
          {quando ? MESES_CURTO[quando.getMonth()] : ""}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center justify-between gap-2">
          <p style={{ fontSize: 13, fontWeight: 700 }} className="truncate">
            {atividade.categoria || atividade.titulo || "Follow-up"}
          </p>
          {hora && (
            <span style={{ fontSize: 11, color: ACCENT, flexShrink: 0, fontWeight: 600 }}>
              {hora}
            </span>
          )}
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-2, #ddd)", marginTop: 2 }} className="truncate">
          {nome}
          {atividade.lead_empresa_nome ? ` · ${atividade.lead_empresa_nome}` : ""}
        </p>
        {atividade.concluido_em && (
          <span style={{ fontSize: 9, color: "var(--success)" }}>✓ concluído</span>
        )}
      </div>
    </button>
  )
}

/** Modal de detalhe do compromisso: Concluir / Excluir / Cancelar. */
function DetalheCompromisso({
  atividade,
  onFechar,
  onMudou,
}: {
  atividade: CrmAtividadeRow
  onFechar: () => void
  onMudou: () => void
}) {
  const [pending, startTransition] = useTransition()
  const quando = atividade.agendado_para ? new Date(atividade.agendado_para) : null
  const dataCompleta = quando
    ? quando.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "Sem data"
  const hora = quando
    ? quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : ""

  function concluir() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", atividade.id)
      await concluirAtividadeAction(fd)
      onMudou()
    })
  }
  function excluir() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", atividade.id)
      await excluirAtividadeAction(fd)
      onMudou()
    })
  }

  return (
    <>
      <button
        type="button"
        aria-label="Fechar"
        onClick={onFechar}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(0,0,0,0.55)",
          cursor: "default",
        }}
      />
      <div
        className="glass"
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          zIndex: 41,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(440px, calc(100vw - 32px))",
          padding: 22,
        }}
      >
        <div
          style={{
            display: "inline-block",
            fontSize: 10,
            fontWeight: 700,
            color: ACCENT,
            background: `${ACCENT}1f`,
            border: `1px solid ${ACCENT}4d`,
            borderRadius: 999,
            padding: "3px 10px",
            marginBottom: 10,
          }}
        >
          {atividade.categoria || "Follow-up"}
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          {atividade.titulo || atividade.categoria || "Follow-up"}
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-3)", textTransform: "capitalize" }}>
          {dataCompleta}
          {hora ? ` · ${hora}` : ""}
        </p>

        {atividade.lead_nome && (
          <Link
            href={`/dashboard/crm?view=conversas&lead=${atividade.lead_id}`}
            style={{ fontSize: 13, color: ACCENT, display: "inline-block", marginTop: 12 }}
          >
            {atividade.lead_nome}
            {atividade.lead_empresa_nome ? ` · ${atividade.lead_empresa_nome}` : ""} →
          </Link>
        )}
        {atividade.corpo && (
          <p style={{ fontSize: 13, color: "var(--text-2, #ddd)", marginTop: 12, lineHeight: 1.5 }}>
            {atividade.corpo}
          </p>
        )}
        {atividade.concluido_em && (
          <p style={{ fontSize: 11, color: "var(--success)", marginTop: 12 }}>
            ✓ Compromisso concluído
          </p>
        )}

        <div className="flex items-center flex-wrap gap-2" style={{ marginTop: 20 }}>
          {!atividade.concluido_em && (
            <button
              type="button"
              onClick={concluir}
              disabled={pending}
              className="btn-gold-filled"
              style={{ fontSize: 12, padding: "8px 14px", opacity: pending ? 0.6 : 1 }}
            >
              ✓ Concluir compromisso
            </button>
          )}
          <button
            type="button"
            onClick={excluir}
            disabled={pending}
            style={{
              fontSize: 12,
              padding: "8px 14px",
              borderRadius: 8,
              color: "var(--danger)",
              border: "0.5px solid rgba(255,90,90,0.35)",
              opacity: pending ? 0.6 : 1,
            }}
          >
            Excluir compromisso
          </button>
          <button
            type="button"
            onClick={onFechar}
            disabled={pending}
            style={{ fontSize: 12, padding: "8px 14px", color: "var(--text-3)" }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  )
}
