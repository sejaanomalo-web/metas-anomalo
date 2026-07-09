"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatBRL, formatNumero, type EmpresaMeta } from "@/lib/data"
import type { RelatorioComercial } from "@/lib/comercial-tipos"
import CampoInteiro from "@/components/inputs/CampoInteiro"
import CampoMoeda from "@/components/inputs/CampoMoeda"
import {
  atualizarRelatorioComercialAction,
  excluirRelatorioComercialAction,
  listarRelatoriosComerciaisAdmin,
} from "@/lib/relatorios-comerciais"

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
 * Admin · Configurações → Gerenciar dados (comercial). FILTRA os relatórios
 * comerciais por empresa + período (igual ao de tráfego pago) e só mostra a
 * lista DEPOIS da busca. Permite EDITAR ou EXCLUIR cada registro. Exclusão
 * exige digitar "Excluir". Gate de admin no server (requererAdmin) + na page.
 */
export default function GerenciadorRelatoriosComerciais({
  empresas,
}: {
  empresas: EmpresaMeta[]
}) {
  const router = useRouter()
  const inicial = rangeMesAtual()
  const [pending, startTransition] = useTransition()
  const [registros, setRegistros] = useState<RelatorioComercial[] | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  function buscar(formData: FormData) {
    setEditandoId(null)
    startTransition(async () => {
      const rows = await listarRelatoriosComerciaisAdmin(formData)
      setRegistros(rows)
    })
  }

  function removerDaLista(id: string) {
    setRegistros((atual) => (atual ? atual.filter((r) => r.id !== id) : atual))
  }
  function atualizarNaLista(r: RelatorioComercial) {
    setRegistros((atual) =>
      atual ? atual.map((x) => (x.id === r.id ? r : x)) : atual
    )
  }

  return (
    <div className="glass" style={{ padding: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <p style={rotuloSecao}>Gerenciar dados · admin</p>
        <h2 style={tituloSecao}>Relatórios comerciais</h2>
        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
          Filtre por empresa e período pra listar · editar ou excluir dados
          lançados de forma indevida.
        </p>
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

      {registros !== null && (
        <div style={{ marginTop: 18 }}>
          {registros.length === 0 ? (
            <p style={vazioEstilo}>
              Nenhum relatório comercial no período/empresa selecionados.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>
                {registros.length}{" "}
                {registros.length === 1 ? "registro" : "registros"} no filtro.
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {registros.map((r) =>
                  editandoId === r.id ? (
                    <li key={r.id} style={liEstilo}>
                      <FormEdicao
                        registro={r}
                        empresas={empresas}
                        onCancelar={() => setEditandoId(null)}
                        onSucesso={(atualizado) => {
                          atualizarNaLista(atualizado)
                          setEditandoId(null)
                          router.refresh()
                        }}
                      />
                    </li>
                  ) : (
                    <li key={r.id} style={liEstilo}>
                      <LinhaRegistro
                        registro={r}
                        onEditar={() => setEditandoId(r.id)}
                        onExcluir={() => {
                          removerDaLista(r.id)
                          router.refresh()
                        }}
                      />
                    </li>
                  )
                )}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function LinhaRegistro({
  registro: r,
  onEditar,
  onExcluir,
}: {
  registro: RelatorioComercial
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
          {formatarData(r.data)} · {r.empresa}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {r.colaborador_nome}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>
          {formatNumero(r.mensagens)} msg · {formatNumero(r.retorno_mensagens)}{" "}
          retorno · {formatNumero(r.qualificados)} qualif ·{" "}
          {formatNumero(r.reunioes_agendadas)} reun. agend ·{" "}
          {formatNumero(r.contratos_fechados)} contr ·{" "}
          {formatBRL(r.faturamento_gerado)}
        </p>
      </div>
      <AcoesRegistro registroId={r.id} onEditar={onEditar} onExcluir={onExcluir} />
    </div>
  )
}

function AcoesRegistro({
  registroId,
  onEditar,
  onExcluir,
}: {
  registroId: string
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
      fd.set("id", registroId)
      fd.set("confirmacao", confirmacao)
      const res = await excluirRelatorioComercialAction(fd)
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
            style={{
              ...botaoEstilo("danger"),
              opacity: confirmacao === "Excluir" && !pending ? 1 : 0.5,
            }}
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
      <button
        type="button"
        onClick={() => setModoExcluir(true)}
        className="no-ds"
        style={botaoEstilo("danger")}
      >
        Excluir
      </button>
    </div>
  )
}

function FormEdicao({
  registro: r,
  empresas,
  onCancelar,
  onSucesso,
}: {
  registro: RelatorioComercial
  empresas: EmpresaMeta[]
  onCancelar: () => void
  onSucesso: (r: RelatorioComercial) => void
}) {
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  async function onSubmit(formData: FormData) {
    setErro(null)
    formData.set("id", r.id)
    const res = await atualizarRelatorioComercialAction(formData)
    if (!res.ok) {
      setErro(res.erro ?? "Erro ao salvar.")
      return
    }
    // Reconstrói o registro otimista a partir do form pra refletir na lista.
    const num = (k: string) => parseInt(String(formData.get(k) ?? "0"), 10) || 0
    onSucesso({
      ...r,
      empresa: String(formData.get("empresa") ?? r.empresa),
      data: String(formData.get("data") ?? r.data),
      mensagens: num("mensagens"),
      retorno_mensagens: num("retorno_mensagens"),
      qualificados: num("qualificados"),
      reunioes_agendadas: num("reunioes_agendadas"),
      reunioes_realizadas: num("reunioes_realizadas"),
      no_shows: num("no_shows"),
      propostas_enviadas: num("propostas_enviadas"),
      contratos_fechados: num("contratos_fechados"),
      observacoes: (String(formData.get("observacoes") ?? "").trim() || null),
    })
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
        Editar · {formatarData(r.data)}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
        <Campo label="Empresa">
          <select name="empresa" defaultValue={r.empresa} className="glass-input" style={inputEstilo}>
            {empresas.map((e) => (
              <option key={e.slug} value={e.nome}>
                {e.nome}
              </option>
            ))}
            {!empresas.some((e) => e.nome === r.empresa) && (
              <option value={r.empresa}>{r.empresa}</option>
            )}
          </select>
        </Campo>
        <Campo label="Data">
          <input type="date" name="data" defaultValue={r.data} className="glass-input" style={inputEstilo} />
        </Campo>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 10 }}>
        <Num label="Mensagens enviadas" name="mensagens" valor={r.mensagens} />
        <Num label="Retorno de mensagens" name="retorno_mensagens" valor={r.retorno_mensagens} />
        <Num label="Qualificados" name="qualificados" valor={r.qualificados} />
        <Num label="Reuniões agendadas" name="reunioes_agendadas" valor={r.reunioes_agendadas} />
        <Num label="Reuniões realizadas" name="reunioes_realizadas" valor={r.reunioes_realizadas} />
        <Num label="No-shows" name="no_shows" valor={r.no_shows} />
        <Num label="Propostas enviadas" name="propostas_enviadas" valor={r.propostas_enviadas} />
        <Num label="Contratos fechados" name="contratos_fechados" valor={r.contratos_fechados} />
        <Campo label="Faturamento (R$)">
          <CampoMoeda
            name="faturamento_gerado"
            defaultValue={r.faturamento_gerado ?? null}
            className="glass-input"
            style={inputEstilo}
          />
        </Campo>
      </div>

      <Campo label="Observações">
        <textarea
          name="observacoes"
          rows={2}
          maxLength={500}
          defaultValue={r.observacoes ?? ""}
          className="glass-input"
          style={{ ...inputEstilo, resize: "vertical" }}
        />
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

/* ===== helpers visuais ===== */

function Num({ label, name, valor }: { label: string; name: string; valor: number }) {
  return (
    <Campo label={label}>
      <CampoInteiro
        name={name}
        maxDigitos={7}
        defaultValue={valor}
        className="glass-input"
        style={inputEstilo}
      />
    </Campo>
  )
}

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

function formatarData(iso: string): string {
  // YYYY-MM-DD -> DD/MM/YYYY
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
