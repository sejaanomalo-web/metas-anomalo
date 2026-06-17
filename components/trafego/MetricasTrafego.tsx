import { formatBRL, formatNumero } from "@/lib/data"
import { COR_MAP } from "@/lib/design-tokens"
import type { ResumoTrafego } from "@/lib/sentinela"

/**
 * Bloco-herói + grade de cartões de métrica de anúncios, no modelo
 * aprovado pelo usuário (print). Segue o design system (.glass, tokens,
 * accent). Compartilhado entre painel de EMPRESA e de CLIENTE.
 *
 * Métricas de anúncio (cliques, alcance, frequência, conversas, CTR/CPC/
 * CPM) vêm do Meta via Sentinela — mostram 0/R$ 0,00 até o agente popular
 * (mesma semântica do print). Negócio: agendamentos←reuniões,
 * vendas←contratos, faturamento←faturamento, lucro/ROI derivados.
 */
export default function MetricasTrafego({
  resumo,
}: {
  resumo: ResumoTrafego
}) {
  const pctFmt = (v: number | null) =>
    v === null ? "0.00%" : `${(v * 100).toFixed(2)}%`

  return (
    <div className="space-y-4">
      {/* Bloco-herói */}
      <section
        className="glass"
        style={{
          padding: "26px 28px",
          background:
            "linear-gradient(135deg, rgba(64,98,240,0.95), rgba(64,98,240,0.78))",
          border: "1px solid rgba(120,150,255,0.45)",
          boxShadow: "0 0 40px rgba(64,98,240,0.25)",
          color: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <p style={{ fontSize: 13, opacity: 0.85, fontWeight: 500 }}>
              Valor investido em anúncios
            </p>
            <p
              style={{
                fontSize: 40,
                fontWeight: 700,
                marginTop: 4,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatBRL(resumo.investimento)}
            </p>
          </div>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "rgba(255,255,255,0.18)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 700,
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            $
          </span>
        </div>

        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.22)",
            margin: "18px 0 16px",
          }}
        />

        <div
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ gap: 18 }}
        >
          <HeroSub label="Lucro" valor={formatBRL(resumo.lucro)} verde />
          <HeroSub label="Vendas" valor={formatNumero(resumo.contratos)} />
          <HeroSub label="Realizados" valor={formatNumero(resumo.reunioes)} />
          <HeroSub label="Faturamento" valor={formatBRL(resumo.faturamento)} />
        </div>
      </section>

      {/* Grade de cartões — 2 col no mobile (mantido), 4+4 no desktop */}
      <section
        className="grid grid-cols-2 md:grid-cols-4"
        style={{ gap: 12 }}
      >
        <Cartao
          cor="green"
          icone={<IconeChat />}
          titulo="Conversas iniciadas"
          valor={formatNumero(resumo.conversas)}
          sub="Via WhatsApp/Messenger"
        />
        <Cartao
          cor="green"
          icone={<IconeSacola />}
          titulo="Vendas"
          valor={formatNumero(resumo.contratos)}
          sub={resumo.contratos === 0 ? "Nenhuma venda" : "vendas no período"}
        />
        <Cartao
          cor="blue"
          icone={<IconeCursor />}
          titulo="Pessoas clicaram"
          valor={formatNumero(resumo.cliques)}
          sub={`CTR ${pctFmt(resumo.ctr)}`}
        />
        <Cartao
          cor="purple"
          icone={<IconePessoas />}
          titulo="Pessoas alcançadas"
          valor={formatNumero(resumo.alcance)}
          sub={`${resumo.frequencia === null ? "0.0" : resumo.frequencia.toFixed(1)}x por pessoa`}
        />
        <Cartao
          cor="blue"
          icone={<IconeAlvo />}
          titulo="Custo por clique"
          valor={resumo.cpc === null ? formatBRL(0) : formatBRL(resumo.cpc)}
          sub="CPC"
        />
        <Cartao
          cor="green"
          icone={<IconeAlvo />}
          titulo="Custo por resultado"
          valor={resumo.cpl === null ? formatBRL(0) : formatBRL(resumo.cpl)}
          sub="por resultado"
        />
        <Cartao
          cor="purple"
          icone={<IconePulso />}
          titulo="Custo por 1000 views"
          valor={resumo.cpm === null ? formatBRL(0) : formatBRL(resumo.cpm)}
          sub="CPM"
        />
        <Cartao
          cor="orange"
          icone={<IconeCursor />}
          titulo="Taxa de cliques"
          valor={pctFmt(resumo.ctr)}
          sub="CTR"
        />
      </section>
    </div>
  )
}

function HeroSub({
  label,
  valor,
  verde,
}: {
  label: string
  valor: string
  verde?: boolean
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          fontSize: 11,
          opacity: 0.8,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 20,
          fontWeight: 700,
          marginTop: 2,
          color: verde ? "#7CF2A8" : "#fff",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
      </p>
    </div>
  )
}

function Cartao({
  cor,
  icone,
  titulo,
  valor,
  sub,
}: {
  cor: keyof typeof COR_MAP
  icone: React.ReactNode
  titulo: string
  valor: string
  sub: string
}) {
  const c = COR_MAP[cor]
  return (
    // Mobile: padding original (16/16/14). Desktop (md+): achatado.
    <div className="glass px-4 pt-4 pb-3.5 md:pt-3 md:pb-3">
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: c.bg,
          boxShadow: `0 0 14px ${c.glow}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
        aria-hidden="true"
      >
        {icone}
      </span>
      <p className="mt-3 md:mt-2" style={{ fontSize: 13, color: "var(--text-2)" }}>
        {titulo}
      </p>
      <p
        style={{
          fontSize: 24,
          fontWeight: 700,
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
      </p>
      <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>{sub}</p>
    </div>
  )
}

/* ===== Ícones (stroke currentColor) ===== */
function IconeChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
  )
}
function IconeSacola() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
  )
}
function IconeCursor() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="m13 13 6 6" /></svg>
  )
}
function IconePessoas() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  )
}
function IconeAlvo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
  )
}
function IconePulso() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
  )
}
