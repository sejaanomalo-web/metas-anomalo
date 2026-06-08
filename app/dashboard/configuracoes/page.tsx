import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import FormConfig from "@/components/FormConfig"
import AtivarNotificacoes from "@/components/AtivarNotificacoes"
import GerenciadorUsuarios from "@/components/GerenciadorUsuarios"
import GerenciadorFormularios from "@/components/GerenciadorFormularios"
import { ANO_PADRAO, mesValido } from "@/lib/data"
import {
  montarResumoDiario,
  montarResumoMensal,
  montarResumoSemanal,
} from "@/lib/resumos"
import { requererPermissao, temPermissao } from "@/lib/auth"
import { listarUsuariosAction } from "@/lib/usuarios-actions"
import { listarEmpresas } from "@/lib/empresas-actions"

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  const usuario = await requererPermissao("configuracoes")
  const podeGerenciarUsuarios = temPermissao(usuario, "gerenciar_usuarios")

  const mes = mesValido(searchParams?.mes)

  const [mensagemDiario, mensagemSemanal, mensagemMensal, usuarios, empresas] =
    await Promise.all([
      montarResumoDiario(),
      montarResumoSemanal(),
      montarResumoMensal(),
      podeGerenciarUsuarios ? listarUsuariosAction() : Promise.resolve([]),
      listarEmpresas(true),
    ])

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-8"
        style={{ maxWidth: 1280 }}
      >
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-3)",
              letterSpacing: "0.01em",
            }}
          >
            Sistema
          </p>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ fontSize: 36 }}>Configurações</h1>
            <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ANO_PADRAO} />
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
            }}
          >
            Resumos para enviar no WhatsApp · clique em copiar e cole no chat
          </p>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        <AtivarNotificacoes
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        />

        {podeGerenciarUsuarios && (
          <GerenciadorUsuarios
            usuariosIniciais={usuarios}
            meuUsuarioId={usuario.id}
          />
        )}

        <GerenciadorFormularios empresas={empresas} />

        <FormConfig
          mensagemDiario={mensagemDiario}
          mensagemSemanal={mensagemSemanal}
          mensagemMensal={mensagemMensal}
        />
      </main>

      <footer
        className="mx-auto px-8 py-8 text-center"
        style={{ maxWidth: 1280 }}
      >
        <p
          style={{
            fontSize: 11,
            color: "var(--text-4)",
            fontWeight: 400,
          }}
        >
          Anômalo Hub · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  )
}
