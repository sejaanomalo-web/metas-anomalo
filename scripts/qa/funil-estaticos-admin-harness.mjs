// Harness do PAINEL do Funil Estáticos Meta: empacota (esbuild) os componentes
// reais do editor — EditorFormularioFunil (tela inicial, perguntas, textos,
// prévia mobile/desktop), GerirCriativos, GeradorUrl e BotaoPrevia — com as
// server actions SUBSTITUÍDAS por um stub que só registra a chamada.
// Valida a interface sem banco, sem login e sem Supabase. NÃO valida
// permissões, persistência nem as consultas do painel (ver docs).
//   node scripts/qa/funil-estaticos-admin-harness.mjs   → http://localhost:4330
import { build } from "esbuild"
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..")
const PORTA = Number(process.env.PORTA ?? 4330)
const sql = readFileSync(join(RAIZ, "supabase/migrations/20261127_funil_estaticos_meta.sql"), "utf8")
const sql2 = readFileSync(join(RAIZ, "supabase/migrations/20261128_funil_apresentacao_teste.sql"), "utf8")
const v1 = JSON.parse(sql.split("$json$")[1])
const def = { ...v1, visual: "claro", apresentacao: JSON.parse(sql2.split("$json$")[1]),
  textos: { ...v1.textos, contato_subtitulo: "Informe seus dados para visualizar os horários disponíveis.", agenda_cta: "Confirmar agendamento" } }
const criativos = [...sql2.matchAll(/\('(E\d{2})', '([^']+)'\)/g)].map((m, i) => ({ id: `c${i}`, codigo: m[1], nome: m[2], hipotese: null, miniatura_url: null, meta_ad_id: null, status: "ativo", inicio_em: null }))

const STUB_ACOES = `
const reg = (nome) => async (...args) => {
  const a = args.map(x => x instanceof FormData ? Object.fromEntries(x.entries()) : x)
  ;(window.__acoes ||= []).push({ nome, args: a })
  if (nome === "gerarLinkPreviaAction") return { ok: true, token: "token-simulado-" + (a[2] || "funcional") }
  return { ok: true, mensagem: "(simulado) " + nome }
}
export const salvarRascunhoAction = reg("salvarRascunhoAction"), publicarRascunhoAction = reg("publicarRascunhoAction"),
  descartarRascunhoAction = reg("descartarRascunhoAction"), gerarLinkPreviaAction = reg("gerarLinkPreviaAction"),
  salvarCanalFunilAction = reg("salvarCanalFunilAction"), salvarConfigFunilAction = reg("salvarConfigFunilAction"),
  salvarCriativoAction = reg("salvarCriativoAction"), excluirCriativoAction = reg("excluirCriativoAction"),
  salvarInvestimentoAction = reg("salvarInvestimentoAction"), atualizarLeadFunilAction = reg("atualizarLeadFunilAction"),
  reprocessarConversoesAction = reg("reprocessarConversoesAction")`
const ENTRADA = `
import { createRoot } from "react-dom/client"
import { EditorFormularioFunil, GerirCriativos, GeradorUrl, BotaoPrevia } from "@/components/workspace/funil/FunilAdmin"
import { PARAMETROS_META_ADS } from "@/lib/funil-estaticos-nucleo"
const D = window.__DADOS__
createRoot(document.getElementById("app")).render(<div style={{ display: "grid", gap: 16, padding: 16 }}>
  <section id="editor"><EditorFormularioFunil funilId="f1" urlPublica="http://localhost:4321/funil/estaticos-meta"
    publicada={{ id: "v2", numero: 2, definicao: D.def }} rascunho={null}
    historico={[{ id: "v2", numero: 2, status: "publicada", publicada_em: "2026-11-28T12:00:00Z", criado_em: "2026-11-28T12:00:00Z" }, { id: "v1", numero: 1, status: "arquivada", publicada_em: "2026-11-27T12:00:00Z", criado_em: "2026-11-27T12:00:00Z" }]} /></section>
  <section id="diag"><BotaoPrevia funilId="f1" versaoId="v2" base="http://localhost:4321/funil/estaticos-meta" rotulo="Abrir link de diagnóstico da CAPI" modo="diagnostico_capi" /></section>
  <section id="url"><GeradorUrl base="http://localhost:4321/funil/estaticos-meta" parametros={PARAMETROS_META_ADS} criativos={D.criativos.map(c => ({ codigo: c.codigo, nome: c.nome }))} /></section>
  <section id="criativos"><GerirCriativos funilId="f1" criativos={D.criativos} /></section>
</div>)`

const stubs = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/funil-estaticos-actions$/ }, () => ({ path: "acoes", namespace: "stub" }))
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "nav", namespace: "stub" }))
    b.onResolve({ filter: /^entrada$/ }, () => ({ path: "entrada", namespace: "stub" }))
    b.onResolve({ filter: /^@\// }, a => b.resolve("./" + a.path.slice(2), { resolveDir: RAIZ, kind: a.kind }))
    b.onLoad({ filter: /^acoes$/, namespace: "stub" }, () => ({ contents: STUB_ACOES, loader: "js" }))
    b.onLoad({ filter: /^nav$/, namespace: "stub" }, () => ({ contents: "export const useRouter = () => ({ refresh() {}, push() {} })", loader: "js" }))
    b.onLoad({ filter: /^entrada$/, namespace: "stub" }, () => ({ contents: ENTRADA, loader: "tsx", resolveDir: RAIZ }))
  },
}
const r = await build({
  entryPoints: ["entrada"], bundle: true, write: false, format: "iife", jsx: "automatic", target: "es2020",
  plugins: [stubs], define: { "process.env.NODE_ENV": '"development"' }, nodePaths: [join(RAIZ, "node_modules")], logLevel: "error",
  resolveExtensions: [".tsx", ".ts", ".js", ".mjs"],
})
const JS = r.outputFiles[0].text
// Tokens mínimos do tema escuro do painel (o globals.css usa Tailwind e não entra aqui).
const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Painel do funil — harness</title><style>
:root{--text-1:#f2f2f4;--text-2:#c8c8cf;--text-3:#9a9aa3;--text-4:#7a7a84;--surface-3:#2a2a31;--accent:#C9953A;color-scheme:dark}
body{margin:0;background:#141416;color:var(--text-1);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.glass{background:#1c1c20;border:1px solid #2a2a31}
</style></head><body><div id="app"></div>
<script>window.__DADOS__=${JSON.stringify({ def, criativos }).replace(/</g, "\\u003c")}</script><script>${JS}</script></body></html>`

createServer((req, res) => {
  if (req.url === "/" || req.url?.startsWith("/?")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(HTML) }
  const m = req.url?.match(/^\/(funil\/[a-z0-9-]+\.png|favicon-32\.png)$/)
  if (m) { res.writeHead(200, { "content-type": "image/png" }); return res.end(readFileSync(join(RAIZ, "public", m[1]))) }
  res.writeHead(404); res.end()
}).listen(PORTA, () => console.log(`http://localhost:${PORTA}/  (bundle ${Math.round(JS.length / 1024)} KB)`))
