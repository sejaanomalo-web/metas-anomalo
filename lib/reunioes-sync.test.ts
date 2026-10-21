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
