import SeletorPeriodo from "@/components/SeletorPeriodo"
import FormConfig from "@/components/FormConfig"
import { ANO_PADRAO, mesValido } from "@/lib/data"
import {
  montarResumoDiario,
  montarResumoMensal,
  montarResumoSemanal,
} from "@/lib/resumos"

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  const mes = mesValido(searchParams?.mes)

  const [mensagemDiario, mensagemSemanal, mensagemMensal] = await Promise.all([
    montarResumoDiario(),
    montarResumoSemanal(),
    montarResumoMensal(),
  ])

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-8"
        style={{ maxWidth: 1280 }}
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
            Sistema
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
            <h1 style={{ fontSize: 36 }}>Configurações</h1>
            <SeletorPeriodo mesAtual={mes} anoAtual={ANO_PADRAO} />
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
            }}
          >
            Resumos para enviar no WhatsApp · clique em copiar e cole no chat
          </p>
        </div>

        <FormConfig
          mensagemDiario={mensagemDiario}
          mensagemSemanal={mensagemSemanal}
          mensagemMensal={mensagemMensal}
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
