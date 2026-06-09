import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import TabsTrafego from "@/components/TabsTrafego"
import CardCampanhaNivel from "@/components/trafego/CardCampanhaNivel"
import BannerDemonstracao from "@/components/trafego/BannerDemonstracao"
import { requererPermissao } from "@/lib/auth"
import { parsePeriodo } from "@/lib/periodo"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import { getEmpresasTrackeadas } from "@/lib/sentinela"
import { getCampanhasRanking } from "@/lib/anuncios"

export const dynamic = "force-dynamic"

/**
 * Gerenciador de Anúncios — nível CAMPANHAS (destino do "Ver todas" do
 * Ranking). Lista expandida de todas as campanhas do período. Os níveis
 * Conjuntos e Anúncios entram na Fase 2 (exigem o Sentinela puxar level=adset
 * e level=ad). Mesmo padrão SSR/período-global das demais páginas de tráfego.
 */
export default async function AnunciosPage({
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
  await requererPermissao("dashboard_trafego")

  const empresa = await getEmpresaAsync(params.empresa)
  if (!empresa) notFound()

  const periodo = parsePeriodo(searchParams)
  const [campanhas, trackeadas] = await Promise.all([
    getCampanhasRanking(empresa.nome, periodo.de, periodo.ate),
    getEmpresasTrackeadas(),
  ])
  const trackeada = trackeadas.includes(empresa.nome)

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <Link
          href={`/dashboard/${empresa.slug}/trafego?mes=${periodo.mes}&ano=${periodo.ano}`}
          style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}
          className="hover:text-[#C9953A] transition"
        >
          ← Tráfego pago · {empresa.nome}
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span aria-hidden="true" style={{ display: "inline-flex" }}>
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#4062f0"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </span>
            <h1 style={{ fontSize: 36 }}>Gerenciador de Anúncios</h1>
          </div>
          <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
        </div>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 10 }}>
          Campanhas · {empresa.nome} · {periodo.rotulo}
        </p>
        <div style={{ marginTop: 18 }}>
          <TabsTrafego slug={empresa.slug} mes={periodo.mes} ano={periodo.ano} />
        </div>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      {!trackeada && <BannerDemonstracao tipo="sem-conexao" />}
      {trackeada && campanhas.length === 0 && (
        <BannerDemonstracao tipo="sem-dados" />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {campanhas.map((c) => (
          <CardCampanhaNivel
            key={c.campanhaId}
            c={c}
            href={`/dashboard/${empresa.slug}/anuncios/${c.campanhaId}?mes=${periodo.mes}&ano=${periodo.ano}`}
          />
        ))}
      </div>
    </main>
  )
}
