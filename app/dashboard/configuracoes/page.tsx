import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import FormConfig from "@/components/FormConfig"
import AtivarNotificacoes from "@/components/AtivarNotificacoes"
import PreferenciasNotificacoes from "@/components/PreferenciasNotificacoes"
import GerenciadorUsuarios from "@/components/GerenciadorUsuarios"
import GerenciadorFormularios, {
  type FormId,
} from "@/components/GerenciadorFormularios"
import GerenciadorRelatoriosComerciais from "@/components/GerenciadorRelatoriosComerciais"
import GerenciadorDadosDiarios from "@/components/GerenciadorDadosDiarios"
import { ANO_PADRAO, mesValido } from "@/lib/data"
import {
  montarResumoDiario,
  montarResumoMensal,
  montarResumoSemanal,
} from "@/lib/resumos"
import { requererPermissao, temPermissao } from "@/lib/auth"
import { listarUsuariosAction } from "@/lib/usuarios-actions"
import { listarRelatoriosComerciaisAdmin } from "@/lib/relatorios-comerciais"
import { listarEmpresas } from "@/lib/empresas-actions"
import {
  getPreferenciasNotificacao,
  type PreferenciasNotificacao,
} from "@/lib/preferencias-notificacao"
import { listarTimePorPapel } from "@/lib/time"

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  const usuario = await requererPermissao("configuracoes")
  const podeGerenciarUsuarios = temPermissao(usuario, "gerenciar_usuarios")
  const ehAdmin = usuario.papel === "admin"

  // Escopo por papel: quais toggles de notificação e quais formulários
  // cada acesso enxerga em Configurações.
  const chavesNotif: (keyof PreferenciasNotificacao)[] = [
    "meta_batida",
    "lembrete",
  ]
  if (
    temPermissao(usuario, "dashboard_trafego") ||
    temPermissao(usuario, "formulario_trafego")
  ) {
    chavesNotif.push("dados_trafego", "dados_sentinela")
  }
  if (
    temPermissao(usuario, "dashboard_comercial") ||
    temPermissao(usuario, "formulario_comercial")
  ) {
    chavesNotif.push("dados_comercial", "nova_venda")
  }
  const formsPermitidos: FormId[] = []
  if (temPermissao(usuario, "formulario_trafego")) formsPermitidos.push("trafego")
  if (temPermissao(usuario, "formulario_comercial"))
    formsPermitidos.push("comercial")

  const mes = mesValido(searchParams?.mes)

  const [
    mensagemDiario,
    mensagemSemanal,
    mensagemMensal,
    usuarios,
    empresas,
    preferencias,
    relatoriosComerciais,
    responsaveisTrafego,
    responsaveisComercial,
  ] = await Promise.all([
    ehAdmin ? montarResumoDiario() : Promise.resolve(""),
    ehAdmin ? montarResumoSemanal() : Promise.resolve(""),
    ehAdmin ? montarResumoMensal() : Promise.resolve(""),
    podeGerenciarUsuarios ? listarUsuariosAction() : Promise.resolve([]),
    listarEmpresas(true),
    getPreferenciasNotificacao(usuario.id),
    ehAdmin ? listarRelatoriosComerciaisAdmin() : Promise.resolve([]),
    listarTimePorPapel("gestor_trafego"),
    listarTimePorPapel("comercial"),
  ])

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-8"
        style={{ maxWidth: 1280 }}
      >
        <div className="hero-banner">
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
            {ehAdmin
              ? "Resumos para enviar no WhatsApp · clique em copiar e cole no chat"
              : "Suas notificações e formulários"}
          </p>
        </div>

        <AtivarNotificacoes
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        />

        <PreferenciasNotificacoes
          inicial={preferencias}
          chavesPermitidas={chavesNotif}
        />

        {podeGerenciarUsuarios && (
          <GerenciadorUsuarios
            usuariosIniciais={usuarios}
            meuUsuarioId={usuario.id}
          />
        )}

        {formsPermitidos.length > 0 && (
          <GerenciadorFormularios
            empresas={empresas}
            formsPermitidos={formsPermitidos}
            responsaveisTrafego={responsaveisTrafego}
            responsaveisComercial={responsaveisComercial}
          />
        )}

        {ehAdmin && (
          <>
            <GerenciadorRelatoriosComerciais
              registrosIniciais={relatoriosComerciais}
              empresas={empresas}
            />
            <GerenciadorDadosDiarios empresas={empresas} />
          </>
        )}

        {ehAdmin && (
          <FormConfig
            mensagemDiario={mensagemDiario}
            mensagemSemanal={mensagemSemanal}
            mensagemMensal={mensagemMensal}
          />
        )}
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
