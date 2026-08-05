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
  editarComentarioAction,
  excluirComentarioAction,
  excluirTarefaAction,
  restaurarTarefaAction,
  excluirDefinitivoAction,
  vincularContextoAction,
} from "@/lib/workspace-actions"
import {
  recorrenciaValida,
  rotuloRecorrencia,
  type Comentario,
  type Contexto,
  type EventoAtividade,
  type FreqRecorrencia,
  type Recorrencia,
  type Tarefa,
  type TarefaComRelacoes,
} from "@/lib/workspace-tipos"
import { formatarDataBR, rotuloPrazo, situacaoPrazo } from "@/lib/workspace-datas"
import DescricaoRica from "./DescricaoRica"
import Avatar from "./Avatar"
import SeletorBusca, { type OpcaoBusca } from "./SeletorBusca"

interface Props {
  tarefa: TarefaComRelacoes
  subtarefas: Tarefa[]
  comentarios: Comentario[]
  atividade: EventoAtividade[]
  contextos: Contexto[]
  usuarios: { id: string; nome: string; email?: string; foto_url?: string | null }[]
  hoje: string
  souAdmin: boolean
  /** Id do usuário logado — decide quem vê "Editar"/"Apagar" no comentário.
   *  A permissão real é checada de novo na server action. */
  meuId: string | null
}

/** Verde do "Today/Completed" do Asana. */
const VERDE_ASANA = "#5da283"
const AZUL_ASANA = "#4573d2"

/**
 * Painel de detalhe no desenho do painel de tarefa do Asana (RefsAsana/):
 * barra com "Marcar concluída", título grande, campos com rótulo à esquerda
 * (Responsável com avatar, Data de entrega com rótulo verde "Hoje",
 * Projetos como chips coloridos), descrição, subtarefas com círculo de
 * conclusão e comentários com avatar + caixa "Adicionar um comentário" fixa
 * no rodapé.
 *
 * Fechar é navegação — remove ?tarefa da URL e mantém filtros, página e mês
 * intactos. Salvamento campo a campo: nenhum "salvo" aparece antes do OK do
 * Supabase; erro reverte e fica visível.
 */
export default function TarefaDrawer(props: Props) {
  const { tarefa, subtarefas, comentarios, atividade, contextos, usuarios, hoje, souAdmin, meuId } = props
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
  // Comentário aberto para edição (id) + o texto sendo editado. Um por vez.
  const [comentarioEditando, setComentarioEditando] = useState<string | null>(null)
  const [corpoEditado, setCorpoEditado] = useState("")
  const [novaSubtarefa, setNovaSubtarefa] = useState("")
  const [confirmarApagar, setConfirmarApagar] = useState("")
  const [mostrarHistorico, setMostrarHistorico] = useState(false)

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

  const contextosDisponiveis = contextos
    .filter((c) => c.tipo === "cliente" || c.tipo === "empresa")
    .filter((c) => !tarefa.contextos.some((tc) => tc.id === c.id))
    .sort(
      (a, b) =>
        (a.tipo === b.tipo ? 0 : a.tipo === "empresa" ? -1 : 1) ||
        a.nome.localeCompare(b.nome, "pt-BR")
    )

  // ---------- Opções dos seletores com busca ----------
  // O e-mail entra como `termos` (casa na busca, não polui a lista): quem tem
  // dois colegas de nome parecido acha pelo login.
  const opcoesResponsavel: OpcaoBusca[] = [
    {
      valor: "",
      rotulo: "Sem responsável",
      icone: <Avatar nome={null} tamanho={20} />,
    },
    ...usuarios.map((u) => ({
      valor: u.id,
      rotulo: u.nome,
      termos: u.email ?? "",
      icone: <Avatar nome={u.nome} foto={u.foto_url ?? null} tamanho={20} />,
    })),
  ]

  const opcoesProjeto: OpcaoBusca[] = contextosDisponiveis.map((c) => ({
    valor: c.id,
    rotulo: c.nome,
    detalhe: c.tipo === "empresa" ? "Empresa" : undefined,
    icone: <QuadradinhoCor cor={c.cor} />,
  }))

  const situacao = situacaoPrazo(tarefa.prazo_em, hoje)
  const corPrazo =
    situacao === "atrasada" && !concluida
      ? "#e24b4a"
      : situacao === "hoje" || situacao === "amanha"
        ? VERDE_ASANA
        : "var(--text-2)"

  return (
    <>
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar detalhes"
        className="ws-drawer-backdrop no-ds"
      />
      <aside className="ws-drawer" aria-label="Detalhes da tarefa">
        {/* ---------- Barra superior ----------
            VOLTAR à esquerda, CONCLUIR à direita: é a convenção de app —
            e no celular o canto superior direito é ocupado pelo sino e pelo
            menu, então a ação principal não pode morar embaixo deles. */}
        <header className="ws-drawer-topo">
          <button
            type="button"
            onClick={fechar}
            aria-label="Voltar"
            title="Voltar"
            className="no-ds ws-btn-icone"
            style={{ flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="20" y1="12" x2="4" y2="12" />
              <polyline points="11 19 4 12 11 5" />
            </svg>
          </button>

          {(erro || salvo || pending) && (
            <span
              role="status"
              style={{
                fontSize: 11,
                color: erro ? "#e24b4a" : pending ? "var(--text-4)" : VERDE_ASANA,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {erro ?? (pending ? "Salvando…" : "Salvo")}
            </span>
          )}

          <span style={{ flex: 1 }} />

          <button
            type="button"
            onClick={() => {
              const fd = new FormData()
              fd.set("id", tarefa.id)
              fd.set("concluir", concluida ? "0" : "1")
              executar(alternarConclusaoAction, fd)
            }}
            disabled={pending}
            className="no-ds"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 10px",
              borderRadius: 6,
              cursor: "pointer",
              flexShrink: 0,
              border: concluida ? `1px solid ${VERDE_ASANA}` : "1px solid rgba(255,255,255,0.25)",
              background: concluida ? "rgba(93,162,131,0.18)" : "transparent",
              color: concluida ? VERDE_ASANA : "var(--text-2)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {concluida ? "Concluída" : "Marcar concluída"}
          </button>
        </header>

        <div style={{ padding: "16px 24px 120px", display: "flex", flexDirection: "column", gap: 18 }}>
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

          {/* ---------- Título ---------- */}
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
            rows={2}
            maxLength={300}
            className="no-ds"
            style={{
              width: "100%",
              fontSize: 22,
              fontWeight: 600,
              lineHeight: 1.25,
              color: "var(--text-1)",
              background: "transparent",
              border: "none",
              resize: "none",
              padding: 0,
              fontFamily: "inherit",
            }}
          />

          {/* ---------- Campos (rótulo à esquerda, como no Asana) ---------- */}
          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CampoLinha rotulo="Responsável">
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Avatar nome={tarefa.responsavel_nome} foto={tarefa.responsavel_foto} tamanho={26} />
                <SeletorBusca
                  rotuloCampo="Responsável"
                  valor={tarefa.responsavel_id ?? ""}
                  opcoes={opcoesResponsavel}
                  onEscolher={(v) => salvarCampo("responsavel_id", v)}
                  // O avatar de 26px acima já mostra quem é: repetir o ícone
                  // dentro do gatilho colocava dois avatares em sequência.
                  iconeNoGatilho={false}
                  textoVazio="Sem responsável"
                  placeholderBusca="Pesquisar pessoa…"
                  textoNenhum="Ninguém com esse nome."
                  disabled={pending}
                />
              </div>
            </CampoLinha>

            <CampoLinha rotulo="Data de entrega">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <IconeCalendario cor={corPrazo} />
                {tarefa.prazo_em && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: corPrazo }}>
                    {rotuloPrazo(tarefa.prazo_em, hoje) === formatarDataBR(tarefa.prazo_em)
                      ? formatarDataBR(tarefa.prazo_em)
                      : rotuloPrazo(tarefa.prazo_em, hoje)}
                  </span>
                )}
                {/* key força remontar quando o servidor devolve um valor novo
                    (ex: alguém arrastou a tarefa no calendário enquanto este
                    painel estava aberto). */}
                <input
                  key={`prazo-${tarefa.prazo_em ?? ""}`}
                  type="date"
                  defaultValue={tarefa.prazo_em ?? ""}
                  onChange={(e) => salvarCampo("prazo_em", e.target.value)}
                  disabled={pending}
                  className="glass-input"
                  style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6 }}
                  aria-label="Data de entrega"
                />
                <input
                  key={`hora-${tarefa.prazo_hora ?? ""}`}
                  type="time"
                  defaultValue={tarefa.prazo_hora?.slice(0, 5) ?? ""}
                  onChange={(e) => salvarCampo("prazo_hora", e.target.value)}
                  disabled={pending || !tarefa.prazo_em}
                  className="glass-input"
                  style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6 }}
                  aria-label="Horário"
                />
              </div>
            </CampoLinha>

            <CampoLinha rotulo="Repetir">
              <CampoRepeticao
                recorrencia={recorrenciaValida(tarefa.recorrencia)}
                temPrazo={Boolean(tarefa.prazo_em)}
                disabled={pending}
                onSalvar={(rec) =>
                  salvarCampo("recorrencia", rec ? JSON.stringify(rec) : "")
                }
              />
            </CampoLinha>

            <CampoLinha rotulo="Prioridade">
              <select
                value={tarefa.prioridade}
                onChange={(e) => salvarCampo("prioridade", e.target.value)}
                disabled={pending}
                className="no-ds ws-select"
              >
                <option value="baixa" style={{ color: "#111" }}>Baixa</option>
                <option value="normal" style={{ color: "#111" }}>Normal</option>
                <option value="alta" style={{ color: "#111" }}>Alta</option>
              </select>
            </CampoLinha>

            {/* Projetos = contextos, com o quadradinho colorido do Asana */}
            <CampoLinha rotulo="Projetos">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {tarefa.contextos.map((c) => (
                  <span
                    key={c.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "var(--surface-3)",
                      color: "var(--text-1)",
                    }}
                  >
                    <QuadradinhoCor cor={c.cor} />
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
                  <SeletorBusca
                    rotuloCampo="Adicionar a um projeto"
                    // Sempre "vazio": este seletor é um comando de ADICIONAR, não
                    // o estado do campo — os projetos já vinculados são os chips
                    // acima. Depois de escolher, a lista some da opção (o
                    // servidor devolve a tarefa com o vínculo novo).
                    valor=""
                    opcoes={opcoesProjeto}
                    onEscolher={(v) => {
                      if (!v) return
                      const fd = new FormData()
                      fd.set("tarefa_id", tarefa.id)
                      fd.set("contexto_id", v)
                      executar(vincularContextoAction, fd)
                    }}
                    textoVazio="+ Adicionar a um projeto"
                    placeholderBusca="Pesquisar projeto…"
                    textoNenhum="Nenhum projeto com esse nome."
                    disabled={pending}
                  />
                )}
              </div>
            </CampoLinha>
          </section>

          {/* ---------- Descrição ---------- */}
          <section>
            <h3 style={rotuloSecao}>Descrição</h3>
            {editandoDescricao ? (
              <>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={6}
                  maxLength={20000}
                  autoFocus
                  placeholder="Sobre o que é esta tarefa?"
                  className="glass-input"
                  // borderRadius 10 = o mesmo da .ws-texto-box, pra a silhueta
                  // não mudar ao alternar entre ler e editar.
                  style={{ fontSize: 13, padding: "10px 12px", borderRadius: 10, width: "100%", resize: "vertical", lineHeight: 1.5 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      salvarCampo("descricao", descricao, true)
                      setEditandoDescricao(false)
                    }}
                    className="no-ds"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 14px",
                      borderRadius: 6,
                      background: AZUL_ASANA,
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                    }}
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
                    style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              // ANTES isto era um <button> envolvendo a descrição inteira, o
              // que dava dois problemas: (1) os links renderizados por
              // DescricaoRica ficavam DENTRO de um botão — HTML inválido — e
              // (2) clicar num link borbulhava pro onClick e abria o editor em
              // vez de abrir o link. Agora o texto é só texto, e editar é um
              // botão próprio.
              <div>
                {/* O placeholder fica DENTRO da caixa: assim o campo existe
                    visualmente mesmo vazio, que é o que dá o aspecto de
                    formulário em vez de texto solto no painel. */}
                <div className="ws-texto-box">
                  {tarefa.descricao ? (
                    <DescricaoRica texto={tarefa.descricao} />
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--text-4)" }}>
                      Sobre o que é esta tarefa?
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      // Recarrega do servidor: se outra pessoa editou enquanto
                      // o drawer estava aberto, o textarea abre com o texto
                      // atual, não com o que estava na tela.
                      setDescricao(tarefa.descricao ?? "")
                      setEditandoDescricao(true)
                    }}
                    className="ws-btn-editar no-ds"
                  >
                    ✎ {tarefa.descricao ? "Editar descrição" : "Adicionar descrição"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ---------- Subtarefas ---------- */}
          <section>
            <h3 style={rotuloSecao}>
              Subtarefas
              {subtarefas.length > 0 &&
                ` · ${subtarefas.filter((s) => s.concluida_em).length}/${subtarefas.length}`}
            </h3>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {subtarefas.map((s) => (
                <LinhaSubtarefa key={s.id} subtarefa={s} pendingPai={pending} onMudou={() => router.refresh()} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <CirculoCheck concluida={false} />
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
                placeholder="Adicionar subtarefa… (Enter)"
                className="no-ds"
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: "var(--text-1)",
                  background: "transparent",
                  border: "none",
                  padding: "6px 0",
                  fontFamily: "inherit",
                }}
                disabled={pending}
                maxLength={300}
              />
            </div>
          </section>

          {/* ---------- Ações ---------- */}
          <section>
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
                    style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, flex: "1 1 180px" }}
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
          </section>

          {/* ---------- Comentários + atividade ---------- */}
          <section
            style={{
              margin: "0 -24px",
              padding: "14px 24px 0",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <h3 style={{ ...rotuloSecao, margin: 0 }}>Comentários</h3>
              <button
                type="button"
                onClick={() => setMostrarHistorico((v) => !v)}
                className="no-ds"
                style={{
                  fontSize: 11,
                  color: mostrarHistorico ? "var(--text-1)" : "var(--text-4)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {mostrarHistorico ? "Ocultar atividade" : "Toda a atividade"}
              </button>
            </div>

            {mostrarHistorico && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                {atividade.map((e) => (
                  <p key={e.id} style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>
                    <strong style={{ color: "var(--text-3)", fontWeight: 600 }}>{e.ator_nome ?? "—"}</strong>{" "}
                    {rotuloEvento(e.evento)} ·{" "}
                    {new Date(e.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                ))}
                {atividade.length === 0 && (
                  <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Sem eventos.</p>
                )}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {comentarios.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 10 }}>
                  <Avatar nome={c.autor_nome} foto={c.autor_foto} tamanho={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, margin: "0 0 2px" }}>
                      <strong style={{ color: "var(--text-1)", fontWeight: 600 }}>
                        {c.autor_nome ?? "—"}
                      </strong>
                      {/* A conta saiu do sistema, mas o comentário fica. Sem
                          esta marca, o nome parece de alguém que ainda dá pra
                          acionar — e não dá. */}
                      {c.autor_removido && (
                        <span style={{ color: "var(--text-4)", fontSize: 11 }}>
                          {" "}(conta excluída)
                        </span>
                      )}{" "}
                      <span style={{ color: "var(--text-4)", fontSize: 11 }}>
                        {new Date(c.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {/* Marca de edição: sem ela, um comentário reescrito
                          passaria por original. Tolerância de 2s absorve o
                          updated_at que o trigger carimba junto do insert. */}
                      {new Date(c.updated_at).getTime() -
                        new Date(c.created_at).getTime() >
                        2000 && (
                        <span style={{ color: "var(--text-4)", fontSize: 11 }}>
                          {" "}(editado)
                        </span>
                      )}
                    </p>

                    {comentarioEditando === c.id ? (
                      <>
                        <textarea
                          value={corpoEditado}
                          onChange={(e) => setCorpoEditado(e.target.value)}
                          rows={4}
                          maxLength={10000}
                          autoFocus
                          className="glass-input"
                          // Mesmo raio/padding da .ws-texto-box — ler e editar
                          // com a mesma silhueta.
                          style={{ fontSize: 13, padding: "10px 12px", borderRadius: 10, width: "100%", resize: "vertical", lineHeight: 1.5 }}
                          disabled={pending}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                          <button
                            type="button"
                            disabled={pending || corpoEditado.trim() === ""}
                            onClick={() => {
                              const fd = new FormData()
                              fd.set("id", c.id)
                              fd.set("corpo", corpoEditado.trim())
                              executar(editarComentarioAction, fd, () =>
                                setComentarioEditando(null)
                              )
                            }}
                            className="no-ds"
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              padding: "5px 14px",
                              borderRadius: 6,
                              background: AZUL_ASANA,
                              color: "#fff",
                              border: "none",
                              cursor: corpoEditado.trim() === "" ? "default" : "pointer",
                              opacity: corpoEditado.trim() === "" ? 0.5 : 1,
                            }}
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setComentarioEditando(null)}
                            className="no-ds"
                            style={acaoComentario}
                          >
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Texto puro, FORA de qualquer <button>: clicar num
                            link abre o link e nada mais. Editar só pelo botão
                            abaixo. A caixa dá o aspecto de comentário e segura
                            o texto longo com scroll próprio. */}
                        <div className="ws-texto-box ws-texto-box--compacto">
                          <DescricaoRica texto={c.corpo} />
                        </div>
                        {(souAdmin || (meuId !== null && c.autor_id === meuId)) && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              marginTop: 7,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setComentarioEditando(c.id)
                                setCorpoEditado(c.corpo)
                              }}
                              className="ws-btn-editar no-ds"
                            >
                              ✎ Editar
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                if (!window.confirm("Apagar este comentário?")) return
                                const fd = new FormData()
                                fd.set("id", c.id)
                                executar(excluirComentarioAction, fd)
                              }}
                              className="no-ds"
                              style={acaoComentario}
                            >
                              Apagar
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {comentarios.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>
                  Nenhum comentário ainda.
                </p>
              )}
            </div>

            {/* Caixa de comentário, como o rodapé do Asana */}
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <textarea
                  value={novoComentario}
                  onChange={(e) => setNovoComentario(e.target.value)}
                  rows={2}
                  maxLength={10000}
                  placeholder="Adicionar um comentário"
                  className="glass-input"
                  style={{ fontSize: 13, padding: "10px 12px", borderRadius: 10, width: "100%", resize: "vertical", lineHeight: 1.5 }}
                  disabled={pending}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <button
                    type="button"
                    disabled={pending || novoComentario.trim() === ""}
                    onClick={() => {
                      const fd = new FormData()
                      fd.set("tarefa_id", tarefa.id)
                      fd.set("corpo", novoComentario.trim())
                      executar(comentarAction, fd, () => setNovoComentario(""))
                    }}
                    className="no-ds"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 16px",
                      borderRadius: 6,
                      background: AZUL_ASANA,
                      color: "#fff",
                      border: "none",
                      cursor: novoComentario.trim() === "" ? "default" : "pointer",
                      opacity: novoComentario.trim() === "" ? 0.5 : 1,
                    }}
                  >
                    Comentar
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  )
}

/* =================== Subcomponentes =================== */

const rotuloSecao = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-2)",
  margin: "0 0 8px",
} as const

/** Ações discretas do comentário (Editar / Apagar / Cancelar). */
const acaoComentario = {
  fontSize: 11.5,
  color: "var(--text-4)",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
} as const

/** Linha rótulo-à-esquerda / valor-à-direita, o layout de campos do Asana. */
function CampoLinha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          flex: "0 0 110px",
          fontSize: 12,
          color: "var(--text-3)",
        }}
      >
        {rotulo}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

/**
 * Quadradinho de cor do projeto — o mesmo marcador do Asana, usado no chip do
 * projeto vinculado e na lista do seletor de busca, pra que a cor que a pessoa
 * já associa ao cliente seja a mesma nos dois lugares.
 */
function QuadradinhoCor({ cor }: { cor: string | null | undefined }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 10,
        height: 10,
        borderRadius: 3,
        background: cor ?? "#6d6e6f",
        flexShrink: 0,
      }}
    />
  )
}

/**
 * Repetição no jeito do Asana: um rótulo clicável ("Não se repete" /
 * "Semanal: seg, qua") que abre o seletor — frequência + dias da semana.
 * Ao concluir a tarefa, a próxima ocorrência é criada automaticamente.
 */
function CampoRepeticao({
  recorrencia,
  temPrazo,
  disabled,
  onSalvar,
}: {
  recorrencia: Recorrencia | null
  temPrazo: boolean
  disabled: boolean
  onSalvar: (rec: Recorrencia | null) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [freq, setFreq] = useState<FreqRecorrencia | "nunca">(recorrencia?.freq ?? "nunca")
  const [dias, setDias] = useState<number[]>(recorrencia?.dias ?? [])

  const NOMES = ["D", "S", "T", "Q", "Q", "S", "S"]
  const NOMES_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]

  function aplicar() {
    if (freq === "nunca") {
      onSalvar(null)
    } else {
      const rec: Recorrencia = { freq }
      if (freq === "semanal" && dias.length > 0) rec.dias = [...dias].sort()
      onSalvar(rec)
    }
    setAberto(false)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={disabled}
        className="no-ds"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          fontSize: 13,
          color: recorrencia ? "var(--text-1)" : "var(--text-3)",
          background: "transparent",
          border: "none",
          borderRadius: 6,
          padding: "5px 8px",
          cursor: "pointer",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
        {recorrencia ? rotuloRecorrencia(recorrencia) : "Não se repete"}
      </button>

      {aberto && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 10,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "var(--surface-2)",
          }}
        >
          {!temPrazo && (
            <p style={{ fontSize: 10, color: "#e0a458", margin: 0 }}>
              Defina uma data de entrega — a repetição parte dela.
            </p>
          )}
          <select
            value={freq}
            onChange={(e) => setFreq(e.target.value as FreqRecorrencia | "nunca")}
            className="glass-input"
            style={{ fontSize: 12, padding: "6px 9px", borderRadius: 6 }}
          >
            <option value="nunca" style={{ color: "#111" }}>Não se repete</option>
            <option value="diaria" style={{ color: "#111" }}>Diariamente</option>
            <option value="semanal" style={{ color: "#111" }}>Semanalmente</option>
            <option value="mensal" style={{ color: "#111" }}>Mensalmente</option>
            <option value="anual" style={{ color: "#111" }}>Anualmente</option>
          </select>

          {freq === "semanal" && (
            <div style={{ display: "flex", gap: 4 }}>
              {NOMES.map((n, i) => {
                const ativo = dias.includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={NOMES_LONGO[i]}
                    aria-pressed={ativo}
                    title={NOMES_LONGO[i]}
                    onClick={() =>
                      setDias((d) => (ativo ? d.filter((x) => x !== i) : [...d, i]))
                    }
                    className="no-ds"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      fontSize: 11,
                      fontWeight: 700,
                      border: "none",
                      cursor: "pointer",
                      background: ativo ? "#4573d2" : "var(--surface-3)",
                      color: ativo ? "#fff" : "var(--text-3)",
                    }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={aplicar}
              className="no-ds"
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 14px",
                borderRadius: 6,
                background: AZUL_ASANA,
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="no-ds"
              style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
            >
              Cancelar
            </button>
          </div>
          <p style={{ fontSize: 10, color: "var(--text-4)", margin: 0 }}>
            Ao concluir a tarefa, a próxima ocorrência é criada sozinha na data
            seguinte da regra.
          </p>
        </div>
      )}
    </div>
  )
}

function IconeCalendario({ cor }: { cor: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="4" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

/** Círculo de conclusão do Asana (redondo, não quadrado). */
function CirculoCheck({
  concluida,
  onClick,
  disabled,
}: {
  concluida: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  const conteudo = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={concluida ? "#fff" : "var(--text-4)"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
  const estilo = {
    flexShrink: 0,
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: `1.5px solid ${concluida ? "#5da283" : "var(--text-4)"}`,
    background: concluida ? "#5da283" : "transparent",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  } as const
  if (!onClick) {
    return (
      <span aria-hidden="true" style={estilo}>
        {conteudo}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={concluida ? "Reabrir subtarefa" : "Concluir subtarefa"}
      className="no-ds"
      style={{ ...estilo, cursor: "pointer" }}
    >
      {conteudo}
    </button>
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 0",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <CirculoCheck
        concluida={concluida}
        disabled={pending || pendingPai}
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
      />
      <span
        style={{
          fontSize: 13,
          color: concluida ? "var(--text-4)" : "var(--text-1)",
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
