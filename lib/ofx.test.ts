/**
 * Testes do leitor de OFX. Rodar: `npm run test`.
 *
 * Cada caso aqui corresponde a um jeito real de um banco quebrar o formato.
 * O que se protege, em uma frase: que nenhuma transação apareça no dia errado
 * nem com o nome ilegível.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import {
  ErroOFX,
  MAX_LINHAS,
  decodificarOFX,
  lerTag,
  montarDescricao,
  padraoDaDescricao,
  parseDataOFX,
  parseOFX,
} from "./ofx"

const enc = (s: string) => new TextEncoder().encode(s)

function ofx(transacoes: string, cabecalho = "OFXHEADER:100\nCHARSET:1252\n"): string {
  return `${cabecalho}
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>077</BANKID><ACCTID>12345-6</ACCTID></BANKACCTFROM>
<BANKTRANLIST>
${transacoes}
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1500.25</BALAMT></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
}

// ============================================================
// Tags com e sem fechamento
// ============================================================

test("lê tag fechada (XML) e não fechada (SGML)", () => {
  assert.equal(lerTag("<NAME>Padaria</NAME>", "NAME"), "Padaria")
  assert.equal(lerTag("<NAME>Padaria\n<MEMO>x", "NAME"), "Padaria")
  assert.equal(lerTag("<NAME>Padaria<MEMO>x", "NAME"), "Padaria")
  assert.equal(lerTag("<MEMO>x", "NAME"), null)
})

test("parseia transação em SGML, sem tags de fechamento", () => {
  const texto = ofx(`<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260115
<TRNAMT>-45.90
<FITID>ABC123
<NAME>PADARIA CENTRAL
</STMTTRN>`)
  const r = parseOFX(enc(texto))
  assert.equal(r.transacoes.length, 1)
  assert.equal(r.transacoes[0].fitid, "ABC123")
  assert.equal(r.transacoes[0].valor, -45.9)
  assert.equal(r.transacoes[0].tipo, "despesa")
  assert.equal(r.transacoes[0].descricao, "PADARIA CENTRAL")
})

// ============================================================
// Codificação
// ============================================================

test("charset 1252 preserva acentos", () => {
  // "TRANSFERÊNCIA" em windows-1252: Ê = 0xCA
  const cabecalho = "OFXHEADER:100\nCHARSET:1252\n"
  const corpo = ofx(
    `<STMTTRN><DTPOSTED>20260115<TRNAMT>-10.00<FITID>X1<NAME>TRANSFERÊNCIA</STMTTRN>`,
    cabecalho
  )
  const bytes = Uint8Array.from(
    [...corpo].map((c) => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63))
  )
  const r = parseOFX(bytes)
  assert.equal(r.transacoes[0].descricao, "TRANSFERÊNCIA")
})

test("charset UTF-8 é respeitado quando declarado", () => {
  const texto = ofx(
    `<STMTTRN><DTPOSTED>20260115<TRNAMT>-10.00<FITID>X1<NAME>TRANSFERÊNCIA</STMTTRN>`,
    "OFXHEADER:100\nENCODING:UTF-8\nCHARSET:NONE\n"
  )
  const r = parseOFX(enc(texto))
  assert.equal(r.transacoes[0].descricao, "TRANSFERÊNCIA")
})

test("decodificarOFX escolhe 1252 quando o cabeçalho não diz UTF-8", () => {
  const bytes = Uint8Array.from([
    ...enc("OFXHEADER:100\nCHARSET:1252\n<OFX>"),
    0xca, // Ê em 1252
  ])
  assert.ok(decodificarOFX(bytes).endsWith("Ê"))
})

// ============================================================
// Datas — a regra que mais quebra
// ============================================================

test("DTPOSTED sem fuso fica no MESMO dia", () => {
  // 23h sem fuso: tratar como UTC empurraria pro dia seguinte.
  assert.deepEqual(parseDataOFX("20260115230000"), { data: "2026-01-15", hora: "23:00" })
  assert.deepEqual(parseDataOFX("20260115"), { data: "2026-01-15", hora: null })
  assert.deepEqual(parseDataOFX("20260115103000.000"), {
    data: "2026-01-15",
    hora: "10:30",
  })
})

test("DTPOSTED com [0:GMT] às 01:00 vira 22:00 do dia anterior em SP", () => {
  assert.deepEqual(parseDataOFX("20260115010000[0:GMT]"), {
    data: "2026-01-14",
    hora: "22:00",
  })
})

test("DTPOSTED com [-3:BRT] já está em SP e não se move", () => {
  assert.deepEqual(parseDataOFX("20260115103000[-3:BRT]"), {
    data: "2026-01-15",
    hora: "10:30",
  })
})

test("DTPOSTED inválido devolve null em vez de uma data inventada", () => {
  assert.equal(parseDataOFX("abc"), null)
  assert.equal(parseDataOFX("20261315"), null) // mês 13
  assert.equal(parseDataOFX(""), null)
})

// ============================================================
// Descrição
// ============================================================

test("descrição junta NAME e MEMO sem repetir quando são iguais", () => {
  assert.equal(montarDescricao("PIX RECEBIDO", "JOAO SILVA"), "PIX RECEBIDO · JOAO SILVA")
  assert.equal(montarDescricao("PIX RECEBIDO", "PIX RECEBIDO"), "PIX RECEBIDO")
  assert.equal(montarDescricao("PIX RECEBIDO", "pix recebido"), "PIX RECEBIDO")
  assert.equal(montarDescricao("PIX", null), "PIX")
  assert.equal(montarDescricao(null, "MEMO"), "MEMO")
  assert.equal(montarDescricao("  A   B  ", null), "A B")
})

// ============================================================
// Deduplicação dentro do arquivo
// ============================================================

test("FITID repetido no mesmo arquivo aparece uma vez só", () => {
  const texto = ofx(`<STMTTRN><DTPOSTED>20260115<TRNAMT>-10.00<FITID>DUP<NAME>A</STMTTRN>
<STMTTRN><DTPOSTED>20260115<TRNAMT>-10.00<FITID>DUP<NAME>A</STMTTRN>
<STMTTRN><DTPOSTED>20260116<TRNAMT>-20.00<FITID>OUTRO<NAME>B</STMTTRN>`)
  const r = parseOFX(enc(texto))
  assert.equal(r.transacoes.length, 2)
  assert.equal(r.duplicadasNoArquivo, 1)
})

// ============================================================
// Tipo, cabeçalho e metadados
// ============================================================

test("o tipo vem do SINAL do TRNAMT, não do TRNTYPE", () => {
  const texto = ofx(`<STMTTRN><TRNTYPE>OTHER<DTPOSTED>20260115<TRNAMT>100.00<FITID>A<NAME>x</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260115<TRNAMT>-50.00<FITID>B<NAME>y</STMTTRN>`)
  const r = parseOFX(enc(texto))
  assert.equal(r.transacoes[0].tipo, "receita")
  assert.equal(r.transacoes[1].tipo, "despesa", "TRNTYPE=CREDIT com valor negativo é saída")
})

test("valor com vírgula decimal é aceito", () => {
  const texto = ofx(`<STMTTRN><DTPOSTED>20260115<TRNAMT>-1234,56<FITID>A<NAME>x</STMTTRN>`)
  assert.equal(parseOFX(enc(texto)).transacoes[0].valor, -1234.56)
})

test("banco, conta, período e saldo saem do arquivo", () => {
  const texto = ofx(`<STMTTRN><DTPOSTED>20260110<TRNAMT>-10.00<FITID>A<NAME>x</STMTTRN>
<STMTTRN><DTPOSTED>20260128<TRNAMT>-20.00<FITID>B<NAME>y</STMTTRN>`)
  const r = parseOFX(enc(texto))
  assert.equal(r.banco_id, "077")
  assert.equal(r.conta_externa, "12345-6")
  assert.equal(r.periodo_de, "2026-01-10")
  assert.equal(r.periodo_ate, "2026-01-28")
  assert.equal(r.saldo_final, 1500.25)
})

// ============================================================
// Recusas com mensagem clara
// ============================================================

test("arquivo que não é OFX dá erro explicando onde exportar", () => {
  assert.throws(
    () => parseOFX(enc("data,valor\n2026-01-15,-10")),
    (e: unknown) => e instanceof ErroOFX && /não parece um extrato OFX/.test((e as Error).message)
  )
})

test("OFX sem transação nenhuma dá erro", () => {
  assert.throws(
    () => parseOFX(enc("<OFX><BANKTRANLIST></BANKTRANLIST></OFX>")),
    (e: unknown) => e instanceof ErroOFX && /não tem nenhuma transação/.test((e as Error).message)
  )
})

test("arquivo acima do limite de linhas é recusado", () => {
  const gordo = "<OFX><STMTTRN></STMTTRN>" + "\n".repeat(MAX_LINHAS + 1) + "</OFX>"
  assert.throws(
    () => parseOFX(enc(gordo)),
    (e: unknown) => e instanceof ErroOFX && /muito grande/.test((e as Error).message)
  )
})

// ============================================================
// Padrão aprendido
// ============================================================

test("o padrão aprendido é só a parte antes de ' · '", () => {
  assert.equal(padraoDaDescricao("PIX ENVIADO · 12/03 REF 8812"), "pix enviado")
  assert.equal(padraoDaDescricao("Padaria Central"), "padaria central")
})

test("padrão curto demais é descartado", () => {
  // "PIX" casaria com quase tudo e classificaria o extrato inteiro errado.
  assert.equal(padraoDaDescricao("PIX · JOAO"), null)
  assert.equal(padraoDaDescricao("AB"), null)
  assert.equal(padraoDaDescricao("PIXX · JOAO"), "pixx")
})
