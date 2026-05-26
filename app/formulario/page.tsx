import Image from "next/image"
import FormularioManual from "@/components/FormularioManual"
import { listarEmpresas } from "@/lib/empresas-actions"
import logo from "@/public/logo-capa-app.png"

export const dynamic = "force-dynamic"

/**
 * Versão PÚBLICA do formulário manual. Sem auth, sem dashboard chrome.
 * O link é compartilhável (https://<domínio>/formulario) — qualquer
 * pessoa que tiver acesso pode preencher.
 *
 * Same FormularioManual component usado em /dashboard/formularios, só
 * que aqui sem o botão "Copiar link público" (não faz sentido pra quem
 * já tá no link).
 */
export default async function FormularioPublicoPage() {
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
          Preenchimento diário
        </h1>
        <div className="gold-divider" style={{ marginTop: 10 }} />
        <p
          style={{
            fontSize: 12,
            color: "rgba(0,0,0,0.45)",
            fontWeight: 300,
            marginTop: 14,
            textAlign: "center",
            lineHeight: 1.55,
          }}
        >
          Escolha empresa e data, depois lance os dados.
        </p>
      </header>

      <FormularioManual empresas={empresas} />

      <p
        className="mt-8 text-center"
        style={{
          fontSize: 10,
          letterSpacing: "1.5px",
          color: "rgba(0,0,0,0.2)",
          textTransform: "uppercase",
          fontWeight: 400,
        }}
      >
        Grupo Anômalo Hub
      </p>
    </main>
  )
}
