"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type {
  Colaborador,
  ConfiguracaoComissao,
  Faixa,
  GatilhoConfig,
  MetaComissionamento,
} from "@/lib/supabase"
import type { Mes } from "@/lib/data"
import { formatBRL } from "@/lib/data"
import {
  desativarColaboradorAction,
  salvarColaboradorAction,
  salvarMetaComissaoAction,
} from "@/lib/comissionamento-config"

type Aba = "metas" | "pessoas"

interface Props {
  mes: Mes
  ano: number
  supabaseOk: boolean
  colaboradores: Colaborador[]
  metasPorColaborador: Map<string, MetaComissionamento>
  padroesPorColaborador: Record<string, ConfiguracaoComissao>
}

export default function DrawerEdicaoComissao({
  mes,
  ano,
  supabaseOk,
  colaboradores,
  metasPorColaborador,
  padroesPorColaborador,
}: Props) {
  const [aberto, setAberto] = useState(false)
  const [aba, setAba] = useState<Aba>("metas")

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="btn-gold-filled uppercase"
      >
        Editar
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
          />

          <aside
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto"
            style={{
              background: "rgba(15,15,15,0.9)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderLeft: "0.5px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              className="sticky top-0"
              style={{
                background: "rgba(10,10,10,0.7)",
                backdropFilter: "blur(16px)",
                borderBottom: "0.5px solid rgba(255,255,255,0.06)",
                padding: "18px 24px",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    style={{
                      fontSize: 9,
                      letterSpacing: "2px",
                      color: "rgba(255,255,255,0.35)",
                      textTransform: "uppercase",
                      fontWeight: 500,
                    }}
                  >
                    Editar · {mes} {ano}
                  </p>
                  <p
                    style={{
                      fontSize: 16,
                      color: "#ffffff",
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    Comissionamento
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  style={{ color: "rgba(255,255,255,0.5)", fontSize: 22, lineHeight: 1 }}
                  className="hover:text-white transition"
                >
                  ×
                </button>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <AbaBtn ativo={aba === "metas"} onClick={() => setAba("metas")}>
                  Metas
                </AbaBtn>
                <AbaBtn
                  ativo={aba === "pessoas"}
                  onClick={() => setAba("pessoas")}
                >
                  Pessoas
                </AbaBtn>
              </div>
            </div>

            {!supabaseOk && (
              <div
                style={{
                  margin: "16px 24px 0",
                  padding: 12,
                  border: "0.5px solid rgba(226,75,74,0.35)",
                  background: "rgba(226,75,74,0.08)",
                  color: "#e24b4a",
                  fontSize: 12,
                  borderRadius: 8,
                }}
              >
                Supabase não configurado.
              </div>
            )}

            <div style={{ padding: 24 }}>
              {aba === "metas" && (
                <AbaMetas
                  mes={mes}
                  ano={ano}
                  supabaseOk={supabaseOk}
                  colaboradores={colaboradores}
                  metasPorColaborador={metasPorColaborador}
                  padroesPorColaborador={padroesPorColaborador}
                />
              )}
              {aba === "pessoas" && (
                <AbaPessoas
                  supabaseOk={supabaseOk}
                  colaboradores={colaboradores}
                />
              )}
            </div>
          </aside>
        </div>
      )}
    </>
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
        padding: "5px 14px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.3px",
        background: ativo ? "rgba(201,149,58,0.15)" : "transparent",
        border: `0.5px solid ${ativo ? "#C9953A" : "rgba(255,255,255,0.1)"}`,
        color: ativo ? "#C9953A" : "rgba(255,255,255,0.35)",
      }}
    >
      {children}
    </button>
  )
}

function LabelSmall({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: "2px",
        color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  )
}

// ===================== ABA METAS =====================

function AbaMetas({
  mes,
  ano,
  supabaseOk,
  colaboradores,
  metasPorColaborador,
  padroesPorColaborador,
}: {
  mes: Mes
  ano: number
  supabaseOk: boolean
  colaboradores: Colaborador[]
  metasPorColaborador: Map<string, MetaComissionamento>
  padroesPorColaborador: Record<string, ConfiguracaoComissao>
}) {
  const chaves = colaboradores.map((c) => c.nome.toLowerCase())
  // Inclui também os padrões fixos (felipe/vinicius/emanuel) mesmo se não
  // estiverem na tabela colaboradores.
  for (const k of Object.keys(padroesPorColaborador)) {
    if (!chaves.includes(k)) chaves.push(k)
  }

  return (
    <div className="space-y-6">
      {chaves.map((chave) => {
        const meta = metasPorColaborador.get(chave)
        const colab = colaboradores.find(
          (c) => c.nome.toLowerCase() === chave
        )
        const padrao =
          meta?.configuracao ??
          colab?.configuracao_padrao ??
          padroesPorColaborador[chave]
        if (!padrao) return null
        return (
          <EditorMetaColab
            key={chave}
            colaborador={chave}
            mes={mes}
            ano={ano}
            configInicial={padrao}
            supabaseOk={supabaseOk}
          />
        )
      })}
    </div>
  )
}

function EditorMetaColab({
  colaborador,
  mes,
  ano,
  configInicial,
  supabaseOk,
}: {
  colaborador: string
  mes: Mes
  ano: number
  configInicial: ConfiguracaoComissao
  supabaseOk: boolean
}) {
  const [config, setConfig] = useState<ConfiguracaoComissao>(configInicial)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  async function salvar() {
    const fd = new FormData()
    fd.set("colaborador", colaborador)
    fd.set("mes", mes)
    fd.set("ano", String(ano))
    fd.set("configuracao", JSON.stringify(config))
    const r = await salvarMetaComissaoAction(fd)
    setStatus(r.ok ? "Salvo ✓" : r.erro ?? "Erro")
    if (r.ok) router.refresh()
  }

  return (
    <div
      style={{
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#fff",
          textTransform: "capitalize",
          marginBottom: 4,
        }}
      >
        {colaborador}
      </p>
      <p
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
          fontWeight: 300,
          marginBottom: 12,
        }}
      >
        {config.tipo === "gatilhos"
          ? "Bônus por gatilhos"
          : "Escala por entregas"}
      </p>

      {config.tipo === "gatilhos" && (
        <EditorGatilhos
          config={config}
          onChange={(c) => setConfig(c)}
        />
      )}

      {config.tipo === "escala" && (
        <EditorEscala
          config={config}
          onChange={(c) => setConfig(c)}
        />
      )}

      <div className="flex items-center gap-3 pt-3">
        <button
          type="button"
          onClick={() => startTransition(() => salvar())}
          disabled={pending || !supabaseOk}
          className="btn-gold-filled uppercase"
          style={{ opacity: pending || !supabaseOk ? 0.5 : 1 }}
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
        {status && (
          <span
            style={{
              fontSize: 11,
              color: status === "Salvo ✓" ? "#4caf50" : "#e24b4a",
            }}
          >
            {status}
          </span>
        )}
      </div>
    </div>
  )
}

function EditorGatilhos({
  config,
  onChange,
}: {
  config: Extract<ConfiguracaoComissao, { tipo: "gatilhos" }>
  onChange: (c: ConfiguracaoComissao) => void
}) {
  const total = config.gatilhos.reduce((acc, g) => acc + (g.valor || 0), 0)

  function atualizar(idx: number, patch: Partial<GatilhoConfig>) {
    const novo = { ...config, gatilhos: config.gatilhos.map((g, i) => (i === idx ? { ...g, ...patch } : g)) }
    onChange(novo)
  }

  return (
    <div className="space-y-3">
      {config.gatilhos.map((g, idx) => (
        <div
          key={g.chave}
          style={{
            padding: 12,
            border: "0.5px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <LabelSmall>{g.rotulo}</LabelSmall>
            <label className="flex items-center gap-2 cursor-pointer">
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.35)",
                  fontWeight: 400,
                }}
              >
                Ativo
              </span>
              <input
                type="checkbox"
                checked={g.valor > 0}
                onChange={(e) =>
                  atualizar(idx, { valor: e.target.checked ? g.valor || 100 : 0 })
                }
                style={{ width: 16, height: 16, accentColor: "#C9953A" }}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <InputNumero
              label="Bônus R$"
              value={g.valor}
              onChange={(v) => atualizar(idx, { valor: v })}
            />
            {g.chave === "roas_hato" && (
              <InputNumero
                label="Alvo ROAS"
                value={g.alvoRoas ?? 2.5}
                step={0.1}
                onChange={(v) => atualizar(idx, { alvoRoas: v })}
              />
            )}
          </div>
        </div>
      ))}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "10px 12px",
          borderTop: "0.5px solid rgba(255,255,255,0.05)",
        }}
      >
        <LabelSmall>Bônus máximo</LabelSmall>
        <span
          style={{
            fontSize: 16,
            color: "#C9953A",
            fontWeight: 600,
          }}
        >
          {formatBRL(total)}
        </span>
      </div>
    </div>
  )
}

function EditorEscala({
  config,
  onChange,
}: {
  config: Extract<ConfiguracaoComissao, { tipo: "escala" }>
  onChange: (c: ConfiguracaoComissao) => void
}) {
  function atualizar(idx: number, patch: Partial<Faixa>) {
    const novo = { ...config, faixas: config.faixas.map((f, i) => (i === idx ? { ...f, ...patch } : f)) }
    onChange(novo)
  }
  function adicionar() {
    const ultimaFaixa = config.faixas[config.faixas.length - 1]
    const novaMin = (ultimaFaixa?.minimo ?? 0) + 5
    onChange({
      ...config,
      faixas: [...config.faixas, { minimo: novaMin, bonus: 0 }],
    })
  }
  function remover(idx: number) {
    if (idx === 0) return
    onChange({
      ...config,
      faixas: config.faixas.filter((_, i) => i !== idx),
    })
  }

  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-[1fr_1fr_24px] gap-2"
        style={{ marginBottom: 4 }}
      >
        <LabelSmall>Mínimo</LabelSmall>
        <LabelSmall>Bônus R$</LabelSmall>
        <span />
      </div>
      {config.faixas.map((f, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[1fr_1fr_24px] gap-2 items-center"
        >
          <InputNumero
            value={f.minimo}
            onChange={(v) => atualizar(idx, { minimo: v })}
          />
          <InputNumero
            value={f.bonus}
            onChange={(v) => atualizar(idx, { bonus: v })}
          />
          {idx > 0 ? (
            <button
              type="button"
              onClick={() => remover(idx)}
              style={{
                color: "rgba(255,255,255,0.3)",
                fontSize: 18,
                lineHeight: 1,
              }}
              className="hover:text-[#e24b4a] transition"
              aria-label="Remover"
            >
              ×
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={adicionar}
        style={{
          marginTop: 8,
          width: "100%",
          padding: "8px 0",
          border: "0.5px dashed rgba(255,255,255,0.15)",
          borderRadius: 8,
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
          fontWeight: 400,
        }}
        className="hover:text-[#C9953A] hover:border-[#C9953A55] transition"
      >
        + Adicionar faixa
      </button>
    </div>
  )
}

function InputNumero({
  label,
  value,
  onChange,
  step,
}: {
  label?: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="block">
      {label && <LabelSmall>{label}</LabelSmall>}
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="glass-input"
        style={{
          marginTop: label ? 6 : 0,
          width: "100%",
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 400,
        }}
      />
    </label>
  )
}

// ===================== ABA PESSOAS =====================

function AbaPessoas({
  supabaseOk,
  colaboradores,
}: {
  supabaseOk: boolean
  colaboradores: Colaborador[]
}) {
  const [nome, setNome] = useState("")
  const [funcao, setFuncao] = useState("")
  const [tipo, setTipo] = useState<"escala" | "gatilhos">("escala")
  const [faixas, setFaixas] = useState<Faixa[]>([
    { minimo: 0, bonus: 0 },
  ])
  const [gatilhos, setGatilhos] = useState<GatilhoConfig[]>([
    { chave: "g1", rotulo: "Novo gatilho", valor: 100 },
  ])
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  async function salvar() {
    const configuracao: ConfiguracaoComissao =
      tipo === "escala"
        ? { tipo: "escala", faixas }
        : { tipo: "gatilhos", gatilhos }
    const fd = new FormData()
    fd.set("nome", nome)
    fd.set("funcao", funcao)
    fd.set("tipo", tipo)
    fd.set("configuracao_padrao", JSON.stringify(configuracao))
    const r = await salvarColaboradorAction(fd)
    if (r.ok) {
      setStatus("Salvo ✓")
      setNome("")
      setFuncao("")
      router.refresh()
    } else {
      setStatus(r.erro ?? "Erro")
    }
  }

  async function desativar(id: string) {
    const fd = new FormData()
    fd.set("id", id)
    const r = await desativarColaboradorAction(fd)
    if (r.ok) router.refresh()
    else setStatus(r.erro ?? "Erro")
  }

  return (
    <div className="space-y-6">
      <div
        style={{
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: 18,
        }}
      >
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            marginBottom: 12,
          }}
        >
          Adicionar colaborador
        </p>

        <div className="space-y-3">
          <label className="block">
            <LabelSmall>Nome</LabelSmall>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="glass-input"
              style={{
                marginTop: 6,
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
              }}
            />
          </label>
          <label className="block">
            <LabelSmall>Função</LabelSmall>
            <input
              value={funcao}
              onChange={(e) => setFuncao(e.target.value)}
              className="glass-input"
              style={{
                marginTop: 6,
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
              }}
            />
          </label>
          <div>
            <LabelSmall>Tipo</LabelSmall>
            <div className="flex items-center gap-3 mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={tipo === "escala"}
                  onChange={() => setTipo("escala")}
                  style={{ accentColor: "#C9953A" }}
                />
                <span
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}
                >
                  Por escala
                </span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={tipo === "gatilhos"}
                  onChange={() => setTipo("gatilhos")}
                  style={{ accentColor: "#C9953A" }}
                />
                <span
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}
                >
                  Por gatilhos
                </span>
              </label>
            </div>
          </div>

          {tipo === "escala" && (
            <EditorEscala
              config={{ tipo: "escala", faixas }}
              onChange={(c) => {
                if (c.tipo === "escala") setFaixas(c.faixas)
              }}
            />
          )}

          {tipo === "gatilhos" && (
            <EditorGatilhosLivres
              gatilhos={gatilhos}
              onChange={setGatilhos}
            />
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => startTransition(() => salvar())}
              disabled={pending || !supabaseOk || !nome || !funcao}
              className="btn-gold-filled uppercase"
              style={{
                opacity:
                  pending || !supabaseOk || !nome || !funcao ? 0.5 : 1,
              }}
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
            {status && (
              <span
                style={{
                  fontSize: 11,
                  color: status === "Salvo ✓" ? "#4caf50" : "#e24b4a",
                }}
              >
                {status}
              </span>
            )}
          </div>
        </div>
      </div>

      {colaboradores.length > 0 && (
        <div>
          <p
            style={{
              fontSize: 9,
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            Ativos
          </p>
          <div className="space-y-2">
            {colaboradores.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between"
                style={{
                  padding: "10px 12px",
                  border: "0.5px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#fff",
                      fontWeight: 500,
                    }}
                  >
                    {c.nome}
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.4)",
                      fontWeight: 300,
                    }}
                  >
                    {c.funcao} · {c.tipo}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => c.id && desativar(c.id)}
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.4)",
                    fontWeight: 500,
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                  }}
                  className="hover:text-[#e24b4a] transition"
                >
                  Desativar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EditorGatilhosLivres({
  gatilhos,
  onChange,
}: {
  gatilhos: GatilhoConfig[]
  onChange: (g: GatilhoConfig[]) => void
}) {
  function atualizar(idx: number, patch: Partial<GatilhoConfig>) {
    onChange(gatilhos.map((g, i) => (i === idx ? { ...g, ...patch } : g)))
  }
  function adicionar() {
    onChange([
      ...gatilhos,
      { chave: `g${gatilhos.length + 1}`, rotulo: "Novo gatilho", valor: 100 },
    ])
  }
  function remover(idx: number) {
    if (idx === 0) return
    onChange(gatilhos.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      {gatilhos.map((g, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[2fr_1fr_24px] gap-2 items-center"
        >
          <input
            value={g.rotulo}
            onChange={(e) => atualizar(idx, { rotulo: e.target.value })}
            className="glass-input"
            style={{
              padding: "8px 12px",
              fontSize: 13,
            }}
            placeholder="Nome do gatilho"
          />
          <input
            type="number"
            value={g.valor}
            onChange={(e) => atualizar(idx, { valor: Number(e.target.value) || 0 })}
            className="glass-input"
            style={{
              padding: "8px 12px",
              fontSize: 13,
            }}
          />
          {idx > 0 ? (
            <button
              type="button"
              onClick={() => remover(idx)}
              style={{
                color: "rgba(255,255,255,0.3)",
                fontSize: 18,
                lineHeight: 1,
              }}
              className="hover:text-[#e24b4a] transition"
            >
              ×
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={adicionar}
        style={{
          marginTop: 4,
          width: "100%",
          padding: "8px 0",
          border: "0.5px dashed rgba(255,255,255,0.15)",
          borderRadius: 8,
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
        }}
        className="hover:text-[#C9953A] hover:border-[#C9953A55] transition"
      >
        + Adicionar gatilho
      </button>
    </div>
  )
}
