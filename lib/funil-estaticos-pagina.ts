// HTML da página pública do funil: renderizado no servidor com a 1ª tela pronta
// (apresentação comercial ou 1ª pergunta), CSS e JS inline, sem fontes externas.
// Módulo PURO (sem node:*): também gera a pré-visualização do painel (srcdoc).
// A CSP com o hash do script fica em funil-estaticos-seguranca.ts.
import { SCRIPT_CLIENTE } from "./funil-estaticos-cliente"
import { apresentacaoAtiva, identidadeVisual, PARAMS_ATRIBUICAO, type DefinicaoFunil } from "./funil-estaticos-nucleo"

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}
/** JSON seguro dentro de <script type="application/json">. */
export function jsonSeguro(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")
}

// Tokens: identidade branca é o padrão; .t-escuro reproduz a identidade da v1.
// Amarelo do formulário = #FFC803 (definido pela ANÔMALO para o funil). Texto sobre ele: preto
// (contraste ≈ 13:1). Tamanhos em rem/clamp para respeitar fonte ampliada.
const CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{--bg:#fff;--s1:#fff;--s2:#f5f5f3;--b:#e3e3df;--b2:#c9c9c4;--t1:#141414;--t2:#4f4f55;--t3:#6e6e74;--ac:#FFC803;--ac-s:#fff8d6;--on-ac:#141414;--er:#b3261e;--ok:#141414;color-scheme:light}
.t-escuro{--bg:#000;--s1:#0f0f12;--s2:#17171c;--b:#2a2a31;--b2:#44444d;--t1:#fff;--t2:#c9c9d1;--t3:#9a9aa3;--ac-s:#2a2200;--er:#ff8a80;color-scheme:dark}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--t1);font:400 1.0625rem/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.f-app{display:flex;flex-direction:column;min-height:100vh;min-height:100svh}
.f-prog{height:3px;background:var(--s2);flex:none}
.f-prog.is-oculta{visibility:hidden}
#f-barra{height:100%;background:var(--ac);transform-origin:left;transform:scaleX(0);transition:transform .25s ease}
.f-top{width:100%;max-width:560px;margin:0 auto;padding:max(14px,env(safe-area-inset-top)) max(22px,env(safe-area-inset-right)) 0 max(22px,env(safe-area-inset-left));display:flex;align-items:center;gap:10px;min-height:58px;flex:none}
.f-logo{display:block;width:32px;height:32px;border-radius:8px}
.f-marca{font-weight:700;letter-spacing:.18em;font-size:.75rem;color:var(--t1)}
.f-voltar{margin-left:auto;background:none;border:0;color:var(--t2);font:inherit;font-size:.9375rem;padding:10px 4px;min-height:44px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.f-voltar[hidden]{display:none}
.f-main{flex:1 0 auto;width:100%;max-width:560px;margin:0 auto;padding:20px max(22px,env(safe-area-inset-right)) 24px max(22px,env(safe-area-inset-left));display:flex;flex-direction:column}
.f-main.is-centro{justify-content:center}
.f-passo{margin:0 0 10px;font-size:.8125rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--t3)}
.f-passo:empty{display:none}
.f-ident{margin:0 0 10px;font-size:.875rem;font-weight:600;letter-spacing:.02em;color:var(--t2)}
.f-h1{margin:0 0 22px;font-size:clamp(1.875rem,1.3rem + 2.6vw,2.25rem);line-height:1.12;font-weight:800;letter-spacing:-.02em;color:var(--t1);text-wrap:balance}
.f-benef{list-style:none;margin:0 0 22px;padding:0;display:grid;gap:12px}
.f-benef li{display:flex;gap:12px;align-items:flex-start;font-size:1.0625rem;line-height:1.4;color:var(--t2)}
.f-benef strong{color:var(--t1);font-weight:700}
.f-emoji{flex:none;width:1.5em;text-align:center;font-size:1.125rem;line-height:1.3}
.f-compl{margin:0;font-size:.9375rem;line-height:1.5;color:var(--t3);font-style:italic}
.f-intro h1{font-size:clamp(1.375rem,1.1rem + 1.4vw,1.625rem);line-height:1.2;margin:0 0 8px;font-weight:800;letter-spacing:-.01em}
.f-intro p{margin:0 0 22px;color:var(--t2)}
.f-titulo{font-size:clamp(1.625rem,1.35rem + 1.4vw,1.875rem);line-height:1.18;margin:0 0 22px;font-weight:800;letter-spacing:-.015em;outline:none;text-wrap:balance}
.f-sub{color:var(--t2);margin:-8px 0 22px}
.f-meta{color:var(--t3);font-size:.875rem;margin:0 0 14px}
.f-opcoes{display:grid;gap:10px;counter-reset:f-op}
.f-opcao,.f-slot,.f-dia{font:inherit;color:var(--t1);background:var(--s1);border:1px solid var(--b);border-radius:14px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.f-opcao{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:16px 16px 16px 18px;min-height:60px;font-size:1.0625rem;line-height:1.35;transition:border-color .12s,background-color .12s,box-shadow .12s}
.f-opcao::before{counter-increment:f-op;content:counter(f-op,upper-alpha);flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:var(--ac);color:var(--on-ac);font-weight:700;font-size:.9375rem;line-height:1}
.f-opcao::after{content:"";flex:none;margin-left:auto;width:22px;height:22px;border-radius:50%;border:1.5px solid var(--b2);background:var(--s1)}
.f-opcao[aria-checked=true]::after{border-color:var(--ac);background:var(--ac);box-shadow:inset 0 0 0 4px var(--s1)}
@media (hover:hover){.f-opcao:hover,.f-slot:hover,.f-dia:hover{border-color:var(--b2)}}
.f-opcao[aria-checked=true],.f-slot[aria-checked=true],.f-dia[aria-selected=true]{border-color:var(--ac);background:var(--ac-s);box-shadow:inset 0 0 0 1px var(--ac)}
button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid var(--t1);outline-offset:2px}
.f-cta{display:block;width:100%;margin-top:8px;padding:15px 14px;min-height:56px;border:0;border-radius:14px;background:var(--ac);color:var(--on-ac);font:inherit;font-weight:800;font-size:1rem;letter-spacing:.015em;text-transform:uppercase;line-height:1.3;text-align:center;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.f-cta[disabled]{opacity:.55;cursor:default}
.f-sec{background:var(--s2);color:var(--t1)}
.f-pe{position:sticky;bottom:0;z-index:5;flex:none;background:var(--bg);border-top:1px solid var(--b);padding:12px max(22px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(22px,env(safe-area-inset-left))}
.f-pe[hidden]{display:none}
.f-pe-in{max-width:516px;margin:0 auto}
.f-pe .f-cta{margin-top:0}
.f-legal{margin:10px 0 0;font-size:.8125rem;line-height:1.45;color:var(--t3);text-align:center}
.f-legal a,.f-lgpd a{color:var(--t2);text-decoration:underline;text-underline-offset:2px}
.f-campo{display:grid;gap:6px;margin-bottom:16px}
.f-campo label{font-size:.9375rem;font-weight:600;color:var(--t1)}
.f-campo input{font:inherit;font-size:1.0625rem;color:var(--t1);background:var(--s1);border:1px solid var(--b2);border-radius:12px;padding:14px;min-height:54px;width:100%}
.f-campo input:focus{border-color:var(--t1);outline:none;box-shadow:0 0 0 1px var(--t1)}
.f-campo input[aria-invalid=true]{border-color:var(--er);box-shadow:0 0 0 1px var(--er)}
.f-campo small{color:var(--t3);font-size:.8125rem}
.f-erro-campo{color:var(--er);font-size:.875rem;font-weight:600}
.f-erro-campo:empty{display:none}
.f-check{display:flex;gap:10px;align-items:flex-start;font-size:.875rem;color:var(--t2);margin:2px 0 12px}
.f-check input{width:20px;height:20px;margin:1px 0 0;accent-color:var(--ac);flex:none}
.f-lgpd{font-size:.8125rem;line-height:1.45;color:var(--t3);margin:4px 0 14px}
.f-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.f-aviso{margin:14px 0 0;font-size:.9375rem;color:var(--t2)}
.f-aviso:empty{display:none}
.f-erro{color:var(--er);font-weight:600}
.f-dias{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 12px;margin:0 -2px 8px;scroll-snap-type:x mandatory;scrollbar-width:none}
.f-dias::-webkit-scrollbar{display:none}
.f-dia{flex:none;display:grid;justify-items:center;gap:2px;padding:10px 12px;min-width:70px;min-height:76px;scroll-snap-align:start;text-transform:capitalize;font-size:.8125rem;color:var(--t2)}
.f-dia strong{font-size:1.375rem;line-height:1.1;color:var(--t1)}
.f-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.f-slot{padding:12px 8px;min-height:52px;font-size:1.0625rem;font-weight:700}
.f-resumo{margin:0 0 10px;font-size:.9375rem;color:var(--t2);text-align:center}
.f-resumo strong{color:var(--t1)}
.f-skel{height:60px;border-radius:14px;background:var(--s2);margin-bottom:10px}
.f-ok{width:56px;height:56px;border-radius:50%;background:var(--ac);color:var(--on-ac);display:grid;place-items:center;margin-bottom:18px}
.f-ok svg{width:28px;height:28px}
.f-dl{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;margin:0 0 18px;padding:16px 0;border-top:1px solid var(--b);border-bottom:1px solid var(--b)}
.f-dl dt{color:var(--t3);font-size:.9375rem}.f-dl dd{margin:0;font-size:.9375rem;font-weight:600}
.f-nota{margin:0;font-size:.875rem;color:var(--t3)}
.f-consent{margin:0 0 10px;padding:6px 6px 6px 12px;border-radius:12px;background:var(--s2);font-size:.8125rem;line-height:1.35;color:var(--t2);display:flex;gap:4px 8px;align-items:center}
.f-consent[hidden]{display:none}
.f-consent p{margin:0;flex:1 1 auto}
.f-consent span{display:flex;gap:4px;flex:none}
.f-link{background:none;border:0;color:var(--t1);font:inherit;font-weight:600;padding:8px;min-height:44px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.f-mini{background:var(--t1);color:var(--bg);border:0;border-radius:10px;font:inherit;font-weight:700;padding:8px 12px;min-height:44px;cursor:pointer}
.f-in{animation:fin .16s ease-out}
@keyframes fin{from{opacity:.001}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.f-in{animation:none}#f-barra{transition:none}}
@media (min-width:700px){.f-main{padding-top:40px}.f-main.is-centro{padding-top:24px}}
@media (max-height:640px){.f-pe{position:static;border-top:0}.f-main.is-centro{justify-content:flex-start}}
.f-teste{background:#fff4d6;color:#5c4200;font-size:.8125rem;text-align:center;padding:6px 12px;border-bottom:1px solid #f0dca5}
.t-escuro .f-teste{background:#3b2a07;color:#ffd68a;border-color:#3b2a07}
`.replace(/\n/g, "")

export interface DadosPagina {
  slug: string; nome: string; versaoId: string; def: DefinicaoFunil; api: string
  privacidadeUrl: string | null; consentimentoModo: "opt_in" | "informativo"
  pixelId: string | null; eventosMeta: Record<string, boolean>; previa: string | null
  /** Pré-visualização do painel: sem rede, sem armazenamento, sem Pixel. */
  demo?: boolean
}

function documento(titulo: string, corpo: string, escuro: boolean): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
    `<meta name="theme-color" content="${escuro ? "#000000" : "#ffffff"}"><meta name="robots" content="noindex,nofollow">` +
    `<title>${escHtml(titulo)}</title><link rel="icon" href="/favicon-32.png">` +
    `<style>${CSS}</style></head><body class="${escuro ? "t-escuro" : "t-claro"}">${corpo}</body></html>`
}

function topo(escuro: boolean, voltar = true): string {
  // A logo oficial só existe em branco: na identidade clara ela vai sobre o
  // quadrado preto oficial (mesma arte do ícone do app), sem redesenho.
  const logo = escuro ? "/funil/logo-anomalo-96.png" : "/funil/logo-anomalo-escuro-96.png"
  return `<header class="f-top"><img class="f-logo" src="${logo}" width="32" height="32" alt="ANÔMALO">` +
    `<span class="f-marca" aria-hidden="true">ANÔMALO</span>` +
    (voltar ? `<button type="button" class="f-voltar" id="f-voltar" hidden>← Voltar</button>` : "") + `</header>`
}

const SETA = `<span aria-hidden="true">→</span>`

/** Corpo da Etapa 00 (também reaproveitado pelo script ao voltar da 1ª pergunta). */
function apresentacaoHtml(def: DefinicaoFunil): string {
  const a = def.apresentacao!
  return (a.identificacao ? `<p class="f-ident">${escHtml(a.identificacao)}</p>` : "") +
    `<h1 class="f-h1" id="f-q" tabindex="-1">${escHtml(a.headline)}</h1>` +
    (a.beneficios.length ? `<ul class="f-benef">${a.beneficios.map(b =>
      `<li>${b.emoji ? `<span class="f-emoji" aria-hidden="true">${escHtml(b.emoji)}</span>` : ""}` +
      `<span><strong>${escHtml(b.destaque)}</strong>${b.texto ? ` ${escHtml(b.texto)}` : ""}</span></li>`).join("")}</ul>` : "") +
    (a.complemento ? `<p class="f-compl">${escHtml(a.complemento)}</p>` : "")
}

function legalHtml(texto: string | undefined, privacidadeUrl: string | null): string {
  const partes: string[] = []
  if (texto) partes.push(escHtml(texto))
  if (privacidadeUrl) partes.push(`<a href="${escHtml(privacidadeUrl)}" target="_blank" rel="noopener">Política de privacidade</a>`)
  return partes.length ? `<p class="f-legal">${partes.join(" ")}</p>` : ""
}

export function paginaFunil(d: DadosPagina): string {
  const def = d.def
  const escuro = identidadeVisual(def) === "escuro"
  const comApresentacao = apresentacaoAtiva(def)
  const t = def.textos
  const p = def.perguntas[0]
  const n = def.perguntas.length
  const cfg = {
    slug: d.slug, nome: d.nome, versaoId: d.versaoId, api: d.api, previa: d.previa, demo: d.demo === true,
    privacidadeUrl: d.privacidadeUrl, consentimentoModo: d.consentimentoModo, pixelId: d.demo ? null : d.pixelId,
    eventosMeta: d.eventosMeta, params: PARAMS_ATRIBUICAO, def,
  }
  // Aviso de cookies renderizado no servidor (dentro do rodapé) para não
  // deslocar o layout depois; o script o remove se a escolha já foi feita.
  const consent = cfg.pixelId && d.consentimentoModo === "opt_in"
    ? `<div class="f-consent" id="f-consent" role="region" aria-label="Preferências de privacidade"><p>Cookies da Meta para medir anúncios (opcional).</p>` +
      `<span><button type="button" class="f-link" data-consent="0">Recusar</button><button type="button" class="f-mini" data-consent="1">Aceitar</button></span></div>`
    : ""

  let etapa: string
  let pe = ""
  if (comApresentacao) {
    etapa = apresentacaoHtml(def)
    pe = `<div id="f-pe-acoes"><button type="button" class="f-cta" id="f-cta-inicio">${escHtml(def.apresentacao!.cta)} ${SETA}</button>` +
      legalHtml(def.apresentacao!.rodape, d.privacidadeUrl) + `</div>`
  } else {
    const opcoes = p.opcoes.map(o =>
      `<button type="button" role="radio" aria-checked="false" class="f-opcao" data-o="${escHtml(o.id)}">${escHtml(o.texto)}</button>`).join("")
    etapa = `<header class="f-intro"><h1>${escHtml(t.titulo)}</h1><p>${escHtml(t.subtitulo)}</p></header>` +
      `<h2 id="f-q" class="f-titulo">${escHtml(p.texto)}</h2>` +
      `<div class="f-opcoes" role="radiogroup" aria-labelledby="f-q">${opcoes}</div>`
    pe = `<div id="f-pe-acoes"></div>`
  }
  const total = n + 2
  const corpo =
    (d.demo ? `<div class="f-teste">Pré-visualização do editor — nada é enviado nem salvo</div>`
      : d.previa ? `<div class="f-teste">Versão de teste — registros marcados como TESTE; nenhum horário real é reservado</div>` : "") +
    `<div class="f-app">` +
    `<div class="f-prog${comApresentacao ? " is-oculta" : ""}" id="f-prog" role="progressbar" aria-label="Progresso" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="0"><div id="f-barra"></div></div>` +
    topo(escuro) +
    `<main class="f-main${comApresentacao ? " is-centro" : ""}" id="f-main">` +
    `<p class="f-passo" id="f-passo">${comApresentacao ? "" : `Pergunta 1 de ${n}`}</p>` +
    `<section id="f-etapa" aria-live="polite">${etapa}</section>` +
    `<p id="f-aviso" class="f-aviso" role="status"></p>` +
    `<noscript><p class="f-aviso">Ative o JavaScript para responder o formulário.</p></noscript></main>` +
    `<footer class="f-pe" id="f-pe"${!comApresentacao && !consent ? " hidden" : ""}><div class="f-pe-in">${consent}${pe}</div></footer>` +
    `</div>` +
    `<script type="application/json" id="funil-cfg">${jsonSeguro(cfg)}</script>` +
    `<script>${SCRIPT_CLIENTE}</script>`
  return documento(`${d.nome} · ANÔMALO`, corpo, escuro)
}

export function paginaIndisponivel(mensagem: string, escuro = false): string {
  return documento("ANÔMALO", `<div class="f-app">${topo(escuro, false)}<main class="f-main is-centro"><h1 class="f-titulo">${escHtml(mensagem)}</h1></main></div>`, escuro)
}
