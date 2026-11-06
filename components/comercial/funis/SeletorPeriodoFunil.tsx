"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ANOS_DISPONIVEIS } from "@/lib/data"
import {
  MODOS_PERIODO,
  dataValida,
  navegarPeriodo,
  periodoDaData,
  periodoIntervalo,
  periodoParaParams,
  type ModoPeriodoFunil,
  type PeriodoFunil,
} from "@/lib/funil-calculo"

const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

const estiloCampo: React.CSSProperties = {
  padding: "8px 10px",
  minHeight: 38,
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-2)",
}

const estiloSeta: React.CSSProperties = {
  width: 38,
  height: 38,
  fontSize: 16,
  color: "var(--text-2)",
  background: "transparent",
  border: "1px solid var(--input-border)",
  borderRadius: 10,
  cursor: "pointer",
}

const botaoModo = (ativo: boolean): React.CSSProperties => ({
  padding: "8px 12px",
  minHeight: 36,
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  cursor: "pointer",
  color: ativo ? "#000" : "var(--text-2)",
  background: ativo ? "var(--accent)" : "transparent",
  border: ativo
    ? "1px solid var(--accent)"
    : "1px solid var(--input-border)",
})

/** Ano digitado pela metade no campo de data ("0002") não pode navegar. */
function anoAceitavel(iso: string): boolean {
  const ano = parseInt(iso.slice(0, 4), 10)
  return ano >= 2000 && ano <= 2100
}

/**
 * Filtro de período: dia, semana, mês, ano ou intervalo. O estado vive na URL,
 * com os mesmos parâmetros do seletor global (?modo=&de=&ate=). Os demais
 * parâmetros, como o funil, são preservados.
 */
export default function SeletorPeriodoFunil({
  periodo,
  hoje,
}: {
  periodo: PeriodoFunil
  hoje: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendente, startNav] = useTransition()
  // Espelho local: mostra a escolha na hora, sem esperar a resposta do servidor.
  const [local, setLocal] = useState(periodo)

  useEffect(() => {
    setLocal(periodo)
  }, [periodo.modo, periodo.de, periodo.ate])

  function ir(novo: PeriodoFunil) {
    setLocal(novo)
    const params = new URLSearchParams(searchParams.toString())
    params.delete("mes")
    params.delete("ano")
    const valores = periodoParaParams(novo)
    params.set("modo", valores.modo)
    params.set("de", valores.de)
    params.set("ate", valores.ate)
    // O agrupamento ideal muda com o tamanho do período.
    if (novo.modo !== local.modo) params.delete("agrupar")
    startNav(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  function trocarModo(modo: ModoPeriodoFunil) {
    if (modo === local.modo) return
    if (modo === "intervalo") {
      ir(periodoIntervalo(local.de, local.ate))
      return
    }
    // Se o período atual contém hoje, parte de hoje. Senão, do início dele.
    const ancora = hoje >= local.de && hoje <= local.ate ? hoje : local.de
    ir(periodoDaData(modo, ancora))
  }

  const anoLocal = parseInt(local.de.slice(0, 4), 10)
  const mesLocal = parseInt(local.de.slice(5, 7), 10)
  const anos: number[] = (ANOS_DISPONIVEIS as readonly number[]).includes(anoLocal)
    ? [...ANOS_DISPONIVEIS]
    : [anoLocal, ...ANOS_DISPONIVEIS].sort((a, b) => a - b)

  const seletorAno = (
    <select
      aria-label="Ano"
      className="glass-input"
      style={estiloCampo}
      value={anoLocal}
      onChange={(e) =>
        ir(
          periodoDaData(
            local.modo,
            `${e.target.value}-${String(local.modo === "mes" ? mesLocal : 1).padStart(2, "0")}-01`
          )
        )
      }
    >
      {anos.map((a) => (
        <option key={a} value={a} style={{ background: "#121826" }}>
          {a}
        </option>
      ))}
    </select>
  )

  return (
    <div
      aria-busy={pendente}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        opacity: pendente ? 0.65 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      <div
        role="group"
        aria-label="Tipo de período"
        style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}
      >
        {MODOS_PERIODO.map((m) => (
          <button
            key={m.valor}
            type="button"
            style={botaoModo(m.valor === local.modo)}
            aria-pressed={m.valor === local.modo}
            onClick={() => trocarModo(m.valor)}
          >
            {m.rotulo}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          aria-label="Período anterior"
          style={estiloSeta}
          onClick={() => ir(navegarPeriodo(local, -1))}
        >
          ‹
        </button>

        {(local.modo === "dia" || local.modo === "semana") && (
          <input
            type="date"
            aria-label={local.modo === "dia" ? "Dia" : "Qualquer dia da semana"}
            className="glass-input"
            style={estiloCampo}
            value={local.de}
            onChange={(e) => {
              const v = e.target.value
              if (dataValida(v) && anoAceitavel(v)) ir(periodoDaData(local.modo, v))
            }}
          />
        )}

        {local.modo === "mes" && (
          <>
            <select
              aria-label="Mês"
              className="glass-input"
              style={estiloCampo}
              value={mesLocal}
              onChange={(e) =>
                ir(
                  periodoDaData(
                    "mes",
                    `${anoLocal}-${e.target.value.padStart(2, "0")}-01`
                  )
                )
              }
            >
              {NOMES_MES.map((nome, i) => (
                <option key={nome} value={i + 1} style={{ background: "#121826" }}>
                  {nome}
                </option>
              ))}
            </select>
            {seletorAno}
          </>
        )}

        {local.modo === "ano" && seletorAno}

        {local.modo === "intervalo" && (
          <>
            <input
              type="date"
              aria-label="De"
              className="glass-input"
              style={estiloCampo}
              value={local.de}
              onChange={(e) => {
                const v = e.target.value
                if (dataValida(v) && anoAceitavel(v)) ir(periodoIntervalo(v, local.ate))
              }}
            />
            <input
              type="date"
              aria-label="Até"
              className="glass-input"
              style={estiloCampo}
              value={local.ate}
              onChange={(e) => {
                const v = e.target.value
                if (dataValida(v) && anoAceitavel(v)) ir(periodoIntervalo(local.de, v))
              }}
            />
          </>
        )}

        <button
          type="button"
          aria-label="Próximo período"
          style={estiloSeta}
          onClick={() => ir(navegarPeriodo(local, 1))}
        >
          ›
        </button>

        {local.modo !== "intervalo" && (
          <button
            type="button"
            style={botaoModo(false)}
            onClick={() => ir(periodoDaData(local.modo, hoje))}
          >
            Hoje
          </button>
        )}
      </div>
    </div>
  )
}
