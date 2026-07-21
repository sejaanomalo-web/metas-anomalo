import { requererPermissao } from "@/lib/auth"
import { getMinhasTarefas } from "@/lib/workspace"
import { hojeISO } from "@/lib/workspace-datas"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import WorkspaceRealtime from "@/components/workspace/WorkspaceRealtime"
import ListaTarefas from "@/components/workspace/ListaTarefas"
import DrawerServidor from "@/components/workspace/DrawerServidor"

export const dynamic = "force-dynamic"

type SP = Record<string, string | string[] | undefined>

/**
 * Minhas tarefas — tudo em que EU sou o responsável, separado por urgência.
 * Os baldes vêm calculados do servidor em BRT (workspace-datas), não do
 * relógio do browser: senão quem estivesse com o fuso do notebook errado veria
 * "hoje" no dia errado.
 */
export default async function MinhasPage({ searchParams }: { searchParams: SP }) {
  const usuario = await requererPermissao("workspace")
  const hoje = hojeISO()
  const baldes = await getMinhasTarefas(usuario.id)

  const tarefaParam = searchParams.tarefa
  const tarefaAberta = Array.isArray(tarefaParam) ? tarefaParam[0] : tarefaParam

  const secoes: { titulo: string; cor?: string; tarefas: typeof baldes.hoje }[] = [
    { titulo: "Atrasadas", cor: "#e24b4a", tarefas: baldes.atrasadas },
    { titulo: "Hoje", cor: "var(--accent)", tarefas: baldes.hoje },
    { titulo: "Próximos 7 dias", tarefas: baldes.proximos7 },
    { titulo: "Sem prazo", tarefas: baldes.semPrazo },
    { titulo: "Concluídas nos últimos 7 dias", tarefas: baldes.concluidasRecentes },
  ]

  const vazio = secoes.every((s) => s.tarefas.length === 0)

  return (
    <main style={{ padding: "20px 16px 48px", maxWidth: 900, margin: "0 auto" }}>
      <WorkspaceRealtime />

      <header style={{ marginBottom: 14 }}>
        <h1 className="ds-headline" style={{ fontSize: 22, margin: "0 0 3px" }}>
          Minhas tarefas
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>
          Onde você é o responsável, {usuario.nome.split(" ")[0]}.
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <WorkspaceNav />

        {vazio && (
          <div
            className="glass"
            style={{ padding: "28px 16px", borderRadius: 12, textAlign: "center", fontSize: 12, color: "var(--text-4)" }}
          >
            Nada atribuído a você no momento.
          </div>
        )}

        {secoes
          .filter((s) => s.tarefas.length > 0)
          .map((s) => (
            <section key={s.titulo} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h2
                className="ds-label"
                style={{ fontSize: 11, color: s.cor ?? "var(--text-3)", margin: 0, fontWeight: 700 }}
              >
                {s.titulo} · {s.tarefas.length}
              </h2>
              <ListaTarefas tarefas={s.tarefas} hoje={hoje} agrupar="nenhum" />
            </section>
          ))}
      </div>

      {tarefaAberta && (
        <DrawerServidor tarefaId={tarefaAberta} souAdmin={usuario.papel === "admin"} />
      )}
    </main>
  )
}
