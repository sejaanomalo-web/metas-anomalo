/**
 * Importador do Asana — CLI. SOMENTE LEITURA no Asana.
 *
 *   npx tsx scripts/asana-import.ts descoberta
 *   npx tsx scripts/asana-import.ts dry-run
 *   npx tsx scripts/asana-import.ts dry-run --arquivo snapshot.json
 *   npx tsx scripts/asana-import.ts snapshot --saida snapshot.json
 *
 * Modos:
 *   descoberta  Conta o que existe na origem. Não grava staging, não escreve
 *               nada. Serve pra conferir que o token enxerga tudo.
 *   snapshot    Extrai tudo e salva um JSON no disco (replay offline depois).
 *   dry-run     Extrai, grava o CRU em ws_import_raw e produz o relatório de
 *               blockers/avisos. NÃO cria nenhuma tarefa canônica.
 *
 * A carga canônica (modo `completa`) ainda não está implementada — por
 * desenho: o plano exige dry-run e reconciliação aprovados antes dela existir.
 *
 * Requer em .env.local:
 *   ASANA_PAT                  token pessoal do Asana (só leitura é suficiente)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv"
import { readFileSync, writeFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"

import { AsanaArquivo, AsanaRest, type AsanaSource } from "../lib/asana/source"
import {
  abrirExecucao,
  dryRun,
  extrair,
  fecharExecucao,
  VERSAO_IMPORTADOR,
  type RelatorioDryRun,
} from "../lib/workspace-import"

config({ path: ".env.local" })

const args = process.argv.slice(2)
const modo = args[0] ?? "descoberta"

function opcao(nome: string): string | undefined {
  const i = args.indexOf(`--${nome}`)
  return i >= 0 ? args[i + 1] : undefined
}

function log(m: string) {
  console.log(m)
}

function criarSource(): AsanaSource {
  const arquivo = opcao("arquivo")
  if (arquivo) {
    log(`origem: arquivo ${arquivo}`)
    return AsanaArquivo.deJSON(readFileSync(arquivo, "utf-8"))
  }
  const token = process.env.ASANA_PAT
  if (!token) {
    console.error(
      "\nASANA_PAT não configurado.\n\n" +
        "Crie um Personal Access Token em:\n" +
        "  https://app.asana.com/0/my-apps  →  Create new token\n\n" +
        "e coloque em .env.local:\n" +
        "  ASANA_PAT=1/xxxxxxxx\n\n" +
        "Alternativa sem token: exporte um snapshot e use --arquivo snapshot.json\n"
    )
    process.exit(1)
  }
  log("origem: API do Asana (somente leitura)")
  return new AsanaRest({ token, aoProgredir: (m) => log(`  [rate] ${m}`) })
}

// ============================================================

async function descoberta() {
  const source = criarSource()
  const workspaces = await source.workspaces()
  if (workspaces.length === 0) {
    console.error("Nenhum workspace acessível com este token.")
    process.exit(1)
  }
  if (workspaces.length > 1) {
    log(`\nATENCAO: este token enxerga ${workspaces.length} workspaces:`)
    for (const w of workspaces) log(`  ${w.gid}  ${w.name ?? "?"}`)
    log("Defina ASANA_WORKSPACE_GID no .env.local para fixar qual sera migrado.")
  }
  const alvo = process.env.ASANA_WORKSPACE_GID || opcao("workspace")
  const ws = alvo ? workspaces.find((w) => w.gid === alvo) ?? workspaces[0] : workspaces[0]
  log(`\nWorkspace: ${ws.name ?? ws.gid} (${ws.gid})`)

  const [usuarios, projetos] = await Promise.all([
    source.usuarios(ws.gid),
    source.projetos(ws.gid),
  ])
  log(`Usuários: ${usuarios.length}`)
  log(`Projetos: ${projetos.length}`)

  const ativos = projetos.filter((p) => !p.archived)
  const arquivados = projetos.length - ativos.length
  log(`  ativos: ${ativos.length} | arquivados: ${arquivados}`)

  let definicoes = 0
  for (const p of projetos) definicoes += (p.custom_field_settings ?? []).length
  log(`Definições de campo nos projetos: ${definicoes}`)

  log("\nProjetos:")
  for (const p of projetos) {
    log(`  ${p.archived ? "[arq] " : "      "}${p.name ?? p.gid}`)
  }
  log("\nDescoberta não gravou nada. Rode `dry-run` para o relatório completo.")
}

async function snapshot() {
  const source = criarSource()
  const saida = opcao("saida") ?? "asana-snapshot.json"
  const workspaces = await source.workspaces()
  const ws = workspaces[0]
  if (!ws) {
    console.error("Nenhum workspace acessível.")
    process.exit(1)
  }

  log("Extraindo (isso leva alguns minutos com 1.500+ tarefas)…")
  const [usuarios, equipes, projetos] = await Promise.all([
    source.usuarios(ws.gid),
    source.equipes(ws.gid),
    source.projetos(ws.gid),
  ])

  const tarefas = new Map<string, unknown>()
  const secoes: unknown[] = []
  for (const p of projetos) {
    for (const s of await source.secoes(p.gid)) {
      secoes.push({ ...s, project: { gid: p.gid } })
    }
    for (const t of await source.tarefasDoProjeto(p.gid)) {
      if (!tarefas.has(t.gid)) tarefas.set(t.gid, t)
    }
    log(`  ${p.name ?? p.gid}`)
  }

  writeFileSync(
    saida,
    JSON.stringify(
      {
        lidoEm: new Date().toISOString(),
        workspaces, equipes, usuarios, projetos, secoes,
        tarefas: [...tarefas.values()],
        subtarefas: [], camposDefinicoes: [], camposPorProjeto: {},
        comentariosPorTarefa: {}, anexos: [],
      },
      null,
      2
    )
  )
  log(`\nSnapshot salvo em ${saida} (${tarefas.size} tarefas).`)
  log("Atenção: este snapshot NÃO inclui comentários, subtarefas nem anexos.")
  log("Ele serve para inspeção rápida, não para a carga definitiva.")
}

async function executarDryRun() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.")
    process.exit(1)
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { error: existe } = await db.from("ws_import_raw").select("id").limit(1)
  if (existe) {
    console.error(
      `\nStaging indisponível (${existe.message}).\n` +
        "Aplique supabase/migrations/20260722_workspace_asana_fase1.sql primeiro.\n"
    )
    process.exit(1)
  }

  const source = criarSource()
  const execucao = await abrirExecucao("dry_run")
  if (!execucao) {
    console.error("Não foi possível abrir a execução.")
    process.exit(1)
  }
  log(`Execução ${execucao.id} (importador ${VERSAO_IMPORTADOR})\n`)

  try {
    const extracao = await extrair(
      source,
      execucao.id,
      log,
      process.env.ASANA_WORKSPACE_GID || opcao("workspace")
    )
    if (!extracao) {
      await fecharExecucao(execucao.id, "falhou", {})
      process.exit(1)
    }

    log("\nAnalisando…")
    const relatorio = await dryRun(extracao, db)
    await fecharExecucao(
      execucao.id,
      relatorio.blockers.length > 0 ? "parcial" : "concluida",
      extracao.contadores,
      relatorio
    )
    imprimirRelatorio(relatorio)

    const saida = opcao("relatorio")
    if (saida) {
      writeFileSync(saida, JSON.stringify(relatorio, null, 2))
      log(`\nRelatório salvo em ${saida}`)
    }
    log(`\nExecução ${execucao.id} registrada em ws_import_execucoes.`)
    if (relatorio.blockers.length > 0) process.exit(2)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await fecharExecucao(execucao.id, "falhou", {})
    console.error(`\nFalhou: ${msg}`)
    process.exit(1)
  }
}

function imprimirRelatorio(r: RelatorioDryRun) {
  log("\n" + "=".repeat(58))
  log("RELATÓRIO DE DRY-RUN")
  log("=".repeat(58))

  log("\nContagens na origem:")
  for (const [k, v] of Object.entries(r.contadores)) {
    log(`  ${k.padEnd(14)} ${v}`)
  }

  const d = r.detalhes
  log("\nTarefas:")
  log(`  sem prazo               ${d.tarefasSemPrazo}`)
  log(`  com horário exato       ${d.tarefasComHorario}`)
  for (const [n, qtd] of Object.entries(d.tarefasPorQtdProjetos).sort()) {
    log(`  em ${n} projeto(s)          ${qtd}`)
  }

  log("\nAnexos:")
  log(`  binários (baixar)       ${d.anexosBinarios}`)
  log(`  externos (link)         ${d.anexosExternos}`)
  log(`  sem download_url        ${d.anexosSemDownload}`)

  const topDominios = Object.entries(d.dominiosDeLink)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  if (topDominios.length > 0) {
    log("\nDomínios mais citados nas descrições:")
    for (const [dom, qtd] of topDominios) log(`  ${dom.padEnd(28)} ${qtd}`)
  }

  if (d.projetosVazios.length > 0) {
    log(`\nProjetos vazios (importados mesmo assim): ${d.projetosVazios.join(", ")}`)
  }

  if (d.usuariosNaoMapeados.length > 0) {
    log("\nUsuários sem conta correspondente:")
    for (const u of d.usuariosNaoMapeados) log(`  ${u.nome} ${u.email ?? ""}`)
  }

  if (d.tiposDeCampoDesconhecidos.length > 0) {
    log("\nCampos com tipo não suportado:")
    for (const c of d.tiposDeCampoDesconhecidos) {
      log(`  ${c.nome} (${c.tipoOrigem})`)
    }
  }

  if (r.avisos.length > 0) {
    log("\nAVISOS:")
    for (const a of r.avisos) log(`  • ${a}`)
  }

  if (r.blockers.length > 0) {
    log("\nBLOCKERS — o cutover não pode acontecer com isto em aberto:")
    for (const b of r.blockers) log(`  ✗ ${b}`)
  } else {
    log("\nNenhum blocker.")
  }
  log("")
}

// ============================================================

async function main() {
  switch (modo) {
    case "descoberta": await descoberta(); break
    case "snapshot": await snapshot(); break
    case "dry-run":
    case "dry_run": await executarDryRun(); break
    default:
      console.error(`Modo desconhecido: ${modo}`)
      console.error("Use: descoberta | snapshot | dry-run")
      process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
