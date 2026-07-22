import { requererPermissao } from "@/lib/auth"
import { listarAbas, listarNotas } from "@/lib/workspace"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import NotasWorkspace from "@/components/workspace/NotasWorkspace"

export const dynamic = "force-dynamic"

/**
 * Aba fixa ARQUIVOS — coleção de notas compartilhada do time (links de
 * drive, relatórios, forms…), como a nota ARQUIVOS do Asana. Fixa do
 * sistema: não pode ser renomeada nem excluída.
 */
export default async function ArquivosPage() {
  await requererPermissao("workspace")
  const [abas, notas] = await Promise.all([
    listarAbas(),
    listarNotas({ fixa: "arquivos" }),
  ])

  return (
    <main style={{ padding: "16px 16px 48px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <WorkspaceNav abas={abas} />
        <NotasWorkspace notas={notas} escopo={{ fixa: "arquivos" }} />
      </div>
    </main>
  )
}
