import type { LeadRegistro } from "@/lib/leads"
import {
  camposExtras,
  formatarTelefone,
  linkWhatsApp,
} from "@/lib/leads-campos"
import { formatarDiaLongo } from "@/lib/leads-datas"

/**
 * Ficha de um lead no dashboard do cliente.
 *
 * Server Component. A expansão das respostas extras usa <details>/<summary>
 * nativo em vez de useState — funciona sem JavaScript, o que importa num link
 * aberto pelo navegador embutido do WhatsApp.
 *
 * O telefone vira link wa.me (abre a conversa no WhatsApp do próprio usuário)
 * e link tel: no ícone de ligar — mesmo padrão viewer-only do CRM: o sistema
 * abre a porta, a conversa acontece fora dele.
 */
export default function CardLead({ lead }: { lead: LeadRegistro }) {
  const extras = camposExtras(lead.campos)
  const wa = linkWhatsApp(lead.telefone)
  const hora = formatarHoraBRT(lead.created_time ?? lead.recebido_em)

  // Dígitos do telefone, só se sobrar coisa suficiente pra discar.
  const digitos = (lead.telefone ?? "").replace(/\D/g, "")
  const telDiscavel = digitos.length >= 10 ? digitos : null

  return (
    <div className="glass" style={{ padding: 16 }}>
      {/* Cabeçalho: nome + quando */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontSize: 15.5,
              fontWeight: 600,
              color: "var(--text-1)",
              lineHeight: 1.3,
              wordBreak: "break-word",
            }}
          >
            {lead.nome ?? "Sem nome informado"}
          </p>
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              marginTop: 3,
            }}
          >
            {lead.formulario}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
            {hora}
          </p>
          <p
            style={{
              fontSize: 10.5,
              color: "rgba(255,255,255,0.35)",
              marginTop: 2,
            }}
          >
            {formatarDiaLongo(lead.data_brt)}
          </p>
        </div>
      </div>

      {/* Contato */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 13,
        }}
      >
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="no-ds"
            style={botaoWhats}
          >
            💬 {formatarTelefone(lead.telefone)}
          </a>
        ) : (
          lead.telefone && (
            <span style={{ ...botaoNeutro, cursor: "default" }}>
              {formatarTelefone(lead.telefone)}
            </span>
          )
        )}

        {/* Só oferece "Ligar" quando sobra número discável. Um campo
            preenchido com texto viraria href="tel:+" — botão morto. */}
        {telDiscavel && (
          <a
            href={`tel:+${telDiscavel}`}
            className="no-ds"
            style={botaoNeutro}
            title="Ligar"
          >
            📞 Ligar
          </a>
        )}

        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="no-ds"
            style={botaoNeutro}
            title={lead.email}
          >
            ✉️ E-mail
          </a>
        )}
      </div>

      {/* Respostas extras do formulário */}
      {extras.length > 0 && (
        <details style={{ marginTop: 13 }}>
          <summary
            className="no-ds"
            style={{
              cursor: "pointer",
              fontSize: 11.5,
              color: "rgba(255,255,255,0.5)",
              listStyle: "none",
              padding: "5px 0",
              userSelect: "none",
            }}
          >
            Ver respostas do formulário ({extras.length})
          </summary>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 9,
              paddingTop: 10,
              borderTop: "0.5px solid rgba(255,255,255,0.09)",
            }}
          >
            {extras.map((c) => (
              <div key={c.nome}>
                <p
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.35)",
                    fontWeight: 500,
                  }}
                >
                  {c.rotulo}
                </p>
                <p
                  style={{
                    fontSize: 13.5,
                    color: "var(--text-1)",
                    marginTop: 2,
                    lineHeight: 1.5,
                    wordBreak: "break-word",
                  }}
                >
                  {c.valor}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

/** Hora no fuso BRT ("14:32"). O timestamp vem em UTC do banco. */
function formatarHoraBRT(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso))
  } catch {
    return "—"
  }
}

const botaoBase: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: 12.5,
  borderRadius: 7,
  fontWeight: 500,
  textDecoration: "none",
  whiteSpace: "nowrap",
  lineHeight: 1.2,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
}

const botaoWhats: React.CSSProperties = {
  ...botaoBase,
  border: "0.5px solid rgba(37,211,102,0.4)",
  background: "rgba(37,211,102,0.1)",
  color: "#4ade80",
  fontWeight: 600,
}

const botaoNeutro: React.CSSProperties = {
  ...botaoBase,
  border: "0.5px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "rgba(255,255,255,0.6)",
}
