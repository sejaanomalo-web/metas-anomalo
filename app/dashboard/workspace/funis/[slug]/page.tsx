import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { requererPermissao } from "@/lib/auth"
import { ehAdminNoModulo } from "@/lib/acesso-admin"
import { getPreferencia, listarAbas } from "@/lib/workspace"
import { carregarPainelFunil, PERIODOS, resolverIntervalo } from "@/lib/funil-estaticos-admin"
import {
  mascararTelefone, PARAMETROS_META_ADS, ROTULO_QUALIFICACAO, ROTULO_STATUS_COMERCIAL, custoPor, type Taxa,
} from "@/lib/funil-estaticos-nucleo"
import { formatarDataHora, ROTULO_STATUS, type StatusReuniao } from "@/lib/reunioes-nucleo"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import { Cartao, BotaoCopiar } from "@/components/workspace/reunioes/ui"
import {
  FormConfigFunil, FormCanalFunil, EditorFormularioFunil, GerirCriativos, FormInvestimento, LeadAcoes, BotaoPrevia, BotaoReprocessar, GeradorUrl,
} from "@/components/workspace/funil/FunilAdmin"

export const dynamic = "force-dynamic"

const ABAS = [
  { id: "visao", rotulo: "Visão geral" }, { id: "leads", rotulo: "Leads" }, { id: "formulario", rotulo: "Formulário" },
  { id: "agendamento", rotulo: "Agendamento" }, { id: "tracking", rotulo: "Tracking" }, { id: "relatorios", rotulo: "Relatórios" },
  { id: "configuracoes", rotulo: "Configurações" },
] as const
type Aba = (typeof ABAS)[number]["id"]
type SP = Record<string, string | string[] | undefined>
const estiloData = { fontSize: 11, padding: "2px 6px", borderRadius: 8, border: "1px solid var(--surface-3)", background: "var(--surface-3)", color: "var(--text-1)", colorScheme: "dark" } as const
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

const pct = (t: Taxa) => (t.valor === null ? "Sem dados" : `${(t.valor * 100).toFixed(1).replace(".", ",")}%`)
const brl = (v: number | null) => (v === null ? "Sem dados" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
const dur = (ms: number | null) => (ms === null ? "Sem dados" : ms < 3_600_000 ? `${Math.round(ms / 60000)} min` : `${(ms / 3_600_000).toFixed(1).replace(".", ",")} h`)
const ORIGEM: Record<string, string> = { meta_pago: "Meta Ads (pago)", outro_pago: "Outro pago", organico: "Orgânico/indicação", direto: "Acesso direto", nao_identificado: "Não identificado" }

function urlBase(): string {
  const env = process.env.APP_PUBLIC_URL?.trim()
  if (env) return env.replace(/\/+$/, "")
  const h = headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`
}

export default async function FunilPage({ params, searchParams }: { params: { slug: string }; searchParams: SP }) {
  const usuario = await requererPermissao("workspace")
  if (!ehAdminNoModulo(usuario, "workspace")) redirect("/dashboard/workspace/reunioes")
  const aba: Aba = (ABAS.find(a => a.id === um(searchParams.aba))?.id ?? "visao") as Aba
  const intervalo = resolverIntervalo(um(searchParams.periodo), um(searchParams.de), um(searchParams.ate))
  const periodo = intervalo.periodo
  const paramsPeriodo: Record<string, string> = periodo === "intervalo" ? { periodo, de: intervalo.de, ate: intervalo.ate } : { periodo }
  const teste = um(searchParams.teste) === "1"
  const [abas, pref, p] = await Promise.all([listarAbas(), getPreferencia(usuario.id), carregarPainelFunil(params.slug, intervalo, teste)])

  const nav = <WorkspaceNav abas={abas} presenca={{ id: usuario.id, nome: usuario.nome, foto: pref.foto_url }} />
  if ("erro" in p) {
    return (
      <main className="ws-main"><div className="ws-topo">{nav}</div><div className="ws-conteudo">
        <Cartao titulo={p.erro === "nao_encontrado" ? "Funil não encontrado" : "Falta aplicar migration do banco"}
          subtitulo={p.erro === "migracao" ? "Rode no SQL Editor, nesta ordem: 20261125, 20261126, 20261127 e 20261128. Passo a passo em docs/FUNIL_ESTATICOS_META.md."
            : p.erro === "migracao_fase2" ? "A 20261127 está aplicada, mas falta a 20261128_funil_apresentacao_teste.sql (tela inicial, modo de teste e criativos). Passo a passo em docs/FUNIL_ESTATICOS_META.md."
            : p.erro === "nao_encontrado" ? "Confira o endereço." : "Banco indisponível."} />
      </div></main>
    )
  }
  const f = p.funil
  const base = urlBase()
  const urlPublica = `${base}/funil/${f.slug}`
  const producao = (process.env.VERCEL_ENV ?? "development") === "production"
  const m = p.metricas
  const nomeCriativo = (id: string | null) => (id ? p.criativos.find(c => c.id === id)?.codigo ?? "?" : "Não identificado")
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ aba, ...paramsPeriodo, ...(teste ? { teste: "1" } : {}), ...extra })
    for (const [k, v] of Array.from(u.entries())) if (!v) u.delete(k)
    return `?${u.toString()}`
  }
  const pendencias: string[] = []
  if (!f.privacidade_url) pendencias.push("Política de privacidade não configurada (bloqueia a publicação real).")
  if (!p.canal) pendencias.push("Agenda do funil não configurada (aba Agendamento). Leads são salvos, mas não há horários.")
  else if (!p.canal.ativo) pendencias.push("Agenda do funil inativa — visitantes verão 'sem horários disponíveis'.")
  if (!f.pixel_id) pendencias.push("Conjunto de dados (Pixel) da ANÔMALO não configurado.")
  if (f.capi_ativo && !p.env.capiToken) pendencias.push("CAPI ligada, mas falta FUNIL_ESTATICOS_META_CAPI_TOKEN no servidor.")
  if (p.conversoesPendentes) pendencias.push(`${p.conversoesPendentes} conversões aguardando envio/reenvio.`)
  if (!p.criativos.length) pendencias.push("Nenhum criativo cadastrado (E01–E12).")
  else if (p.criativos.some(c => c.status === "ativo" && !c.meta_ad_id)) pendencias.push(`${p.criativos.filter(c => c.status === "ativo" && !c.meta_ad_id).length} criativo(s) ativo(s) sem ID do anúncio — a atribuição dependerá do creative_id na URL.`)

  return (
    <main className="ws-main">
      <div className="ws-topo">
        {nav}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href="/dashboard/workspace/reunioes?secao=integracoes" style={{ fontSize: 12, color: "var(--text-3)", textDecoration: "none" }}>Reuniões › Integrações ›</Link>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{String(f.nome)}</h2>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, border: `1px solid ${f.ativo ? "#5da28355" : "#8a93a355"}`, color: f.ativo ? "#5da283" : "#8a93a3" }}>
            ● {f.ativo ? "Publicado" : "Inativo"}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-4)" }}>{producao ? "Produção" : `Ambiente: ${p.env.ambiente}`}</span>
          <span style={{ flex: 1 }} />
          <nav aria-label="Período" style={{ display: "flex", gap: 4 }}>
            {(Object.keys(PERIODOS) as (keyof typeof PERIODOS)[]).map(k => (
              <Link key={k} href={qs({ periodo: k, de: "", ate: "" })} aria-current={k === periodo ? "true" : undefined} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, textDecoration: "none", color: k === periodo ? "#1e1f21" : "var(--text-2)", background: k === periodo ? "var(--accent)" : "var(--surface-3)" }}>{PERIODOS[k]}</Link>
            ))}
            <Link href={qs({ teste: teste ? "0" : "1" })} title="Por padrão os relatórios mostram só produção" style={{ fontSize: 11, padding: "3px 8px", color: teste ? "#C9953A" : "var(--text-3)" }}>{teste ? "Mostrando testes — ocultar" : "Incluir testes"}</Link>
          </nav>
          <form method="get" aria-label="Intervalo de datas" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-3)" }}>
            <input type="hidden" name="aba" value={aba} />
            <input type="hidden" name="periodo" value="intervalo" />
            {teste && <input type="hidden" name="teste" value="1" />}
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>De
              <input type="date" name="de" required defaultValue={intervalo.de} max={resolverIntervalo("hoje").ate} style={estiloData} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>até
              <input type="date" name="ate" defaultValue={intervalo.ate} max={resolverIntervalo("hoje").ate} style={estiloData} />
            </label>
            <button type="submit" style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, border: 0, cursor: "pointer", color: periodo === "intervalo" ? "#1e1f21" : "var(--text-2)", background: periodo === "intervalo" ? "var(--accent)" : "var(--surface-3)" }}>Aplicar</button>
            <span title="Dias de calendário no horário de Brasília" style={{ marginLeft: 4, color: "var(--text-4)" }}>{intervalo.rotulo}</span>
          </form>
        </div>
        <nav aria-label="Seções do funil" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ABAS.map(a => (
            <Link key={a.id} href={qs({ aba: a.id })} aria-current={a.id === aba ? "page" : undefined}
              style={{ fontSize: 12, padding: "5px 11px", borderRadius: 999, textDecoration: "none", fontWeight: a.id === aba ? 600 : 400, color: a.id === aba ? "#1e1f21" : "var(--text-2)", background: a.id === aba ? "var(--accent)" : "var(--surface-3)" }}>{a.rotulo}</Link>
          ))}
        </nav>
      </div>

      <div className="ws-conteudo" style={{ display: "grid", gap: 14 }}>
        {aba === "visao" && (
          <>
            <Cartao titulo="URL pública" subtitulo={`Destino de todos os anúncios (${p.criativos.length || 12} criativos, mesma URL). “Versão de teste” não reserva horário real, não cria tarefa e não envia nada à Meta.`}
              acoes={<><BotaoCopiar texto={urlPublica} /><a className="no-ds" href={urlPublica} target="_blank" rel="noopener" style={{ fontSize: 12, color: "var(--text-1)" }}>Abrir ↗</a>
                {p.versaoPublicada && <BotaoPrevia funilId={f.id} versaoId={p.versaoPublicada.id} base={urlPublica} rotulo="Versão de teste" />}</>}>
              <code style={{ fontSize: 12, wordBreak: "break-all", color: "var(--text-1)" }}>{urlPublica}</code>
            </Cartao>
            {pendencias.length > 0 && (
              <Cartao titulo="Pendências operacionais">
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#C9953A", display: "grid", gap: 4 }}>{pendencias.map(x => <li key={x}>{x}</li>)}</ul>
              </Cartao>
            )}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {[
                ["Sessões", m.contagens.sessoes, "visitantes únicos do funil (por sessão)"],
                ["Formulários iniciados", m.contagens.iniciadas, `taxa de início ${pct(m.taxas.inicio)}`],
                ["Leads captados", m.contagens.comContato, `${m.contagens.leadsUnicos} contatos únicos`],
                ["Reuniões agendadas", m.contagens.agendadas, `agendamento ${pct(m.taxas.agendamento)}`],
                ["Reuniões realizadas", m.contagens.realizadas, `comparecimento ${pct(m.taxas.comparecimento)}`],
                ["Vendas", m.contagens.vendas, brl(m.contagens.receita || null)],
              ].map(([r, v, d]) => (
                <section key={r as string} className="glass" style={{ padding: 12, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{r}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)" }}>{v}</div>
                  <div style={{ fontSize: 10, color: "var(--text-4)" }}>{d}</div>
                </section>
              ))}
            </div>
            <Funil etapas={m.etapas} abandono={m.abandonoPorEtapa} />
            <Cartao titulo="Tela inicial (Etapa 00)" subtitulo="Só sessões que realmente viram a apresentação entram nestes denominadores. Ver a apresentação ou clicar no botão não é lead.">
              {m.apresentacao.vistas === 0 ? <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>Sem dados — nenhuma sessão abriu com a apresentação no período.</p> : (
                <Tabela cab={["Indicador", "Valor", "Cálculo"]} linhas={[
                  ["Visualizaram a apresentação", String(m.apresentacao.vistas), "sessões com welcome_viewed"],
                  ["Clique no botão inicial", pct(m.taxas.cliqueInicial), `${m.taxas.cliqueInicial.num} clicaram / ${m.taxas.cliqueInicial.den} viram`],
                  ["Taxa de início", pct(m.taxas.inicioAposApresentacao), `${m.taxas.inicioAposApresentacao.num} iniciaram as perguntas / ${m.taxas.inicioAposApresentacao.den} viram a apresentação`],
                  ["Abandono inicial", pct(m.taxas.abandonoInicial), `${m.taxas.abandonoInicial.num} abandonaram sem iniciar / ${m.taxas.abandonoInicial.den} elegíveis (iniciaram ou já foram marcadas como abandonadas)`],
                ]} />
              )}
              {p.porVariante.length > 0 && (
                <Tabela cab={["Entrada", "Sessões", "Início", "Leads", "Captura", "Agendadas"]} linhas={p.porVariante.map(v => [
                  v.variante === "apresentacao" ? "Com apresentação" : "Direto na 1ª pergunta", String(v.metricas.contagens.sessoes),
                  `${v.metricas.contagens.iniciadas} (${pct(v.metricas.taxas.inicio)})`, String(v.metricas.contagens.comContato), pct(v.metricas.taxas.captura), String(v.metricas.contagens.agendadas)])} />
              )}
              <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>As duas entradas não rodam ao mesmo tempo (não há sorteio A/B): a comparação é entre períodos/versões e pode ter outras diferenças além da tela inicial.</p>
            </Cartao>
            <Cartao titulo="Taxas de conversão" subtitulo="Denominadores explícitos. Coorte = sessões abertas no período.">
              <Tabela cab={["Taxa", "Valor", "Cálculo"]} linhas={[
                ["Início", pct(m.taxas.inicio), `${m.taxas.inicio.num} responderam a 1ª pergunta / ${m.taxas.inicio.den} sessões`],
                ["Conclusão das perguntas", pct(m.taxas.conclusaoPerguntas), `${m.taxas.conclusaoPerguntas.num} concluíram / ${m.taxas.conclusaoPerguntas.den} iniciaram`],
                ["Captura", pct(m.taxas.captura), `${m.taxas.captura.num} com contato / ${m.taxas.captura.den} sessões`],
                ["Agendamento", pct(m.taxas.agendamento), `${m.taxas.agendamento.num} leads que agendaram / ${m.taxas.agendamento.den} leads da coorte`],
                ["Comparecimento", pct(m.taxas.comparecimento), `${m.taxas.comparecimento.num} realizadas / ${m.taxas.comparecimento.den} reuniões já encerradas (não canceladas)`],
                ["Fechamento", pct(m.taxas.fechamento), `${m.taxas.fechamento.num} vendas / ${m.taxas.fechamento.den} com proposta`],
                ["Mediana início → lead", dur(m.tempos.inicioAteLead), ""],
                ["Mediana lead → agendamento", dur(m.tempos.leadAteAgendamento), ""],
              ]} />
            </Cartao>
            <Cartao titulo="Origem das sessões">
              <Tabela cab={["Origem", "Sessões"]} linhas={Object.entries(p.origens).map(([k, v]) => [ORIGEM[k] ?? k, String(v)])} vazio="Sem sessões no período." />
            </Cartao>
            <Cartao titulo="Integrações">
              <Tabela cab={["Item", "Status"]} linhas={[
                ["Agenda nativa do Workspace", p.canal ? (p.canal.ativo ? "Ativa" : "Inativa") : "Não configurada"],
                ["Pixel (navegador)", f.pixel_id ? `Configurado (${String(f.pixel_id)})` : "Não configurado"],
                ["Conversions API", f.capi_ativo ? (p.env.capiToken ? "Ativa" : "Ativa, sem token no servidor") : "Desligada"],
                ["CRM", f.crm_usuario_id ? `Espelha leads em ${String(f.crm_empresa_slug ?? "—")}` : "Não espelha (leads ficam no funil)"],
                ["Google Calendar / Meet", "Não utilizado — o Workspace é a agenda; o link é combinado pelo WhatsApp"],
              ]} />
            </Cartao>
          </>
        )}

        {aba === "leads" && (
          <Leads p={p} lead={um(searchParams.lead)} filtros={{ criativo: um(searchParams.criativo), interesse: um(searchParams.interesse), status: um(searchParams.status), qual: um(searchParams.qual), reuniao: um(searchParams.reuniao) }} nomeCriativo={nomeCriativo} qs={qs} />
        )}

        {aba === "formulario" && (
          <EditorFormularioFunil funilId={f.id} urlPublica={urlPublica}
            publicada={p.versaoPublicada ? { id: p.versaoPublicada.id, numero: p.versaoPublicada.numero, definicao: p.versaoPublicada.definicao } : null}
            rascunho={(() => { const r = p.versoes.find(v => v.status === "rascunho"); return r ? { id: r.id, numero: r.numero, definicao: r.definicao } : null })()}
            historico={p.versoes.map(v => ({ id: v.id, numero: v.numero, status: v.status, publicada_em: v.publicada_em, criado_em: v.criado_em }))} />
        )}

        {aba === "agendamento" && (
          <FormCanalFunil funilId={f.id} canal={p.canal} tipos={p.tipos} disponibilidades={p.disponibilidades} usuarios={p.usuarios} />
        )}

        {aba === "tracking" && (
          <>
            <Cartao titulo="Diagnóstico de tracking" acoes={<BotaoReprocessar funilId={f.id} />}>
              <Tabela cab={["Item", "Status"]} linhas={[
                ["Ambiente atual", p.env.ambiente === "production" ? "Produção (eventos reais)" : `${p.env.ambiente} — CAPI só envia com código de teste`],
                ["Versão de teste (funcional)", "Nunca envia à Meta: sem Pixel, sem CAPI; reserva simulada"],
                ["Diagnóstico da CAPI", "Link próprio (abaixo): Lead/Schedule só com o código de teste, visíveis em Eventos de teste"],
                ["Pixel ID", f.pixel_id ? String(f.pixel_id) : "Não configurado"],
                ["CAPI", f.capi_ativo ? "Ligada" : "Desligada"],
                ["Token CAPI no servidor", p.env.capiToken ? "Presente (oculto)" : "Ausente — FUNIL_ESTATICOS_META_CAPI_TOKEN"],
                ["Código de teste", f.meta_test_event_code ? "Configurado" : "Não configurado"],
                ["Eventos", Object.entries((f.eventos_meta ?? {}) as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k).join(", ") || "nenhum"],
                ["Consentimento", f.consentimento_modo === "opt_in" ? "Opt-in (Pixel/CAPI só após aceite)" : "Informativo"],
                ["Pendentes/erro na fila", String(p.conversoesPendentes)],
                ["Último envio", (() => { const u = p.conversoes.find(c => c.status === "enviado"); return u ? `${u.evento} · ${formatarDataHora(u.enviado_em)}` : "nenhum" })()],
                ["Último erro", (() => { const u = p.conversoes.find(c => c.status === "erro"); return u ? `${u.evento} · ${u.ultimo_erro ?? ""}` : "nenhum" })()],
                ["Deduplicação", "Pixel e CAPI usam o mesmo event_id (lead.<id> / schedule.<id>); a fila tem event_id único"],
              ]} />
            </Cartao>
            <Cartao titulo="Diagnóstico da Conversions API" subtitulo="Gera um link de teste que envia Lead e Schedule à Meta APENAS com o código de teste (aba “Eventos de teste” do Gerenciador). Não conta como conversão real, não reserva horário e não entra nos relatórios de produção. O Pixel do navegador continua desligado nesse link.">
              {p.versaoPublicada ? <div><BotaoPrevia funilId={f.id} versaoId={p.versaoPublicada.id} base={urlPublica} rotulo="Abrir link de diagnóstico da CAPI" modo="diagnostico_capi" /></div>
                : <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>Sem versão publicada.</p>}
            </Cartao>
            <GeradorUrl base={urlPublica} parametros={PARAMETROS_META_ADS} criativos={p.criativos.map(c => ({ codigo: c.codigo, nome: c.nome }))} />
            <GerirCriativos funilId={f.id} criativos={p.criativos} />
            <Cartao titulo="Conversões recentes" subtitulo="Fila durável da Conversions API (sem dados pessoais nesta tela).">
              <Tabela cab={["Evento", "event_id", "Status", "Tentativas", "Quando", "Detalhe"]} vazio="Nenhuma conversão ainda."
                linhas={p.conversoes.map(c => [c.evento + (c.ambiente === "teste" ? " (teste)" : ""), c.event_id.slice(0, 18) + "…", c.status, String(c.tentativas), formatarDataHora(c.criado_em), c.ultimo_erro ?? c.motivo ?? ""])} />
            </Cartao>
            <Cartao titulo="Sessões recentes">
              <Tabela cab={["Aberta em", "Entrada", "Origem", "Criativo", "Situação"]} vazio="Sem sessões."
                linhas={p.sessoesRecentes.map(s => [formatarDataHora(s.aberta_em) + (s.ambiente === "teste" ? " (teste)" : ""), s.entrada === "apresentacao" ? "Apresentação" : "Direto", ORIGEM[s.origem] ?? s.origem, nomeCriativo(s.criativo_id), s.etapa])} />
            </Cartao>
          </>
        )}

        {aba === "relatorios" && (
          <>
            <Cartao titulo="Desempenho por criativo" subtitulo="Investimento: lançamentos manuais + Sentinela (dados_diarios_ad) para anúncios com ID cadastrado. Sem investimento → custos 'Sem dados'.">
              <Tabela cab={["Criativo", "Sessões", "Leads", "Qualif.", "Agend.", "Realiz.", "Propostas", "Vendas", "Investimento", "CPL", "Custo/agend.", "Custo/realiz.", "CAC", "ROAS", "Fonte"]}
                linhas={p.linhasCriativo.map(l => {
                  const c = l.metricas.contagens, inv = l.investimento?.investimento ?? null
                  return [nomeCriativo(l.criativoId), String(c.sessoes), String(c.comContato), String(c.qualificados), String(c.agendadas), String(c.realizadas), String(c.propostas), String(c.vendas),
                    brl(inv), brl(custoPor(inv, c.comContato)), brl(custoPor(inv, c.agendadas)), brl(custoPor(inv, c.realizadas)), brl(custoPor(inv, c.vendas)),
                    inv && c.receita ? (c.receita / inv).toFixed(2).replace(".", ",") : "Sem dados", l.investimento?.fontes.join(" + ") ?? "—"]
                })} />
            </Cartao>
            <Cartao titulo="Entrega dos anúncios" subtitulo="Métricas de entrega (impressões, cliques) vêm da Meta — não são eventos do funil.">
              <Tabela cab={["Criativo", "Impressões", "Cliques no link", "CTR", "CPC"]}
                linhas={p.linhasCriativo.filter(l => l.investimento).map(l => {
                  const i = l.investimento!
                  return [nomeCriativo(l.criativoId), i.impressoes.toLocaleString("pt-BR"), i.cliques.toLocaleString("pt-BR"),
                    i.impressoes ? `${((i.cliques / i.impressoes) * 100).toFixed(2).replace(".", ",")}%` : "Sem dados", brl(custoPor(i.investimento, i.cliques))]
                })} vazio="Sem dados de entrega no período (cadastre o ID do anúncio ou lance manualmente)." />
              <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Alcance não é somado entre dias/anúncios (pessoas se repetem); por isso não aparece agregado.</p>
            </Cartao>
            <FormInvestimento funilId={f.id} criativos={p.criativos.map(c => ({ id: c.id, codigo: c.codigo }))} />
            <Cartao titulo="Investimentos manuais lançados">
              <Tabela cab={["Data", "Criativo", "Investimento", "Impressões", "Cliques"]} vazio="Nenhum lançamento manual."
                linhas={p.investimentosManuais.map(i => [i.data.split("-").reverse().join("/"), nomeCriativo(i.criativo_id), brl(Number(i.investimento)), i.impressoes?.toString() ?? "—", i.cliques_link?.toString() ?? "—"])} />
            </Cartao>
          </>
        )}

        {aba === "configuracoes" && (
          <FormConfigFunil funil={f as never} usuarios={p.usuarios} empresasCrm={p.empresasCrm} urlBase={base} />
        )}
      </div>
    </main>
  )
}

function Tabela({ cab, linhas, vazio }: { cab: string[]; linhas: React.ReactNode[][]; vazio?: string }) {
  if (!linhas.length) return <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>{vazio ?? "Sem dados."}</p>
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>{cab.map(c => <th key={c} style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-3)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)", whiteSpace: "nowrap" }}>{c}</th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j} style={{ padding: "6px 8px", color: "var(--text-1)", borderBottom: "1px solid rgba(255,255,255,0.05)", whiteSpace: j === l.length - 1 ? "normal" : "nowrap" }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function Funil({ etapas, abandono }: { etapas: { chave: string; rotulo: string; qtd: number }[]; abandono: Record<string, number> }) {
  const max = Math.max(1, etapas[0]?.qtd ?? 1)
  let maiorPerda = { i: -1, v: 0 }
  etapas.forEach((e, i) => { if (i > 0) { const perda = etapas[i - 1].qtd - e.qtd; if (perda > maiorPerda.v) maiorPerda = { i, v: perda } } })
  return (
    <Cartao titulo="Jornada do funil" subtitulo="Quantidade em cada etapa, avanço sobre a etapa anterior e abandono inferido (inatividade).">
      <div style={{ display: "grid", gap: 6 }}>
        {etapas.map((e, i) => {
          const ant = i ? etapas[i - 1].qtd : null
          const avanco = ant ? `${((e.qtd / ant) * 100).toFixed(0)}%` : ant === 0 ? "Sem dados" : ""
          return (
            <div key={e.chave} style={{ display: "grid", gridTemplateColumns: "150px 1fr 110px", gap: 8, alignItems: "center", fontSize: 12 }}>
              <span style={{ color: i === maiorPerda.i ? "#e24b4a" : "var(--text-2)" }}>{e.rotulo}{i === maiorPerda.i ? " ⚠" : ""}</span>
              <div style={{ background: "var(--surface-3)", borderRadius: 4, height: 16 }}>
                <div style={{ width: `${(e.qtd / max) * 100}%`, background: "var(--accent)", height: "100%", borderRadius: 4, minWidth: e.qtd ? 2 : 0 }} />
              </div>
              <span style={{ color: "var(--text-1)" }}>{e.qtd} {avanco && <span style={{ color: "var(--text-4)" }}>· {avanco}</span>}</span>
            </div>
          )
        })}
      </div>
      {Object.keys(abandono).length > 0 && (
        <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>
          Abandono por etapa: {Object.entries(abandono).map(([k, v]) => `${k} (${v})`).join(" · ")}
        </p>
      )}
    </Cartao>
  )
}

function Leads({ p, lead, filtros, nomeCriativo, qs }: {
  p: Exclude<Awaited<ReturnType<typeof carregarPainelFunil>>, { erro: string }>; lead?: string
  filtros: { criativo?: string; interesse?: string; status?: string; qual?: string; reuniao?: string }
  nomeCriativo: (id: string | null) => string; qs: (e: Record<string, string>) => string
}) {
  const def = p.def
  const textoResp = (qid: string, oid: string) => def?.perguntas.find(q => q.id === qid)?.opcoes.find(o => o.id === oid)?.texto ?? oid
  let ls = p.leads
  if (filtros.criativo) ls = ls.filter(l => (l.criativo_id ?? "nenhum") === filtros.criativo)
  if (filtros.interesse) ls = ls.filter(l => (l.interesse ?? "nenhum") === filtros.interesse)
  if (filtros.status) ls = ls.filter(l => l.status_comercial === filtros.status)
  if (filtros.qual) ls = ls.filter(l => l.qualificacao === filtros.qual)
  if (filtros.reuniao) ls = ls.filter(l => (filtros.reuniao === "sem" ? !l.reuniao : l.reuniao?.status === filtros.reuniao))
  const aberto = lead ? p.leads.find(l => l.id === lead) : null
  const usuarioNome = (id: string | null) => p.usuarios.find(u => u.id === id)?.nome ?? "—"
  const filtro = (nome: string, valor: string | undefined, opcoes: [string, string][]) => (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
      <span style={{ color: "var(--text-4)" }}>{nome}:</span>
      <Link href={qs({ aba: "leads", [nome]: "" })} style={{ color: !valor ? "var(--accent)" : "var(--text-3)" }}>todos</Link>
      {opcoes.map(([v, r]) => <Link key={v} href={qs({ aba: "leads", [nome]: v })} style={{ color: valor === v ? "var(--accent)" : "var(--text-3)" }}>{r}</Link>)}
    </div>
  )
  return (
    <>
      <Cartao titulo={`Leads (${ls.length})`} subtitulo="Contatos identificados no período. Abra o lead para respostas, origem e status.">
        <div style={{ display: "grid", gap: 4 }}>
          {filtro("criativo", filtros.criativo, [...p.criativos.map(c => [c.id, c.codigo] as [string, string]), ["nenhum", "não identificado"]])}
          {filtro("interesse", filtros.interesse, [["marketing", "marketing"], ["sistema", "sistema"], ["ambos", "ambos"]])}
          {filtro("reuniao", filtros.reuniao, [["sem", "sem reunião"], ["solicitada", "a confirmar"], ["confirmada", "confirmada"], ["realizada", "realizada"], ["cancelada", "cancelada"]])}
          {filtro("qual", filtros.qual, Object.entries(ROTULO_QUALIFICACAO))}
          {filtro("status", filtros.status, Object.entries(ROTULO_STATUS_COMERCIAL))}
        </div>
        <Tabela cab={["Entrada", "Nome", "WhatsApp", "Interesse", "Classificação", "Criativo", "Campanha", "Status comercial", "Reunião", "Responsável", ""]} vazio="Nenhum lead com esses filtros."
          linhas={ls.map(l => [formatarDataHora(l.criado_em), l.nome + (l.ambiente === "teste" ? " (teste)" : ""), mascararTelefone(l.telefone_e164), l.interesse ?? "—",
            ROTULO_QUALIFICACAO[l.qualificacao], nomeCriativo(l.criativo_id), l.first_touch.campaign_id ?? l.first_touch.utm_campaign ?? "Não identificado",
            ROTULO_STATUS_COMERCIAL[l.status_comercial], l.reuniao ? `${ROTULO_STATUS[l.reuniao.status as StatusReuniao] ?? l.reuniao.status}${l.reuniao.inicio ? " · " + formatarDataHora(l.reuniao.inicio) : ""}` : "—",
            usuarioNome(l.responsavel_id), <Link key="a" href={qs({ aba: "leads", lead: l.id })} style={{ color: "var(--accent)" }}>Abrir</Link>])} />
            </Cartao>
      {aberto && (
        <Cartao titulo={`Lead: ${aberto.nome}`} subtitulo={`Entrou em ${formatarDataHora(aberto.criado_em)} · ${aberto.sessoes} sessão(ões)`}
          acoes={<><a className="no-ds" href={`https://wa.me/${aberto.telefone_e164.slice(1)}`} target="_blank" rel="noopener" style={{ fontSize: 12, color: "var(--text-1)" }}>WhatsApp ↗</a>
            {aberto.reuniao?.tarefa_id && <Link href={`/dashboard/workspace/calendario?tarefa=${aberto.reuniao.tarefa_id}`} style={{ fontSize: 12, color: "var(--text-1)" }}>Abrir tarefa da reunião</Link>}
            {aberto.crm_lead_id && <Link href="/dashboard/crm" style={{ fontSize: 12, color: "var(--text-1)" }}>Ver no CRM</Link>}</>}>
          <Tabela cab={["Campo", "Valor"]} linhas={[
            ["WhatsApp", mascararTelefone(aberto.telefone_e164)], ["E-mail", aberto.email ?? "—"], ["Instagram", aberto.instagram ? "@" + aberto.instagram : "—"],
            ...Object.entries(aberto.respostas).map(([q, o]) => [def?.perguntas.find(x => x.id === q)?.texto ?? q, textoResp(q, o)]),
            ["Interesse principal", aberto.interesse ?? "—"], ["Pontuação", aberto.pontuacao?.toString() ?? "—"],
            ["1º toque", resumoToque(aberto.first_touch)], ["Último toque", resumoToque(aberto.last_touch)],
            ["Criativo", nomeCriativo(aberto.criativo_id)],
          ]} />
          <LeadAcoes funilId={p.funil.id} lead={{ id: aberto.id, qualificacao: aberto.qualificacao, status_comercial: aberto.status_comercial, valor_venda: aberto.valor_venda }} />
          <Tabela cab={["Quando", "Campo", "De", "Para", "Por"]} vazio="Sem alterações manuais."
            linhas={p.historico.filter(h => h.lead_id === aberto.id).map(h => [formatarDataHora(h.em), h.campo, h.de ?? "—", h.para ?? "—", usuarioNome(h.ator_id)])} />
        </Cartao>
      )}
    </>
  )
}

function resumoToque(t: Record<string, string>): string {
  if (!t || !Object.keys(t).length) return "Acesso direto / não identificado"
  const partes = [t.utm_source ?? t.site_source_name, t.placement, t.campaign_id && `campanha ${t.campaign_id}`, t.adset_id && `conjunto ${t.adset_id}`, t.ad_id && `anúncio ${t.ad_id}`, t.referer_host && `via ${t.referer_host}`].filter(Boolean)
  return partes.join(" · ") || "Não identificado"
}
