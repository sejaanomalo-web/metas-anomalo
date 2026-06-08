"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ANOS_DISPONIVEIS, MESES, type Ano, type Mes } from "@/lib/data"
import type { ModoPeriodo } from "@/lib/periodo"

/**
 * Seletor de período GLOBAL e sincronizado, fixo no topo de todas as
 * interfaces. Evolui o antigo SeletorPeriodo (só mês/ano) com três modos:
 *
 *   • Mês       → dropdowns Mês + Ano (comportamento legado)
 *   • Dia       → um date picker (dia exato)
 *   • Intervalo → "De / Até" (estilo Facebook), abrange dia/mês/meses/ano
 *
 * Drop-in do SeletorPeriodo antigo: recebe apenas mesAtual/anoAtual (que
 * servem de fallback e valor dos dropdowns no modo mês). modo/de/ate são
 * lidos DIRETO da URL (?modo=&de=&ate=) — mantém o padrão URL-driven, sem
 * Context, então o período sincroniza em toda navegação do sistema.
 */

const estiloInput: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-2)",
}

const optionStyle: React.CSSProperties = { background: "#121826" }

const MES_NUM: Record<Mes, number> = {
  Abril: 4,
  Maio: 5,
  Junho: 6,
  Julho: 7,
  Agosto: 8,
  Setembro: 9,
  Outubro: 10,
  Novembro: 11,
  Dezembro: 12,
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function rangeDoMes(mes: Mes, ano: Ano): { de: string; ate: string } {
  const m = MES_NUM[mes]
  const ultimo = new Date(ano, m, 0).getDate()
  return { de: `${ano}-${pad(m)}-01`, ate: `${ano}-${pad(m)}-${pad(ultimo)}` }
}

const botaoModo = (ativo: boolean): React.CSSProperties => ({
  padding: "6px 12px",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.02em",
  borderRadius: 8,
  cursor: "pointer",
  color: ativo ? "#0b0b0d" : "var(--text-3)",
  background: ativo ? "var(--accent, #C9953A)" : "transparent",
  border: ativo
    ? "1px solid var(--accent, #C9953A)"
    : "1px solid var(--surface-3, #2a2a30)",
})

export default function SeletorPeriodoGlobal({
  mesAtual,
  anoAtual,
}: {
  mesAtual: Mes
  anoAtual: Ano
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const modoRaw = searchParams.get("modo")
  const modo: ModoPeriodo =
    modoRaw === "dia" || modoRaw === "intervalo" ? modoRaw : "mes"

  const fallback = rangeDoMes(mesAtual, anoAtual)
  const de = searchParams.get("de") || fallback.de
  const ate = searchParams.get("ate") || fallback.ate

  function push(params: URLSearchParams) {
    router.push(`${pathname}?${params.toString()}`)
  }

  function setModo(novo: ModoPeriodo) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("modo", novo)
    if (novo === "mes") {
      params.delete("de")
      params.delete("ate")
      params.set("mes", mesAtual)
      params.set("ano", String(anoAtual))
    } else if (novo === "dia") {
      params.delete("ate")
      params.set("de", de)
    } else {
      params.set("de", de)
      params.set("ate", ate)
    }
    push(params)
  }

  function atualizarMesAno(param: "mes" | "ano", valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("modo", "mes")
    params.set(param, valor)
    params.delete("de")
    params.delete("ate")
    push(params)
  }

  function atualizarDia(valor: string) {
    if (!valor) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("modo", "dia")
    params.set("de", valor)
    params.delete("ate")
    push(params)
  }

  function aplicarIntervalo(novoDe: string, novoAte: string) {
    if (!novoDe || !novoAte) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("modo", "intervalo")
    params.set("de", novoDe)
    params.set("ate", novoAte)
    push(params)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Alternador de modo */}
      <div className="flex items-center gap-1">
        {(["mes", "dia", "intervalo"] as ModoPeriodo[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            style={botaoModo(modo === m)}
            className="no-ds"
          >
            {m === "mes" ? "Mês" : m === "dia" ? "Dia" : "Intervalo"}
          </button>
        ))}
      </div>

      {/* Controles do modo ativo */}
      {modo === "mes" && (
        <div className="flex items-center gap-2">
          <select
            value={mesAtual}
            onChange={(e) => atualizarMesAno("mes", e.target.value)}
            className="glass-input"
            style={estiloInput}
          >
            {MESES.map((m) => (
              <option key={m} value={m} style={optionStyle}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={anoAtual}
            onChange={(e) => atualizarMesAno("ano", e.target.value)}
            className="glass-input"
            style={estiloInput}
          >
            {ANOS_DISPONIVEIS.map((a) => (
              <option key={a} value={a} style={optionStyle}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}

      {modo === "dia" && (
        <input
          type="date"
          value={de}
          onChange={(e) => atualizarDia(e.target.value)}
          className="glass-input"
          style={estiloInput}
        />
      )}

      {modo === "intervalo" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={de}
            max={ate || undefined}
            onChange={(e) => aplicarIntervalo(e.target.value, ate)}
            className="glass-input"
            style={estiloInput}
            aria-label="De"
          />
          <span style={{ color: "var(--text-4)", fontSize: 11 }}>até</span>
          <input
            type="date"
            value={ate}
            min={de || undefined}
            onChange={(e) => aplicarIntervalo(de, e.target.value)}
            className="glass-input"
            style={estiloInput}
            aria-label="Até"
          />
        </div>
      )}
    </div>
  )
}
