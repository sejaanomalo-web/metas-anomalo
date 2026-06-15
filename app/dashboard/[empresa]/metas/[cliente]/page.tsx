import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import TabsMetas from "@/components/TabsMetas"
import ToggleOrigem from "@/components/ToggleOrigem"
import CenarioReal from "@/components/CenarioReal"
import GraficoFaturamento from "@/components/GraficoFaturamento"
import TabelaMeses from "@/components/TabelaMeses"
import DrawerEditarMeta from "@/components/DrawerEditarMeta"
import { requererPermissao } from "@/lib/auth"
import {
  anoTemProjecao,
  origemValida,
  type LinhaAton,
  type LinhaDiego,
  type LinhaHato,
  type LinhaPadrao,
  type Mes,
} from "@/lib/data"
import { type DadosReais } from "@/lib/supabase"
import { parsePeriodo } from "@/lib/periodo"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import { getClientePorSlug, clienteDisplayName } from "@/lib/clientes"
import {
  getMetasOverrideCliente,
  getRealizadoAnualClienteFaturamento,
  getRealizadoClienteComoDadosReais,
} from "@/lib/metas-cliente"
import {
  construirTabelaMetas,
  esqueletoMeses,
  extrairMetaComparavel,
} from "@/lib/metas-tabela"

export const dynamic = "force-dynamic"

/**
 * Dashboard de METAS de UM cliente de tráfego — semelhante ao dashboard
 * principal de cada empresa (CenarioReal + gráfico + tabela/editor), mas a
 * nível de cliente. Realizado por origem: PAGO (tráfego + comercial 'Anúncios')
 * e ORGÂNICO (comercial), alternado pelo ToggleOrigem. As metas (overrides) são
 * editadas pelo DrawerEditarMeta na variante clienteId (salva em metas_cliente).
 */
export default async function MetasClientePage({
  params,
  searchParams,
}: {
  params: { empresa: string; cliente: string }
  searchParams: {
    mes?: string
    ano?: string
    origem?: string
    de?: string
    ate?: string
    modo?: string
  }
}) {
  await requererPermissao("dashboard_empresa_detalhe")

  const empresa = await getEmpresaAsync(params.empresa)
  if (!empresa) notFound()

  const cliente = await getClientePorSlug(empresa.nome, params.cliente)
  if (!cliente) notFound()

  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano
  const origem = origemValida(searchParams?.origem)
  const temProjecao = anoTemProjecao(ano)
  const nome = clienteDisplayName(cliente)

  const [overrides, real, fatAnual] = await Promise.all([
    getMetasOverrideCliente(cliente.id, ano, origem),
    getRealizadoClienteComoDadosReais(
      cliente,
      periodo.de,
      periodo.ate,
      mes,
      ano,
      origem
    ),
    getRealizadoAnualClienteFaturamento(cliente.id, ano, origem),
  ])

  // Clientes não têm projeção hardcoded — partimos do skeleton de meses e
  // aplicamos os overrides (metas_cliente) por cima, igual às empresas
  // adicionadas via UI no dashboard da empresa.
  const baseDados = esqueletoMeses(empresa.tipo)
  const dados = baseDados.map((linha) => {
    const ov = overrides.get(linha.mes)
    return ov ? { ...linha, ...ov } : linha
  }) as typeof baseDados

  // Pontos do gráfico: meta (faturamento projetado) vs real (faturamento do
  // comercial por mês). Mesma lógica do dashboard da empresa.
  const pontos = (dados as { mes: string }[]).map((linha) => {
    let meta = 0
    if (empresa.tipo === "leads-reunioes-contratos") {
      meta = (linha as LinhaPadrao).faturamento
    } else if (empresa.tipo === "aton") {
      meta = (linha as LinhaAton).faturamento
    } else if (empresa.tipo === "hato") {
      meta = (linha as LinhaHato).receita
    } else if (empresa.tipo === "diego") {
      meta = (linha as LinhaDiego).receita_hub
    }
    const fat = fatAnual.get(linha.mes as Mes)
    return {
      mes: linha.mes.slice(0, 3),
      meta,
      real: fat && fat > 0 ? fat : null,
    }
  })

  const { colunas, linhas } = construirTabelaMetas(empresa.tipo, dados)
  const metaComparavel = extrairMetaComparavel(empresa.tipo, dados, mes)

  // O CenarioReal/tabela comparam meta × realizado do mês corrente. Só o mês
  // corrente recebe o DadosReais agregado do período (demais meses ficam sem
  // realizado, como na variante orgânica do dashboard da empresa).
  const mapaReais = new Map<string, DadosReais>()
  if (real) mapaReais.set(mes, real)

  return (
    <>
      <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
        <div className="hero-banner">
          <Link
            href={`/dashboard/${empresa.slug}/metas?mes=${mes}&ano=${ano}`}
            style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}
            className="hover:text-[#C9953A] transition"
          >
            ← Metas por cliente · {empresa.nome}
          </Link>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ fontSize: 36 }}>{nome}</h1>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 8 }}>
            Cliente de {empresa.nome} · meta vs realizado ({mes} {ano})
          </p>

          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <TabsMetas slug={empresa.slug} mes={mes} ano={ano} temClientes />
              {empresa.tipo !== "diego" && <ToggleOrigem origem={origem} />}
            </div>
            <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
          </div>
        </div>

        <section
          className="grid grid-cols-1 lg:grid-cols-2"
          style={{ gap: 20, alignItems: "stretch" }}
        >
          <CenarioReal
            dados={real}
            meta={metaComparavel}
            mes={mes}
            ano={ano}
            origem={origem}
          />
          {temProjecao && pontos.length > 0 ? (
            <GraficoFaturamento dados={pontos} />
          ) : (
            <div
              className="glass h-full flex items-center justify-center"
              style={{ padding: 28 }}
            >
              <p
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.25)",
                  fontWeight: 300,
                  fontStyle: "italic",
                  textAlign: "center",
                }}
              >
                Planejamento futuro · sem projeção definida para {ano}.
              </p>
            </div>
          )}
        </section>

        {linhas.length > 0 && (
          <section>
            <TabelaMeses
              colunas={colunas}
              linhas={linhas}
              reais={mapaReais}
              mesAtual={mes}
              origem={origem}
              acao={
                <DrawerEditarMeta
                  clienteId={cliente.id}
                  empresaNome={nome}
                  tipoEmpresa={empresa.tipo}
                  ano={ano}
                  mesInicial={mes}
                  origem={origem}
                  linhasPorMes={Object.fromEntries(
                    (
                      linhas as unknown as Record<string, number | string>[]
                    ).map((l) => {
                      const chave = String(l.mes ?? "")
                      const numericos: Record<string, number> = {}
                      for (const [k, v] of Object.entries(l)) {
                        if (k === "mes") continue
                        if (typeof v === "number") numericos[k] = v
                      }
                      return [chave, numericos]
                    })
                  )}
                />
              }
            />
          </section>
        )}
      </main>

      <footer className="mx-auto px-8 py-8 text-center" style={{ maxWidth: 1280 }}>
        <p style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 400 }}>
          Anômalo Hub · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  )
}
