import { requererPermissao } from "@/lib/auth"
import {
  listarContextos,
  listarTarefas,
  listarUsuariosAtivos,
} from "@/lib/workspace"
import { hojeISO } from "@/lib/workspace-datas"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import FiltrosTarefas from "@/components/workspace/FiltrosTarefas"
import ListaTarefas from "@/components/workspace/ListaTarefas"
import DrawerServidor from "@/components/workspace/DrawerServidor"

export const dynamic = "force-dynamic"

type SP = Record<string, string | string[] | undefined>

function um(sp: SP, chave: string): string | undefined {
  const v = sp[chave]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Arquivo e lixeira — separado do fluxo principal, mas NADA some daqui.
 *
 * Exclusão no Workspace é sempre soft (excluida_em), então tudo que foi
 * "apagado" continua na tabela e pode ser restaurado pelo detalhe. Apagar de
 * vez é ação de admin, com confirmação por título digitado.
 */
export default async function ArquivoPage({ searchParams }: { searchParams: SP }) {
  const usuario = await requererPermissao("workspace")
  const hoje = hojeISO()

  const [{ tarefas }, contextos, usuarios] = await Promise.all([
    listarTarefas({
      busca: um(searchParams, "q"),
      responsavelId: um(searchParams, "responsavel"),
      contextoId: um(searchParams, "contexto"),
      situacao: "todas",
      incluirArquivadas: true,
      limite: 100,
    }),
    listarContextos(true),
    listarUsuariosAtivos(),
  ])

  // A consulta com incluirArquivadas traz tudo; aqui ficamos só com o que
  // realmente saiu do fluxo (concluída, arquivada ou na lixeira).
  const doArquivo = tarefas.filter(
    (t) => t.concluida_em || t.arquivada_em || t.excluida_em
  )

  const tarefaAberta = um(searchParams, "tarefa")

  return (
    <main style={{ padding: "20px 16px 48px", maxWidth: 1120, margin: "0 auto" }}>
      <header style={{ marginBottom: 14 }}>
        <h1 className="ds-headline" style={{ fontSize: 22, margin: "0 0 3px" }}>
          Arquivo
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>
          Concluídas, arquivadas e lixeira. Abra a tarefa para reabrir ou
          restaurar — nada aqui foi apagado do banco.
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <WorkspaceNav />
        <FiltrosTarefas
          contextos={contextos}
          usuarios={usuarios}
          mostrarAgrupamento={false}
        />
        <ListaTarefas
          tarefas={doArquivo}
          hoje={hoje}
          agrupar="nenhum"
          vazio="Nada arquivado ainda."
        />
      </div>

      {tarefaAberta && (
        <DrawerServidor tarefaId={tarefaAberta} souAdmin={usuario.papel === "admin"} />
      )}
    </main>
  )
}
