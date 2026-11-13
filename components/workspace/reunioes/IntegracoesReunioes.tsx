"use client"

import { useState } from "react"
import {
  alternarBloqueioOutrasContasAction,
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
 * Um cartão POR CONTA do Cal.com (Anômalo Hub, Ativo, …) + videochamada.
 * Cada conta tem a sua API key, o seu webhook e o seu feed de bloqueios;
 * todas caem no mesmo fluxo (reserva → tarefa no Calendário do Workspace).
 * Todo botão chama uma action real; quando falta pré-requisito, o botão fica
 * desabilitado e a linha de baixo diz o que falta.
 */
export default function IntegracoesReunioes({ integracoes, souAdmin }: { integracoes: IntegracaoTela[]; souAdmin: boolean }) {
  const multi = integracoes.some((i) => i.multi)
  const variasContas = multi && integracoes.length > 1
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!multi && souAdmin && (
        <p className="glass" style={{ fontSize: 12, color: "#C9953A", padding: 12, borderRadius: 10, margin: 0 }}>
          Para conectar a segunda conta do Cal.com (Ativo), aplique{" "}
          <code>supabase/migrations/20261113_reunioes_calcom_multi_contas.sql</code> no SQL Editor do Supabase. Até lá,
          tudo continua funcionando com a conta atual.
        </p>
      )}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))" }}>
        {integracoes.map((i) => (
          <CartaoConta key={i.id || i.chave} integ={i} souAdmin={souAdmin} variasContas={variasContas} />
        ))}
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))" }}>
        {variasContas && (
          <Cartao titulo="Como as contas trabalham juntas" subtitulo="Mesmo fluxo para todas as contas.">
            <ul style={{ fontSize: 11, color: "var(--text-2)", margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
              <li>Reserva em qualquer conta vira tarefa no Calendário do Workspace, com o responsável do tipo de reunião.</li>
              <li>Cancelar, reagendar e conferir usam a API key da conta onde a reserva foi feita.</li>
              <li>
                Uma conta não enxerga a agenda da outra no Cal.com. Com &quot;Reuniões das outras contas bloqueiam esta
                agenda&quot; ligado, o feed de bloqueios leva esses horários como ocupados.
              </li>
              <li>O Cal.com relê o feed de tempos em tempos. Duas reservas no mesmo horário, em contas diferentes, ainda podem entrar nesse intervalo.</li>
            </ul>
          </Cartao>
        )}
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
            precisam bloquear a agenda pública chegam ao Cal.com pelo feed de bloqueios de cada conta.
          </p>
        </Cartao>
      </div>
    </div>
  )
}

function CartaoConta({ integ, souAdmin, variasContas }: { integ: IntegracaoTela; souAdmin: boolean; variasContas: boolean }) {
  const { pendente, resultado, rodar } = useAcao()
  const [confirmando, setConfirmando] = useState(false)
  const [textoConfirmacao, setTextoConfirmacao] = useState("")
  const conta = integ.chave
  const semChave = !integ.env.apiKey
  const desconectado = integ.estado === "desconectado"
  const bloqueado = pendente || !souAdmin

  const faltas: string[] = []
  if (!integ.env.apiKey) faltas.push(integ.envNomes.apiKey)
  if (!integ.env.webhookSecret) faltas.push(integ.envNomes.webhookSecret)

  return (
    <Cartao
      titulo={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          Cal.com · {integ.rotulo}
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
          Falta configurar no servidor (Vercel): {faltas.join(", ")}
          {!integ.env.apiKey && " — a API key é gerada em app.cal.com → Settings → Developer → API Keys, logado NESTA conta"}.
        </p>
      )}
      {!souAdmin && <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Só administradores mexem na conexão.</p>}

      {souAdmin && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="no-ds" disabled={bloqueado || semChave} style={estiloBotao("neutro", bloqueado || semChave)} onClick={() => rodar(() => testarConexaoAction(conta))}>
            Testar conexão
          </button>
          <button
            type="button"
            className="no-ds"
            disabled={bloqueado || faltas.length > 0}
            style={estiloBotao("principal", bloqueado || faltas.length > 0)}
            onClick={() => rodar(() => conectarAction(conta))}
          >
            {integ.webhookRegistrado ? "Reconectar" : "Conectar"}
          </button>
          <button
            type="button"
            className="no-ds"
            disabled={bloqueado || semChave || desconectado || !integ.sincronizacaoAtiva}
            style={estiloBotao("neutro", bloqueado || semChave || desconectado || !integ.sincronizacaoAtiva)}
            onClick={() => rodar(() => sincronizarAgoraAction(conta))}
          >
            Sincronizar agora
          </button>
          {!desconectado && (
            <button
              type="button"
              className="no-ds"
              disabled={bloqueado}
              style={estiloBotao("neutro", bloqueado)}
              onClick={() => rodar(() => alternarSincronizacaoAction(conta, !integ.sincronizacaoAtiva))}
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
        <div role="alertdialog" aria-label={`Confirmar desconexão de ${integ.rotulo}`} style={{ border: "1px solid rgba(226,75,74,0.4)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 12, color: "var(--text-1)", margin: 0, fontWeight: 600 }}>Desconectar a conta {integ.rotulo}?</p>
          <ul style={{ fontSize: 11, color: "var(--text-2)", margin: 0, paddingLeft: 16 }}>
            <li>O webhook desta conta é removido no Cal.com e novas reservas dela deixam de virar tarefa.</li>
            {variasContas && <li>As outras contas continuam funcionando normalmente.</li>}
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
                rodar(() => desconectarAction(conta, textoConfirmacao))
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

      <BlocoFeed integ={integ} souAdmin={souAdmin} variasContas={variasContas} />
    </Cartao>
  )
}

/** Feed ICS de bloqueios DESTA conta (cada conta do Cal.com cadastra o seu). */
function BlocoFeed({ integ, souAdmin, variasContas }: { integ: IntegracaoTela; souAdmin: boolean; variasContas: boolean }) {
  const { pendente, resultado, rodar } = useAcao()
  const pronto = integ.env.apiKey && integ.env.icsToken
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        Bloqueios do Workspace → {integ.rotulo}
        <span style={{ fontSize: 11, fontWeight: 600, color: integ.feedIcsConectado ? "#5da283" : "#8a93a3" }}>
          ● {integ.feedIcsConectado ? "Feed cadastrado" : "Não cadastrado"}
        </span>
      </div>
      <ul style={{ fontSize: 11, color: "var(--text-2)", margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        <li>Tarefas marcadas como &quot;Bloqueia agenda de reuniões&quot;, com data e horário, aparecem como ocupadas.</li>
        {variasContas && integ.bloquearOutrasContas && <li>Reuniões ativas das outras contas também aparecem como ocupadas.</li>}
        <li>O feed só mostra &quot;Ocupado&quot; — nenhum título ou cliente sai do Workspace.</li>
      </ul>
      {variasContas && (
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "var(--text-2)" }}>
          <input
            type="checkbox"
            checked={integ.bloquearOutrasContas}
            disabled={pendente || !souAdmin}
            onChange={(e) => {
              const ativo = e.target.checked
              rodar(() => alternarBloqueioOutrasContasAction(integ.chave, ativo))
            }}
            style={{ marginTop: 2 }}
          />
          <span>
            Reuniões das outras contas bloqueiam esta agenda
            <span style={{ display: "block", fontSize: 10, color: "var(--text-4)" }}>
              Deixe ligado quando a mesma pessoa atende as duas contas. Só vale com o feed cadastrado nesta conta.
            </span>
          </span>
        </label>
      )}
      {!integ.env.icsToken && (
        <p style={{ fontSize: 11, color: "#C9953A", margin: 0 }}>Falta REUNIOES_ICS_TOKEN no servidor (24+ caracteres aleatórios).</p>
      )}
      {souAdmin && (
        <div>
          <button
            type="button"
            className="no-ds"
            disabled={pendente || !pronto}
            style={estiloBotao(integ.feedIcsConectado ? "neutro" : "principal", pendente || !pronto)}
            onClick={() => rodar(() => conectarFeedIcsAction(integ.chave))}
          >
            {integ.feedIcsConectado ? "Cadastrar de novo" : "Cadastrar feed no Cal.com"}
          </button>
        </div>
      )}
      <Mensagem r={resultado} />
    </div>
  )
}
