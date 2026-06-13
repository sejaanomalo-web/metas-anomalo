import type { Metadata } from "next"
import Image from "next/image"
import FormularioVendaCliente from "@/components/FormularioVendaCliente"
import { getClientePorVendasToken } from "@/lib/vendas-cliente"
import { clienteDisplayName } from "@/lib/clientes"
import logo from "@/public/logo-capa-app.png"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Registrar venda · Anômalo",
  robots: { index: false, follow: false },
}

/**
 * Formulário PÚBLICO de vendas do cliente — kiosk mode, sem auth, mobile-
 * first (o cliente abre pelo WhatsApp). A segurança é o token na URL
 * (uuid aleatório por cliente, copiável no dashboard do cliente).
 *
 * O que o cliente registra aqui vira evento em vendas_cliente + incremento
 * de Vendas/Faturamento no dia — aparece no funil e no ROI na hora.
 */
export default async function VendasPublicoPage({
  params,
}: {
  params: { token: string }
}) {
  const cliente = await getClientePorVendasToken(params.token)
  const valido = cliente !== null && cliente.ativo

  return (
    <main
      className="min-h-screen mx-auto px-6 py-10"
      style={{ maxWidth: 560 }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          marginBottom: 28,
        }}
      >
        <Image
          src={logo}
          alt="Anômalo"
          height={40}
          style={{ height: 40, width: "auto" }}
          priority
        />
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "-0.3px",
            marginTop: 18,
            textAlign: "center",
          }}
        >
          Registro de vendas
        </h1>
        <div className="gold-divider" style={{ marginTop: 10 }} />
        {valido && cliente && (
          <p
            style={{
              fontSize: 14,
              color: "var(--accent)",
              fontWeight: 600,
              marginTop: 14,
              textAlign: "center",
            }}
          >
            {clienteDisplayName(cliente)}
          </p>
        )}
        {valido && (
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 300,
              marginTop: 6,
              textAlign: "center",
              lineHeight: 1.55,
            }}
          >
            Teve venda vinda dos anúncios? Conte pra gente — leva menos de um
            minuto.
          </p>
        )}
      </header>

      {valido && cliente ? (
        <FormularioVendaCliente token={params.token} />
      ) : (
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
            Confira se o link foi copiado por completo ou peça um novo link
            para a equipe da Anômalo.
          </p>
        </div>
      )}

      <p
        className="mt-8 text-center"
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
