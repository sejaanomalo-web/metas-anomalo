import SeletorPeriodo from "@/components/SeletorPeriodo"
import SectionHeader from "@/components/ui/SectionHeader"
import CardEmpresa from "@/components/CardEmpresa"
import DrawerEmpresas from "@/components/DrawerEmpresas"
import {
  anoValido,
  formatNumero,
  mesValido,
} from "@/lib/data"
import { getDadosReaisDoMes } from "@/lib/dados-reais"
import {
  listarEmpresas,
  listarEmpresasInativas,
} from "@/lib/empresas-actions"
import { getOverridesTodasEmpresasMes } from "@/lib/metas-empresa"
import { supabaseConfigurado } from "@/lib/supabase"

/**
 * Página Empresas do Hub — dedicada à listagem completa de empresas
 * com suas métricas do mês. Layout coerente com /dashboard:
 *   • Hero com h1 + linha de info (contagem + período inline) + SeletorPeriodo
 *   • SectionHeader com "Empresas do Hub" + botão Gerenciar empresas
 *   • Grid 1/2/3 colunas de CardEmpresa
 *
 * Auth guard é feito pelo layout (app/dashboard/layout.tsx).
 */
export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)

  const [reaisDoMes, empresas, empresasInativas, overridesMes] =
    await Promise.all([
      getDadosReaisDoMes(mes, ano),
      listarEmpresas(true),
      listarEmpresasInativas(),
      getOverridesTodasEmpresasMes(mes, ano),
    ])
  const supabaseOk = supabaseConfigurado()

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-10"
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
            Empresas
          </p>
          <h1 style={{ marginTop: 6, fontSize: 36 }}>
            Empresas do Hub · {mes} {ano}
          </h1>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <p
              style={{
                fontSize: 14,
                color: "var(--text-3)",
              }}
            >
              {formatNumero(empresas.length)}{" "}
              {empresas.length === 1 ? "empresa ativa" : "empresas ativas"}
              {" · "}
              <span style={{ color: "var(--text-2)" }}>
                Atualmente {mes} {ano}
              </span>
            </p>
            <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
          </div>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {/* Cards de empresas */}
        <section>
          <SectionHeader
            titulo="Empresas do Hub"
            descricao="Clique em um card para detalhar funil, metas e gráficos"
            acao={
              <DrawerEmpresas
                empresas={empresas}
                empresasInativas={empresasInativas}
                supabaseOk={supabaseOk}
              />
            }
          />

          {empresas.length === 0 && (
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
                Nenhuma empresa cadastrada ainda. Comece criando sua primeira
                — clique em <strong>Gerenciar empresas</strong>.
              </p>
            </div>
          )}

          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            style={{ gap: 16 }}
          >
            {empresas.map((empresa) => {
              const bucket = reaisDoMes.get(empresa.db)
              const pago = bucket?.pago ?? null
              const organico = bucket?.organico ?? null
              const faturamentoSoma =
                (pago?.faturamento_real ?? 0) +
                (organico?.faturamento_real ?? 0)
              const faturamentoReal =
                pago?.faturamento_real === null &&
                organico?.faturamento_real === null
                  ? null
                  : pago?.faturamento_real !== undefined ||
                    organico?.faturamento_real !== undefined
                  ? faturamentoSoma
                  : null
              return (
                <CardEmpresa
                  key={empresa.slug}
                  empresa={empresa}
                  mes={mes}
                  ano={ano}
                  faturamentoReal={faturamentoReal}
                  investimentoReal={pago?.investimento_real ?? null}
                  override={overridesMes.get(empresa.db)}
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
