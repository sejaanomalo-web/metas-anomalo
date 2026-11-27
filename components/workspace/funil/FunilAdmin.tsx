"use client"

import { useEffect, useMemo, useState } from "react"
import {
  atualizarLeadFunilAction, descartarRascunhoAction, excluirCriativoAction, gerarLinkPreviaAction, publicarRascunhoAction,
  reprocessarConversoesAction, salvarCanalFunilAction, salvarConfigFunilAction, salvarCriativoAction, salvarInvestimentoAction, salvarRascunhoAction,
} from "@/lib/funil-estaticos-actions"
import {
  APRESENTACAO_PADRAO, IDENTIDADES_VISUAIS, PARAMS_ATRIBUICAO, ROTULO_QUALIFICACAO, ROTULO_STATUS_COMERCIAL, validarDefinicao,
  type DefinicaoFunil, type Pergunta,
} from "@/lib/funil-estaticos-nucleo"
import { paginaFunil } from "@/lib/funil-estaticos-pagina"
import { BotaoCopiar, Cartao, estiloBotao, estiloCampo, Mensagem, Rotulo, useAcao } from "@/components/workspace/reunioes/ui"

const grade: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }
const Check = ({ nome, padrao, texto }: { nome: string; padrao: boolean; texto: string }) => (
  <label style={{ fontSize: 12, color: "var(--text-2)", display: "flex", gap: 6, alignItems: "center" }}>
    <input type="checkbox" name={nome} value="1" defaultChecked={padrao} /> {texto}
  </label>
)

// ---------------------------------------------------------------- configurações
type ConfigFunil = {
  id: string; nome: string; slug: string; ativo: boolean; privacidade_url: string | null; consentimento_modo: string; pixel_id: string | null
  capi_ativo: boolean; meta_test_event_code: string | null; eventos_meta: Record<string, boolean>; abandono_minutos: number
  followup_ativo: boolean; followup_minutos: number; notificar_novo_lead: boolean; crm_usuario_id: string | null; crm_empresa_slug: string | null
  qualificacao: { ativo?: boolean; alta?: number; media?: number }; retencao_dias: number; slugs_anteriores: string[]
}
export function FormConfigFunil({ funil: f, usuarios, empresasCrm, urlBase }: { funil: ConfigFunil; usuarios: { id: string; nome: string }[]; empresasCrm: string[]; urlBase: string }) {
  const { pendente, resultado, rodar } = useAcao()
  const [slug, setSlug] = useState(f.slug)
  const [dono, setDono] = useState(f.crm_usuario_id ?? "")
  const empresas = empresasCrm.filter(e => e.startsWith(dono + "|")).map(e => e.split("|")[1])
  return (
    <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); rodar(() => salvarConfigFunilAction(fd)) }} style={{ display: "grid", gap: 14 }}>
      <input type="hidden" name="funil_id" value={f.id} />
      <Cartao titulo="Publicação" subtitulo="Inativo: a URL mostra a mensagem de indisponível, sem expor nada interno. Alterações aparecem na URL em até 1 minuto (cache da CDN).">
        <Check nome="ativo" padrao={f.ativo} texto="Funil ativo (publicado)" />
        <div style={grade}>
          <Rotulo texto="Nome interno"><input name="nome" defaultValue={f.nome} maxLength={80} style={estiloCampo} /></Rotulo>
          <Rotulo texto="Endereço (slug)" dica={`${urlBase}/funil/${slug}`}><input name="slug" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} maxLength={60} style={estiloCampo} /></Rotulo>
          <Rotulo texto="Política de privacidade (URL https)" dica="Obrigatória para publicar (LGPD)."><input name="privacidade_url" type="url" defaultValue={f.privacidade_url ?? ""} placeholder="https://…" style={estiloCampo} /></Rotulo>
        </div>
        {slug !== f.slug && <Check nome="confirmar_slug" padrao={false} texto={`Confirmo a troca. /funil/${f.slug} continuará redirecionando para o novo endereço.`} />}
        {f.slugs_anteriores?.length > 0 && <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Endereços antigos que redirecionam: {f.slugs_anteriores.join(", ")}</p>}
      </Cartao>
      <Cartao titulo="Tracking Meta" subtitulo="Conjunto de dados próprio da ANÔMALO (não reutiliza o da ATIVO). O token da CAPI fica só no servidor (variável FUNIL_ESTATICOS_META_CAPI_TOKEN).">
        <div style={grade}>
          <Rotulo texto="ID do conjunto de dados (Pixel)"><input name="pixel_id" defaultValue={f.pixel_id ?? ""} inputMode="numeric" style={estiloCampo} /></Rotulo>
          <Rotulo texto="Código de teste (Gerenciador de Eventos)" dica="Usado em prévia/ambientes não-produção."><input name="meta_test_event_code" defaultValue={f.meta_test_event_code ?? ""} style={estiloCampo} /></Rotulo>
          <Rotulo texto="Consentimento">
            <select name="consentimento_modo" defaultValue={f.consentimento_modo} style={estiloCampo}>
              <option value="opt_in">Opt-in: medir só após o visitante aceitar</option>
              <option value="informativo">Informativo: medir com aviso (avalie com seu jurídico)</option>
            </select>
          </Rotulo>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Check nome="capi_ativo" padrao={f.capi_ativo} texto="Enviar pela Conversions API" />
          <Check nome="ev_pageview" padrao={f.eventos_meta?.PageView ?? true} texto="PageView" />
          <Check nome="ev_lead" padrao={f.eventos_meta?.Lead ?? true} texto="Lead (após salvar o contato)" />
          <Check nome="ev_schedule" padrao={f.eventos_meta?.Schedule ?? true} texto="Schedule (após reserva confirmada)" />
        </div>
      </Cartao>
      <Cartao titulo="Automação e CRM">
        <div style={grade}>
          <Rotulo texto="Abandono após (min sem atividade)"><input name="abandono_minutos" type="number" min={5} max={1440} defaultValue={f.abandono_minutos} style={estiloCampo} /></Rotulo>
          <Rotulo texto="Follow-up após (min sem agendar)"><input name="followup_minutos" type="number" min={10} max={10080} defaultValue={f.followup_minutos} style={estiloCampo} /></Rotulo>
          <Rotulo texto="Retenção de dados (dias)"><input name="retencao_dias" type="number" min={90} max={3650} defaultValue={f.retencao_dias} style={estiloCampo} /></Rotulo>
          <Rotulo texto="Espelhar leads no CRM de" dica="O CRM é isolado por usuário: o lead aparece só para esse dono.">
            <select name="crm_usuario_id" value={dono} onChange={e => setDono(e.target.value)} style={estiloCampo}>
              <option value="">Não espelhar</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Rotulo>
          {dono && (
            <Rotulo texto="Empresa no CRM" dica={empresas.length ? "" : "Esse usuário não tem número conectado no CRM."}>
              <select name="crm_empresa_slug" defaultValue={f.crm_empresa_slug ?? empresas[0] ?? ""} style={estiloCampo}>
                {empresas.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </Rotulo>
          )}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Check nome="followup_ativo" padrao={f.followup_ativo} texto="Criar tarefa de follow-up para quem não agendou" />
          <Check nome="notificar_novo_lead" padrao={f.notificar_novo_lead} texto="Notificar novo lead (sino)" />
        </div>
      </Cartao>
      <Cartao titulo="Qualificação" subtitulo="Pontos por alternativa são definidos no Formulário. Nada é excluído automaticamente; a equipe revisa manualmente.">
        <Check nome="qual_ativo" padrao={f.qualificacao?.ativo ?? false} texto="Classificar automaticamente por pontuação" />
        <div style={grade}>
          <Rotulo texto="Alta prioridade a partir de"><input name="qual_alta" type="number" defaultValue={f.qualificacao?.alta ?? 6} style={estiloCampo} /></Rotulo>
          <Rotulo texto="Média prioridade a partir de"><input name="qual_media" type="number" defaultValue={f.qualificacao?.media ?? 3} style={estiloCampo} /></Rotulo>
        </div>
      </Cartao>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="submit" className="no-ds" disabled={pendente} style={estiloBotao("principal", pendente)}>{pendente ? "Salvando…" : "Salvar configurações"}</button>
        <Mensagem r={resultado} />
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- agenda
export function FormCanalFunil({ funilId, canal, tipos, disponibilidades, usuarios }: {
  funilId: string; canal: { tipo_id: string; disponibilidade_id: string; ativo: boolean; exclusividade_verificada_em: string | null } | null
  tipos: { id: string; nome: string; duracao_min: number; antecedencia_min_horas: number; horizonte_dias: number; responsavel_id: string | null; ativo: boolean; origem_comercial: string }[]
  disponibilidades: { id: string; nome: string; modo_nativo: boolean; responsavel_id: string | null; fuso: string }[]
  usuarios: { id: string; nome: string }[]
}) {
  const { pendente, resultado, rodar } = useAcao()
  const [tipoId, setTipoId] = useState(canal?.tipo_id ?? tipos.find(t => /diagn/i.test(t.nome))?.id ?? "")
  const nativas = disponibilidades.filter(d => d.modo_nativo)
  const tipo = tipos.find(t => t.id === tipoId)
  const nome = (id: string | null) => usuarios.find(u => u.id === id)?.nome ?? "—"
  return (
    <Cartao titulo="Agendamento — agenda nativa do Workspace" subtitulo="Fonte de verdade: Reuniões → Tipos de reunião e Disponibilidade. O funil não tem agenda própria.">
      <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>
        Horários = janelas, períodos, exceções e bloqueios da agenda nativa escolhida, menos reuniões já existentes do responsável (Cal.com, ATIVO e este funil), tarefas com bloqueio de agenda, antecedência, horizonte e limite diário do tipo.
        A reserva é reconferida no banco com lock por responsável e constraint de não sobreposição compartilhada com o canal ATIVO.
      </p>
      {nativas.length === 0 && <p style={{ fontSize: 12, color: "#C9953A", margin: 0 }}>Não há agenda nativa. Crie em Reuniões → Tipos de reunião → “Criar agenda nativa” e configure em Disponibilidade.</p>}
      <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); rodar(() => salvarCanalFunilAction(fd)) }} style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="funil_id" value={funilId} />
        <div style={grade}>
          <Rotulo texto="Tipo de reunião (diagnóstico)">
            <select name="tipo_id" value={tipoId} onChange={e => setTipoId(e.target.value)} style={estiloCampo}>
              <option value="">Selecione…</option>
              {tipos.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome} · {t.duracao_min} min</option>)}
            </select>
          </Rotulo>
          <Rotulo texto="Agenda nativa">
            <select name="disponibilidade_id" defaultValue={canal?.disponibilidade_id ?? ""} style={estiloCampo}>
              <option value="">Selecione…</option>
              {nativas.map(d => <option key={d.id} value={d.id}>{d.nome} · {nome(d.responsavel_id)}</option>)}
            </select>
          </Rotulo>
        </div>
        {tipo && <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>
          Duração {tipo.duracao_min} min · horários a cada 15 min · antecedência {tipo.antecedencia_min_horas} h · horizonte {tipo.horizonte_dias} dias · responsável {nome(tipo.responsavel_id)}. Atribuição: responsável único do tipo/agenda (regra atual do Workspace).
        </p>}
        <Check nome="exclusividade_verificada" padrao={false} texto="Confirmo que nenhuma das contas Cal.com oferece estas mesmas janelas para o mesmo responsável." />
        <Check nome="ativo" padrao={canal?.ativo ?? false} texto="Agenda do funil ativa" />
        <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>
          Qualquer mudança no tipo ou na agenda (inclusive pela tela de Disponibilidade) desativa o canal automaticamente até nova confirmação — mesma proteção do canal ATIVO.
          {canal?.exclusividade_verificada_em ? ` Última verificação: ${new Date(canal.exclusividade_verificada_em).toLocaleString("pt-BR")}.` : ""}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" className="no-ds" disabled={pendente} style={estiloBotao("principal", pendente)}>Salvar agenda do funil</button>
          <Mensagem r={resultado} />
        </div>
      </form>
    </Cartao>
  )
}

// ---------------------------------------------------------------- editor do formulário
export function EditorFormularioFunil({ funilId, urlPublica, publicada, rascunho, historico }: {
  funilId: string; urlPublica: string
  publicada: { id: string; numero: number; definicao: unknown } | null
  rascunho: { id: string; numero: number; definicao: unknown } | null
  historico: { id: string; numero: number; status: string; publicada_em: string | null; criado_em: string }[]
}) {
  const inicial = (rascunho?.definicao ?? publicada?.definicao) as DefinicaoFunil
  const [def, setDef] = useState<DefinicaoFunil>(() => JSON.parse(JSON.stringify(inicial)))
  const [largura, setLargura] = useState<"mobile" | "desktop">("mobile")
  const { pendente, resultado, rodar } = useAcao()
  const erros = useMemo(() => validarDefinicao(def), [def])
  const set = (fn: (d: DefinicaoFunil) => void) => setDef(d => { const c = JSON.parse(JSON.stringify(d)) as DefinicaoFunil; fn(c); return c })
  const fd = () => { const x = new FormData(); x.set("funil_id", funilId); x.set("definicao", JSON.stringify(def)); return x }
  const slugId = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "item"
  const mover = (i: number, d: number) => set(c => { const j = i + d; if (j < 0 || j >= c.perguntas.length) return; [c.perguntas[i], c.perguntas[j]] = [c.perguntas[j], c.perguntas[i]] })
  const textos: [keyof DefinicaoFunil["textos"], string][] = [["titulo", "Título de abertura (só no início direto, sem apresentação)"], ["subtitulo", "Texto de abertura (só no início direto)"],
    ["contato_titulo", "Título da identificação"], ["contato_subtitulo", "Texto da identificação"], ["contato_cta", "Botão da identificação"],
    ["agenda_titulo", "Título da agenda"], ["agenda_subtitulo", "Texto da agenda"], ["agenda_cta", "Botão de confirmar horário"], ["sem_horarios", "Sem horários"],
    ["confirmacao_titulo", "Título da confirmação"], ["confirmacao_texto", "Texto da confirmação"], ["inativo", "Mensagem com funil inativo"]]
  const ap = def.apresentacao
  const moverBeneficio = (i: number, d: number) => set(c => { const b = c.apresentacao!.beneficios; const j = i + d; if (j < 0 || j >= b.length) return; [b[i], b[j]] = [b[j], b[i]] })
  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", alignItems: "start" }}>
      <div style={{ display: "grid", gap: 14 }}>
        <Cartao titulo={rascunho ? `Rascunho (versão ${rascunho.numero})` : `Editando a partir da versão publicada ${publicada?.numero ?? ""}`}
          subtitulo="Salvar cria/atualiza o rascunho. Publicar troca a versão do funil; versões antigas ficam guardadas para interpretar respostas antigas."
          acoes={<>
            <button type="button" className="no-ds" disabled={pendente || erros.length > 0} style={estiloBotao("neutro", pendente || erros.length > 0)} onClick={() => rodar(() => salvarRascunhoAction(fd()))}>Salvar rascunho</button>
            {rascunho && <BotaoPrevia funilId={funilId} versaoId={rascunho.id} base={urlPublica} rotulo="Ver versão de teste" />}
            {rascunho && <button type="button" className="no-ds" disabled={pendente} style={estiloBotao("principal", pendente)} onClick={() => { if (window.confirm("Publicar o rascunho salvo como nova versão?")) rodar(() => publicarRascunhoAction(fd())) }}>Publicar</button>}
            {rascunho && <button type="button" className="no-ds" disabled={pendente} style={estiloBotao("perigo", pendente)} onClick={() => rodar(() => descartarRascunhoAction(fd()))}>Descartar</button>}
          </>}>
          <Mensagem r={resultado} />
          {erros.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "#e24b4a" }}>{erros.slice(0, 8).map(e => <li key={e}>{e}</li>)}</ul>}
          <label style={{ fontSize: 12, color: "var(--text-2)", display: "flex", gap: 6 }}>
            <input type="checkbox" checked={def.avanco_automatico} onChange={e => set(c => { c.avanco_automatico = e.target.checked })} /> Avançar automaticamente ao escolher
          </label>
          <Rotulo texto="Identidade visual da página">
            <select value={def.visual ?? "escuro"} onChange={e => set(c => { c.visual = e.target.value as never })} style={estiloCampo}>
              {IDENTIDADES_VISUAIS.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </Rotulo>
          <div style={grade}>
            <Rotulo texto="Campo e-mail"><select value={def.contato.email} onChange={e => set(c => { c.contato.email = e.target.value as never })} style={estiloCampo}><option value="oculto">Oculto</option><option value="opcional">Opcional</option><option value="obrigatorio">Obrigatório</option></select></Rotulo>
            <Rotulo texto="Campo Instagram"><select value={def.contato.instagram} onChange={e => set(c => { c.contato.instagram = e.target.value as never })} style={estiloCampo}><option value="oculto">Oculto</option><option value="opcional">Opcional</option></select></Rotulo>
          </div>
        </Cartao>
        <Cartao titulo="Tela inicial de apresentação" subtitulo="Etapa 00: apresentação comercial antes da 1ª pergunta. Desligada, o formulário abre direto na 1ª pergunta (versão anterior). Faz parte da versão: salve e publique como as perguntas.">
          <label style={{ fontSize: 12, color: "var(--text-1)", display: "flex", gap: 6, fontWeight: 600 }}>
            <input type="checkbox" checked={ap?.ativo === true} onChange={e => set(c => {
              if (!c.apresentacao) c.apresentacao = JSON.parse(JSON.stringify(APRESENTACAO_PADRAO))
              c.apresentacao!.ativo = e.target.checked
            })} /> Mostrar a tela inicial de apresentação
          </label>
          {ap && (
            <div style={{ display: "grid", gap: 10, opacity: ap.ativo ? 1 : 0.6 }}>
              <Rotulo texto="Texto de identificação (acima da headline)"><input value={ap.identificacao} maxLength={80} onChange={e => set(c => { c.apresentacao!.identificacao = e.target.value })} style={estiloCampo} /></Rotulo>
              <Rotulo texto="Headline"><textarea value={ap.headline} maxLength={160} rows={2} onChange={e => set(c => { c.apresentacao!.headline = e.target.value })} style={{ ...estiloCampo, resize: "vertical" }} /></Rotulo>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>Benefícios (até 6; o destaque aparece em negrito)</span>
                {ap.beneficios.map((b, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "56px minmax(0,1fr) minmax(0,1.3fr) auto", gap: 6, alignItems: "end" }}>
                    <Rotulo texto="Emoji"><input value={b.emoji} maxLength={8} aria-label={`Emoji do benefício ${i + 1}`} onChange={e => set(c => { c.apresentacao!.beneficios[i].emoji = e.target.value })} style={{ ...estiloCampo, textAlign: "center" }} /></Rotulo>
                    <Rotulo texto="Destaque"><input value={b.destaque} maxLength={60} onChange={e => set(c => { c.apresentacao!.beneficios[i].destaque = e.target.value })} style={estiloCampo} /></Rotulo>
                    <Rotulo texto="Complemento"><input value={b.texto} maxLength={120} onChange={e => set(c => { c.apresentacao!.beneficios[i].texto = e.target.value })} style={estiloCampo} /></Rotulo>
                    <span style={{ display: "flex", gap: 4 }}>
                      <button type="button" className="no-ds" style={estiloBotao()} onClick={() => moverBeneficio(i, -1)} aria-label="Mover benefício para cima">↑</button>
                      <button type="button" className="no-ds" style={estiloBotao()} onClick={() => moverBeneficio(i, 1)} aria-label="Mover benefício para baixo">↓</button>
                      <button type="button" className="no-ds" style={estiloBotao("perigo")} onClick={() => set(c => { c.apresentacao!.beneficios.splice(i, 1) })} aria-label="Remover benefício">✕</button>
                    </span>
                  </div>
                ))}
                {ap.beneficios.length < 6 && <div><button type="button" className="no-ds" style={estiloBotao()} onClick={() => set(c => { c.apresentacao!.beneficios.push({ emoji: "✅", destaque: "Novo benefício", texto: "" }) })}>+ Benefício</button></div>}
              </div>
              <Rotulo texto="Texto complementar"><textarea value={ap.complemento} maxLength={300} rows={2} onChange={e => set(c => { c.apresentacao!.complemento = e.target.value })} style={{ ...estiloCampo, resize: "vertical" }} /></Rotulo>
              <div style={grade}>
                <Rotulo texto="Botão (CTA)" dica="Aparece em maiúsculas, com →."><input value={ap.cta} maxLength={60} onChange={e => set(c => { c.apresentacao!.cta = e.target.value })} style={estiloCampo} /></Rotulo>
                <Rotulo texto="Rodapé" dica="O link da política vem de Configurações."><input value={ap.rodape} maxLength={160} onChange={e => set(c => { c.apresentacao!.rodape = e.target.value })} style={estiloCampo} /></Rotulo>
              </div>
              <div><button type="button" className="no-ds" style={estiloBotao()} onClick={() => set(c => { c.apresentacao = { ...JSON.parse(JSON.stringify(APRESENTACAO_PADRAO)), ativo: c.apresentacao?.ativo ?? true } })}>Restaurar textos padrão</button></div>
            </div>
          )}
        </Cartao>
        {def.perguntas.map((p, i) => (
          <Cartao key={i} titulo={`Pergunta ${String(i + 1).padStart(2, "0")}`} subtitulo={`id: ${p.id}`}
            acoes={<>
              <button type="button" className="no-ds" style={estiloBotao()} onClick={() => mover(i, -1)} aria-label="Mover para cima">↑</button>
              <button type="button" className="no-ds" style={estiloBotao()} onClick={() => mover(i, 1)} aria-label="Mover para baixo">↓</button>
              <button type="button" className="no-ds" style={estiloBotao("perigo")} onClick={() => set(c => { c.perguntas.splice(i, 1) })}>Remover</button>
            </>}>
            <Rotulo texto="Pergunta"><input value={p.texto} maxLength={200} onChange={e => set(c => { c.perguntas[i].texto = e.target.value })} style={estiloCampo} /></Rotulo>
            <Rotulo texto="Objetivo interno"><input value={p.objetivo ?? ""} maxLength={300} onChange={e => set(c => { c.perguntas[i].objetivo = e.target.value })} style={estiloCampo} /></Rotulo>
            {p.opcoes.map((o, j) => (
              <div key={j} style={{ display: "grid", gridTemplateColumns: "1fr 70px 110px auto", gap: 6, alignItems: "end" }}>
                <Rotulo texto={`Alternativa ${j + 1} (id: ${o.id})`}><input value={o.texto} maxLength={160} onChange={e => set(c => { c.perguntas[i].opcoes[j].texto = e.target.value })} style={estiloCampo} /></Rotulo>
                <Rotulo texto="Pontos"><input type="number" min={-10} max={10} value={o.pontos ?? 0} onChange={e => set(c => { c.perguntas[i].opcoes[j].pontos = Math.trunc(Number(e.target.value)) || 0 })} style={estiloCampo} /></Rotulo>
                <Rotulo texto="Interesse"><select value={o.interesse ?? ""} onChange={e => set(c => { c.perguntas[i].opcoes[j].interesse = (e.target.value || null) as never })} style={estiloCampo}><option value="">—</option><option value="marketing">Marketing</option><option value="sistema">Sistema</option><option value="ambos">Ambos</option></select></Rotulo>
                <button type="button" className="no-ds" style={estiloBotao("perigo")} onClick={() => set(c => { c.perguntas[i].opcoes.splice(j, 1) })} aria-label="Remover alternativa">✕</button>
              </div>
            ))}
            <button type="button" className="no-ds" style={estiloBotao()} onClick={() => set(c => { const t = "Nova alternativa"; let id = slugId(t); let k = 2; while (c.perguntas[i].opcoes.some(x => x.id === id)) id = `${slugId(t)}_${k++}`; c.perguntas[i].opcoes.push({ id, texto: t, pontos: 0 }) })}>+ Alternativa</button>
          </Cartao>
        ))}
        <button type="button" className="no-ds" style={estiloBotao()} onClick={() => set(c => { let k = c.perguntas.length + 1; while (c.perguntas.some(p => p.id === `pergunta_${k}`)) k++; c.perguntas.push({ id: `pergunta_${k}`, texto: "Nova pergunta", opcoes: [{ id: "a", texto: "Alternativa A", pontos: 0 }, { id: "b", texto: "Alternativa B", pontos: 0 }] } as Pergunta) })}>+ Pergunta</button>
        <Cartao titulo="Textos públicos">
          {textos.map(([k, r]) => (
            <Rotulo key={k} texto={r}><textarea value={def.textos[k] ?? ""} maxLength={k === "agenda_cta" ? 60 : 400} rows={k.length > 12 ? 3 : 2} onChange={e => set(c => { c.textos[k] = e.target.value })} style={{ ...estiloCampo, resize: "vertical" }} /></Rotulo>
          ))}
        </Cartao>
        <Cartao titulo="Histórico de versões">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-2)", display: "grid", gap: 3 }}>
            {historico.map(v => <li key={v.id}>v{v.numero} · {v.status}{v.publicada_em ? ` · publicada ${new Date(v.publicada_em).toLocaleString("pt-BR")}` : ` · criada ${new Date(v.criado_em).toLocaleString("pt-BR")}`}</li>)}
          </ul>
        </Cartao>
      </div>
      <Cartao titulo="Pré-visualização" subtitulo="É a página real (mesmo HTML e script) rodando sem rede: nada é enviado nem salvo e a agenda mostra horários de exemplo. Para testar com a agenda de verdade, use a versão de teste."
        acoes={<>
          <button type="button" className="no-ds" style={estiloBotao(largura === "mobile" ? "principal" : "neutro")} onClick={() => setLargura("mobile")}>Mobile</button>
          <button type="button" className="no-ds" style={estiloBotao(largura === "desktop" ? "principal" : "neutro")} onClick={() => setLargura("desktop")}>Desktop</button>
        </>}>
        <Previa def={def} largura={largura} erros={erros.length} />
      </Cartao>
    </div>
  )
}

function Previa({ def, largura, erros }: { def: DefinicaoFunil; largura: "mobile" | "desktop"; erros: number }) {
  // Atualiza 400 ms depois da última edição (evita recarregar o iframe a cada tecla).
  const [html, setHtml] = useState("")
  useEffect(() => {
    if (erros) return
    const t = setTimeout(() => setHtml(paginaFunil({
      slug: "previa", nome: "Pré-visualização", versaoId: "previa", def, api: "", privacidadeUrl: "https://example.com/privacidade",
      consentimentoModo: "opt_in", pixelId: null, eventosMeta: {}, previa: null, demo: true,
    })), 400)
    return () => clearTimeout(t)
  }, [def, erros])
  const w = largura === "mobile" ? 390 : 1100
  const h = largura === "mobile" ? 780 : 720
  return (
    <div style={{ overflowX: "auto" }}>
      {erros > 0 && <p style={{ fontSize: 11, color: "#e24b4a", margin: "0 0 6px" }}>Corrija os erros acima para atualizar a pré-visualização.</p>}
      <iframe title="Pré-visualização do funil" srcDoc={html} sandbox="allow-scripts allow-forms" width={w} height={h}
        style={{ display: "block", margin: "0 auto", border: "1px solid var(--surface-3)", borderRadius: largura === "mobile" ? 24 : 10, background: "#fff", maxWidth: largura === "mobile" ? "100%" : "none" }} />
      <p style={{ fontSize: 11, color: "var(--text-4)", margin: "6px 0 0", textAlign: "center" }}>{largura === "mobile" ? "390 × 780 (iPhone 13/14)" : "1100 × 720"} · o link da política na prévia é ilustrativo</p>
    </div>
  )
}

export function BotaoPrevia({ funilId, versaoId, base, rotulo, modo = "funcional" }: { funilId: string; versaoId: string; base: string; rotulo: string; modo?: "funcional" | "diagnostico_capi" }) {
  const [carregando, setCarregando] = useState(false)
  return (
    <button type="button" className="no-ds" disabled={carregando} style={estiloBotao("neutro", carregando)} onClick={async () => {
      setCarregando(true)
      const janela = window.open("about:blank", "_blank")
      const r = await gerarLinkPreviaAction(funilId, versaoId, modo)
      setCarregando(false)
      if (r.ok && r.token && janela) janela.location.href = `${base}?previa=${encodeURIComponent(r.token)}`
      else { janela?.close(); window.alert(r.erro ?? "Não foi possível gerar o link de teste.") }
    }}>{carregando ? "Gerando…" : rotulo}</button>
  )
}

export function BotaoReprocessar({ funilId }: { funilId: string }) {
  const { pendente, resultado, rodar } = useAcao()
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button type="button" className="no-ds" disabled={pendente} style={estiloBotao("neutro", pendente)} onClick={() => { const fd = new FormData(); fd.set("funil_id", funilId); rodar(() => reprocessarConversoesAction(fd)) }}>Reprocessar fila</button>
      <Mensagem r={resultado} />
    </span>
  )
}

// ---------------------------------------------------------------- URLs e criativos
export function GeradorUrl({ base, parametros, criativos }: { base: string; parametros: string; criativos: { codigo: string; nome: string }[] }) {
  const [codigo, setCodigo] = useState("")
  const [extra, setExtra] = useState<Record<string, string>>({})
  const url = useMemo(() => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(extra)) if (v.trim()) q.set(k, v.trim())
    if (codigo) q.set("creative_id", codigo)
    const s = q.toString()
    return s ? `${base}?${s}` : base
  }, [base, codigo, extra])
  return (
    <Cartao titulo="Gerador de URL e parâmetros do anúncio" subtitulo="Todos os anúncios (hoje 12 criativos estáticos) usam a MESMA URL de destino. Cole os parâmetros abaixo no campo “Parâmetros de URL” de cada anúncio.">
      <Rotulo texto="Parâmetros de URL (Meta Ads)"><code style={{ fontSize: 11, wordBreak: "break-all", color: "var(--text-1)" }}>{parametros}</code></Rotulo>
      <div><BotaoCopiar texto={parametros} rotulo="Copiar parâmetros" /></div>
      <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Para identificação manual do conceito, acrescente <code>&creative_id=E01</code> (E02…E12) nos parâmetros de cada anúncio. A atribuição usa primeiro o ad_id cadastrado e depois o código.</p>
      <div style={grade}>
        <Rotulo texto="Criativo (creative_id)">
          <select value={codigo} onChange={e => setCodigo(e.target.value)} style={estiloCampo}>
            <option value="">—</option>{criativos.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nome}</option>)}
          </select>
        </Rotulo>
        {(["utm_source", "utm_medium", "utm_campaign"] as const).map(k => (
          <Rotulo key={k} texto={k}><input value={extra[k] ?? ""} onChange={e => setExtra({ ...extra, [k]: e.target.value })} style={estiloCampo} /></Rotulo>
        ))}
      </div>
      <code style={{ fontSize: 11, wordBreak: "break-all", color: "var(--text-1)" }}>{url}</code>
      <div><BotaoCopiar texto={url} rotulo="Copiar URL de teste" /></div>
      <p style={{ fontSize: 10, color: "var(--text-4)", margin: 0 }}>Parâmetros aceitos: {PARAMS_ATRIBUICAO.join(", ")}.</p>
    </Cartao>
  )
}

type Criativo = { id: string; codigo: string; nome: string; hipotese: string | null; miniatura_url: string | null; meta_ad_id: string | null; status: string; inicio_em: string | null }
export function GerirCriativos({ funilId, criativos }: { funilId: string; criativos: Criativo[] }) {
  const { pendente, resultado, rodar } = useAcao()
  const [editando, setEditando] = useState<Criativo | null>(null)
  const proximo = `E${String(criativos.length + 1).padStart(2, "0")}`
  const vazio: Criativo = { id: "", codigo: proximo, nome: "", hipotese: null, miniatura_url: null, meta_ad_id: null, status: "ativo", inicio_em: null }
  const c = editando ?? vazio
  return (
    <Cartao titulo="Criativos" subtitulo="Associe cada código (E01–E12; pode cadastrar mais) ao ID real do anúncio — não dependa do nome, que pode mudar.">
      <div style={{ display: "grid", gap: 6 }}>
        {criativos.map(x => (
          <div key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, flexWrap: "wrap" }}>
            {x.miniatura_url && <img src={x.miniatura_url} alt="" width={32} height={32} style={{ objectFit: "cover", borderRadius: 4 }} />}
            <strong style={{ color: "var(--text-1)" }}>{x.codigo}</strong><span style={{ color: "var(--text-2)" }}>{x.nome}</span>
            <span style={{ color: "var(--text-4)" }}>{x.meta_ad_id ? `ad ${x.meta_ad_id}` : "sem ad_id"} · {x.status}</span>
            <button type="button" className="no-ds" style={estiloBotao()} onClick={() => setEditando(x)}>Editar</button>
            <button type="button" className="no-ds" style={estiloBotao("perigo")} onClick={() => { const fd = new FormData(); fd.set("funil_id", funilId); fd.set("id", x.id); rodar(() => excluirCriativoAction(fd)) }}>Excluir</button>
          </div>
        ))}
      </div>
      <form key={c.id || "novo"} onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); rodar(() => salvarCriativoAction(fd)); setEditando(null) }} style={{ display: "grid", gap: 8 }}>
        <input type="hidden" name="funil_id" value={funilId} /><input type="hidden" name="id" value={c.id} />
        <div style={grade}>
          <Rotulo texto="Código"><input name="codigo" defaultValue={c.codigo} maxLength={20} style={estiloCampo} /></Rotulo>
          <Rotulo texto="Nome do conceito"><input name="nome" defaultValue={c.nome} maxLength={120} style={estiloCampo} /></Rotulo>
          <Rotulo texto="ID do anúncio na Meta"><input name="meta_ad_id" defaultValue={c.meta_ad_id ?? ""} inputMode="numeric" style={estiloCampo} /></Rotulo>
          <Rotulo texto="Miniatura (URL https)"><input name="miniatura_url" defaultValue={c.miniatura_url ?? ""} style={estiloCampo} /></Rotulo>
          <Rotulo texto="Início"><input name="inicio_em" type="date" defaultValue={c.inicio_em ?? ""} style={estiloCampo} /></Rotulo>
          <Rotulo texto="Status"><select name="status" defaultValue={c.status} style={estiloCampo}><option value="ativo">Ativo</option><option value="pausado">Pausado</option><option value="encerrado">Encerrado</option></select></Rotulo>
        </div>
        <Rotulo texto="Hipótese estratégica"><textarea name="hipotese" defaultValue={c.hipotese ?? ""} maxLength={1000} rows={2} style={{ ...estiloCampo, resize: "vertical" }} /></Rotulo>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" className="no-ds" disabled={pendente} style={estiloBotao("principal", pendente)}>{c.id ? "Salvar criativo" : "Adicionar criativo"}</button>
          {c.id && <button type="button" className="no-ds" style={estiloBotao()} onClick={() => setEditando(null)}>Cancelar</button>}
          <Mensagem r={resultado} />
        </div>
      </form>
    </Cartao>
  )
}

export function FormInvestimento({ funilId, criativos }: { funilId: string; criativos: { id: string; codigo: string }[] }) {
  const { pendente, resultado, rodar } = useAcao()
  return (
    <Cartao titulo="Lançar investimento (manual)" subtitulo="Use quando a conta de anúncios da ANÔMALO não estiver na Sentinela. Fonte registrada como 'manual'. Relançar a mesma data/criativo substitui.">
      <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); rodar(() => salvarInvestimentoAction(fd)) }} style={{ display: "grid", gap: 8 }}>
        <input type="hidden" name="funil_id" value={funilId} />
        <div style={grade}>
          <Rotulo texto="Data"><input name="data" type="date" required style={estiloCampo} /></Rotulo>
          <Rotulo texto="Criativo"><select name="criativo_id" style={estiloCampo}><option value="">Campanha (sem criativo)</option>{criativos.map(c => <option key={c.id} value={c.id}>{c.codigo}</option>)}</select></Rotulo>
          <Rotulo texto="Investimento (R$)"><input name="investimento" inputMode="decimal" required style={estiloCampo} /></Rotulo>
          <Rotulo texto="Impressões"><input name="impressoes" inputMode="numeric" style={estiloCampo} /></Rotulo>
          <Rotulo texto="Alcance"><input name="alcance" inputMode="numeric" style={estiloCampo} /></Rotulo>
          <Rotulo texto="Cliques no link"><input name="cliques_link" inputMode="numeric" style={estiloCampo} /></Rotulo>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" className="no-ds" disabled={pendente} style={estiloBotao("principal", pendente)}>Salvar</button>
          <Mensagem r={resultado} />
        </div>
      </form>
    </Cartao>
  )
}

export function LeadAcoes({ funilId, lead }: { funilId: string; lead: { id: string; qualificacao: string; status_comercial: string; valor_venda: number | null } }) {
  const { pendente, resultado, rodar } = useAcao()
  return (
    <form key={lead.id} onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); rodar(() => atualizarLeadFunilAction(fd)) }} style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="funil_id" value={funilId} /><input type="hidden" name="lead_id" value={lead.id} />
      <div style={grade}>
        <Rotulo texto="Classificação"><select name="qualificacao" defaultValue={lead.qualificacao} style={estiloCampo}>{Object.entries(ROTULO_QUALIFICACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Rotulo>
        <Rotulo texto="Status comercial"><select name="status_comercial" defaultValue={lead.status_comercial} style={estiloCampo}>{Object.entries(ROTULO_STATUS_COMERCIAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Rotulo>
        <Rotulo texto="Valor da venda (R$)" dica="Usado em receita/ROAS. Só preencha com venda real."><input name="valor_venda" inputMode="decimal" defaultValue={lead.valor_venda?.toString().replace(".", ",") ?? ""} style={estiloCampo} /></Rotulo>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="submit" className="no-ds" disabled={pendente} style={estiloBotao("principal", pendente)}>Salvar</button>
        <Mensagem r={resultado} />
      </div>
    </form>
  )
}
