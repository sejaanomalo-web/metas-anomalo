/**
 * Verificação do Workspace. Rode com:  npx tsx scripts/test-workspace.ts
 *
 * Não existe framework de teste neste repo (ver docs/WORKSPACE-PLANO.md §9),
 * então este script cobre o que é caro descobrir tarde e impossível de ver
 * clicando: fuso, segurança do parser de link, constraints do banco,
 * idempotência, isolamento da anon key e concorrência.
 *
 * Ele CRIA e APAGA os próprios dados (prefixo [TESTE]). Não toca em nada que
 * já exista. Precisa de .env.local com NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"

import {
  diffDiasISO,
  ehDataISOValida,
  gradeDoMes,
  hojeISO,
  normalizarHora,
  rangeDoMes,
  situacaoPrazo,
  somarDiasISO,
} from "../lib/workspace-datas"
import {
  analisarDescricao,
  descricaoResumida,
  extrairMencoes,
  urlSegura,
} from "../lib/workspace-markdown"
import { converterHtmlAsana, normalizarUrl } from "../lib/workspace-html"
import { normalizar, prazoDoAsana } from "../lib/workspace-import"

config({ path: ".env.local" })

let passou = 0
let falhou = 0
const falhas: string[] = []

function ok(nome: string, condicao: boolean, detalhe?: string) {
  if (condicao) {
    passou++
    console.log(`  ✓ ${nome}`)
  } else {
    falhou++
    falhas.push(nome)
    console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`)
  }
}

function secao(titulo: string) {
  console.log(`\n${titulo}`)
}

// =============================================================================
// 1) Datas em BRT
// =============================================================================
function testarDatas() {
  secao("1) Datas (America/Sao_Paulo)")

  // 03:00 UTC do dia 2 = 00:00 BRT do dia 2 — mesmo dia.
  ok(
    "meia-noite BRT fica no dia certo",
    hojeISO(new Date("2026-03-02T03:00:00Z")) === "2026-03-02"
  )
  // 02:59 UTC do dia 2 = 23:59 BRT do dia 1 — este é o caso que quebra quem
  // usa timestamptz: o servidor em UTC já virou o dia, o Brasil não.
  ok(
    "23:59 BRT ainda é o dia anterior",
    hojeISO(new Date("2026-03-02T02:59:00Z")) === "2026-03-01"
  )
  // Horário de verão histórico brasileiro (vigorou até 2019): em 2018-02-01 o
  // Brasil estava em UTC-2, então 01:30 UTC do dia 1 = 23:30 do dia 31/01.
  ok(
    "horário de verão histórico (2018) respeitado",
    hojeISO(new Date("2018-02-01T01:30:00Z")) === "2018-01-31"
  )

  ok("somarDiasISO atravessa mês", somarDiasISO("2026-01-31", 1) === "2026-02-01")
  ok("somarDiasISO atravessa ano", somarDiasISO("2025-12-31", 1) === "2026-01-01")
  ok("somarDiasISO negativo", somarDiasISO("2026-03-01", -1) === "2026-02-28")
  ok("ano bissexto", somarDiasISO("2024-02-28", 1) === "2024-02-29")
  ok("diffDiasISO", diffDiasISO("2026-07-01", "2026-07-08") === 7)

  ok("data inválida rejeitada (31/02)", !ehDataISOValida("2026-02-31"))
  ok("data inválida rejeitada (mês 13)", !ehDataISOValida("2026-13-01"))
  ok("data válida aceita", ehDataISOValida("2026-07-21"))
  ok("formato solto rejeitado", !ehDataISOValida("21/07/2026"))

  ok("hora normalizada", normalizarHora("09:30:00") === "09:30")
  ok("hora inválida vira null", normalizarHora("25:00") === null)

  const hoje = "2026-07-21"
  ok("atrasada", situacaoPrazo("2026-07-20", hoje) === "atrasada")
  ok("hoje", situacaoPrazo("2026-07-21", hoje) === "hoje")
  ok("amanhã", situacaoPrazo("2026-07-22", hoje) === "amanha")
  ok("próximos 7", situacaoPrazo("2026-07-27", hoje) === "proximos_7")
  ok("futura", situacaoPrazo("2026-09-01", hoje) === "futura")
  ok("sem prazo", situacaoPrazo(null, hoje) === "sem_prazo")

  const grade = gradeDoMes(2026, 7)
  ok("grade é múltiplo de 7", grade.length % 7 === 0)
  ok("grade cobre o mês inteiro", grade.filter((c) => c.doMes).length === 31)
  ok("grade começa no domingo", new Date(`${grade[0].iso}T12:00:00Z`).getUTCDay() === 0)
  const r = rangeDoMes(2026, 2)
  ok("fevereiro 2026 termina em 28", r.fim === "2026-02-28")
}

// =============================================================================
// 2) Parser / segurança de link
// =============================================================================
function testarMarkdown() {
  secao("2) Markdown-lite e segurança de link")

  ok("javascript: NÃO vira link", urlSegura("javascript:alert(1)") === null)
  ok("JaVaScRiPt: (case) NÃO vira link", urlSegura("JaVaScRiPt:alert(1)") === null)
  ok("data: NÃO vira link", urlSegura("data:text/html,<script>") === null)
  ok("file: NÃO vira link", urlSegura("file:///etc/passwd") === null)
  ok("https vira link", urlSegura("https://drive.google.com/x") === "https://drive.google.com/x")
  ok("http vira link", urlSegura("http://exemplo.com") === "http://exemplo.com")
  ok("URL com espaço rejeitada", urlSegura("https://a.com/ x") === null)

  const b = analisarDescricao("Veja https://drive.google.com/abc e javascript:alert(1)")
  const trechos = b.flatMap((x) => (x.tipo === "paragrafo" ? x.trechos : x.itens.flat()))
  const links = trechos.filter((t) => t.tipo === "link")
  ok("só 1 link reconhecido", links.length === 1)
  ok(
    "o link é o https",
    links[0]?.tipo === "link" && links[0].href === "https://drive.google.com/abc"
  )
  ok(
    "javascript: sobrou como texto",
    trechos.some((t) => t.tipo === "texto" && t.valor.includes("javascript:"))
  )

  const md = analisarDescricao("[clique](javascript:alert(1))")
  const linksMd = md
    .flatMap((x) => (x.tipo === "paragrafo" ? x.trechos : x.itens.flat()))
    .filter((t) => t.tipo === "link")
  ok("link markdown com javascript: não vira link", linksMd.length === 0)

  const html = analisarDescricao("<script>alert(1)</script> <img onerror=x>")
  const temHtmlComoTexto = html
    .flatMap((x) => (x.tipo === "paragrafo" ? x.trechos : x.itens.flat()))
    .every((t) => t.tipo === "texto")
  ok("HTML colado permanece texto puro", temHtmlComoTexto)

  const lista = analisarDescricao("Tarefas:\n- primeiro\n- segundo\n\nFim")
  ok("lista reconhecida", lista.some((x) => x.tipo === "lista"))
  ok(
    "lista tem 2 itens",
    lista.find((x) => x.tipo === "lista")?.tipo === "lista" &&
      (lista.find((x) => x.tipo === "lista") as { itens: unknown[] }).itens.length === 2
  )

  ok("menções extraídas", extrairMencoes("oi @bruno e @maria").join(",") === "bruno,maria")
  ok("resumo corta no limite", descricaoResumida("a".repeat(300), 50).length <= 50)
  ok("descrição vazia não quebra", analisarDescricao(null).length === 0)
}


// =============================================================================
// 2b) Conversao do HTML do Asana
// =============================================================================
function testarConversaoAsana() {
  secao("2b) HTML do Asana -> markdown-lite")

  const r1 = converterHtmlAsana(
    '<body><strong>Gravar</strong> o reels e <em>revisar</em> depois. ' +
    '<a href="https://drive.google.com/x">pasta</a></body>', null)
  ok("negrito convertido", r1.texto.includes("**Gravar**"))
  ok("italico convertido", r1.texto.includes("_revisar_"))
  ok("link virou markdown", r1.texto.includes("[pasta](https://drive.google.com/x)"))
  ok("link coletado", r1.links[0] === "https://drive.google.com/x")

  const r2 = converterHtmlAsana('<body><a href="javascript:alert(1)">clique</a></body>', null)
  ok("href javascript: descartado", r2.links.length === 0)
  ok("mas o TEXTO do link sobrevive", r2.texto.includes("clique"))

  const r3 = converterHtmlAsana('<body><ul><li>um</li><li>dois</li></ul></body>', null)
  ok("lista vira hifen", (r3.texto.match(/^- /gm) ?? []).length === 2)

  const r4 = converterHtmlAsana('<body>2 &lt; 3 &amp; 4 &gt; 1 &ndash; fim</body>', null)
  ok("entidades decodificadas", r4.texto.includes("2 < 3 & 4 > 1"))

  const r5 = converterHtmlAsana('<body>use **isto** literal</body>', null)
  ok("marcador do usuario e escapado", r5.texto.includes("\\*\\*isto"))

  const r6 = converterHtmlAsana(null, "so texto puro https://exemplo.com aqui")
  ok("cai pro notes quando nao ha html", r6.texto.startsWith("so texto puro"))
  ok("url extraida do texto puro", r6.links[0] === "https://exemplo.com")

  const r7 = converterHtmlAsana('<body><blink>x</blink>ok</body>', null)
  ok("tag desconhecida e reportada", r7.tagsIgnoradas.includes("blink"))

  ok("normalizarUrl remove fragmento",
    normalizarUrl("https://WWW.Exemplo.com/a#frag") === "https://exemplo.com/a")
}

// =============================================================================
// 2c) Normalizacao de nome e prazo (casamento com clientes)
// =============================================================================
function testarNormalizacaoImport() {
  secao("2c) Normalizacao de nomes e prazos")

  // U+A4E5 e o caractere REAL nos projetos, lido dos codepoints do staging.
  // A primeira versao deste teste usava U+A4A5, que eu tinha suposto — passava
  // verde com o codigo errado. Teste e codigo agora vem do dado, nao do chute.
  ok("TATO estilizado casa com Tato",
    normalizar("T\u{A4E5}TO ESTOFADOS") === normalizar("Tato Estofados"))
  ok("ANOMALO HUB estilizado casa",
    normalizar("\u{A4E5}NOMALO HUB") === normalizar("Anomalo Hub"))
  ok("acento ignorado", normalizar("MAE DIVINA") === normalizar("M\u00e3e Divina"))
  ok("caixa ignorada", normalizar("ibb") === normalizar("IBB"))
  ok("nomes diferentes NAO casam", normalizar("Job") !== normalizar("Job Nilton"))

  // due_on: data pura, sem horario, sem deslocar dia
  const p1 = prazoDoAsana("2026-07-21", null)
  ok("due_on vira data pura", p1.data === "2026-07-21" && p1.hora === null)

  // due_at 02:00Z = 23:00 BRT do dia ANTERIOR — o caso que quebra timestamptz
  const p2 = prazoDoAsana(null, "2026-07-22T02:00:00.000Z")
  ok("due_at convertido pra BRT (vira dia anterior)",
    p2.data === "2026-07-21" && p2.hora === "23:00", `${p2.data} ${p2.hora}`)

  const p3 = prazoDoAsana(null, "2026-07-21T15:30:00.000Z")
  ok("due_at meio do dia", p3.data === "2026-07-21" && p3.hora === "12:30",
    `${p3.data} ${p3.hora}`)

  const p4 = prazoDoAsana(null, null)
  ok("sem prazo", p4.data === null && p4.hora === null)
}

// =============================================================================
// 3) Banco: constraints, idempotência, isolamento, concorrência
// =============================================================================
async function testarBanco() {
  secao("3) Banco (constraints, idempotência, isolamento)")

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !service) {
    console.log("  ! Sem NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — pulando.")
    return
  }
  const db = createClient(url, service, { auth: { persistSession: false } })

  // A migration já rodou?
  const { error: existe } = await db.from("ws_tarefas").select("id").limit(1)
  if (existe) {
    console.log(`  ! ws_tarefas indisponível (${existe.message}).`)
    console.log("    Rode supabase/migrations/20260721_workspace_fase1.sql antes.")
    falhou++
    falhas.push("migration não aplicada")
    return
  }

  const criados: string[] = []
  const contextosCriados: string[] = []

  try {
    // --- CHECK de conclusão.
    // A migration do Asana RELAXOU esta regra de propósito: antes exigia
    // concluida_por junto com concluida_em, o que barraria as 1.500 tarefas
    // concluídas cujo autor ainda é identidade externa. O que continua
    // proibido é o inverso — dizer QUEM concluiu sem dizer QUANDO.
    const idConcl = randomUUID()
    const { error: e1ok } = await db.from("ws_tarefas").insert({
      id: idConcl,
      titulo: "[TESTE] concluida sem ator interno",
      concluida_em: new Date().toISOString(),
    })
    criados.push(idConcl)
    ok("concluida_em sozinho é ACEITO (caso da importação)", !e1ok, e1ok?.message)

    const { data: algumUsuario } = await db
      .from("usuarios").select("id").eq("ativo", true).limit(1).maybeSingle()
    if (algumUsuario) {
      const { error: e1bad } = await db.from("ws_tarefas").insert({
        titulo: "[TESTE] concluida_por sem data",
        concluida_por: (algumUsuario as { id: string }).id,
      })
      ok("concluida_por sem concluida_em é rejeitado", Boolean(e1bad))
    }

    // --- CHECK: título vazio
    const { error: e2 } = await db.from("ws_tarefas").insert({ titulo: "   " })
    ok("título em branco é rejeitado", Boolean(e2))

    // --- CHECK: hora sem data
    const { error: e3 } = await db
      .from("ws_tarefas")
      .insert({ titulo: "[TESTE] hora sem data", prazo_hora: "09:00" })
    ok("prazo_hora sem prazo_em é rejeitado", Boolean(e3))

    // --- Tarefa base
    const idBase = randomUUID()
    const { error: e4 } = await db
      .from("ws_tarefas")
      .insert({ id: idBase, titulo: "[TESTE] base", prazo_em: hojeISO() })
    criados.push(idBase)
    ok("tarefa base criada", !e4, e4?.message)

    // --- Idempotência: 3 upserts com o mesmo id => 1 linha
    for (let i = 0; i < 3; i++) {
      await db
        .from("ws_tarefas")
        .upsert({ id: idBase, titulo: "[TESTE] base" }, { onConflict: "id", ignoreDuplicates: true })
    }
    const { count: qtdBase } = await db
      .from("ws_tarefas")
      .select("id", { count: "exact", head: true })
      .eq("id", idBase)
    ok("upsert repetido não duplica (duplo clique)", qtdBase === 1)

    // --- Hierarquia: 1 nível
    const idSub = randomUUID()
    const { error: e5 } = await db
      .from("ws_tarefas")
      .insert({ id: idSub, titulo: "[TESTE] sub", tarefa_pai_id: idBase })
    criados.push(idSub)
    ok("subtarefa de 1º nível é aceita", !e5, e5?.message)

    const { error: e6 } = await db
      .from("ws_tarefas")
      .insert({ titulo: "[TESTE] sub-sub", tarefa_pai_id: idSub })
    ok("subtarefa de subtarefa é rejeitada", Boolean(e6))

    // --- Contexto: tipo cliente exige cliente_id
    const { error: e7 } = await db
      .from("ws_contextos")
      .insert({ nome: "[TESTE] cliente sem id", tipo: "cliente" })
    ok("contexto tipo=cliente sem cliente_id é rejeitado", Boolean(e7))

    // --- Multi-contexto: 1 tarefa, N vínculos, 1 linha só
    const ctxIds: string[] = []
    for (const nome of ["[TESTE] ctx A", "[TESTE] ctx B", "[TESTE] ctx C"]) {
      const { data } = await db
        .from("ws_contextos")
        .insert({ nome, tipo: "geral" })
        .select("id")
        .single()
      if (data) {
        ctxIds.push(data.id as string)
        contextosCriados.push(data.id as string)
      }
    }
    await db
      .from("ws_tarefa_contextos")
      .insert(ctxIds.map((contexto_id) => ({ tarefa_id: idBase, contexto_id })))

    const { count: qtdTarefa } = await db
      .from("ws_tarefas")
      .select("id", { count: "exact", head: true })
      .eq("id", idBase)
    ok("tarefa em 3 contextos continua sendo 1 linha", qtdTarefa === 1)

    // Vincular de novo ao mesmo contexto não duplica (PK composta).
    const { error: e8 } = await db
      .from("ws_tarefa_contextos")
      .insert({ tarefa_id: idBase, contexto_id: ctxIds[0] })
    ok("vínculo duplicado é rejeitado", Boolean(e8))

    // Desvincular de 1 contexto NÃO apaga a tarefa.
    await db
      .from("ws_tarefa_contextos")
      .delete()
      .eq("tarefa_id", idBase)
      .eq("contexto_id", ctxIds[0])
    const { count: aindaExiste } = await db
      .from("ws_tarefas")
      .select("id", { count: "exact", head: true })
      .eq("id", idBase)
    const { count: vinculosRestantes } = await db
      .from("ws_tarefa_contextos")
      .select("tarefa_id", { count: "exact", head: true })
      .eq("tarefa_id", idBase)
    ok("desvincular não apaga a tarefa", aindaExiste === 1)
    ok("sobraram 2 vínculos", vinculosRestantes === 2)

    // --- Idempotência de recorrência (Fase 5, coluna já existe)
    const chave = `teste-${idBase}:2026-07-21`
    const idOc1 = randomUUID()
    await db.from("ws_tarefas").insert({ id: idOc1, titulo: "[TESTE] ocorrência", ocorrencia_chave: chave })
    criados.push(idOc1)
    const { error: e9 } = await db
      .from("ws_tarefas")
      .insert({ titulo: "[TESTE] ocorrência dup", ocorrencia_chave: chave })
    ok("ocorrência recorrente duplicada é rejeitada", Boolean(e9))

    // --- Concorrência otimista
    const { data: antes } = await db
      .from("ws_tarefas")
      .select("versao")
      .eq("id", idBase)
      .single()
    const v = (antes?.versao as number) ?? 1
    const { data: up1 } = await db
      .from("ws_tarefas")
      .update({ titulo: "[TESTE] editado 1", versao: v + 1 })
      .eq("id", idBase)
      .eq("versao", v)
      .select("id")
    const { data: up2 } = await db
      .from("ws_tarefas")
      .update({ titulo: "[TESTE] editado 2", versao: v + 1 })
      .eq("id", idBase)
      .eq("versao", v) // versão velha — simula o 2º usuário
      .select("id")
    ok("1º update com a versão certa passa", (up1 ?? []).length === 1)
    ok("2º update com versão velha afeta 0 linhas", (up2 ?? []).length === 0)

    // --- updated_at é mexido pelo trigger
    const { data: dep } = await db
      .from("ws_tarefas")
      .select("created_at, updated_at")
      .eq("id", idBase)
      .single()
    ok(
      "trigger atualiza updated_at",
      Boolean(dep) && new Date(dep!.updated_at as string) > new Date(dep!.created_at as string)
    )

    // --- Isolamento: a anon key não pode ler as tarefas
    if (anon) {
      const pub = createClient(url, anon, { auth: { persistSession: false } })
      const { data: vazio, error: eAnon } = await pub.from("ws_tarefas").select("id").limit(1)
      ok(
        "anon key NÃO lê ws_tarefas (RLS sem policy)",
        Boolean(eAnon) || (vazio ?? []).length === 0,
        eAnon ? undefined : `retornou ${(vazio ?? []).length} linha(s)`
      )
      const { error: eIns } = await pub
        .from("ws_tarefas")
        .insert({ titulo: "[TESTE] anon nao pode" })
      ok("anon key NÃO escreve em ws_tarefas", Boolean(eIns))

      const { error: ePing } = await pub.from("ws_realtime_ping").select("id").limit(1)
      ok("anon key LÊ ws_realtime_ping (exceção intencional)", !ePing, ePing?.message)
    } else {
      console.log("  ! Sem NEXT_PUBLIC_SUPABASE_ANON_KEY — pulando isolamento.")
    }

    // --- Cascade do soft delete não é destrutivo
    await db
      .from("ws_tarefas")
      .update({ excluida_em: new Date().toISOString() })
      .eq("id", idBase)
    const { count: naLixeira } = await db
      .from("ws_tarefas")
      .select("id", { count: "exact", head: true })
      .eq("id", idBase)
    ok("soft delete mantém a linha no banco", naLixeira === 1)
  } finally {
    // Limpeza — só o que este script criou.
    for (const id of criados) await db.from("ws_tarefas").delete().eq("id", id)
    await db.from("ws_tarefas").delete().like("titulo", "[TESTE]%")
    for (const id of contextosCriados) await db.from("ws_contextos").delete().eq("id", id)
    await db.from("ws_contextos").delete().like("nome", "[TESTE]%")
    console.log("\n  (dados de teste removidos)")
  }
}

// =============================================================================
async function main() {
  console.log("=== Verificação do Workspace ===")
  testarDatas()
  testarMarkdown()
  testarConversaoAsana()
  testarNormalizacaoImport()
  await testarBanco()

  console.log(`\n${passou} passaram, ${falhou} falharam`)
  if (falhou > 0) {
    console.log("\nFalhas:")
    for (const f of falhas) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
