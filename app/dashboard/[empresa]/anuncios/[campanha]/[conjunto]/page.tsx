import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import TabsTrafego from "@/components/TabsTrafego"
import AnuncioItem from "@/components/trafego/AnuncioItem"
import BannerDemonstracao from "@/components/trafego/BannerDemonstracao"
import { requererPermissao } from "@/lib/auth"
import { parsePeriodo } from "@/lib/periodo"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import { getEmpresasTrackeadas } from "@/lib/sentinela"
import {
  getAnunciosDoConjunto,
  getNomeCampanha,
  getNomeConjunto,
  qsPeriodo,
} from "@/lib/anuncios"

export const dynamic = "force-dynamic"

/** Gerenciador de Anúncios — nível ANÚNCIOS (ads de um conjunto) + detalhe. */
export default async function AnunciosDoConjuntoPage({
  params,
  searchParams,
}: {
  params: { empresa: string; campanha: string; conjunto: string }
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
  const qs = qsPeriodo(periodo)
  const [anuncios, nomeCampanha, nomeConjunto, trackeadas] = await Promise.all([
    getAnunciosDoConjunto(empresa.nome, params.conjunto, periodo.de, periodo.ate),
    getNomeCampanha(empresa.nome, params.campanha),
    getNomeConjunto(empresa.nome, params.conjunto),
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
          <Link
            href={`/dashboard/${empresa.slug}/anuncios/${params.campanha}?${qs}`}
            className="no-ds hover:text-[#C9953A] transition"
            style={{ color: "var(--text-3)" }}
          >
            {nomeCampanha ?? "Campanha"}
          </Link>
          <span aria-hidden="true">›</span>
          <span style={{ color: "var(--text-1)" }}>{nomeConjunto ?? "Conjunto"}</span>
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
          Anúncios · {nomeConjunto ?? "Conjunto"} · {periodo.rotulo}
        </p>
        <div style={{ marginTop: 18 }}>
          <TabsTrafego slug={empresa.slug} mes={periodo.mes} ano={periodo.ano} />
        </div>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      {!trackeada && <BannerDemonstracao tipo="sem-conexao" />}
      {trackeada && anuncios.length === 0 && <BannerDemonstracao tipo="sem-dados" />}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {anuncios.map((a) => (
          <AnuncioItem key={a.adId} a={a} />
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
