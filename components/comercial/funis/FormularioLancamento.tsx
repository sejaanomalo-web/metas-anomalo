"use client"

import { useState, useTransition } from "react"
import CampoInteiro from "@/components/inputs/CampoInteiro"
import CampoMoeda from "@/components/inputs/CampoMoeda"
import { salvarLancamentoAction } from "@/lib/funis-comerciais-actions"
import type { FunilComercial, LancamentoFunil } from "@/lib/funil-tipos"
import ModalComercial, {
  MensagemErro,
  estiloCampo,
  estiloRotulo,
} from "./ModalComercial"

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
  fechar,
  aoSalvar,
}: {
  funil: FunilComercial
  lancamento?: LancamentoFunil
  dataPadrao: string
  fechar: () => void
  aoSalvar: () => void
}) {
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
            Valor investido no tráfego
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

        <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 20 }}>Resultado</h3>
        <div style={{ ...grade, marginTop: 10 }}>
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
          <label style={estiloRotulo}>
            Faturamento gerado
            <CampoMoeda
              name="faturamento"
              className="glass-input"
              style={estiloCampo}
              defaultValue={lancamento?.faturamento || undefined}
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
