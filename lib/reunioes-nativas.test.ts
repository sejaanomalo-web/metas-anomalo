import test from "node:test"
import assert from "node:assert/strict"
import { slotsDoDia, sobrepoe, validarNome, validarWhatsapp, validarAtribuicao, segredoValido, lerJsonNativo, idempotencyKeyValida, reservarNativo } from "./reunioes-nativas"
import { brParaUtcIso, dataBR, horaBR } from "./reunioes-nucleo"

const seg = "2026-11-30"
const agora = new Date("2026-11-25T10:00:00Z")

test("UUID do contrato é aceito com os cinco grupos", () => {
  assert.equal(idempotencyKeyValida("b993e704-151a-4496-b2ee-0b00bc13acb4"), true)
  assert.equal(idempotencyKeyValida("B993E704-151A-4496-B2EE-0B00BC13ACB4"), true)
  for (const value of ["b993e704-151a-4496-0b00bc13acb4", "b993e704151a4496b2ee0b00bc13acb4", "g993e704-151a-4496-b2ee-0b00bc13acb4", " b993e704-151a-4496-b2ee-0b00bc13acb4", "b993e704-151a-4496-b2ee-0b00bc13acb4\n", "b993e704-151a-4496-b2ee-0b00bc13acb4 ", "", null, 123]) {
    assert.equal(idempotencyKeyValida(value), false)
  }
})

test("reserva recusa UUID inválido antes de consultar configuração ou banco", async () => {
  const result = await reservarNativo({ name: "João", whatsapp: "+5545999999999", start: "2026-11-30T12:00:00.000Z", idempotencyKey: "b993e704-151a-4496-0b00bc13acb4", attribution: {} })
  assert.deepEqual(result, { code: "INVALID_INPUT" })
})

test("reserva aceita a chave do contrato e segue para a verificação de configuração", async () => {
  const flag = process.env.ATIVO_NATIVE_BOOKING_ENABLED
  try {
    process.env.ATIVO_NATIVE_BOOKING_ENABLED = "false"
    const result = await reservarNativo({ name: "João", whatsapp: "+5545999999999", start: "2026-11-30T12:00:00.000Z", idempotencyKey: "b993e704-151a-4496-b2ee-0b00bc13acb4", attribution: {} })
    assert.deepEqual(result, { code: "CONFIG_UNAVAILABLE" })
  } finally {
    if (flag === undefined) delete process.env.ATIVO_NATIVE_BOOKING_ENABLED
    else process.env.ATIVO_NATIVE_BOOKING_ENABLED = flag
  }
})
const config = (): Parameters<typeof slotsDoDia>[0] => ({
  tipo: { id: "tipo", duracao_min: 60, antecedencia_min_horas: 12, intervalo_min: 15, limite_diario: 3, horizonte_dias: 14, responsavel_id: "resp", ativo: true },
  disp: { id: "disp", fuso: "America/Sao_Paulo", modo_nativo: true, calcom_schedule_id: null, responsavel_id: "resp",
    janelas: [{ dia: 1, inicio: "09:00", fim: "11:00" }], periodos: [], excecoes: [], bloqueios: [] },
  responsavelId: "resp",
})
const ag = (data: string, hora: string, dur = 60, provedor = "calcom", tipo_id = "tipo") => {
  const inicio = brParaUtcIso(data, hora)
  return { inicio, fim: new Date(Date.parse(inicio) + dur * 60_000).toISOString(), provedor, tipo_id }
}

test("agenda semanal gera horários reais em Brasília, em UTC", () => {
  const s = slotsDoDia(config(), seg, [], agora)
  assert.equal(s[0].label, "09:00")
  assert.equal(s[0].start, "2026-11-30T12:00:00.000Z")
  assert.equal(s.at(-1)?.label, "10:00")
  assert.equal(slotsDoDia(config(), "2026-11-29", [], agora).length, 0)
})
test("exceção de data e período especial prevalecem sobre a semana", () => {
  const c = config()
  c.disp.periodos = [{ id: "p", nome: "especial", de: seg, ate: seg, janelas: [{ dia: 1, inicio: "16:00", fim: "18:00" }] }]
  assert.equal(slotsDoDia(c, seg, [], agora)[0].label, "16:00")
  c.disp.excecoes = [{ data: seg, janelas: [] }]
  assert.equal(slotsDoDia(c, seg, [], agora).length, 0)
})
test("bloqueio manual e antecedência mínima", () => {
  const c = config()
  c.disp.bloqueios = [{ id: "b", de: seg, ate: seg, motivo: null, calcom_ooo_id: null }]
  assert.equal(slotsDoDia(c, seg, [], agora).length, 0)
  c.disp.bloqueios = []
  assert.equal(slotsDoDia(c, seg, [], new Date("2026-11-30T02:00:00Z")).length, 0)
})
test("Cal.com, nativo e bloqueio parcial ocupam o intervalo inteiro com buffer", () => {
  const c = config()
  assert.equal(slotsDoDia(c, seg, [ag(seg, "09:00")], agora).length, 0)
  assert.equal(slotsDoDia(c, seg, [ag(seg, "09:00", 60, "nativo")], agora).length, 0)
  assert.deepEqual(slotsDoDia(c, seg, [ag(seg, "09:30", 15, "calcom")], agora).map(s => s.label), ["10:00"])
  assert.deepEqual(slotsDoDia(c, seg, [{ ...ag(seg, "09:00"), provedor: undefined }], agora).map(s => s.label), ["10:00"])
  assert.equal(sobrepoe(ag(seg, "09:00"), ag(seg, "09:30")), true)
})
test("limite diário soma os dois métodos do mesmo tipo", () => {
  const c = config()
  c.tipo.limite_diario = 1
  assert.equal(slotsDoDia(c, seg, [ag(seg, "16:00", 60, "calcom")], agora).length, 0)
})
test("cancelamento libera horário quando a reserva não está na lista de ocupados", () => {
  assert.ok(slotsDoDia(config(), seg, [], agora).length > 0)
})
test("fuso usa regras reais de 2018 e 2026", () => {
  assert.equal(brParaUtcIso("2026-11-30", "09:00"), "2026-11-30T12:00:00.000Z")
  assert.equal(dataBR("2026-12-01T01:30:00.000Z"), "2026-11-30")
  assert.equal(horaBR("2026-12-01T01:30:00.000Z"), "22:30")
  assert.equal(brParaUtcIso("2018-11-05", "09:00"), "2018-11-05T11:00:00.000Z")
})
test("nome, telefone e atribuição rejeitam conteúdo inválido", () => {
  assert.equal(validarNome("  João da Silva  "), "João da Silva")
  assert.equal(validarNome("<script>"), null)
  assert.equal(validarWhatsapp("(45) 99999-9999"), "+5545999999999")
  assert.equal(validarWhatsapp("123"), null)
  assert.deepEqual(validarAtribuicao({ utm_source: "facebook" }), { utm_source: "facebook" })
  assert.equal(validarAtribuicao({ tipo_id: "outro" }), null)
})

test("autorização servidor a servidor falha fechada", () => {
  const antes = process.env.ATIVO_WORKSPACE_API_SECRET
  try {
    process.env.ATIVO_WORKSPACE_API_SECRET = "a".repeat(32)
    assert.equal(segredoValido(null), false)
    assert.equal(segredoValido(`Bearer ${"b".repeat(32)}`), false)
    assert.equal(segredoValido(`Bearer ${"a".repeat(32)}`), true)
    process.env.ATIVO_WORKSPACE_API_SECRET = "curto"
    assert.equal(segredoValido("Bearer curto"), false)
  } finally {
    if (antes === undefined) delete process.env.ATIVO_WORKSPACE_API_SECRET
    else process.env.ATIVO_WORKSPACE_API_SECRET = antes
  }
})

test("rotas públicas recusam requisições sem segredo", async () => {
  const [agenda, book] = await Promise.all([
    import("../app/api/public/ativo/agenda/route"),
    import("../app/api/public/ativo/book/route"),
  ])
  const a = await agenda.GET(new Request("http://localhost/api/public/ativo/agenda"))
  const b = await book.POST(new Request("http://localhost/api/public/ativo/book", { method: "POST", body: "{}" }))
  assert.equal(a.status, 401)
  assert.equal(b.status, 401)
  assert.equal((await a.json()).code, "UNAUTHORIZED")
  assert.equal((await b.json()).code, "UNAUTHORIZED")
})


test("horizonte máximo e dados de telefone inválidos são rejeitados", () => {
  assert.equal(slotsDoDia(config(), "2026-12-10", [], agora).length, 0)
  assert.equal(validarWhatsapp("+5520999999999"), null)
  assert.equal(validarWhatsapp("+5545888888888"), null)
  assert.equal(validarNome("João\u0000Silva"), null)
  assert.deepEqual(validarAtribuicao({ utm_content: "criativo", utm_source: "meta" }), validarAtribuicao({ utm_source: "meta", utm_content: "criativo" }))
})

test("payload tem limite de bytes mesmo sem Content-Length", async () => {
  const req = new Request("http://localhost", { method: "POST", body: "x".repeat(5000) })
  await assert.rejects(lerJsonNativo(req), /INVALID_INPUT/)
  assert.deepEqual(await lerJsonNativo(new Request("http://localhost", { method: "POST", body: '{"name":"João"}' })), { name: "João" })
})

test("buffer da reunião existente e limite do tipo são respeitados mesmo com outro responsável", () => {
  const c = config()
  assert.equal(slotsDoDia(c, seg, [{ ...ag(seg, "08:00"), bufferMin: 120 }], agora).length, 0)
  c.tipo.limite_diario = 1
  assert.equal(slotsDoDia(c, seg, [{ ...ag(seg, "16:00"), bloqueia: false }], agora).length, 0)
})

test("passo de 60 min: horários de hora em hora a partir do início da janela", () => {
  const s = slotsDoDia(config(), seg, [], agora, 60).map(x => x.label)
  assert.ok(s.length > 0)
  assert.ok(s.every(l => l.endsWith(":00")), s.join(","))
  const q = slotsDoDia(config(), seg, [], agora).map(x => x.label)
  assert.ok(q.some(l => !l.endsWith(":00")), "ATIVO continua na grade de 15 min")
})
