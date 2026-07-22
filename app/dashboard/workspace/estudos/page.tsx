import { requererPermissao } from "@/lib/auth"
import { listarAbas, listarNotas } from "@/lib/workspace"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import NotasWorkspace from "@/components/workspace/NotasWorkspace"

export const dynamic = "force-dynamic"

/**
 * Aba fixa ESTUDOS — notas compartilhadas de cursos e materiais, como a nota
 * ESTUDOS do Asana. Fixa do sistema: não pode ser renomeada nem excluída.
 */
export default async function EstudosPage() {
  const usuario = await requererPermissao("workspace")
  const [abas, notas] = await Promise.all([
    listarAbas(),
    listarNotas({ fixa: "estudos" }),
  ])

  return (
    <main className="ws-main">
      <div className="ws-topo">
        <WorkspaceNav abas={abas} presenca={{ id: usuario.id, nome: usuario.nome }} />
      </div>
      <div className="ws-conteudo">
        <NotasWorkspace notas={notas} escopo={{ fixa: "estudos" }} />
      </div>
    </main>
  )
}
