import Link from "next/link"
import {
  PERIODOS_ORDEM,
  resolverPeriodo,
  type ChavePeriodo,
} from "@/lib/leads-datas"
import type { FormularioDoCliente } from "@/lib/leads"

/**
 * Filtros do dashboard público de leads: período e formulário.
 *
 * Server Component puro que renderiza <Link>. Sem estado, sem JS de cliente,
 * sem hidratação — o filtro inteiro vive na URL (?p=&f=), igual ao padrão
 * URL-driven do SeletorPeriodo do dashboard interno.
 *
 * Por que isso importa aqui: o cliente abre este link pelo WhatsApp, muitas
 * vezes em conexão ruim e navegador embutido. Link puro funciona antes de
 * qualquer bundle carregar, é compartilhável (o filtro vai junto na URL) e o
 * botão "voltar" do celular se comporta como a pessoa espera.
 */
export default function FiltrosLeads({
  token,
  periodoAtual,
  formAtual,
  formularios,
  hojeBRT,
}: {
  token: string
  periodoAtual: ChavePeriodo
  formAtual: string | null
  formularios: FormularioDoCliente[]
  hojeBRT: string
}) {
  function href(p: ChavePeriodo, f: string | null): string {
    const qs = new URLSearchParams()
    qs.set("p", p)
    if (f) qs.set("f", f)
    return `/leads/${token}?${qs.toString()}`
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Período */}
      <div>
        <p style={rotuloGrupo}>Período</p>
        <div style={linha}>
          {PERIODOS_ORDEM.map((chave) => {
            const ativo = chave === periodoAtual
            const intervalo = resolverPeriodo(chave, hojeBRT)
            return (
              <Link
                key={chave}
                href={href(chave, formAtual)}
                scroll={false}
                title={intervalo.detalhe}
                style={ativo ? chipAtivo : chip}
                className="no-ds"
              >
                {intervalo.rotulo}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Formulário — só aparece se houver mais de um. Com um formulário só,
          o filtro não teria função e viraria ruído na tela. */}
      {formularios.length > 1 && (
        <div>
          <p style={rotuloGrupo}>Formulário</p>
          <div style={linha}>
            <Link
              href={href(periodoAtual, null)}
              scroll={false}
              style={formAtual === null ? chipAtivo : chip}
              className="no-ds"
            >
              Todos
            </Link>
            {formularios.map((f) => (
              <Link
                key={f.form_id}
                href={href(periodoAtual, f.form_id)}
                scroll={false}
                style={formAtual === f.form_id ? chipAtivo : chip}
                className="no-ds"
              >
                {f.rotulo}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const rotuloGrupo: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "1.2px",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.35)",
  fontWeight: 500,
  marginBottom: 8,
}

const linha: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 7,
}

const chip: React.CSSProperties = {
  padding: "7px 13px",
  fontSize: 12.5,
  borderRadius: 999,
  border: "0.5px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "rgba(255,255,255,0.62)",
  fontWeight: 500,
  textDecoration: "none",
  whiteSpace: "nowrap",
  lineHeight: 1.2,
}

const chipAtivo: React.CSSProperties = {
  ...chip,
  border: "0.5px solid rgba(201,149,58,0.55)",
  background: "rgba(201,149,58,0.14)",
  color: "var(--accent)",
  fontWeight: 600,
}
