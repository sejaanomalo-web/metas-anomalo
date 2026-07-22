import { requererPermissao } from "@/lib/auth"
import { getPreferencia, listarAbas } from "@/lib/workspace"
import { getPreferenciasNotificacao } from "@/lib/preferencias-notificacao"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import ConfigWorkspace from "@/components/workspace/ConfigWorkspace"
import PreferenciasNotificacoes from "@/components/PreferenciasNotificacoes"

export const dynamic = "force-dynamic"

/** Configurações do Workspace — preferências do usuário logado. */
export default async function ConfigPage() {
  const usuario = await requererPermissao("workspace")
  const [abas, pref, prefNotif] = await Promise.all([
    listarAbas(),
    getPreferencia(usuario.id),
    getPreferenciasNotificacao(usuario.id),
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
        <ConfigWorkspace pref={pref} meuNome={usuario.nome} />

        {/* Mesmo toggle de /configuracoes, filtrado no tipo do Workspace:
            liga/desliga o aviso de tarefa atribuída, prazo, comentário,
            menção e o alerta de tarefa atrasada (2+ dias). */}
        <section className="glass" style={{ padding: 14, borderRadius: 10, maxWidth: 560 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px", color: "var(--text-1)" }}>
            Notificações do Workspace
          </h3>
          <p style={{ fontSize: 11, color: "var(--text-4)", margin: "0 0 10px" }}>
            Criar uma tarefa não avisa ninguém. O aviso sai quando a tarefa é
            atribuída a alguém — e quando passa 2 dias do prazo sem concluir.
          </p>
          <PreferenciasNotificacoes inicial={prefNotif} chavesPermitidas={["ws_tarefa"]} />
        </section>
      </div>
    </main>
  )
}
