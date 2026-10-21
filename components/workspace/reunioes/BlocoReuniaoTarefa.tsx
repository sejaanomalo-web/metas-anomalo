"use client"

import { useState } from "react"
import { definirBloqueioTarefaAction } from "@/lib/reunioes-actions"
import { ROTULO_STATUS, urlSegura, type StatusReuniao } from "@/lib/reunioes-nucleo"
import { Mensagem, useAcao } from "./ui"

const DURACOES = [15, 30, 45, 60, 90, 120, 180, 240]

/**
 * Bloco extra no detalhe da tarefa:
 *   • tarefa que É reunião do Cal.com → status + "Entrar na reunião";
 *   • tarefa comum → opção "Bloqueia agenda de reuniões" (desligada por
 *     padrão: tarefa de trabalho não ocupa a agenda pública).
 */
export default function BlocoReuniaoTarefa({
  tarefaId,
  temHorario,
  reuniao,
  bloqueio,
}: {
  tarefaId: string
  temHorario: boolean
  reuniao: { status: StatusReuniao; link: string | null; local: string | null } | null
  bloqueio: { duracao_min: number } | null
}) {
  const { pendente, resultado, rodar } = useAcao()
  const [duracao, setDuracao] = useState(bloqueio?.duracao_min ?? 60)

  if (reuniao) {
    const link = urlSegura(reuniao.link)
    const ativa = reuniao.status === "confirmada" || reuniao.status === "solicitada"
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ flex: "0 0 110px", fontSize: 12, color: "var(--text-3)" }}>Reunião</span>
        <span style={{ fontSize: 12, color: "var(--text-1)" }}>
          {ROTULO_STATUS[reuniao.status]} · {reuniao.local ?? "Cal.com"}
        </span>
        {link && ativa ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 6, background: "var(--accent)", color: "#1e1f21", textDecoration: "none" }}
          >
            Entrar na reunião
          </a>
        ) : ativa ? (
          <span style={{ fontSize: 11, color: "var(--text-4)" }}>link ainda não disponível</span>
        ) : null}
      </div>
    )
  }

  function aplicar(liga: boolean, dur = duracao) {
    const fd = new FormData()
    fd.set("tarefa_id", tarefaId)
    fd.set("bloqueia", liga ? "1" : "0")
    fd.set("duracao_min", String(dur))
    rodar(() => definirBloqueioTarefaAction(fd))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ flex: "0 0 110px", fontSize: 12, color: "var(--text-3)" }}>Agenda pública</span>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--text-1)", cursor: "pointer" }}>
          <input type="checkbox" checked={Boolean(bloqueio)} disabled={pendente} onChange={(e) => aplicar(e.target.checked)} />
          Bloqueia agenda de reuniões
        </label>
        {bloqueio && (
          <select
            value={duracao}
            disabled={pendente}
            onChange={(e) => {
              const v = Number(e.target.value)
              setDuracao(v)
              aplicar(true, v)
            }}
            className="glass-input"
            style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6 }}
            aria-label="Duração do bloqueio"
          >
            {DURACOES.map((d) => (
              <option key={d} value={d} style={{ color: "#111" }}>
                {d < 60 ? `${d} min` : `${d / 60} h`}
              </option>
            ))}
          </select>
        )}
      </div>
      {bloqueio && !temHorario && (
        <span style={{ fontSize: 11, color: "#C9953A", paddingLeft: 118 }}>Defina data e horário para o bloqueio valer.</span>
      )}
      <div style={{ paddingLeft: 118 }}>
        <Mensagem r={resultado} />
      </div>
    </div>
  )
}
