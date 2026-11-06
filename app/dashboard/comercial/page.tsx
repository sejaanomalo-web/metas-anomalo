import AbasArea from "@/components/AbasArea"
import BarraFunis from "@/components/comercial/funis/BarraFunis"
import EvolucaoFunil from "@/components/comercial/funis/EvolucaoFunil"
import FunilCamadas from "@/components/comercial/funis/FunilCamadas"
import ListaLancamentos from "@/components/comercial/funis/ListaLancamentos"
import SeletorPeriodoFunil from "@/components/comercial/funis/SeletorPeriodoFunil"
import SeletorUsuarioFunil from "@/components/comercial/funis/SeletorUsuarioFunil"
import estilos from "@/components/comercial/funis/funis.module.css"
import SectionHeader from "@/components/ui/SectionHeader"
import { requererPermissao } from "@/lib/auth"
import { formatBRL, formatNumero } from "@/lib/data"
import {
  agrupamentosDisponiveis,
  evolucaoDoFunil,
  formatarPct,
  gerarBaldes,
  hojeBRT,
  parsePeriodoFunil,
  periodoParaParams,
  resolverAgrupamento,
  resumirFunil,
  type AgrupamentoFunil,
} from "@/lib/funil-calculo"
import {
  contarLancamentos,
  listarFunis,
  listarLancamentos,
  listarUsuariosComercial,
} from "@/lib/funis-comerciais"

export const dynamic = "force-dynamic"

/**
 * Interface comercial de cada usuário. Quem tem acesso ao Comercial vê e edita
 * só os próprios funis. Admin pode abrir a de qualquer pessoa (?usuario=). O
 * ?usuario= de quem não é admin é ignorado, e o ?funil= só vale para um funil
 * da lista daquela pessoa, então trocar o id na URL não abre funil alheio.
 */
export default async function ComercialPage({
  searchParams,
}: {
  searchParams: {
    modo?: string
    de?: string
    ate?: string
    mes?: string
    ano?: string
    funil?: string
    usuario?: string
    agrupar?: string
  }
}) {
  const usuario = await requererPermissao("dashboard_comercial")
  const ehAdmin = usuario.papel === "admin"

  const hoje = hojeBRT()
  const periodo = parsePeriodoFunil(searchParams, hoje)

  const usuariosDoTime = ehAdmin ? await listarUsuariosComercial() : []
  const dono =
    (ehAdmin && usuariosDoTime.find((u) => u.id === searchParams.usuario)) || {
      id: usuario.id,
      nome: usuario.nome,
    }
  const vendoOutraPessoa = dono.id !== usuario.id

  const { funis, tabelaAusente } = await listarFunis(dono.id)
  const funil = funis.find((f) => f.id === searchParams.funil) ?? funis[0] ?? null

  const [lancamentos, totalLancamentos] = funil
    ? await Promise.all([
        listarLancamentos([funil.id], periodo.de, periodo.ate),
        contarLancamentos(funil.id),
      ])
    : [[], 0]
  const resumo = funil ? resumirFunil(funil.etapas, lancamentos) : null

  const agrupamento = resolverAgrupamento(searchParams.agrupar, periodo)
  const evolucao = funil
    ? evolucaoDoFunil(
        funil.etapas,
        lancamentos,
        gerarBaldes(periodo.de, periodo.ate, agrupamento)
      )
    : []

  // Parâmetros que acompanham os links internos da tela.
  const paramsBase = new URLSearchParams(periodoParaParams(periodo))
  if (vendoOutraPessoa) paramsBase.set("usuario", dono.id)
  const hrefAgrupamento = (a: AgrupamentoFunil) => {
    const p = new URLSearchParams(paramsBase)
    if (funil) p.set("funil", funil.id)
    p.set("agrupar", a)
    return `/dashboard/comercial?${p.toString()}`
  }

  // Lançar dentro do período que está na tela: hoje se couber, senão o início.
  const dataPadrao = hoje >= periodo.de && hoje <= periodo.ate ? hoje : periodo.de

  const primeira = resumo?.etapas[0]
  const ultima = resumo?.etapas[resumo.etapas.length - 1]
  const semDados = !resumo || resumo.registros === 0

  return (
    <main
      className="mx-auto px-4 sm:px-8 py-10 space-y-8"
      style={{ maxWidth: 1280 }}
    >
      <div className={`hero-banner ${estilos.hero}`}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}>
          Comercial · {vendoOutraPessoa ? dono.nome : "Minha interface"}
        </p>
        <div className={estilos.heroTopo}>
          <h1 style={{ fontSize: 34 }}>{periodo.rotulo}</h1>
          <SeletorPeriodoFunil periodo={periodo} hoje={hoje} />
        </div>
        {ehAdmin && (
          <div className={estilos.heroRodape}>
            <AbasArea
              itens={[
                {
                  label: "Funis",
                  href: `/dashboard/comercial?${paramsBase.toString()}`,
                  ativo: true,
                },
                {
                  label: "Time",
                  href: `/dashboard/comercial/time?${new URLSearchParams(
                    periodoParaParams(periodo)
                  ).toString()}`,
                  ativo: false,
                },
                {
                  label: "Histórico",
                  href: "/dashboard/comercial/historico",
                  ativo: false,
                },
              ]}
            />
            <SeletorUsuarioFunil usuarios={usuariosDoTime} atual={dono.id} />
          </div>
        )}
      </div>

      {tabelaAusente ? (
        <div className="glass" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 18 }}>Falta preparar o banco</h2>
          <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-2)" }}>
            Os funis precisam da migration{" "}
            <code>20261106_comercial_funis.sql</code>. Rode-a no SQL Editor do
            Supabase e recarregue a página.
          </p>
        </div>
      ) : (
        <>
          <BarraFunis
            funis={funis}
            selecionado={funil}
            usuarioId={dono.id}
            totalLancamentos={totalLancamentos}
            dataPadrao={dataPadrao}
          />

          {!funil || !resumo ? (
            <div className="glass" style={{ padding: 28, textAlign: "center" }}>
              <h2 style={{ fontSize: 18 }}>
                {vendoOutraPessoa
                  ? `${dono.nome} ainda não tem funis`
                  : "Você ainda não tem funis"}
              </h2>
              <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-2)" }}>
                Use &quot;Novo funil&quot; para criar o primeiro. Ele já vem com
                as etapas de leads a contratos, e você pode ajustar todas.
              </p>
            </div>
          ) : (
            <>
              <section aria-label="Indicadores do período" className={estilos.kpis}>
                {[
                  {
                    rotulo: "Investido no tráfego",
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
                  titulo="Funil do período"
                  descricao={
                    semDados
                      ? "Ainda sem números neste período. Lance à mão ou importe do Meta."
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
                    {
                      rotulo: "Contratos perdidos",
                      valor: semDados ? "—" : formatNumero(resumo.perdidos),
                    },
                    {
                      rotulo: "Taxa de fechamento",
                      valor: formatarPct(resumo.taxaFechamento),
                      nota: "fechados ÷ (fechados + perdidos)",
                    },
                    {
                      rotulo: "Faturamento gerado",
                      valor: semDados ? "—" : formatBRL(resumo.faturamento),
                    },
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

              {!semDados && (
              <section>
                <SectionHeader
                  titulo="Evolução no período"
                  descricao="Compare dia a dia, semana a semana ou mês a mês"
                />
                <EvolucaoFunil
                  linhas={evolucao}
                  agrupamento={agrupamento}
                  disponiveis={agrupamentosDisponiveis(periodo)}
                  hrefAgrupamento={hrefAgrupamento}
                />
              </section>
              )}

              <section>
                <SectionHeader
                  titulo="Lançamentos"
                  descricao="O que foi registrado no período, por data"
                />
                <ListaLancamentos
                  funil={funil}
                  lancamentos={lancamentos}
                  dataPadrao={dataPadrao}
                  de={periodo.de}
                  ate={periodo.ate}
                />
              </section>
            </>
          )}
        </>
      )}
    </main>
  )
}
