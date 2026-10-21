"use client"

import { useState } from "react"
import { salvarDisponibilidadeAction } from "@/lib/reunioes-actions"
import {
  NOMES_DIA,
  validarBloqueios,
  validarExcecoes,
  validarJanelas,
  validarPeriodos,
  type BloqueioDisp,
  type ExcecaoDisp,
  type Janela,
  type PeriodoDisp,
} from "@/lib/reunioes-nucleo"
import type { DisponibilidadeTela } from "@/lib/reunioes-tipos"
import { Cartao, estiloBotao, estiloCampo, Mensagem, Rotulo, useAcao } from "./ui"

/** Segunda primeiro — é como a agência pensa a semana. */
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]
const FUSOS = ["America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Recife", "America/Belem", "America/Rio_Branco", "America/Noronha"]

/** "11:00" + n horas, sem passar de 23:59. */
function maisUmaHora(h: string, n: number): string {
  const [hh, mm] = h.split(":").map(Number)
  const t = Math.min(hh * 60 + mm + n * 60, 23 * 60 + 59)
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
}

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())
}

/**
 * Editor da disponibilidade publicada no Cal.com.
 *
 * "Salvar e publicar" grava no Workspace e empurra pro Cal.com (schedule +
 * overrides + Out of Office). Se o Cal.com recusar, a tela diz exatamente o
 * que ficou sem publicar — o status "Publicado" só aparece quando a API
 * confirmou.
 */
export default function EditorDisponibilidade({
  disp,
  usuarios,
  tiposQueUsam,
  calcomPronto,
  souAdmin,
}: {
  disp: DisponibilidadeTela
  usuarios: { id: string; nome: string }[]
  tiposQueUsam: string[]
  calcomPronto: boolean
  souAdmin: boolean
}) {
  const [nome, setNome] = useState(disp.nome)
  const [fuso, setFuso] = useState(disp.fuso)
  const [responsavel, setResponsavel] = useState(disp.responsavel_id ?? "")
  const [janelas, setJanelas] = useState<Janela[]>(disp.janelas ?? [])
  const [periodos, setPeriodos] = useState<PeriodoDisp[]>(disp.periodos ?? [])
  const [excecoes, setExcecoes] = useState<ExcecaoDisp[]>(disp.excecoes ?? [])
  const [bloqueios, setBloqueios] = useState<BloqueioDisp[]>(disp.bloqueios ?? [])
  const { pendente, resultado, rodar, setResultado } = useAcao()
  const somenteLeitura = !souAdmin

  function salvar() {
    // Mesmas validações do servidor, antes de gastar uma ida.
    for (const v of [validarJanelas(janelas), validarPeriodos(periodos), validarExcecoes(excecoes), validarBloqueios(bloqueios)]) {
      if (!v.ok) {
        setResultado({ ok: false, erro: v.erro })
        return
      }
    }
    const fd = new FormData()
    fd.set("id", disp.id)
    fd.set("nome", nome)
    fd.set("fuso", fuso)
    fd.set("responsavel_id", responsavel)
    fd.set("dados", JSON.stringify({ janelas, periodos, excecoes, bloqueios }))
    rodar(() => salvarDisponibilidadeAction(fd))
  }

  const status = disp.publicacao_erro
    ? { cor: "#e24b4a", texto: `Não publicado: ${disp.publicacao_erro}` }
    : disp.publicado_em
      ? { cor: "#5da283", texto: `Publicado no Cal.com em ${new Date(disp.publicado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` }
      : { cor: "#C9953A", texto: "Ainda não publicado no Cal.com" }

  return (
    <Cartao
      titulo={disp.nome}
      subtitulo={<span style={{ color: status.cor }}>{status.texto}</span>}
      acoes={
        souAdmin ? (
          <button type="button" className="no-ds" disabled={pendente} onClick={salvar} style={estiloBotao("principal", pendente)}>
            {pendente ? "Publicando…" : calcomPronto ? "Salvar e publicar" : "Salvar (sem publicar)"}
          </button>
        ) : undefined
      }
    >
      <Mensagem r={resultado} />
      {!calcomPronto && souAdmin && (
        <p style={{ fontSize: 11, color: "#C9953A", margin: 0 }}>
          O Cal.com não está conectado: o que você salvar fica só no Workspace e NÃO muda a agenda pública.
        </p>
      )}
      {somenteLeitura && <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Só administradores alteram a disponibilidade.</p>}
      <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>
        Usada por: {tiposQueUsam.length ? tiposQueUsam.join(", ") : "nenhum tipo"}. Todos os tipos do mesmo
        responsável dividem a mesma agenda no Cal.com — uma reserva ocupa o horário para todos os links.
      </p>

      <fieldset disabled={somenteLeitura || pendente} style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Rotulo texto="Nome">
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} className="glass-input" style={estiloCampo} />
          </Rotulo>
          <Rotulo texto="Fuso">
            <select value={fuso} onChange={(e) => setFuso(e.target.value)} className="glass-input" style={estiloCampo}>
              {(FUSOS.includes(fuso) ? FUSOS : [fuso, ...FUSOS]).map((f) => <option key={f} value={f} style={{ color: "#111" }}>{f}</option>)}
            </select>
          </Rotulo>
          <Rotulo texto="Responsável">
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="glass-input" style={estiloCampo}>
              <option value="" style={{ color: "#111" }}>— escolher —</option>
              {usuarios.map((u) => <option key={u.id} value={u.id} style={{ color: "#111" }}>{u.nome}</option>)}
            </select>
          </Rotulo>
        </div>

        <Bloco titulo="Regra semanal" dica="Vale toda semana, salvo períodos e exceções abaixo. Mais de uma janela por dia é permitido.">
          <GradeSemanal janelas={janelas} onChange={setJanelas} />
        </Bloco>

        <Bloco titulo="Períodos" dica="Ex.: em novembro, outros horários. Dentro do período, a regra do período substitui a semanal.">
          {periodos.map((p, i) => (
            <div key={p.id} className="glass" style={{ padding: 10, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <Rotulo texto="Nome">
                  <input value={p.nome} onChange={(e) => setPeriodos(periodos.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} className="glass-input" style={estiloCampo} />
                </Rotulo>
                <Rotulo texto="De">
                  <input type="date" value={p.de} onChange={(e) => setPeriodos(periodos.map((x, j) => (j === i ? { ...x, de: e.target.value } : x)))} className="glass-input" style={estiloCampo} />
                </Rotulo>
                <Rotulo texto="Até">
                  <input type="date" value={p.ate} onChange={(e) => setPeriodos(periodos.map((x, j) => (j === i ? { ...x, ate: e.target.value } : x)))} className="glass-input" style={estiloCampo} />
                </Rotulo>
                <button type="button" className="no-ds" style={estiloBotao("perigo")} onClick={() => setPeriodos(periodos.filter((_, j) => j !== i))}>Remover</button>
              </div>
              <GradeSemanal janelas={p.janelas} onChange={(js) => setPeriodos(periodos.map((x, j) => (j === i ? { ...x, janelas: js } : x)))} />
            </div>
          ))}
          <div>
            <button
              type="button"
              className="no-ds"
              style={estiloBotao("neutro")}
              onClick={() => setPeriodos([...periodos, { id: novoId(), nome: "Novo período", de: "", ate: "", janelas: [...janelas] }])}
            >
              + Período
            </button>
          </div>
        </Bloco>

        <Bloco titulo="Datas específicas" dica="Muda só aquele dia (ex.: feriado ou um dia com horário diferente), sem mexer na regra semanal.">
          {excecoes.map((ex, i) => (
            <div key={`${ex.data}-${i}`} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="date" value={ex.data} onChange={(e) => setExcecoes(excecoes.map((x, j) => (j === i ? { ...x, data: e.target.value } : x)))} className="glass-input" style={estiloCampo} aria-label="Data" />
              {ex.janelas.length === 0 ? (
                <span style={{ fontSize: 12, color: "#e24b4a" }}>Indisponível o dia todo</span>
              ) : (
                ex.janelas.map((jn, k) => (
                  <span key={k} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                    <input type="time" value={jn.inicio} onChange={(e) => setExcecoes(excecoes.map((x, j) => (j === i ? { ...x, janelas: x.janelas.map((y, z) => (z === k ? { ...y, inicio: e.target.value } : y)) } : x)))} className="glass-input" style={estiloCampo} aria-label="Início" />
                    –
                    <input type="time" value={jn.fim} onChange={(e) => setExcecoes(excecoes.map((x, j) => (j === i ? { ...x, janelas: x.janelas.map((y, z) => (z === k ? { ...y, fim: e.target.value } : y)) } : x)))} className="glass-input" style={estiloCampo} aria-label="Fim" />
                  </span>
                ))
              )}
              <button type="button" className="no-ds" style={estiloBotao("neutro")} onClick={() => setExcecoes(excecoes.map((x, j) => (j === i ? { ...x, janelas: [...x.janelas, { inicio: "09:00", fim: "11:00" }] } : x)))}>
                + janela
              </button>
              {ex.janelas.length > 0 && (
                <button type="button" className="no-ds" style={estiloBotao("neutro")} onClick={() => setExcecoes(excecoes.map((x, j) => (j === i ? { ...x, janelas: [] } : x)))}>
                  Dia todo indisponível
                </button>
              )}
              <button type="button" className="no-ds" style={estiloBotao("perigo")} onClick={() => setExcecoes(excecoes.filter((_, j) => j !== i))}>Remover</button>
            </div>
          ))}
          <div>
            <button type="button" className="no-ds" style={estiloBotao("neutro")} onClick={() => setExcecoes([...excecoes, { data: "", janelas: [] }])}>+ Data específica</button>
          </div>
        </Bloco>

        <Bloco titulo="Bloqueios temporários" dica="Dias inteiros fora (viagem, férias). Vira 'Out of Office' no Cal.com — vale para todos os tipos do responsável.">
          {bloqueios.map((b, i) => (
            <div key={b.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="date" value={b.de} onChange={(e) => setBloqueios(bloqueios.map((x, j) => (j === i ? { ...x, de: e.target.value } : x)))} className="glass-input" style={estiloCampo} aria-label="De" />
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>até</span>
              <input type="date" value={b.ate} onChange={(e) => setBloqueios(bloqueios.map((x, j) => (j === i ? { ...x, ate: e.target.value } : x)))} className="glass-input" style={estiloCampo} aria-label="Até" />
              <input value={b.motivo ?? ""} placeholder="Motivo (opcional)" maxLength={120} onChange={(e) => setBloqueios(bloqueios.map((x, j) => (j === i ? { ...x, motivo: e.target.value } : x)))} className="glass-input" style={{ ...estiloCampo, flex: "1 1 160px" }} />
              <span style={{ fontSize: 11, color: b.calcom_ooo_id ? "#5da283" : "var(--text-4)" }}>{b.calcom_ooo_id ? "no Cal.com" : "não publicado"}</span>
              <button type="button" className="no-ds" style={estiloBotao("perigo")} onClick={() => setBloqueios(bloqueios.filter((_, j) => j !== i))}>Remover</button>
            </div>
          ))}
          <div>
            <button type="button" className="no-ds" style={estiloBotao("neutro")} onClick={() => setBloqueios([...bloqueios, { id: novoId(), de: "", ate: "", motivo: null, calcom_ooo_id: null }])}>+ Bloqueio</button>
          </div>
        </Bloco>
      </fieldset>
    </Cartao>
  )
}

function Bloco({ titulo, dica, children }: { titulo: string; dica: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <h4 style={{ fontSize: 12, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{titulo}</h4>
        <p style={{ fontSize: 11, color: "var(--text-4)", margin: "2px 0 0" }}>{dica}</p>
      </div>
      {children}
    </div>
  )
}

/** Uma linha por dia; cada dia com zero ou mais janelas. */
function GradeSemanal({ janelas, onChange }: { janelas: Janela[]; onChange: (j: Janela[]) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {ORDEM_DIAS.map((dia) => {
        const doDia = janelas.map((j, idx) => ({ j, idx })).filter((x) => x.j.dia === dia)
        return (
          <div key={dia} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minHeight: 32 }}>
            <span style={{ width: 64, fontSize: 12, fontWeight: 600, color: doDia.length ? "var(--text-1)" : "var(--text-4)", textTransform: "capitalize" }}>
              {NOMES_DIA[dia]}
            </span>
            {doDia.length === 0 && <span style={{ fontSize: 11, color: "var(--text-4)" }}>indisponível</span>}
            {doDia.map(({ j, idx }) => (
              <span key={idx} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <input
                  type="time"
                  value={j.inicio}
                  onChange={(e) => onChange(janelas.map((x, k) => (k === idx ? { ...x, inicio: e.target.value } : x)))}
                  className="glass-input"
                  style={estiloCampo}
                  aria-label={`${NOMES_DIA[dia]} início`}
                />
                –
                <input
                  type="time"
                  value={j.fim}
                  onChange={(e) => onChange(janelas.map((x, k) => (k === idx ? { ...x, fim: e.target.value } : x)))}
                  className="glass-input"
                  style={estiloCampo}
                  aria-label={`${NOMES_DIA[dia]} fim`}
                />
                <button
                  type="button"
                  className="no-ds"
                  aria-label="Remover janela"
                  onClick={() => onChange(janelas.filter((_, k) => k !== idx))}
                  style={{ background: "none", border: "none", color: "var(--text-4)", cursor: "pointer", fontSize: 15, padding: "0 4px" }}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="no-ds"
              onClick={() => {
                const ultima = doDia[doDia.length - 1]?.j
                onChange([...janelas, ultima ? { dia, inicio: maisUmaHora(ultima.fim, 1), fim: maisUmaHora(ultima.fim, 2) } : { dia, inicio: "09:00", fim: "11:00" }])
              }}
              style={{ fontSize: 11, background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}
            >
              + janela
            </button>
          </div>
        )
      })}
    </div>
  )
}
