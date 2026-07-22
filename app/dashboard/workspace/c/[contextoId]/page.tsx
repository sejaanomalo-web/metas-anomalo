import { notFound } from "next/navigation"
import { requererPermissao } from "@/lib/auth"
import {
  getContexto,
  getPreferencia,
  listarAbas,
  listarContextos,
  listarNotas,
  listarTarefas,
  listarTarefasDoIntervalo,
  listarTarefasDoMes,
  listarTarefasSemPrazo,
  listarUsuariosAtivos,
} from "@/lib/workspace"
import {
  ehDataISOValida,
  hojeISO,
  inicioDaSemana,
  somarDiasISO,
} from "@/lib/workspace-datas"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import WorkspaceRealtime from "@/components/workspace/WorkspaceRealtime"
import ClienteHeader from "@/components/workspace/ClienteHeader"
import CalendarioTarefas from "@/components/workspace/CalendarioTarefas"
import CriacaoRapida from "@/components/workspace/CriacaoRapida"
import ListaTarefas from "@/components/workspace/ListaTarefas"
import NotasWorkspace from "@/components/workspace/NotasWorkspace"
import DrawerServidor from "@/components/workspace/DrawerServidor"

export const dynamic = "force-dynamic"

type SP = Record<string, string | string[] | undefined>

function um(sp: SP, chave: string): string | undefined {
  const v = sp[chave]
  return Array.isArray(v) ? v[0] : v
}

/**
 * ÁREA DE TRABALHO DO CLIENTE — o "projeto" do Asana: Nota, Calendário e
 * Lista exclusivos daquele cliente. Tudo aqui é a MESMA tarefa/linha do
 * calendário compartilhado, apenas filtrada pelo contexto do cliente — nunca
 * uma cópia.
 */
export default async function ClienteWorkspacePage({
  params,
  searchParams,
}: {
  params: { contextoId: string }
  searchParams: SP
}) {
  const usuario = await requererPermissao("workspace")
  const contexto = await getContexto(params.contextoId)
  if (!contexto) notFound()

  const hoje = hojeISO()
  const aba = ["nota", "calendario", "lista"].includes(um(searchParams, "aba") ?? "")
    ? (um(searchParams, "aba") as "nota" | "calendario" | "lista")
    : "nota"

  const [abas, pref] = await Promise.all([listarAbas(), getPreferencia(usuario.id)])
  const tarefaAberta = um(searchParams, "tarefa")

  // ---------- dados por aba ----------
  let conteudo: React.ReactNode = null

  if (aba === "nota") {
    const notas = await listarNotas({ contextoId: contexto.id })
    conteudo = <NotasWorkspace notas={notas} escopo={{ contexto_id: contexto.id }} />
  }

  if (aba === "calendario") {
    const modo = um(searchParams, "zoom") === "mes" ? ("mes" as const) : ("semana" as const)
    const semanaParam = um(searchParams, "semana")
    const semana = inicioDaSemana(
      semanaParam && ehDataISOValida(semanaParam) ? semanaParam : hoje
    )
    const anoParam = Number(um(searchParams, "ano"))
    const mesParam = Number(um(searchParams, "mes"))
    const ano = Number.isFinite(anoParam) && anoParam > 2000 ? anoParam : Number(hoje.slice(0, 4))
    const mes =
      Number.isFinite(mesParam) && mesParam >= 1 && mesParam <= 12
        ? mesParam
        : Number(hoje.slice(5, 7))

    const filtro = { contextoId: contexto.id, situacao: "todas" as const }
    const [tarefas, semDataTodas] = await Promise.all([
      modo === "semana"
        ? listarTarefasDoIntervalo(semana, somarDiasISO(semana, 6), filtro)
        : listarTarefasDoMes(ano, mes, filtro),
      listarTarefasSemPrazo(200),
    ])
    // A bandeja "Sem data" aqui só mostra as tarefas DESTE cliente.
    const semData = semDataTodas.filter((t) =>
      t.contextos.some((c) => c.id === contexto.id)
    )

    conteudo = (
      <CalendarioTarefas
        modo={modo}
        semana={semana}
        ano={ano}
        mes={mes}
        tarefas={tarefas}
        semData={semData}
        hoje={hoje}
        meuUsuarioId={usuario.id}
        contextoFixoId={contexto.id}
        modoCor={pref.modo_cor}
      />
    )
  }

  if (aba === "lista") {
    const [{ tarefas }, contextos, usuarios] = await Promise.all([
      listarTarefas({ contextoId: contexto.id, situacao: "todas", limite: 200 }),
      listarContextos(),
      listarUsuariosAtivos(),
    ])
    conteudo = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <CriacaoRapida
          contextos={contextos}
          usuarios={usuarios}
          contextoPadraoId={contexto.id}
          meuUsuarioId={usuario.id}
        />
        <ListaTarefas
          tarefas={tarefas}
          hoje={hoje}
          agrupar="prazo"
          vazio="Nenhuma tarefa deste cliente ainda."
        />
      </div>
    )
  }

  return (
    <main className="ws-main" style={{ padding: "16px 16px 48px", maxWidth: 1280, margin: "0 auto" }}>
      <WorkspaceRealtime />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <WorkspaceNav
          abas={abas}
          presenca={{ id: usuario.id, nome: usuario.nome, foto: pref.foto_url }}
        />
        <ClienteHeader contexto={contexto} abaAtiva={aba} />
        {conteudo}
      </div>

      {tarefaAberta && (
        <DrawerServidor tarefaId={tarefaAberta} souAdmin={usuario.papel === "admin"} />
      )}
    </main>
  )
}
