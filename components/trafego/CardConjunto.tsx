import Link from "next/link"
import { formatBRL, formatNumero } from "@/lib/data"
import { COR } from "@/lib/design-tokens"
import type { ConjuntoRanking } from "@/lib/anuncios"

/** Card de conjunto (adset) no Gerenciador de Anúncios — clicável, abre o
 *  nível Anúncios. Print #3. */
function pct(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(2).replace(".", ",")}%`
}
function brlOuTraco(v: number | null): string {
  return v == null ? "—" : formatBRL(v)
}

export default function CardConjunto({
  conjunto: c,
  href,
}: {
  conjunto: ConjuntoRanking
  href: string
}) {
  const ativa = c.status === "ACTIVE"
  const corStatus =
    c.status == null ? "var(--text-4)" : ativa ? COR.conversas : "var(--text-4)"
  const rotuloStatus = c.status == null ? "—" : ativa ? "Ativo" : "Pausado"

  return (
    <Link
      href={href}
      className="no-ds glass glass-hover"
      style={{ display: "block", textDecoration: "none", padding: "20px 22px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden="true" style={{ color: "#4062f0", display: "inline-flex" }}>
          <IconeCamadas />
        </span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-1)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={c.nome}
        >
          {c.nome}
        </span>
        <span aria-hidden="true" style={{ color: "var(--text-4)", fontSize: 18 }}>
          ›
        </span>
      </div>
      <p style={{ fontSize: 12, color: corStatus, fontWeight: 600, marginTop: 4, marginLeft: 26 }}>
        {rotuloStatus}
      </p>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        style={{ gap: 16, marginTop: 16 }}
      >
        <Metrica label="Alcance" valor={formatNumero(c.alcance)} />
        <Metrica label="Impressões" valor={formatNumero(c.impressoes)} />
        <Metrica label="Cliques no link" valor={formatNumero(c.cliques)} />
        <Metrica label="CTR" valor={pct(c.ctr)} />
        <Metrica label="CPC" valor={brlOuTraco(c.cpc)} />
        <Metrica label="Valor gasto" valor={formatBRL(c.investimento)} cor={COR.gasto} />
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "16px 0 12px" }} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 28px", fontSize: 13 }}>
        <Conv label="Conversas" valor={formatNumero(c.conversas)} cor={COR.conversas} />
        <Conv label="Leads" valor={formatNumero(c.leads)} cor={COR.leads} />
        <Conv
          label="Compras"
          valor={c.compras != null ? formatNumero(c.compras) : "—"}
          cor={COR.compras}
        />
        <Conv
          label="Carrinho"
          valor={c.carrinho != null ? formatNumero(c.carrinho) : "—"}
          cor={COR.carrinho}
        />
      </div>
    </Link>
  )
}

function Metrica({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 2 }}>{label}</p>
      <p
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: cor ?? "var(--text-1)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
      </p>
    </div>
  )
}

function Conv({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <span style={{ color: "var(--text-2)" }}>
      {label}: <strong style={{ color: cor, fontWeight: 700 }}>{valor}</strong>
    </span>
  )
}

function IconeCamadas() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}
