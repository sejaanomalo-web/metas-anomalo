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
  atualizarColaboradorAction,
  desativarColaboradorAction,
  excluirColaboradorAction,
  reativarColaboradorAction,
  salvarColaboradorAction,
  salvarMetaComissaoAction,
} from "@/lib/comissionamento-config"

type Aba = "metas" | "pessoas"

interface Props {
  mes: Mes
  ano: number
  supabaseOk: boolean
  colaboradores: Colaborador[]
  colaboradoresInativos: Colaborador[]
  metasPorColaborador: Map<string, MetaComissionamento>
  padroesPorColaborador: Record<string, ConfiguracaoComissao>
}

export default function DrawerEdicaoComissao({
  mes,
  ano,
  supabaseOk,
  colaboradores,
  colaboradoresInativos,
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
                zIndex: 5,
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
                  colaboradoresInativos={colaboradoresInativos}
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

const BTN_ICON: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  padding: "2px 6px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontWeight: 400,
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

// -------- Editor de gatilhos com inline edit/delete --------

type ModoLinha = "leitura" | "editar" | "confirmar_excluir"

function EditorGatilhos({
  config,
  onChange,
}: {
  config: Extract<ConfiguracaoComissao, { tipo: "gatilhos" }>
  onChange: (c: ConfiguracaoComissao) => void
}) {
  const [modos, setModos] = useState<Record<number, ModoLinha>>({})
  const [rascunhos, setRascunhos] = useState<Record<number, GatilhoConfig>>({})

  const total = config.gatilhos
    .filter((g) => g.valor > 0)
    .reduce((acc, g) => acc + (g.valor || 0), 0)

  function setModo(idx: number, modo: ModoLinha) {
    setModos({ ...modos, [idx]: modo })
  }

  function atualizar(idx: number, patch: Partial<GatilhoConfig>) {
    onChange({
      ...config,
      gatilhos: config.gatilhos.map((g, i) =>
        i === idx ? { ...g, ...patch } : g
      ),
    })
  }

  function iniciarEdicao(idx: number) {
    setRascunhos({ ...rascunhos, [idx]: { ...config.gatilhos[idx] } })
    setModo(idx, "editar")
  }

  function confirmarEdicao(idx: number) {
    const r = rascunhos[idx]
    if (r) atualizar(idx, r)
    setModo(idx, "leitura")
  }

  function cancelarEdicao(idx: number) {
    setModo(idx, "leitura")
  }

  function remover(idx: number) {
    onChange({
      ...config,
      gatilhos: config.gatilhos.filter((_, i) => i !== idx),
    })
    const novos = { ...modos }
    delete novos[idx]
    setModos(novos)
  }

  function adicionar() {
    const novoIdx = config.gatilhos.length
    const novo: GatilhoConfig = {
      chave: `g${novoIdx + 1}`,
      rotulo: "Novo gatilho",
      valor: 100,
    }
    onChange({ ...config, gatilhos: [...config.gatilhos, novo] })
    setRascunhos({ ...rascunhos, [novoIdx]: novo })
    setModo(novoIdx, "editar")
  }

  return (
    <div className="space-y-2">
      {config.gatilhos.map((g, idx) => {
        const modo = modos[idx] ?? "leitura"

        if (modo === "confirmar_excluir") {
          return (
            <div
              key={idx}
              className="flex items-center justify-between gap-2"
              style={{
                padding: "6px 10px",
                background: "rgba(226,75,74,0.08)",
                border: "0.5px solid rgba(226,75,74,0.2)",
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                Excluir este gatilho?
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => remover(idx)}
                  style={{
                    fontSize: 10,
                    color: "#e24b4a",
                    border: "0.5px solid rgba(226,75,74,0.4)",
                    borderRadius: 4,
                    padding: "2px 8px",
                  }}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => setModo(idx, "leitura")}
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    padding: "2px 8px",
                  }}
                >
                  Não
                </button>
              </div>
            </div>
          )
        }

        if (modo === "editar") {
          const r = rascunhos[idx] ?? g
          return (
            <div
              key={idx}
              style={{
                padding: 10,
                border: "0.5px solid rgba(201,149,58,0.35)",
                borderRadius: 8,
                background: "rgba(201,149,58,0.04)",
              }}
            >
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <input
                  value={r.rotulo}
                  onChange={(e) =>
                    setRascunhos({
                      ...rascunhos,
                      [idx]: { ...r, rotulo: e.target.value },
                    })
                  }
                  placeholder="Nome do gatilho"
                  className="glass-input"
                  style={{ padding: "6px 10px", fontSize: 12 }}
                />
                <input
                  type="number"
                  value={r.valor}
                  onChange={(e) =>
                    setRascunhos({
                      ...rascunhos,
                      [idx]: {
                        ...r,
                        valor: Number(e.target.value) || 0,
                      },
                    })
                  }
                  placeholder="R$"
                  className="glass-input"
                  style={{ padding: "6px 10px", fontSize: 12 }}
                />
              </div>
              {g.chave === "roas_hato" && (
                <div className="mt-2">
                  <LabelSmall>Alvo ROAS</LabelSmall>
                  <input
                    type="number"
                    step={0.1}
                    value={r.alvoRoas ?? 2.5}
                    onChange={(e) =>
                      setRascunhos({
                        ...rascunhos,
                        [idx]: {
                          ...r,
                          alvoRoas: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="glass-input"
                    style={{
                      marginTop: 4,
                      width: "100%",
                      padding: "6px 10px",
                      fontSize: 12,
                    }}
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => confirmarEdicao(idx)}
                  style={{
                    fontSize: 10,
                    color: "#C9953A",
                    border: "0.5px solid rgba(201,149,58,0.4)",
                    borderRadius: 4,
                    padding: "2px 8px",
                  }}
                >
                  ✓ Salvar
                </button>
                <button
                  type="button"
                  onClick={() => cancelarEdicao(idx)}
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    padding: "2px 8px",
                  }}
                >
                  ✕ Cancelar
                </button>
              </div>
            </div>
          )
        }

        return (
          <div
            key={idx}
            className="flex items-center justify-between gap-2"
            style={{
              padding: "10px 12px",
              border: "0.5px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
            }}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                type="checkbox"
                checked={g.valor > 0}
                onChange={(e) =>
                  atualizar(idx, {
                    valor: e.target.checked ? g.valor || 100 : 0,
                  })
                }
                style={{
                  width: 14,
                  height: 14,
                  accentColor: "#C9953A",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.75)",
                  fontWeight: 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                className="whitespace-nowrap"
              >
                {g.rotulo}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className="font-mono"
                style={{
                  fontSize: 11,
                  color: g.valor > 0 ? "#C9953A" : "rgba(255,255,255,0.3)",
                  fontWeight: 500,
                }}
              >
                {formatBRL(g.valor)}
              </span>
              <button
                type="button"
                onClick={() => iniciarEdicao(idx)}
                title="Editar"
                style={{
                  ...BTN_ICON,
                  color: "rgba(255,255,255,0.3)",
                }}
                className="hover:text-[#C9953A] transition"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => setModo(idx, "confirmar_excluir")}
                title="Excluir"
                style={{
                  ...BTN_ICON,
                  color: "rgba(255,255,255,0.2)",
                }}
                className="hover:text-[#e24b4a] transition"
              >
                ✕
              </button>
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={adicionar}
        style={{
          marginTop: 6,
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
        + Adicionar gatilho
      </button>

      <div
        className="flex items-center justify-between"
        style={{
          marginTop: 10,
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

// -------- Editor de escala (faixas) com inline edit/delete --------

function EditorEscala({
  config,
  onChange,
}: {
  config: Extract<ConfiguracaoComissao, { tipo: "escala" }>
  onChange: (c: ConfiguracaoComissao) => void
}) {
  const [modos, setModos] = useState<Record<number, ModoLinha>>({})
  const [rascunhos, setRascunhos] = useState<Record<number, Faixa>>({})
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)

  function setModo(idx: number, modo: ModoLinha) {
    setModos({ ...modos, [idx]: modo })
  }

  function iniciarEdicao(idx: number) {
    setRascunhos({ ...rascunhos, [idx]: { ...config.faixas[idx] } })
    setModo(idx, "editar")
  }

  function confirmarEdicao(idx: number) {
    const r = rascunhos[idx]
    if (r) {
      onChange({
        ...config,
        faixas: config.faixas.map((f, i) => (i === idx ? r : f)),
      })
    }
    setModo(idx, "leitura")
  }

  function tentarExcluir(idx: number) {
    if (config.faixas.length <= 1) {
      setErroExclusao("É necessário manter ao menos uma faixa")
      setTimeout(() => setErroExclusao(null), 2500)
      return
    }
    setModo(idx, "confirmar_excluir")
  }

  function excluir(idx: number) {
    onChange({
      ...config,
      faixas: config.faixas.filter((_, i) => i !== idx),
    })
    const novos = { ...modos }
    delete novos[idx]
    setModos(novos)
  }

  function adicionar() {
    const ultima = config.faixas[config.faixas.length - 1]
    const novaMin = (ultima?.minimo ?? 0) + 5
    const nova: Faixa = { minimo: novaMin, bonus: 0 }
    const novoIdx = config.faixas.length
    onChange({ ...config, faixas: [...config.faixas, nova] })
    setRascunhos({ ...rascunhos, [novoIdx]: nova })
    setModo(novoIdx, "editar")
  }

  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-[1fr_1fr_auto] gap-2"
        style={{ marginBottom: 2 }}
      >
        <LabelSmall>Mínimo</LabelSmall>
        <LabelSmall>Bônus R$</LabelSmall>
        <span style={{ width: 58 }} />
      </div>

      {config.faixas.map((f, idx) => {
        const modo = modos[idx] ?? "leitura"

        if (modo === "confirmar_excluir") {
          return (
            <div
              key={idx}
              className="flex items-center justify-between gap-2"
              style={{
                padding: "6px 10px",
                background: "rgba(226,75,74,0.08)",
                border: "0.5px solid rgba(226,75,74,0.2)",
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                Excluir esta faixa?
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => excluir(idx)}
                  style={{
                    fontSize: 10,
                    color: "#e24b4a",
                    border: "0.5px solid rgba(226,75,74,0.4)",
                    borderRadius: 4,
                    padding: "2px 8px",
                  }}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => setModo(idx, "leitura")}
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    padding: "2px 8px",
                  }}
                >
                  Não
                </button>
              </div>
            </div>
          )
        }

        if (modo === "editar") {
          const r = rascunhos[idx] ?? f
          return (
            <div
              key={idx}
              className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center"
              style={{
                padding: 6,
                border: "0.5px solid rgba(201,149,58,0.35)",
                borderRadius: 8,
                background: "rgba(201,149,58,0.04)",
              }}
            >
              <input
                type="number"
                value={r.minimo}
                onChange={(e) =>
                  setRascunhos({
                    ...rascunhos,
                    [idx]: { ...r, minimo: Number(e.target.value) || 0 },
                  })
                }
                className="glass-input"
                style={{ padding: "6px 10px", fontSize: 12 }}
              />
              <input
                type="number"
                value={r.bonus}
                onChange={(e) =>
                  setRascunhos({
                    ...rascunhos,
                    [idx]: { ...r, bonus: Number(e.target.value) || 0 },
                  })
                }
                className="glass-input"
                style={{ padding: "6px 10px", fontSize: 12 }}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => confirmarEdicao(idx)}
                  style={{
                    fontSize: 11,
                    color: "#C9953A",
                    padding: "2px 6px",
                  }}
                  title="Confirmar"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setModo(idx, "leitura")}
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.3)",
                    padding: "2px 6px",
                  }}
                  title="Cancelar"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        }

        return (
          <div
            key={idx}
            className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center"
            style={{
              padding: "6px 10px",
            }}
          >
            <span
              className="font-mono"
              style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}
            >
              {f.minimo}
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: 12,
                color: f.bonus > 0 ? "#C9953A" : "rgba(255,255,255,0.3)",
              }}
            >
              {formatBRL(f.bonus)}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => iniciarEdicao(idx)}
                title="Editar"
                style={{ ...BTN_ICON, color: "rgba(255,255,255,0.3)" }}
                className="hover:text-[#C9953A] transition"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => tentarExcluir(idx)}
                title={
                  config.faixas.length <= 1
                    ? "É necessário manter ao menos uma faixa"
                    : "Excluir"
                }
                style={{
                  ...BTN_ICON,
                  color: "rgba(255,255,255,0.2)",
                  opacity: config.faixas.length <= 1 ? 0.3 : 1,
                }}
                className="hover:text-[#e24b4a] transition"
              >
                ✕
              </button>
            </div>
          </div>
        )
      })}

      {erroExclusao && (
        <p
          style={{
            fontSize: 10,
            color: "#e24b4a",
            marginTop: 2,
          }}
        >
          {erroExclusao}
        </p>
      )}

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
        }}
        className="hover:text-[#C9953A] hover:border-[#C9953A55] transition"
      >
        + Adicionar faixa
      </button>
    </div>
  )
}

// ===================== ABA PESSOAS =====================

type ModoForm = "novo" | "editando"

function AbaPessoas({
  supabaseOk,
  colaboradores,
  colaboradoresInativos,
}: {
  supabaseOk: boolean
  colaboradores: Colaborador[]
  colaboradoresInativos: Colaborador[]
}) {
  const [modo, setModo] = useState<ModoForm>("novo")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nome, setNome] = useState("")
  const [funcao, setFuncao] = useState("")
  const [tipo, setTipo] = useState<"escala" | "gatilhos">("escala")
  const [faixas, setFaixas] = useState<Faixa[]>([{ minimo: 0, bonus: 0 }])
  const [gatilhos, setGatilhos] = useState<GatilhoConfig[]>([
    { chave: "g1", rotulo: "Novo gatilho", valor: 100 },
  ])
  const [modalExcluir, setModalExcluir] = useState<Colaborador | null>(null)
  const [inativosAbertos, setInativosAbertos] = useState(false)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  function limparFormulario() {
    setModo("novo")
    setEditingId(null)
    setNome("")
    setFuncao("")
    setTipo("escala")
    setFaixas([{ minimo: 0, bonus: 0 }])
    setGatilhos([{ chave: "g1", rotulo: "Novo gatilho", valor: 100 }])
    setStatus(null)
  }

  function iniciarEdicao(c: Colaborador) {
    setModo("editando")
    setEditingId(c.id ?? null)
    setNome(c.nome)
    setFuncao(c.funcao)
    setTipo(c.tipo)
    if (c.configuracao_padrao.tipo === "escala") {
      setFaixas(c.configuracao_padrao.faixas)
    } else {
      setGatilhos(c.configuracao_padrao.gatilhos)
    }
    setStatus(null)
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

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
    if (modo === "editando" && editingId) {
      fd.set("id", editingId)
      const r = await atualizarColaboradorAction(fd)
      if (r.ok) {
        setStatus("Atualizado ✓")
        limparFormulario()
        router.refresh()
      } else {
        setStatus(r.erro ?? "Erro")
      }
    } else {
      const r = await salvarColaboradorAction(fd)
      if (r.ok) {
        setStatus("Salvo ✓")
        limparFormulario()
        router.refresh()
      } else {
        setStatus(r.erro ?? "Erro")
      }
    }
  }

  async function desativar(id: string) {
    const fd = new FormData()
    fd.set("id", id)
    const r = await desativarColaboradorAction(fd)
    if (r.ok) router.refresh()
    else setStatus(r.erro ?? "Erro")
  }

  async function reativar(id: string) {
    const fd = new FormData()
    fd.set("id", id)
    const r = await reativarColaboradorAction(fd)
    if (r.ok) router.refresh()
    else setStatus(r.erro ?? "Erro")
  }

  async function excluirConfirmado() {
    if (!modalExcluir?.id) return
    const fd = new FormData()
    fd.set("id", modalExcluir.id)
    fd.set("nome", modalExcluir.nome)
    const r = await excluirColaboradorAction(fd)
    if (r.ok) {
      setModalExcluir(null)
      router.refresh()
    } else {
      setStatus(r.erro ?? "Erro ao excluir")
      setModalExcluir(null)
    }
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
        <div className="flex items-center justify-between">
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            {modo === "editando" ? "Editar colaborador" : "Adicionar colaborador"}
          </p>
          {modo === "editando" && (
            <button
              type="button"
              onClick={limparFormulario}
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.3)",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
              className="hover:text-[#C9953A] transition"
            >
              Cancelar edição
            </button>
          )}
        </div>

        <div className="space-y-3 mt-3">
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
            <EditorGatilhos
              config={{ tipo: "gatilhos", gatilhos }}
              onChange={(c) => {
                if (c.tipo === "gatilhos") setGatilhos(c.gatilhos)
              }}
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
              {pending
                ? "Salvando..."
                : modo === "editando"
                ? "Atualizar colaborador"
                : "Salvar colaborador"}
            </button>
            {status && (
              <span
                style={{
                  fontSize: 11,
                  color: status.includes("✓") ? "#4caf50" : "#e24b4a",
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
                className="flex items-center justify-between gap-2"
                style={{
                  padding: "10px 12px",
                  border: "0.5px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                }}
              >
                <div className="min-w-0">
                  <p
                    style={{
                      fontSize: 13,
                      color: "#fff",
                      fontWeight: 500,
                    }}
                    className="truncate"
                  >
                    {c.nome}
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.4)",
                      fontWeight: 300,
                    }}
                    className="truncate"
                  >
                    {c.funcao} · {c.tipo}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => iniciarEdicao(c)}
                    title="Editar"
                    style={{ ...BTN_ICON, color: "rgba(255,255,255,0.3)" }}
                    className="hover:text-[#C9953A] transition"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => c.id && desativar(c.id)}
                    title="Desativar"
                    style={{ ...BTN_ICON, color: "rgba(255,255,255,0.2)" }}
                    className="hover:text-[#e24b4a] transition"
                  >
                    🗑
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalExcluir(c)}
                    title="Excluir permanentemente"
                    style={{ ...BTN_ICON, color: "rgba(255,255,255,0.2)" }}
                    className="hover:text-[#e24b4a] transition"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {colaboradoresInativos.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setInativosAbertos((v) => !v)}
            className="flex items-center gap-2"
            style={{
              fontSize: 9,
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            Inativos ({colaboradoresInativos.length})
            <span
              style={{
                display: "inline-block",
                transform: inativosAbertos ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.2s ease",
              }}
            >
              ▾
            </span>
          </button>
          {inativosAbertos && (
            <div className="space-y-2">
              {colaboradoresInativos.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2"
                  style={{
                    padding: "10px 12px",
                    border: "0.5px solid rgba(255,255,255,0.04)",
                    borderRadius: 8,
                    opacity: 0.65,
                  }}
                >
                  <div className="min-w-0">
                    <p
                      style={{
                        fontSize: 13,
                        color: "rgba(255,255,255,0.7)",
                        fontWeight: 500,
                      }}
                      className="truncate"
                    >
                      {c.nome}
                    </p>
                    <p
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.3)",
                        fontWeight: 300,
                      }}
                      className="truncate"
                    >
                      {c.funcao} · {c.tipo}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => c.id && reativar(c.id)}
                      style={{
                        fontSize: 10,
                        color: "#C9953A",
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                        padding: "3px 8px",
                        border: "0.5px solid rgba(201,149,58,0.35)",
                        borderRadius: 4,
                      }}
                    >
                      Reativar
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalExcluir(c)}
                      title="Excluir permanentemente"
                      style={{ ...BTN_ICON, color: "rgba(255,255,255,0.2)" }}
                      className="hover:text-[#e24b4a] transition"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modalExcluir && (
        <ModalExcluir
          colaborador={modalExcluir}
          onCancel={() => setModalExcluir(null)}
          onConfirm={() => startTransition(() => excluirConfirmado())}
          pending={pending}
        />
      )}
    </div>
  )
}

function ModalExcluir({
  colaborador,
  onCancel,
  onConfirm,
  pending,
}: {
  colaborador: Colaborador
  onCancel: () => void
  onConfirm: () => void
  pending: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="glass"
        style={{
          padding: 22,
          maxWidth: 360,
          width: "100%",
        }}
      >
        <p
          style={{
            fontSize: 14,
            color: "#fff",
            fontWeight: 500,
            marginBottom: 8,
          }}
        >
          Excluir {colaborador.nome} permanentemente?
        </p>
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 300,
            marginBottom: 18,
          }}
        >
          Esta ação não pode ser desfeita.
        </p>
        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              padding: "8px 14px",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            style={{
              fontSize: 11,
              color: "#fff",
              background: "#e24b4a",
              border: "0.5px solid #e24b4a",
              borderRadius: 8,
              padding: "8px 14px",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              fontWeight: 500,
              opacity: pending ? 0.5 : 1,
            }}
          >
            {pending ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  )
}
