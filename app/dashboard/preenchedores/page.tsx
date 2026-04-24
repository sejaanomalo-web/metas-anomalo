import Link from "next/link"
import { redirect } from "next/navigation"
import Header from "@/components/Header"
import GerenciadorPreenchedores from "@/components/GerenciadorPreenchedores"
import { estaAutenticado } from "@/lib/auth"
import { listarEmpresas } from "@/lib/empresas-actions"
import {
  listarPreenchedores,
  listarTodasAtribuicoes,
} from "@/lib/preenchedores"
import { supabaseConfigurado } from "@/lib/supabase"

export default async function PreenchedoresPage() {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const [preenchedores, atribuicoes, empresas] = await Promise.all([
    listarPreenchedores(),
    listarTodasAtribuicoes(),
    listarEmpresas(true),
  ])

  const supabaseOk = supabaseConfigurado()
  const atribuicoesRecord: Record<string, string[]> = {}
  for (const [id, empresasDo] of atribuicoes) {
    atribuicoesRecord[id] = empresasDo
  }

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <div>
          <Link
            href="/dashboard"
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
            Formulários diários
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
            Gestão de gestores de tráfego (pago) e SDRs (orgânico). Cada pessoa
            recebe um link permanente que abre o formulário só com as empresas
            atribuídas a ela.
          </p>
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
            }}
          >
            Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e
            NEXT_PUBLIC_SUPABASE_ANON_KEY para gerenciar preenchedores.
          </div>
        )}

        <GerenciadorPreenchedores
          preenchedoresIniciais={preenchedores}
          atribuicoesIniciais={atribuicoesRecord}
          empresasDisponiveis={empresas.map((e) => ({
            db: e.db,
            nome: e.nome,
          }))}
          supabaseOk={supabaseOk}
        />
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
