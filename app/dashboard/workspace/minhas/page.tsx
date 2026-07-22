import { requererPermissao } from "@/lib/auth"
import { getMinhasTarefas, getPreferencia, listarAbas } from "@/lib/workspace"
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
  const [baldes, abas, pref] = await Promise.all([
    getMinhasTarefas(usuario.id),
    listarAbas(),
    getPreferencia(usuario.id),
  ])

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
    <main className="ws-main">
      <WorkspaceRealtime />

      <div className="ws-topo">
        <WorkspaceNav
          abas={abas}
          presenca={{ id: usuario.id, nome: usuario.nome, foto: pref.foto_url }}
        />
      </div>

      <div className="ws-conteudo" style={{ gap: 18 }}>
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--text-1)",
                  margin: 0,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  paddingBottom: 6,
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 3,
                    background: s.cor ?? "var(--text-4)",
                  }}
                />
                {s.titulo}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-3)",
                    background: "rgba(255,255,255,0.08)",
                    padding: "1px 7px",
                    borderRadius: 999,
                  }}
                >
                  {s.tarefas.length}
                </span>
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
