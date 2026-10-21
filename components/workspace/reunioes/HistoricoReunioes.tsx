"use client"

import Link from "next/link"
import { reprocessarAction, sincronizarAgoraAction } from "@/lib/reunioes-actions"
import { formatarDataHora } from "@/lib/reunioes-nucleo"
import type { AgendamentoTela, EventoWebhookTela, LogTela } from "@/lib/reunioes-tipos"
import { Cartao, estiloBotao, Mensagem, useAcao } from "./ui"

const COR_NIVEL = { info: "var(--text-3)", aviso: "#C9953A", erro: "#e24b4a" } as const
const COR_EVENTO = { recebido: "#C9953A", processado: "#5da283", ignorado: "var(--text-4)", erro: "#e24b4a" } as const

/**
 * Pendências + eventos de webhook + log técnico. Detalhe técnico (eventos,
 * log) só pra admin; quem não é admin vê só a contagem de pendências.
 */
export default function HistoricoReunioes({
  pendencias,
  eventosComErro,
  eventos,
  log,
  souAdmin,
}: {
  pendencias: AgendamentoTela[]
  eventosComErro: number
  eventos: EventoWebhookTela[]
  log: LogTela[]
  souAdmin: boolean
}) {
  const { pendente, resultado, rodar } = useAcao()
  const total = pendencias.length + eventosComErro

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Cartao
        titulo={total === 0 ? "Nenhuma pendência de sincronização" : `${total} ${total === 1 ? "item aguardando" : "itens aguardando"} sincronização`}
        subtitulo={
          total === 0
            ? "Todas as reservas recebidas viraram tarefa."
            : `${pendencias.length} reunião(ões) com pendência · ${eventosComErro} evento(s) de webhook com erro`
        }
        acoes={
          souAdmin ? (
            <>
              <button type="button" className="no-ds" disabled={pendente || eventosComErro === 0} style={estiloBotao("neutro", pendente || eventosComErro === 0)} onClick={() => rodar(reprocessarAction)}>
                Tentar de novo
              </button>
              <button type="button" className="no-ds" disabled={pendente} style={estiloBotao("principal", pendente)} onClick={() => rodar(sincronizarAgoraAction)}>
                Conferir com o Cal.com
              </button>
            </>
          ) : undefined
        }
      >
        <Mensagem r={resultado} />
        {pendencias.map((a) => (
          <div key={a.id} style={{ fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
            <strong style={{ color: "var(--text-1)" }}>{formatarDataHora(a.inicio)}</strong>
            <span style={{ color: "var(--text-2)" }}>{a.participante_nome ?? "Participante"}</span>
            <span style={{ color: a.sync_status === "erro" ? "#e24b4a" : "#C9953A" }}>{a.sync_erro ?? a.sync_status}</span>
            {a.tarefa_id && (
              <Link href={`?secao=historico&tarefa=${a.tarefa_id}`} scroll={false} style={{ color: "var(--accent)", fontSize: 11 }}>
                abrir tarefa
              </Link>
            )}
          </div>
        ))}
      </Cartao>

      {souAdmin && (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))" }}>
          <Cartao titulo="Eventos recebidos do Cal.com" subtitulo="Últimos 40. Repetições do mesmo evento são descartadas.">
            {eventos.length === 0 && <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>Nenhum evento recebido ainda.</p>}
            {eventos.map((e) => (
              <div key={e.id} style={{ fontSize: 11, display: "flex", flexDirection: "column", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 4 }}>
                <span>
                  <strong style={{ color: "var(--text-1)" }}>{e.gatilho ?? "?"}</strong>{" "}
                  <span style={{ color: COR_EVENTO[e.status] }}>{e.status}</span>
                  <span style={{ color: "var(--text-4)" }}> · {formatarDataHora(e.recebido_em)}{e.tentativas > 1 ? ` · ${e.tentativas} tentativas` : ""}</span>
                </span>
                {(e.erro || e.resultado) && <span style={{ color: e.erro ? "#e24b4a" : "var(--text-3)", wordBreak: "break-word" }}>{e.erro ?? e.resultado}</span>}
              </div>
            ))}
          </Cartao>
          <Cartao titulo="Log de sincronização" subtitulo="Ações, publicações e falhas.">
            {log.length === 0 && <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>Sem registros.</p>}
            {log.map((l) => (
              <div key={l.id} style={{ fontSize: 11, display: "flex", flexDirection: "column", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 4 }}>
                <span style={{ color: "var(--text-4)" }}>
                  {formatarDataHora(l.created_at)} · <span style={{ color: COR_NIVEL[l.nivel] }}>{l.nivel}</span> · {l.acao}
                </span>
                <span style={{ color: "var(--text-2)", wordBreak: "break-word" }}>{l.mensagem}</span>
              </div>
            ))}
          </Cartao>
        </div>
      )}
    </div>
  )
}
