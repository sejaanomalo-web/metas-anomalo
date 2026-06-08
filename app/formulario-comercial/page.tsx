import Image from "next/image"
import FormularioComercial from "@/components/FormularioComercial"
import { listarEmpresas } from "@/lib/empresas-actions"
import logo from "@/public/logo-capa-app.png"

export const dynamic = "force-dynamic"

/**
 * Versão PÚBLICA do formulário comercial. Sem auth, sem dashboard chrome.
 * Link compartilhável (https://<domínio>/formulario-comercial) — o time
 * comercial escolhe a empresa, a data e lança o relatório do dia. Sem o
 * bloco de pipeline (que precisa de sessão) e sem o botão de copiar link.
 */
export default async function FormularioComercialPublicoPage() {
  const empresas = await listarEmpresas(true)

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
          Relatório comercial
        </h1>
        <div className="gold-divider" style={{ marginTop: 10 }} />
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 300,
            marginTop: 14,
            textAlign: "center",
            lineHeight: 1.55,
          }}
        >
          Escolha a empresa e a data, depois lance os dados do dia.
        </p>
      </header>

      <FormularioComercial empresas={empresas} />

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
