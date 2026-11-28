// =============================================================================
// Script do navegador do Funil Estáticos Meta (JS puro, ~15 KB, inline).
//
// Por que não React: a página precisa abrir no navegador interno do
// Instagram/Facebook em 3G com a 1ª tela já pintada pelo HTML do servidor.
// Sem framework, sem CSS global, sem fontes externas. O Pixel da Meta só é
// carregado depois da página interativa e nunca bloqueia o formulário.
//
// Regras deste arquivo: sem template literals e sem dependências; a config
// chega por <script type="application/json" id="funil-cfg">. Nada de PII vai
// para localStorage, URL, analytics ou parâmetros personalizados do Pixel.
//
// Etapas (st.i): -1 apresentação (só se ativa) · 0..N-1 perguntas · N contato
// · N+1 agenda · N+2 confirmação. A 1ª tela já vem no HTML do servidor.
// CFG.demo = pré-visualização do painel: sem rede, sem armazenamento, sem Pixel.
// =============================================================================

const FONTE = String.raw`(function () {
"use strict";
var CFG = JSON.parse(document.getElementById("funil-cfg").textContent);
var D = CFG.def, P = D.perguntas, T = D.textos, N = P.length, TOTAL = N + 2;
var AP = !!(D.apresentacao && D.apresentacao.ativo), INI = AP ? -1 : 0, DEMO = !!CFG.demo;
var $ = function (id) { return document.getElementById(id); };
var root = $("f-etapa"), barra = $("f-barra"), prog = $("f-prog"), passo = $("f-passo"), voltar = $("f-voltar"), aviso = $("f-aviso");
var main = $("f-main"), pe = $("f-pe"), peAcoes = $("f-pe-acoes"), consentBox = $("f-consent");
var KEY = "funil:" + CFG.slug + ":" + CFG.versaoId + (CFG.previa ? ":teste" : "");
var st = { i: INI, respostas: {}, sid: null, sk: null, lead: null, reuniao: null, slot: null, chave: null, dias: null, dia: null, mes: null, enviando: false, simulada: false };
var fila = [], pronto = false, timer = null;
// Etapa 00 vem pronta no HTML; guardamos a marcação para reexibir ao voltar.
var apresentacaoHtml = AP ? root.innerHTML : "", apresentacaoPe = AP && peAcoes ? peAcoes.innerHTML : "";

function ler(k) { if (DEMO) return null; try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
function gravar(k, v) { if (DEMO) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function salvar() { gravar(KEY, { sid: st.sid, sk: st.sk, i: st.i, respostas: st.respostas, ts: Date.now() }); }
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = []; for (var i = 0; i < 16; i++) h.push((b[i] + 256).toString(16).slice(1));
  return h.slice(0, 4).join("") + "-" + h.slice(4, 6).join("") + "-" + h.slice(6, 8).join("") + "-" + h.slice(8, 10).join("") + "-" + h.slice(10).join("");
}
function el(tag, attrs, filhos) {
  var e = document.createElement(tag);
  for (var k in attrs || {}) { if (attrs[k] == null) continue; if (k === "text") e.textContent = attrs[k]; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
  (filhos || []).forEach(function (f) { if (f) e.appendChild(f); });
  return e;
}
function cta(texto, attrs) {
  var b = el("button", attrs); b.className = "f-cta" + (attrs && attrs["class"] ? " " + attrs["class"] : "");
  b.appendChild(document.createTextNode(texto + " ")); b.appendChild(el("span", { "aria-hidden": "true", text: "→" }));
  return b;
}
function rotular(b, texto) { b.firstChild.nodeValue = texto + " "; }
// document.cookie lança exceção em iframe isolado (prévia) e com cookies bloqueados.
function cookie(n) { try { var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; } }

// ---------------------------------------------------------------- rede
function apiDemo(corpo) {
  var r = { _status: 200, ok: true }, a = corpo.acao;
  if (a === "sessao") { r.sessaoId = "demo"; r.segredo = "demo"; r.respostas = {}; }
  else if (a === "agenda") {
    var dias = [];
    for (var d = 1; d <= 6; d++) {
      var data = new Date(Date.now() + d * 864e5).toISOString().slice(0, 10), slots = [];
      if (d !== 3) ["12:00", "13:00", "17:00", "19:00"].forEach(function (h) {
        var ini = data + "T" + h + ":00.000Z";
        slots.push({ start: ini, end: new Date(Date.parse(ini) + 36e5).toISOString(), label: String(Number(h.slice(0, 2)) - 3).padStart(2, "0") + ":00" });
      });
      dias.push({ date: data, slots: slots });
    }
    r.days = dias; r.durationMinutes = 60; r.tipoNome = "Exemplo de reunião";
  } else if (a === "reservar") { r._status = 201; r.bookingId = "demo"; r.status = "simulated"; r.startsAt = corpo.start; r.endsAt = new Date(Date.parse(corpo.start) + 36e5).toISOString(); }
  return new Promise(function (ok) { setTimeout(function () { ok(r); }, 200); });
}
function api(corpo, tentativas) {
  if (DEMO) return apiDemo(corpo);
  corpo.slug = CFG.slug; if (CFG.previa) corpo.previa = CFG.previa;
  if (st.sid) { corpo.sessaoId = st.sid; corpo.segredo = st.sk; }
  tentativas = tentativas == null ? 2 : tentativas;
  var ctl = window.AbortController ? new AbortController() : null;
  var t = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;
  return fetch(CFG.api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo), credentials: "same-origin", signal: ctl ? ctl.signal : undefined })
    .then(function (r) { if (t) clearTimeout(t); return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); })
    .catch(function (e) {
      if (t) clearTimeout(t);
      if (tentativas > 0) return new Promise(function (ok) { setTimeout(ok, 900); }).then(function () { return api(corpo, tentativas - 1); });
      return { _status: 0, code: "NETWORK" };
    });
}
function evento(nome, extra) {
  if (DEMO) return;
  var e = { eid: uuid(), evento: nome }; for (var k in extra || {}) e[k] = extra[k];
  fila.push(e); clearTimeout(timer); timer = setTimeout(enviarFila, 1200);
}
function enviarFila(beacon) {
  if (!pronto || !fila.length) return;
  var lote = fila.splice(0, 30), corpo = { acao: "eventos", eventos: lote, slug: CFG.slug, sessaoId: st.sid, segredo: st.sk };
  if (CFG.previa) corpo.previa = CFG.previa;
  if (beacon && navigator.sendBeacon) { navigator.sendBeacon(CFG.api, new Blob([JSON.stringify(corpo)], { type: "text/plain" })); return; }
  api(corpo, 1).then(function (r) { if (r._status !== 200) fila = lote.concat(fila).slice(0, 60); });
}
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") enviarFila(true); });

// ---------------------------------------------------------------- pixel (não bloqueante, respeita a escolha)
var consent = ler("funil:consent");
var pixelOk = false;
function podeMedir() { return CFG.pixelId && (CFG.consentimentoModo === "informativo" || consent === true); }
function carregarPixel() {
  if (pixelOk || !podeMedir()) return; pixelOk = true;
  !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  window.fbq("init", CFG.pixelId);
  if (CFG.eventosMeta.PageView) window.fbq("track", "PageView");
}
function pixel(nome, eventId) {
  if (!pixelOk || !window.fbq || !CFG.eventosMeta[nome]) return;
  window.fbq("track", nome, { content_name: CFG.nome }, { eventID: eventId });
}
function decidirConsent(v) {
  consent = v; gravar("funil:consent", v);
  if (consentBox) { consentBox.remove(); consentBox = null; }
  evento("question_viewed", { etapa: etapaAtual(), consentimento: v });
  if (v) carregarPixel();
  atualizarPe();
}
if (consentBox) {
  // Já decidiu antes: some antes da 1ª pintura (sem deslocar o layout depois).
  if (consent !== null) { consentBox.remove(); consentBox = null; }
  else consentBox.querySelectorAll("[data-consent]").forEach(function (b) { b.addEventListener("click", function () { decidirConsent(b.getAttribute("data-consent") === "1"); }); });
}

// ---------------------------------------------------------------- render
function etapaAtual() { return st.i < 0 ? "apresentacao" : st.i < N ? P[st.i].id : st.i === N ? "contato" : st.i === N + 1 ? "agenda" : "confirmacao"; }
function progresso() {
  var concluido = st.i >= TOTAL;
  prog.classList.toggle("is-oculta", st.i < 0);
  // A barra só chega a 100% na confirmação real.
  barra.style.transform = "scaleX(" + (st.i < 0 ? 0 : concluido ? 1 : (st.i + 1) / (TOTAL + 1)) + ")";
  prog.setAttribute("aria-valuenow", String(st.i < 0 ? 0 : Math.min(st.i + 1, TOTAL)));
  passo.textContent = st.i < 0 || concluido ? "" : st.i < N ? "Pergunta " + (st.i + 1) + " de " + N : st.i === N ? "Seus dados" : "Agendamento";
  voltar.hidden = !(st.i > INI && st.i <= N && !st.reuniao);
  main.classList.toggle("is-centro", st.i < 0 || concluido);
}
// Rodapé fixo: só com ação (CTA da apresentação, Continuar, confirmar horário) ou aviso de cookies.
function rodape(filhos) {
  if (!peAcoes) return;
  peAcoes.innerHTML = ""; (filhos || []).forEach(function (f) { if (f) peAcoes.appendChild(f); });
  atualizarPe();
}
// Na etapa de contato o rodapé some: com o teclado aberto ele cobriria os campos.
function atualizarPe() { if (pe) pe.hidden = st.i === N || !(consentBox || (peAcoes && peAcoes.childNodes.length)); }
function trocar(filhos, foco, acoes) {
  root.innerHTML = ""; filhos.forEach(function (f) { if (f) root.appendChild(f); });
  root.classList.remove("f-in"); void root.offsetWidth; root.classList.add("f-in");
  rodape(acoes); progresso(); avisar("");
  var h = root.querySelector("h1,h2"); if (foco !== false && h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}
function avisar(msg, erro) { aviso.textContent = msg || ""; aviso.className = erro ? "f-aviso f-erro" : "f-aviso"; }

// ---------------------------------------------------------------- etapa 00
function ligarApresentacao() {
  var b = $("f-cta-inicio"); if (!b) return;
  b.addEventListener("click", function () {
    if (st.enviando) return;
    evento("welcome_cta_clicked", { etapa: "apresentacao" });
    st.i = 0; salvar(); pergunta();
  });
}
function apresentacao(foco) {
  root.innerHTML = apresentacaoHtml; if (peAcoes) peAcoes.innerHTML = apresentacaoPe;
  atualizarPe(); progresso(); avisar(""); ligarApresentacao();
  var h = root.querySelector("h1"); if (foco !== false && h) h.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  evento("welcome_viewed", { etapa: "apresentacao" });
}

// ---------------------------------------------------------------- perguntas
function pergunta(foco) {
  var p = P[st.i];
  var lista = el("div", { "class": "f-opcoes", role: "radiogroup", "aria-labelledby": "f-q" });
  p.opcoes.forEach(function (o) {
    var marcado = st.respostas[p.id] === o.id;
    lista.appendChild(el("button", { type: "button", role: "radio", "aria-checked": marcado ? "true" : "false", "class": "f-opcao", "data-o": o.id, text: o.texto,
      onclick: function () { escolher(p, o.id, this); } }));
  });
  var filhos = [el("h2", { id: "f-q", "class": "f-titulo", text: p.texto }), lista];
  var acoes = [];
  if (!D.avanco_automatico || st.respostas[p.id]) acoes.push(cta("Continuar", { type: "button", id: "f-continuar", disabled: st.respostas[p.id] ? null : "", onclick: avancar }));
  trocar(filhos, foco, acoes);
  evento("question_viewed", { etapa: p.id });
}
function escolher(p, oid, botao) {
  if (st.enviando || P[st.i] !== p) return;
  var primeira = !Object.keys(st.respostas).length;
  st.respostas[p.id] = oid; salvar();
  root.querySelectorAll(".f-opcao").forEach(function (b) { b.setAttribute("aria-checked", b === botao ? "true" : "false"); });
  // Entrada efetiva nas perguntas = 1ª resposta (o servidor grava uma única vez).
  if (primeira) evento("funnel_started", { etapa: p.id });
  evento("question_answered", { etapa: p.id, opcao: oid });
  if (D.avanco_automatico) { st.enviando = true; setTimeout(function () { st.enviando = false; avancar(); }, 220); }
  else { var c = $("f-continuar"); if (c) c.removeAttribute("disabled"); }
}
function avancar() {
  if (st.i < 0 || st.i >= N) return;
  var p = P[st.i]; if (!st.respostas[p.id]) return;
  evento("question_completed", { etapa: p.id });
  st.i++; salvar(); mostrar();
}
voltar.addEventListener("click", function () {
  if (st.enviando || st.i <= INI || st.i > N) return;
  evento("question_back", { etapa: etapaAtual() }); st.i--; salvar(); mostrar();
});

// ---------------------------------------------------------------- contato
function mascara(v) {
  var d = v.replace(/\D/g, ""); if (d.slice(0, 2) === "55" && d.length > 11) d = d.slice(2); d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? "(" + d : "";
  if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
}
function campo(id, rotulo, attrs, dica) {
  var i = el("input", attrs); i.id = id; i.name = id;
  return el("div", { "class": "f-campo" }, [el("label", { "for": id, text: rotulo }), i, dica ? el("small", { text: dica }) : null, el("span", { "class": "f-erro-campo", id: id + "-erro", "aria-live": "polite" })]);
}
function contato() {
  var c = D.contato, filhos = [el("h2", { "class": "f-titulo", text: T.contato_titulo })];
  filhos.push(el("p", { "class": "f-sub", text: T.contato_subtitulo || "Informe seus dados para visualizar os horários disponíveis." }));
  filhos.push(campo("nome", "Nome", { type: "text", autocomplete: "name", maxlength: "120", required: "", autocapitalize: "words", enterkeyhint: "next" }));
  filhos.push(campo("whatsapp", "WhatsApp com DDD", { type: "tel", inputmode: "tel", autocomplete: "tel-national", placeholder: "(45) 99999-9999", maxlength: "16", required: "", enterkeyhint: c.email === "oculto" && c.instagram === "oculto" ? "go" : "next" }));
  if (c.email !== "oculto") filhos.push(campo("email", "E-mail" + (c.email === "opcional" ? " (opcional)" : ""), { type: "email", autocomplete: "email", inputmode: "email", maxlength: "160" }));
  if (c.instagram !== "oculto") filhos.push(campo("instagram", "Instagram profissional (opcional)", { type: "text", autocomplete: "off", autocapitalize: "none", maxlength: "60", placeholder: "@seuperfil" }));
  filhos.push(el("div", { "class": "f-hp", "aria-hidden": "true" }, [el("input", { type: "text", id: "website", name: "website", tabindex: "-1", autocomplete: "off" })]));
  if (CFG.pixelId && CFG.consentimentoModo === "opt_in") {
    var chk = el("input", { type: "checkbox", id: "mkt" }); if (consent === true) chk.checked = true;
    filhos.push(el("label", { "class": "f-check", "for": "mkt" }, [chk, el("span", { text: "Aceito cookies de medição de anúncios da Meta (opcional — não afeta o agendamento)." })]));
  }
  var lgpd = el("p", { "class": "f-lgpd" }, [document.createTextNode("Usaremos seus dados apenas para entrar em contato sobre este atendimento. ")]);
  if (CFG.privacidadeUrl) lgpd.appendChild(el("a", { href: CFG.privacidadeUrl, target: "_blank", rel: "noopener", text: "Política de privacidade" }));
  filhos.push(lgpd);
  // CTA dentro do formulário (não fixo): com o teclado aberto nada fica coberto.
  var btn = cta(T.contato_cta, { type: "submit" });
  filhos.push(btn);
  var form = el("form", { novalidate: "", onsubmit: function (ev) { ev.preventDefault(); enviarContato(form, btn); } }, filhos);
  trocar([form]);
  form.addEventListener("input", function (ev) { if (ev.target && ev.target.id) erroCampo(ev.target.id); });
  var w = $("whatsapp"); w.addEventListener("input", function () { var p = w.selectionStart === w.value.length; w.value = mascara(w.value); if (p) w.setSelectionRange(w.value.length, w.value.length); });
  evento("contact_form_viewed", { etapa: "contato" });
}
function erroCampo(id, msg) { var e = $(id + "-erro"); if (e) e.textContent = msg || ""; var i = $(id); if (i) i.setAttribute("aria-invalid", msg ? "true" : "false"); }
function enviarContato(form, btn) {
  if (st.enviando) return;
  var nome = $("nome").value.trim(), tel = $("whatsapp").value.replace(/\D/g, ""), ok = true;
  erroCampo("nome"); erroCampo("whatsapp"); erroCampo("email");
  if (nome.length < 2 || !/[A-Za-zÀ-ÿ]/.test(nome)) { erroCampo("nome", "Informe seu nome."); ok = false; }
  if (!/^[1-9][0-9](9[0-9]{8}|[2-9][0-9]{7})$/.test(tel)) { erroCampo("whatsapp", "Informe um WhatsApp válido com DDD."); ok = false; }
  var em = $("email") ? $("email").value.trim() : "";
  if (D.contato.email === "obrigatorio" && !em) { erroCampo("email", "Informe seu e-mail."); ok = false; }
  if (em && !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(em)) { erroCampo("email", "E-mail inválido."); ok = false; }
  if (!ok) { var inv = form.querySelector("[aria-invalid=true]"); if (inv) inv.focus(); return; }
  var mkt = $("mkt"); if (mkt && (mkt.checked || consent !== null)) decidirConsent(mkt.checked);
  st.enviando = true; btn.disabled = true; rotular(btn, "Salvando…"); enviarFila();
  esperarSessao().then(function () {
    return api({ acao: "contato", nome: nome, whatsapp: tel, email: em || null, instagram: $("instagram") ? $("instagram").value.trim() || null : null,
      respostas: st.respostas, consentimento: CFG.pixelId ? consent : null, website: $("website").value, fbp: cookie("_fbp"), fbc: cookie("_fbc"), url: location.href.split("#")[0] }, 3);
  }).then(function (r) {
    st.enviando = false; btn.disabled = false; rotular(btn, T.contato_cta);
    if (r._status === 200 && r.ok) {
      st.lead = { primeiroNome: nome.split(" ")[0] };
      if (r.enviarPixel) pixel("Lead", r.eventId);
      evento("contact_submitted", { etapa: "contato" });
      st.i = N + 1; salvar(); mostrar();
      despachar();
    } else if (r.code === "INVALID_INPUT") { avisar(r.message || "Confira os dados informados.", true); }
    else if (r.code === "RATE_LIMITED") { avisar("Muitas tentativas. Aguarde alguns minutos e tente de novo.", true); }
    else if (r.code === "ANSWERS_REQUIRED") { st.i = 0; salvar(); mostrar(); avisar("Responda as perguntas para continuar.", true); }
    else { avisar("Não conseguimos salvar agora. Verifique sua conexão e toque novamente — suas respostas foram mantidas.", true); evento("client_error", { codigo: r.code || "HTTP" }); }
  });
}

// ---------------------------------------------------------------- agenda
function fmtData(iso, opts) { return new Date(iso).toLocaleDateString("pt-BR", Object.assign({ timeZone: "America/Sao_Paulo" }, opts)); }
function fmtHora(iso) { return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
function maiuscula(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
var TEXTO_CONFIRMAR = T.agenda_cta || "Confirmar agendamento";
function agenda(recarregar) {
  var cab = [el("h2", { "class": "f-titulo", text: T.agenda_titulo }), el("p", { "class": "f-sub", text: T.agenda_subtitulo })];
  var corpo = el("div", { "class": "f-agenda", "aria-busy": "true" }, [el("div", { "class": "f-skel" }), el("div", { "class": "f-skel" }), el("div", { "class": "f-skel" })]);
  trocar(cab.concat([corpo]), !recarregar);
  if (!recarregar) evento("booking_page_viewed", { etapa: "agenda" });
  esperarSessao().then(function () { return api({ acao: "agenda" }, 2); }).then(function (r) {
    corpo.setAttribute("aria-busy", "false"); corpo.innerHTML = "";
    if (r._status !== 200 || !r.days) {
      corpo.appendChild(el("p", { "class": "f-sub", text: r.code === "CONFIG_UNAVAILABLE" ? T.sem_horarios : "Não conseguimos carregar os horários agora." }));
      if (r.code !== "CONFIG_UNAVAILABLE") corpo.appendChild(el("button", { type: "button", "class": "f-cta f-sec", text: "Tentar novamente", onclick: function () { agenda(true); } }));
      else evento("booking_no_slots", { etapa: "agenda" });
      return;
    }
    st.dias = r.days.filter(function (d) { return d.slots.length; });
    st.info = r;
    if (!st.dias.length) { corpo.appendChild(el("p", { "class": "f-sub", text: T.sem_horarios })); evento("booking_no_slots", { etapa: "agenda" }); return; }
    if (!st.dia || !st.dias.some(function (d) { return d.date === st.dia; })) st.dia = st.dias[0].date;
    desenharAgenda(corpo);
  });
}
// Calendário mensal (datas com horário em destaque) + horários do dia escolhido.
// Datas "AAAA-MM-DD" já vêm no fuso de Brasília; a grade é montada em UTC puro.
var MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
var SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
var ICONE_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>';
function hojeBrasilia() { return new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10); }
function icone(svg) { var s = el("span", { "class": "f-ico", "aria-hidden": "true" }); s.innerHTML = svg; return s; }
function desenharAgenda(corpo) {
  corpo.innerHTML = "";
  var r = st.info, livres = {};
  st.dias.forEach(function (d) { livres[d.date] = true; });
  var primeiroMes = st.dias[0].date.slice(0, 7), ultimoMes = st.dias[st.dias.length - 1].date.slice(0, 7);
  if (!st.mes || st.mes < primeiroMes || st.mes > ultimoMes) st.mes = (st.dia || st.dias[0].date).slice(0, 7);
  var ano = Number(st.mes.slice(0, 4)), mes = Number(st.mes.slice(5, 7)) - 1;
  function irMes(delta) { var d = new Date(Date.UTC(ano, mes + delta, 1)); st.mes = d.toISOString().slice(0, 7); desenharAgenda(corpo); }

  corpo.appendChild(el("div", { "class": "f-tipo" }, [icone(ICONE_CAL), el("div", {}, [
    el("strong", { text: r.tipoNome || "Reunião" }), el("span", { text: r.durationMinutes + " minutos · Horário de Brasília" })])]));
  corpo.appendChild(el("p", { "class": "f-rot", text: "Selecione uma data" }));

  var cal = el("div", { "class": "f-cal" });
  cal.appendChild(el("div", { "class": "f-cal-topo" }, [
    el("button", { type: "button", "class": "f-cal-nav", "aria-label": "Mês anterior", text: "‹", disabled: st.mes <= primeiroMes ? "" : null, onclick: function () { irMes(-1); } }),
    el("strong", { "aria-live": "polite", text: MESES[mes] + " " + ano }),
    el("button", { type: "button", "class": "f-cal-nav", "aria-label": "Próximo mês", text: "›", disabled: st.mes >= ultimoMes ? "" : null, onclick: function () { irMes(1); } })]));
  var grade = el("div", { "class": "f-cal-grade", role: "group", "aria-label": "Datas de " + MESES[mes] });
  SEMANA.forEach(function (w) { grade.appendChild(el("span", { "class": "f-cal-sem", "aria-hidden": "true", text: w })); });
  var inicio = new Date(Date.UTC(ano, mes, 1)).getUTCDay(), total = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate(), hoje = hojeBrasilia();
  for (var v = 0; v < inicio; v++) grade.appendChild(el("span", {}));
  for (var n = 1; n <= total; n++) (function (n) {
    var data = st.mes + "-" + (n < 10 ? "0" : "") + n, livre = !!livres[data], sel = data === st.dia;
    var rot = maiuscula(fmtData(data + "T12:00:00Z", { weekday: "long", day: "numeric", month: "long" })) + (livre ? "" : " — sem horários");
    grade.appendChild(el("button", { type: "button", "class": "f-cal-dia" + (data === hoje ? " is-hoje" : ""), "aria-label": rot,
      "aria-pressed": livre ? (sel ? "true" : "false") : null, disabled: livre ? null : "", text: String(n),
      onclick: function () { if (st.enviando) return; st.dia = data; st.slot = null; desenharAgenda(corpo); var h = $("f-horas"); if (h) h.scrollIntoView({ behavior: "smooth", block: "nearest" }); } }));
  })(n);
  cal.appendChild(grade);
  corpo.appendChild(cal);

  var dia = st.dias.filter(function (d) { return d.date === st.dia; })[0];
  if (dia) {
    corpo.appendChild(el("h3", { "class": "f-dia-tit", id: "f-horas" }, [icone(ICONE_CAL), document.createTextNode(maiuscula(fmtData(dia.date + "T12:00:00Z", { weekday: "long", day: "numeric", month: "long" })))]));
    var horas = el("div", { "class": "f-slots", role: "radiogroup", "aria-label": "Horários disponíveis" });
    dia.slots.forEach(function (s) {
      var sel = st.slot && st.slot.start === s.start;
      horas.appendChild(el("button", { type: "button", role: "radio", "aria-checked": sel ? "true" : "false", "class": "f-slot", text: s.label,
        onclick: function () { if (st.enviando) return; st.slot = s; st.chave = uuid(); evento("booking_slot_selected", { etapa: "agenda" }); desenharAgenda(corpo); var c = $("f-confirmar"); if (c) c.focus({ preventScroll: true }); } }));
    });
    corpo.appendChild(horas);
  }
  if (st.slot) {
    var txt = maiuscula(fmtData(st.slot.start, { weekday: "long", day: "2-digit", month: "long" }));
    var b = cta(TEXTO_CONFIRMAR, { type: "button", id: "f-confirmar", onclick: function () { confirmar(b); } });
    rodape([el("p", { "class": "f-resumo" }, [document.createTextNode(txt + " às "), el("strong", { text: st.slot.label })]), b]);
  } else rodape([]);
}
function confirmar(b) {
  if (st.enviando || !st.slot) return;
  st.enviando = true; b.disabled = true; rotular(b, "Reservando…");
  api({ acao: "reservar", start: st.slot.start, idempotencyKey: st.chave, url: location.href.split("#")[0] }, 3).then(function (r) {
    st.enviando = false;
    if ((r._status === 201 || r._status === 200) && r.bookingId) {
      st.reuniao = { inicio: r.startsAt, fim: r.endsAt }; st.simulada = r.status === "simulated"; st.i = N + 2; salvar();
      // Schedule no navegador: no máximo uma vez por reserva, mesmo recarregando.
      var marca = "funil:sched:" + r.bookingId;
      if (r.enviarPixel && !ler(marca)) { pixel("Schedule", r.eventId); gravar(marca, 1); }
      mostrar(); despachar(); return;
    }
    b.disabled = false; rotular(b, TEXTO_CONFIRMAR);
    evento("booking_failed", { etapa: "agenda", codigo: r.code || "HTTP" });
    if (r.code === "SLOT_UNAVAILABLE") { st.slot = null; agenda(true); setTimeout(function () { avisar("Esse horário acabou de ser reservado. Escolha outro, por favor.", true); }, 50); }
    else if (r.code === "RATE_LIMITED") avisar("Muitas tentativas. Aguarde alguns minutos.", true);
    else if (r.code === "CONFIG_UNAVAILABLE") avisar(T.sem_horarios, true);
    else avisar("Não conseguimos confirmar agora. Toque em confirmar novamente — o horário não foi duplicado.", true);
  });
}

// ---------------------------------------------------------------- confirmação
function confirmacao() {
  var r = st.reuniao, dur = Math.round((Date.parse(r.fim) - Date.parse(r.inicio)) / 60000);
  var quando = maiuscula(fmtData(r.inicio, { weekday: "long", day: "2-digit", month: "long", year: "numeric" }));
  var ok = el("div", { "class": "f-ok", "aria-hidden": "true" });
  ok.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var tipo = st.info && st.info.tipoNome;
  trocar([
    ok,
    el("h2", { "class": "f-titulo", text: T.confirmacao_titulo }),
    el("p", { "class": "f-sub", text: T.confirmacao_texto }),
    el("dl", { "class": "f-dl" }, [
      tipo ? el("dt", { text: "Reunião" }) : null, tipo ? el("dd", { text: tipo }) : null,
      el("dt", { text: "Data" }), el("dd", { text: quando }),
      el("dt", { text: "Horário" }), el("dd", { text: fmtHora(r.inicio) }),
      el("dt", { text: "Duração" }), el("dd", { text: dur + " minutos" }),
      el("dt", { text: "Fuso" }), el("dd", { text: "Horário de Brasília" }),
      el("dt", { text: "Próximo passo" }), el("dd", { text: "Nossa equipe vai confirmar com você pelo WhatsApp informado." })]),
    st.simulada || CFG.previa || DEMO ? el("p", { "class": "f-nota", text: "Versão de teste: nenhum horário real foi reservado." }) : null]);
}
function mostrar() {
  if (st.reuniao) { st.i = N + 2; confirmacao(); }
  else if (st.i < 0) apresentacao();
  else if (st.i < N) pergunta();
  else if (st.i === N) contato();
  else agenda();
}
function despachar() { if (DEMO || !navigator.sendBeacon) return; navigator.sendBeacon(CFG.api, new Blob([JSON.stringify({ acao: "despachar", slug: CFG.slug, sessaoId: st.sid, segredo: st.sk, previa: CFG.previa || undefined })], { type: "text/plain" })); }

// ---------------------------------------------------------------- sessão
var sessaoPromise = null;
function esperarSessao() { return sessaoPromise.then(function (ok) { if (!ok) sessaoPromise = abrirSessao(); return sessaoPromise; }); }
function abrirSessao() {
  var q = new URLSearchParams(location.search), atrib = {};
  CFG.params.forEach(function (k) { var v = q.get(k); if (v) atrib[k] = v.slice(0, 500); });
  // versaoId: a sessão fica presa à versão que o visitante está vendo, mesmo se outra for publicada.
  return api({ acao: "sessao", versaoId: CFG.versaoId, atribuicao: atrib, referrer: document.referrer || "", fbp: cookie("_fbp"), fbc: cookie("_fbc"), consentimento: consent }, 2).then(function (r) {
    if (r._status !== 200 || !r.sessaoId) { return false; }
    st.sid = r.sessaoId; if (r.segredo) st.sk = r.segredo;
    pronto = !DEMO;
    if (r.reuniao) { st.reuniao = r.reuniao; st.simulada = !!r.reuniao.simulada; st.lead = r.lead; salvar(); mostrar(); }
    else if (r.lead && st.i < N + 1) { st.lead = r.lead; st.i = N + 1; salvar(); mostrar(); }
    else { for (var k in r.respostas || {}) if (!st.respostas[k]) st.respostas[k] = r.respostas[k]; salvar(); }
    enviarFila();
    return true;
  });
}

// ---------------------------------------------------------------- início
var salvo = ler(KEY);
if (salvo && salvo.sid && Date.now() - (salvo.ts || 0) < 7 * 864e5) {
  st.sid = salvo.sid; st.sk = salvo.sk; st.respostas = salvo.respostas || {};
  st.i = Math.max(INI, Math.min(typeof salvo.i === "number" ? salvo.i : INI, N));
}
// A 1ª tela já veio no HTML; só reconstrói se houver progresso salvo.
if (st.i !== INI) mostrar();
else if (AP) { ligarApresentacao(); atualizarPe(); evento("welcome_viewed", { etapa: "apresentacao" }); }
else if (!D.avanco_automatico || st.respostas[P[0].id]) pergunta(false);
else {
  root.querySelectorAll(".f-opcao").forEach(function (b) { b.addEventListener("click", function () { escolher(P[0], b.getAttribute("data-o"), b); }); });
  evento("question_viewed", { etapa: P[0].id }); progresso(); atualizarPe();
}
sessaoPromise = abrirSessao();
var depois = window.requestIdleCallback || function (f) { setTimeout(f, 1500); };
if (!DEMO) window.addEventListener("load", function () { depois(function () { carregarPixel(); }); });
})();`

// Compactação segura (o script não tem strings/regex de várias linhas): tira a
// indentação e as linhas só de comentário, mantendo as quebras de linha (ASI).
// O hash da CSP é calculado sobre este texto final.
export const SCRIPT_CLIENTE = FONTE.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("//")).join("\n")
