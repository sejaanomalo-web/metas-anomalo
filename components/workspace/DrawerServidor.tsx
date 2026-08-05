import {
  getTarefa,
  listarAtividade,
  listarComentarios,
  listarContextos,
  listarSubtarefas,
  listarUsuariosAtivos,
} from "@/lib/workspace"
import { hojeISO } from "@/lib/workspace-datas"
import { getUsuarioIdSync } from "@/lib/auth"
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

  // Resolvido AQUI, e não recebido por prop, pra não ter que alterar as cinco
  // páginas que abrem o drawer. Só decide quais botões aparecem (editar/apagar
  // o próprio comentário); a permissão de verdade é checada de novo na server
  // action, que é o que vale.
  const meuId = getUsuarioIdSync()

  const [subtarefas, comentarios, atividade, contextos, usuarios] = await Promise.all([
    listarSubtarefas(tarefa.id),
    listarComentarios(tarefa.id),
    listarAtividade(tarefa.id),
    listarContextos(),
    listarUsuariosAtivos(),
  ])

  // O seletor "Projetos" espelha a aba Clientes. Contextos internos importados
  // do Asana (arquivos, estudos, calendários etc.) continuam existindo no
  // banco e em vínculos antigos, mas não são opções para novos vínculos.
  // listarContextos() já omite arquivados, então inclusões e remoções na aba
  // Clientes se refletem aqui no próximo refresh.
  const projetosDeClientes = contextos.filter(
    (contexto) => contexto.tipo === "cliente" || contexto.tipo === "empresa"
  )

  return (
    <TarefaDrawer
      tarefa={tarefa}
      subtarefas={subtarefas}
      comentarios={comentarios}
      atividade={atividade}
      contextos={projetosDeClientes}
      usuarios={usuarios}
      hoje={hojeISO()}
      souAdmin={souAdmin}
      meuId={meuId}
    />
  )
}
