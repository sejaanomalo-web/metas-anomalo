import { requererPermissao } from "@/lib/auth"
import {
  listarContextos,
  listarTarefasDoMes,
  listarTarefasSemPrazo,
  listarUsuariosAtivos,
} from "@/lib/workspace"
import { hojeISO } from "@/lib/workspace-datas"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import WorkspaceRealtime from "@/components/workspace/WorkspaceRealtime"
import FiltrosTarefas from "@/components/workspace/FiltrosTarefas"
import CalendarioTarefas from "@/components/workspace/CalendarioTarefas"
import DrawerServidor from "@/components/workspace/DrawerServidor"

export const dynamic = "force-dynamic"

type SP = Record<string, string | string[] | undefined>

function um(sp: SP, chave: string): string | undefined {
  const v = sp[chave]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Calendário mensal — visualização derivada de prazo_em.
 *
 * Mês vive na URL (?ano=&mes=) para que abrir o detalhe de uma tarefa e
 * fechar não jogue o usuário de volta pro mês atual.
 */
export default async function CalendarioPage({ searchParams }: { searchParams: SP }) {
  const usuario = await requererPermissao("workspace")
  const hoje = hojeISO()

  const anoParam = Number(um(searchParams, "ano"))
  const mesParam = Number(um(searchParams, "mes"))
  const ano = Number.isFinite(anoParam) && anoParam > 2000 ? anoParam : Number(hoje.slice(0, 4))
  const mes =
    Number.isFinite(mesParam) && mesParam >= 1 && mesParam <= 12
      ? mesParam
      : Number(hoje.slice(5, 7))

  const situacao = um(searchParams, "situacao") === "todas" ? "todas" : "pendentes"

  const [tarefas, semData, contextos, usuarios] = await Promise.all([
    listarTarefasDoMes(ano, mes, {
      responsavelId: um(searchParams, "responsavel"),
      contextoId: um(searchParams, "contexto"),
      situacao,
    }),
    listarTarefasSemPrazo(),
    listarContextos(),
    listarUsuariosAtivos(),
  ])

  const tarefaAberta = um(searchParams, "tarefa")

  return (
    <main style={{ padding: "20px 16px 48px", maxWidth: 1120, margin: "0 auto" }}>
      <WorkspaceRealtime />

      <header style={{ marginBottom: 14 }}>
        <h1 className="ds-headline" style={{ fontSize: 22, margin: "0 0 3px" }}>
          Calendário
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>
          Arraste uma tarefa para outro dia para mudar o prazo. Solte na bandeja
          &ldquo;Sem data&rdquo; para tirar o prazo.
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <WorkspaceNav />
        <FiltrosTarefas
          contextos={contextos}
          usuarios={usuarios}
          mostrarAgrupamento={false}
        />
        <CalendarioTarefas
          ano={ano}
          mes={mes}
          tarefas={tarefas}
          semData={semData}
          hoje={hoje}
        />
      </div>

      {tarefaAberta && (
        <DrawerServidor tarefaId={tarefaAberta} souAdmin={usuario.papel === "admin"} />
      )}
    </main>
  )
}
