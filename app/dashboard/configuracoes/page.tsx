import Link from "next/link"
import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import FormConfig from "@/components/FormConfig"
import { estaAutenticado } from "@/lib/auth"
import { ANO_PADRAO, mesValido } from "@/lib/data"
import { getConfigResumos } from "@/lib/configuracoes"
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
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const mes = mesValido(searchParams?.mes)
  const config = await getConfigResumos()

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  const linkSemanal = origin ? `${origin}/dashboard/semanal` : undefined

  const [mensagemDiario, mensagemSemanal, mensagemMensal] = await Promise.all([
    montarResumoDiario(),
    montarResumoSemanal(linkSemanal),
    montarResumoMensal(),
  ])

  return (
    <>
      <Header>
        <SeletorPeriodo mesAtual={mes} anoAtual={ANO_PADRAO} />
      </Header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div>
          <Link
            href={`/dashboard?mes=${mes}`}
            style={{
              fontSize: 10,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.3)",
              fontWeight: 500,
            }}
            className="hover:text-[#C9953A] transition"
          >
            ← Voltar ao painel
          </Link>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.5px",
              lineHeight: 1.1,
              marginTop: 14,
            }}
          >
            Configurações
          </h1>
          <div
            className="gold-divider"
            style={{ marginTop: 10, marginBottom: 10 }}
          />
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 300,
            }}
          >
            Contatos + envio manual de resumos via WhatsApp
          </p>
        </div>

        <FormConfig
          configInicial={config}
          mensagemDiario={mensagemDiario}
          mensagemSemanal={mensagemSemanal}
          mensagemMensal={mensagemMensal}
        />
      </main>
    </>
  )
}
