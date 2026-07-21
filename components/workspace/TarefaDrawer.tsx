"use client"

import { useState, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  alternarConclusaoAction,
  arquivarTarefaAction,
  atualizarTarefaAction,
  comentarAction,
  criarTarefaAction,
  desvincularContextoAction,
  duplicarTarefaAction,
  excluirTarefaAction,
  restaurarTarefaAction,
  excluirDefinitivoAction,
  vincularContextoAction,
} from "@/lib/workspace-actions"
import {
  corDoContexto,
  type Comentario,
  type Contexto,
  type EventoAtividade,
  type Tarefa,
  type TarefaComRelacoes,
} from "@/lib/workspace-tipos"
import { formatarDataBR, rotuloPrazo, situacaoPrazo } from "@/lib/workspace-datas"
import DescricaoRica from "./DescricaoRica"

interface Props {
  tarefa: TarefaComRelacoes
  subtarefas: Tarefa[]
  comentarios: Comentario[]
  atividade: EventoAtividade[]
  contextos: Contexto[]
  usuarios: { id: string; nome: string }[]
  hoje: string
  souAdmin: boolean
}

/**
 * Painel de detalhe. Desktop: drawer lateral; mobile: tela cheia (a media
 * query vive em globals.css via .ws-drawer).
 *
 * Fechar é navegação — remove ?tarefa da URL e mantém filtros, página e mês
 * intactos. Nada de estado de client escondido que se perde no refresh.
 *
 * Salvamento: campo a campo, com feedback imediato. Nenhum "salvo!" aparece
 * antes do OK do Supabase; erro reverte e fica visível.
 */
export default function TarefaDrawer(props: Props) {
  const { tarefa, subtarefas, comentarios, atividade, contextos, usuarios, hoje, souAdmin } = props
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  const [titulo, setTitulo] = useState(tarefa.titulo)
  const [descricao, setDescricao] = useState(tarefa.descricao ?? "")
  const [editandoDescricao, setEditandoDescricao] = useState(false)
  const [novoComentario, setNovoComentario] = useState("")
  const [novaSubtarefa, setNovaSubtarefa] = useState("")
  const [confirmarApagar, setConfirmarApagar] = useState("")

  const concluida = Boolean(tarefa.concluida_em)
  const naLixeira = Boolean(tarefa.excluida_em)

  function fechar() {
    const qs = new URLSearchParams(searchParams.toString())
    qs.delete("tarefa")
    const s = qs.toString()
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false })
  }

  /** Executa uma action e trata erro/refresh de forma uniforme. */
  function executar(
    fn: (fd: FormData) => Promise<{ ok: boolean; erro?: string }>,
    fd: FormData,
    aoConcluir?: () => void
  ) {
    setErro(null)
    setSalvo(false)
    startTransition(async () => {
      const r = await fn(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível salvar.")
        return
      }
      setSalvo(true)
      aoConcluir?.()
      router.refresh()
    })
  }

  function salvarCampo(campo: string, valor: string, comVersao = false) {
    const fd = new FormData()
    fd.set("id", tarefa.id)
    fd.set(campo, valor)
    // Só título e descrição levam a trava de versão — ver comentário na action.
    if (comVersao) fd.set("versao", String(tarefa.versao))
    executar(atualizarTarefaAction, fd)
  }

  const contextosDisponiveis = contextos.filter(
    (c) => !tarefa.contextos.some((tc) => tc.id === c.id)
  )

  return (
    <>
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar detalhes"
        className="ws-drawer-backdrop no-ds"
      />
      <aside className="ws-drawer glass" aria-label="Detalhes da tarefa">
        {/* ---------- Cabeçalho ---------- */}
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "0.5px solid rgba(255,255,255,0.07)",
            position: "sticky",
            top: 0,
            background: "var(--surface-1)",
            zIndex: 2,
          }}
        >
          <button
            type="button"
            onClick={() => {
              const fd = new FormData()
              fd.set("id", tarefa.id)
              fd.set("concluir", concluida ? "0" : "1")
              executar(alternarConclusaoAction, fd)
            }}
            disabled={pending}
            aria-label={concluida ? "Reabrir tarefa" : "Concluir tarefa"}
            className="no-ds"
            style={{
              flexShrink: 0,
              width: 20,
              height: 20,
              marginTop: 3,
              borderRadius: 6,
              border: `1.5px solid ${concluida ? "var(--accent)" : "var(--text-4)"}`,
              background: concluida ? "var(--accent)" : "transparent",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            {concluida && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          <textarea
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => {
              if (titulo.trim() && titulo !== tarefa.titulo) {
                salvarCampo("titulo", titulo.trim(), true)
              } else if (!titulo.trim()) {
                setTitulo(tarefa.titulo) // não deixa salvar vazio
              }
            }}
            rows={1}
            maxLength={300}
            className="no-ds"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.35,
              color: "var(--text-1)",
              background: "transparent",
              border: "none",
              resize: "none",
              padding: 0,
              fontFamily: "inherit",
              textDecoration: concluida ? "line-through" : "none",
            }}
          />

          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="no-ds"
            style={{
              flexShrink: 0,
              background: "transparent",
              border: "none",
              color: "var(--text-3)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 2,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
          {(erro || salvo || pending) && (
            <p
              role="status"
              style={{
                fontSize: 11,
                margin: 0,
                color: erro ? "#e24b4a" : pending ? "var(--text-4)" : "#4caf50",
              }}
            >
              {erro ?? (pending ? "Salvando…" : "Salvo")}
            </p>
          )}

          {naLixeira && (
            <div
              style={{
                fontSize: 11,
                color: "#e0a458",
                background: "rgba(224,164,88,0.1)",
                padding: "8px 10px",
                borderRadius: 8,
              }}
            >
              Esta tarefa está na lixeira. Ela continua no banco e pode ser restaurada.
            </div>
          )}

          {/* ---------- Campos ---------- */}
          <section style={{ display: "grid", gap: 10 }}>
            <Campo rotulo="Responsável">
              <select
                value={tarefa.responsavel_id ?? ""}
                onChange={(e) => salvarCampo("responsavel_id", e.target.value)}
                disabled={pending}
                className="glass-input"
                style={campoStyle}
              >
                <option value="" style={{ color: "#111" }}>Sem responsável</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id} style={{ color: "#111" }}>{u.nome}</option>
                ))}
              </select>
            </Campo>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Campo rotulo="Prazo">
                {/* key força remontar quando o servidor devolve um valor novo
                    (ex: alguém arrastou a tarefa no calendário enquanto este
                    painel estava aberto). Sem isso, defaultValue só valeria na
                    primeira renderização e o campo mostraria o prazo antigo. */}
                <input
                  key={`prazo-${tarefa.prazo_em ?? ""}`}
                  type="date"
                  defaultValue={tarefa.prazo_em ?? ""}
                  onChange={(e) => salvarCampo("prazo_em", e.target.value)}
                  disabled={pending}
                  className="glass-input"
                  style={campoStyle}
                />
              </Campo>
              <Campo rotulo="Horário">
                <input
                  key={`hora-${tarefa.prazo_hora ?? ""}`}
                  type="time"
                  defaultValue={tarefa.prazo_hora?.slice(0, 5) ?? ""}
                  onChange={(e) => salvarCampo("prazo_hora", e.target.value)}
                  disabled={pending || !tarefa.prazo_em}
                  className="glass-input"
                  style={campoStyle}
                />
              </Campo>
              <Campo rotulo="Prioridade">
                <select
                  value={tarefa.prioridade}
                  onChange={(e) => salvarCampo("prioridade", e.target.value)}
                  disabled={pending}
                  className="glass-input"
                  style={campoStyle}
                >
                  <option value="baixa" style={{ color: "#111" }}>Baixa</option>
                  <option value="normal" style={{ color: "#111" }}>Normal</option>
                  <option value="alta" style={{ color: "#111" }}>Alta</option>
                </select>
              </Campo>
            </div>

            {tarefa.prazo_em && (
              <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>
                {formatarDataBR(tarefa.prazo_em)} ·{" "}
                <span
                  style={{
                    color:
                      situacaoPrazo(tarefa.prazo_em, hoje) === "atrasada" && !concluida
                        ? "#e24b4a"
                        : "var(--text-4)",
                  }}
                >
                  {rotuloPrazo(tarefa.prazo_em, hoje)}
                </span>
              </p>
            )}
          </section>

          {/* ---------- Contextos ---------- */}
          <Secao titulo="Contextos">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {tarefa.contextos.map((c) => (
                <span
                  key={c.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "var(--surface-3)",
                    color: "var(--text-2)",
                  }}
                >
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: corDoContexto(c) }} />
                  {c.nome}
                  <button
                    type="button"
                    aria-label={`Remover de ${c.nome}`}
                    title={`Remover de ${c.nome} (a tarefa continua existindo)`}
                    disabled={pending}
                    onClick={() => {
                      const fd = new FormData()
                      fd.set("tarefa_id", tarefa.id)
                      fd.set("contexto_id", c.id)
                      executar(desvincularContextoAction, fd)
                    }}
                    className="no-ds"
                    style={{ background: "none", border: "none", color: "var(--text-4)", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}

              {contextosDisponiveis.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return
                    const fd = new FormData()
                    fd.set("tarefa_id", tarefa.id)
                    fd.set("contexto_id", e.target.value)
                    executar(vincularContextoAction, fd)
                  }}
                  disabled={pending}
                  className="glass-input"
                  style={{ ...campoStyle, minWidth: 120 }}
                >
                  <option value="" style={{ color: "#111" }}>+ Vincular…</option>
                  {contextosDisponiveis.map((c) => (
                    <option key={c.id} value={c.id} style={{ color: "#111" }}>{c.nome}</option>
                  ))}
                </select>
              )}
            </div>
            <p style={{ fontSize: 10, color: "var(--text-4)", margin: "6px 0 0" }}>
              Remover de um contexto apaga só o vínculo — a tarefa continua nos outros.
            </p>
          </Secao>

          {/* ---------- Descrição ---------- */}
          <Secao titulo="Descrição">
            {editandoDescricao ? (
              <>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={6}
                  maxLength={20000}
                  placeholder="**negrito**, - listas, e links https://… viram clicáveis"
                  className="glass-input"
                  style={{ ...campoStyle, width: "100%", resize: "vertical", lineHeight: 1.5 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      salvarCampo("descricao", descricao, true)
                      setEditandoDescricao(false)
                    }}
                    className="btn-gold-filled"
                    style={{ fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 8 }}
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDescricao(tarefa.descricao ?? "")
                      setEditandoDescricao(false)
                    }}
                    className="no-ds"
                    style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditandoDescricao(true)}
                className="no-ds"
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "text",
                  color: "inherit",
                }}
              >
                {tarefa.descricao ? (
                  <DescricaoRica texto={tarefa.descricao} />
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-4)" }}>
                    Clique para adicionar uma descrição…
                  </span>
                )}
              </button>
            )}
          </Secao>

          {/* ---------- Subtarefas ---------- */}
          <Secao
            titulo={
              subtarefas.length > 0
                ? `Subtarefas · ${subtarefas.filter((s) => s.concluida_em).length}/${subtarefas.length}`
                : "Subtarefas"
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {subtarefas.map((s) => (
                <LinhaSubtarefa key={s.id} subtarefa={s} pendingPai={pending} onMudou={() => router.refresh()} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                type="text"
                value={novaSubtarefa}
                onChange={(e) => setNovaSubtarefa(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  e.preventDefault()
                  const t = novaSubtarefa.trim()
                  if (!t) return
                  const fd = new FormData()
                  fd.set("titulo", t)
                  fd.set("tarefa_pai_id", tarefa.id)
                  executar(criarTarefaAction, fd, () => setNovaSubtarefa(""))
                }}
                placeholder="Nova subtarefa… (Enter)"
                className="glass-input"
                style={{ ...campoStyle, flex: 1 }}
                disabled={pending}
                maxLength={300}
              />
            </div>
          </Secao>

          {/* ---------- Comentários ---------- */}
          <Secao titulo={`Comentários${comentarios.length ? ` · ${comentarios.length}` : ""}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {comentarios.map((c) => (
                <div key={c.id}>
                  <p style={{ fontSize: 10, color: "var(--text-4)", margin: "0 0 2px" }}>
                    {c.autor_nome ?? "—"} · {new Date(c.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <DescricaoRica texto={c.corpo} />
                </div>
              ))}
              {comentarios.length === 0 && (
                <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>
                  Nenhum comentário ainda.
                </p>
              )}
            </div>
            <textarea
              value={novoComentario}
              onChange={(e) => setNovoComentario(e.target.value)}
              rows={2}
              maxLength={10000}
              placeholder="Escreva um comentário… use @nome para mencionar"
              className="glass-input"
              style={{ ...campoStyle, width: "100%", marginTop: 8, resize: "vertical" }}
              disabled={pending}
            />
            <button
              type="button"
              disabled={pending || novoComentario.trim() === ""}
              onClick={() => {
                const fd = new FormData()
                fd.set("tarefa_id", tarefa.id)
                fd.set("corpo", novoComentario.trim())
                executar(comentarAction, fd, () => setNovoComentario(""))
              }}
              className="btn-gold-outline"
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "6px 14px",
                borderRadius: 8,
                marginTop: 6,
                opacity: novoComentario.trim() === "" ? 0.5 : 1,
              }}
            >
              Comentar
            </button>
          </Secao>

          {/* ---------- Histórico ---------- */}
          <Secao titulo="Histórico">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {atividade.map((e) => (
                <p key={e.id} style={{ fontSize: 10, color: "var(--text-4)", margin: 0 }}>
                  {new Date(e.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {e.ator_nome ?? "—"} {rotuloEvento(e.evento)}
                </p>
              ))}
              {atividade.length === 0 && (
                <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Sem eventos.</p>
              )}
            </div>
          </Secao>

          {/* ---------- Ações ---------- */}
          <Secao titulo="Ações">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <BotaoAcao
                texto="Duplicar"
                disabled={pending}
                onClick={() => {
                  const fd = new FormData()
                  fd.set("id", tarefa.id)
                  fd.set("manter_descricao", "on")
                  fd.set("manter_vinculos", "on")
                  fd.set("manter_responsavel", "on")
                  fd.set("manter_subtarefas", "on")
                  executar(duplicarTarefaAction, fd)
                }}
              />
              {!naLixeira && (
                <BotaoAcao
                  texto={tarefa.arquivada_em ? "Desarquivar" : "Arquivar"}
                  disabled={pending}
                  onClick={() => {
                    const fd = new FormData()
                    fd.set("id", tarefa.id)
                    fd.set("arquivar", tarefa.arquivada_em ? "0" : "1")
                    executar(arquivarTarefaAction, fd)
                  }}
                />
              )}
              {naLixeira ? (
                <BotaoAcao
                  texto="Restaurar"
                  disabled={pending}
                  onClick={() => {
                    const fd = new FormData()
                    fd.set("id", tarefa.id)
                    executar(restaurarTarefaAction, fd)
                  }}
                />
              ) : (
                <BotaoAcao
                  texto="Mover para lixeira"
                  perigo
                  disabled={pending}
                  onClick={() => {
                    const fd = new FormData()
                    fd.set("id", tarefa.id)
                    executar(excluirTarefaAction, fd, fechar)
                  }}
                />
              )}
            </div>

            {naLixeira && souAdmin && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid rgba(226,75,74,0.25)" }}>
                <p style={{ fontSize: 11, color: "#e24b4a", margin: "0 0 6px" }}>
                  Apagar de vez remove a tarefa, os comentários e o histórico. Não tem
                  desfazer. Digite o título exato para liberar.
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={confirmarApagar}
                    onChange={(e) => setConfirmarApagar(e.target.value)}
                    placeholder={tarefa.titulo}
                    className="glass-input"
                    style={{ ...campoStyle, flex: "1 1 180px" }}
                  />
                  <BotaoAcao
                    texto="Apagar de vez"
                    perigo
                    disabled={pending || confirmarApagar.trim() !== tarefa.titulo}
                    onClick={() => {
                      const fd = new FormData()
                      fd.set("id", tarefa.id)
                      executar(excluirDefinitivoAction, fd, fechar)
                    }}
                  />
                </div>
              </div>
            )}
          </Secao>
        </div>
      </aside>
    </>
  )
}

/* =================== Subcomponentes =================== */

const campoStyle = {
  fontSize: 12,
  padding: "7px 10px",
  borderRadius: 8,
  minWidth: 120,
} as const

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {rotulo}
      </span>
      {children}
    </label>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3
        className="ds-label"
        style={{ fontSize: 10, color: "var(--text-3)", margin: "0 0 8px", fontWeight: 700 }}
      >
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function BotaoAcao({
  texto,
  onClick,
  disabled,
  perigo,
}: {
  texto: string
  onClick: () => void
  disabled?: boolean
  perigo?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="no-ds"
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "7px 12px",
        borderRadius: 8,
        border: `1px solid ${perigo ? "rgba(226,75,74,0.4)" : "rgba(255,255,255,0.12)"}`,
        background: "transparent",
        color: perigo ? "#e24b4a" : "var(--text-2)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {texto}
    </button>
  )
}

function LinhaSubtarefa({
  subtarefa,
  pendingPai,
  onMudou,
}: {
  subtarefa: Tarefa
  pendingPai: boolean
  onMudou: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [concluida, setConcluida] = useState(Boolean(subtarefa.concluida_em))
  const [erro, setErro] = useState<string | null>(null)

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        disabled={pending || pendingPai}
        aria-label={concluida ? "Reabrir subtarefa" : "Concluir subtarefa"}
        onClick={() => {
          const alvo = !concluida
          setConcluida(alvo)
          setErro(null)
          startTransition(async () => {
            const fd = new FormData()
            fd.set("id", subtarefa.id)
            fd.set("concluir", alvo ? "1" : "0")
            const r = await alternarConclusaoAction(fd)
            if (!r.ok) {
              setConcluida(!alvo)
              setErro(r.erro ?? "Falhou")
              return
            }
            onMudou()
          })
        }}
        className="no-ds"
        style={{
          flexShrink: 0,
          width: 15,
          height: 15,
          borderRadius: 4,
          border: `1.5px solid ${concluida ? "var(--accent)" : "var(--text-4)"}`,
          background: concluida ? "var(--accent)" : "transparent",
          cursor: "pointer",
          padding: 0,
        }}
      />
      <span
        style={{
          fontSize: 12,
          color: concluida ? "var(--text-4)" : "var(--text-2)",
          textDecoration: concluida ? "line-through" : "none",
        }}
      >
        {subtarefa.titulo}
      </span>
      {erro && <span style={{ fontSize: 10, color: "#e24b4a" }}>{erro}</span>}
    </div>
  )
}

function rotuloEvento(evento: string): string {
  switch (evento) {
    case "criada": return "criou a tarefa"
    case "titulo": return "mudou o título"
    case "descricao": return "editou a descrição"
    case "responsavel": return "trocou o responsável"
    case "prazo": return "mudou o prazo"
    case "prioridade": return "mudou a prioridade"
    case "concluida": return "concluiu"
    case "reaberta": return "reabriu"
    case "vinculo_add": return "vinculou a um contexto"
    case "vinculo_rm": return "removeu de um contexto"
    case "arquivada": return "arquivou"
    case "restaurada": return "restaurou"
    case "excluida": return "mandou para a lixeira"
    case "comentario": return "comentou"
    default: return evento
  }
}
