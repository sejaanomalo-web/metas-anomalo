import SeletorPeriodo from "@/components/SeletorPeriodo"
import SectionHeader from "@/components/ui/SectionHeader"
import CardEmpresa from "@/components/CardEmpresa"
import DrawerEmpresas from "@/components/DrawerEmpresas"
import {
  anoValido,
  formatNumero,
  mesValido,
} from "@/lib/data"
import { getResumoMensalPorEmpresa } from "@/lib/sentinela"
import {
  listarEmpresas,
  listarEmpresasInativas,
} from "@/lib/empresas-actions"
import { getOverridesTodasEmpresasMes } from "@/lib/metas-empresa"
import { supabaseConfigurado } from "@/lib/supabase"
import { requererPermissao } from "@/lib/auth"

// Página dinâmica: força SSR sem Data Cache. Mesmo motivo de /dashboard
// — trocar filtros não pode reaproveitar respostas anteriores.
export const dynamic = "force-dynamic"

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
  await requererPermissao("dashboard_empresas")

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)

  const [resumo, empresas, empresasInativas, overridesMes] =
    await Promise.all([
      // Fonte unificada do dashboard: dados_diarios_log agregado
      // (lib/sentinela). Pago fixo aqui — orgânico fica no detalhe
      // via ToggleOrigem em /dashboard/[empresa].
      getResumoMensalPorEmpresa(mes, ano, "pago"),
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
              // Lookup pelo NOME (case-sensitive, com acentos) — chave
              // que o agente Sentinela usa em dados_diarios_log.empresa.
              const r = resumo.get(empresa.nome)
              const faturamentoReal =
                r && r.faturamento > 0 ? r.faturamento : null
              const investimentoReal =
                r && r.investimento > 0 ? r.investimento : null
              return (
                <CardEmpresa
                  key={empresa.slug}
                  empresa={empresa}
                  mes={mes}
                  ano={ano}
                  faturamentoReal={faturamentoReal}
                  investimentoReal={investimentoReal}
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
