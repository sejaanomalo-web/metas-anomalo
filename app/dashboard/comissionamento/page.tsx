import Link from "next/link"
import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorMes from "@/components/SeletorMes"
import CardFelipe from "@/components/CardFelipe"
import CardEditor from "@/components/CardEditor"
import { estaAutenticado } from "@/lib/auth"
import { ANO_PADRAO, MESES, type Mes, formatBRL } from "@/lib/data"
import { getComissionamentoMes } from "@/lib/comissionamento-actions"
import { supabaseConfigurado } from "@/lib/supabase"

function mesValido(m: string | undefined): Mes {
  if (m && (MESES as readonly string[]).includes(m)) return m as Mes
  return "Abril"
}

const FAIXAS_VINICIUS = [
  { limite: 10, valor: 0, rotulo: "Menos de 10 entregas" },
  { limite: 15, valor: 100, rotulo: "10 a 14 entregas" },
  { limite: 20, valor: 200, rotulo: "15 a 19 entregas" },
  { limite: 25, valor: 350, rotulo: "20 a 24 entregas" },
  { limite: 30, valor: 500, rotulo: "25 a 29 entregas" },
  { limite: null, valor: 700, rotulo: "30 ou mais entregas" },
]

const FAIXAS_EMANUEL = [
  { limite: 5, valor: 0, rotulo: "Menos de 5 entregas" },
  { limite: 8, valor: 100, rotulo: "5 a 7 entregas" },
  { limite: 11, valor: 200, rotulo: "8 a 10 entregas" },
  { limite: 15, valor: 350, rotulo: "11 a 14 entregas" },
  { limite: null, valor: 500, rotulo: "15 ou mais entregas" },
]

export default async function ComissionamentoPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const mes = mesValido(searchParams?.mes)
  const supabaseOk = supabaseConfigurado()
  const registros = await getComissionamentoMes(mes)

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
        <SeletorMes mesAtual={mes} />
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Link
              href={`/dashboard?mes=${mes}`}
              className="text-xs uppercase tracking-widest text-neutral-500 hover:text-gold transition"
            >
              ← Voltar ao painel
            </Link>
            <h1 className="mt-3 text-3xl font-medium tracking-tight text-white">
              Comissionamento do Time
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              {mes} de {ANO_PADRAO} · Bônus por performance e entregas
            </p>
          </div>
          <div className="card px-5 py-3">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">
              Total pago no mês
            </p>
            <p className="text-xl font-medium text-gold">
              {formatBRL(totalBonus)}
            </p>
          </div>
        </div>

        {!supabaseOk && (
          <div className="p-4 rounded-lg border border-red-900/60 bg-red-950/30 text-sm text-red-300">
            Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e
            NEXT_PUBLIC_SUPABASE_ANON_KEY para salvar o comissionamento.
          </div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <CardFelipe
            mes={mes}
            ano={ANO_PADRAO}
            existente={felipe}
            supabaseOk={supabaseOk}
          />
          <CardEditor
            colaborador="vinicius"
            nome="Vinicius"
            funcao="Editor · estáticos e carrosséis"
            faixas={FAIXAS_VINICIUS}
            mes={mes}
            ano={ANO_PADRAO}
            existente={vinicius}
            supabaseOk={supabaseOk}
          />
          <CardEditor
            colaborador="emanuel"
            nome="Emanuel"
            funcao="Editor de vídeo · Reels"
            faixas={FAIXAS_EMANUEL}
            mes={mes}
            ano={ANO_PADRAO}
            existente={emanuel}
            supabaseOk={supabaseOk}
          />
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-10 text-center">
        <p className="text-[11px] uppercase tracking-widest text-neutral-700">
          Anômalo Hub · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  )
}
