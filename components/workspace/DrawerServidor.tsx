import {
  getTarefa,
  listarAtividade,
  listarComentarios,
  listarContextos,
  listarSubtarefas,
  listarUsuariosAtivos,
} from "@/lib/workspace"
import { hojeISO } from "@/lib/workspace-datas"
import TarefaDrawer from "./TarefaDrawer"

/**
 * Carrega no SERVIDOR tudo que o detalhe da tarefa precisa e monta o drawer.
 *
 * Fica num componente próprio porque toda página do Workspace abre o mesmo
 * detalhe via ?tarefa=<id> — assim cada página é uma linha só, e o dado do
 * detalhe é sempre fresco (não é cache de client que envelhece enquanto o
 * painel está aberto).
 *
 * Se o id não existir (link velho, tarefa apagada de vez), não renderiza nada
 * em vez de quebrar a página.
 */
export default async function DrawerServidor({
  tarefaId,
  souAdmin,
}: {
  tarefaId: string
  souAdmin: boolean
}) {
  const tarefa = await getTarefa(tarefaId)
  if (!tarefa) return null

  const [subtarefas, comentarios, atividade, contextos, usuarios] = await Promise.all([
    listarSubtarefas(tarefa.id),
    listarComentarios(tarefa.id),
    listarAtividade(tarefa.id),
    listarContextos(),
    listarUsuariosAtivos(),
  ])

  return (
    <TarefaDrawer
      tarefa={tarefa}
      subtarefas={subtarefas}
      comentarios={comentarios}
      atividade={atividade}
      contextos={contextos}
      usuarios={usuarios}
      hoje={hojeISO()}
      souAdmin={souAdmin}
    />
  )
}
