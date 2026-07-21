"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  decidirProjetoAction,
  decidirUsuarioAction,
  descartarProjetoAction,
} from "@/lib/workspace-import-actions"

export interface IdentidadeLinha {
  id: string
  nome: string | null
  email: string | null
  usuario_id: string | null
  /** Já passou pela decisão — inclusive "manter sem conta". */
  revisado: boolean
  tarefas: number
}

export interface ProjetoLinha {
  id: string
  nome: string
  tipo: string
  cliente_id: string | null
  arquivado: boolean
  tarefas: number
}

export interface OpcaoUsuario {
  id: string
  nome: string
}

export interface OpcaoCliente {
  id: string
  nome: string
  empresa: string
}

const TIPOS: { valor: string; rotulo: string; ajuda: string }[] = [
  { valor: "cliente", rotulo: "Pasta de cliente", ajuda: "Aparece na aba Clientes" },
  { valor: "interno", rotulo: "Interno da Anômalo", ajuda: "Time, não cliente" },
  { valor: "calendario_conteudo", rotulo: "Calendário de conteúdo", ajuda: "" },
  { valor: "estudos", rotulo: "Estudos", ajuda: "" },
  { valor: "arquivos", rotulo: "Arquivos", ajuda: "" },
  { valor: "aprovados", rotulo: "Aprovados", ajuda: "" },
  { valor: "geral", rotulo: "Geral", ajuda: "Contexto solto" },
  { valor: "desconhecido", rotulo: "— ainda não decidi —", ajuda: "" },
]

/**
 * Tela de decisões da importação. É o "martelo humano" que o plano exige:
 * nenhum projeto vira cliente e nenhum usuário do Asana vira conta sem alguém
 * dizer que sim.
 *
 * Tudo é reversível — mudar de ideia é escolher outra opção. Nada aqui apaga
 * tarefa: descartar um projeto arquiva a PASTA, e as tarefas continuam
 * existindo nos outros contextos e no calendário.
 */
export default function MapeamentoImportacao({
  identidades,
  projetos,
  usuarios,
  clientes,
}: {
  identidades: IdentidadeLinha[]
  projetos: ProjetoLinha[]
  usuarios: OpcaoUsuario[]
  clientes: OpcaoCliente[]
}) {
  const projetosPendentes = projetos.filter(
    (p) => p.tipo === "desconhecido" && !p.arquivado
  ).length
  const usuariosPendentes = identidades.filter((i) => !i.revisado).length

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Resumo
        projetosPendentes={projetosPendentes}
        usuariosPendentes={usuariosPendentes}
        totalProjetos={projetos.length}
        totalUsuarios={identidades.length}
      />

      <section>
        <Cabecalho
          titulo="1. Quem é quem"
          subtitulo="Ligue cada pessoa do Asana à conta dela aqui. Quem ficar sem conta não some — a autoria é preservada, mas a pessoa não consegue entrar no sistema."
          pendentes={usuariosPendentes}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {identidades.map((i) => (
            <LinhaUsuario key={i.id} identidade={i} usuarios={usuarios} />
          ))}
        </div>
      </section>

      <section>
        <Cabecalho
          titulo="2. O que é cada projeto"
          subtitulo="Diga se cada projeto do Asana é a pasta de um cliente, algo interno, uma área especial — ou lixo pra descartar."
          pendentes={projetosPendentes}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[...projetos]
            .sort((a, b) => {
              // Pendentes primeiro, depois por volume — o que tem mais tarefa
              // é o que mais dói errar.
              const pa = a.tipo === "desconhecido" && !a.arquivado ? 0 : 1
              const pb = b.tipo === "desconhecido" && !b.arquivado ? 0 : 1
              return pa - pb || b.tarefas - a.tarefas
            })
            .map((p) => (
              <LinhaProjeto key={p.id} projeto={p} clientes={clientes} />
            ))}
        </div>
      </section>
    </div>
  )
}

function Resumo({
  projetosPendentes,
  usuariosPendentes,
  totalProjetos,
  totalUsuarios,
}: {
  projetosPendentes: number
  usuariosPendentes: number
  totalProjetos: number
  totalUsuarios: number
}) {
  const pronto = projetosPendentes === 0 && usuariosPendentes === 0
  return (
    <div
      className="glass"
      style={{
        padding: 14,
        borderRadius: 12,
        borderLeft: `3px solid ${pronto ? "#4caf50" : "var(--accent)"}`,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>
        {pronto
          ? "Tudo decidido — pode rodar a carga."
          : `Faltam ${usuariosPendentes + projetosPendentes} decisões.`}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-4)" }}>
        {totalUsuarios - usuariosPendentes}/{totalUsuarios} pessoas ·{" "}
        {totalProjetos - projetosPendentes}/{totalProjetos} projetos
      </p>
    </div>
  )
}

function Cabecalho({
  titulo,
  subtitulo,
  pendentes,
}: {
  titulo: string
  subtitulo: string
  pendentes: number
}) {
  return (
    <header style={{ marginBottom: 10 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 3px", color: "var(--text-1)" }}>
        {titulo}
        {pendentes > 0 && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 999,
              background: "rgba(201,149,58,0.16)",
              color: "var(--accent)",
            }}
          >
            {pendentes} pendente{pendentes === 1 ? "" : "s"}
          </span>
        )}
      </h2>
      <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0, maxWidth: 620 }}>
        {subtitulo}
      </p>
    </header>
  )
}

function LinhaUsuario({
  identidade,
  usuarios,
}: {
  identidade: IdentidadeLinha
  usuarios: OpcaoUsuario[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function salvar(usuarioId: string) {
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("identidade_id", identidade.id)
      if (usuarioId) fd.set("usuario_id", usuarioId)
      const r = await decidirUsuarioAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Falhou")
        return
      }
      router.refresh()
    })
  }

  const decidido = identidade.revisado

  return (
    <div
      className="glass"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "10px 12px",
        borderRadius: 10,
        opacity: pending ? 0.6 : 1,
        borderLeft: `2px solid ${decidido ? "transparent" : "var(--accent)"}`,
      }}
    >
      <span style={{ flex: "1 1 180px", minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
          {identidade.nome || "(sem nome)"}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-4)" }}>
          {identidade.email || "sem e-mail no Asana"}
          {identidade.tarefas > 0 && ` · ${identidade.tarefas} tarefas`}
          {identidade.revisado && !identidade.usuario_id && " · sem conta (decidido)"}
        </span>
      </span>

      <select
        value={identidade.usuario_id ?? ""}
        onChange={(e) => salvar(e.target.value)}
        disabled={pending}
        className="glass-input"
        style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, minWidth: 190 }}
      >
        <option value="" style={{ color: "#111" }}>
          Manter sem conta (autoria preservada)
        </option>
        {usuarios.map((u) => (
          <option key={u.id} value={u.id} style={{ color: "#111" }}>
            {u.nome}
          </option>
        ))}
      </select>

      {erro && <span style={{ fontSize: 10, color: "#e24b4a" }}>{erro}</span>}
    </div>
  )
}

function LinhaProjeto({
  projeto,
  clientes,
}: {
  projeto: ProjetoLinha
  clientes: OpcaoCliente[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [tipo, setTipo] = useState(projeto.tipo)
  const [clienteId, setClienteId] = useState(projeto.cliente_id ?? "")

  function salvar(novoTipo: string, novoCliente: string) {
    setErro(null)
    // "cliente" sem cliente escolhido não vai pro servidor — o CHECK do banco
    // rejeitaria e o usuário veria um erro técnico sem sentido.
    if (novoTipo === "cliente" && !novoCliente) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set("contexto_id", projeto.id)
      fd.set("tipo", novoTipo)
      if (novoCliente) fd.set("cliente_id", novoCliente)
      const r = await decidirProjetoAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Falhou")
        return
      }
      router.refresh()
    })
  }

  function descartar(desarquivar: boolean) {
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("contexto_id", projeto.id)
      if (desarquivar) fd.set("desarquivar", "1")
      const r = await descartarProjetoAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Falhou")
        return
      }
      router.refresh()
    })
  }

  const pendente = projeto.tipo === "desconhecido" && !projeto.arquivado

  return (
    <div
      className="glass"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "10px 12px",
        borderRadius: 10,
        opacity: pending ? 0.6 : projeto.arquivado ? 0.45 : 1,
        borderLeft: `2px solid ${pendente ? "var(--accent)" : "transparent"}`,
      }}
    >
      <span style={{ flex: "1 1 190px", minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-1)",
            textDecoration: projeto.arquivado ? "line-through" : "none",
          }}
        >
          {projeto.nome}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-4)" }}>
          {projeto.tarefas} tarefa{projeto.tarefas === 1 ? "" : "s"}
          {projeto.arquivado && " · descartado"}
        </span>
      </span>

      {!projeto.arquivado && (
        <>
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value)
              salvar(e.target.value, clienteId)
            }}
            disabled={pending}
            className="glass-input"
            style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, minWidth: 170 }}
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor} style={{ color: "#111" }}>
                {t.rotulo}
              </option>
            ))}
          </select>

          {tipo === "cliente" && (
            <select
              value={clienteId}
              onChange={(e) => {
                setClienteId(e.target.value)
                salvar("cliente", e.target.value)
              }}
              disabled={pending}
              className="glass-input"
              style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, minWidth: 190 }}
            >
              <option value="" style={{ color: "#111" }}>Qual cliente?</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id} style={{ color: "#111" }}>
                  {c.nome} ({c.empresa})
                </option>
              ))}
            </select>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => descartar(projeto.arquivado)}
        disabled={pending}
        className="no-ds"
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "transparent",
          color: projeto.arquivado ? "var(--accent)" : "var(--text-4)",
          cursor: "pointer",
        }}
      >
        {projeto.arquivado ? "Restaurar" : "Descartar"}
      </button>

      {erro && (
        <span style={{ fontSize: 10, color: "#e24b4a", flexBasis: "100%" }}>{erro}</span>
      )}
    </div>
  )
}
