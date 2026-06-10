"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { EmpresaDb, Mes, OrigemDadosReais } from "@/lib/data"
import { ANOS_DISPONIVEIS, MESES, ORIGEM_PADRAO, formatBRL } from "@/lib/data"
import { salvarMetaEmpresaAction } from "@/lib/metas-empresa"

type TipoEmpresa = "leads-reunioes-contratos" | "aton" | "hato" | "diego"

interface Campo {
  chave: string
  rotulo: string
  tipo: "brl" | "numero" | "percent"
}

/**
 * Define quais campos aparecem no editor de metas por (tipo de funil, origem).
 * Para origem 'organico' (prospecção fria) retiramos os campos exclusivos
 * de tráfego pago (verba/criativos) e adicionamos `respostas` no funil
 * leads-reunioes-contratos. O tipo 'diego' não tem origem (é participação
 * no faturamento) — sempre devolve a mesma lista.
 */
function camposPorTipo(
  tipo: TipoEmpresa,
  origem: OrigemDadosReais = ORIGEM_PADRAO
): Campo[] {
  const ehOrganico = origem === "organico"

  if (tipo === "hato") {
    const base: Campo[] = [
      { chave: "influenciadores", rotulo: "Influenciadores", tipo: "numero" },
      {
        chave: "vendas_influenciador",
        rotulo: "Vendas via influ.",
        tipo: "numero",
      },
      { chave: "vendas_direto", rotulo: "Vendas direto", tipo: "numero" },
      { chave: "total_vendas", rotulo: "Total de vendas", tipo: "numero" },
      { chave: "receita", rotulo: "Receita (R$)", tipo: "brl" },
      {
        chave: "custo_influenciadores",
        rotulo: "Custo influ. (R$)",
        tipo: "brl",
      },
    ]
    if (ehOrganico) return base
    return [
      { chave: "verba", rotulo: "Investimento (R$)", tipo: "brl" },
      { chave: "criativos", rotulo: "Criativos no mês", tipo: "numero" },
      ...base,
    ]
  }
  if (tipo === "aton") {
    const base: Campo[] = [
      { chave: "leads", rotulo: "Leads", tipo: "numero" },
      { chave: "orcamentos", rotulo: "Orçamentos", tipo: "numero" },
      { chave: "vendas", rotulo: "Vendas", tipo: "numero" },
      { chave: "ticket", rotulo: "Ticket médio (R$)", tipo: "brl" },
      { chave: "faturamento", rotulo: "Faturamento (R$)", tipo: "brl" },
    ]
    if (ehOrganico) {
      // Leads vem antes de Retorno no orgânico (a métrica de captação
      // tem prioridade visual sobre a métrica de engajamento).
      const [primeiro, ...resto] = base
      return [
        primeiro,
        { chave: "respostas", rotulo: "Retorno", tipo: "numero" },
        ...resto,
      ]
    }
    return [
      { chave: "verba", rotulo: "Investimento (R$)", tipo: "brl" },
      { chave: "criativos", rotulo: "Criativos no mês", tipo: "numero" },
      ...base,
    ]
  }
  if (tipo === "diego") {
    return [
      {
        chave: "faturamento_diego",
        rotulo: "Faturamento Diego (R$)",
        tipo: "brl",
      },
      { chave: "percentual", rotulo: "Percentual Hub (%)", tipo: "percent" },
      { chave: "receita_hub", rotulo: "Receita Hub (R$)", tipo: "brl" },
    ]
  }
  // leads-reunioes-contratos (default)
  const base: Campo[] = [
    { chave: "leads", rotulo: "Leads", tipo: "numero" },
    { chave: "reunioes", rotulo: "Reunião realizada", tipo: "numero" },
    { chave: "contratos", rotulo: "Contratos", tipo: "numero" },
    { chave: "clientes", rotulo: "Clientes ativos", tipo: "numero" },
    { chave: "churn", rotulo: "Churn", tipo: "numero" },
    { chave: "ticket", rotulo: "Ticket médio (R$)", tipo: "brl" },
    { chave: "faturamento", rotulo: "Faturamento (R$)", tipo: "brl" },
  ]
  if (ehOrganico) {
    // Orgânico: Leads → Retorno → Agendamentos → Reunião realizada → ...
    // (segue a ordem do funil comercial). `respostas` é o nome interno do
    // "Retorno"; `agendamentos` vira meta de reuniões agendadas.
    const [primeiro, ...resto] = base
    return [
      primeiro,
      { chave: "respostas", rotulo: "Retorno", tipo: "numero" },
      { chave: "agendamentos", rotulo: "Agendamentos", tipo: "numero" },
      ...resto,
    ]
  }
  return [
    { chave: "verba", rotulo: "Investimento (R$)", tipo: "brl" },
    { chave: "criativos", rotulo: "Criativos no mês", tipo: "numero" },
    ...base,
  ]
}

export default function DrawerEditarMeta({
  empresa,
  empresaNome,
  tipoEmpresa,
  ano,
  mesInicial,
  linhasPorMes,
  origem = ORIGEM_PADRAO,
}: {
  empresa: EmpresaDb
  empresaNome: string
  tipoEmpresa: TipoEmpresa
  ano: number
  mesInicial: Mes
  linhasPorMes: Record<string, Record<string, number>>
  origem?: OrigemDadosReais
}) {
  const [aberto, setAberto] = useState(false)
  const [mesSelecionado, setMesSelecionado] = useState<Mes>(mesInicial)
  const [anoSelecionado, setAnoSelecionado] = useState<number>(ano)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  const campos = camposPorTipo(tipoEmpresa, origem)
  const rotuloOrigem = origem === "pago" ? "Tráfego pago" : "Prospecção orgânica"
  // linhasPorMes só corresponde ao `ano` que a página carregou no servidor.
  // Se o usuário escolher outro ano, não temos os projetados aqui — mostra
  // apenas os campos sem hint.
  const temProjecao = anoSelecionado === ano
  const linhaMes = temProjecao ? linhasPorMes[mesSelecionado] ?? {} : {}

  function preencherValoresPara(mes: Mes, anoAtual: number) {
    const linha =
      anoAtual === ano ? linhasPorMes[mes] ?? {} : {}
    const iniciais: Record<string, string> = {}
    for (const c of campos) {
      const v = linha[c.chave]
      iniciais[c.chave] = typeof v === "number" ? String(v) : ""
    }
    setValores(iniciais)
  }

  function abrir() {
    preencherValoresPara(mesSelecionado, anoSelecionado)
    setAberto(true)
    setStatus(null)
  }

  function trocarMes(novoMes: Mes) {
    setMesSelecionado(novoMes)
    preencherValoresPara(novoMes, anoSelecionado)
    setStatus(null)
  }

  function trocarAno(novoAno: number) {
    setAnoSelecionado(novoAno)
    preencherValoresPara(mesSelecionado, novoAno)
    setStatus(null)
  }

  async function salvar() {
    const fd = new FormData()
    fd.set("empresa", empresa)
    fd.set("mes", mesSelecionado)
    fd.set("ano", String(anoSelecionado))
    fd.set("origem", origem)
    for (const c of campos) {
      const v = valores[c.chave]
      if (v !== undefined && v !== "") fd.set(c.chave, v)
    }
    const r = await salvarMetaEmpresaAction(fd)
    if (r.ok) {
      setStatus("Salvo ✓")
      router.refresh()
      setTimeout(() => {
        setStatus(null)
        setAberto(false)
      }, 1500)
    } else {
      setStatus(r.erro ?? "Erro")
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
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
            style={{
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(6px)",
            }}
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
                    Metas · {empresaNome}
                  </p>
                  <p
                    style={{
                      fontSize: 16,
                      color: "#fff",
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    Editar meta do mês
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      letterSpacing: "1.2px",
                      color: "#C9953A",
                      fontWeight: 600,
                      marginTop: 6,
                      textTransform: "uppercase",
                    }}
                  >
                    {rotuloOrigem}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 22,
                    lineHeight: 1,
                  }}
                  className="hover:text-white transition"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
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
                    Mês
                  </span>
                  <select
                    value={mesSelecionado}
                    onChange={(e) => trocarMes(e.target.value as Mes)}
                    className="glass-input"
                    style={{
                      marginTop: 6,
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 13,
                    }}
                  >
                    {MESES.map((m) => (
                      <option
                        key={m}
                        value={m}
                        style={{ background: "#0a0a0a" }}
                      >
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
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
                    Ano
                  </span>
                  <select
                    value={anoSelecionado}
                    onChange={(e) => trocarAno(Number(e.target.value))}
                    className="glass-input"
                    style={{
                      marginTop: 6,
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 13,
                    }}
                  >
                    {ANOS_DISPONIVEIS.map((a) => (
                      <option
                        key={a}
                        value={a}
                        style={{ background: "#0a0a0a" }}
                      >
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!temProjecao && (
                <p
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.35)",
                    fontWeight: 300,
                    marginTop: 8,
                    fontStyle: "italic",
                  }}
                >
                  Editando um ano diferente do atual · valores projetados não
                  disponíveis aqui.
                </p>
              )}
            </div>

            <div style={{ padding: 24 }}>
              <p
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 300,
                  marginBottom: 14,
                }}
              >
                Valores em branco usam o padrão do sistema. Ao salvar, só
                persiste o que foi editado · os demais meses permanecem
                intactos.
              </p>

              <div className="space-y-3">
                {campos.map((c) => {
                  const valorAtual = valores[c.chave] ?? ""
                  const projetado = linhaMes[c.chave]
                  const hint =
                    typeof projetado === "number"
                      ? c.tipo === "brl"
                        ? `Projetado: ${formatBRL(projetado)}`
                        : c.tipo === "percent"
                        ? `Projetado: ${projetado}%`
                        : `Projetado: ${projetado}`
                      : "Sem valor projetado"
                  return (
                    <label key={c.chave} className="block">
                      <span
                        style={{
                          fontSize: 9,
                          letterSpacing: "2px",
                          color: "rgba(255,255,255,0.4)",
                          textTransform: "uppercase",
                          fontWeight: 500,
                        }}
                      >
                        {c.rotulo}
                      </span>
                      <input
                        type="number"
                        step={c.tipo === "percent" ? "0.1" : "any"}
                        value={valorAtual}
                        onChange={(e) =>
                          setValores({ ...valores, [c.chave]: e.target.value })
                        }
                        placeholder="·"
                        className="glass-input"
                        style={{
                          marginTop: 6,
                          width: "100%",
                          padding: "8px 12px",
                          fontSize: 13,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          color: "rgba(255,255,255,0.3)",
                          marginTop: 4,
                          display: "block",
                        }}
                      >
                        {hint}
                      </span>
                    </label>
                  )
                })}
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => startTransition(() => salvar())}
                  disabled={pending}
                  className="btn-gold-filled uppercase"
                  style={{ opacity: pending ? 0.5 : 1 }}
                >
                  {pending ? "Salvando..." : "Salvar meta"}
                </button>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
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
          </aside>
        </div>
      )}
    </>
  )
}
