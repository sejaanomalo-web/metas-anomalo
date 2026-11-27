"use client"

import { useState } from "react"
import { gerirReuniaoNativaAction } from "@/lib/reunioes-actions"
import { brParaUtcIso } from "@/lib/reunioes-nucleo"
import { Mensagem, estiloBotao, estiloCampo, useAcao } from "./ui"

export default function GerirReuniaoNativa({ id, telefone, ativa }: { id: string; telefone: string | null; ativa: boolean }) {
  const { pendente, resultado, rodar } = useAcao()
  const [novo, setNovo] = useState("")
  const agir = (acao: string) => {
    const fd = new FormData()
    fd.set("agendamento_id", id)
    fd.set("acao", acao)
    if (acao === "reagendar" && novo) fd.set("novo_inicio", brParaUtcIso(novo.slice(0, 10), novo.slice(11, 16)))
    rodar(() => gerirReuniaoNativaAction(fd))
  }
  if (!ativa) return null
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
    {telefone && /^\+55\d{10,11}$/.test(telefone) && <a href={`https://wa.me/${telefone.slice(1)}`} target="_blank" rel="noopener noreferrer" style={{ ...estiloBotao("neutro"), textDecoration: "none" }}>WhatsApp</a>}
    <button type="button" className="no-ds" disabled={pendente} style={estiloBotao("neutro", pendente)} onClick={() => agir("confirmar")}>Confirmar contato</button>
    <button type="button" className="no-ds" disabled={pendente} style={estiloBotao("neutro", pendente)} onClick={() => agir("realizar")}>Marcar realizada</button>
    <button type="button" className="no-ds" disabled={pendente} style={estiloBotao("perigo", pendente)} onClick={() => { if (window.confirm("Cancelar a reserva nativa e liberar o horário?")) agir("cancelar") }}>Cancelar</button>
    <label style={{ fontSize: 11, color: "var(--text-3)" }}>Novo horário (Brasília) <input type="datetime-local" value={novo} onChange={e => setNovo(e.target.value)} className="glass-input" style={estiloCampo} /></label>
    <button type="button" className="no-ds" disabled={pendente || !novo} style={estiloBotao("neutro", pendente || !novo)} onClick={() => agir("reagendar")}>Reagendar</button>
    <Mensagem r={resultado} />
  </div>
}
