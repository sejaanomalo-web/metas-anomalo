import type { Metadata } from "next"
import Image from "next/image"
import FiltrosLeads from "@/components/leads/FiltrosLeads"
import CardLead from "@/components/leads/CardLead"
import {
  getClientePorLeadsToken,
  listarFormulariosDoCliente,
  listarLeadsDoCliente,
} from "@/lib/leads"
import { clienteDisplayName } from "@/lib/clientes"
import { diaBRT, parseChavePeriodo, resolverPeriodo } from "@/lib/leads-datas"
import logo from "@/public/logo-capa-app.png"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Meus leads · Anômalo",
  // noindex é REQUISITO, não estética: a página é pública por token e não pode
  // aparecer em busca. Mesmo tratamento do formulário /vendas/<token>.
  robots: { index: false, follow: false },
}

// Teto por página. Um cliente com meses de histórico e filtro "Tudo" traria
// dezenas de milhares de linhas pro celular dele.
const LIMITE = 500

/**
 * Dashboard PÚBLICO de leads do cliente — sem login, mobile-first.
 *
 * A segurança é o token uuid v4 na URL (leads_dash_token em cliente_trafego),
 * mesmo modelo já em produção no formulário /vendas/<token>: 122 bits de
 * entropia, não enumerável, rotacionável pelo admin se o link vazar.
 *
 * Nunca há login: o link é copiado no painel interno e enviado ao cliente pelo
 * WhatsApp manualmente. O cliente abre e filtra por período e formulário.
 *
 * A leitura passa por service_role com filtro por cliente_id NO SERVIDOR —
 * leads_log tem RLS sem policy e a chave anon não a enxerga. O token nunca
 * vira credencial de banco; ele só resolve QUAL cliente_id consultar.
 */
export default async function LeadsPublicoPage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams: { p?: string; f?: string }
}) {
  const cliente = await getClientePorLeadsToken(params.token)

  if (!cliente || !cliente.ativo) {
    return <PaginaInvalida />
  }

  const hoje = diaBRT()
  const chave = parseChavePeriodo(searchParams.p)
  const intervalo = resolverPeriodo(chave, hoje)

  const formularios = await listarFormulariosDoCliente(cliente.id)

  // Só aceita um form_id que realmente pertença a este cliente. Sem esta
  // checagem, ?f=<id de outro cliente> não vazaria dados (a query filtra por
  // cliente_id de qualquer jeito), mas confirmaria por tentativa e erro se um
  // form_id existe — e deixaria um filtro fantasma marcado na tela.
  const formSolicitado = searchParams.f ?? null
  const formAtual =
    formSolicitado && formularios.some((f) => f.form_id === formSolicitado)
      ? formSolicitado
      : null

  const leads = await listarLeadsDoCliente(
    cliente.id,
    intervalo,
    formAtual,
    LIMITE,
    formularios
  )

  return (
    <main className="min-h-screen mx-auto px-5 py-9" style={{ maxWidth: 680 }}>
      <header style={{ marginBottom: 26 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Image
            src={logo}
            alt="Anômalo"
            height={36}
            style={{ height: 36, width: "auto" }}
            priority
          />
          <h1
            style={{
              fontSize: 21,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.3px",
              marginTop: 16,
              textAlign: "center",
            }}
          >
            Seus leads
          </h1>
          <div className="gold-divider" style={{ marginTop: 10 }} />
          <p
            style={{
              fontSize: 14,
              color: "var(--accent)",
              fontWeight: 600,
              marginTop: 13,
              textAlign: "center",
            }}
          >
            {clienteDisplayName(cliente)}
          </p>
        </div>
      </header>

      <section style={{ marginBottom: 20 }}>
        <FiltrosLeads
          token={params.token}
          periodoAtual={chave}
          formAtual={formAtual}
          formularios={formularios}
          hojeBRT={hoje}
        />
      </section>

      {/* Contagem do recorte atual */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: "0.5px solid rgba(255,255,255,0.08)",
        }}
      >
        <p style={{ fontSize: 15, color: "var(--text-1)", fontWeight: 600 }}>
          {leads.length === 0
            ? "Nenhum lead"
            : leads.length === 1
              ? "1 lead"
              : `${leads.length} leads`}
          {leads.length === LIMITE && "+"}
        </p>
        <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>
          {intervalo.detalhe}
        </p>
      </div>

      {leads.length === 0 ? (
        <div className="glass" style={{ padding: 28, textAlign: "center" }}>
          <p style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-1)" }}>
            Nenhum lead neste período
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-3)",
              marginTop: 9,
              lineHeight: 1.6,
            }}
          >
            Experimente ampliar o filtro — “Este mês” ou “Tudo” mostram todo o
            histórico registrado.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {leads.map((lead) => (
            <CardLead key={lead.id} lead={lead} />
          ))}
        </div>
      )}

      {leads.length === LIMITE && (
        <p
          style={{
            fontSize: 11.5,
            color: "rgba(255,255,255,0.35)",
            textAlign: "center",
            marginTop: 16,
            lineHeight: 1.6,
          }}
        >
          Mostrando os {LIMITE} leads mais recentes deste período. Use um
          filtro menor para ver os anteriores.
        </p>
      )}

      <p
        className="mt-9 text-center"
        style={{
          fontSize: 10,
          letterSpacing: "1.5px",
          color: "rgba(255,255,255,0.2)",
          textTransform: "uppercase",
          fontWeight: 400,
        }}
      >
        Grupo Anômalo Hub
      </p>
    </main>
  )
}

/** Token desconhecido, malformado ou cliente desativado — resposta idêntica
 *  nos três casos, pra não confirmar a existência de token nenhum. */
function PaginaInvalida() {
  return (
    <main className="min-h-screen mx-auto px-6 py-10" style={{ maxWidth: 520 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: 26,
        }}
      >
        <Image
          src={logo}
          alt="Anômalo"
          height={36}
          style={{ height: 36, width: "auto" }}
          priority
        />
      </div>
      <div className="glass" style={{ padding: 28, textAlign: "center" }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>
          Link inválido ou desativado
        </p>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-3)",
            marginTop: 10,
            lineHeight: 1.6,
          }}
        >
          Confira se o link foi copiado por completo ou peça um novo link para a
          equipe da Anômalo.
        </p>
      </div>
    </main>
  )
}
