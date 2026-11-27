// =============================================================================
// Script do navegador do Funil Estáticos Meta (JS puro, ~10 KB, inline).
//
// Por que não React: a página precisa abrir no navegador interno do
// Instagram/Facebook em 3G com a 1ª pergunta já pintada pelo HTML do servidor.
// Sem framework, sem CSS global, sem fontes externas. O Pixel da Meta só é
// carregado depois da página interativa e nunca bloqueia o formulário.
//
// Regras deste arquivo: sem template literals e sem dependências; a config
// chega por <script type="application/json" id="funil-cfg">. Nada de PII vai
// para localStorage, URL, analytics ou parâmetros personalizados do Pixel.
// =============================================================================

export const SCRIPT_CLIENTE = String.raw`(function () {
"use strict";
var CFG = JSON.parse(document.getElementById("funil-cfg").textContent);
var D = CFG.def, P = D.perguntas, T = D.textos, N = P.length, TOTAL = N + 2;
var $ = function (id) { return document.getElementById(id); };
var root = $("f-etapa"), barra = $("f-barra"), contador = $("f-contador"), voltar = $("f-voltar"), aviso = $("f-aviso");
var KEY = "funil:" + CFG.slug + ":" + CFG.versaoId + (CFG.previa ? ":teste" : "");
var st = { i: 0, respostas: {}, sid: null, sk: null, lead: null, reuniao: null, slot: null, chave: null, dias: null, dia: null, enviando: false };
var fila = [], pronto = false, timer = null;

function ler(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
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
function cookie(n) { var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : null; }

// ---------------------------------------------------------------- rede
function api(corpo, tentativas) {
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

// ---------------------------------------------------------------- pixel (não bloqueante)
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
function barraConsentimento() {
  if (!CFG.pixelId || CFG.consentimentoModo !== "opt_in" || consent !== null) return;
  var b = el("div", { "class": "f-consent", role: "region", "aria-label": "Preferências de privacidade" }, [
    el("p", { text: "Usamos cookies da Meta para medir o desempenho dos anúncios. Você pode recusar sem prejuízo ao agendamento." }),
    el("div", {}, [
      el("button", { type: "button", "class": "f-link", text: "Recusar", onclick: function () { decidir(false); } }),
      el("button", { type: "button", "class": "f-mini", text: "Aceitar", onclick: function () { decidir(true); } })])]);
  function decidir(v) { consent = v; gravar("funil:consent", v); b.remove(); evento("question_viewed", { etapa: etapaAtual(), consentimento: v }); if (v) carregarPixel(); }
  document.body.appendChild(b);
}

// ---------------------------------------------------------------- render
function etapaAtual() { return st.i < N ? P[st.i].id : st.i === N ? "contato" : st.i === N + 1 ? "agenda" : "confirmacao"; }
function progresso() {
  var passo = Math.min(st.i + 1, TOTAL);
  barra.style.transform = "scaleX(" + (st.i >= TOTAL ? 1 : st.i / TOTAL) + ")";
  barra.parentNode.setAttribute("aria-valuenow", String(Math.min(st.i, TOTAL)));
  contador.textContent = st.i >= TOTAL ? "Concluído" : "Etapa " + passo + " de " + TOTAL;
  voltar.hidden = !(st.i > 0 && st.i <= N && !st.reuniao);
  var intro = document.querySelector(".f-intro"); if (intro) intro.hidden = st.i > 0;
}
function trocar(filhos, foco) {
  root.innerHTML = ""; filhos.forEach(function (f) { root.appendChild(f); });
  root.classList.remove("f-in"); void root.offsetWidth; root.classList.add("f-in");
  progresso(); avisar("");
  var h = root.querySelector("h2"); if (foco !== false && h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}
function avisar(msg, erro) { aviso.textContent = msg || ""; aviso.className = erro ? "f-aviso f-erro" : "f-aviso"; }

function pergunta(foco) {
  var p = P[st.i];
  var lista = el("div", { "class": "f-opcoes", role: "radiogroup", "aria-labelledby": "f-q" });
  p.opcoes.forEach(function (o) {
    var marcado = st.respostas[p.id] === o.id;
    lista.appendChild(el("button", { type: "button", role: "radio", "aria-checked": marcado ? "true" : "false", "class": "f-opcao", "data-o": o.id, text: o.texto,
      onclick: function () { escolher(p, o.id, this); } }));
  });
  var filhos = [el("h2", { id: "f-q", "class": "f-titulo", text: p.texto }), lista];
  if (!D.avanco_automatico || st.respostas[p.id]) filhos.push(el("button", { type: "button", "class": "f-cta", text: "Continuar", disabled: st.respostas[p.id] ? null : "", onclick: avancar }));
  trocar(filhos, foco);
  evento("question_viewed", { etapa: p.id });
}
function escolher(p, oid, botao) {
  if (st.enviando) return;
  var primeira = !Object.keys(st.respostas).length;
  st.respostas[p.id] = oid; salvar();
  root.querySelectorAll(".f-opcao").forEach(function (b) { b.setAttribute("aria-checked", b === botao ? "true" : "false"); });
  if (primeira) evento("funnel_started", { etapa: p.id });
  evento("question_answered", { etapa: p.id, opcao: oid });
  if (D.avanco_automatico) { st.enviando = true; setTimeout(function () { st.enviando = false; avancar(); }, 220); }
  else { var c = root.querySelector(".f-cta"); if (c) c.removeAttribute("disabled"); }
}
function avancar() {
  var p = P[st.i]; if (!st.respostas[p.id]) return;
  evento("question_completed", { etapa: p.id });
  st.i++; salvar(); mostrar();
}
voltar.addEventListener("click", function () {
  if (st.i <= 0 || st.i > N) return;
  evento("question_back", { etapa: etapaAtual() }); st.i--; salvar(); mostrar();
});

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
  var c = D.contato, filhos = [
    el("h2", { "class": "f-titulo", text: T.contato_titulo }),
    campo("nome", "Nome", { type: "text", autocomplete: "name", maxlength: "120", required: "", autocapitalize: "words", enterkeyhint: "next" }),
    campo("whatsapp", "WhatsApp com DDD", { type: "tel", inputmode: "tel", autocomplete: "tel-national", placeholder: "(45) 99999-9999", maxlength: "16", required: "", enterkeyhint: c.email === "oculto" && c.instagram === "oculto" ? "go" : "next" })];
  if (c.email !== "oculto") filhos.push(campo("email", "E-mail" + (c.email === "opcional" ? " (opcional)" : ""), { type: "email", autocomplete: "email", inputmode: "email", maxlength: "160" }));
  if (c.instagram !== "oculto") filhos.push(campo("instagram", "Instagram profissional (opcional)", { type: "text", autocomplete: "off", autocapitalize: "none", maxlength: "60", placeholder: "@seuperfil" }));
  var hp = el("div", { "class": "f-hp", "aria-hidden": "true" }, [el("input", { type: "text", id: "website", name: "website", tabindex: "-1", autocomplete: "off" })]);
  filhos.push(hp);
  if (CFG.pixelId && CFG.consentimentoModo === "opt_in") {
    var chk = el("input", { type: "checkbox", id: "mkt" }); if (consent === true) chk.checked = true;
    filhos.push(el("label", { "class": "f-check", "for": "mkt" }, [chk, el("span", { text: "Aceito cookies de medição de anúncios da Meta (opcional)." })]));
  }
  var lgpd = el("p", { "class": "f-lgpd" }, [document.createTextNode("Usaremos seus dados apenas para entrar em contato sobre este atendimento. ")]);
  if (CFG.privacidadeUrl) lgpd.appendChild(el("a", { href: CFG.privacidadeUrl, target: "_blank", rel: "noopener", text: "Política de privacidade" }));
  filhos.push(lgpd);
  var btn = el("button", { type: "submit", "class": "f-cta", text: T.contato_cta });
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
  var mkt = $("mkt"); if (mkt) { consent = mkt.checked; gravar("funil:consent", consent); var bar = document.querySelector(".f-consent"); if (bar) bar.remove(); if (consent) carregarPixel(); }
  st.enviando = true; btn.disabled = true; btn.textContent = "Salvando…"; enviarFila();
  esperarSessao().then(function () {
    return api({ acao: "contato", nome: nome, whatsapp: tel, email: em || null, instagram: $("instagram") ? $("instagram").value.trim() || null : null,
      respostas: st.respostas, consentimento: CFG.pixelId ? consent : null, website: $("website").value, fbp: cookie("_fbp"), fbc: cookie("_fbc"), url: location.href.split("#")[0] }, 3);
  }).then(function (r) {
    st.enviando = false; btn.disabled = false; btn.textContent = T.contato_cta;
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

function fmtData(iso, opts) { return new Date(iso).toLocaleDateString("pt-BR", Object.assign({ timeZone: "America/Sao_Paulo" }, opts)); }
function fmtHora(iso) { return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
function agenda(recarregar) {
  var cab = [el("h2", { "class": "f-titulo", text: T.agenda_titulo }), el("p", { "class": "f-sub", text: T.agenda_subtitulo })];
  var corpo = el("div", { "class": "f-agenda", "aria-busy": "true" }, [el("div", { "class": "f-skel" }), el("div", { "class": "f-skel" })]);
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
function desenharAgenda(corpo) {
  corpo.innerHTML = "";
  var r = st.info;
  corpo.appendChild(el("p", { "class": "f-meta", text: (r.tipoNome ? r.tipoNome + " · " : "") + r.durationMinutes + " min · Horário de Brasília" }));
  var dias = el("div", { "class": "f-dias", role: "tablist", "aria-label": "Datas disponíveis" });
  st.dias.forEach(function (d) {
    var iso = d.date + "T12:00:00Z", ativo = d.date === st.dia;
    dias.appendChild(el("button", { type: "button", role: "tab", "aria-selected": ativo ? "true" : "false", "class": "f-dia",
      onclick: function () { st.dia = d.date; st.slot = null; desenharAgenda(corpo); } }, [
      el("span", { text: fmtData(iso, { weekday: "short" }).replace(".", "") }), el("strong", { text: fmtData(iso, { day: "2-digit" }) }), el("span", { text: fmtData(iso, { month: "short" }).replace(".", "") })]));
  });
  corpo.appendChild(dias);
  var dia = st.dias.filter(function (d) { return d.date === st.dia; })[0];
  var grade = el("div", { "class": "f-slots", role: "radiogroup", "aria-label": "Horários disponíveis" });
  dia.slots.forEach(function (s) {
    var sel = st.slot && st.slot.start === s.start;
    grade.appendChild(el("button", { type: "button", role: "radio", "aria-checked": sel ? "true" : "false", "class": "f-slot", text: s.label,
      onclick: function () { st.slot = s; st.chave = uuid(); evento("booking_slot_selected", { etapa: "agenda" }); desenharAgenda(corpo); var c = $("f-confirmar"); if (c) c.focus(); } }));
  });
  corpo.appendChild(grade);
  if (st.slot) {
    var txt = fmtData(st.slot.start, { weekday: "long", day: "2-digit", month: "long" }) + " às " + st.slot.label;
    var b = el("button", { type: "button", id: "f-confirmar", "class": "f-cta", text: "Confirmar " + st.slot.label, onclick: function () { confirmar(b); } });
    corpo.appendChild(el("div", { "class": "f-resumo" }, [el("p", { text: txt.charAt(0).toUpperCase() + txt.slice(1) }), b]));
  }
}
function confirmar(b) {
  if (st.enviando || !st.slot) return;
  st.enviando = true; b.disabled = true; b.textContent = "Reservando…";
  api({ acao: "reservar", start: st.slot.start, idempotencyKey: st.chave, url: location.href.split("#")[0] }, 3).then(function (r) {
    st.enviando = false;
    if ((r._status === 201 || r._status === 200) && r.bookingId) {
      st.reuniao = { inicio: r.startsAt, fim: r.endsAt }; st.i = N + 2; salvar();
      var marca = "funil:sched:" + r.bookingId;
      if (r.enviarPixel && !ler(marca)) { pixel("Schedule", r.eventId); gravar(marca, 1); }
      mostrar(); despachar(); return;
    }
    b.disabled = false; b.textContent = "Confirmar " + st.slot.label;
    evento("booking_failed", { etapa: "agenda", codigo: r.code || "HTTP" });
    if (r.code === "SLOT_UNAVAILABLE") { st.slot = null; agenda(true); setTimeout(function () { avisar("Esse horário acabou de ser reservado. Escolha outro, por favor.", true); }, 50); }
    else if (r.code === "RATE_LIMITED") avisar("Muitas tentativas. Aguarde alguns minutos.", true);
    else if (r.code === "CONFIG_UNAVAILABLE") avisar(T.sem_horarios, true);
    else avisar("Não conseguimos confirmar agora. Toque em confirmar novamente — o horário não foi duplicado.", true);
  });
}
function confirmacao() {
  var r = st.reuniao, dur = Math.round((Date.parse(r.fim) - Date.parse(r.inicio)) / 60000);
  var quando = fmtData(r.inicio, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  trocar([
    el("div", { "class": "f-ok", "aria-hidden": "true", text: "✓" }),
    el("h2", { "class": "f-titulo", text: T.confirmacao_titulo }),
    el("dl", { "class": "f-dl" }, [
      st.lead ? el("dt", { text: "Nome" }) : null, st.lead ? el("dd", { text: st.lead.primeiroNome }) : null,
      el("dt", { text: "Data" }), el("dd", { text: quando.charAt(0).toUpperCase() + quando.slice(1) }),
      el("dt", { text: "Horário" }), el("dd", { text: fmtHora(r.inicio) + " (horário de Brasília)" }),
      el("dt", { text: "Duração" }), el("dd", { text: dur + " minutos" }),
      st.info && st.info.tipoNome ? el("dt", { text: "Reunião" }) : null, st.info && st.info.tipoNome ? el("dd", { text: st.info.tipoNome }) : null,
      el("dt", { text: "Acesso" }), el("dd", { text: "Nossa equipe vai confirmar com você pelo WhatsApp." })]),
    el("p", { "class": "f-sub", text: T.confirmacao_texto })]);
}
function mostrar() { if (st.reuniao) { st.i = N + 2; confirmacao(); } else if (st.i < N) pergunta(); else if (st.i === N) contato(); else agenda(); }
function despachar() { if (navigator.sendBeacon) navigator.sendBeacon(CFG.api, new Blob([JSON.stringify({ acao: "despachar", slug: CFG.slug, sessaoId: st.sid, segredo: st.sk, previa: CFG.previa || undefined })], { type: "text/plain" })); }

// ---------------------------------------------------------------- sessão
var sessaoPromise = null;
function esperarSessao() { return sessaoPromise.then(function (ok) { if (!ok) sessaoPromise = abrirSessao(); return sessaoPromise; }); }
function abrirSessao() {
  var q = new URLSearchParams(location.search), atrib = {};
  CFG.params.forEach(function (k) { var v = q.get(k); if (v) atrib[k] = v.slice(0, 500); });
  return api({ acao: "sessao", atribuicao: atrib, referrer: document.referrer || "", fbp: cookie("_fbp"), fbc: cookie("_fbc"), consentimento: consent }, 2).then(function (r) {
    if (r._status !== 200 || !r.sessaoId) { return false; }
    st.sid = r.sessaoId; if (r.segredo) st.sk = r.segredo;
    pronto = true;
    if (r.reuniao) { st.reuniao = r.reuniao; st.lead = r.lead; salvar(); mostrar(); }
    else if (r.lead && st.i < N + 1) { st.lead = r.lead; st.i = N + 1; salvar(); mostrar(); }
    else { for (var k in r.respostas || {}) if (!st.respostas[k]) st.respostas[k] = r.respostas[k]; salvar(); }
    enviarFila();
    return true;
  });
}

// ---------------------------------------------------------------- início
var salvo = ler(KEY);
if (salvo && salvo.sid && Date.now() - (salvo.ts || 0) < 7 * 864e5) { st.sid = salvo.sid; st.sk = salvo.sk; st.i = Math.min(salvo.i || 0, N); st.respostas = salvo.respostas || {}; }
// A 1ª pergunta já veio no HTML; só reconstrói se houver progresso salvo.
if (st.i > 0) mostrar();
else if (!D.avanco_automatico || st.respostas[P[0].id]) pergunta(false);
else {
  root.querySelectorAll(".f-opcao").forEach(function (b) { b.addEventListener("click", function () { escolher(P[0], b.getAttribute("data-o"), b); }); });
  evento("question_viewed", { etapa: P[0].id }); progresso();
}
sessaoPromise = abrirSessao();
var depois = window.requestIdleCallback || function (f) { setTimeout(f, 1500); };
window.addEventListener("load", function () { depois(function () { carregarPixel(); barraConsentimento(); }); });
})();`
