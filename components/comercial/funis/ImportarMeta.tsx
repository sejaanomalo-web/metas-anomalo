"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { formatBRL, formatNumero } from "@/lib/data"
import { formatarDataCurta } from "@/lib/funil-calculo"
import {
  COLUNA_CONTAGEM,
  LIMITE_DIAS_IMPORTACAO,
  consolidarPorData,
  decodificarTexto,
  listarCampanhas,
  montarPlanilha,
  parseDelimitado,
  sugerirMapeamento,
  type Celula,
  type Mapeamento,
  type Planilha,
} from "@/lib/funil-importacao"
import {
  conferirImportacaoAction,
  importarLancamentosAction,
} from "@/lib/funis-comerciais-actions"
import type { FunilComercial } from "@/lib/funil-tipos"
import ModalComercial, {
  MensagemErro,
  estiloCampo,
  estiloRotulo,
} from "./ModalComercial"
import estilos from "./funis.module.css"

const TAMANHO_MAXIMO = 30 * 1024 * 1024

const avisoEstilo: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.5,
  color: "#fcd34d",
  background: "rgba(245,158,11,0.10)",
  border: "1px solid rgba(245,158,11,0.35)",
}

const tituloBloco: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  margin: "18px 0 8px",
}

async function lerArquivo(arquivo: File): Promise<Celula[][]> {
  const nome = arquivo.name.toLowerCase()
  if (nome.endsWith(".xls")) {
    throw new Error(
      "Formato .xls antigo não é aceito. Exporte em .xlsx ou .csv pelo Gerenciador."
    )
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  // .xlsx é um zip: os bytes dizem mais do que a extensão.
  const ehZip = bytes[0] === 0x50 && bytes[1] === 0x4b
  if (nome.endsWith(".xlsx") || ehZip) {
    const { readSheet } = await import("read-excel-file/browser")
    return (await readSheet(arquivo)) as Celula[][]
  }
  return parseDelimitado(decodificarTexto(bytes))
}

/**
 * Importa um arquivo do Gerenciador em dois tempos: lê no navegador, mostra o
 * que entendeu, e só grava depois da confirmação. Nada do arquivo sai do
 * computador além dos totais por data.
 */
export default function ImportarMeta({
  funil,
  fechar,
  aoImportar,
}: {
  funil: FunilComercial
  fechar: () => void
  /** Recebe o intervalo das datas gravadas. */
  aoImportar: (de: string, ate: string) => void
}) {
  const [arquivoNome, setArquivoNome] = useState("")
  const [planilha, setPlanilha] = useState<Planilha | null>(null)
  const [mapa, setMapa] = useState<Mapeamento | null>(null)
  const [metricaPorEtapa, setMetricaPorEtapa] = useState<Record<string, number>>({})
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set())
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [conferencia, setConferencia] = useState<{
    jaImportadas: string[]
    comInvestimentoManual: string[]
  } | null>(null)
  const [pending, startTransition] = useTransition()

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(null)
    setPlanilha(null)
    setConferencia(null)
    if (arquivo.size > TAMANHO_MAXIMO) {
      setErro("Arquivo acima de 30 MB. Exporte um período menor.")
      return
    }
    setLendo(true)
    try {
      const r = montarPlanilha(await lerArquivo(arquivo))
      if ("erro" in r) {
        setErro(r.erro)
        return
      }
      const m = sugerirMapeamento(r.planilha)
      setArquivoNome(arquivo.name)
      setPlanilha(r.planilha)
      setMapa(m)
      setExcluidas(new Set())
      setMetricaPorEtapa(
        m.metricaPadrao !== null && funil.etapas[0]
          ? { [funil.etapas[0].id]: m.metricaPadrao }
          : {}
      )
    } catch (e) {
      console.error("[funis] ler arquivo", e)
      setErro(
        e instanceof Error && e.message.includes(".xls")
          ? e.message
          : "Não consegui ler este arquivo. Confira se ele não está corrompido."
      )
    } finally {
      setLendo(false)
    }
  }

  const campanhas = useMemo(
    () => (planilha && mapa ? listarCampanhas(planilha, mapa) : []),
    [planilha, mapa]
  )
  const resultado = useMemo(
    () =>
      planilha && mapa
        ? consolidarPorData(planilha, mapa, {
            metricaPorEtapa,
            campanhasExcluidas: excluidas,
          })
        : null,
    [planilha, mapa, metricaPorEtapa, excluidas]
  )

  // Confere de novo a cada mudança no conjunto de datas.
  const chaveDatas = resultado?.dias.map((d) => d.data).join(",") ?? ""
  useEffect(() => {
    if (!chaveDatas || chaveDatas.split(",").length > LIMITE_DIAS_IMPORTACAO) {
      setConferencia(null)
      return
    }
    let vivo = true
    conferirImportacaoAction(funil.id, chaveDatas.split(",")).then((r) => {
      if (!vivo) return
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível conferir as datas.")
        return
      }
      setConferencia({
        jaImportadas: r.jaImportadas ?? [],
        comInvestimentoManual: r.comInvestimentoManual ?? [],
      })
    })
    return () => {
      vivo = false
    }
  }, [chaveDatas, funil.id])

  const dias = resultado?.dias ?? []
  const totalInvestido = dias.reduce((s, d) => s + (d.investimento ?? 0), 0)
  const etapasMapeadas = funil.etapas.filter((e) => e.id in metricaPorEtapa)
  const temGasto = mapa?.colGasto !== null && mapa?.colGasto !== undefined
  const colunasRepetidas =
    new Set(Object.values(metricaPorEtapa)).size !==
    Object.values(metricaPorEtapa).length
  const excedeLimite = dias.length > LIMITE_DIAS_IMPORTACAO
  const podeImportar =
    dias.length > 0 &&
    !excedeLimite &&
    (temGasto || etapasMapeadas.length > 0) &&
    !pending

  function confirmar() {
    if (!podeImportar) return
    setErro(null)
    const selecionadas = campanhas
      .map((c) => c.nome)
      .filter((nome) => !excluidas.has(nome))
    startTransition(async () => {
      const r = await importarLancamentosAction({
        funilId: funil.id,
        arquivo: arquivoNome,
        campanhas: selecionadas,
        dias,
      })
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível importar.")
        return
      }
      aoImportar(dias[0].data, dias[dias.length - 1].data)
    })
  }

  const colunaSelect = (
    rotulo: string,
    valor: number | null,
    aoMudar: (v: number | null) => void,
    opcaoVazia?: string
  ) => (
    <label style={estiloRotulo}>
      {rotulo}
      <select
        aria-label={rotulo}
        className="glass-input"
        style={estiloCampo}
        value={valor ?? ""}
        onChange={(e) =>
          aoMudar(e.target.value === "" ? null : Number(e.target.value))
        }
      >
        {opcaoVazia && (
          <option value="" style={{ background: "#121826" }}>
            {opcaoVazia}
          </option>
        )}
        {planilha?.cabecalho.map((nome, i) =>
          nome ? (
            <option key={i} value={i} style={{ background: "#121826" }}>
              {nome}
            </option>
          ) : null
        )}
      </select>
    </label>
  )

  return (
    <ModalComercial
      titulo={`Importar do Meta em ${funil.nome}`}
      fechar={fechar}
      largura={760}
    >
      <label style={estiloRotulo}>
        Arquivo exportado (.csv ou .xlsx)
        <input
          data-autofoco
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,text/csv"
          className="glass-input"
          style={estiloCampo}
          onChange={(e) => escolherArquivo(e.target.files?.[0])}
        />
      </label>
      {!planilha && (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--text-2)",
          }}
        >
          <p>
            No Gerenciador de Anúncios, use <strong>Exportar dados da tabela</strong>.
            Para separar por data, antes escolha{" "}
            <strong>Detalhamento → Por tempo → Dia</strong>.
          </p>
          <p style={{ marginTop: 8 }}>
            Também aceita o arquivo de leads do formulário instantâneo. O arquivo
            é lido aqui no navegador, e só os totais por data vão para o sistema.
          </p>
        </div>
      )}
      {lendo && (
        <p role="status" style={{ marginTop: 12, fontSize: 13, color: "var(--text-2)" }}>
          Lendo o arquivo…
        </p>
      )}

      {planilha && mapa && resultado && (
        <>
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--text-2)" }}>
            {planilha.tipo === "leads"
              ? `Arquivo de leads: ${formatNumero(planilha.linhas.length)} leads. Ele não traz gasto, então o investimento já lançado em cada data fica como está.`
              : `Relatório de campanhas: ${formatNumero(planilha.linhas.length)} linhas.`}
          </p>

          <h3 style={tituloBloco}>Colunas do arquivo</h3>
          <div className={estilos.grade2}>
            {mapa.colData !== null || mapa.colFim === null
              ? colunaSelect(
                  "Data",
                  mapa.colData,
                  (v) => setMapa({ ...mapa, colData: v }),
                  "Escolha a coluna"
                )
              : colunaSelect(
                  "Data (sem detalhe por dia)",
                  mapa.colFim,
                  (v) => setMapa({ ...mapa, colFim: v })
                )}
            {planilha.tipo === "campanhas" &&
              colunaSelect(
                "Valor investido",
                mapa.colGasto,
                (v) => setMapa({ ...mapa, colGasto: v }),
                "Não importar"
              )}
          </div>

          <h3 style={tituloBloco}>O que entra em cada etapa</h3>
          <div className={estilos.grade2}>
            {funil.etapas.map((etapa) => {
              const atual = metricaPorEtapa[etapa.id]
              return (
                <label key={etapa.id} style={estiloRotulo}>
                  {etapa.nome}
                  <select
                    aria-label={etapa.nome}
                    className="glass-input"
                    style={estiloCampo}
                    value={atual ?? ""}
                    onChange={(e) =>
                      setMetricaPorEtapa((anterior) => {
                        const proximo = { ...anterior }
                        if (e.target.value === "") delete proximo[etapa.id]
                        else proximo[etapa.id] = Number(e.target.value)
                        return proximo
                      })
                    }
                  >
                    <option value="" style={{ background: "#121826" }}>
                      Não importar
                    </option>
                    {mapa.metricas.map((m) => (
                      <option
                        key={m.indice}
                        value={m.indice}
                        style={{ background: "#121826" }}
                      >
                        {m.indice === COLUNA_CONTAGEM
                          ? m.nome
                          : `${m.nome} (${formatNumero(m.total)})`}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>

          {campanhas.length > 0 && (
            <>
              <h3 style={tituloBloco}>
                Campanhas deste funil ({campanhas.length - excluidas.size} de{" "}
                {campanhas.length})
              </h3>
              <div className={estilos.listaCampanhas}>
                {campanhas.map((c) => (
                  <label key={c.nome}>
                    <input
                      type="checkbox"
                      checked={!excluidas.has(c.nome)}
                      onChange={(e) =>
                        setExcluidas((anterior) => {
                          const proximo = new Set(anterior)
                          if (e.target.checked) proximo.delete(c.nome)
                          else proximo.add(c.nome)
                          return proximo
                        })
                      }
                    />
                    <span>{c.nome}</span>
                    {temGasto && (
                      <span style={{ color: "var(--text-2)", fontSize: 12 }}>
                        {formatBRL(c.investimento)}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </>
          )}

          <h3 style={tituloBloco}>Como vai ficar</h3>
          <div className={estilos.resumoImportacao}>
            <div>
              <span>Datas</span>
              <strong>{formatNumero(dias.length)}</strong>
            </div>
            <div>
              <span>Período</span>
              <strong>
                {dias.length === 0
                  ? "—"
                  : dias.length === 1
                    ? formatarDataCurta(dias[0].data)
                    : `${formatarDataCurta(dias[0].data)} a ${formatarDataCurta(dias[dias.length - 1].data)}`}
              </strong>
            </div>
            <div>
              <span>Investido</span>
              <strong>{temGasto ? formatBRL(totalInvestido) : "—"}</strong>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {resultado.linhasSemDetalheDiario > 0 && (
              <p style={avisoEstilo}>
                Este arquivo não separa por dia: {resultado.linhasSemDetalheDiario}{" "}
                linha(s) cobrem vários dias e tudo entra na data final. Para ver
                semana a semana, exporte com Detalhamento → Por tempo → Dia.
              </p>
            )}
            {resultado.indicadoresMisturados.length > 0 &&
              planilha.cabecalho.some(
                (nome, i) =>
                  Object.values(metricaPorEtapa).includes(i) &&
                  /resultado|result/i.test(nome)
              ) && (
                <p style={avisoEstilo}>
                  As campanhas marcadas têm tipos de resultado diferentes (
                  {resultado.indicadoresMisturados.join(", ")}). Somar Resultados
                  mistura esses tipos: desmarque as que não são deste funil.
                </p>
              )}
            {colunasRepetidas && (
              <p style={avisoEstilo}>
                A mesma coluna está em duas etapas, e as duas vão mostrar o mesmo
                número.
              </p>
            )}
            {conferencia && conferencia.comInvestimentoManual.length > 0 && temGasto && (
              <p style={avisoEstilo}>
                {conferencia.comInvestimentoManual.length} data(s) já têm
                investimento lançado à mão (
                {conferencia.comInvestimentoManual
                  .slice(0, 3)
                  .map(formatarDataCurta)
                  .join(", ")}
                {conferencia.comInvestimentoManual.length > 3 ? "…" : ""}). O valor
                vai contar em dobro nessas datas se for o mesmo gasto.
              </p>
            )}
            {conferencia && conferencia.jaImportadas.length > 0 && (
              <p
                style={{
                  ...avisoEstilo,
                  color: "var(--text-2)",
                  background: "transparent",
                  borderColor: "var(--card-border)",
                }}
              >
                {conferencia.jaImportadas.length} data(s) já foram importadas e
                serão atualizadas, sem somar.
              </p>
            )}
            {resultado.ignoradas > 0 && (
              <p style={{ fontSize: 12, color: "var(--text-2)" }}>
                {resultado.ignoradas} linha(s) ficaram de fora: resumo do relatório
                ou sem data legível.
              </p>
            )}
            {excedeLimite && (
              <p style={avisoEstilo}>
                São mais de {LIMITE_DIAS_IMPORTACAO} datas. Exporte um período menor.
              </p>
            )}
          </div>

          {dias.length > 0 && (
            <div className={estilos.previa} style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    {temGasto && <th scope="col">Investido</th>}
                    {etapasMapeadas.map((e) => (
                      <th key={e.id} scope="col">
                        {e.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dias.slice(0, 100).map((d) => (
                    <tr key={d.data}>
                      <td>{formatarDataCurta(d.data)}</td>
                      {temGasto && <td>{formatBRL(d.investimento ?? 0)}</td>}
                      {etapasMapeadas.map((e) => (
                        <td key={e.id}>{formatNumero(d.valores[e.id] ?? 0)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {dias.length > 100 && (
            <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-2)" }}>
              Mostrando as 100 primeiras de {formatNumero(dias.length)} datas.
            </p>
          )}
        </>
      )}

      <MensagemErro erro={erro} />

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          marginTop: 20,
          flexWrap: "wrap",
        }}
      >
        <button type="button" className="btn-gold-outline" onClick={fechar}>
          Cancelar
        </button>
        {planilha && (
          <button
            type="button"
            className="btn-gold-filled"
            disabled={!podeImportar}
            style={{ opacity: podeImportar ? 1 : 0.5 }}
            onClick={confirmar}
          >
            {pending
              ? "Importando…"
              : `Importar ${formatNumero(dias.length)} data(s)`}
          </button>
        )}
      </div>
    </ModalComercial>
  )
}
