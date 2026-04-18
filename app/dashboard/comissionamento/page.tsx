import Link from "next/link"
import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import CardFelipe from "@/components/CardFelipe"
import CardEditor from "@/components/CardEditor"
import DrawerEdicaoComissao from "@/components/DrawerEdicaoComissao"
import { estaAutenticado } from "@/lib/auth"
import { anoValido, formatBRL, mesValido } from "@/lib/data"
import { getComissionamentoMes } from "@/lib/comissionamento-actions"
import {
  listarColaboradores,
  listarMetasDoMes,
} from "@/lib/comissionamento-config"
import type { ConfiguracaoComissao } from "@/lib/supabase"
import { supabaseConfigurado } from "@/lib/supabase"

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
  searchParams: { mes?: string; ano?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const supabaseOk = supabaseConfigurado()
  const [registros, metasEditaveis, colaboradoresExtras] = await Promise.all([
    getComissionamentoMes(mes, ano),
    listarMetasDoMes(mes, ano),
    listarColaboradores(true),
  ])

  const PADROES: Record<string, ConfiguracaoComissao> = {
    felipe: {
      tipo: "gatilhos",
      gatilhos: [
        { chave: "cpl_meta", rotulo: "CPL dentro da meta", valor: 200 },
        { chave: "leads_meta", rotulo: "Meta de leads atingida", valor: 200 },
        {
          chave: "roas_hato",
          rotulo: "ROAS Hato acima do alvo",
          valor: 150,
          alvoRoas: 2.5,
        },
        { chave: "posts_prazo", rotulo: "100% posts no prazo", valor: 150 },
      ],
    },
    vinicius: {
      tipo: "escala",
      faixas: [
        { minimo: 0, bonus: 0 },
        { minimo: 10, bonus: 100 },
        { minimo: 15, bonus: 200 },
        { minimo: 20, bonus: 350 },
        { minimo: 25, bonus: 500 },
        { minimo: 30, bonus: 700 },
      ],
    },
    emanuel: {
      tipo: "escala",
      faixas: [
        { minimo: 0, bonus: 0 },
        { minimo: 5, bonus: 100 },
        { minimo: 8, bonus: 200 },
        { minimo: 11, bonus: 350 },
        { minimo: 15, bonus: 500 },
      ],
    },
  }

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

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
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
              Comissionamento do Time
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
              {mes} de {ano} · Bônus por performance e entregas
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="glass" style={{ padding: "14px 22px" }}>
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: "2px",
                  color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase",
                  fontWeight: 500,
                }}
              >
                Total pago no mês
              </p>
              <p
                style={{
                  fontSize: 22,
                  color: "#C9953A",
                  fontWeight: 700,
                  marginTop: 4,
                  letterSpacing: "-0.3px",
                }}
              >
                {formatBRL(totalBonus)}
              </p>
            </div>
            <DrawerEdicaoComissao
              mes={mes}
              ano={ano}
              supabaseOk={supabaseOk}
              colaboradores={colaboradoresExtras}
              metasPorColaborador={metasEditaveis}
              padroesPorColaborador={PADROES}
            />
          </div>
        </div>

        {!supabaseOk && (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              border: "0.5px solid rgba(226,75,74,0.35)",
              background: "rgba(226,75,74,0.08)",
              color: "#e24b4a",
              fontSize: 12,
              fontWeight: 400,
            }}
          >
            Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e
            NEXT_PUBLIC_SUPABASE_ANON_KEY para salvar o comissionamento.
          </div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

      <footer className="max-w-7xl mx-auto px-6 py-10 text-center">
        <p
          style={{
            fontSize: 10,
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.15)",
            fontWeight: 400,
          }}
        >
          Anômalo Hub · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  )
}
