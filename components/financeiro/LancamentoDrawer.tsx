"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  criarLancamentoAction,
  atualizarLancamentoAction,
  excluirLancamentoAction,
  salvarRecorrenteAction,
  materializarMesAction,
} from "@/lib/financeiro-actions"
import { mesValido } from "@/lib/data"
import type {
  CategoriaFinanceira,
  ContaFinanceira,
  LancamentoFinanceiro,
  Periodicidade,
  StatusLancamento,
  TipoLancamento,
} from "@/lib/financeiro"

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
  /** Mês/ano vigentes — usados pra materializar lançamentos do recorrente
   *  recém-criado no mês corrente da listagem. */
  mesAtual?: string
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
  mesAtual,
  anoAtual,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoLancamento>(lancamento?.tipo ?? "despesa")
  const [status, setStatus] = useState<StatusLancamento>(
    lancamento?.status ?? "realizado"
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
  const [statusPadraoRec, setStatusPadraoRec] = useState<"previsto" | "realizado">("previsto")

  // Selects controlled — pra pré-selecionar primeira opção válida e
  // reagir a troca de tipo (categoria muda lista; resetamos seleção
  // pra não enviar UUID de outro tipo). Sem isso, lançamentos eram
  // salvos sem conta (=> saldo não atualizava) por usuário esquecer.
  const contasAtivas = contas.filter((c) => c.ativa)
  const categoriasIniciais = categorias.filter(
    (c) => c.tipo === (lancamento?.tipo ?? "despesa") && c.ativa
  )
  const [contaId, setContaId] = useState<string>(
    lancamento?.conta_id ?? contasAtivas[0]?.id ?? ""
  )
  const [categoriaId, setCategoriaId] = useState<string>(
    lancamento?.categoria_id ?? categoriasIniciais[0]?.id ?? ""
  )

  function trocarTipo(novoTipo: TipoLancamento) {
    setTipo(novoTipo)
    // Categoria depende do tipo: reseta pra primeira do novo tipo
    // (evita enviar UUID de categoria que não existe pra esse tipo).
    const primeiraDoTipo = categorias.find((c) => c.tipo === novoTipo && c.ativa)
    setCategoriaId(primeiraDoTipo?.id ?? "")
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
    fd.set("status_padrao", statusPadraoRec)
    const r = await salvarRecorrenteAction(fd)
    if (!r.ok) {
      setErro(r.erro ?? "Erro ao criar recorrente.")
      return
    }
    // Materializa lançamentos do mês corrente pra aparecer já na lista.
    // Chamada direta de server action (sem fetch HTTP) — antes tava
    // dependendo de POST /api/financeiro/materializar e o cookie de
    // sessão às vezes não chegava (PWA/SW intercepta).
    if (mesAtual && anoAtual) {
      const mesEnum = mesValido(mesAtual)
      const matResult = await materializarMesAction(mesEnum, anoAtual)
      if (matResult.ok) {
        setSucesso(
          `Recorrente criado. ${matResult.criados} lançamento(s) gerado(s) pra ${mesAtual}/${anoAtual}.`
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

              <Campo label="Data de competência" obrigatorio>
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

              <Campo
                label={
                  status === "realizado"
                    ? "Data de pagamento (obrigatória)"
                    : "Data de pagamento (opcional)"
                }
              >
                <input
                  type="date"
                  name="data_pagamento"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  className="glass-input"
                  style={{ width: "100%" }}
                />
              </Campo>
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

              <div>
                <Label>Status ao materializar</Label>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {(["previsto", "realizado"] as const).map((s) => (
                    <ToggleBtn
                      key={s}
                      ativo={statusPadraoRec === s}
                      onClick={() => setStatusPadraoRec(s)}
                      label={s === "realizado" ? "Realizado (pago)" : "Previsto (em aberto)"}
                      flex
                    />
                  ))}
                </div>
                <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, lineHeight: 1.4 }}>
                  {statusPadraoRec === "realizado"
                    ? "Lançamentos nascem como pagos · entram nos KPIs do mês imediatamente."
                    : 'Lançamentos aparecem em "Próximos vencimentos" até serem marcados como pagos.'}
                </p>
              </div>

              {periodicidade === "mensal" && (
                <Campo label="Dia do vencimento (1–31)" obrigatorio>
                  <input
                    type="number"
                    name="dia_vencimento"
                    min={1}
                    max={31}
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
            <input
              type="text"
              name="valor"
              required
              inputMode="decimal"
              placeholder="Ex: 1.234,56"
              defaultValue={
                lancamento ? String(lancamento.valor).replace(".", ",") : ""
              }
              className="glass-input"
              style={{ width: "100%" }}
            />
          </Campo>

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
                  ? "Ex: Mensalidade Aton Estofados"
                  : "Ex: Aluguel escritório"
              }
              defaultValue={lancamento?.descricao ?? ""}
              className="glass-input"
              style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Categoria">
            <select
              name="categoria_id"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="glass-input"
              style={{ width: "100%" }}
            >
              <option value="">· Sem categoria ·</option>
              {categorias
                .filter((c) => c.tipo === tipo && c.ativa)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </select>
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
                defaultValue={lancamento?.empresa_cliente ?? ""}
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
