import SeletorPeriodo from "@/components/SeletorPeriodo"
import FormularioManual from "@/components/FormularioManual"
import {
  anoValido,
  mesValido,
} from "@/lib/data"
import { listarEmpresas } from "@/lib/empresas-actions"

export const dynamic = "force-dynamic"

/**
 * Página admin de Formulários. Substitui o antigo /dashboard/preenchedores
 * (que gerenciava preenchedores com tokens individuais). Agora:
 *
 *   • Um único form inline com seletor de empresa
 *   • Botão "Copiar link público" gera a URL /formulario (sem token)
 *
 * O mesmo componente FormularioManual também é usado em /formulario
 * (público, fora do dashboard layout) — UI consistente nos dois mundos.
 */
export default async function FormulariosPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
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
          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ fontSize: 36 }}>Preenchimento manual</h1>
            <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            Insira os dados manuais do dia (reuniões, contratos, faturamento)
            pra qualquer empresa. Investimento, leads e CPL ficam de fora —
            esses vêm do agente Sentinela. Use o link público pra
            compartilhar com quem só vai preencher.
          </p>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        <FormularioManual
          empresas={empresas}
          mes={mes}
          ano={ano}
          copiarLinkPublico
        />
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
