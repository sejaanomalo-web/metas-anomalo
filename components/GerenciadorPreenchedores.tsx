"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { PapelPreenchedor, Preenchedor } from "@/lib/supabase"
import {
  atribuirEmpresasAction,
  atualizarPreenchedorAction,
  criarPreenchedorAction,
  regenerarTokenAction,
  removerPreenchedorAction,
} from "@/lib/preenchedores"

type Aba = "gestor_trafego" | "sdr"

interface EmpresaRef {
  db: string
  nome: string
}

interface Props {
  preenchedoresIniciais: Preenchedor[]
  atribuicoesIniciais: Record<string, string[]>
  empresasDisponiveis: EmpresaRef[]
  supabaseOk: boolean
}

export default function GerenciadorPreenchedores({
  preenchedoresIniciais,
  atribuicoesIniciais,
  empresasDisponiveis,
  supabaseOk,
}: Props) {
  const [aba, setAba] = useState<Aba>("gestor_trafego")
  const [criandoNovo, setCriandoNovo] = useState(false)
  const router = useRouter()

  const lista = useMemo(
    () => preenchedoresIniciais.filter((p) => p.papel === aba),
    [preenchedoresIniciais, aba]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <AbaBtn ativo={aba === "gestor_trafego"} onClick={() => setAba("gestor_trafego")}>
          Gestores de tráfego
        </AbaBtn>
        <AbaBtn ativo={aba === "sdr"} onClick={() => setAba("sdr")}>
          SDRs
        </AbaBtn>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setCriandoNovo(true)}
          disabled={!supabaseOk}
          className="btn-gold-filled uppercase"
          style={{ opacity: supabaseOk ? 1 : 0.5 }}
        >
          + Novo {aba === "gestor_trafego" ? "gestor" : "SDR"}
        </button>
      </div>

      {criandoNovo && (
        <NovoPreenchedor
          papel={aba}
          onFechar={() => setCriandoNovo(false)}
          onSalvo={() => {
            setCriandoNovo(false)
            router.refresh()
          }}
        />
      )}

      <div className="space-y-3">
        {lista.length === 0 ? (
          <div
            style={{
              padding: 24,
              border: "0.5px dashed rgba(255,255,255,0.1)",
              borderRadius: 12,
              textAlign: "center",
              color: "rgba(255,255,255,0.4)",
              fontSize: 13,
            }}
          >
            Nenhum {aba === "gestor_trafego" ? "gestor de tráfego" : "SDR"}{" "}
            cadastrado.
          </div>
        ) : (
          lista.map((p) => (
            <CardPreenchedor
              key={p.id}
              preenchedor={p}
              atribuicoes={atribuicoesIniciais[p.id ?? ""] ?? []}
              empresasDisponiveis={empresasDisponiveis}
              supabaseOk={supabaseOk}
            />
          ))
        )}
      </div>
    </div>
  )
}

function AbaBtn({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "1px",
        textTransform: "uppercase",
        background: ativo ? "rgba(201,149,58,0.15)" : "transparent",
        border: `0.5px solid ${ativo ? "#C9953A" : "rgba(255,255,255,0.1)"}`,
        color: ativo ? "#C9953A" : "rgba(255,255,255,0.45)",
      }}
    >
      {children}
    </button>
  )
}

function NovoPreenchedor({
  papel,
  onFechar,
  onSalvo,
}: {
  papel: PapelPreenchedor
  onFechar: () => void
  onSalvo: () => void
}) {
  const [nome, setNome] = useState("")
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function salvar() {
    setErro(null)
    const fd = new FormData()
    fd.set("nome", nome.trim())
    fd.set("papel", papel)
    startTransition(async () => {
      const r = await criarPreenchedorAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Erro desconhecido.")
        return
      }
      setNome("")
      onSalvo()
    })
  }

  return (
    <div
      className="glass"
      style={{
        padding: 18,
        border: "0.5px solid rgba(201,149,58,0.3)",
      }}
    >
      <p
        style={{
          fontSize: 9,
          letterSpacing: "2px",
          color: "#C9953A",
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        Novo {papel === "gestor_trafego" ? "gestor de tráfego" : "SDR"}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome completo"
          className="glass-input flex-1"
          style={{ padding: "10px 14px", fontSize: 13 }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nome.trim()) salvar()
          }}
        />
        <div className="flex items-center gap-3 justify-end">
        <button
          type="button"
          onClick={salvar}
          disabled={pending || !nome.trim()}
          className="btn-gold-filled uppercase"
          style={{ opacity: pending || !nome.trim() ? 0.5 : 1 }}
        >
          {pending ? "Criando..." : "Criar"}
        </button>
        <button
          type="button"
          onClick={onFechar}
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
            padding: "8px 12px",
          }}
        >
          Cancelar
        </button>
        </div>
      </div>
      {erro && (
        <p style={{ fontSize: 12, color: "#e24b4a", marginTop: 8 }}>{erro}</p>
      )}
    </div>
  )
}

function CardPreenchedor({
  preenchedor,
  atribuicoes,
  empresasDisponiveis,
  supabaseOk,
}: {
  preenchedor: Preenchedor
  atribuicoes: string[]
  empresasDisponiveis: EmpresaRef[]
  supabaseOk: boolean
}) {
  const [nome, setNome] = useState(preenchedor.nome)
  const [ativo, setAtivo] = useState(preenchedor.ativo)
  const [empresas, setEmpresas] = useState<string[]>(atribuicoes)
  const [expandido, setExpandido] = useState(false)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const [confirmarRemover, setConfirmarRemover] = useState(false)
  const [confirmarRegenerar, setConfirmarRegenerar] = useState(false)
  const [linkCopiado, setLinkCopiado] = useState(false)
  const router = useRouter()

  const linkFormulario =
    typeof window !== "undefined"
      ? `${window.location.origin}/preencher/${preenchedor.token}`
      : `/preencher/${preenchedor.token}`

  function copiarLink() {
    navigator.clipboard.writeText(linkFormulario)
    setLinkCopiado(true)
    setTimeout(() => setLinkCopiado(false), 1500)
  }

  function salvarDados() {
    setStatus(null)
    const fd = new FormData()
    fd.set("id", preenchedor.id ?? "")
    fd.set("nome", nome.trim())
    fd.set("papel", preenchedor.papel)
    fd.set("ativo", String(ativo))
    startTransition(async () => {
      const r = await atualizarPreenchedorAction(fd)
      if (!r.ok) {
        setStatus(r.erro ?? "Erro")
        return
      }
      const fd2 = new FormData()
      fd2.set("preenchedor_id", preenchedor.id ?? "")
      fd2.set("empresas", JSON.stringify(empresas))
      const r2 = await atribuirEmpresasAction(fd2)
      if (!r2.ok) {
        setStatus(r2.erro ?? "Erro ao salvar empresas")
        return
      }
      setStatus("Salvo ✓")
      router.refresh()
      setTimeout(() => setStatus(null), 1500)
    })
  }

  function regenerar() {
    const fd = new FormData()
    fd.set("id", preenchedor.id ?? "")
    startTransition(async () => {
      const r = await regenerarTokenAction(fd)
      setStatus(r.ok ? "Token regenerado" : r.erro ?? "Erro")
      setConfirmarRegenerar(false)
      if (r.ok) router.refresh()
      setTimeout(() => setStatus(null), 1500)
    })
  }

  function remover() {
    const fd = new FormData()
    fd.set("id", preenchedor.id ?? "")
    startTransition(async () => {
      const r = await removerPreenchedorAction(fd)
      if (r.ok) router.refresh()
      else setStatus(r.erro ?? "Erro")
      setConfirmarRemover(false)
    })
  }

  function toggleEmpresa(db: string) {
    setEmpresas((atual) =>
      atual.includes(db) ? atual.filter((e) => e !== db) : [...atual, db]
    )
  }

  return (
    <div
      className="glass"
      style={{
        padding: 18,
        opacity: ativo ? 1 : 0.5,
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background:
                preenchedor.papel === "gestor_trafego"
                  ? "rgba(201,149,58,0.12)"
                  : "rgba(140,180,220,0.12)",
              color:
                preenchedor.papel === "gestor_trafego"
                  ? "#C9953A"
                  : "#8cb4dc",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {preenchedor.nome.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p
              style={{
                fontSize: 15,
                color: "#ffffff",
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {preenchedor.nome}
              {!preenchedor.ativo && (
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "1.5px",
                    color: "rgba(226,75,74,0.8)",
                    marginLeft: 8,
                    textTransform: "uppercase",
                  }}
                >
                  inativo
                </span>
              )}
            </p>
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.35)",
                marginTop: 2,
              }}
            >
              {preenchedor.papel === "gestor_trafego"
                ? "Gestor de tráfego · pago"
                : "SDR · orgânico"}
              {" · "}
              {atribuicoes.length}{" "}
              {atribuicoes.length === 1 ? "empresa" : "empresas"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={copiarLink}
            disabled={!supabaseOk}
            style={{
              padding: "7px 14px",
              fontSize: 10,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: linkCopiado ? "#4caf50" : "#C9953A",
              border: `0.5px solid ${
                linkCopiado ? "rgba(76,175,80,0.5)" : "rgba(201,149,58,0.4)"
              }`,
              borderRadius: 8,
              background: "transparent",
              fontWeight: 500,
            }}
          >
            {linkCopiado ? "✓ Link copiado" : "Copiar link"}
          </button>
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="btn-gold-filled uppercase"
          >
            {expandido ? "Fechar" : "Editar"}
          </button>
        </div>
      </div>

      {expandido && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: "2px",
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  fontWeight: 500,
                }}
              >
                Nome
              </span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="glass-input"
                style={{
                  marginTop: 6,
                  width: "100%",
                  padding: "9px 12px",
                  fontSize: 13,
                }}
              />
            </label>
            <label className="flex items-center gap-2" style={{ marginTop: 22 }}>
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#C9953A" }}
              />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Ativo (pode receber e enviar o formulário)
              </span>
            </label>
          </div>

          <div style={{ marginTop: 16 }}>
            <p
              style={{
                fontSize: 9,
                letterSpacing: "2px",
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                fontWeight: 500,
                marginBottom: 8,
              }}
            >
              Empresas do formulário
            </p>
            {empresasDisponiveis.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                Nenhuma empresa disponível.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {empresasDisponiveis.map((e) => {
                  const sel = empresas.includes(e.db)
                  return (
                    <button
                      key={e.db}
                      type="button"
                      onClick={() => toggleEmpresa(e.db)}
                      style={{
                        padding: "5px 11px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 500,
                        background: sel
                          ? "rgba(201,149,58,0.18)"
                          : "transparent",
                        border: `0.5px solid ${
                          sel ? "#C9953A" : "rgba(255,255,255,0.1)"
                        }`,
                        color: sel ? "#C9953A" : "rgba(255,255,255,0.5)",
                      }}
                    >
                      {e.nome}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div
            className="flex items-center gap-3 flex-wrap"
            style={{ marginTop: 20 }}
          >
            <button
              type="button"
              onClick={salvarDados}
              disabled={pending || !supabaseOk}
              className="btn-gold-filled uppercase"
              style={{ opacity: pending || !supabaseOk ? 0.5 : 1 }}
            >
              {pending ? "Salvando..." : "Salvar alterações"}
            </button>

            {!confirmarRegenerar ? (
              <button
                type="button"
                onClick={() => setConfirmarRegenerar(true)}
                style={{
                  fontSize: 10,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.55)",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  padding: "7px 12px",
                  background: "transparent",
                }}
              >
                Regenerar link
              </button>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                <span>Invalidar o link atual?</span>
                <button
                  type="button"
                  onClick={regenerar}
                  style={{
                    fontSize: 10,
                    color: "#e24b4a",
                    border: "0.5px solid rgba(226,75,74,0.4)",
                    borderRadius: 4,
                    padding: "3px 8px",
                  }}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarRegenerar(false)}
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    padding: "3px 8px",
                  }}
                >
                  Não
                </button>
              </div>
            )}

            {!confirmarRemover ? (
              <button
                type="button"
                onClick={() => setConfirmarRemover(true)}
                style={{
                  fontSize: 10,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "#e24b4a",
                  border: "0.5px solid rgba(226,75,74,0.3)",
                  borderRadius: 6,
                  padding: "7px 12px",
                  background: "transparent",
                }}
              >
                Remover
              </button>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                <span>Remover definitivamente?</span>
                <button
                  type="button"
                  onClick={remover}
                  style={{
                    fontSize: 10,
                    color: "#e24b4a",
                    border: "0.5px solid rgba(226,75,74,0.4)",
                    borderRadius: 4,
                    padding: "3px 8px",
                  }}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarRemover(false)}
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    padding: "3px 8px",
                  }}
                >
                  Não
                </button>
              </div>
            )}

            {status && (
              <span
                style={{
                  fontSize: 11,
                  color:
                    status === "Salvo ✓" || status === "Token regenerado"
                      ? "#4caf50"
                      : "#e24b4a",
                }}
              >
                {status}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
