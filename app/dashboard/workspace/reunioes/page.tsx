import Link from "next/link"
import { requererPermissao } from "@/lib/auth"
import { getPreferencia, listarAbas } from "@/lib/workspace"
import { carregarPainelReunioes, COR_CONEXAO, ROTULO_CONEXAO } from "@/lib/reunioes"
import { ehAdminNoModulo } from "@/lib/acesso-admin"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import WorkspaceRealtime from "@/components/workspace/WorkspaceRealtime"
import DrawerServidor from "@/components/workspace/DrawerServidor"
import ListaReunioes from "@/components/workspace/reunioes/ListaReunioes"
import TiposReuniao from "@/components/workspace/reunioes/TiposReuniao"
import EditorDisponibilidade from "@/components/workspace/reunioes/EditorDisponibilidade"
import IntegracoesReunioes from "@/components/workspace/reunioes/IntegracoesReunioes"
import HistoricoReunioes from "@/components/workspace/reunioes/HistoricoReunioes"

export const dynamic = "force-dynamic"

type SP = Record<string, string | string[] | undefined>

const SECOES = [
  { id: "proximas", rotulo: "Próximas reuniões" },
  { id: "tipos", rotulo: "Tipos de reunião" },
  { id: "disponibilidade", rotulo: "Disponibilidade" },
  { id: "integracoes", rotulo: "Integrações" },
  { id: "historico", rotulo: "Histórico" },
] as const
type Secao = (typeof SECOES)[number]["id"]

/**
 * Reuniões — central dos agendamentos comerciais vindos do Cal.com.
 *
 * Não é um segundo calendário: cada reserva já vira uma tarefa normal no
 * Calendário do Workspace. Aqui ficam a lista de reuniões, os tipos (os links
 * das campanhas), a disponibilidade publicada no Cal.com, a conexão e o
 * histórico de sincronização.
 *
 * Quem tem Workspace vê. Só admin altera (checado de novo em cada action).
 */
export default async function ReunioesPage({ searchParams }: { searchParams: SP }) {
  const usuario = await requererPermissao("workspace")
  // Admin REAL (papel no banco) com o Workspace visível — vale também numa
  // visão simplificada. As actions checam de novo.
  const souAdmin = ehAdminNoModulo(usuario, "workspace")
  const bruto = Array.isArray(searchParams.secao) ? searchParams.secao[0] : searchParams.secao
  const secao: Secao = SECOES.some((s) => s.id === bruto) ? (bruto as Secao) : "proximas"
  const tarefaAberta = Array.isArray(searchParams.tarefa) ? searchParams.tarefa[0] : searchParams.tarefa

  const [abas, pref, painel] = await Promise.all([
    listarAbas(),
    getPreferencia(usuario.id),
    carregarPainelReunioes({ comEventTypes: secao === "tipos" && souAdmin, verDetalhesTecnicos: souAdmin }),
  ])
  const integ = painel.integracao
  const aguardando = painel.pendencias.length + painel.eventosComErro
  // Mais de uma conta do Cal.com (migration 20261113 aplicada): o cabeçalho
  // mostra uma bolinha por conta e cada tipo/disponibilidade diz a sua.
  const contasTela = painel.integracoes.length > 0 ? painel.integracoes : [integ]
  const variasContas = contasTela.length > 1
  const contas = contasTela.map((c) => ({ id: c.id, rotulo: c.rotulo, pronta: c.env.apiKey && c.estado !== "desconectado" }))
  const contaPorId = new Map(contas.map((c) => [c.id, c]))

  return (
    <main className="ws-main">
      <WorkspaceRealtime />
      <div className="ws-topo">
        <WorkspaceNav abas={abas} presenca={{ id: usuario.id, nome: usuario.nome, foto: pref.foto_url }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>Reuniões</h2>
          {contasTela.map((c) => (
            <span
              key={c.id || c.chave}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600,
                padding: "3px 9px", borderRadius: 999, border: `1px solid ${COR_CONEXAO[c.estado]}55`,
                color: COR_CONEXAO[c.estado],
              }}
            >
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: COR_CONEXAO[c.estado] }} />
              {variasContas ? `Cal.com ${c.rotulo}` : "Cal.com"}: {ROTULO_CONEXAO[c.estado]}
              {c.estado === "conectado" && !c.sincronizacaoAtiva && " · pausada"}
            </span>
          ))}
          {aguardando > 0 && (
            <Link href="?secao=historico" style={{ fontSize: 11, fontWeight: 600, color: "#e24b4a", textDecoration: "none" }}>
              {aguardando} {aguardando === 1 ? "item aguardando" : "itens aguardando"} sincronização
            </Link>
          )}
          <span style={{ flex: 1 }} />
          {souAdmin && (
            <Link href="?secao=integracoes" className="ws-btn-editar" style={{ textDecoration: "none", fontSize: 12 }}>
              Configurar
            </Link>
          )}
        </div>

        <nav aria-label="Seções de Reuniões" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SECOES.map((s) => {
            const ativa = s.id === secao
            return (
              <Link
                key={s.id}
                href={`?secao=${s.id}`}
                aria-current={ativa ? "page" : undefined}
                style={{
                  fontSize: 12, padding: "5px 11px", borderRadius: 999, textDecoration: "none",
                  fontWeight: ativa ? 600 : 400,
                  color: ativa ? "#1e1f21" : "var(--text-2)",
                  background: ativa ? "var(--accent)" : "var(--surface-3)",
                }}
              >
                {s.rotulo}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="ws-conteudo">
        {!painel.migracaoAplicada ? (
          <section className="glass" style={{ padding: 16, borderRadius: 10, maxWidth: 640 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 6px", color: "var(--text-1)" }}>
              Falta aplicar a migration do banco
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
              Rode <code>supabase/migrations/20261021_reunioes_calcom.sql</code> no SQL Editor do Supabase.
              Ela só cria tabelas novas — nada do Workspace atual é alterado. Passo a passo em
              <code> docs/CALCOM_WORKSPACE_INTEGRATION.md</code>.
            </p>
          </section>
        ) : secao === "proximas" ? (
          <ListaReunioes proximas={painel.proximas} encerradas={painel.encerradas} estado={integ.estado} meuId={usuario.id} souAdmin={souAdmin} />
        ) : secao === "tipos" ? (
          <TiposReuniao
            tipos={painel.tipos}
            disponibilidades={painel.disponibilidades.map((d) => ({ id: d.id, nome: d.nome, integracao_id: d.integracao_id }))}
            usuarios={painel.usuarios}
            contextos={painel.contextos}
            contas={contas}
            eventTypes={painel.eventTypesExternos}
            eventTypesErro={painel.eventTypesErro}
            souAdmin={souAdmin}
          />
        ) : secao === "disponibilidade" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {painel.disponibilidades.map((d) => (
              <EditorDisponibilidade
                key={`${d.id}-${d.updated_at}`}
                disp={d}
                usuarios={painel.usuarios}
                tiposQueUsam={painel.tipos.filter((t) => t.disponibilidade_id === d.id).map((t) => t.nome)}
                contaRotulo={variasContas ? contaPorId.get(d.integracao_id ?? "")?.rotulo ?? null : null}
                calcomPronto={contaPorId.get(d.integracao_id ?? "")?.pronta ?? (integ.env.apiKey && integ.estado !== "desconectado")}
                souAdmin={souAdmin}
              />
            ))}
          </div>
        ) : secao === "integracoes" ? (
          <IntegracoesReunioes integracoes={contasTela} souAdmin={souAdmin} />
        ) : (
          <HistoricoReunioes
            pendencias={painel.pendencias}
            eventosComErro={painel.eventosComErro}
            eventos={painel.eventos}
            log={painel.log}
            souAdmin={souAdmin}
          />
        )}
      </div>

      {tarefaAberta && <DrawerServidor tarefaId={tarefaAberta} souAdmin={souAdmin} />}
    </main>
  )
}
