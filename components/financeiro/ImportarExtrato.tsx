"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  confirmarExtratoAction,
  ignorarLinhasAction,
  lerExtratoAction,
  type LinhaExtratoUI,
  type PlacarExtrato,
} from "@/lib/extrato-actions"
import type { CategoriaFinanceira, ContaFinanceira } from "@/lib/financeiro"
import { corDaCategoria, valorNumerico } from "@/lib/financeiro-regras"
import { formatBRL } from "@/lib/data"

const SEM_CONTA = "__sem_conta__"

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y.slice(2)}`
}

/**
 * Tela de importação de extrato.
 *
 * O desenho todo gira em torno de uma ideia: o arquivo do banco é um palpite,
 * não uma verdade. Por isso a leitura não cria nada, o placar diz de cara o
 * que já existe, e a revisão é agrupada por CONTA — que é a decisão que a
 * pessoa realmente precisa tomar linha a linha.
 */
export default function ImportarExtrato({
  contas,
  categorias,
}: {
  contas: ContaFinanceira[]
  categorias: CategoriaFinanceira[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [placar, setPlacar] = useState<PlacarExtrato | null>(null)
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<LinhaExtratoUI[]>([])
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [massaConta, setMassaConta] = useState("")
  const [massaCategoria, setMassaCategoria] = useState("")

  const contaById = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas])

  function ler(fd: FormData) {
    setErro(null)
    setAviso(null)
    startTransition(async () => {
      const r = await lerExtratoAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível ler o extrato.")
        return
      }
      setPlacar(r.placar ?? null)
      setArquivo(r.arquivo ?? null)
      setLinhas(r.linhas ?? [])
      // Tudo marcado por padrão: quem revisou e concorda não deveria precisar
      // clicar 60 vezes. Desmarcar o que não quer é o caso raro.
      setMarcadas(new Set((r.linhas ?? []).map((l) => l.id)))
    })
  }

  function alternar(id: string) {
    setMarcadas((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function alternarTodas() {
    setMarcadas((atual) =>
      atual.size === linhas.length ? new Set() : new Set(linhas.map((l) => l.id))
    )
  }

  /** Edição local. Só vai ao banco na confirmação — assim dá pra ajustar
   *  cinquenta linhas sem cinquenta idas ao servidor. */
  function editar(id: string, campo: keyof LinhaExtratoUI, valor: string | null) {
    setLinhas((atual) =>
      atual.map((l) =>
        l.id === id ? { ...l, [campo]: valor, classificacao_origem: "manual" } : l
      )
    )
  }

  function aplicarEmMassa() {
    if (!massaConta && !massaCategoria) return
    setLinhas((atual) =>
      atual.map((l) => {
        if (!marcadas.has(l.id)) return l
        return {
          ...l,
          conta_id: massaConta ? massaConta : l.conta_id,
          categoria_id: massaCategoria ? massaCategoria : l.categoria_id,
          classificacao_origem: "manual",
        }
      })
    )
    setAviso(`Aplicado a ${marcadas.size} linha(s).`)
  }

  function importar() {
    const selecionadas = linhas.filter((l) => marcadas.has(l.id))
    if (selecionadas.length === 0) {
      setErro("Marque pelo menos uma linha.")
      return
    }
    setErro(null)
    setAviso(null)
    startTransition(async () => {
      const r = await confirmarExtratoAction(
        selecionadas.map((l) => ({
          id: l.id,
          conta_id: l.conta_id,
          categoria_id: l.categoria_id,
          descricao: l.descricao,
        }))
      )
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível importar.")
        return
      }
      const importadasIds = new Set(
        selecionadas.filter((l) => l.conta_id).map((l) => l.id)
      )
      // As sem conta CONTINUAM na lista: elas não foram importadas, e sumir
      // daria a impressão de que foram.
      setLinhas((atual) => atual.filter((l) => !importadasIds.has(l.id)))
      setMarcadas(new Set())
      setAviso(
        r.semConta > 0
          ? `${r.criados} lançamento(s) criado(s). ${r.semConta} ficaram de fora por não ter empresa — continuam na lista.`
          : `${r.criados} lançamento(s) criado(s).`
      )
      router.refresh()
    })
  }

  function ignorar() {
    const ids = [...marcadas]
    if (ids.length === 0) {
      setErro("Marque pelo menos uma linha.")
      return
    }
    setErro(null)
    startTransition(async () => {
      const r = await ignorarLinhasAction(ids)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível ignorar.")
        return
      }
      setLinhas((atual) => atual.filter((l) => !marcadas.has(l.id)))
      setMarcadas(new Set())
      setAviso(`${r.ignoradas} linha(s) ignoradas. Elas não voltam nas próximas importações.`)
    })
  }

  // Agrupa por conta — "Sem empresa" primeiro, porque é o grupo que exige
  // decisão antes de qualquer coisa ser importada.
  const grupos = useMemo(() => {
    const mapa = new Map<string, LinhaExtratoUI[]>()
    for (const l of linhas) {
      const chave = l.conta_id ?? SEM_CONTA
      const lista = mapa.get(chave) ?? []
      lista.push(l)
      mapa.set(chave, lista)
    }
    return [...mapa.entries()].sort(([a], [b]) => {
      if (a === SEM_CONTA) return -1
      if (b === SEM_CONTA) return 1
      return (contaById.get(a)?.nome ?? "").localeCompare(contaById.get(b)?.nome ?? "")
    })
  }, [linhas, contaById])

  const semConta = linhas.filter((l) => !l.conta_id).length

  return (
    <>
      {/* ── Passo 1: ler o arquivo ── */}
      <section
        className="glass"
        style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div>
          <h3 style={{ fontSize: 17 }}>1 · Ler o extrato</h3>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6, lineHeight: 1.6 }}>
            No app do banco: <strong>Extrato → Exportar → OFX</strong> (às vezes
            aparece como &quot;OFX/Money&quot;). Não serve PDF nem CSV. Exporte um
            mês por vez.
          </p>
        </div>

        <form action={ler} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="file"
            name="arquivo"
            required
            /* `*​/*` é proposital: no iPhone o .ofx não tem tipo registrado e
               ficaria cinza, impossível de selecionar. Quem valida de verdade
               é o servidor, que lê o conteúdo do arquivo. */
            accept="*/*"
            className="glass-input"
            style={{ flex: "1 1 240px" }}
          />
          <button type="submit" disabled={pending} className="btn-gold-filled">
            {pending ? "Lendo…" : "Ler extrato"}
          </button>
        </form>

        {erro && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "rgba(239,68,68,0.12)",
              border: "0.5px solid rgba(239,68,68,0.40)",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            {erro}
          </div>
        )}
        {aviso && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "rgba(22,163,74,0.12)",
              border: "0.5px solid rgba(22,163,74,0.40)",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            {aviso}
          </div>
        )}
      </section>

      {/* ── Placar ── */}
      {placar && (
        <section
          className="glass"
          style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div>
            <h3 style={{ fontSize: 17 }}>2 · O que veio no arquivo</h3>
            {arquivo && (
              <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{arquivo}</p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 12 }}>
            <Numero rotulo="No arquivo" valor={placar.noArquivo} />
            <Numero rotulo="Já lançadas" valor={placar.jaLancadas} />
            <Numero rotulo="A conferir" valor={placar.aRevisar} destaque />
            <Numero rotulo="Já classificadas" valor={placar.jaClassificadas} />
          </div>

          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
              color: "var(--text-3)",
              lineHeight: 1.6,
            }}
          >
            {placar.jaLancadas > 0 && (
              <li>
                <strong>{placar.jaLancadas}</strong> já tinham virado lançamento
                numa importação anterior — não entram de novo.
              </li>
            )}
            {placar.retomadas > 0 && (
              <li>
                <strong>{placar.retomadas}</strong> estavam pendentes de um envio
                anterior e voltaram para esta revisão.
              </li>
            )}
            {placar.ignoradasAntes > 0 && (
              <li>
                <strong>{placar.ignoradasAntes}</strong> você já tinha ignorado —
                continuam de fora.
              </li>
            )}
            {placar.duplicadasNoArquivo > 0 && (
              <li>
                <strong>{placar.duplicadasNoArquivo}</strong> vinham repetidas
                dentro do próprio arquivo e foram unificadas.
              </li>
            )}
            {placar.jaClassificadas > 0 && (
              <li>
                <strong>{placar.jaClassificadas}</strong> chegaram classificadas
                pelo que você escolheu em importações passadas. A regra é um{" "}
                <strong>palpite</strong>, não uma decisão — confira antes.
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ── Revisão ── */}
      {linhas.length > 0 && (
        <section className="glass" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div>
              <h3 style={{ fontSize: 17 }}>3 · Conferir e importar</h3>
              <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                {marcadas.size} de {linhas.length} marcadas
                {semConta > 0 && ` · ${semConta} sem conta`}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <BotaoBarra onClick={alternarTodas} disabled={pending}>
                {marcadas.size === linhas.length ? "Desmarcar todas" : "Marcar todas"}
              </BotaoBarra>

              <select
                value={massaConta}
                onChange={(e) => setMassaConta(e.target.value)}
                className="glass-input"
                style={{ width: "auto", minWidth: 150 }}
              >
                <option value="">Conta (em massa)…</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>

              <select
                value={massaCategoria}
                onChange={(e) => setMassaCategoria(e.target.value)}
                className="glass-input"
                style={{ width: "auto", minWidth: 170 }}
              >
                <option value="">Categoria (em massa)…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tipo === "receita" ? "↑" : "↓"} {c.nome}
                  </option>
                ))}
              </select>

              <BotaoBarra onClick={aplicarEmMassa} disabled={pending || marcadas.size === 0}>
                Aplicar às marcadas
              </BotaoBarra>

              <div style={{ flex: 1 }} />

              <BotaoBarra onClick={ignorar} disabled={pending || marcadas.size === 0} perigo>
                Ignorar
              </BotaoBarra>
              <button
                type="button"
                onClick={importar}
                disabled={pending || marcadas.size === 0}
                className="btn-gold-filled"
              >
                {pending ? "Importando…" : `Importar ${marcadas.size} marcada(s)`}
              </button>
            </div>
          </div>

          {grupos.map(([chaveConta, doGrupo]) => {
            const conta = chaveConta === SEM_CONTA ? null : contaById.get(chaveConta)
            const total = doGrupo.reduce((s, l) => s + valorNumerico(l.valor), 0)
            return (
              <div key={chaveConta}>
                <div
                  style={{
                    padding: "10px 24px",
                    background: "var(--surface-2)",
                    borderTop: "1px solid var(--border)",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 600 }}>
                    {conta?.nome ?? (
                      <span style={{ color: "var(--warning)" }}>Sem conta definida</span>
                    )}
                    <span style={{ color: "var(--text-3)", fontWeight: 400 }}>
                      {" · "}
                      {doGrupo.length} linha{doGrupo.length === 1 ? "" : "s"}
                    </span>
                  </p>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: total >= 0 ? "var(--success)" : "var(--destructive)",
                    }}
                  >
                    {formatBRL(total)}
                  </span>
                </div>

                {doGrupo.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      padding: "12px 24px",
                      borderBottom: "1px solid var(--border)",
                      flexWrap: "wrap",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={marcadas.has(l.id)}
                      onChange={() => alternar(l.id)}
                      style={{ marginTop: 10, flexShrink: 0, cursor: "pointer" }}
                      aria-label={`Marcar ${l.descricao}`}
                    />

                    <div style={{ width: 74, flexShrink: 0, marginTop: 8 }}>
                      <p style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                        {formatDataBR(l.data)}
                      </p>
                      {l.hora && (
                        <p style={{ fontSize: 10, color: "var(--text-3)" }}>{l.hora}</p>
                      )}
                    </div>

                    <div style={{ flex: "2 1 220px", minWidth: 0 }}>
                      <input
                        type="text"
                        value={l.descricao}
                        onChange={(e) => editar(l.id, "descricao", e.target.value)}
                        className="glass-input"
                        style={{ width: "100%" }}
                      />
                      <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
                        {l.classificacao_origem === "regra"
                          ? "classificada por regra aprendida"
                          : l.classificacao_origem === "manual"
                            ? "classificada por você"
                            : "sem classificação"}
                        {l.trntype && ` · ${l.trntype}`}
                      </p>
                    </div>

                    <span
                      style={{
                        width: 110,
                        textAlign: "right",
                        marginTop: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        color: l.tipo === "receita" ? "var(--success)" : "var(--destructive)",
                        flexShrink: 0,
                      }}
                    >
                      {formatBRL(valorNumerico(l.valor))}
                    </span>

                    <select
                      value={l.conta_id ?? ""}
                      onChange={(e) => editar(l.id, "conta_id", e.target.value || null)}
                      className="glass-input"
                      style={{ flex: "1 1 150px", minWidth: 130 }}
                    >
                      <option value="">De qual empresa?</option>
                      {contas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>

                    <select
                      value={l.categoria_id ?? ""}
                      onChange={(e) => editar(l.id, "categoria_id", e.target.value || null)}
                      className="glass-input"
                      style={{ flex: "1 1 150px", minWidth: 130 }}
                    >
                      <option value="">Sem categoria</option>
                      {categorias
                        .filter((c) => c.tipo === l.tipo)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
            )
          })}
        </section>
      )}

      {placar && linhas.length === 0 && (
        <section
          className="glass"
          style={{ padding: "32px 24px", textAlign: "center", color: "var(--text-3)" }}
        >
          Nada para conferir — todas as transações deste arquivo já tinham sido
          tratadas antes.
        </section>
      )}
    </>
  )
}

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: number
  destaque?: boolean
}) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        background: "var(--surface-2)",
        border: destaque ? "0.5px solid rgba(201,149,58,0.40)" : "0.5px solid transparent",
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: "var(--text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {rotulo}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginTop: 4,
          color: destaque ? "var(--accent)" : "var(--text-1)",
        }}
      >
        {valor}
      </p>
    </div>
  )
}

function BotaoBarra({
  onClick,
  disabled,
  perigo,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  perigo?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 14px",
        background: "transparent",
        border: `1px solid ${perigo ? "rgba(239,68,68,0.40)" : "var(--border)"}`,
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
        color: perigo ? "#ef4444" : "var(--foreground)",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  )
}
