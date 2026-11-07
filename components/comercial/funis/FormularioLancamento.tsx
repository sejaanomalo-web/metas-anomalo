"use client"

import { useState, useTransition } from "react"
import CampoInteiro from "@/components/inputs/CampoInteiro"
import CampoMoeda from "@/components/inputs/CampoMoeda"
import { salvarLancamentoAction } from "@/lib/funis-comerciais-actions"
import {
  FONTE_TRAFEGO,
  contratosDoLancamento,
  fonteDoLancamento,
  fontesDoFunil,
  type FunilComercial,
  type LancamentoFunil,
} from "@/lib/funil-tipos"
import EditorContratos from "./EditorContratos"
import ModalComercial, {
  MensagemErro,
  estiloCampo,
  estiloRotulo,
} from "./ModalComercial"
import estilos from "./funis.module.css"

const grade: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 14,
}

/** Lança os números de uma data em um funil, ou edita um lançamento. */
export default function FormularioLancamento({
  funil,
  lancamento,
  dataPadrao,
  fontePadrao,
  fechar,
  aoSalvar,
}: {
  funil: FunilComercial
  lancamento?: LancamentoFunil
  dataPadrao: string
  /** Fonte aberta na tela: é o palpite inicial de quem lança. */
  fontePadrao?: string | null
  fechar: () => void
  aoSalvar: () => void
}) {
  const fontes = fontesDoFunil(funil)
  const importado = Boolean(lancamento?.origem_importacao)
  const [fonte, setFonte] = useState(
    lancamento ? fonteDoLancamento(lancamento) : fontePadrao ?? FONTE_TRAFEGO
  )
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const dados = new FormData(ev.currentTarget)
    setErro(null)
    startTransition(async () => {
      const r = await salvarLancamentoAction(dados)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível salvar.")
        return
      }
      aoSalvar()
    })
  }

  return (
    <ModalComercial
      titulo={lancamento ? "Editar lançamento" : `Lançar em ${funil.nome}`}
      fechar={fechar}
    >
      <form onSubmit={enviar}>
        <input type="hidden" name="funil_id" value={funil.id} />
        {lancamento && <input type="hidden" name="id" value={lancamento.id} />}

        <fieldset style={{ border: "none", padding: 0, margin: "0 0 14px" }}>
          <legend style={{ ...estiloRotulo, padding: 0 }}>Fonte da demanda</legend>
          {importado ? (
            <p style={{ marginTop: 6, fontSize: 13, color: "var(--text-2)" }}>
              Veio do arquivo do Meta, então fica em{" "}
              {fontes.find((f) => f.id === FONTE_TRAFEGO)?.nome ?? "Tráfego"}.
            </p>
          ) : (
            <div className={estilos.opcoesFonte}>
              {fontes.map((f) => (
                <label
                  key={f.id}
                  className={estilos.opcaoFonte}
                  data-ativa={fonte === f.id}
                >
                  <input
                    type="radio"
                    name="fonte"
                    value={f.id}
                    checked={fonte === f.id}
                    onChange={() => setFonte(f.id)}
                  />
                  {f.nome}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div style={grade}>
          <label style={estiloRotulo}>
            Data
            <input
              data-autofoco
              type="date"
              name="data"
              required
              className="glass-input"
              style={estiloCampo}
              defaultValue={lancamento?.data ?? dataPadrao}
            />
          </label>
          <label style={estiloRotulo}>
            {fonte === FONTE_TRAFEGO
              ? "Valor investido no tráfego"
              : "Custo desta fonte (opcional)"}
            <CampoMoeda
              name="investimento"
              className="glass-input"
              style={estiloCampo}
              defaultValue={lancamento?.investimento || undefined}
            />
          </label>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 20 }}>
          Quantidade em cada etapa
        </h3>
        <div style={{ ...grade, marginTop: 10 }}>
          {funil.etapas.map((etapa) => (
            <label key={etapa.id} style={estiloRotulo}>
              {etapa.nome}
              <CampoInteiro
                name={`etapa_${etapa.id}`}
                className="glass-input"
                style={estiloCampo}
                placeholder="0"
                defaultValue={lancamento?.valores?.[etapa.id] || undefined}
              />
            </label>
          ))}
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 20 }}>
          Contratos fechados
        </h3>
        <p style={{ marginTop: 4, fontSize: 12, color: "var(--text-3)" }}>
          Valor de cada contrato. Se a 1ª parcela for diferente das outras, informe
          as duas.
        </p>
        <div style={{ marginTop: 10 }}>
          <EditorContratos
            iniciais={lancamento ? contratosDoLancamento(lancamento) : []}
          />
        </div>

        <div style={{ ...grade, marginTop: 14 }}>
          <label style={estiloRotulo}>
            Contratos perdidos
            <CampoInteiro
              name="perdidos"
              className="glass-input"
              style={estiloCampo}
              placeholder="0"
              defaultValue={lancamento?.perdidos || undefined}
            />
          </label>
        </div>

        <label style={{ ...estiloRotulo, marginTop: 14 }}>
          Observações (opcional)
          <textarea
            name="observacoes"
            rows={2}
            maxLength={2000}
            className="glass-input"
            style={{ ...estiloCampo, resize: "vertical" }}
            defaultValue={lancamento?.observacoes ?? ""}
          />
        </label>

        <MensagemErro erro={erro} />

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 20,
          }}
        >
          <button type="button" className="btn-gold-outline" onClick={fechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-gold-filled"
            disabled={pending}
            style={{ opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Salvando…" : lancamento ? "Salvar" : "Lançar"}
          </button>
        </div>
      </form>
    </ModalComercial>
  )
}
