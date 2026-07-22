import { requererPermissao } from "@/lib/auth"
import { getPreferencia, listarAbas } from "@/lib/workspace"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import ConfigWorkspace from "@/components/workspace/ConfigWorkspace"

export const dynamic = "force-dynamic"

/** Configurações do Workspace — preferências do usuário logado. */
export default async function ConfigPage() {
  const usuario = await requererPermissao("workspace")
  const [abas, pref] = await Promise.all([listarAbas(), getPreferencia(usuario.id)])

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
      </div>
    </main>
  )
}
