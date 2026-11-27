// HTML da página pública do funil: renderizado no servidor com a 1ª pergunta
// pronta, CSS e JS inline, sem fontes externas. CSP estrita com hash do script.
import { createHash } from "node:crypto"
import { SCRIPT_CLIENTE } from "./funil-estaticos-cliente"
import { PARAMS_ATRIBUICAO, type DefinicaoFunil } from "./funil-estaticos-nucleo"

const HASH_SCRIPT = `'sha256-${createHash("sha256").update(SCRIPT_CLIENTE).digest("base64")}'`

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}
/** JSON seguro dentro de <script type="application/json">. */
export function jsonSeguro(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")
}

export function cabecalhosSeguranca(): Record<string, string> {
  return {
    "content-security-policy": [
      "default-src 'self'",
      `script-src 'self' ${HASH_SCRIPT} https://connect.facebook.net`,
      "style-src 'unsafe-inline'",
      "img-src 'self' data: https://www.facebook.com",
      "connect-src 'self' https://www.facebook.com https://connect.facebook.net",
      "frame-src https://www.facebook.com",
      "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'",
    ].join("; "),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-robots-tag": "noindex, nofollow",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  }
}

const CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{--bg:#000;--s1:#0f0f12;--s2:#17171c;--b:#2a2a31;--t1:#fff;--t2:#c9c9d1;--t3:#8d8d97;--ac:#C9953A;--er:#ff8a80;color-scheme:dark}
html{-webkit-text-size-adjust:100%;background:var(--bg)}
body{margin:0;min-height:100dvh;background:var(--bg);color:var(--t1);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.f-wrap{max-width:560px;margin:0 auto;padding:max(16px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom))}
.f-top{display:flex;align-items:center;gap:10px;height:40px}
.f-top img{display:block}
.f-marca{font-weight:700;letter-spacing:.18em;font-size:13px}
.f-voltar{margin-left:auto;background:none;border:0;color:var(--t2);font:inherit;font-size:14px;padding:8px 4px;min-height:40px;cursor:pointer}
.f-voltar[hidden]{display:none}
.f-prog{margin:12px 0 4px;height:4px;background:var(--s2);border-radius:4px;overflow:hidden}
#f-barra{height:100%;background:var(--ac);transform-origin:left;transform:scaleX(0);transition:transform .25s ease}
.f-cont{font-size:12px;color:var(--t3);margin:0 0 18px}
.f-intro h1{font-size:20px;line-height:1.25;margin:0 0 6px;font-weight:700}
.f-intro p{margin:0 0 22px;color:var(--t2);font-size:15px}
.f-titulo{font-size:20px;line-height:1.3;margin:0 0 16px;font-weight:700;outline:none}
.f-sub{color:var(--t2);margin:0 0 18px}
.f-meta{color:var(--t3);font-size:13px;margin:0 0 12px}
.f-opcoes{display:grid;gap:10px}
.f-opcao,.f-slot,.f-dia{font:inherit;color:var(--t1);background:var(--s1);border:1px solid var(--b);border-radius:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.f-opcao{text-align:left;padding:16px;min-height:56px;font-size:16px;transition:border-color .12s,background .12s}
.f-opcao:hover{border-color:#44444d}
.f-opcao[aria-checked=true],.f-slot[aria-checked=true],.f-dia[aria-selected=true]{border-color:var(--ac);background:#1d1709}
button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
.f-cta{display:block;width:100%;margin-top:18px;padding:16px;min-height:54px;border:0;border-radius:12px;background:var(--ac);color:#111;font:inherit;font-weight:700;font-size:16px;cursor:pointer;touch-action:manipulation}
.f-cta[disabled]{opacity:.55;cursor:default}
.f-sec{background:var(--s2);color:var(--t1)}
.f-campo{display:grid;gap:6px;margin-bottom:14px}
.f-campo label{font-size:14px;color:var(--t2)}
.f-campo input{font:inherit;font-size:16px;color:var(--t1);background:var(--s1);border:1px solid var(--b);border-radius:10px;padding:14px;min-height:50px;width:100%}
.f-campo input[aria-invalid=true]{border-color:var(--er)}
.f-campo small{color:var(--t3);font-size:12px}
.f-erro-campo{color:var(--er);font-size:13px;min-height:0}
.f-check{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--t2);margin:4px 0 10px}
.f-check input{width:20px;height:20px;margin:0;accent-color:var(--ac);flex:none}
.f-lgpd{font-size:12px;color:var(--t3);margin:8px 0 0}
.f-lgpd a{color:var(--t2)}
.f-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.f-aviso{min-height:20px;margin:14px 0 0;font-size:14px;color:var(--t2)}
.f-erro{color:var(--er)}
.f-dias{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;margin:0 -2px 6px;scroll-snap-type:x mandatory}
.f-dia{flex:none;display:grid;justify-items:center;gap:2px;padding:10px 12px;min-width:68px;scroll-snap-align:start;text-transform:capitalize;font-size:12px;color:var(--t2)}
.f-dia strong{font-size:20px;color:var(--t1)}
.f-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px}
.f-slot{padding:14px 8px;min-height:50px;font-size:16px;font-weight:600}
.f-resumo{margin-top:16px;padding:14px;border:1px solid var(--b);border-radius:12px;background:var(--s1)}
.f-resumo p{margin:0;color:var(--t2)}
.f-skel{height:56px;border-radius:12px;background:var(--s1);margin-bottom:10px}
.f-ok{width:52px;height:52px;border-radius:50%;background:var(--ac);color:#111;display:grid;place-items:center;font-size:28px;font-weight:700;margin-bottom:14px}
.f-dl{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;margin:0 0 18px;padding:14px;border:1px solid var(--b);border-radius:12px;background:var(--s1)}
.f-dl dt{color:var(--t3);font-size:14px}.f-dl dd{margin:0;font-size:15px}
.f-consent{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));max-width:536px;margin:0 auto;background:var(--s2);border:1px solid var(--b);border-radius:12px;padding:12px 14px;font-size:13px;color:var(--t2);z-index:9;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.f-consent p{margin:0 0 8px}.f-consent div{display:flex;gap:10px;justify-content:flex-end}
.f-link{background:none;border:0;color:var(--t2);font:inherit;padding:8px;min-height:40px;cursor:pointer}
.f-mini{background:var(--ac);color:#111;border:0;border-radius:8px;font:inherit;font-weight:700;padding:8px 16px;min-height:40px;cursor:pointer}
.f-in{animation:fin .18s ease-out}
@keyframes fin{from{opacity:.001;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.f-in{animation:none}#f-barra{transition:none}}
@media (min-width:700px){.f-wrap{padding-top:48px}.f-intro h1{font-size:24px}.f-titulo{font-size:22px}}
.f-teste{background:#3b2a07;color:#ffd68a;font-size:12px;text-align:center;padding:6px}
`.replace(/\n/g, "")

export interface DadosPagina {
  slug: string; nome: string; versaoId: string; def: DefinicaoFunil; api: string
  privacidadeUrl: string | null; consentimentoModo: "opt_in" | "informativo"
  pixelId: string | null; eventosMeta: Record<string, boolean>; previa: string | null
}

function documento(titulo: string, corpo: string, extraHead = ""): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
    `<meta name="theme-color" content="#000000"><meta name="robots" content="noindex,nofollow">` +
    `<title>${escHtml(titulo)}</title><link rel="icon" href="/favicon-32.png">` +
    `<style>${CSS}</style>${extraHead}</head><body>${corpo}</body></html>`
}

const TOPO = `<div class="f-top"><img src="/funil/logo-anomalo-96.png" width="32" height="32" alt="ANÔMALO"><span class="f-marca">ANÔMALO</span>` +
  `<button type="button" class="f-voltar" id="f-voltar" hidden>← Voltar</button></div>`

export function paginaFunil(d: DadosPagina): string {
  const t = d.def.textos
  const p = d.def.perguntas[0]
  const total = d.def.perguntas.length + 2
  const cfg = {
    slug: d.slug, nome: d.nome, versaoId: d.versaoId, api: d.api, previa: d.previa,
    privacidadeUrl: d.privacidadeUrl, consentimentoModo: d.consentimentoModo, pixelId: d.pixelId,
    eventosMeta: d.eventosMeta, params: PARAMS_ATRIBUICAO, def: d.def,
  }
  const opcoes = p.opcoes.map(o =>
    `<button type="button" role="radio" aria-checked="false" class="f-opcao" data-o="${escHtml(o.id)}">${escHtml(o.texto)}</button>`).join("")
  const corpo =
    (d.previa ? `<div class="f-teste">Versão de teste — leads e reuniões ficam marcados como TESTE</div>` : "") +
    `<main class="f-wrap">${TOPO}` +
    `<div class="f-prog" role="progressbar" aria-label="Progresso" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="0"><div id="f-barra"></div></div>` +
    `<p class="f-cont" id="f-contador">Etapa 1 de ${total}</p>` +
    `<header class="f-intro"><h1>${escHtml(t.titulo)}</h1><p>${escHtml(t.subtitulo)}</p></header>` +
    `<section id="f-etapa" aria-live="polite"><h2 id="f-q" class="f-titulo">${escHtml(p.texto)}</h2>` +
    `<div class="f-opcoes" role="radiogroup" aria-labelledby="f-q">${opcoes}</div></section>` +
    `<p id="f-aviso" class="f-aviso" role="status"></p>` +
    `<noscript><p class="f-aviso">Ative o JavaScript para responder o formulário.</p></noscript></main>` +
    `<script type="application/json" id="funil-cfg">${jsonSeguro(cfg)}</script>` +
    `<script>${SCRIPT_CLIENTE}</script>`
  return documento(`${d.nome} · ANÔMALO`, corpo)
}

export function paginaIndisponivel(mensagem: string): string {
  return documento("ANÔMALO", `<main class="f-wrap">${TOPO.replace(/<button[^]*<\/button>/, "")}<h1 class="f-titulo" style="margin-top:32px">${escHtml(mensagem)}</h1></main>`)
}
