import Link from "next/link"
import { formatarDataHora, ROTULO_STATUS, urlSegura } from "@/lib/reunioes-nucleo"
import type { AgendamentoTela, EstadoConexao } from "@/lib/reunioes-tipos"
import CancelarReuniao from "./CancelarReuniao"

const COR_STATUS: Record<AgendamentoTela["status"], string> = {
  solicitada: "#C9953A",
  confirmada: "#5da283",
  reagendada: "#4573d2",
  cancelada: "#e24b4a",
  rejeitada: "#e24b4a",
  realizada: "#8a93a3",
}

/** Lista em cartões (não tabela): no celular cada reunião vira um bloco
 *  legível, sem rolagem horizontal. */
export default function ListaReunioes({
  proximas,
  encerradas,
  estado,
  meuId,
  souAdmin,
}: {
  proximas: AgendamentoTela[]
  encerradas: AgendamentoTela[]
  estado: EstadoConexao
  meuId: string
  souAdmin: boolean
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, margin: 0, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.4 }}>
          Próximas reuniões
        </h3>
        {proximas.length === 0 ? (
          <p className="glass" style={{ fontSize: 12, color: "var(--text-3)", padding: 14, borderRadius: 10, margin: 0 }}>
            {estado === "nao_configurado" || estado === "pendente"
              ? "Nenhuma reunião ainda — a integração com o Cal.com não está ativa. Veja Integrações."
              : "Nenhuma reunião agendada daqui pra frente."}
          </p>
        ) : (
          proximas.map((a) => (
            <CartaoReuniao key={a.id} a={a} podeCancelar={souAdmin || (a.responsavel_id !== null && a.responsavel_id === meuId)} />
          ))
        )}
      </section>

      {encerradas.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, margin: 0, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Canceladas, recusadas e realizadas (30 dias)
          </h3>
          {encerradas.map((a) => <CartaoReuniao key={a.id} a={a} apagado />)}
        </section>
      )}
    </div>
  )
}

function CartaoReuniao({ a, apagado, podeCancelar = false }: { a: AgendamentoTela; apagado?: boolean; podeCancelar?: boolean }) {
  const link = urlSegura(a.link_reuniao)
  return (
    <article
      className="glass"
      style={{
        padding: "10px 12px", borderRadius: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
        opacity: apagado ? 0.7 : 1, borderLeft: `3px solid ${COR_STATUS[a.status]}`,
      }}
    >
      <div style={{ flex: "0 0 auto", minWidth: 120 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{formatarDataHora(a.inicio)}</div>
        <div style={{ fontSize: 11, color: COR_STATUS[a.status], fontWeight: 600 }}>{ROTULO_STATUS[a.status]}</div>
      </div>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis" }}>
          {a.participante_nome ?? "Participante"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>
          {a.tipo_nome ?? "Tipo não associado"}
          {" · "}
          {a.responsavel_nome ?? "sem responsável"}
          {a.local_rotulo ? ` · ${a.local_rotulo}` : ""}
        </div>
        {a.sync_status !== "ok" && (
          <div style={{ fontSize: 11, color: "#e24b4a" }}>Sincronização: {a.sync_erro ?? a.sync_status}</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {link && !apagado && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6, background: "var(--accent)", color: "#1e1f21", textDecoration: "none" }}
          >
            Entrar na reunião
          </a>
        )}
        {a.tarefa_id && (
          <Link
            href={`?secao=proximas&tarefa=${a.tarefa_id}`}
            scroll={false}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)", color: "var(--text-1)", textDecoration: "none" }}
          >
            Abrir tarefa
          </Link>
        )}
        {/* Só decide se o botão aparece; a action confere de novo. */}
        {!apagado && podeCancelar && (a.status === "confirmada" || a.status === "solicitada") && (
          <CancelarReuniao agendamentoId={a.id} participante={a.participante_nome} tipo={a.tipo_nome} inicio={a.inicio} />
        )}
      </div>
    </article>
  )
}
