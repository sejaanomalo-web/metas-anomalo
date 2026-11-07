"use client"

import { useMemo } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import SectionHeader from "@/components/ui/SectionHeader"
import { formatBRL, formatNumero } from "@/lib/data"
import {
  agrupamentosDisponiveis,
  evolucaoDoFunil,
  filtrarPorFonte,
  formatarPct,
  gerarBaldes,
  resolverAgrupamento,
  resumirFunil,
  resumirPorFonte,
  type AgrupamentoFunil,
} from "@/lib/funil-calculo"
import {
  FONTE_TRAFEGO,
  fontesDoFunil,
  type FunilComercial,
  type LancamentoFunil,
} from "@/lib/funil-tipos"
import ComparativoFontes from "./ComparativoFontes"
import EvolucaoFunil from "./EvolucaoFunil"
import FunilCamadas from "./FunilCamadas"
import ListaLancamentos from "./ListaLancamentos"
import SecaoRecolhivel from "./SecaoRecolhivel"
import estilos from "./funis.module.css"

/**
 * Tudo que muda com a fonte de demanda. O servidor já entrega os lançamentos do
 * período inteiro, então trocar de fonte só refaz a conta aqui: é instantâneo e
 * não vai ao banco. A escolha fica na URL via replaceState, sem navegação, para
 * sobreviver a recarregar, a trocar o período e a compartilhar o link.
 */
export default function PainelFunil({
  funil,
  lancamentos,
  de,
  ate,
  dataPadrao,
}: {
  funil: FunilComercial
  lancamentos: LancamentoFunil[]
  de: string
  ate: string
  dataPadrao: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const fontes = fontesDoFunil(funil)
  const fonteUrl = searchParams.get("fonte")
  const fonte = fontes.find((f) => f.id === fonteUrl) ?? null
  const agrupamento = resolverAgrupamento(searchParams.get("agrupar"), { de, ate })

  function trocarParam(chave: string, valor: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) params.set(chave, valor)
    else params.delete(chave)
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`)
  }

  const visiveis = useMemo(
    () => filtrarPorFonte(lancamentos, fonte?.id ?? null),
    [lancamentos, fonte?.id]
  )
  const resumo = useMemo(
    () => resumirFunil(funil.etapas, visiveis),
    [funil.etapas, visiveis]
  )
  const porFonte = useMemo(
    () => resumirPorFonte(funil.etapas, fontes, lancamentos),
    [funil, lancamentos]
  )
  const evolucao = useMemo(
    () => evolucaoDoFunil(funil.etapas, visiveis, gerarBaldes(de, ate, agrupamento)),
    [funil.etapas, visiveis, de, ate, agrupamento]
  )
  const totalTopo = useMemo(
    () => resumirFunil(funil.etapas, lancamentos).etapas[0]?.valor ?? 0,
    [funil.etapas, lancamentos]
  )

  const semDados = resumo.registros === 0
  const primeira = resumo.etapas[0]
  const ultima = resumo.etapas[resumo.etapas.length - 1]
  const nomeTopo = funil.etapas[0]?.nome ?? "Topo"

  // Uma linha que diga o essencial com a seção fechada.
  const fatiasComDados = evolucao.filter((e) => e.resumo.registros > 0).length
  const nomeFatia = { dia: ["dia", "dias"], semana: ["semana", "semanas"], mes: ["mês", "meses"] }[agrupamento]
  const resumoEvolucao = `${evolucao.length} ${nomeFatia[evolucao.length === 1 ? 0 : 1]} · ${fatiasComDados} com lançamentos`
  const resumoLancamentos =
    visiveis.length === 0
      ? fonte
        ? `Nenhum lançamento de ${fonte.nome} neste período`
        : "Nenhum lançamento neste período"
      : `${visiveis.length} ${visiveis.length === 1 ? "lançamento" : "lançamentos"}${
          resumo.investimento > 0 ? ` · ${formatBRL(resumo.investimento)} investidos` : ""
        }`

  return (
    <>
      <section aria-label="Fonte da demanda">
        <div role="group" aria-label="Filtrar por fonte" className={estilos.fontes}>
          <button
            type="button"
            className={estilos.fonte}
            aria-pressed={fonte === null}
            onClick={() => trocarParam("fonte", null)}
          >
            <span>Todas as fontes</span>
            <strong>{formatNumero(totalTopo)}</strong>
          </button>
          {porFonte.map(({ fonte: f, resumo: r }) => (
            <button
              key={f.id}
              type="button"
              className={estilos.fonte}
              aria-pressed={fonte?.id === f.id}
              onClick={() => trocarParam("fonte", f.id)}
            >
              <span>{f.nome}</span>
              <strong>{formatNumero(r.etapas[0]?.valor ?? 0)}</strong>
            </button>
          ))}
        </div>
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)" }}>
          O número é {nomeTopo} no período.
        </p>
      </section>

      <section aria-label="Indicadores do período" className={estilos.kpis}>
        {[
          {
            rotulo:
              fonte?.id === FONTE_TRAFEGO ? "Investido no tráfego" : "Investido",
            valor: semDados ? "—" : formatBRL(resumo.investimento),
          },
          {
            rotulo: `Custo por ${primeira?.nome ?? "etapa"}`,
            valor: primeira?.custo != null ? formatBRL(primeira.custo) : "—",
          },
          {
            rotulo: `Custo por ${ultima?.nome ?? "etapa"}`,
            valor: ultima?.custo != null ? formatBRL(ultima.custo) : "—",
          },
          {
            rotulo: "Retorno sobre o investido",
            valor:
              resumo.retorno !== null
                ? `${resumo.retorno.toLocaleString("pt-BR", {
                    maximumFractionDigits: 2,
                  })}x`
                : "—",
          },
        ].map((k) => (
          <div key={k.rotulo} className={`glass ${estilos.kpi}`}>
            <p>{k.rotulo}</p>
            <p>{k.valor}</p>
          </div>
        ))}
      </section>

      <section>
        <SectionHeader
          titulo={fonte ? `Funil · ${fonte.nome}` : "Funil do período"}
          descricao={
            semDados
              ? fonte
                ? `Sem números de ${fonte.nome} neste período.`
                : "Ainda sem números neste período. Lance à mão ou importe do Meta."
              : "Porcentagem entre as etapas, somando os lançamentos do período"
          }
        />
        {resumo.gargalo && (
          <p
            role="status"
            style={{
              maxWidth: 760,
              margin: "0 auto 14px",
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 13,
              color: "#fecaca",
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.35)",
            }}
          >
            Maior gargalo: de <strong>{resumo.gargalo.de}</strong> para{" "}
            <strong>{resumo.gargalo.para}</strong>, só{" "}
            {formatarPct(resumo.gargalo.taxa)} avançaram.
          </p>
        )}
        <FunilCamadas resumo={resumo} />

        {!semDados && (
          <div className={estilos.resultados}>
            {[
              { rotulo: "Contratos perdidos", valor: formatNumero(resumo.perdidos) },
              {
                rotulo: "Taxa de fechamento",
                valor: formatarPct(resumo.taxaFechamento),
                nota: "fechados ÷ (fechados + perdidos)",
              },
              { rotulo: "Faturamento gerado", valor: formatBRL(resumo.faturamento) },
            ].map((c) => (
              <div key={c.rotulo} className="glass" style={{ padding: "14px 16px" }}>
                <p style={{ fontSize: 12, color: "var(--text-2)" }}>{c.rotulo}</p>
                <p
                  style={{
                    marginTop: 4,
                    fontSize: 20,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {c.valor}
                </p>
                {c.nota && (
                  <p style={{ marginTop: 2, fontSize: 11, color: "var(--text-3)" }}>
                    {c.nota}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {!fonte && !semDados && (
        <section>
          <SectionHeader
            titulo="Comparação entre fontes"
            descricao="O mesmo funil, por fonte. Toque no nome para abrir só ela."
          />
          <ComparativoFontes
            linhas={porFonte}
            aoEscolher={(id) => trocarParam("fonte", id)}
          />
        </section>
      )}

      {!semDados && (
        <SecaoRecolhivel
          chave="evolucao"
          titulo="Evolução no período"
          descricao="Compare dia a dia, semana a semana ou mês a mês"
          resumo={resumoEvolucao}
        >
          <EvolucaoFunil
            linhas={evolucao}
            agrupamento={agrupamento}
            disponiveis={agrupamentosDisponiveis({ de, ate })}
            aoEscolher={(a: AgrupamentoFunil) => trocarParam("agrupar", a)}
          />
        </SecaoRecolhivel>
      )}

      <SecaoRecolhivel
        chave="lancamentos"
        titulo="Lançamentos"
        descricao="O que foi registrado no período, por data"
        resumo={resumoLancamentos}
      >
        <ListaLancamentos
          funil={funil}
          lancamentos={visiveis}
          dataPadrao={dataPadrao}
          de={de}
          ate={ate}
          fontePadrao={fonte?.id ?? null}
          mensagemVazia={
            fonte
              ? `Nenhum lançamento de ${fonte.nome} neste período.`
              : "Nenhum lançamento neste período."
          }
        />
      </SecaoRecolhivel>
    </>
  )
}
