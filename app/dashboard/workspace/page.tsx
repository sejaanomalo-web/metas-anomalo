import Link from "next/link"
import { requererPermissao } from "@/lib/auth"
import {
  listarContextos,
  listarTarefas,
  listarUsuariosAtivos,
  type FiltroTarefas,
} from "@/lib/workspace"
import { hojeISO } from "@/lib/workspace-datas"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import WorkspaceRealtime from "@/components/workspace/WorkspaceRealtime"
import CriacaoRapida from "@/components/workspace/CriacaoRapida"
import FiltrosTarefas from "@/components/workspace/FiltrosTarefas"
import ListaTarefas, { type Agrupamento } from "@/components/workspace/ListaTarefas"
import DrawerServidor from "@/components/workspace/DrawerServidor"

export const dynamic = "force-dynamic"

const POR_PAGINA = 50

type SP = Record<string, string | string[] | undefined>

function um(sp: SP, chave: string): string | undefined {
  const v = sp[chave]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Visão geral do Workspace — a lista.
 *
 * Todo filtro/paginação vem da URL e é aplicado no SERVIDOR; nada de baixar a
 * tabela pro browser filtrar. O detalhe abre por ?tarefa=<id> na mesma página,
 * preservando filtro e posição.
 */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: SP
}) {
  const usuario = await requererPermissao("workspace")

  const pagina = Math.max(1, Number(um(searchParams, "pagina") ?? 1) || 1)

  // Valores da URL são entrada do usuário: valida contra a lista fechada em
  // vez de fazer cast. Um ?situacao=lixo cairia no "sem filtro" da consulta e
  // mostraria concluídas junto com pendentes sem ninguém entender por quê.
  const situacaoBruta = um(searchParams, "situacao")
  const situacao: FiltroTarefas["situacao"] =
    situacaoBruta === "concluidas" || situacaoBruta === "todas"
      ? situacaoBruta
      : "pendentes"

  const agruparBruto = um(searchParams, "agrupar")
  const agrupar: Agrupamento =
    agruparBruto === "responsavel" ||
    agruparBruto === "contexto" ||
    agruparBruto === "nenhum"
      ? agruparBruto
      : "prazo"

  const filtro: FiltroTarefas = {
    busca: um(searchParams, "q"),
    responsavelId: um(searchParams, "responsavel"),
    contextoId: um(searchParams, "contexto"),
    situacao,
    apenasAtrasadas: um(searchParams, "atrasadas") === "1",
    limite: POR_PAGINA,
    offset: (pagina - 1) * POR_PAGINA,
  }

  const [{ tarefas, temMais }, contextos, usuarios] = await Promise.all([
    listarTarefas(filtro),
    listarContextos(),
    listarUsuariosAtivos(),
  ])

  const tarefaAberta = um(searchParams, "tarefa")
  const hoje = hojeISO()

  const qsBase = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    const valor = Array.isArray(v) ? v[0] : v
    if (valor && k !== "pagina" && k !== "tarefa") qsBase.set(k, valor)
  }
  function urlPagina(n: number): string {
    const qs = new URLSearchParams(qsBase.toString())
    if (n > 1) qs.set("pagina", String(n))
    const s = qs.toString()
    return s ? `/dashboard/workspace?${s}` : "/dashboard/workspace"
  }

  return (
    <main style={{ padding: "20px 16px 48px", maxWidth: 1120, margin: "0 auto" }}>
      <WorkspaceRealtime />

      <header style={{ marginBottom: 14 }}>
        <h1 className="ds-headline" style={{ fontSize: 22, margin: "0 0 3px" }}>
          Workspace
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>
          Tarefas da operação. Uma tarefa existe uma vez só e aparece em todos os
          contextos em que estiver vinculada.
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <WorkspaceNav />

        <CriacaoRapida
          contextos={contextos}
          usuarios={usuarios}
          contextoPadraoId={um(searchParams, "contexto")}
          meuUsuarioId={usuario.id}
        />

        <FiltrosTarefas contextos={contextos} usuarios={usuarios} />

        <ListaTarefas
          tarefas={tarefas}
          hoje={hoje}
          agrupar={agrupar}
          vazio={
            um(searchParams, "q")
              ? "Nada encontrado com esses filtros."
              : "Nenhuma tarefa pendente. Crie a primeira acima."
          }
        />

        {(pagina > 1 || temMais) && (
          <nav style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
            {pagina > 1 && (
              <Link href={urlPagina(pagina - 1)} scroll={false} style={botaoPagina}>
                ‹ Anterior
              </Link>
            )}
            <span style={{ fontSize: 11, color: "var(--text-4)" }}>Página {pagina}</span>
            {temMais && (
              <Link href={urlPagina(pagina + 1)} scroll={false} style={botaoPagina}>
                Próxima ›
              </Link>
            )}
          </nav>
        )}
      </div>

      {tarefaAberta && (
        <DrawerServidor tarefaId={tarefaAberta} souAdmin={usuario.papel === "admin"} />
      )}
    </main>
  )
}

const botaoPagina = {
  fontSize: 11,
  fontWeight: 600,
  padding: "7px 14px",
  borderRadius: 8,
  background: "var(--surface-2)",
  color: "var(--text-2)",
  textDecoration: "none",
} as const
