"use client"

import { useState } from "react"
import {
  alternarSincronizacaoAction,
  conectarAction,
  conectarFeedIcsAction,
  desconectarAction,
  sincronizarAgoraAction,
  testarConexaoAction,
} from "@/lib/reunioes-actions"
import { COR_CONEXAO, ROTULO_CONEXAO, type IntegracaoTela } from "@/lib/reunioes-tipos"
import { formatarDataHora } from "@/lib/reunioes-nucleo"
import { Cartao, estiloBotao, estiloCampo, Mensagem, useAcao } from "./ui"

/**
 * Card do Cal.com + feed de bloqueios + videochamada. Todo botão daqui chama
 * uma action real; quando falta pré-requisito, o botão fica desabilitado e a
 * linha de baixo diz o que falta.
 */
export default function IntegracoesReunioes({ integ, souAdmin }: { integ: IntegracaoTela; souAdmin: boolean }) {
  const { pendente, resultado, rodar } = useAcao()
  const [confirmando, setConfirmando] = useState(false)
  const [textoConfirmacao, setTextoConfirmacao] = useState("")
  const semChave = !integ.env.apiKey
  const desconectado = integ.estado === "desconectado"
  const bloqueado = pendente || !souAdmin

  const faltas: string[] = []
  if (!integ.env.apiKey) faltas.push("CALCOM_API_KEY")
  if (!integ.env.webhookSecret) faltas.push("CALCOM_WEBHOOK_SECRET")

  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))" }}>
      <Cartao
        titulo={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Cal.com
            <span style={{ fontSize: 11, fontWeight: 600, color: COR_CONEXAO[integ.estado] }}>● {ROTULO_CONEXAO[integ.estado]}</span>
          </span>
        }
        subtitulo="Página pública de agendamento. Cada reserva vira tarefa no Calendário do Workspace."
      >
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 12, margin: 0 }}>
          <dt style={{ color: "var(--text-4)" }}>Conta</dt>
          <dd style={{ margin: 0, color: "var(--text-1)" }}>{integ.contaUsername ? `${integ.contaNome ?? ""} (@${integ.contaUsername})` : "—"}</dd>
          <dt style={{ color: "var(--text-4)" }}>Webhook</dt>
          <dd style={{ margin: 0, color: integ.webhookRegistrado ? "#5da283" : "var(--text-3)" }}>{integ.webhookRegistrado ? "registrado" : "não registrado"}</dd>
          <dt style={{ color: "var(--text-4)" }}>Importação</dt>
          <dd style={{ margin: 0, color: integ.sincronizacaoAtiva ? "#5da283" : "#C9953A" }}>{integ.sincronizacaoAtiva ? "ativa" : "pausada"}</dd>
          <dt style={{ color: "var(--text-4)" }}>Último teste</dt>
          <dd style={{ margin: 0, color: integ.ultimoTesteOk === false ? "#e24b4a" : "var(--text-2)" }}>
            {integ.ultimoTesteEm ? `${formatarDataHora(integ.ultimoTesteEm)} · ${integ.ultimoTesteOk ? "OK" : "com falhas"}` : "nunca"}
          </dd>
          <dt style={{ color: "var(--text-4)" }}>Última sincronização</dt>
          <dd style={{ margin: 0, color: "var(--text-2)" }}>{formatarDataHora(integ.ultimaSincronizacaoEm)}</dd>
          {integ.ultimoErro && souAdmin && (
            <>
              <dt style={{ color: "var(--text-4)" }}>Último erro</dt>
              <dd style={{ margin: 0, color: "#e24b4a", wordBreak: "break-word" }}>{integ.ultimoErro}</dd>
            </>
          )}
        </dl>

        {faltas.length > 0 && (
          <p style={{ fontSize: 11, color: "#C9953A", margin: 0 }}>
            Falta configurar no servidor: {faltas.join(", ")}. Veja &quot;Ações manuais&quot; em docs/CALCOM_WORKSPACE_INTEGRATION.md.
          </p>
        )}
        {!souAdmin && <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Só administradores mexem na conexão.</p>}

        {souAdmin && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="no-ds" disabled={bloqueado || semChave} style={estiloBotao("neutro", bloqueado || semChave)} onClick={() => rodar(testarConexaoAction)}>
              Testar conexão
            </button>
            <button
              type="button"
              className="no-ds"
              disabled={bloqueado || faltas.length > 0}
              style={estiloBotao("principal", bloqueado || faltas.length > 0)}
              onClick={() => rodar(conectarAction)}
            >
              {integ.webhookRegistrado ? "Reconectar" : "Conectar"}
            </button>
            <button type="button" className="no-ds" disabled={bloqueado || semChave || desconectado || !integ.sincronizacaoAtiva} style={estiloBotao("neutro", bloqueado || semChave || desconectado || !integ.sincronizacaoAtiva)} onClick={() => rodar(sincronizarAgoraAction)}>
              Sincronizar agora
            </button>
            {!desconectado && (
              <button
                type="button"
                className="no-ds"
                disabled={bloqueado}
                style={estiloBotao("neutro", bloqueado)}
                onClick={() => rodar(() => alternarSincronizacaoAction(!integ.sincronizacaoAtiva))}
              >
                {integ.sincronizacaoAtiva ? "Pausar sincronização" : "Retomar sincronização"}
              </button>
            )}
            {!desconectado && (
              <button type="button" className="no-ds" disabled={bloqueado} style={estiloBotao("perigo", bloqueado)} onClick={() => setConfirmando(true)}>
                Desconectar
              </button>
            )}
          </div>
        )}

        {confirmando && souAdmin && (
          <div role="alertdialog" aria-label="Confirmar desconexão" style={{ border: "1px solid rgba(226,75,74,0.4)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-1)", margin: 0, fontWeight: 600 }}>Desconectar o Cal.com?</p>
            <ul style={{ fontSize: 11, color: "var(--text-2)", margin: 0, paddingLeft: 16 }}>
              <li>O webhook é removido no Cal.com e novas reservas deixam de virar tarefa.</li>
              <li>Reuniões, tarefas e histórico já importados ficam como estão.</li>
              <li>Nenhuma reserva é cancelada — a página pública do Cal.com continua aceitando agendamentos.</li>
              <li>A API key continua no servidor até você removê-la (passo manual).</li>
            </ul>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={textoConfirmacao}
                onChange={(e) => setTextoConfirmacao(e.target.value)}
                placeholder="Digite DESCONECTAR"
                className="glass-input"
                style={estiloCampo}
                aria-label="Confirmação"
              />
              <button
                type="button"
                className="no-ds"
                disabled={pendente || textoConfirmacao !== "DESCONECTAR"}
                style={estiloBotao("perigo", pendente || textoConfirmacao !== "DESCONECTAR")}
                onClick={() => {
                  rodar(() => desconectarAction(textoConfirmacao))
                  setConfirmando(false)
                  setTextoConfirmacao("")
                }}
              >
                Confirmar
              </button>
              <button type="button" className="no-ds" style={estiloBotao("neutro")} onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        <Mensagem r={resultado} />
      </Cartao>

      <CartaoFeed integ={integ} souAdmin={souAdmin} />

      <Cartao titulo="Videochamada" subtitulo="Plataforma inicial: Cal Video (nativo do Cal.com, sem depender do Google).">
        <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>
          O link de cada reunião vem do próprio Cal.com no webhook e aparece na tarefa como &quot;Entrar na reunião&quot;.
          Se o link só for gerado depois, a tarefa é complementada quando ele chegar. Para trocar de plataforma,
          mude o &quot;Local&quot; do tipo de reunião.
        </p>
      </Cartao>

      <Cartao titulo="Google Calendar" subtitulo="Não utilizado — opcional.">
        <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>
          A agenda de trabalho é o Calendário do Workspace. Nada aqui depende do Google. Os compromissos manuais que
          precisam bloquear a agenda pública chegam ao Cal.com pelo feed de bloqueios ao lado.
        </p>
      </Cartao>
    </div>
  )
}

function CartaoFeed({ integ, souAdmin }: { integ: IntegracaoTela; souAdmin: boolean }) {
  const { pendente, resultado, rodar } = useAcao()
  const pronto = integ.env.apiKey && integ.env.icsToken
  return (
    <Cartao
      titulo={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          Bloqueios do Workspace → Cal.com
          <span style={{ fontSize: 11, fontWeight: 600, color: integ.feedIcsConectado ? "#5da283" : "#8a93a3" }}>
            ● {integ.feedIcsConectado ? "Feed cadastrado" : "Não cadastrado"}
          </span>
        </span>
      }
      subtitulo="Feed ICS com as tarefas marcadas como 'Bloqueia agenda de reuniões'. O Cal.com lê como calendário de conflitos."
    >
      <ul style={{ fontSize: 11, color: "var(--text-2)", margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        <li>Tarefa comum NÃO bloqueia. Só as marcadas no detalhe da tarefa, com data e horário.</li>
        <li>Reuniões vindas do Cal.com não entram no feed (o Cal.com já ocupa o horário).</li>
        <li>O feed só mostra &quot;Ocupado&quot; — nenhum título ou cliente sai do Workspace.</li>
        <li>O Cal.com relê feeds ICS periodicamente: um bloqueio novo pode levar alguns minutos para valer.</li>
      </ul>
      {!integ.env.icsToken && (
        <p style={{ fontSize: 11, color: "#C9953A", margin: 0 }}>Falta REUNIOES_ICS_TOKEN no servidor (24+ caracteres aleatórios).</p>
      )}
      {souAdmin && (
        <div>
          <button type="button" className="no-ds" disabled={pendente || !pronto} style={estiloBotao(integ.feedIcsConectado ? "neutro" : "principal", pendente || !pronto)} onClick={() => rodar(conectarFeedIcsAction)}>
            {integ.feedIcsConectado ? "Cadastrar de novo" : "Cadastrar feed no Cal.com"}
          </button>
        </div>
      )}
      <Mensagem r={resultado} />
    </Cartao>
  )
}
