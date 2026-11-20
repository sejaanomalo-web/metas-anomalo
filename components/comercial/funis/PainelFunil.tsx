"use client"

import { useMemo } from "react"
import { usePathname, useSearchParams } from "next/navigation"
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
import { lerVista } from "./AbasVista"
import Bloco from "./Bloco"
import ComparativoFontes from "./ComparativoFontes"
import EvolucaoFunil from "./EvolucaoFunil"
import FunilCamadas from "./FunilCamadas"
import ListaLancamentos from "./ListaLancamentos"
import estilos from "./funis.module.css"

function vezes(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: n >= 10 ? 0 : 2 })}x`
}

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
  const vista = lerVista(searchParams.get("vista"))
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
  const comDados = porFonte.filter((p) => p.resumo.registros > 0)
  const destaque = [...comDados].sort(
    (a, b) =>
      b.resumo.totalContratado - a.resumo.totalContratado ||
      (b.resumo.etapas[0]?.valor ?? 0) - (a.resumo.etapas[0]?.valor ?? 0)
  )[0]
  const resumoComparativo = !destaque
    ? `${porFonte.length} fontes`
    : `${comDados.length} de ${porFonte.length} fontes com números · ${
        destaque.resumo.totalContratado > 0
          ? `mais contratado: ${destaque.fonte.nome} (${formatBRL(destaque.resumo.totalContratado)})`
          : `mais ${nomeTopo}: ${destaque.fonte.nome} (${formatNumero(destaque.resumo.etapas[0]?.valor ?? 0)})`
      }`
  const resumoLancamentos =
    visiveis.length === 0
      ? fonte
        ? `Nenhum lançamento de ${fonte.nome} neste período`
        : "Nenhum lançamento neste período"
      : `${visiveis.length} ${visiveis.length === 1 ? "lançamento" : "lançamentos"}${
          resumo.investimento > 0 ? ` · ${formatBRL(resumo.investimento)} investidos` : ""
        }`

  const filtroFontes = (
    <div role="group" aria-label="Filtrar por fonte" className={estilos.fontes}>
      <button
        type="button"
        className={estilos.fonte}
        aria-pressed={fonte === null}
        onClick={() => trocarParam("fonte", null)}
      >
        <span>Todas as fontes</span>
        <strong>{formatNumero(totalTopo)}</strong>
        <i className={estilos.fonteBarra} aria-hidden>
          <b style={{ width: totalTopo > 0 ? "100%" : "0%" }} />
        </i>
      </button>
      {porFonte.map(({ fonte: f, resumo: r }) => {
        const n = r.etapas[0]?.valor ?? 0
        const parte = totalTopo > 0 ? n / totalTopo : 0
        return (
          <button
            key={f.id}
            type="button"
            className={estilos.fonte}
            aria-pressed={fonte?.id === f.id}
            onClick={() => trocarParam("fonte", f.id)}
          >
            <span>{f.nome}</span>
            <strong>
              {formatNumero(n)}
              {totalTopo > 0 && <small>{formatarPct(parte)}</small>}
            </strong>
            <i className={estilos.fonteBarra} aria-hidden>
              <b style={{ width: `${Math.round(parte * 100)}%` }} />
            </i>
          </button>
        )
      })}
    </div>
  )

  const kpis = [
    {
      rotulo: fonte?.id === FONTE_TRAFEGO ? "Investido no tráfego" : "Investido",
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
      rotulo: "Retorno do total contratado",
      valor: resumo.retorno !== null ? vezes(resumo.retorno) : "—",
      destaque: resumo.retorno !== null,
    },
  ]

  const resultados = [
    {
      rotulo: "Entrada no 1º mês",
      valor: formatBRL(resumo.faturamento),
      nota:
        resumo.retornoPrimeiroMes !== null && resumo.faturamento > 0
          ? `${vezes(resumo.retornoPrimeiroMes)} o investido`
          : "soma das 1ªs parcelas",
    },
    {
      rotulo: "Recorrência mensal",
      valor: formatBRL(resumo.recorrencia),
      nota: "por mês, a partir do 2º mês",
    },
    {
      rotulo: "Total contratado",
      valor: formatBRL(resumo.totalContratado),
      nota: "todas as parcelas até o fim",
      principal: true,
    },
    {
      rotulo: "Ticket médio do contrato",
      valor: resumo.ticketMedio !== null ? formatBRL(resumo.ticketMedio) : "—",
      nota:
        resumo.contratos > 0
          ? `${formatNumero(resumo.contratos)} ${
              resumo.contratos === 1 ? "contrato" : "contratos"
            } com valor`
          : undefined,
    },
  ]

  const lista = (
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
  )

  // Filtro de fonte ativo: aparece em todas as abas, com um toque para limpar.
  const seloFonte = fonte ? (
    <button
      type="button"
      className={estilos.seloFonte}
      onClick={() => trocarParam("fonte", null)}
      aria-label={`Filtrando por ${fonte.nome}. Remover filtro`}
    >
      Fonte: <strong>{fonte.nome}</strong> <span aria-hidden>×</span>
    </button>
  ) : undefined

  if (vista === "demanda") {
    return (
      <div className={estilos.vista}>
        <Bloco
          titulo="De onde vem a demanda"
          descricao={`Quantos ${nomeTopo.toLowerCase()} cada fonte trouxe. Toque numa fonte para filtrar todas as abas.`}
        >
          {filtroFontes}
        </Bloco>
      </div>
    )
  }

  if (vista === "investimento") {
    return (
      <div className={estilos.vista}>
        <Bloco
          titulo="Investimento e custo"
          descricao="Quanto foi investido, quanto custou cada etapa e quanto voltou"
          extra={seloFonte}
        >
          <div className={estilos.kpis}>
            {kpis.map((k) => (
              <div
                key={k.rotulo}
                className={`glass ${estilos.kpi}`}
                data-destaque={k.destaque || undefined}
              >
                <p>{k.rotulo}</p>
                <p>{k.valor}</p>
              </div>
            ))}
          </div>
        </Bloco>
      </div>
    )
  }

  if (vista === "analise") {
    return (
      <div className={estilos.vista}>
        {!fonte && !semDados && (
          <Bloco
            titulo="Comparação entre fontes"
            descricao={`O mesmo funil, fonte por fonte. Toque no nome para abrir só ela · ${resumoComparativo}`}
          >
            <ComparativoFontes
              linhas={porFonte}
              aoEscolher={(id) => trocarParam("fonte", id)}
            />
          </Bloco>
        )}

        {!semDados && (
          <Bloco
            titulo="Evolução no período"
            descricao={`Compare dia a dia, semana a semana ou mês a mês · ${resumoEvolucao}`}
            extra={seloFonte}
          >
            <EvolucaoFunil
              linhas={evolucao}
              agrupamento={agrupamento}
              disponiveis={agrupamentosDisponiveis({ de, ate })}
              aoEscolher={(a: AgrupamentoFunil) => trocarParam("agrupar", a)}
            />
          </Bloco>
        )}

        <Bloco
          titulo="Lançamentos"
          descricao={`O que foi registrado, por data · ${resumoLancamentos}`}
          extra={semDados ? seloFonte : undefined}
        >
          {lista}
        </Bloco>
      </div>
    )
  }

  return (
    <div className={estilos.vista}>
      <Bloco
        titulo={fonte ? `Funil · ${fonte.nome}` : "Funil do período"}
        descricao={
          semDados
            ? fonte
              ? `Sem números de ${fonte.nome} neste período.`
              : "Ainda sem números neste período. Use o ⋯ e “Lançar números” para começar."
            : "Quantos passaram de uma etapa para a outra, somando os lançamentos do período"
        }
        extra={
          seloFonte || resumo.gargalo ? (
            <div className={estilos.blocoExtras}>
              {seloFonte}
              {resumo.gargalo && (
                <p role="status" className={estilos.gargalo}>
                  <span aria-hidden>●</span> Maior gargalo:{" "}
                  <strong>{resumo.gargalo.de}</strong> → <strong>{resumo.gargalo.para}</strong> ·{" "}
                  {formatarPct(resumo.gargalo.taxa)} avançaram
                </p>
              )}
            </div>
          ) : undefined
        }
      >
        <div className={estilos.funilGrade} data-sem-dados={semDados || undefined}>
          <div className={`glass ${estilos.funilCartao}`}>
            <FunilCamadas resumo={resumo} />
          </div>

          {!semDados && (
            <aside aria-label="Resultado do funil" className={estilos.resultados} data-resultados>
              <p className={estilos.resultadosTitulo}>Resultado</p>
              {resultados.map((c) => (
                <div
                  key={c.rotulo}
                  className={`glass ${estilos.resultado}`}
                  data-principal={c.principal || undefined}
                >
                  <p className={estilos.resultadoRotulo}>{c.rotulo}</p>
                  <p className={estilos.resultadoValor}>{c.valor}</p>
                  {c.nota && <p className={estilos.resultadoNota}>{c.nota}</p>}
                </div>
              ))}
            </aside>
          )}
        </div>
      </Bloco>

      {semDados && (
        <Bloco titulo="Lançamentos" descricao={resumoLancamentos}>
          {lista}
        </Bloco>
      )}
    </div>
  )
}
