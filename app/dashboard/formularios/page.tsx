import FormulariosSecoes from "@/components/FormulariosSecoes"
import { listarEmpresas } from "@/lib/empresas-actions"
import { requererPermissao, temPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * Aba Formulários reformulada em duas SEÇÕES visuais:
 *   • Comercial    → relatório diário do comercial + pipeline
 *   • Tráfego Pago → preenchimento manual de dados reais por empresa
 *
 * O acesso à aba exige a permissão "formularios"; cada seção é gateada
 * individualmente por formulario_comercial / formulario_trafego. O
 * componente cliente FormulariosSecoes só renderiza as seções permitidas.
 */
export default async function FormulariosPage() {
  const usuario = await requererPermissao("formularios")
  const podeComercial = temPermissao(usuario, "formulario_comercial")
  const podeTrafego = temPermissao(usuario, "formulario_trafego")

  const empresas = await listarEmpresas(true)

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-8"
        style={{ maxWidth: 900 }}
      >
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-3)",
              letterSpacing: "0.01em",
            }}
          >
            Formulários
          </p>
          <h1 style={{ marginTop: 6, fontSize: 36 }}>Preenchimento</h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            Selecione a seção e insira os dados. Comercial registra o
            relatório diário e o pipeline; Tráfego Pago registra reuniões,
            contratos e faturamento por empresa (investimento, leads e CPL
            vêm do agente Sentinela).
          </p>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {!podeComercial && !podeTrafego ? (
          <div
            className="glass"
            style={{ padding: "28px", textAlign: "center" }}
          >
            <p style={{ fontSize: 14, color: "var(--text-2)" }}>
              Você não tem acesso a nenhuma seção de formulário. Fale com um
              administrador.
            </p>
          </div>
        ) : (
          <FormulariosSecoes
            empresas={empresas}
            podeComercial={podeComercial}
            podeTrafego={podeTrafego}
          />
        )}
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
