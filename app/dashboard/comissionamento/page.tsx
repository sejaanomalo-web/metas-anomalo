import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import SectionBar from "@/components/SectionBar"
import CardFelipe from "@/components/CardFelipe"
import CardEditor from "@/components/CardEditor"
import { estaAutenticado } from "@/lib/auth"
import { anoValido, formatBRL, mesValido } from "@/lib/data"
import { getComissionamentoMes } from "@/lib/comissionamento-actions"
import { supabaseConfigurado } from "@/lib/supabase"

const FAIXAS_VINICIUS = [
  { valor: 0, rotulo: "Menos de 10 entregas" },
  { valor: 100, rotulo: "10 a 14 entregas" },
  { valor: 200, rotulo: "15 a 19 entregas" },
  { valor: 350, rotulo: "20 a 24 entregas" },
  { valor: 500, rotulo: "25 a 29 entregas" },
  { valor: 700, rotulo: "30 ou mais entregas" },
]

const FAIXAS_EMANUEL = [
  { valor: 0, rotulo: "Menos de 5 entregas" },
  { valor: 100, rotulo: "5 a 7 entregas" },
  { valor: 200, rotulo: "8 a 10 entregas" },
  { valor: 350, rotulo: "11 a 14 entregas" },
  { valor: 500, rotulo: "15 ou mais entregas" },
]

export default async function ComissionamentoPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const supabaseOk = supabaseConfigurado()
  const registros = await getComissionamentoMes(mes, ano)

  const felipe = registros.find((r) => r.colaborador === "felipe") ?? null
  const vinicius = registros.find((r) => r.colaborador === "vinicius") ?? null
  const emanuel = registros.find((r) => r.colaborador === "emanuel") ?? null

  const totalBonus =
    (felipe?.bonus_calculado ?? 0) +
    (vinicius?.bonus_calculado ?? 0) +
    (emanuel?.bonus_calculado ?? 0)

  return (
    <>
      <Header>
        <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
      </Header>

      <SectionBar
        titulo={`Comissionamento · ${mes} ${ano}`}
        hint={`Total pago · ${formatBRL(totalBonus)}`}
      />

      <main
        style={{
          background: "#090909",
          padding: "16px 24px",
        }}
      >
        {!supabaseOk && (
          <div
            style={{
              padding: 16,
              border: "0.5px solid #5a1e1e",
              background: "#1a0a0a",
              color: "#e24b4a",
              fontSize: 11,
              borderRadius: 4,
              marginBottom: 16,
            }}
          >
            Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e
            NEXT_PUBLIC_SUPABASE_ANON_KEY no Vercel.
          </div>
        )}

        <section
          className="grid grid-cols-1 lg:grid-cols-3"
          style={{ gap: 10 }}
        >
          <CardFelipe
            mes={mes}
            ano={ano}
            existente={felipe}
            supabaseOk={supabaseOk}
          />
          <CardEditor
            colaborador="vinicius"
            nome="Vinicius"
            funcao="Editor · estáticos e carrosséis"
            faixas={FAIXAS_VINICIUS}
            mes={mes}
            ano={ano}
            existente={vinicius}
            supabaseOk={supabaseOk}
          />
          <CardEditor
            colaborador="emanuel"
            nome="Emanuel"
            funcao="Editor de vídeo · Reels"
            faixas={FAIXAS_EMANUEL}
            mes={mes}
            ano={ano}
            existente={emanuel}
            supabaseOk={supabaseOk}
          />
        </section>
      </main>
    </>
  )
}
