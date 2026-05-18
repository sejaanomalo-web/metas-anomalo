import FormularioManual from "@/components/FormularioManual"
import { listarEmpresas } from "@/lib/empresas-actions"

export const dynamic = "force-dynamic"

/**
 * Página admin de Formulários. Substitui o antigo /dashboard/preenchedores
 * (que gerenciava preenchedores com tokens individuais). Agora:
 *
 *   • Um único form inline com seletor de empresa + seletor de data
 *   • Botão "Copiar link público" gera a URL /formulario (sem token)
 *
 * O mesmo componente FormularioManual também é usado em /formulario
 * (público, fora do dashboard layout) — UI consistente nos dois mundos.
 *
 * Sem SeletorPeriodo aqui: o seletor de data dentro do form é a fonte
 * única — define em qual dia/mês/ano o registro entra no banco.
 */
export default async function FormulariosPage() {
  const empresas = await listarEmpresas(true)

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-8"
        style={{ maxWidth: 820 }}
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
          <h1 style={{ marginTop: 6, fontSize: 36 }}>Preenchimento manual</h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            Insira reuniões, contratos e faturamento de qualquer empresa,
            em qualquer dia. Investimento, leads e CPL ficam de fora —
            esses vêm do agente Sentinela. Use o link público pra
            compartilhar com quem só vai preencher.
          </p>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        <FormularioManual empresas={empresas} copiarLinkPublico />
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
