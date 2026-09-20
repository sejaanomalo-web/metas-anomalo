import { requererPermissao, temPermissao } from "@/lib/auth"
import { listarVencimentosPorDia } from "@/lib/financeiro"
import {
  getPreferencia,
  listarAbas,
  listarContextos,
  listarTarefasDoIntervalo,
  listarTarefasDoMes,
  listarTarefasSemPrazo,
  listarUsuariosAtivos,
} from "@/lib/workspace"
import {
  ehDataISOValida,
  gradeDoMes,
  hojeISO,
  inicioDaSemana,
  somarDiasISO,
} from "@/lib/workspace-datas"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import WorkspaceRealtime from "@/components/workspace/WorkspaceRealtime"
import FiltrosTarefas from "@/components/workspace/FiltrosTarefas"
import CalendarioTarefas from "@/components/workspace/CalendarioTarefas"
import DrawerServidor from "@/components/workspace/DrawerServidor"
import FonteFinanceiro from "@/components/workspace/FonteFinanceiro"

export const dynamic = "force-dynamic"

type SP = Record<string, string | string[] | undefined>

function um(sp: SP, chave: string): string | undefined {
  const v = sp[chave]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Calendário — visualização derivada de prazo_em, no desenho do Asana.
 *
 * Zoom padrão é a SEMANA (colunas DOM→SÁB, como nos prints de referência);
 * ?zoom=mes liga a grade mensal. Semana/mês vivem na URL para que abrir o
 * detalhe de uma tarefa e fechar não jogue o usuário de volta pra hoje.
 */
export default async function CalendarioPage({ searchParams }: { searchParams: SP }) {
  const usuario = await requererPermissao("workspace")
  const hoje = hojeISO()

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

  const situacao = um(searchParams, "situacao") === "pendentes" ? "pendentes" : "todas"

  const filtro = {
    responsavelId: um(searchParams, "responsavel"),
    contextoId: um(searchParams, "contexto"),
    situacao: situacao as "pendentes" | "todas",
  }

  // Fonte "financeiro" na agenda: só aparece pra quem tem o módulo, e pode
  // ser desligada na URL (?fin=0). Ligada por padrão — uma conta a vencer é
  // exatamente o tipo de compromisso que a agenda existe pra lembrar.
  const podeFinanceiro = temPermissao(usuario, "dashboard_financeiro")
  const fonteFinanceiro = podeFinanceiro && um(searchParams, "fin") !== "0"

  // O intervalo de vencimentos acompanha o que a grade REALMENTE mostra: a
  // visão de mês desenha dias do mês anterior e do seguinte, e um vencimento
  // sumir justamente nessas bordas seria confuso.
  const grade = modo === "mes" ? gradeDoMes(ano, mes) : []
  const janela =
    modo === "semana"
      ? { de: semana, ate: somarDiasISO(semana, 6) }
      : { de: grade[0].iso, ate: grade[grade.length - 1].iso }

  const [tarefas, semData, contextos, usuarios, abas, pref, vencimentos] = await Promise.all([
    modo === "semana"
      ? listarTarefasDoIntervalo(semana, somarDiasISO(semana, 6), filtro)
      : listarTarefasDoMes(ano, mes, filtro),
    listarTarefasSemPrazo(),
    listarContextos(),
    listarUsuariosAtivos(),
    listarAbas(),
    getPreferencia(usuario.id),
    fonteFinanceiro
      ? listarVencimentosPorDia(janela.de, janela.ate, "/dashboard/workspace/calendario")
      : Promise.resolve({}),
  ])

  const tarefaAberta = um(searchParams, "tarefa")

  return (
    <main className="ws-main">
      <WorkspaceRealtime />

      <div className="ws-topo">
        <WorkspaceNav
          abas={abas}
          presenca={{ id: usuario.id, nome: usuario.nome, foto: pref.foto_url }}
        />
        <FiltrosTarefas
          contextos={contextos.filter((c) => c.tipo === "cliente")}
          usuarios={usuarios}
          mostrarAgrupamento={false}
          situacaoPadrao="todas"
          rotuloContexto="Cliente"
          placeholderBusca="Pesquisar tarefa, data, cliente, responsável…"
        />
        {podeFinanceiro && <FonteFinanceiro ativa={fonteFinanceiro} />}
      </div>

      <div className="ws-conteudo">
        <CalendarioTarefas
          modo={modo}
          semana={semana}
          ano={ano}
          mes={mes}
          tarefas={tarefas}
          semData={semData}
          hoje={hoje}
          meuUsuarioId={usuario.id}
          modoCor={pref.modo_cor}
          busca={um(searchParams, "q") ?? ""}
          vencimentos={vencimentos}
        />
      </div>

      {tarefaAberta && (
        <DrawerServidor tarefaId={tarefaAberta} souAdmin={usuario.papel === "admin"} />
      )}
    </main>
  )
}
