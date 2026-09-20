"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  criarLancamentoAction,
  atualizarLancamentoAction,
  excluirLancamentoAction,
  salvarRecorrenteAction,
  materializarPeriodoAction,
} from "@/lib/financeiro-actions"
import { rotuloMes } from "@/lib/financeiro-regras"
import type {
  CategoriaFinanceira,
  ContaFinanceira,
  LancamentoFinanceiro,
  Periodicidade,
  StatusLancamento,
  TipoLancamento,
} from "@/lib/financeiro"
import CampoInteiro from "@/components/inputs/CampoInteiro"
import CampoMoeda from "@/components/inputs/CampoMoeda"
import ComboboxCategoria from "./ComboboxCategoria"
import { FORMAS_PAGAMENTO, FORMA_PAGAMENTO_PADRAO } from "@/lib/financeiro-regras"

interface Empresa {
  nome: string
  slug: string
}

interface Props {
  aberto: boolean
  fechar: () => void
  categorias: CategoriaFinanceira[]
  contas: ContaFinanceira[]
  empresas: Empresa[]
  lancamento?: LancamentoFinanceiro | null
  /** Valores sugeridos ao ABRIR um lançamento novo (não é edição).
   *  Usado pela Conferência com o Sentinela, que já sabe empresa e valor. */
  prefill?: {
    tipo?: TipoLancamento
    valor?: number
    descricao?: string
    empresa_cliente?: string
  } | null
  /** Mês (1–12) e ano vigentes — usados pra materializar os lançamentos do
   *  recorrente recém-criado já no mês que a listagem está mostrando. */
  mesNum?: number
  anoAtual?: number
}

type Frequencia = "variavel" | "recorrente"

export default function LancamentoDrawer({
  aberto,
  fechar,
  categorias,
  contas,
  empresas,
  lancamento,
  prefill,
  mesNum,
  anoAtual,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoLancamento>(
    lancamento?.tipo ?? prefill?.tipo ?? "despesa"
  )
  // Default PREVISTO: o lançamento nasce previsto e só vira realizado
  // quando o usuário marca como pago.
  const [status, setStatus] = useState<StatusLancamento>(
    lancamento?.status ?? "previsto"
  )
  const [dataPagamento, setDataPagamento] = useState<string>(
    lancamento?.data_pagamento ?? ""
  )

  /** Auto-preenche data_pagamento ao marcar como realizado se estiver
   *  vazia — evita fricção de "lançamento realizado precisa de data
   *  de pagamento" em troca rápida do status. */
  function trocarStatus(novoStatus: StatusLancamento) {
    setStatus(novoStatus)
    if (novoStatus === "realizado" && !dataPagamento) {
      setDataPagamento(new Date().toISOString().slice(0, 10))
    }
  }
  const editando = !!lancamento
  const [frequencia, setFrequencia] = useState<Frequencia>(
    editando && lancamento?.recorrente_id ? "recorrente" : "variavel"
  )
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("mensal")

  // Selects controlled — pra pré-selecionar primeira opção válida e
  // reagir a troca de tipo (categoria muda lista; resetamos seleção
  // pra não enviar UUID de outro tipo). Sem isso, lançamentos eram
  // salvos sem conta (=> saldo não atualizava) por usuário esquecer.
  const contasAtivas = contas.filter((c) => c.ativa)
  const [contaId, setContaId] = useState<string>(
    lancamento?.conta_id ?? contasAtivas[0]?.id ?? ""
  )
  const [categoriaId, setCategoriaId] = useState<string>(
    lancamento?.categoria_id ?? ""
  )
  const [formaPagamento, setFormaPagamento] = useState<string>(
    lancamento?.forma_pagamento ?? FORMA_PAGAMENTO_PADRAO
  )

  function trocarTipo(novoTipo: TipoLancamento) {
    setTipo(novoTipo)
    // R13. Trocar o tipo LIMPA a categoria. Escolher automaticamente a
    // primeira do novo tipo parece prestativo, mas grava uma categoria que
    // ninguém escolheu — e uma despesa classificada errado só aparece no DRE
    // do mês seguinte, quando já é tarde.
    setCategoriaId("")
  }

  if (!aberto) return null

  const lancamentoDeRecorrente = editando && !!lancamento?.recorrente_id

  /**
   * Refresh defensivo: router.refresh() + reload duro depois de 250ms.
   * O reload garante invalidação do Router Cache do Next + Service Worker
   * PWA — sem ele, usuários relataram que o lançamento criado aparecia
   * só após hard refresh manual.
   */
  function refreshUI() {
    router.refresh()
    setTimeout(() => {
      window.location.reload()
    }, 250)
  }

  async function onSubmitVariavel(fd: FormData) {
    fd.set("tipo", tipo)
    fd.set("status", status)
    if (editando) fd.set("id", lancamento!.id)
    const action = editando ? atualizarLancamentoAction : criarLancamentoAction
    const r = await action(fd)
    if (!r.ok) {
      setErro(r.erro ?? "Erro desconhecido.")
      return
    }
    refreshUI()
    fechar()
  }

  async function onSubmitRecorrente(fd: FormData) {
    // Mapeia descricao→nome pra bater com a coluna pagamento_recorrente.nome.
    const nome = String(fd.get("descricao") ?? "").trim()
    fd.set("nome", nome)
    fd.set("tipo", tipo)
    fd.set("periodicidade", periodicidade)
    fd.set("ativo", "on")
    const r = await salvarRecorrenteAction(fd)
    if (!r.ok) {
      setErro(r.erro ?? "Erro ao criar recorrente.")
      return
    }
    // Materializa lançamentos do mês corrente pra aparecer já na lista.
    // Chamada direta de server action (sem fetch HTTP) — antes tava
    // dependendo de POST /api/financeiro/materializar e o cookie de
    // sessão às vezes não chegava (PWA/SW intercepta).
    if (mesNum && anoAtual) {
      const matResult = await materializarPeriodoAction(anoAtual, mesNum)
      if (matResult.ok) {
        setSucesso(
          `Recorrente criado. ${matResult.criados} lançamento(s) gerado(s) pra ${rotuloMes(mesNum)}/${anoAtual}.`
        )
      } else if (matResult.erro) {
        // Recorrente já salvou — só sinaliza problema de materialização.
        setSucesso(
          `Recorrente criado. (Materialização falhou: ${matResult.erro}.)`
        )
      }
    }
    refreshUI()
    // Espera um beat pra usuário ler a mensagem antes do fechar+reload.
    setTimeout(() => fechar(), 800)
  }

  async function onSubmit(fd: FormData) {
    setErro(null)
    setSucesso(null)
    startTransition(async () => {
      if (frequencia === "recorrente" && !editando) {
        await onSubmitRecorrente(fd)
      } else {
        await onSubmitVariavel(fd)
      }
    })
  }

  async function onExcluir() {
    if (!lancamento) return
    if (!confirm(`Excluir lançamento "${lancamento.descricao}"?`)) return
    setErro(null)
    startTransition(async () => {
      const r = await excluirLancamentoAction(lancamento.id)
      if (!r.ok) {
        setErro(r.erro ?? "Erro ao excluir.")
        return
      }
      refreshUI()
      fechar()
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
          width: "min(540px, 100vw)",
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
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontSize: 22 }}>
            {editando
              ? lancamentoDeRecorrente
                ? "Editar lançamento (de recorrência)"
                : "Editar lançamento"
              : "Novo lançamento"}
          </h2>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
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

        {lancamentoDeRecorrente && (
          <div
            style={{
              padding: 12,
              background: "rgba(201,149,58,0.08)",
              border: "0.5px solid rgba(201,149,58,0.30)",
              borderRadius: 8,
              color: "var(--text-2)",
              fontSize: 12,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            Esse lançamento foi gerado por uma recorrência. Editar aqui altera
            só este lançamento. Pra mudar o template (valor, dia, fim), vá em{" "}
            <strong>Recorrentes</strong>.
          </div>
        )}

        <form
          action={onSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* Tipo: receita / despesa */}
          <div>
            <Label>Tipo</Label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["receita", "despesa"] as const).map((t) => (
                <ToggleBtn
                  key={t}
                  ativo={tipo === t}
                  onClick={() => trocarTipo(t)}
                  label={t === "receita" ? "Receita" : "Despesa"}
                  flex
                />
              ))}
            </div>
          </div>

          {/* Frequência: variável / recorrente — só na criação */}
          {!editando && (
            <div>
              <Label>Frequência</Label>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <ToggleBtn
                  ativo={frequencia === "variavel"}
                  onClick={() => setFrequencia("variavel")}
                  label="Variável"
                  flex
                />
                <ToggleBtn
                  ativo={frequencia === "recorrente"}
                  onClick={() => setFrequencia("recorrente")}
                  label="Recorrente"
                  flex
                />
              </div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                {frequencia === "variavel"
                  ? "Lançamento único pra essa data."
                  : "Cria um template que gera lançamentos automaticamente todo mês."}
              </p>
            </div>
          )}

          {/* === Status + datas: sempre visível em criação variável OU
              em qualquer edição (mesmo lançamento que veio de recorrente,
              o usuário precisa poder marcar como pago aqui) === */}
          {(frequencia === "variavel" || editando) && (
            <>
              <div>
                <Label>Status</Label>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {(["previsto", "realizado", "cancelado"] as const).map((s) => (
                    <ToggleBtn
                      key={s}
                      ativo={status === s}
                      onClick={() => trocarStatus(s)}
                      label={s.charAt(0).toUpperCase() + s.slice(1)}
                      flex
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <Campo label="Competência" obrigatorio>
                    <input
                      type="date"
                      name="data"
                      required
                      defaultValue={
                        lancamento?.data ?? new Date().toISOString().slice(0, 10)
                      }
                      className="glass-input"
                      style={{ width: "100%" }}
                    />
                  </Campo>
                  <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
                    Quando o fato aconteceu.
                  </p>
                </div>
                <div style={{ flex: "1 1 160px" }}>
                  <Campo label="Vencimento">
                    <input
                      type="date"
                      name="data_vencimento"
                      defaultValue={lancamento?.data_vencimento ?? ""}
                      className="glass-input"
                      style={{ width: "100%" }}
                    />
                  </Campo>
                  <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
                    Quando o dinheiro deve andar. Vazio = usa a competência.
                  </p>
                </div>
              </div>

              {status === "realizado" && (
                <Campo label="Data de pagamento">
                  <input
                    type="date"
                    name="data_pagamento"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                    className="glass-input"
                    style={{ width: "100%" }}
                  />
                  <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
                    Vazio assume hoje.
                  </p>
                </Campo>
              )}
            </>
          )}

          {/* === BLOCO RECORRENTE === */}
          {frequencia === "recorrente" && !editando && (
            <>
              <div>
                <Label>Periodicidade</Label>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {(["mensal", "anual", "semanal"] as const).map((p) => (
                    <ToggleBtn
                      key={p}
                      ativo={periodicidade === p}
                      onClick={() => setPeriodicidade(p)}
                      label={p.charAt(0).toUpperCase() + p.slice(1)}
                      flex
                    />
                  ))}
                </div>
              </div>

              <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.4 }}>
                Cada mês gera um lançamento <strong>previsto</strong> em
                &quot;Próximos vencimentos&quot;. Ele só entra no caixa quando
                você marcar como pago.
              </p>

              {periodicidade === "mensal" && (
                <Campo label="Dia do vencimento (1–31)" obrigatorio>
                  <CampoInteiro
                    name="dia_vencimento"
                    maxDigitos={2}
                    valorMax={31}
                    required
                    defaultValue={5}
                    className="glass-input"
                    style={{ width: 120 }}
                  />
                </Campo>
              )}

              <Campo label="Início" obrigatorio>
                <input
                  type="date"
                  name="inicio"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="glass-input"
                  style={{ width: "100%" }}
                />
              </Campo>

              <Campo label="Fim (opcional · vazio = indeterminado)">
                <input
                  type="date"
                  name="fim"
                  className="glass-input"
                  style={{ width: "100%" }}
                />
              </Campo>
            </>
          )}

          {/* === CAMPOS COMUNS === */}
          <Campo label="Valor (R$)" obrigatorio>
            <CampoMoeda
              name="valor"
              required
              placeholder="R$ 1.234,56"
              defaultValue={lancamento?.valor ?? prefill?.valor ?? null}
              className="glass-input"
              style={{ width: "100%" }}
            />
          </Campo>

          {frequencia === "variavel" && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px" }}>
                <Campo label="Forma de pagamento">
                  <select
                    name="forma_pagamento"
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value)}
                    className="glass-input"
                    style={{ width: "100%" }}
                  >
                    <option value="">· Não informada ·</option>
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f} value={f}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <Campo label="Origem">
                  <input
                    type="text"
                    name="origem"
                    maxLength={120}
                    defaultValue={lancamento?.origem ?? ""}
                    placeholder={
                      tipo === "receita"
                        ? "Cliente, venda avulsa…"
                        : "Fornecedor, prestador…"
                    }
                    className="glass-input"
                    style={{ width: "100%" }}
                  />
                </Campo>
              </div>
            </div>
          )}

          <Campo
            label={frequencia === "recorrente" ? "Nome do pagamento" : "Descrição"}
            obrigatorio
          >
            <input
              type="text"
              name="descricao"
              required
              maxLength={200}
              placeholder={
                frequencia === "recorrente"
                  ? "Ex: Aluguel · Vercel Pro · Salário Bruno"
                  : tipo === "receita"
                  ? "Ex: Mensalidade Tato Estofados"
                  : "Ex: Aluguel escritório"
              }
              defaultValue={lancamento?.descricao ?? prefill?.descricao ?? ""}
              className="glass-input"
              style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Categoria">
            <ComboboxCategoria
              categorias={categorias}
              tipo={tipo}
              valor={categoriaId}
              onChange={setCategoriaId}
            />
          </Campo>

          <Campo label="Conta">
            <select
              name="conta_id"
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              className="glass-input"
              style={{ width: "100%" }}
            >
              <option value="">· Sem conta ·</option>
              {contasAtivas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {!contaId && frequencia === "variavel" && (
              <p
                style={{
                  fontSize: 11,
                  color: "#eab308",
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                ⚠ Sem conta selecionada: o lançamento será registrado mas
                <strong> não vai afetar o saldo</strong> de nenhuma conta.
              </p>
            )}
          </Campo>

          {tipo === "receita" && frequencia === "variavel" && empresas.length > 0 && (
            <Campo label="Empresa cliente (opcional)">
              <select
                name="empresa_cliente"
                defaultValue={lancamento?.empresa_cliente ?? prefill?.empresa_cliente ?? ""}
                className="glass-input"
                style={{ width: "100%" }}
              >
                <option value="">· Não vinculada ·</option>
                {empresas.map((e) => (
                  <option key={e.slug} value={e.nome}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <Campo label="Observações">
            <textarea
              name="observacoes"
              rows={3}
              maxLength={500}
              defaultValue={lancamento?.observacoes ?? ""}
              className="glass-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </Campo>

          {erro && (
            <div
              style={{
                padding: 12,
                background: "rgba(239, 68, 68, 0.12)",
                border: "0.5px solid rgba(239, 68, 68, 0.40)",
                borderRadius: 8,
                color: "var(--text-1)",
                fontSize: 13,
              }}
            >
              {erro}
            </div>
          )}
          {sucesso && (
            <div
              style={{
                padding: 12,
                background: "rgba(22, 163, 74, 0.12)",
                border: "0.5px solid rgba(22, 163, 74, 0.40)",
                borderRadius: 8,
                color: "var(--text-1)",
                fontSize: 13,
              }}
            >
              {sucesso}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="submit"
              disabled={pending}
              className="btn-gold-filled"
              style={{ flex: 1, opacity: pending ? 0.6 : 1 }}
            >
              {pending
                ? "Salvando..."
                : editando
                ? "Salvar alterações"
                : frequencia === "recorrente"
                ? "Criar recorrente"
                : "Criar lançamento"}
            </button>
            {editando && (
              <button
                type="button"
                onClick={onExcluir}
                disabled={pending}
                style={{
                  padding: "0 16px",
                  height: 32,
                  background: "transparent",
                  border: "0.5px solid rgba(239, 68, 68, 0.40)",
                  borderRadius: 6,
                  color: "#ef4444",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: 12,
                }}
              >
                Excluir
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function ToggleBtn({
  ativo,
  onClick,
  label,
  flex,
}: {
  ativo: boolean
  onClick: () => void
  label: string
  flex?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: flex ? 1 : undefined,
        padding: "10px 14px",
        borderRadius: 6,
        border: ativo
          ? "0.5px solid var(--accent)"
          : "0.5px solid rgba(255,255,255,0.10)",
        background: ativo ? "rgba(201,149,58,0.15)" : "transparent",
        color: ativo ? "var(--accent)" : "var(--text-2)",
        fontWeight: ativo ? 600 : 500,
        fontSize: 12,
        letterSpacing: "0.3px",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-3)",
        letterSpacing: "0.5px",
        textTransform: "uppercase",
      }}
    >
      {children}
    </p>
  )
}

function Campo({
  label,
  obrigatorio,
  children,
}: {
  label: string
  obrigatorio?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <Label>
        {label}
        {obrigatorio && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
      </Label>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  )
}
