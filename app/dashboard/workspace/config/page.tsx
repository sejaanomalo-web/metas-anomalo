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
    <main className="ws-main" style={{ padding: "16px 16px 48px", maxWidth: 1120, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <WorkspaceNav
          abas={abas}
          presenca={{ id: usuario.id, nome: usuario.nome, foto: pref.foto_url }}
        />
        <ConfigWorkspace pref={pref} meuNome={usuario.nome} />
      </div>
    </main>
  )
}
