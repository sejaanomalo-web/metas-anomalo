import Link from "next/link"
import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import FormularioSemanal from "@/components/FormularioSemanal"
import { estaAutenticado } from "@/lib/auth"
import {
  ANO_PADRAO,
  SUBTITULO_EMPRESA,
  anoValido,
  empresas,
  mesValido,
} from "@/lib/data"
import {
  getComissionamentoAcumulado,
  getContextoSemanal,
} from "@/lib/semanal-actions"

export default async function SemanalPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const contexto = await getContextoSemanal(mes, ano)
  const acumulado = await getComissionamentoAcumulado(mes, ano)

  const hoje = new Date()
  const inicioSemana = new Date(hoje)
  inicioSemana.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7))
  const semana = Math.ceil(hoje.getDate() / 7)

  const linhasEmpresa = empresas.map((e) => ({
    slug: e.slug,
    db: e.db,
    nome: e.nome,
    subtitulo: SUBTITULO_EMPRESA[e.slug],
    tipo: e.tipo,
    meta: contexto[e.db]?.meta ?? 0,
    existente: contexto[e.db]?.existente ?? null,
  }))

  return (
    <>
      <Header>
        <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
      </Header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div>
          <Link
            href={`/dashboard?mes=${mes}&ano=${ano}`}
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
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <h1
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
              }}
            >
              Dados da semana
            </h1>
            <span
              style={{
                fontSize: 10,
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "#C9953A",
                background: "rgba(201,149,58,0.12)",
                border: "0.5px solid rgba(201,149,58,0.4)",
                borderRadius: 999,
                padding: "4px 10px",
                fontWeight: 500,
              }}
            >
              {mes} {ano}
            </span>
          </div>
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
            Semana {semana} ·{" "}
            {inicioSemana.toLocaleDateString("pt-BR").slice(0, 5)} a{" "}
            {hoje.toLocaleDateString("pt-BR")} · ~5 minutos
          </p>
        </div>

        <FormularioSemanal
          mes={mes}
          ano={ano}
          empresas={linhasEmpresa}
          acumuladoVinicius={acumulado.vinicius}
          acumuladoEmanuel={acumulado.emanuel}
        />
      </main>
    </>
  )
}
