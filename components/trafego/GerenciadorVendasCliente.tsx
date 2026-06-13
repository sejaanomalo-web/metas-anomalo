"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { VendaCliente } from "@/lib/vendas-cliente"
import {
  buscarVendasClienteAction,
  editarVendaClienteAction,
  excluirVendaClienteAction,
} from "@/lib/vendas-cliente-actions"
import CampoInteiro from "@/components/inputs/CampoInteiro"
import CampoMoeda from "@/components/inputs/CampoMoeda"

// ============================================================
// Gerenciador de vendas informadas (lápis no header do cliente).
// Botão discreto (admin-only) → drawer com busca por intervalo em TODO o
// histórico + editar/excluir cada lançamento. Espelha o gerenciador de
// Configurações; as ações são admin-only também no servidor.
// ============================================================

function hojeBRT(): string {
  const agora = new Date()
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000
  return new Date(utcMs - 3 * 60 * 60_000).toISOString().slice(0, 10)
}

/** Piso do histórico — mesma data mínima que o servidor aceita (erroData).
 *  É o default do filtro "De" pra o auto-load cobrir TODO o histórico. */
const PISO_HISTORICO = "2025-01-01"

function brl(n: number): string {
  return Number(n).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-")
  return d && m && a ? `${d}/${m}/${a}` : iso
}

/** created_at ISO → "11/06 14:32" em BRT. */
function carimboBRT(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60_000)
  const s = d.toISOString()
  return `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`
}

export default function GerenciadorVendasCliente({
  clienteId,
  clienteNome,
}: {
  clienteId: string
  clienteNome: string
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Buscar / editar / excluir vendas informadas (admin)"
        aria-label="Gerenciar vendas informadas"
        className="hover:text-[#C9953A] hover:border-[#C9953A55] transition no-ds"
        style={{
          padding: "8px 12px",
          fontSize: 11,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
          border: "0.5px solid rgba(255,255,255,0.15)",
          borderRadius: 6,
          background: "transparent",
          fontWeight: 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ✏️ Gerenciar
      </button>
      {aberto && (
        <PainelGerenciador
          clienteId={clienteId}
          clienteNome={clienteNome}
          fechar={() => setAberto(false)}
        />
      )}
    </>
  )
}

function PainelGerenciador({
  clienteId,
  clienteNome,
  fechar,
}: {
  clienteId: string
  clienteNome: string
  fechar: () => void
}) {
  const router = useRouter()
  const [de, setDe] = useState(PISO_HISTORICO)
  const [ate, setAte] = useState(hojeBRT())
  const [linhas, setLinhas] = useState<VendaCliente[] | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const buscar = useCallback(
    (inicio: string, fim: string) => {
      setErro(null)
      setEditandoId(null)
      startTransition(async () => {
        const fd = new FormData()
        fd.set("clienteId", clienteId)
        fd.set("inicio", inicio)
        fd.set("fim", fim)
        const rows = await buscarVendasClienteAction(fd)
        setLinhas(rows)
      })
    },
    [clienteId]
  )

  // Carrega o histórico uma vez ao abrir (buscar é estável via useCallback).
  useEffect(() => {
    buscar(PISO_HISTORICO, hojeBRT())
  }, [buscar])

  // Fecha no Esc (rebind barato se a identidade de `fechar` mudar).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") fechar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fechar])

  function excluir(v: VendaCliente) {
    const rotulo =
      v.quantidade > 0
        ? `${v.quantidade} venda(s) de ${dataBR(v.data)}`
        : `a confirmação "sem vendas" de ${dataBR(v.data)}`
    if (!window.confirm(`Excluir ${rotulo}? O total do dia será ajustado.`)) {
      return
    }
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", v.id)
      const r = await excluirVendaClienteAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Erro ao excluir.")
        return
      }
      router.refresh()
      buscar(de, ate)
    })
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar()
      }}
    >
      <div
        style={{
          width: "min(640px, 100vw)",
          background: "var(--surface-1)",
          borderLeft: "0.5px solid rgba(255,255,255,0.10)",
          overflowY: "auto",
          padding: "32px 28px",
          animation: "painel-slide-left 0.22s ease-out",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 6,
          }}
        >
          <div>
            <p style={rotuloSecao}>Gerenciar vendas · admin</p>
            <h2 style={{ fontSize: 22, marginTop: 4 }}>{clienteNome}</h2>
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="no-ds"
            style={{
              background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.18)",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              color: "var(--text-2)",
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, marginBottom: 16 }}>
          Pesquisa todo o histórico de vendas informadas pelo formulário público,
          independente do período do painel. Editar ou excluir ajusta o total de
          Vendas/Faturamento do dia automaticamente.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            buscar(de, ate)
          }}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <Campo label="De">
            <input
              type="date"
              value={de}
              max={ate || hojeBRT()}
              onChange={(e) => setDe(e.target.value)}
              className="glass-input"
              style={inputEstilo}
            />
          </Campo>
          <Campo label="Até">
            <input
              type="date"
              value={ate}
              max={hojeBRT()}
              onChange={(e) => setAte(e.target.value)}
              className="glass-input"
              style={inputEstilo}
            />
          </Campo>
          <button
            type="submit"
            disabled={pending}
            className="btn-gold-filled uppercase"
            style={{ opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Buscando…" : "Buscar"}
          </button>
        </form>

        {erro && (
          <p style={{ fontSize: 12, color: "#e24b4a", marginBottom: 12 }}>{erro}</p>
        )}

        {linhas === null ? (
          <p style={vazioEstilo}>Carregando…</p>
        ) : linhas.length === 0 ? (
          <p style={vazioEstilo}>Nenhum lançamento no intervalo selecionado.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {linhas.map((v) =>
              editandoId === v.id ? (
                <li key={v.id} style={liEstilo}>
                  <FormEdicao
                    venda={v}
                    onCancelar={() => setEditandoId(null)}
                    onSucesso={() => {
                      setEditandoId(null)
                      router.refresh()
                      buscar(de, ate)
                    }}
                  />
                </li>
              ) : (
                <li key={v.id} style={liEstilo}>
                  <LinhaVenda
                    venda={v}
                    onEditar={() => setEditandoId(v.id)}
                    onExcluir={() => excluir(v)}
                    desabilitado={pending}
                  />
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

function LinhaVenda({
  venda: v,
  onEditar,
  onExcluir,
  desabilitado,
}: {
  venda: VendaCliente
  onEditar: () => void
  onExcluir: () => void
  desabilitado: boolean
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
          {dataBR(v.data)} ·{" "}
          {v.quantidade > 0 ? (
            <>
              {v.quantidade} venda{v.quantidade > 1 ? "s" : ""}
              {v.valor > 0 ? ` · ${brl(v.valor)}` : ""}
            </>
          ) : (
            <span style={{ color: "var(--text-3)" }}>sem vendas</span>
          )}
        </p>
        {v.observacoes && (
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3, maxWidth: 360 }}>
            {v.observacoes}
          </p>
        )}
        <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>
          enviado {carimboBRT(v.created_at)} · {v.registrado_por}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <button
          type="button"
          onClick={onEditar}
          disabled={desabilitado}
          className="no-ds"
          style={botaoEstilo("ghost")}
        >
          Editar
        </button>
        <button
          type="button"
          onClick={onExcluir}
          disabled={desabilitado}
          className="no-ds"
          style={botaoEstilo("danger")}
        >
          Excluir
        </button>
      </div>
    </div>
  )
}

function FormEdicao({
  venda: v,
  onCancelar,
  onSucesso,
}: {
  venda: VendaCliente
  onCancelar: () => void
  onSucesso: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  async function onSubmit(formData: FormData) {
    setErro(null)
    formData.set("id", v.id)
    const res = await editarVendaClienteAction(formData)
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
        Editar lançamento de {dataBR(v.data)}
      </p>

      <div className="grid grid-cols-2" style={{ gap: 10 }}>
        <Campo label="Data da venda">
          <input
            type="date"
            name="data"
            defaultValue={v.data}
            max={hojeBRT()}
            required
            className="glass-input"
            style={inputEstilo}
          />
        </Campo>
        <Campo label="Quantas vendas?">
          <CampoInteiro
            name="quantidade"
            maxDigitos={3}
            valorMax={999}
            defaultValue={v.quantidade}
            required
            className="glass-input"
            style={inputEstilo}
          />
        </Campo>
        <Campo label="Valor total (R$)">
          <CampoMoeda
            name="valor"
            defaultValue={v.valor || null}
            className="glass-input"
            style={inputEstilo}
            placeholder="R$ 0,00"
          />
        </Campo>
      </div>

      <Campo label="Observações">
        <textarea
          name="observacoes"
          rows={2}
          maxLength={600}
          defaultValue={v.observacoes ?? ""}
          className="glass-input"
          style={{ ...inputEstilo, resize: "vertical", minHeight: 56 }}
        />
      </Campo>

      {erro && <p style={{ fontSize: 12, color: "#e24b4a" }}>{erro}</p>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={pending}
          className="btn-gold-filled uppercase"
          style={{ opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={pending}
          className="no-ds"
          style={botaoEstilo("ghost")}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

/* ===== helpers de estilo ===== */

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        style={{
          fontSize: 10,
          letterSpacing: "1px",
          color: "rgba(255,255,255,0.45)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
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

const liEstilo: React.CSSProperties = {
  padding: "14px 0",
  borderBottom: "0.5px solid rgba(255,255,255,0.06)",
}

const vazioEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-4)",
  fontStyle: "italic",
}

const inputEstilo: React.CSSProperties = {
  marginTop: 6,
  width: "100%",
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 400,
}
