/**
 * Classificação automática dos projetos importados do Asana.
 *
 *   npx tsx scripts/asana-classificar.ts            # mostra o que faria
 *   npx tsx scripts/asana-classificar.ts --aplicar  # grava
 *
 * POR QUE EXISTE: o plano manda não transformar projeto em cliente
 * automaticamente, e isso continua valendo — nenhuma REGRA aqui inventa
 * vínculo. O que este script faz é casar o nome do projeto com o que JÁ está
 * cadastrado no sistema (cliente_trafego e empresas_config). Quando não há
 * correspondência, ele NÃO chuta: marca como contexto geral e diz por quê.
 *
 * Tudo que ele decide continua editável em /dashboard/workspace/importar.
 *
 * REGRA, na ordem:
 *   1. nome bate exato com cliente_trafego  -> tipo=cliente  (mais específico)
 *   2. nome bate exato com empresas_config  -> tipo=empresa
 *   3. nome é variante minúscula de um projeto maior e tem <= 1 tarefa
 *                                           -> descartado (arquivado)
 *   4. resto                                -> tipo=geral, com aviso
 *
 * O passo 3 é o único que "joga fora", e mesmo assim só arquiva a PASTA:
 * as tarefas continuam existindo, visíveis no calendário e nos outros
 * contextos. Nada é apagado.
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { normalizar } from "../lib/workspace-import"

config({ path: ".env.local" })

const aplicar = process.argv.includes("--aplicar")

interface Decisao {
  id: string
  nome: string
  tarefas: number
  tipo: string
  clienteId: string | null
  empresaNome: string | null
  arquivar: boolean
  motivo: string
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("Supabase env ausente.")
    process.exit(1)
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  const [{ data: cliData }, { data: empData }, { data: ctxData }] = await Promise.all([
    db.from("cliente_trafego").select("id, nome, display_name").eq("ativo", true),
    // SEM filtro de ativa: "Diego Knebel" (340 tarefas), "IBB" (151) e
    // "ABF Cascavel" (66) existem como empresa mas estao desativadas. Ignora-las
    // jogaria 557 tarefas pra "geral" e perderia o vinculo historico — e
    // empresa_nome e so texto, nao exige que a empresa esteja ativa.
    db.from("empresas_config").select("nome, ativa"),
    db.from("ws_contextos")
      .select("id, nome, tipo, source_gid")
      .not("source_gid", "is", null)
      .is("arquivado_em", null),
  ])

  const clientes = (cliData ?? []) as { id: string; nome: string; display_name: string | null }[]
  const empresas = (empData ?? []) as { nome: string; ativa: boolean }[]
  const contextos = (ctxData ?? []) as {
    id: string; nome: string; tipo: string; source_gid: string
  }[]

  // Contagem de tarefas por projeto, direto do staging (as tarefas ainda não
  // foram carregadas, então não dá pra contar em ws_tarefa_contextos).
  const contagem = new Map<string, number>()
  for (let off = 0; ; off += 500) {
    const { data } = await db
      .from("ws_import_raw")
      .select("payload")
      .eq("tipo_objeto", "task")
      .order("id")
      .range(off, off + 499)
    const linhas = (data ?? []) as { payload: { memberships?: { project?: { gid?: string } }[] } }[]
    for (const l of linhas) {
      for (const m of l.payload.memberships ?? []) {
        const g = m.project?.gid
        if (g) contagem.set(g, (contagem.get(g) ?? 0) + 1)
      }
    }
    if (linhas.length < 500) break
  }

  // Índice pra detectar variante minúscula: mesmo nome normalizado, projeto
  // muito maior existindo. "ibb" (1 tarefa) ao lado de "IBB" (151).
  const porNomeNormalizado = new Map<string, { nome: string; tarefas: number }[]>()
  for (const c of contextos) {
    const n = normalizar(c.nome)
    const lista = porNomeNormalizado.get(n) ?? []
    lista.push({ nome: c.nome, tarefas: contagem.get(c.source_gid) ?? 0 })
    porNomeNormalizado.set(n, lista)
  }

  const decisoes: Decisao[] = []

  for (const c of contextos) {
    if (c.tipo !== "desconhecido") continue
    const n = normalizar(c.nome)
    const tarefas = contagem.get(c.source_gid) ?? 0

    // 3) variante minúscula de um projeto homônimo maior
    const irmaos = porNomeNormalizado.get(n) ?? []
    const maior = irmaos.reduce((a, b) => (b.tarefas > a.tarefas ? b : a), irmaos[0])
    const ehVarianteFraca =
      irmaos.length > 1 && tarefas <= 1 && maior.tarefas > tarefas * 10 + 5
    if (ehVarianteFraca) {
      decisoes.push({
        id: c.id, nome: c.nome, tarefas, tipo: "desconhecido",
        clienteId: null, empresaNome: null, arquivar: true,
        motivo: `variante de "${maior.nome}" (${maior.tarefas} tarefas) — parece teste`,
      })
      continue
    }

    // Projeto vazio sem nenhum par: também não vale virar pasta.
    if (tarefas === 0 && irmaos.length === 1) {
      decisoes.push({
        id: c.id, nome: c.nome, tarefas, tipo: "desconhecido",
        clienteId: null, empresaNome: null, arquivar: true,
        motivo: "vazio e sem correspondência",
      })
      continue
    }

    // 1) cliente cadastrado (mais específico que empresa)
    const cliente = clientes.find(
      (x) => normalizar(x.display_name || x.nome) === n
    )
    if (cliente) {
      decisoes.push({
        id: c.id, nome: c.nome, tarefas, tipo: "cliente",
        clienteId: cliente.id, empresaNome: null, arquivar: false,
        motivo: `cliente cadastrado: ${cliente.display_name || cliente.nome}`,
      })
      continue
    }

    // 2) empresa cadastrada
    const empresa = empresas.find((x) => normalizar(x.nome) === n)
    if (empresa) {
      decisoes.push({
        id: c.id, nome: c.nome, tarefas, tipo: "empresa",
        clienteId: null, empresaNome: empresa.nome, arquivar: false,
        motivo: `empresa cadastrada: ${empresa.nome}${empresa.ativa ? "" : " (desativada)"}`,
      })
      continue
    }

    // 4) sem correspondência — NÃO inventa vínculo
    decisoes.push({
      id: c.id, nome: c.nome, tarefas, tipo: "geral",
      clienteId: null, empresaNome: null, arquivar: false,
      motivo: "não existe como cliente nem empresa no sistema",
    })
  }

  decisoes.sort((a, b) => b.tarefas - a.tarefas)

  const grupos: Record<string, Decisao[]> = {
    cliente: decisoes.filter((d) => d.tipo === "cliente" && !d.arquivar),
    empresa: decisoes.filter((d) => d.tipo === "empresa" && !d.arquivar),
    geral: decisoes.filter((d) => d.tipo === "geral" && !d.arquivar),
    arquivar: decisoes.filter((d) => d.arquivar),
  }

  console.log(aplicar ? "APLICANDO\n" : "SIMULAÇÃO (use --aplicar para gravar)\n")
  for (const [titulo, lista] of Object.entries(grupos)) {
    if (lista.length === 0) continue
    console.log(`${titulo.toUpperCase()} (${lista.length}):`)
    for (const d of lista) {
      console.log(`  ${String(d.tarefas).padStart(4)}  ${d.nome.padEnd(30)} ${d.motivo}`)
    }
    console.log()
  }

  if (!aplicar) {
    console.log("Nada foi gravado.")
    return
  }

  let ok = 0
  let falhou = 0
  for (const d of decisoes) {
    const patch = d.arquivar
      ? { arquivado_em: new Date().toISOString(), tipo: "desconhecido", cliente_id: null, empresa_nome: null }
      : {
          tipo: d.tipo,
          cliente_id: d.tipo === "cliente" ? d.clienteId : null,
          empresa_nome: d.tipo === "empresa" ? d.empresaNome : null,
          arquivado_em: null,
        }
    const { error } = await db.from("ws_contextos").update(patch).eq("id", d.id)
    if (error) {
      console.error(`  ! ${d.nome}: ${error.message}`)
      falhou++
    } else ok++
  }
  console.log(`\nAplicadas: ${ok} | falhas: ${falhou}`)
  console.log("Revise e ajuste em /dashboard/workspace/importar.")
}

main().catch((e) => {
  console.error(e?.message ?? e)
  process.exit(1)
})
