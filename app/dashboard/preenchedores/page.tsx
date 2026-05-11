import GerenciadorPreenchedores from "@/components/GerenciadorPreenchedores"
import { listarEmpresas } from "@/lib/empresas-actions"
import {
  listarPreenchedores,
  listarTodasAtribuicoes,
} from "@/lib/preenchedores"
import { supabaseConfigurado } from "@/lib/supabase"

export default async function PreenchedoresPage() {
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
            Time
          </p>
          <h1 style={{ marginTop: 6, fontSize: 36 }}>Formulários diários</h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
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
              border: "1px solid rgba(226,75,74,0.35)",
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
