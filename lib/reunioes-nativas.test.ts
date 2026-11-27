import test from "node:test"
import assert from "node:assert/strict"
import { slotsDoDia, iniciosDaJanela, passoDosSlots, sobrepoe, validarNome, validarWhatsapp, validarAtribuicao, segredoValido, idempotencyKeyValida, reservarNativo } from "./reunioes-nativas"
import { brParaUtcIso, dataBR, horaBR } from "./reunioes-nucleo"

const seg = "2026-11-30"
const agora = new Date("2026-11-25T10:00:00Z")
const config = (): Parameters<typeof slotsDoDia>[0] => ({
  tipo: { id: "tipo", duracao_min: 60, antecedencia_min_horas: 12, intervalo_min: 15, intervalo_minutos: 60, limite_diario: 3, horizonte_dias: 14, responsavel_id: "resp", ativo: true },
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
const labels = (c: Parameters<typeof slotsDoDia>[0], data = seg) => slotsDoDia(c, data, [], agora).map(s => s.label)
const comJanela = (inicio: string, fim: string, passo: number, duracao = 60) => {
  const c = config()
  c.tipo.duracao_min = duracao
  c.tipo.intervalo_minutos = passo
  c.disp.janelas = [{ dia: 1, inicio, fim }]
  return c
}

test("intervalo 60 = duração: 09:00–11:00 → 09:00 e 10:00; 16:00–18:00 → 16:00 e 17:00", () => {
  assert.deepEqual(labels(comJanela("09:00", "11:00", 60)), ["09:00", "10:00"])
  assert.deepEqual(labels(comJanela("16:00", "18:00", 60)), ["16:00", "17:00"])
})
test("intervalo 30 e 15 geram a grade a partir do início da janela", () => {
  assert.deepEqual(labels(comJanela("09:00", "11:00", 30)), ["09:00", "09:30", "10:00"])
  assert.deepEqual(labels(comJanela("09:00", "11:00", 15)), ["09:00", "09:15", "09:30", "09:45", "10:00"])
  assert.deepEqual(labels(comJanela("09:00", "10:30", 15, 30)), ["09:00", "09:15", "09:30", "09:45", "10:00"])
})
test("janela que não fecha na grade: só entram inícios cujo fim cabe", () => {
  // 09:00–10:45, 60 min a cada 30 → 09:00, 09:30 (10:00 terminaria 11:00)
  assert.deepEqual(labels(comJanela("09:00", "10:45", 30)), ["09:00", "09:30"])
  // 09:00–11:30, passo 60 → 09:00, 10:00 (11:00 terminaria 12:00)
  assert.deepEqual(labels(comJanela("09:00", "11:30", 60)), ["09:00", "10:00"])
  // janela fora da grade de 15: a grade nasce no início da janela, sem arredondar
  assert.deepEqual(labels(comJanela("09:10", "11:10", 60)), ["09:10", "10:10"])
  assert.deepEqual(labels(comJanela("09:10", "11:00", 30)), ["09:10", "09:40"])
  // janela menor que a duração não oferece nada
  assert.deepEqual(labels(comJanela("09:00", "09:45", 15)), [])
})
test("intervalo maior que a duração deixa lacunas; várias janelas no mesmo dia têm grade própria", () => {
  assert.deepEqual(labels(comJanela("09:00", "13:00", 90)), ["09:00", "10:30", "12:00"])
  assert.deepEqual(labels(comJanela("09:00", "12:30", 90)), ["09:00", "10:30"])
  const c = comJanela("09:00", "11:00", 60)
  c.disp.janelas.push({ dia: 1, inicio: "14:30", fim: "16:30" })
  assert.deepEqual(labels(c), ["09:00", "10:00", "14:30", "15:30"])
})
test("grade em minutos e fallback do passo", () => {
  assert.deepEqual(iniciosDaJanela(540, 660, 60, 60), [540, 600])
  assert.deepEqual(iniciosDaJanela(540, 660, 60, 15), [540, 555, 570, 585, 600])
  assert.deepEqual(iniciosDaJanela(540, 660, 60, 0), [])
  assert.equal(passoDosSlots({ duracao_min: 60, intervalo_minutos: 30 }), 30)
  assert.equal(passoDosSlots({ duracao_min: 45, intervalo_minutos: null }), 45)
  assert.equal(passoDosSlots({ duracao_min: 45, intervalo_minutos: 2 }), 45)
  assert.equal(passoDosSlots({ duracao_min: 45, intervalo_minutos: 481 }), 45)
})
test("intervalo convive com buffer, ocupação e limite diário", () => {
  const c = comJanela("09:00", "13:00", 30)
  // Reserva 10:00–11:00 com buffer de 15 min: 09:00–11:00 caem; 11:30 e 12:00 ficam.
  assert.deepEqual(slotsDoDia(c, seg, [ag(seg, "10:00")], agora).map(s => s.label), ["11:30", "12:00"])
  // Bloqueio de tarefa (sem provedor) não aplica buffer.
  assert.deepEqual(slotsDoDia(c, seg, [{ ...ag(seg, "10:00"), provedor: undefined }], agora).map(s => s.label), ["09:00", "11:00", "11:30", "12:00"])
  c.tipo.limite_diario = 1
  assert.equal(slotsDoDia(c, seg, [ag(seg, "10:00", 60, "nativo")], agora).length, 0)
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


test("UUID do contrato usa cinco grupos e rejeita valores inválidos", async () => {
  const key = "b993e704-151a-4496-b2ee-0b00bc13acb4"
  assert.equal(idempotencyKeyValida(key), true)
  for (const value of ["b993e704-151a-4496-0b00bc13acb4", "invalid", key + "\n", key + " ", null]) assert.equal(idempotencyKeyValida(value), false)
  const flag = process.env.ATIVO_NATIVE_BOOKING_ENABLED
  try {
    process.env.ATIVO_NATIVE_BOOKING_ENABLED = "false"
    const base = { name: "João", whatsapp: "+5545999999999", start: "2026-11-30T12:00:00.000Z", attribution: {} }
    assert.deepEqual(await reservarNativo({ ...base, idempotencyKey: key }), { code: "CONFIG_UNAVAILABLE" })
    assert.deepEqual(await reservarNativo({ ...base, idempotencyKey: "invalid" }), { code: "INVALID_INPUT" })
  } finally {
    if (flag === undefined) delete process.env.ATIVO_NATIVE_BOOKING_ENABLED
    else process.env.ATIVO_NATIVE_BOOKING_ENABLED = flag
  }
})
