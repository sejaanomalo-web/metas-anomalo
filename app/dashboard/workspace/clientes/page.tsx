import { requererPermissao } from "@/lib/auth"
import { getClientesAtivosPorEmpresa } from "@/lib/clientes"
import { contarPorContexto, listarContextos } from "@/lib/workspace"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import BotaoAbrirCliente from "@/components/workspace/BotaoAbrirCliente"

export const dynamic = "force-dynamic"

/**
 * Aba Clientes — reusa a entidade de clientes que já existe
 * (public.cliente_trafego). Não há segunda tabela de clientes: o contexto do
 * Workspace apenas APONTA para o cliente, e nasce no primeiro clique.
 *
 * Abrir um cliente leva para a lista filtrada por aquele contexto, então a
 * tarefa mostrada ali é literalmente a mesma linha que aparece no calendário
 * e em Minhas tarefas — nunca uma cópia.
 */
export default async function ClientesPage() {
  await requererPermissao("workspace")

  const [porEmpresa, contextos, contagens] = await Promise.all([
    getClientesAtivosPorEmpresa(),
    listarContextos(),
    contarPorContexto(),
  ])

  // cliente_id -> contexto (só existe depois do primeiro uso)
  const contextoPorCliente = new Map<string, string>()
  for (const c of contextos) {
    if (c.cliente_id) contextoPorCliente.set(c.cliente_id, c.id)
  }

  const empresas = Object.keys(porEmpresa).sort((a, b) => a.localeCompare(b, "pt-BR"))

  return (
    <main style={{ padding: "16px 16px 48px", maxWidth: 1120, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <WorkspaceNav />

        {empresas.length === 0 && (
          <div
            className="glass"
            style={{ padding: "28px 16px", borderRadius: 12, textAlign: "center", fontSize: 12, color: "var(--text-4)" }}
          >
            Nenhum cliente de tráfego ativo cadastrado.
          </div>
        )}

        {empresas.map((empresa) => (
          <section key={empresa} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2
              className="ds-label"
              style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 2px", fontWeight: 700 }}
            >
              {empresa}
            </h2>
            {porEmpresa[empresa].map((cliente) => {
              const contextoId = contextoPorCliente.get(cliente.id) ?? null
              const contagem = contextoId ? contagens.get(contextoId) : undefined
              return (
                <BotaoAbrirCliente
                  key={cliente.id}
                  clienteId={cliente.id}
                  nome={cliente.nome}
                  contextoId={contextoId}
                  pendentes={contagem?.pendentes ?? 0}
                  atrasadas={contagem?.atrasadas ?? 0}
                />
              )
            })}
          </section>
        ))}
      </div>
    </main>
  )
}
