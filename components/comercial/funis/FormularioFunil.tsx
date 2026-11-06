"use client"

import { useRef, useState, useTransition } from "react"
import { salvarFunilAction } from "@/lib/funis-comerciais-actions"
import {
  ETAPAS_PADRAO,
  FONTES_PADRAO,
  FONTE_TRAFEGO,
  MAX_ETAPAS,
  MAX_FONTES,
  MAX_NOME_FONTE,
  MAX_NOME_ETAPA,
  MAX_NOME_FUNIL,
  MIN_ETAPAS,
  type FunilComercial,
  fontesDoFunil,
} from "@/lib/funil-tipos"
import ModalComercial, {
  MensagemErro,
  estiloCampo,
  estiloRotulo,
} from "./ModalComercial"

type LinhaEtapa = { chave: string; id?: string; nome: string }

const estiloBotaoEtapa: React.CSSProperties = {
  width: 34,
  height: 38,
  flexShrink: 0,
  color: "var(--text-2)",
  background: "transparent",
  border: "1px solid var(--input-border)",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 14,
}

/** Cria ou edita um funil: nome, descrição e a lista ordenada de etapas. */
export default function FormularioFunil({
  funil,
  usuarioId,
  fechar,
  aoSalvar,
}: {
  funil?: FunilComercial
  /** Dono do funil novo quando um admin cria para outra pessoa. */
  usuarioId?: string
  fechar: () => void
  aoSalvar: (id: string) => void
}) {
  const proximaChave = useRef(0)
  const novaChave = () => `nova-${proximaChave.current++}`

  const [nome, setNome] = useState(funil?.nome ?? "")
  const [descricao, setDescricao] = useState(funil?.descricao ?? "")
  const [etapas, setEtapas] = useState<LinhaEtapa[]>(() =>
    funil
      ? funil.etapas.map((e) => ({ chave: e.id, id: e.id, nome: e.nome }))
      : ETAPAS_PADRAO.map((n) => ({ chave: novaChave(), nome: n }))
  )
  const [fontes, setFontes] = useState<LinhaEtapa[]>(() =>
    (funil ? fontesDoFunil(funil) : [...FONTES_PADRAO]).map((f) => ({
      chave: f.id,
      id: f.id,
      nome: f.nome,
    }))
  )
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const removidasComHistorico = (funil?.etapas ?? []).filter(
    (original) => !etapas.some((e) => e.id === original.id)
  )

  function mover(indice: number, delta: -1 | 1) {
    setEtapas((atual) => {
      const copia = [...atual]
      const [item] = copia.splice(indice, 1)
      copia.splice(indice + delta, 0, item)
      return copia
    })
  }

  function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    setErro(null)
    startTransition(async () => {
      const r = await salvarFunilAction({
        id: funil?.id,
        usuarioId,
        nome,
        descricao,
        etapas: etapas.map((e) => ({ id: e.id, nome: e.nome })),
        fontes: fontes.map((f) => ({ id: f.id, nome: f.nome })),
      })
      if (!r.ok || !r.id) {
        setErro(r.erro ?? "Não foi possível salvar.")
        return
      }
      aoSalvar(r.id)
    })
  }

  return (
    <ModalComercial
      titulo={funil ? `Editar funil` : "Novo funil"}
      fechar={fechar}
    >
      <form onSubmit={enviar}>
        <label style={estiloRotulo}>
          Nome do funil
          <input
            data-autofoco
            className="glass-input"
            style={estiloCampo}
            value={nome}
            maxLength={MAX_NOME_FUNIL}
            required
            placeholder="Ex.: Campanha do sistema"
            onChange={(e) => setNome(e.target.value)}
          />
        </label>

        <label style={{ ...estiloRotulo, marginTop: 14 }}>
          Descrição (opcional)
          <input
            className="glass-input"
            style={estiloCampo}
            value={descricao}
            maxLength={300}
            placeholder="O que este funil acompanha"
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>

        <fieldset style={{ marginTop: 18, border: "none", padding: 0 }}>
          <legend style={{ ...estiloRotulo, padding: 0 }}>
            Etapas, do topo ao fechamento
          </legend>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
            A última etapa conta como o fechamento do funil.
          </p>
          <ol style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
            {etapas.map((etapa, i) => (
              <li
                key={etapa.chave}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: i === 0 ? 0 : 6,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 20,
                    flexShrink: 0,
                    fontSize: 12,
                    textAlign: "right",
                    color: "var(--text-3)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {i + 1}
                </span>
                <input
                  className="glass-input"
                  aria-label={`Nome da etapa ${i + 1}`}
                  style={{ flex: 1, minWidth: 0, padding: "8px 12px", fontSize: 13 }}
                  value={etapa.nome}
                  maxLength={MAX_NOME_ETAPA}
                  required
                  onChange={(e) =>
                    setEtapas((atual) =>
                      atual.map((x) =>
                        x.chave === etapa.chave
                          ? { ...x, nome: e.target.value }
                          : x
                      )
                    )
                  }
                />
                <button
                  type="button"
                  style={{ ...estiloBotaoEtapa, opacity: i === 0 ? 0.35 : 1 }}
                  disabled={i === 0}
                  aria-label={`Subir ${etapa.nome || `etapa ${i + 1}`}`}
                  onClick={() => mover(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  style={{
                    ...estiloBotaoEtapa,
                    opacity: i === etapas.length - 1 ? 0.35 : 1,
                  }}
                  disabled={i === etapas.length - 1}
                  aria-label={`Descer ${etapa.nome || `etapa ${i + 1}`}`}
                  onClick={() => mover(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  style={{
                    ...estiloBotaoEtapa,
                    opacity: etapas.length <= MIN_ETAPAS ? 0.35 : 1,
                  }}
                  disabled={etapas.length <= MIN_ETAPAS}
                  aria-label={`Remover ${etapa.nome || `etapa ${i + 1}`}`}
                  onClick={() =>
                    setEtapas((atual) =>
                      atual.filter((x) => x.chave !== etapa.chave)
                    )
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn-ghost"
            style={{ marginTop: 10, padding: "9px 14px", opacity: etapas.length >= MAX_ETAPAS ? 0.45 : 1 }}
            disabled={etapas.length >= MAX_ETAPAS}
            onClick={() =>
              setEtapas((atual) => [...atual, { chave: novaChave(), nome: "" }])
            }
          >
            + Adicionar etapa
          </button>
        </fieldset>

        <fieldset style={{ marginTop: 18, border: "none", padding: 0 }}>
          <legend style={{ ...estiloRotulo, padding: 0 }}>Fontes de demanda</legend>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
            Todas usam as mesmas etapas. Tráfego fica sempre, porque a importação
            do Meta entra nela.
          </p>
          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
            {fontes.map((fonte, i) => (
              <li
                key={fonte.chave}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: i === 0 ? 0 : 6,
                }}
              >
                <input
                  className="glass-input"
                  aria-label={`Nome da fonte ${i + 1}`}
                  style={{ flex: 1, minWidth: 0, padding: "8px 12px", fontSize: 13 }}
                  value={fonte.nome}
                  maxLength={MAX_NOME_FONTE}
                  required
                  onChange={(e) =>
                    setFontes((atual) =>
                      atual.map((x) =>
                        x.chave === fonte.chave
                          ? { ...x, nome: e.target.value }
                          : x
                      )
                    )
                  }
                />
                <button
                  type="button"
                  style={{
                    ...estiloBotaoEtapa,
                    opacity: fonte.id === FONTE_TRAFEGO ? 0.35 : 1,
                  }}
                  disabled={fonte.id === FONTE_TRAFEGO}
                  aria-label={`Remover fonte ${fonte.nome || i + 1}`}
                  onClick={() =>
                    setFontes((atual) =>
                      atual.filter((x) => x.chave !== fonte.chave)
                    )
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-ghost"
            style={{
              marginTop: 10,
              padding: "9px 14px",
              opacity: fontes.length >= MAX_FONTES ? 0.45 : 1,
            }}
            disabled={fontes.length >= MAX_FONTES}
            onClick={() =>
              setFontes((atual) => [...atual, { chave: novaChave(), nome: "" }])
            }
          >
            + Adicionar fonte
          </button>
        </fieldset>

        {removidasComHistorico.length > 0 && (
          <p
            style={{
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              color: "#fcd34d",
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.35)",
            }}
          >
            Ao salvar, os números já lançados em{" "}
            <strong>{removidasComHistorico.map((e) => e.nome).join(", ")}</strong>{" "}
            deixam de aparecer no funil.
          </p>
        )}

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
            {pending ? "Salvando…" : funil ? "Salvar funil" : "Criar funil"}
          </button>
        </div>
      </form>
    </ModalComercial>
  )
}
