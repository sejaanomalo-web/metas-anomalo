// Teste transacional contra PostgreSQL REAL de staging, após aplicar a migration.
// Requer slot exclusivo livre e variáveis ATIVO_NATIVE_TEST_*; nunca roda no npm test comum.
import { createHash, randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })
if (process.env.ATIVO_NATIVE_TEST_ALLOW_WRITES !== "1" ||
    process.env.ATIVO_NATIVE_TEST_DATABASE !== "staging" ||
    !process.env.ATIVO_NATIVE_TEST_EXPECTED_HOST ||
    !process.env.ATIVO_NATIVE_TEST_START || !process.env.ATIVO_NATIVE_TEST_ATOR_ID ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Configure staging e ATIVO_NATIVE_TEST_ALLOW_WRITES=1 para o teste real.")
}
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host !== process.env.ATIVO_NATIVE_TEST_EXPECTED_HOST) {
  throw new Error("O host Supabase não corresponde ao staging esperado.")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const start = new Date(process.env.ATIVO_NATIVE_TEST_START).toISOString()
const name = "Teste Transacional ATIVO"
const phone = "+5545999999999"
const attribution = {}
const hash = createHash("sha256").update(JSON.stringify([name, phone, start, attribution])).digest("hex")
const keyA = randomUUID(), keyB = randomUUID()
const call = async (key, digest = hash) => {
  const { data, error } = await db.rpc("reunioes_nativas_reservar", {
    p_nome: name, p_telefone: phone, p_inicio: start, p_chave: key,
    p_hash: digest, p_atribuicao: attribution,
  })
  if (error) throw error
  return data
}
let bookingId
try {
  const [a, b] = await Promise.all([call(keyA), call(keyB)])
  const sucessos = [a, b].filter(x => x.status === "reserved_pending_whatsapp")
  const conflitos = [a, b].filter(x => x.code === "SLOT_UNAVAILABLE")
  if (sucessos.length !== 1 || conflitos.length !== 1) throw new Error(`Concorrência: esperado 1 reserva e 1 conflito; recebido ${JSON.stringify([a.code ?? a.status, b.code ?? b.status])}`)
  bookingId = sucessos[0].bookingId
  const key = a.status ? keyA : keyB
  const repetida = await call(key)
  if (repetida.bookingId !== bookingId) throw new Error("Idempotência não retornou a mesma reserva")
  const alterada = await call(key, "0".repeat(64))
  if (alterada.code !== "IDEMPOTENCY_MISMATCH") throw new Error("Chave reutilizada com payload diferente não foi recusada")
  const { data: reserva } = await db.from("reunioes_agendamentos").select("tarefa_id, responsavel_id").eq("id", bookingId).single()
  if (!reserva?.tarefa_id || !reserva.responsavel_id) throw new Error("Reserva sem tarefa ou responsável")
  const { data: tarefa } = await db.from("ws_tarefas").select("id, source_gid").eq("id", reserva.tarefa_id).single()
  if (tarefa?.source_gid !== `nativo:${bookingId}`) throw new Error("Tarefa não vinculada")
  console.log("PASS: corrida, idempotência, tarefa e responsável em PostgreSQL real")
} finally {
  if (bookingId) {
    const { data, error } = await db.rpc("reunioes_nativas_gerir", {
      p_id: bookingId, p_acao: "cancelar", p_ator: process.env.ATIVO_NATIVE_TEST_ATOR_ID, p_novo_inicio: null,
    })
    if (error || data !== "OK") throw new Error("Falha ao cancelar a reserva de teste")
  }
}
