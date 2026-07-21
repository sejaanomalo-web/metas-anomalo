import { requererAdmin } from "@/lib/auth"
import { getSupabaseAdmin } from "@/lib/supabase"
import { clienteDisplayName, type ClienteTrafego } from "@/lib/clientes"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import MapeamentoImportacao, {
  type IdentidadeLinha,
  type OpcaoCliente,
  type OpcaoUsuario,
  type ProjetoLinha,
} from "@/components/workspace/MapeamentoImportacao"

export const dynamic = "force-dynamic"

/**
 * Tela de mapeamento da importação do Asana. requererAdmin (não a permissão
 * 'workspace'): decidir quem é quem reatribui autoria de 1.588 tarefas, e
 * descartar um projeto arquiva uma pasta inteira.
 *
 * Só aparece quando existe algo importado — antes disso não há o que decidir.
 */
export default async function ImportarPage() {
  await requererAdmin()
  const db = getSupabaseAdmin()

  if (!db) {
    return <Aviso texto="Supabase indisponível." />
  }

  const [identRes, ctxRes, usuariosRes, clientesRes] = await Promise.all([
    db.from("ws_identidades_externas")
      .select("id, nome, email, usuario_id")
      .eq("sistema", "asana")
      .order("nome"),
    db.from("ws_contextos")
      .select("id, nome, tipo, cliente_id, arquivado_em")
      .not("source_gid", "is", null)
      .order("nome"),
    db.from("usuarios").select("id, nome").eq("ativo", true).order("nome"),
    db.from("cliente_trafego")
      .select("id, nome, display_name, empresa_nome")
      .eq("ativo", true)
      .order("empresa_nome")
      .order("nome"),
  ])

  const identidadesBrutas = (identRes.data ?? []) as {
    id: string; nome: string | null; email: string | null; usuario_id: string | null
  }[]
  const contextos = (ctxRes.data ?? []) as {
    id: string; nome: string; tipo: string; cliente_id: string | null; arquivado_em: string | null
  }[]

  if (identidadesBrutas.length === 0 && contextos.length === 0) {
    return (
      <main style={{ padding: "20px 16px 48px", maxWidth: 900, margin: "0 auto" }}>
        <Cabecalho />
        <WorkspaceNav />
        <div style={{ marginTop: 14 }}>
          <Aviso texto="Nada importado ainda. Rode a normalização da base para as decisões aparecerem aqui: npx tsx scripts/asana-import.ts normalizar-base" />
        </div>
      </main>
    )
  }

  // Contagens por contexto e por responsável — sem elas o admin decide no
  // escuro, e o projeto com 340 tarefas parece igual ao de 1.
  const contagemPorContexto = new Map<string, number>()
  const { data: vinculos } = await db
    .from("ws_tarefa_contextos")
    .select("contexto_id")
    .limit(20000)
  for (const v of (vinculos ?? []) as { contexto_id: string }[]) {
    contagemPorContexto.set(v.contexto_id, (contagemPorContexto.get(v.contexto_id) ?? 0) + 1)
  }

  const contagemPorIdentidade = new Map<string, number>()
  const { data: porResp } = await db
    .from("ws_tarefas")
    .select("responsavel_externo_id")
    .not("responsavel_externo_id", "is", null)
    .limit(20000)
  for (const t of (porResp ?? []) as { responsavel_externo_id: string }[]) {
    contagemPorIdentidade.set(
      t.responsavel_externo_id,
      (contagemPorIdentidade.get(t.responsavel_externo_id) ?? 0) + 1
    )
  }

  const identidades: IdentidadeLinha[] = identidadesBrutas.map((i) => ({
    id: i.id,
    nome: i.nome,
    email: i.email,
    usuario_id: i.usuario_id,
    tarefas: contagemPorIdentidade.get(i.id) ?? 0,
  }))

  const projetos: ProjetoLinha[] = contextos.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    cliente_id: c.cliente_id,
    arquivado: Boolean(c.arquivado_em),
    tarefas: contagemPorContexto.get(c.id) ?? 0,
  }))

  const usuarios: OpcaoUsuario[] = ((usuariosRes.data ?? []) as OpcaoUsuario[])

  const clientes: OpcaoCliente[] = (
    (clientesRes.data ?? []) as Pick<
      ClienteTrafego, "id" | "nome" | "display_name" | "empresa_nome"
    >[]
  ).map((c) => ({
    id: c.id,
    nome: clienteDisplayName(c as ClienteTrafego),
    empresa: c.empresa_nome,
  }))

  return (
    <main style={{ padding: "20px 16px 48px", maxWidth: 900, margin: "0 auto" }}>
      <Cabecalho />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <WorkspaceNav />
        <MapeamentoImportacao
          identidades={identidades}
          projetos={projetos}
          usuarios={usuarios}
          clientes={clientes}
        />
      </div>
    </main>
  )
}

function Cabecalho() {
  return (
    <header style={{ marginBottom: 14 }}>
      <h1 className="ds-headline" style={{ fontSize: 22, margin: "0 0 3px" }}>
        Importação do Asana
      </h1>
      <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0, maxWidth: 640 }}>
        Decisões que o sistema não pode tomar sozinho. Nada aqui apaga tarefa —
        descartar um projeto arquiva a pasta, e as tarefas continuam existindo
        nos outros contextos e no calendário. Dá pra mudar de ideia depois.
      </p>
    </header>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div
      className="glass"
      style={{
        padding: "22px 16px",
        borderRadius: 12,
        fontSize: 12,
        color: "var(--text-4)",
        textAlign: "center",
      }}
    >
      {texto}
    </div>
  )
}
