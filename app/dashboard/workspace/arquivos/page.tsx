import { requererPermissao } from "@/lib/auth"
import { getPreferencia, listarAbas, listarNotas } from "@/lib/workspace"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import NotasWorkspace from "@/components/workspace/NotasWorkspace"

export const dynamic = "force-dynamic"

/**
 * Aba fixa ARQUIVOS — coleção de notas compartilhada do time (links de
 * drive, relatórios, forms…), como a nota ARQUIVOS do Asana. Fixa do
 * sistema: não pode ser renomeada nem excluída.
 */
export default async function ArquivosPage() {
  const usuario = await requererPermissao("workspace")
  const [abas, notas, pref] = await Promise.all([
    listarAbas(),
    listarNotas({ fixa: "arquivos" }),
    getPreferencia(usuario.id),
  ])

  return (
    <main className="ws-main">
      <div className="ws-topo">
        <WorkspaceNav
          abas={abas}
          presenca={{ id: usuario.id, nome: usuario.nome, foto: pref.foto_url }}
        />
      </div>
      <div className="ws-conteudo">
        <NotasWorkspace notas={notas} escopo={{ fixa: "arquivos" }} />
      </div>
    </main>
  )
}
