import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import TabsMetas from "@/components/TabsMetas"
import CardClienteMeta from "@/components/CardClienteMeta"
import { requererPermissao } from "@/lib/auth"
import { subtituloDaEmpresa } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import { getResumoMetasClientesDaEmpresa } from "@/lib/metas-cliente"

// Página dinâmica: força SSR sem Data Cache (igual ao restante do dashboard).
export const dynamic = "force-dynamic"

/**
 * Lista de "Metas por cliente" de uma assessoria. Espelha o fluxo de Tráfego
 * por cliente: grid de cards meta × realizado (faturamento), abas Metas/Metas
 * por cliente e seletor de período. Clicar num card abre o dashboard de metas
 * completo do cliente (/dashboard/[empresa]/metas/[cliente]).
 */
export default async function MetasPorClientePage({
  params,
  searchParams,
}: {
  params: { empresa: string }
  searchParams: {
    mes?: string
    ano?: string
    de?: string
    ate?: string
    modo?: string
  }
}) {
  await requererPermissao("dashboard_empresa_detalhe")

  const empresa = await getEmpresaAsync(params.empresa)
  if (!empresa) notFound()

  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano

  const resumos = await getResumoMetasClientesDaEmpresa(
    empresa.nome,
    periodo.de,
    periodo.ate,
    mes,
    ano
  )

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <Link
          href={`/dashboard/metas?mes=${mes}&ano=${ano}`}
          style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}
          className="hover:text-[#C9953A] transition"
        >
          ← Metas
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
          <h1 style={{ fontSize: 36 }}>Metas por cliente · {empresa.nome}</h1>
          <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
        </div>
        <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10 }}>
          {subtituloDaEmpresa(empresa)} · meta vs realizado por cliente
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
          <TabsMetas
            slug={empresa.slug}
            mes={mes}
            ano={ano}
            temClientes={resumos.length > 0}
          />
        </div>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      {resumos.length === 0 ? (
        <div
          style={{
            padding: "40px 28px",
            borderRadius: 12,
            border: "1px dashed rgba(201,149,58,0.30)",
            background: "rgba(201,149,58,0.04)",
            textAlign: "center",
            color: "var(--text-2)",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <p style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>
            Nenhum cliente cadastrado ainda
          </p>
          <p>
            Os clientes de {empresa.nome} são cadastrados no fluxo de Tráfego
            (aba <strong>Tráfego por cliente</strong>). Depois de criados, as
            metas de cada um aparecem aqui.
          </p>
        </div>
      ) : (
        <section
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: 16 }}
        >
          {resumos.map((r) => (
            <CardClienteMeta
              key={r.cliente.id}
              resumo={r}
              empresaSlug={empresa.slug}
              mes={mes}
              ano={ano}
            />
          ))}
        </section>
      )}
    </main>
  )
}
