import { formatBRL, formatNumero } from "@/lib/data"
import { COR } from "@/lib/design-tokens"
import type { CampanhaRanking } from "@/lib/anuncios"

/**
 * Card de campanha no nível "Campanhas" do Gerenciador de Anúncios (print #8).
 * Linha de entrega/cliques (Alcance · Impressões · Cliques no link · CTR · CPC
 * · Valor gasto) + linha de conversões com custo/cada.
 *
 * FASE 1: status, compras, carrinho e "visualizou página" ainda não são
 * persistidos pelo Sentinela → saem como "—". O drill-down (conjuntos/anúncios)
 * entra na Fase 2.
 */

function pct(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(2).replace(".", ",")}%`
}
function brlOuTraco(v: number | null): string {
  return v == null ? "—" : formatBRL(v)
}
function custoCada(total: number, qtd: number): string {
  return qtd > 0 ? `${formatBRL(total / qtd)}/cada` : "—"
}

export default function CardCampanhaNivel({ c }: { c: CampanhaRanking }) {
  const ativa = c.status === "ACTIVE"
  const corStatus =
    c.status == null ? "var(--text-4)" : ativa ? COR.conversas : "var(--text-4)"
  const rotuloStatus =
    c.status == null ? "—" : ativa ? "Ativa" : "Pausada"

  const subtitulo = [
    c.objetivo ? `Objetivo: ${c.objetivo}` : c.categoria ? `Categoria: ${c.categoria}` : null,
    c.destino ? `Destino: ${c.destino}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="glass" style={{ padding: "20px 22px" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: corStatus,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 17,
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
      </div>
      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4, marginLeft: 19 }}>
        <span style={{ color: corStatus, fontWeight: 600 }}>{rotuloStatus}</span>
        {subtitulo ? ` · ${subtitulo}` : ""}
      </p>

      {/* Métricas topo */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        style={{ gap: 16, marginTop: 18 }}
      >
        <Metrica label="Alcance" valor={formatNumero(c.alcance)} />
        <Metrica label="Impressões" valor={formatNumero(c.impressoes)} />
        <Metrica label="Cliques no link" valor={formatNumero(c.cliques)} />
        <Metrica label="CTR" valor={pct(c.ctr)} />
        <Metrica label="CPC" valor={brlOuTraco(c.cpc)} />
        <Metrica label="Valor gasto" valor={formatBRL(c.investimento)} cor={COR.gasto} />
      </div>

      <div
        style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "18px 0 14px" }}
      />

      {/* Conversões */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 28px", fontSize: 13 }}>
        <Conv
          label="Conversas iniciadas"
          valor={formatNumero(c.conversas)}
          cor={COR.conversas}
          custo={custoCada(c.investimento, c.conversas)}
        />
        <Conv
          label="Leads"
          valor={formatNumero(c.leads)}
          cor={COR.leads}
          custo={custoCada(c.investimento, c.leads)}
        />
        <Conv
          label="Compras"
          valor={c.compras != null ? formatNumero(c.compras) : "—"}
          cor={COR.compras}
          custo={c.compras != null ? custoCada(c.investimento, c.compras) : "—"}
        />
        <Conv
          label="Adicionou ao carrinho"
          valor={c.carrinho != null ? formatNumero(c.carrinho) : "—"}
          cor={COR.carrinho}
        />
        <Conv
          label="Visualizou página"
          valor={c.view != null ? formatNumero(c.view) : "—"}
          cor="var(--text-3)"
        />
      </div>
    </div>
  )
}

function Metrica({
  label,
  valor,
  cor,
}: {
  label: string
  valor: string
  cor?: string
}) {
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

function Conv({
  label,
  valor,
  cor,
  custo,
}: {
  label: string
  valor: string
  cor: string
  custo?: string
}) {
  return (
    <span style={{ color: "var(--text-2)" }}>
      {label}: <strong style={{ color: cor, fontWeight: 700 }}>{valor}</strong>
      {custo && custo !== "—" ? (
        <span style={{ color: "var(--text-4)" }}> ({custo})</span>
      ) : null}
    </span>
  )
}
