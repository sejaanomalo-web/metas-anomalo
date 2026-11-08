"use client"

import { useRef, useState } from "react"
import CampoInteiro from "@/components/inputs/CampoInteiro"
import CampoMoeda from "@/components/inputs/CampoMoeda"
import { formatBRL } from "@/lib/data"
import {
  MAX_CONTRATOS,
  MAX_MESES_CONTRATO,
  MAX_NOME_CLIENTE,
  MESES_CONTRATO_PADRAO,
  type ContratoFechado,
} from "@/lib/funil-tipos"
import { estiloCampo, estiloRotulo } from "./ModalComercial"
import estilos from "./funis.module.css"

interface Linha {
  chave: number
  cliente: string
  /** Valores-máquina do CampoMoeda ("1234.56"); "" = em branco. */
  primeira: string
  mensal: string
  meses: string
}

function numero(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Mesma regra do servidor: demais parcelas em branco valem o mesmo que a 1ª. */
function contaDaLinha(l: Linha) {
  const meses = Math.max(1, Math.min(MAX_MESES_CONTRATO, Math.floor(numero(l.meses)) || 1))
  const primeira = numero(l.primeira)
  const mensal = meses === 1 ? 0 : l.mensal === "" ? primeira : numero(l.mensal)
  return { primeira, mensal, meses, total: primeira + mensal * (meses - 1) }
}

/**
 * Lista dos contratos fechados no lançamento. Cada um tem a 1ª parcela, as
 * demais parcelas e a duração, porque a 1ª costuma ser diferente (outro produto
 * vendido junto). Vai ao servidor como JSON em um campo oculto "contratos".
 */
export default function EditorContratos({
  iniciais,
}: {
  iniciais: ContratoFechado[]
}) {
  const proxima = useRef(0)
  const nova = (c?: ContratoFechado): Linha => ({
    chave: proxima.current++,
    cliente: c?.cliente ?? "",
    primeira: c ? String(c.primeira) : "",
    mensal: c && c.meses > 1 ? String(c.mensal) : "",
    meses: String(c?.meses ?? MESES_CONTRATO_PADRAO),
  })
  const [linhas, setLinhas] = useState<Linha[]>(() => iniciais.map((c) => nova(c)))

  function mudar(chave: number, campo: keyof Omit<Linha, "chave">, valor: string) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)))
  }

  const contas = linhas.map(contaDaLinha)
  const comValor = contas.filter((c) => c.primeira > 0 || c.mensal > 0)
  const primeiroMes = comValor.reduce((s, c) => s + c.primeira, 0)
  const total = comValor.reduce((s, c) => s + c.total, 0)

  const json = JSON.stringify(
    linhas.map((l) => ({
      cliente: l.cliente.trim() || undefined,
      primeira: l.primeira === "" ? null : Number(l.primeira),
      mensal: l.mensal === "" ? null : Number(l.mensal),
      meses: Number(l.meses) || 0,
    }))
  )

  return (
    <div className={estilos.contratos}>
      <input type="hidden" name="contratos" value={json} />
      {linhas.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>
          Nenhum contrato fechado neste lançamento.
        </p>
      )}
      {linhas.map((l, i) => {
        const conta = contas[i]
        const umMes = conta.meses === 1
        return (
          <div key={l.chave} className={estilos.contrato} data-contrato={i + 1}>
            <div className={estilos.contratoTopo}>
              <label style={{ ...estiloRotulo, flex: 1, minWidth: 0 }}>
                Contrato {i + 1} · cliente (opcional)
                <input
                  type="text"
                  value={l.cliente}
                  maxLength={MAX_NOME_CLIENTE}
                  onChange={(e) => mudar(l.chave, "cliente", e.target.value)}
                  className="glass-input"
                  style={estiloCampo}
                />
              </label>
              <button
                type="button"
                className={estilos.contratoRemover}
                aria-label={`Remover contrato ${i + 1}`}
                onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
              >
                Remover
              </button>
            </div>
            <div className={estilos.contratoGrade}>
              <label style={estiloRotulo}>
                1ª parcela
                <CampoMoeda
                  name={`contrato_${i}_primeira`}
                  value={l.primeira}
                  onValorChange={(v) => mudar(l.chave, "primeira", v)}
                  className="glass-input"
                  style={estiloCampo}
                />
              </label>
              <label style={{ ...estiloRotulo, opacity: umMes ? 0.5 : 1 }}>
                Demais parcelas
                <CampoMoeda
                  name={`contrato_${i}_mensal`}
                  value={umMes ? "" : l.mensal}
                  onValorChange={(v) => mudar(l.chave, "mensal", v)}
                  placeholder={umMes ? "—" : "Igual à 1ª"}
                  className="glass-input"
                  style={estiloCampo}
                />
              </label>
              <label style={estiloRotulo}>
                Meses
                <CampoInteiro
                  name={`contrato_${i}_meses`}
                  value={l.meses}
                  onValorChange={(v) => mudar(l.chave, "meses", v)}
                  maxDigitos={2}
                  valorMax={MAX_MESES_CONTRATO}
                  className="glass-input"
                  style={estiloCampo}
                />
              </label>
            </div>
            {conta.total > 0 && (
              <p className={estilos.contratoTotal}>
                Total do contrato: <strong>{formatBRL(conta.total)}</strong>
                {conta.meses > 1 && (
                  <span>
                    {" "}
                    ({formatBRL(conta.primeira)} + {conta.meses - 1} ×{" "}
                    {formatBRL(conta.mensal)})
                  </span>
                )}
              </p>
            )}
          </div>
        )
      })}

      <div className={estilos.contratosRodape}>
        {linhas.length < MAX_CONTRATOS && (
          <button
            type="button"
            className="btn-gold-outline"
            onClick={() => setLinhas((ls) => [...ls, nova()])}
          >
            + Adicionar contrato
          </button>
        )}
        {comValor.length > 0 && (
          <p data-contratos-resumo>
            {comValor.length} {comValor.length === 1 ? "contrato" : "contratos"} · 1º
            mês {formatBRL(primeiroMes)} · total {formatBRL(total)}
          </p>
        )}
      </div>
    </div>
  )
}
