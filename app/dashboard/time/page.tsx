import Link from "next/link"
import { anoValido, mesValido } from "@/lib/data"

/**
 * Página Time — hub de acesso às seções do time:
 *   • Comissionamento (cálculo de bônus por colaborador)
 *   • Formulários diários (gestão de preenchedores)
 *
 * Cards grandes clicáveis substituem os sub-itens do rail; o link do
 * Time no rail agora vem direto pra cá em vez de expandir um submenu.
 */
export default async function TimePage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-10"
        style={{ maxWidth: 1280 }}
      >
        {/* Hero */}
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-3)",
              letterSpacing: "0.01em",
            }}
          >
            Time
          </p>
          <h1 style={{ marginTop: 6, fontSize: 36 }}>Time do Hub</h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
            }}
          >
            Gestão de comissionamento e formulários diários do time.
          </p>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {/* Cards de navegação */}
        <section
          className="grid grid-cols-1 md:grid-cols-2"
          style={{ gap: 20 }}
        >
          <CardNavegacao
            href={`/dashboard/comissionamento?mes=${mes}&ano=${ano}`}
            titulo="Comissionamento"
            descricao="Cálculo de bônus por performance e entregas, com edição de metas mensais por colaborador."
            icon={<IconeMoeda />}
          />
          <CardNavegacao
            href="/dashboard/preenchedores"
            titulo="Formulários diários"
            descricao="Gestão de gestores de tráfego (pago) e SDRs (orgânico). Links permanentes para preenchimento."
            icon={<IconeFormulario />}
          />
        </section>
      </main>

      <footer
        className="mx-auto px-8 py-8 text-center"
        style={{ maxWidth: 1280 }}
      >
        <p
          style={{
            fontSize: 11,
            color: "var(--text-4)",
            fontWeight: 400,
          }}
        >
          Anômalo Hub · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  )
}

function CardNavegacao({
  href,
  titulo,
  descricao,
  icon,
}: {
  href: string
  titulo: string
  descricao: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="glass glass-hover block"
      style={{
        padding: "28px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        textDecoration: "none",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "rgba(201, 149, 58, 0.12)",
          color: "var(--accent)",
        }}
      >
        {icon}
      </span>
      <div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "var(--text-1)",
            letterSpacing: "-0.015em",
            lineHeight: 1.2,
          }}
        >
          {titulo}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-3)",
            fontWeight: 400,
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {descricao}
        </p>
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--accent)",
          marginTop: 4,
        }}
      >
        Acessar →
      </span>
    </Link>
  )
}

function IconeMoeda() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M15 9.5C14.4 8.6 13.3 8 12 8c-1.7 0-3 .9-3 2.5S10.3 13 12 13c1.7 0 3 .9 3 2.5S13.7 18 12 18c-1.3 0-2.4-.6-3-1.5" />
    </svg>
  )
}

function IconeFormulario() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  )
}
