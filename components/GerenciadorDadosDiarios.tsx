"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatBRL, formatNumero, type EmpresaMeta } from "@/lib/data"
import {
  atualizarDadoDiarioAction,
  excluirDadoDiarioAction,
  listarDadosDiariosAdmin,
  type DadoDiarioRow,
} from "@/lib/dados-diarios-admin"

/** Primeiro dia do mês atual / hoje em BRT (YYYY-MM-DD). */
function rangeMesAtual(): { inicio: string; fim: string } {
  const agora = new Date()
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000
  const brt = new Date(utcMs - 3 * 60 * 60_000)
  const ano = brt.getUTCFullYear()
  const mes = String(brt.getUTCMonth() + 1).padStart(2, "0")
  const dia = String(brt.getUTCDate()).padStart(2, "0")
  return { inicio: `${ano}-${mes}-01`, fim: `${ano}-${mes}-${dia}` }
}

/**
 * Admin · Configurações → Gerenciar dados (tráfego/orgânico). Filtra
 * dados_diarios_log por empresa + período e permite EDITAR/EXCLUIR linhas
 * lançadas indevidamente.
 *
 * AVISO exibido: editar/excluir aqui NÃO recomputa os totais mensais de
 * fechamento automaticamente.
 */
export default function GerenciadorDadosDiarios({
  empresas,
}: {
  empresas: EmpresaMeta[]
}) {
  const router = useRouter()
  const inicial = rangeMesAtual()
  const [pending, startTransition] = useTransition()
  const [linhas, setLinhas] = useState<DadoDiarioRow[] | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function buscar(formData: FormData) {
    setErro(null)
    setEditandoId(null)
    startTransition(async () => {
      const rows = await listarDadosDiariosAdmin(formData)
      setLinhas(rows)
    })
  }

  function removerDaLista(id: string) {
    setLinhas((atual) => (atual ? atual.filter((l) => l.id !== id) : atual))
  }

  return (
    <div className="glass" style={{ padding: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <p style={rotuloSecao}>Gerenciar dados · admin</p>
        <h2 style={tituloSecao}>Dados diários (tráfego / orgânico)</h2>
      </div>

      <div style={avisoEstilo}>
        ⚠️ Editar ou excluir aqui altera o histórico diário do painel, mas{" "}
        <strong>não recalcula os totais mensais de fechamento</strong>{" "}
        automaticamente. Use para corrigir lançamentos indevidos.
      </div>

      <form
        action={(fd) => buscar(fd)}
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          flexWrap: "wrap",
          marginTop: 16,
        }}
      >
        <Campo label="Empresa">
          <select name="empresa" defaultValue="" className="glass-input" style={inputEstilo}>
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e.slug} value={e.nome}>
                {e.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="De">
          <input type="date" name="inicio" defaultValue={inicial.inicio} className="glass-input" style={inputEstilo} />
        </Campo>
        <Campo label="Até">
          <input type="date" name="fim" defaultValue={inicial.fim} className="glass-input" style={inputEstilo} />
        </Campo>
        <button type="submit" disabled={pending} className="btn-gold-filled uppercase" style={{ opacity: pending ? 0.6 : 1 }}>
          {pending ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {erro && <p style={{ fontSize: 12, color: "#e24b4a", marginTop: 12 }}>{erro}</p>}

      {linhas !== null && (
        <div style={{ marginTop: 18 }}>
          {linhas.length === 0 ? (
            <p style={vazioEstilo}>Nenhuma linha no período/empresa selecionados.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {linhas.map((l) =>
                editandoId === l.id ? (
                  <li key={l.id} style={liEstilo}>
                    <FormEdicao
                      linha={l}
                      onCancelar={() => setEditandoId(null)}
                      onSucesso={() => {
                        setEditandoId(null)
                        router.refresh()
                      }}
                    />
                  </li>
                ) : (
                  <li key={l.id} style={liEstilo}>
                    <LinhaDado
                      linha={l}
                      onEditar={() => setEditandoId(l.id)}
                      onExcluir={() => {
                        removerDaLista(l.id)
                        router.refresh()
                      }}
                    />
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function LinhaDado({
  linha: l,
  onEditar,
  onExcluir,
}: {
  linha: DadoDiarioRow
  onEditar: () => void
  onExcluir: () => void
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
          {formatarData(l.data)} · {l.empresa}
          <span style={tagOrigem}>{l.origem}</span>
        </p>
        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {l.preenchedor_nome ?? "—"}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>
          {l.investimento_real != null ? formatBRL(l.investimento_real) : "·"} inv ·{" "}
          {l.leads_real != null ? formatNumero(l.leads_real) : "·"} leads ·{" "}
          {l.reunioes_real != null ? formatNumero(l.reunioes_real) : "·"} reun ·{" "}
          {l.contratos_real != null ? formatNumero(l.contratos_real) : "·"} contr ·{" "}
          {l.faturamento_real != null ? formatBRL(l.faturamento_real) : "·"} fat
        </p>
      </div>
      <AcoesDado dadoId={l.id} onEditar={onEditar} onExcluir={onExcluir} />
    </div>
  )
}

function AcoesDado({
  dadoId,
  onEditar,
  onExcluir,
}: {
  dadoId: string
  onEditar: () => void
  onExcluir: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [modoExcluir, setModoExcluir] = useState(false)
  const [confirmacao, setConfirmacao] = useState("")
  const [erro, setErro] = useState<string | null>(null)

  function confirmar() {
    setErro(null)
    if (confirmacao !== "Excluir") {
      setErro('Digite exatamente "Excluir".')
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", dadoId)
      fd.set("confirmacao", confirmacao)
      const res = await excluirDadoDiarioAction(fd)
      if (res.ok) onExcluir()
      else setErro(res.erro ?? "Erro ao excluir.")
    })
  }

  if (modoExcluir) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 280 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            autoFocus
            value={confirmacao}
            onChange={(e) => {
              setConfirmacao(e.target.value)
              setErro(null)
            }}
            placeholder='Digite "Excluir"'
            disabled={pending}
            className="no-ds"
            style={inputExcluirEstilo}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmar()
              if (e.key === "Escape") setModoExcluir(false)
            }}
          />
          <button
            type="button"
            onClick={confirmar}
            disabled={pending || confirmacao !== "Excluir"}
            className="no-ds"
            style={{ ...botaoEstilo("danger"), opacity: confirmacao === "Excluir" && !pending ? 1 : 0.5 }}
          >
            {pending ? "Excluindo…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setModoExcluir(false)
              setConfirmacao("")
              setErro(null)
            }}
            disabled={pending}
            className="no-ds"
            style={botaoEstilo("ghost")}
          >
            Cancelar
          </button>
        </div>
        {erro && <p style={{ fontSize: 11, color: "#e24b4a", margin: 0 }}>{erro}</p>}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
      <button type="button" onClick={onEditar} className="no-ds" style={botaoEstilo("ghost")}>
        Editar
      </button>
      <button type="button" onClick={() => setModoExcluir(true)} className="no-ds" style={botaoEstilo("danger")}>
        Excluir
      </button>
    </div>
  )
}

function FormEdicao({
  linha: l,
  onCancelar,
  onSucesso,
}: {
  linha: DadoDiarioRow
  onCancelar: () => void
  onSucesso: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  async function onSubmit(formData: FormData) {
    setErro(null)
    formData.set("id", l.id)
    const res = await atualizarDadoDiarioAction(formData)
    if (!res.ok) {
      setErro(res.erro ?? "Erro ao salvar.")
      return
    }
    onSucesso()
  }

  return (
    <form
      action={(fd) => startTransition(() => onSubmit(fd))}
      style={{
        padding: 16,
        background: "rgba(255,255,255,0.02)",
        border: "0.5px solid rgba(201,149,58,0.20)",
        borderRadius: 10,
      }}
      className="space-y-3"
    >
      <p style={{ ...rotuloSecao, color: "var(--accent)" }}>
        Editar · {formatarData(l.data)} · {l.empresa} ({l.origem})
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 10 }}>
        <Campo label="Investimento (R$)">
          <input type="text" name="investimento_real" inputMode="decimal" defaultValue={valorTexto(l.investimento_real)} className="glass-input" style={inputEstilo} />
        </Campo>
        <NumNull label="Leads" name="leads_real" valor={l.leads_real} />
        <NumNull label="Reuniões" name="reunioes_real" valor={l.reunioes_real} />
        <NumNull label="Contratos" name="contratos_real" valor={l.contratos_real} />
        <Campo label="Faturamento (R$)">
          <input type="text" name="faturamento_real" inputMode="decimal" defaultValue={valorTexto(l.faturamento_real)} className="glass-input" style={inputEstilo} />
        </Campo>
      </div>

      <Campo label="Observações">
        <textarea name="observacoes" rows={2} defaultValue={l.observacoes ?? ""} className="glass-input" style={{ ...inputEstilo, resize: "vertical" }} />
      </Campo>

      {erro && <p style={{ fontSize: 12, color: "#e24b4a" }}>{erro}</p>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <button type="submit" disabled={pending} className="btn-gold-filled uppercase" style={{ opacity: pending ? 0.6 : 1 }}>
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
        <button type="button" onClick={onCancelar} disabled={pending} className="no-ds" style={botaoEstilo("ghost")}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/* ===== helpers ===== */

function NumNull({ label, name, valor }: { label: string; name: string; valor: number | null }) {
  return (
    <Campo label={label}>
      <input type="number" name={name} min="0" inputMode="numeric" defaultValue={valor ?? ""} className="glass-input" style={inputEstilo} placeholder="—" />
    </Campo>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span style={{ fontSize: 10, letterSpacing: "1px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", fontWeight: 500 }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function valorTexto(v: number | null): string {
  return v == null ? "" : String(v)
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.split("-")
  return d && m && a ? `${d}/${m}/${a}` : iso
}

function botaoEstilo(variante: "ghost" | "danger"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: 10,
    letterSpacing: "0.8px",
    textTransform: "uppercase",
    borderRadius: 6,
    background: "transparent",
    border: "0.5px solid rgba(255,255,255,0.15)",
    color: "var(--text-3)",
    cursor: "pointer",
    fontWeight: 500,
  }
  if (variante === "danger") {
    return { ...base, color: "#e24b4a", borderColor: "rgba(226,75,74,0.35)" }
  }
  return base
}

const rotuloSecao: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "1.5px",
  color: "var(--text-3)",
  textTransform: "uppercase",
  fontWeight: 500,
}

const tituloSecao: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: "var(--text-1)",
  marginTop: 4,
}

const avisoEstilo: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "0.5px solid rgba(234,179,8,0.30)",
  background: "rgba(234,179,8,0.06)",
  color: "var(--text-2)",
  fontSize: 12,
  lineHeight: 1.5,
}

const liEstilo: React.CSSProperties = {
  padding: "14px 0",
  borderBottom: "0.5px solid rgba(255,255,255,0.06)",
}

const vazioEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-4)",
  fontStyle: "italic",
}

const tagOrigem: React.CSSProperties = {
  marginLeft: 8,
  fontSize: 9,
  letterSpacing: "0.6px",
  textTransform: "uppercase",
  color: "var(--accent)",
  background: "rgba(201,149,58,0.10)",
  padding: "2px 6px",
  borderRadius: 999,
  fontWeight: 600,
}

const inputEstilo: React.CSSProperties = {
  marginTop: 6,
  width: "100%",
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 400,
}

const inputExcluirEstilo: React.CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  fontSize: 12,
  background: "rgba(226,75,74,0.08)",
  border: "0.5px solid rgba(226,75,74,0.40)",
  borderRadius: 6,
  color: "var(--text-1)",
  fontFamily: "inherit",
  outline: "none",
}
