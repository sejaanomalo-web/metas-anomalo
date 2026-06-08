import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import BotaoAtualizar from "@/components/BotaoAtualizar"
import CardEmpresaTrafego from "@/components/CardEmpresaTrafego"
import DrawerEmpresas from "@/components/DrawerEmpresas"
import { formatNumero } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import {
  getResumoPorIntervaloPorEmpresa,
  getUltimoLogSentinela,
  statusSentinela,
} from "@/lib/sentinela"
import {
  listarEmpresas,
  listarEmpresasInativas,
} from "@/lib/empresas-actions"
import { supabaseConfigurado } from "@/lib/supabase"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * Visão agregada de tráfego pago — lista todas as empresas com token
 * Meta cadastrado (via tokens_meta), mostrando os KPIs principais do
 * mês corrente:
 *
 *   • Investimento (pago)
 *   • Leads
 *   • CPL médio ponderado
 *   • CPA (se houver contratos manuais)
 *   • Status do Sentinela (ok / atenção / falha) — global, mesmo log
 *
 * Cada card linka pra /dashboard/[empresa]/trafego com o mes/ano.
 *
 * Acessível por admin (bypass) e gestor_trafego (permissao
 * dashboard_trafego = true). Esta é a rota padrão pra gestor.
 *
 * CTR fica fora deste MVP — o Sentinela hoje não coleta impressões/
 * cliques. Quando coletar, basta puxar do ResumoEmpresaMes.
 */
export default async function TrafegoOverviewPage({
  searchParams,
}: {
  searchParams: {
    mes?: string
    ano?: string
    de?: string
    ate?: string
    modo?: string
  }
}) {
  await requererPermissao("dashboard_trafego")

  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano

  const [resumo, empresas, empresasInativas, ultimoLog] = await Promise.all([
    getResumoPorIntervaloPorEmpresa(periodo.de, periodo.ate, "pago"),
    listarEmpresas(true),
    listarEmpresasInativas(),
    getUltimoLogSentinela(),
  ])
  const stat = statusSentinela(ultimoLog)
  const supabaseOk = supabaseConfigurado()

  // Aba de tráfego mostra TODAS as empresas ativas do Hub. Empresas
  // sem token Meta (ex.: agências que delegam aos clientes-folha)
  // aparecem zeradas — o gestor decide configurar o conector pelo Hub.
  const empresasTrafego = empresas

  // Totais agregados pro hero (KPI consolidado).
  let somaInv = 0
  let somaLeads = 0
  let somaImpressoes = 0
  let somaFat = 0
  let empresasGerenciadas = 0
  for (const empresa of empresasTrafego) {
    const r = resumo.get(empresa.nome)
    if (!r) continue
    somaInv += r.investimento
    somaLeads += r.leads
    somaImpressoes += r.impressoes
    somaFat += r.faturamento
    if (r.investimento > 0) empresasGerenciadas += 1
  }
  const cplMedio = somaLeads > 0 ? somaInv / somaLeads : null
  // ROI total do hub: (faturamento - investimento) / investimento.
  const roiTotal = somaInv > 0 ? (somaFat - somaInv) / somaInv : null

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-8"
        style={{ maxWidth: 1280 }}
      >
        {/* Hero */}
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-3)",
              letterSpacing: "0.01em",
            }}
          >
            Tráfego pago
          </p>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ fontSize: 36 }}>
              Visão geral de tráfego · {periodo.rotulo}
            </h1>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <DrawerEmpresas
                empresas={empresas}
                empresasInativas={empresasInativas}
                supabaseOk={supabaseOk}
              />
              <BotaoAtualizar />
              <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
            </div>
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            {formatNumero(empresasTrafego.length)}{" "}
            {empresasTrafego.length === 1
              ? "empresa com tráfego ativo"
              : "empresas com tráfego ativo"}
            {" · "}
            <span style={{ color: "var(--text-2)" }}>
              Sentinela {stat.rotulo.toLowerCase()}
            </span>
          </p>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {/* KPIs consolidados */}
        <section
          className="glass"
          style={{
            padding: "20px 24px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 24,
          }}
        >
          <KpiMini label="Investimento total" valor={fmtBRL(somaInv)} />
          <KpiMini
            label="ROI total do hub"
            valor={roiTotal != null ? `${(roiTotal * 100).toFixed(0)}%` : "·"}
          />
          <KpiMini
            label="Empresas gerenciadas"
            valor={formatNumero(empresasGerenciadas)}
          />
          <KpiMini label="Leads totais" valor={formatNumero(somaLeads)} />
          <KpiMini
            label="CPL médio"
            valor={cplMedio ? fmtBRL(cplMedio) : "·"}
          />
        </section>

        {/* Cards por empresa */}
        <section>
          {empresasTrafego.length === 0 && (
            <div
              className="glass"
              style={{
                padding: "32px 28px",
                textAlign: "center",
                borderStyle: "dashed",
                borderColor: "rgba(201,149,58,0.35)",
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-2)",
                  fontWeight: 400,
                  marginBottom: 0,
                  lineHeight: 1.5,
                }}
              >
                Nenhuma empresa ativa no Hub. Cadastre uma empresa em{" "}
                <code style={{ color: "var(--accent)" }}>/dashboard/empresas</code>{" "}
                pra começar.
              </p>
            </div>
          )}

          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            style={{ gap: 16 }}
          >
            {empresasTrafego.map((empresa) => {
              const r = resumo.get(empresa.nome)
              return (
                <CardEmpresaTrafego
                  key={empresa.slug}
                  empresa={empresa}
                  mes={mes}
                  ano={ano}
                  investimento={r?.investimento ?? 0}
                  leads={r?.leads ?? 0}
                  cpl={r?.cplReal ?? null}
                  cpm={r?.cpmReal ?? null}
                />
              )
            })}
          </div>
        </section>
      </main>

      <footer
        className="mx-auto px-8 py-8 text-center"
        style={{ maxWidth: 1280 }}
      >
        <p
          style={{
            fontSize: 11,
            color: "var(--text-4)",
            fontWeight: 400,
          }}
        >
          Anômalo Hub · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  )
}

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function KpiMini({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          fontSize: 11,
          letterSpacing: "1px",
          color: "var(--text-4)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--text-1)",
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
          marginTop: 4,
        }}
      >
        {valor}
      </p>
    </div>
  )
}
