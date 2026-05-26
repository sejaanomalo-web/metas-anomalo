import SeletorPeriodo from "@/components/SeletorPeriodo"
import BotaoAtualizar from "@/components/BotaoAtualizar"
import CardEmpresaTrafego from "@/components/CardEmpresaTrafego"
import { anoValido, formatNumero, mesValido } from "@/lib/data"
import {
  getEmpresasTrackeadas,
  getResumoMensalPorEmpresa,
  getUltimoLogSentinela,
  statusSentinela,
} from "@/lib/sentinela"
import { listarEmpresas } from "@/lib/empresas-actions"
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
  searchParams: { mes?: string; ano?: string }
}) {
  await requererPermissao("dashboard_trafego")

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)

  const [resumo, empresas, trackeadas, ultimoLog] = await Promise.all([
    getResumoMensalPorEmpresa(mes, ano, "pago"),
    listarEmpresas(true),
    getEmpresasTrackeadas(),
    getUltimoLogSentinela(),
  ])
  const stat = statusSentinela(ultimoLog)

  // Filtra: só empresas trackeadas pelo Sentinela (têm token Meta).
  // A página é especificamente sobre tráfego pago — empresas sem
  // token Meta não fazem sentido aqui.
  const empresasTrafego = empresas.filter((e) => trackeadas.includes(e.nome))

  // Totais agregados pro hero (KPI consolidado).
  let somaInv = 0
  let somaLeads = 0
  let somaImpressoes = 0
  for (const empresa of empresasTrafego) {
    const r = resumo.get(empresa.nome)
    if (!r) continue
    somaInv += r.investimento
    somaLeads += r.leads
    somaImpressoes += r.impressoes
  }
  const cplMedio = somaLeads > 0 ? somaInv / somaLeads : null
  // CPM ponderado: total_invest / total_impr * 1000. Enquanto Sentinela
  // não popular impressoes_real, somaImpressoes=0 → cpmMedio=null → "—".
  const cpmMedio = somaImpressoes > 0 ? (somaInv / somaImpressoes) * 1000 : null

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
            <h1 style={{ fontSize: 36 }}>Visão geral de tráfego</h1>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <BotaoAtualizar />
              <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
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
          <KpiMini label="Leads totais" valor={formatNumero(somaLeads)} />
          <KpiMini
            label="CPL médio"
            valor={cplMedio ? fmtBRL(cplMedio) : "—"}
          />
          <KpiMini
            label="CPM médio"
            valor={cpmMedio ? fmtBRL(cpmMedio) : "—"}
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
                Nenhuma empresa com token Meta cadastrado. Cadastre em{" "}
                <code style={{ color: "var(--accent)" }}>tokens_meta</code> no
                Supabase pra começar a trackear.
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
