import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import SectionHeader from "@/components/ui/SectionHeader"
import CardEmpresa from "@/components/CardEmpresa"
import DrawerEmpresas from "@/components/DrawerEmpresas"
import { formatBRL, formatNumero } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import { getResumoPorIntervaloPorEmpresa } from "@/lib/sentinela"
import {
  listarEmpresas,
  listarEmpresasInativas,
} from "@/lib/empresas-actions"
import { getOverridesTodasEmpresasMes } from "@/lib/metas-empresa"
import {
  getEmpresasComClientesTrafego,
  getResumosClientesTodasAssessorias,
} from "@/lib/clientes"
import { getRealizadoComercialPagoPorEmpresa } from "@/lib/relatorios-comerciais"
import { supabaseConfigurado } from "@/lib/supabase"
import { requererPermissao } from "@/lib/auth"

// Página dinâmica: força SSR sem Data Cache. Mesmo motivo de /dashboard
// — trocar filtros não pode reaproveitar respostas anteriores.
export const dynamic = "force-dynamic"

/**
 * Painel METAS (antigo "Empresas"). Exclusivo das empresas do Hub:
 * compara meta definida vs realizado, a nível de EMPRESA (sem dados de
 * cliente — esses ficam só no fluxo de Tráfego). Cada card abre o
 * detalhe da empresa (/dashboard/[empresa]) com funil, gráfico e tabela,
 * onde o ToggleOrigem alterna pago (tráfego) e orgânico (comercial).
 *
 * Auth guard é feito pelo layout (app/dashboard/layout.tsx) + permissão
 * dashboard_empresas (mantida internamente; rótulo agora é "Metas").
 */
export default async function MetasPage({
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
  await requererPermissao("dashboard_empresas")

  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano

  const [
    resumo,
    comercialPago,
    empresas,
    empresasInativas,
    overridesMes,
    empresasComClientesArr,
    resumosClientes,
  ] = await Promise.all([
    // Realizado PAGO por empresa (mesma fonte do dashboard de Tráfego).
    // O orgânico aparece no detalhe da empresa via ToggleOrigem.
    getResumoPorIntervaloPorEmpresa(periodo.de, periodo.ate, "pago"),
    // Conversões do comercial 'Anúncios' — sobrepõem o faturamento pago.
    getRealizadoComercialPagoPorEmpresa(periodo.de, periodo.ate),
    listarEmpresas(true),
    listarEmpresasInativas(),
    getOverridesTodasEmpresasMes(mes, ano),
    getEmpresasComClientesTrafego(),
    // Agregado dos clientes de cada assessoria — pra dar visibilidade às
    // agências que delegam aos clientes-folha (ex.: Assessoria Sun) e
    // pareceriam "paradas" olhando só a meta da empresa.
    getResumosClientesTodasAssessorias(periodo.de, periodo.ate),
  ])
  const empresasComClientes = new Set(empresasComClientesArr)
  const supabaseOk = supabaseConfigurado()

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-10"
        style={{ maxWidth: 1280 }}
      >
        {/* Hero */}
        <div className="hero-banner">
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-3)",
              letterSpacing: "0.01em",
            }}
          >
            Metas
          </p>
          <h1 style={{ marginTop: 6, fontSize: 36 }}>Metas · {periodo.rotulo}</h1>
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
              {empresas.length === 1
                ? "empresa do Hub"
                : "empresas do Hub"}
              {" · "}
              <span style={{ color: "var(--text-2)" }}>meta vs realizado</span>
            </p>
            <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
          </div>
        </div>

        {/* Cards de empresas */}
        <section>
          <SectionHeader
            titulo="Metas do Hub"
            descricao="Clique em uma empresa para detalhar funil, metas e gráficos (pago e orgânico)"
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
                · clique em <strong>Gerenciar empresas</strong>.
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
              // "Comercial vira a conversão": faturamento pago vem do comercial
              // 'Anúncios' quando existe; senão, do tráfego.
              const comPago = comercialPago.get(empresa.nome)
              const faturamentoReal =
                comPago && comPago.faturamento > 0
                  ? comPago.faturamento
                  : r && r.faturamento > 0
                  ? r.faturamento
                  : null
              const investimentoReal =
                r && r.investimento > 0 ? r.investimento : null
              // Agregado dos clientes da assessoria (quando ela delega aos
              // clientes-folha) — resume "N clientes · R$ · leads" pra não
              // parecer que nada acontece na empresa.
              const rc = resumosClientes.get(empresa.nome)
              return (
                <div
                  key={empresa.slug}
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <CardEmpresa
                    empresa={empresa}
                    mes={mes}
                    ano={ano}
                    faturamentoReal={faturamentoReal}
                    investimentoReal={investimentoReal}
                    override={overridesMes.get(empresa.db)}
                  />
                  {empresasComClientes.has(empresa.nome) &&
                    rc &&
                    rc.qtdClientes > 0 && (
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--text-3)",
                          fontWeight: 500,
                          paddingLeft: 4,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        👥 {rc.qtdClientes} cliente
                        {rc.qtdClientes > 1 ? "s" : ""}
                        {rc.investimento > 0
                          ? ` · ${formatBRL(rc.investimento)}`
                          : ""}
                        {rc.leads > 0 ? ` · ${formatNumero(rc.leads)} leads` : ""}
                      </p>
                    )}
                </div>
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
