/**
 * Testes das regras do financeiro. Rodar: `npm run test:financeiro`.
 *
 * O que estes testes protegem, em uma frase: que o número do totalizador seja
 * o mesmo número da soma das linhas — e que o filtro escrito para o Postgres
 * escolha exatamente as mesmas linhas que a função em memória escolheria.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import {
  corDeterministica,
  dataDoPeriodo,
  dataDoRecorrenteNoMes,
  dentroDoPeriodo,
  dentroDoPeriodoPorVencimento,
  ehCaminhoInternoSeguro,
  entraNaSituacao,
  estaAtrasado,
  filtroPeriodoPostgREST,
  proximaCorLivre,
  recorrenteCobreMes,
  recorrentesAMaterializar,
  rotulosDaSituacao,
  saldoDaConta,
  somarLancamentos,
  ultimoDiaDoMes,
  valorNumerico,
  type LancamentoParaRegra,
} from "./financeiro-regras"

// ============================================================
// Simulador do filtro do Postgres
// ============================================================

/**
 * Interpreta a string que vai para `.or(...)` do PostgREST usando a lógica de
 * TRÊS valores do SQL: comparar com NULL não dá `false`, dá UNKNOWN — e
 * UNKNOWN não passa no WHERE. É exatamente essa sutileza que faz o terceiro
 * ramo de R3 ser necessário, e é isso que o simulador precisa reproduzir para
 * o teste ter valor.
 */
type Tri = true | false | "unknown"

function avaliarCondicao(linha: Record<string, unknown>, cond: string): Tri {
  const p1 = cond.indexOf(".")
  const p2 = cond.indexOf(".", p1 + 1)
  const col = cond.slice(0, p1)
  const op = cond.slice(p1 + 1, p2)
  const valor = cond.slice(p2 + 1)
  const atual = linha[col]

  if (op === "is") return (atual === null || atual === undefined) === (valor === "null")
  if (atual === null || atual === undefined) return "unknown"

  const a = String(atual)
  switch (op) {
    case "eq": return a === valor
    case "neq": return a !== valor
    case "gte": return a >= valor
    case "lte": return a <= valor
    default: throw new Error(`operador não suportado no simulador: ${op}`)
  }
}

/** Quebra "and(a),and(b)" nos grupos de primeiro nível. */
function gruposAnd(expr: string): string[] {
  const grupos: string[] = []
  let profundidade = 0
  let atual = ""
  for (const ch of expr) {
    if (ch === "(") profundidade++
    if (ch === ")") profundidade--
    if (ch === "," && profundidade === 0) {
      grupos.push(atual)
      atual = ""
      continue
    }
    atual += ch
  }
  if (atual) grupos.push(atual)
  return grupos.map((g) => g.trim().replace(/^and\(/, "").replace(/\)$/, ""))
}

function linhaPassaNoFiltro(linha: Record<string, unknown>, expr: string): boolean {
  for (const grupo of gruposAnd(expr)) {
    const conds = grupo.split(",")
    let todasVerdadeiras = true
    for (const c of conds) {
      if (avaliarCondicao(linha, c) !== true) {
        todasVerdadeiras = false
        break
      }
    }
    if (todasVerdadeiras) return true // OR: um ramo basta
  }
  return false
}

// ============================================================
// Fixtures
// ============================================================

function lanc(over: Partial<LancamentoParaRegra> = {}): LancamentoParaRegra {
  return {
    tipo: "despesa",
    status: "previsto",
    data: "2026-09-10",
    data_vencimento: null,
    data_pagamento: null,
    valor: 100,
    ...over,
  }
}

const SETEMBRO = { de: "2026-09-01", ate: "2026-09-30" }
const OUTUBRO = { de: "2026-10-01", ate: "2026-10-31" }

// ============================================================
// R1 — situação
// ============================================================

test("R1: cancelado fica fora de realizado, previsto e total", () => {
  for (const situacao of ["realizado", "previsto", "total"] as const) {
    assert.equal(entraNaSituacao("cancelado", situacao), false)
  }
})

test("R1: total é realizado + previsto", () => {
  assert.equal(entraNaSituacao("realizado", "total"), true)
  assert.equal(entraNaSituacao("previsto", "total"), true)
})

test("R1: cada situação só aceita o próprio status", () => {
  assert.equal(entraNaSituacao("previsto", "realizado"), false)
  assert.equal(entraNaSituacao("realizado", "previsto"), false)
})

test("R1: conta atrasada continua contando como previsto", () => {
  const vencida = lanc({ status: "previsto", data_vencimento: "2026-08-01" })
  assert.equal(estaAtrasado(vencida, "2026-09-19"), true)
  assert.equal(entraNaSituacao(vencida.status, "previsto"), true)

  const totais = somarLancamentos([vencida], "previsto")
  assert.equal(totais.saidas, 100, "a vencida não pode sumir do previsto")
})

test("R1: só previsto pode estar atrasado", () => {
  assert.equal(
    estaAtrasado(lanc({ status: "realizado", data_vencimento: "2020-01-01" }), "2026-09-19"),
    false
  )
  assert.equal(
    estaAtrasado(lanc({ status: "cancelado", data_vencimento: "2020-01-01" }), "2026-09-19"),
    false
  )
})

test("R1: cancelado não entra na soma nem do total", () => {
  const linhas = [
    lanc({ tipo: "receita", status: "realizado", valor: 1000 }),
    lanc({ tipo: "receita", status: "cancelado", valor: 9999 }),
  ]
  assert.equal(somarLancamentos(linhas, "total").entradas, 1000)
  assert.equal(somarLancamentos(linhas, "total").quantidade, 1)
})

// ============================================================
// R2 — rótulos
// ============================================================

test("R2: os rótulos mudam com a situação", () => {
  assert.equal(rotulosDaSituacao("realizado").entrada, "Recebido")
  assert.equal(rotulosDaSituacao("previsto").entrada, "A receber")
  assert.equal(rotulosDaSituacao("total").entrada, "Receitas")
  assert.equal(rotulosDaSituacao("realizado").saldo, "Saldo realizado")
  assert.equal(rotulosDaSituacao("previsto").saida, "A pagar")
})

// ============================================================
// R3 — em que mês cai, em memória E no banco
// ============================================================

const CASOS_R3: {
  nome: string
  linha: LancamentoParaRegra
  esperado: "setembro" | "outubro"
}[] = [
  {
    nome: "pago com competência em set e vencimento em out cai em SETEMBRO",
    linha: lanc({
      status: "realizado",
      data: "2026-09-20",
      data_vencimento: "2026-10-13",
      data_pagamento: "2026-09-20",
    }),
    esperado: "setembro",
  },
  {
    nome: "previsto com competência em set e vencimento em out cai em OUTUBRO",
    linha: lanc({ status: "previsto", data: "2026-09-20", data_vencimento: "2026-10-13" }),
    esperado: "outubro",
  },
  {
    nome: "previsto sem vencimento com competência em set cai em SETEMBRO",
    linha: lanc({ status: "previsto", data: "2026-09-20", data_vencimento: null }),
    esperado: "setembro",
  },
]

for (const caso of CASOS_R3) {
  test(`R3 (memória): ${caso.nome}`, () => {
    const emSetembro = dentroDoPeriodo(caso.linha, SETEMBRO.de, SETEMBRO.ate)
    const emOutubro = dentroDoPeriodo(caso.linha, OUTUBRO.de, OUTUBRO.ate)
    assert.equal(emSetembro, caso.esperado === "setembro")
    assert.equal(emOutubro, caso.esperado === "outubro")
  })

  test(`R3 (banco): ${caso.nome}`, () => {
    const linha = caso.linha as unknown as Record<string, unknown>
    const emSetembro = linhaPassaNoFiltro(
      linha,
      filtroPeriodoPostgREST(SETEMBRO.de, SETEMBRO.ate)
    )
    const emOutubro = linhaPassaNoFiltro(
      linha,
      filtroPeriodoPostgREST(OUTUBRO.de, OUTUBRO.ate)
    )
    assert.equal(emSetembro, caso.esperado === "setembro")
    assert.equal(emOutubro, caso.esperado === "outubro")
  })

  test(`R3: memória e banco concordam — ${caso.nome}`, () => {
    const linha = caso.linha as unknown as Record<string, unknown>
    for (const p of [SETEMBRO, OUTUBRO]) {
      assert.equal(
        dentroDoPeriodo(caso.linha, p.de, p.ate),
        linhaPassaNoFiltro(linha, filtroPeriodoPostgREST(p.de, p.ate)),
        `divergência em ${p.de}..${p.ate}`
      )
    }
  })
}

test("R3: o terceiro ramo existe porque NULL >= data é UNKNOWN no Postgres", () => {
  const semVencimento = lanc({ status: "previsto", data: "2026-09-20", data_vencimento: null })
  const linha = semVencimento as unknown as Record<string, unknown>

  // Sem o terceiro ramo, a linha sumiria da lista.
  const filtroIncompleto = [
    `and(status.eq.realizado,data.gte.${SETEMBRO.de},data.lte.${SETEMBRO.ate})`,
    `and(status.neq.realizado,data_vencimento.gte.${SETEMBRO.de},data_vencimento.lte.${SETEMBRO.ate})`,
  ].join(",")
  assert.equal(linhaPassaNoFiltro(linha, filtroIncompleto), false)

  // Com ele, aparece.
  assert.equal(
    linhaPassaNoFiltro(linha, filtroPeriodoPostgREST(SETEMBRO.de, SETEMBRO.ate)),
    true
  )
})

test("R3: cancelado continua visível na lista (só não soma)", () => {
  const cancelado = lanc({ status: "cancelado", data: "2026-09-10", data_vencimento: null })
  assert.equal(dentroDoPeriodo(cancelado, SETEMBRO.de, SETEMBRO.ate), true)
  assert.equal(somarLancamentos([cancelado], "total").quantidade, 0)
})

test("dataDoPeriodo é a data que a lista mostra", () => {
  assert.equal(
    dataDoPeriodo(lanc({ status: "realizado", data: "2026-09-20", data_vencimento: "2026-10-13" })),
    "2026-09-20"
  )
  assert.equal(
    dataDoPeriodo(lanc({ status: "previsto", data: "2026-09-20", data_vencimento: "2026-10-13" })),
    "2026-10-13"
  )
})

// ============================================================
// R6 — eixo de vencimento
// ============================================================

test("R6: no eixo de vencimento, pago também recorta pelo vencimento", () => {
  const pagoAntes = lanc({
    status: "realizado",
    data: "2026-09-20",
    data_vencimento: "2026-10-13",
    data_pagamento: "2026-09-20",
  })
  assert.equal(dentroDoPeriodoPorVencimento(pagoAntes, OUTUBRO.de, OUTUBRO.ate), true)
  assert.equal(dentroDoPeriodo(pagoAntes, OUTUBRO.de, OUTUBRO.ate), false)
})

// ============================================================
// Somas e saldo
// ============================================================

test("valor que chega como string soma certo", () => {
  assert.equal(valorNumerico("1900.00"), 1900)
  assert.equal(valorNumerico(1900), 1900)
  assert.equal(valorNumerico(null), 0)
  assert.equal(valorNumerico(""), 0)
  assert.equal(valorNumerico("abc"), 0)
})

test("soma com valores em string não concatena", () => {
  const linhas = [
    lanc({ tipo: "receita", status: "realizado", valor: "1900.00" }),
    lanc({ tipo: "receita", status: "realizado", valor: "100.50" }),
  ]
  const t = somarLancamentos(linhas, "realizado")
  assert.equal(t.entradas, 2000.5)
  assert.equal(typeof t.entradas, "number")
})

test("saldo = entradas − saídas", () => {
  const linhas = [
    lanc({ tipo: "receita", status: "realizado", valor: 1000 }),
    lanc({ tipo: "despesa", status: "realizado", valor: 250 }),
  ]
  const t = somarLancamentos(linhas, "realizado")
  assert.equal(t.entradas, 1000)
  assert.equal(t.saidas, 250)
  assert.equal(t.saldo, 750)
})

test("R5: saldo da conta parte do inicial e só conta o que foi pago", () => {
  const linhas = [
    lanc({ tipo: "receita", status: "realizado", valor: "500.00", data_pagamento: "2026-09-01" }),
    lanc({ tipo: "despesa", status: "realizado", valor: 200, data_pagamento: "2026-09-02" }),
    // previsto não mexe no saldo
    lanc({ tipo: "despesa", status: "previsto", valor: 9999 }),
    // realizado SEM data de pagamento também não
    lanc({ tipo: "despesa", status: "realizado", valor: 8888, data_pagamento: null }),
  ]
  assert.equal(saldoDaConta("1000.00", linhas), 1300)
})

// ============================================================
// R11 — recorrentes
// ============================================================

const MENSAL = {
  id: "rec-1",
  ativo: true,
  periodicidade: "mensal" as const,
  dia_vencimento: 31,
  inicio: "2026-01-01",
  fim: null,
}

test("R11: dia 31 em fevereiro vira o último dia do mês", () => {
  assert.equal(dataDoRecorrenteNoMes(2026, 2, 31), "2026-02-28")
  assert.equal(dataDoRecorrenteNoMes(2028, 2, 31), "2028-02-29") // bissexto
  assert.equal(dataDoRecorrenteNoMes(2026, 4, 31), "2026-04-30")
  assert.equal(dataDoRecorrenteNoMes(2026, 3, 31), "2026-03-31")
  assert.equal(ultimoDiaDoMes(2026, 2), 28)
})

test("R11: gerar duas vezes o mesmo mês cria 0 na segunda", () => {
  const primeira = recorrentesAMaterializar([MENSAL], [], 2026, 2)
  assert.equal(primeira.length, 1)
  assert.equal(primeira[0].data, "2026-02-28")

  const segunda = recorrentesAMaterializar([MENSAL], [MENSAL.id], 2026, 2)
  assert.equal(segunda.length, 0)
})

test("R11: recorrente com fim antes do mês não gera", () => {
  const encerrado = { ...MENSAL, fim: "2026-01-31" }
  assert.equal(recorrenteCobreMes(encerrado, 2026, 2), false)
  assert.equal(recorrentesAMaterializar([encerrado], [], 2026, 2).length, 0)
  // no próprio mês do fim, ainda gera
  assert.equal(recorrenteCobreMes(encerrado, 2026, 1), true)
})

test("R11: recorrente que começa depois do mês não gera", () => {
  const futuro = { ...MENSAL, inicio: "2026-05-01" }
  assert.equal(recorrenteCobreMes(futuro, 2026, 4), false)
  assert.equal(recorrenteCobreMes(futuro, 2026, 5), true)
})

test("R11: inativo, anual e semanal não são materializados", () => {
  assert.equal(recorrenteCobreMes({ ...MENSAL, ativo: false }, 2026, 2), false)
  assert.equal(recorrenteCobreMes({ ...MENSAL, periodicidade: "anual" }, 2026, 2), false)
  assert.equal(recorrenteCobreMes({ ...MENSAL, periodicidade: "semanal" }, 2026, 2), false)
  assert.equal(recorrenteCobreMes({ ...MENSAL, dia_vencimento: null }, 2026, 2), false)
})

test("R11: janeiro é um mês válido (não cai em abril)", () => {
  assert.equal(dataDoRecorrenteNoMes(2027, 1, 10), "2027-01-10")
  assert.equal(recorrenteCobreMes(MENSAL, 2027, 1), true)
})

// ============================================================
// Cores
// ============================================================

test("cor da categoria é estável entre telas", () => {
  const id = "4f1c0f3a-0000-4000-8000-000000000001"
  assert.equal(corDeterministica(id), corDeterministica(id))
})

test("próxima cor livre pula as já usadas", () => {
  assert.equal(proximaCorLivre([]), "#C9953A")
  assert.equal(proximaCorLivre(["#C9953A"]), "#16a34a")
  assert.equal(proximaCorLivre(["#c9953a", null]), "#16a34a", "case-insensitive")
})

// ============================================================
// Navegação
// ============================================================

test("?voltar= só aceita caminho interno", () => {
  assert.equal(ehCaminhoInternoSeguro("/dashboard/workspace/calendario"), true)
  assert.equal(ehCaminhoInternoSeguro("//evil.com"), false)
  assert.equal(ehCaminhoInternoSeguro("https://evil.com"), false)
  assert.equal(ehCaminhoInternoSeguro("/\\evil.com"), false)
  assert.equal(ehCaminhoInternoSeguro(null), false)
  assert.equal(ehCaminhoInternoSeguro(""), false)
})
