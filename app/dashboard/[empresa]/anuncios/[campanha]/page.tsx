import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import TabsTrafego from "@/components/TabsTrafego"
import CardConjunto from "@/components/trafego/CardConjunto"
import BannerDemonstracao from "@/components/trafego/BannerDemonstracao"
import { requererPermissao } from "@/lib/auth"
import { parsePeriodo } from "@/lib/periodo"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import { getEmpresasTrackeadas } from "@/lib/sentinela"
import { getConjuntosDaCampanha, getNomeCampanha } from "@/lib/anuncios"

export const dynamic = "force-dynamic"

/** Gerenciador de Anúncios — nível CONJUNTOS (adsets de uma campanha). */
export default async function ConjuntosPage({
  params,
  searchParams,
}: {
  params: { empresa: string; campanha: string }
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
  const qs = `mes=${periodo.mes}&ano=${periodo.ano}`
  const [conjuntos, nomeCampanha, trackeadas] = await Promise.all([
    getConjuntosDaCampanha(empresa.nome, params.campanha, periodo.de, periodo.ate),
    getNomeCampanha(empresa.nome, params.campanha),
    getEmpresasTrackeadas(),
  ])
  const trackeada = trackeadas.includes(empresa.nome)

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--text-3)", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link
            href={`/dashboard/${empresa.slug}/anuncios?${qs}`}
            className="no-ds hover:text-[#C9953A] transition"
            style={{ color: "var(--text-3)" }}
          >
            Campanhas
          </Link>
          <span aria-hidden="true">›</span>
          <span style={{ color: "var(--text-1)" }}>{nomeCampanha ?? "Campanha"}</span>
        </div>

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
            <GridIcon />
            <h1 style={{ fontSize: 32 }}>Gerenciador de Anúncios</h1>
          </div>
          <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
        </div>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 10 }}>
          Conjuntos · {empresa.nome} · {periodo.rotulo}
        </p>
        <div style={{ marginTop: 18 }}>
          <TabsTrafego slug={empresa.slug} mes={periodo.mes} ano={periodo.ano} />
        </div>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      {!trackeada && <BannerDemonstracao tipo="sem-conexao" />}
      {trackeada && conjuntos.length === 0 && <BannerDemonstracao tipo="sem-dados" />}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {conjuntos.map((c) => (
          <CardConjunto
            key={c.adsetId}
            conjunto={c}
            href={`/dashboard/${empresa.slug}/anuncios/${params.campanha}/${c.adsetId}?${qs}`}
          />
        ))}
      </div>
    </main>
  )
}

function GridIcon() {
  return (
    <span aria-hidden="true" style={{ display: "inline-flex" }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4062f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    </span>
  )
}
