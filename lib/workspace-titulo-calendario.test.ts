/**
 * Cartão do Calendário: horário aparece UMA vez. Rodar: `npm run test`.
 *
 * Os títulos de reunião são gerados pela MESMA função da integração
 * (tituloReuniao), não escritos à mão — se o formato mudar lá, o teste pega.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { prefixoHoraCalendario } from "./workspace-tipos"
import { horaBR, tituloReuniao } from "./reunioes-nucleo"

/** O que o cartão desenha: prefixo + título (CalendarioTarefas › Pill). */
function textoDoCartao(t: { titulo: string; prazo_hora: string | null; source_gid?: string | null }): string {
  return `${prefixoHoraCalendario(t)}${t.titulo}`
}

/** Tarefa como o webhook grava: prazo_hora "HH:mm:ss" (coluna time). */
function reuniao(inicioIso: string, nome: string, status?: Parameters<typeof tituloReuniao>[2]) {
  return {
    titulo: tituloReuniao(inicioIso, nome, status),
    prazo_hora: `${horaBR(inicioIso)}:00`,
    source_gid: "calcom:bkg_teste_ficticio",
  }
}

test("reunião Cal.com às 09:00: horário uma vez só", () => {
  // 29/10/2026 09:00 em São Paulo = 12:00 UTC.
  const t = reuniao("2026-10-29T12:00:00.000Z", "Participante Teste")
  assert.equal(textoDoCartao(t), "09:00 - Reunião com Participante Teste")
})

test("reunião Cal.com às 14:30: horário uma vez só", () => {
  const t = reuniao("2026-10-29T17:30:00.000Z", "Participante Teste")
  assert.equal(textoDoCartao(t), "14:30 - Reunião com Participante Teste")
})

test("reunião a confirmar (sufixo) também não duplica", () => {
  const t = reuniao("2026-10-29T12:00:00.000Z", "Participante Teste", "solicitada")
  assert.equal(textoDoCartao(t), "09:00 - Reunião com Participante Teste (a confirmar)")
})

test("tarefa manual com horário: prefixo como sempre", () => {
  assert.equal(textoDoCartao({ titulo: "Gravar imóvel", prazo_hora: "10:15:00", source_gid: null }), "10:15 Gravar imóvel")
  // Campo ausente (tarefa otimista montada no browser).
  assert.equal(textoDoCartao({ titulo: "Gravar imóvel", prazo_hora: "10:15:00" }), "10:15 Gravar imóvel")
})

test("tarefa manual cujo título JÁ começa com a hora: comportamento original (sem origem Cal.com)", () => {
  assert.equal(
    textoDoCartao({ titulo: "09:00 - Reunião com cliente", prazo_hora: "09:00:00", source_gid: null }),
    "09:00 09:00 - Reunião com cliente"
  )
})

test("tarefa importada do Asana não é tratada como reunião", () => {
  assert.equal(
    textoDoCartao({ titulo: "09:00 - Call", prazo_hora: "09:00:00", source_gid: "1209876543210" }),
    "09:00 09:00 - Call"
  )
})

test("tarefa sem horário: nenhum prefixo", () => {
  assert.equal(textoDoCartao({ titulo: "Revisar contrato", prazo_hora: null, source_gid: null }), "Revisar contrato")
  const semHora = { ...reuniao("2026-10-29T12:00:00.000Z", "Participante Teste"), prazo_hora: null }
  assert.equal(textoDoCartao(semHora), "09:00 - Reunião com Participante Teste")
})

test("título começando por números não é mexido", () => {
  assert.equal(textoDoCartao({ titulo: "3 imóveis para gravar", prazo_hora: "08:00:00", source_gid: null }), "08:00 3 imóveis para gravar")
  assert.equal(textoDoCartao({ titulo: "2026 planejamento", prazo_hora: null, source_gid: null }), "2026 planejamento")
  // Reunião cujo título começa com número que NÃO é a hora do prazo.
  assert.equal(
    textoDoCartao({ titulo: "0900 ligar", prazo_hora: "09:00:00", source_gid: "calcom:bkg_teste_ficticio" }),
    "09:00 0900 ligar"
  )
})

test("reagendamento: o novo horário aparece uma vez só", () => {
  const antes = reuniao("2026-10-29T12:00:00.000Z", "Participante Teste")
  const depois = reuniao("2026-10-30T17:00:00.000Z", "Participante Teste") // sexta 14:00 BRT
  assert.equal(textoDoCartao(antes), "09:00 - Reunião com Participante Teste")
  assert.equal(textoDoCartao(depois), "14:00 - Reunião com Participante Teste")
})

test("hora do prazo diferente da do título (editada no Workspace): mantém o prefixo, não esconde a divergência", () => {
  const t = { ...reuniao("2026-10-29T12:00:00.000Z", "Participante Teste"), prazo_hora: "10:00:00" }
  assert.equal(textoDoCartao(t), "10:00 09:00 - Reunião com Participante Teste")
})

test("cancelamento: comportamento original preservado", () => {
  const t = reuniao("2026-10-29T12:00:00.000Z", "Participante Teste", "cancelada")
  assert.equal(t.titulo, "[Cancelada] 09:00 - Reunião com Participante Teste")
  assert.equal(textoDoCartao(t), "09:00 [Cancelada] 09:00 - Reunião com Participante Teste")
})

test("fuso America/Sao_Paulo: perto da meia-noite UTC continua no horário de Brasília", () => {
  // 30/10 01:30 UTC = 29/10 22:30 BRT.
  const t = reuniao("2026-10-30T01:30:00.000Z", "Participante Teste")
  assert.equal(textoDoCartao(t), "22:30 - Reunião com Participante Teste")
})

test("título longo: texto chega inteiro e o truncamento continua no CSS do cartão", () => {
  const nome = "Participante Com Um Nome Extremamente Longo Para Testar O Corte Visual Do Cartão"
  const t = reuniao("2026-10-29T12:00:00.000Z", nome)
  assert.equal(textoDoCartao(t), `09:00 - Reunião com ${nome}`)
  const fonte = readFileSync(new URL("../components/workspace/CalendarioTarefas.tsx", import.meta.url), "utf8")
  assert.match(fonte, /className=\{compacto \? "ws-pill-titulo-1l" : "ws-pill-titulo"\}>\s*\{prefixoHoraCalendario\(tarefa\)\}\s*\{tarefa\.titulo\}/)
})
