/**
 * Teste G no ponto de entrada real do webhook (receberWebhook): sem
 * assinatura válida, responde 401 e NÃO toca no banco. Rodar: `npm run test`.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

import { receberWebhook } from "./reunioes-sync"

/** "Banco" que explode se alguém tentar usá-lo. */
const bancoIntocavel = new Proxy({}, {
  get() {
    throw new Error("o banco não deveria ser acessado")
  },
}) as unknown as SupabaseClient

const corpo = JSON.stringify({ triggerEvent: "BOOKING_CREATED", createdAt: "2026-11-02T12:00:00.000Z", payload: { uid: "bkg_teste1" } })

test("G: sem cabeçalho de assinatura → 401, nada gravado", async () => {
  process.env.CALCOM_WEBHOOK_SECRET = "segredo-de-teste"
  const r = await receberWebhook(bancoIntocavel, corpo, null)
  assert.equal(r.http, 401)
})

test("G: assinatura com outro segredo → 401, nada gravado", async () => {
  process.env.CALCOM_WEBHOOK_SECRET = "segredo-de-teste"
  const falsa = createHmac("sha256", "segredo-errado").update(corpo).digest("hex")
  const r = await receberWebhook(bancoIntocavel, corpo, falsa)
  assert.equal(r.http, 401)
})

test("G: servidor sem CALCOM_WEBHOOK_SECRET recusa tudo (fail-closed)", async () => {
  delete process.env.CALCOM_WEBHOOK_SECRET
  const qualquer = createHmac("sha256", "").update(corpo).digest("hex")
  const r = await receberWebhook(bancoIntocavel, corpo, qualquer)
  assert.equal(r.http, 401)
})

// ============================================================
// Várias contas: cada conta confere com o SEU segredo
// ============================================================

import { nomeEnvApiKey, nomeEnvWebhookSecret, segredoWebhookDe } from "./calcom"
import { chaveContaValida } from "./reunioes-sync"
import { montarIcs } from "./reunioes-nucleo"

const assinar = (segredo: string) => createHmac("sha256", segredo).update(corpo).digest("hex")

test("contas: nomes das variáveis — principal mantém os de sempre", () => {
  assert.equal(nomeEnvApiKey("principal"), "CALCOM_API_KEY")
  assert.equal(nomeEnvApiKey("ativo"), "CALCOM_API_KEY_ATIVO")
  assert.equal(nomeEnvWebhookSecret("principal"), "CALCOM_WEBHOOK_SECRET")
  assert.equal(nomeEnvWebhookSecret("ativo"), "CALCOM_WEBHOOK_SECRET_ATIVO")
})

test("contas: ?conta= inválido ou ausente cai na principal", () => {
  assert.equal(chaveContaValida(null), "principal")
  assert.equal(chaveContaValida(""), "principal")
  assert.equal(chaveContaValida("Ativo"), "ativo")
  assert.equal(chaveContaValida("../x"), "principal")
})

test("contas: Ativo sem segredo próprio usa o comum", () => {
  process.env.CALCOM_WEBHOOK_SECRET = "comum"
  delete process.env.CALCOM_WEBHOOK_SECRET_ATIVO
  assert.equal(segredoWebhookDe("ativo"), "comum")
})

test("contas: Ativo com segredo próprio recusa assinatura com o comum → 401 sem banco", async () => {
  process.env.CALCOM_WEBHOOK_SECRET = "comum"
  process.env.CALCOM_WEBHOOK_SECRET_ATIVO = "so-do-ativo"
  const r = await receberWebhook(bancoIntocavel, corpo, assinar("comum"), "ativo")
  assert.equal(r.http, 401)
  // E a principal não aceita a assinatura do Ativo.
  const r2 = await receberWebhook(bancoIntocavel, corpo, assinar("so-do-ativo"), "principal")
  assert.equal(r2.http, 401)
  delete process.env.CALCOM_WEBHOOK_SECRET_ATIVO
})

test("feed: reunião de outra conta entra como Ocupado, no horário UTC certo", () => {
  const ics = montarIcs(
    [
      { id: "t1", data: "2026-11-18", hora: "09:30", duracao_min: 60 },
      // formato que o Supabase devolve (+00:00)
      { id: "a1", inicioIso: "2026-11-18T17:00:00+00:00", fimIso: "2026-11-18T17:30:00+00:00", prefixoUid: "reuniao" },
      { id: "a2", inicioIso: "lixo", fimIso: "lixo", prefixoUid: "reuniao" },
    ],
    new Date("2026-11-13T12:00:00Z")
  )
  assert.match(ics, /UID:ws-t1@anomalo/)
  assert.match(ics, /DTSTART:20261118T123000Z/)
  assert.match(ics, /UID:reuniao-a1@anomalo\r\nDTSTAMP:[0-9TZ]+\r\nDTSTART:20261118T170000Z\r\nDTEND:20261118T173000Z/)
  assert.doesNotMatch(ics, /reuniao-a2/)
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2)
})
