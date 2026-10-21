"use client"

import { useState } from "react"
import {
  criarEventTypeNoCalcomAction,
  criarTipoAction,
  publicarTipoAction,
  salvarTipoAction,
  vincularEventTypeAction,
} from "@/lib/reunioes-actions"
import type { EventTypeExterno, TipoTela } from "@/lib/reunioes-tipos"
import { urlSegura } from "@/lib/reunioes-nucleo"
import { BotaoCopiar, Cartao, estiloBotao, estiloCampo, Mensagem, Rotulo, useAcao } from "./ui"

type Opcao = { id: string; nome: string }

const ROTULO_LOCAL: Record<TipoTela["local"], string> = {
  cal_video: "Cal Video",
  google_meet: "Google Meet",
  definido_no_calcom: "Definido no Cal.com",
}

export default function TiposReuniao(props: {
  tipos: TipoTela[]
  disponibilidades: Opcao[]
  usuarios: Opcao[]
  contextos: Opcao[]
  eventTypes: EventTypeExterno[] | null
  eventTypesErro: string | null
  calcomPronto: boolean
  souAdmin: boolean
}) {
  const { tipos, souAdmin } = props
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!souAdmin && (
        <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>
          Só administradores alteram tipos de reunião. Você pode copiar os links.
        </p>
      )}
      {souAdmin && props.eventTypesErro && (
        <p style={{ fontSize: 11, color: "#e24b4a", margin: 0 }}>
          Não consegui listar os eventos do Cal.com: {props.eventTypesErro}
        </p>
      )}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))" }}>
        {tipos.map((t) => (
          <CartaoTipo key={t.id} tipo={t} {...props} />
        ))}
      </div>
      {souAdmin && <NovoTipo />}
    </div>
  )
}

function CartaoTipo({
  tipo,
  disponibilidades,
  usuarios,
  contextos,
  eventTypes,
  calcomPronto,
  souAdmin,
}: {
  tipo: TipoTela
  disponibilidades: Opcao[]
  usuarios: Opcao[]
  contextos: Opcao[]
  eventTypes: EventTypeExterno[] | null
  calcomPronto: boolean
  souAdmin: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [eventoEscolhido, setEventoEscolhido] = useState<string>(tipo.calcom_event_type_id ? String(tipo.calcom_event_type_id) : "")
  const { pendente, resultado, rodar } = useAcao()
  const link = urlSegura(tipo.link_publico)
  const disp = disponibilidades.find((d) => d.id === tipo.disponibilidade_id)
  const resp = usuarios.find((u) => u.id === tipo.responsavel_id)

  const publicado = Boolean(tipo.calcom_event_type_id) && !tipo.ultimo_erro

  return (
    <Cartao
      titulo={tipo.nome}
      subtitulo={`${tipo.duracao_min} min · ${tipo.campanha_rotulo ?? tipo.origem_comercial} · ${tipo.ativo ? "ativo" : "inativo"}`}
      acoes={
        souAdmin ? (
          <button type="button" className="no-ds" style={estiloBotao("neutro")} onClick={() => setEditando((v) => !v)}>
            {editando ? "Fechar" : "Configurar"}
          </button>
        ) : undefined
      }
    >
      {tipo.descricao && <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>{tipo.descricao}</p>}

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 12, margin: 0 }}>
        <dt style={{ color: "var(--text-4)" }}>Responsável</dt>
        <dd style={{ margin: 0, color: resp ? "var(--text-1)" : "#C9953A" }}>{resp?.nome ?? "Não definido (configure)"}</dd>
        <dt style={{ color: "var(--text-4)" }}>Disponibilidade</dt>
        <dd style={{ margin: 0, color: "var(--text-1)" }}>{disp?.nome ?? "—"}</dd>
        <dt style={{ color: "var(--text-4)" }}>Regras</dt>
        <dd style={{ margin: 0, color: "var(--text-2)" }}>
          antecedência {tipo.antecedencia_min_horas} h · intervalo {tipo.intervalo_min} min ·{" "}
          {tipo.limite_diario ? `até ${tipo.limite_diario}/dia` : "sem limite diário"} · {tipo.horizonte_dias} dias à frente · {ROTULO_LOCAL[tipo.local]}
        </dd>
        <dt style={{ color: "var(--text-4)" }}>Cal.com</dt>
        <dd style={{ margin: 0, color: publicado ? "#5da283" : tipo.ultimo_erro ? "#e24b4a" : "#C9953A" }}>
          {!tipo.calcom_event_type_id
            ? "Sem evento associado — não publicado"
            : tipo.ultimo_erro
              ? `Erro: ${tipo.ultimo_erro}`
              : `Publicado${tipo.ultima_sincronizacao_em ? ` em ${new Date(tipo.ultima_sincronizacao_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}`}
        </dd>
      </dl>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {link ? (
          <>
            <code style={{ fontSize: 11, color: "var(--text-2)", wordBreak: "break-all", flex: "1 1 200px" }}>{link}</code>
            <BotaoCopiar texto={link} />
            <a href={link} target="_blank" rel="noopener noreferrer" style={{ ...estiloBotao("neutro"), textDecoration: "none" }}>
              Abrir
            </a>
          </>
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-4)" }}>
            Link público aparece aqui depois que o tipo for associado a um evento real do Cal.com.
          </span>
        )}
      </div>

      {souAdmin && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
          {!calcomPronto ? (
            <span style={{ fontSize: 11, color: "var(--text-4)" }}>
              Conecte o Cal.com (aba Integrações) para associar ou criar o evento.
            </span>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {eventTypes && (
                <select
                  value={eventoEscolhido}
                  onChange={(e) => setEventoEscolhido(e.target.value)}
                  className="glass-input"
                  style={{ ...estiloCampo, flex: "1 1 200px" }}
                  aria-label="Evento do Cal.com"
                  disabled={pendente}
                >
                  <option value="" style={{ color: "#111" }}>— evento do Cal.com —</option>
                  {eventTypes.map((e) => (
                    <option key={e.id} value={e.id} style={{ color: "#111" }}>
                      {e.title} ({e.lengthInMinutes} min) · /{e.slug}
                    </option>
                  ))}
                </select>
              )}
              {eventTypes && (
                <button
                  type="button"
                  className="no-ds"
                  disabled={pendente || eventoEscolhido === "" || eventoEscolhido === String(tipo.calcom_event_type_id ?? "")}
                  style={estiloBotao("neutro", pendente || eventoEscolhido === "")}
                  onClick={() => rodar(() => vincularEventTypeAction(tipo.id, Number(eventoEscolhido)))}
                >
                  Associar
                </button>
              )}
              {!tipo.calcom_event_type_id && (
                <button type="button" className="no-ds" disabled={pendente} style={estiloBotao("principal", pendente)} onClick={() => rodar(() => criarEventTypeNoCalcomAction(tipo.id))}>
                  Criar evento no Cal.com
                </button>
              )}
              {tipo.calcom_event_type_id && (
                <>
                  <button type="button" className="no-ds" disabled={pendente} style={estiloBotao("neutro", pendente)} onClick={() => rodar(() => publicarTipoAction(tipo.id))}>
                    Publicar regras
                  </button>
                  <button type="button" className="no-ds" disabled={pendente} style={estiloBotao("perigo", pendente)} onClick={() => rodar(() => vincularEventTypeAction(tipo.id, null))}>
                    Desassociar
                  </button>
                </>
              )}
            </div>
          )}
          <Mensagem r={resultado} />
        </div>
      )}

      {souAdmin && editando && (
        <FormTipo tipo={tipo} disponibilidades={disponibilidades} usuarios={usuarios} contextos={contextos} />
      )}
    </Cartao>
  )
}

function FormTipo({ tipo, disponibilidades, usuarios, contextos }: { tipo: TipoTela; disponibilidades: Opcao[]; usuarios: Opcao[]; contextos: Opcao[] }) {
  const { pendente, resultado, rodar } = useAcao()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set("id", tipo.id)
        rodar(() => salvarTipoAction(fd))
      }}
      style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}
    >
      <Rotulo texto="Nome *">
        <input name="nome" required maxLength={120} defaultValue={tipo.nome} className="glass-input" style={estiloCampo} />
      </Rotulo>
      <Rotulo texto="Campanha">
        <input name="campanha_rotulo" maxLength={120} defaultValue={tipo.campanha_rotulo ?? ""} className="glass-input" style={estiloCampo} />
      </Rotulo>
      <div style={{ gridColumn: "1 / -1" }}>
        <Rotulo texto="Descrição (aparece na página pública)">
          <textarea name="descricao" maxLength={1000} rows={3} defaultValue={tipo.descricao ?? ""} className="glass-input" style={{ ...estiloCampo, resize: "vertical" }} />
        </Rotulo>
      </div>
      <Rotulo texto="Duração (min) *">
        <input name="duracao_min" type="number" min={5} max={480} required defaultValue={tipo.duracao_min} className="glass-input" style={estiloCampo} />
      </Rotulo>
      <Rotulo texto="Antecedência mínima (h)">
        <input name="antecedencia_min_horas" type="number" min={0} max={720} required defaultValue={tipo.antecedencia_min_horas} className="glass-input" style={estiloCampo} />
      </Rotulo>
      <Rotulo texto="Intervalo após (min)">
        <input name="intervalo_min" type="number" min={0} max={240} required defaultValue={tipo.intervalo_min} className="glass-input" style={estiloCampo} />
      </Rotulo>
      <Rotulo texto="Limite por dia" dica="Vazio = sem limite. Vale por tipo.">
        <input name="limite_diario" type="number" min={1} max={50} defaultValue={tipo.limite_diario ?? ""} className="glass-input" style={estiloCampo} />
      </Rotulo>
      <Rotulo texto="Horizonte (dias)">
        <input name="horizonte_dias" type="number" min={1} max={365} required defaultValue={tipo.horizonte_dias} className="glass-input" style={estiloCampo} />
      </Rotulo>
      <Rotulo texto="Local">
        <select name="local" defaultValue={tipo.local} className="glass-input" style={estiloCampo}>
          <option value="cal_video" style={{ color: "#111" }}>Cal Video</option>
          <option value="google_meet" style={{ color: "#111" }}>Google Meet (exige app instalado)</option>
          <option value="definido_no_calcom" style={{ color: "#111" }}>Não mexer (definido no Cal.com)</option>
        </select>
      </Rotulo>
      <Rotulo texto="Responsável">
        <select name="responsavel_id" defaultValue={tipo.responsavel_id ?? ""} className="glass-input" style={estiloCampo}>
          <option value="" style={{ color: "#111" }}>— escolher —</option>
          {usuarios.map((u) => <option key={u.id} value={u.id} style={{ color: "#111" }}>{u.nome}</option>)}
        </select>
      </Rotulo>
      <Rotulo texto="Disponibilidade">
        <select name="disponibilidade_id" defaultValue={tipo.disponibilidade_id ?? ""} className="glass-input" style={estiloCampo}>
          <option value="" style={{ color: "#111" }}>Padrão da conta</option>
          {disponibilidades.map((d) => <option key={d.id} value={d.id} style={{ color: "#111" }}>{d.nome}</option>)}
        </select>
      </Rotulo>
      <Rotulo texto="Projeto da tarefa" dica="Onde a tarefa da reunião entra (opcional).">
        <select name="contexto_id" defaultValue={tipo.contexto_id ?? ""} className="glass-input" style={estiloCampo}>
          <option value="" style={{ color: "#111" }}>Nenhum</option>
          {contextos.map((c) => <option key={c.id} value={c.id} style={{ color: "#111" }}>{c.nome}</option>)}
        </select>
      </Rotulo>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--text-2)" }}>
        <input type="checkbox" name="ativo" value="1" defaultChecked={tipo.ativo} /> Ativo (página pública visível)
      </label>
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="no-ds" disabled={pendente} style={estiloBotao("principal", pendente)}>
          {pendente ? "Salvando…" : "Salvar e publicar"}
        </button>
        <Mensagem r={resultado} />
      </div>
    </form>
  )
}

function NovoTipo() {
  const [aberto, setAberto] = useState(false)
  const { pendente, resultado, rodar } = useAcao()
  if (!aberto) {
    return (
      <div>
        <button type="button" className="no-ds" style={estiloBotao("neutro")} onClick={() => setAberto(true)}>
          + Novo tipo de reunião
        </button>
      </div>
    )
  }
  return (
    <Cartao titulo="Novo tipo de reunião" subtitulo="Depois de criar, associe ou crie o evento correspondente no Cal.com.">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          rodar(() => criarTipoAction(fd))
        }}
        style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
      >
        <Rotulo texto="Nome *">
          <input name="nome" required maxLength={120} className="glass-input" style={estiloCampo} />
        </Rotulo>
        <Rotulo texto="Origem comercial *" dica="ex.: trafego_pago (letras, números e _)">
          <input name="origem_comercial" required maxLength={60} pattern="[a-z0-9_]{2,60}" className="glass-input" style={estiloCampo} />
        </Rotulo>
        <Rotulo texto="Duração (min)">
          <input name="duracao_min" type="number" min={5} max={480} defaultValue={30} className="glass-input" style={estiloCampo} />
        </Rotulo>
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="submit" className="no-ds" disabled={pendente} style={estiloBotao("principal", pendente)}>Criar</button>
          <button type="button" className="no-ds" style={estiloBotao("neutro")} onClick={() => setAberto(false)}>Cancelar</button>
          <Mensagem r={resultado} />
        </div>
      </form>
    </Cartao>
  )
}
