import { notFound } from "next/navigation"
import { requererPermissao } from "@/lib/auth"
import {
  getAba,
  getPreferencia,
  listarAbas,
  listarNotas,
  listarTarefasDoIntervalo,
  listarTarefasDoMes,
  listarTarefasSemPrazo,
} from "@/lib/workspace"
import {
  ehDataISOValida,
  hojeISO,
  inicioDaSemana,
  somarDiasISO,
} from "@/lib/workspace-datas"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import WorkspaceRealtime from "@/components/workspace/WorkspaceRealtime"
import CalendarioTarefas from "@/components/workspace/CalendarioTarefas"
import NotasWorkspace from "@/components/workspace/NotasWorkspace"
import DrawerServidor from "@/components/workspace/DrawerServidor"

export const dynamic = "force-dynamic"

type SP = Record<string, string | string[] | undefined>

function um(sp: SP, chave: string): string | undefined {
  const v = sp[chave]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Aba CUSTOMIZADA (criada no "+"): calendário próprio (tarefas no contexto
 * interno da aba), coleção de notas, ou os DOIS (tipo misto — sub-abas
 * Calendário | Notas, como a área de um cliente).
 */
export default async function AbaCustomPage({
  params,
  searchParams,
}: {
  params: { abaId: string }
  searchParams: SP
}) {
  const usuario = await requererPermissao("workspace")
  const aba = await getAba(params.abaId)
  if (!aba) notFound()

  const [abas, pref] = await Promise.all([listarAbas(), getPreferencia(usuario.id)])
  const hoje = hojeISO()
  const tarefaAberta = um(searchParams, "tarefa")

  // Tipo misto: sub-aba via ?aba= (calendário é a inicial).
  const subAba =
    aba.tipo === "nota" || (aba.tipo === "misto" && um(searchParams, "aba") === "nota")
      ? "nota"
      : "calendario"

  let conteudo: React.ReactNode = null

  if (subAba === "nota") {
    const notas = await listarNotas({ abaId: aba.id })
    conteudo = <NotasWorkspace notas={notas} escopo={{ aba_id: aba.id }} />
  } else if (aba.contexto_id) {
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

    const filtro = { contextoId: aba.contexto_id, situacao: "todas" as const }
    const [tarefas, semDataTodas] = await Promise.all([
      modo === "semana"
        ? listarTarefasDoIntervalo(semana, somarDiasISO(semana, 6), filtro)
        : listarTarefasDoMes(ano, mes, filtro),
      listarTarefasSemPrazo(200),
    ])
    const semData = semDataTodas.filter((t) =>
      t.contextos.some((c) => c.id === aba.contexto_id)
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
        contextoFixoId={aba.contexto_id}
        modoCor={pref.modo_cor}
      />
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 0" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-1)" }}>
            {aba.nome}
          </h2>
          {aba.tipo === "misto" && (
            <nav style={{ display: "flex", gap: 2 }}>
              {(
                [
                  { chave: "calendario", rotulo: "Calendário", href: `/dashboard/workspace/t/${aba.id}` },
                  { chave: "nota", rotulo: "Notas", href: `/dashboard/workspace/t/${aba.id}?aba=nota` },
                ] as const
              ).map((s) => (
                <a
                  key={s.chave}
                  href={s.href}
                  style={{
                    fontSize: 12,
                    fontWeight: subAba === s.chave ? 600 : 400,
                    color: subAba === s.chave ? "var(--text-1)" : "var(--text-3)",
                    textDecoration: "none",
                    padding: "4px 8px",
                    borderBottom: subAba === s.chave ? "2px solid var(--text-1)" : "2px solid transparent",
                  }}
                >
                  {s.rotulo}
                </a>
              ))}
            </nav>
          )}
        </div>
        {conteudo}
      </div>

      {tarefaAberta && (
        <DrawerServidor tarefaId={tarefaAberta} souAdmin={usuario.papel === "admin"} />
      )}
    </main>
  )
}
