import Avatar from "./Avatar"
import type { ResponsavelTarefa } from "@/lib/workspace-tipos"

/**
 * Pilha de avatares dos responsáveis de uma tarefa — o que as listas compactas
 * (linha da lista, cartão do calendário) mostram agora que uma tarefa pode ser
 * de várias pessoas.
 *
 * Decisões:
 *  • SOBREPOSIÇÃO negativa com anel da cor do fundo: três pessoas ocupam pouco
 *    mais que um avatar. O cartão do calendário não pode crescer só porque a
 *    tarefa ganhou um segundo responsável.
 *  • CORTA EM `max` e mostra "+N". Uma tarefa com o time inteiro empurraria o
 *    título pra fora do cartão.
 *  • Lista vazia devolve o círculo tracejado do "sem responsável" (o mesmo
 *    desenho de antes), pra a coluna não "pular" entre tarefas atribuídas e
 *    não atribuídas.
 */
export default function Avatares({
  pessoas,
  tamanho = 24,
  max = 3,
}: {
  pessoas: ResponsavelTarefa[]
  tamanho?: number
  max?: number
}) {
  if (pessoas.length === 0) return <Avatar nome={null} tamanho={tamanho} />

  const visiveis = pessoas.slice(0, max)
  const restantes = pessoas.length - visiveis.length

  return (
    <span
      className="ws-avatares"
      // O title carrega a lista COMPLETA: com "+2" na tela, é a única forma de
      // descobrir quem são os outros dois sem abrir a tarefa.
      title={pessoas.map((p) => p.nome).join(", ")}
    >
      {visiveis.map((p) => (
        <Avatar key={p.id} nome={p.nome} foto={p.foto_url} tamanho={tamanho} />
      ))}
      {restantes > 0 && (
        <span
          className="ws-avatares-mais"
          aria-hidden="true"
          style={{
            width: tamanho,
            height: tamanho,
            fontSize: Math.max(8, Math.round(tamanho * 0.38)),
            marginLeft: -6,
            boxShadow: "0 0 0 1.5px var(--surface-1)",
          }}
        >
          +{restantes}
        </span>
      )}
    </span>
  )
}
