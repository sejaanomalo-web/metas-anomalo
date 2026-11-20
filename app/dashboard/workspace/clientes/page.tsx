import { requererPermissao } from "@/lib/auth"
import { ehAdminNoModulo } from "@/lib/acesso-admin"
import { getClientesAtivosPorEmpresa } from "@/lib/clientes"
import { getSupabaseAdmin } from "@/lib/supabase"
import {
  contarPorContexto,
  getPreferencia,
  listarAbas,
  listarContextos,
} from "@/lib/workspace"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import ClientesPainel, {
  type GrupoEmpresa,
  type ItemCliente,
} from "@/components/workspace/ClientesPainel"

export const dynamic = "force-dynamic"

/** Normaliza nome de empresa pra casar grupo sem tropeçar em caixa/espaço. */
function chaveEmpresa(nome: string): string {
  return nome.trim().toLowerCase()
}

/** Grupo de clientes desativados — visível só pra admin do sistema. */
function ehGrupoDesativados(nome: string): boolean {
  return /^desativad[oa]s?$/.test(chaveEmpresa(nome))
}

async function listarClientesDesativados() {
  const db = getSupabaseAdmin()
  if (!db) return []
  const { data, error } = await db
    .from("cliente_trafego")
    .select("id, nome, display_name, empresa_nome")
    .eq("ativo", false)
    .order("ordem")
    .order("nome")
  if (error) {
    console.error("[workspace] listarClientesDesativados error", error.message)
    return []
  }
  return (data ?? []) as { id: string; nome: string; display_name: string | null; empresa_nome: string }[]
}

/**
 * Aba Clientes — lista vertical reordenável, agrupada por ÂNCORA (contexto
 * tipo 'empresa'), não por texto.
 *
 * ORDEM É SAGRADA: a posição do grupo é `ordem` da âncora e a do cliente é a
 * própria `ordem` dentro do grupo. Nada é recalculado a partir do conteúdo,
 * então criar/excluir cliente não mexe em nada de lugar — só o arrasto muda
 * a ordem (reordenarContextosAction).
 *
 * Clientes de tráfego ainda sem pasta aparecem no fim do grupo da empresa
 * deles (a pasta nasce no primeiro clique).
 */
export default async function ClientesPage() {
  const usuario = await requererPermissao("workspace")

  const ehAdmin = ehAdminNoModulo(usuario, "workspace")

  const [porEmpresa, todosContextos, clientesDesativados, contagens, abas, pref] = await Promise.all([
    getClientesAtivosPorEmpresa(),
    listarContextos(true),
    listarClientesDesativados(),
    contarPorContexto(),
    listarAbas(),
    getPreferencia(usuario.id),
  ])

  const idsDesativados = new Set(clientesDesativados.map((c) => c.id))
  const idsAtivos = new Set(Object.values(porEmpresa).flat().map((c) => c.id))
  const gruposDesativados = new Set(
    todosContextos
      .filter((c) => c.tipo === "empresa" && ehGrupoDesativados(c.empresa_nome ?? c.nome))
      .map((c) => c.id)
  )
  // Contextos arquivados de outras áreas continuam fora da aba. O grupo
  // Desativados pode ter vindo arquivado da importação do Asana.
  const contextos = todosContextos.filter(
    (c) => !c.arquivado_em || (ehAdmin &&
      (gruposDesativados.has(c.id) || (c.grupo_id && gruposDesativados.has(c.grupo_id))))
  )

  const ancoras = contextos
    .filter((c) => c.tipo === "empresa")
    .filter((c) => ehAdmin || !ehGrupoDesativados(c.empresa_nome ?? c.nome))
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))

  const ancoraPorId = new Map(ancoras.map((a) => [a.id, a]))
  const ancoraPorNome = new Map(
    ancoras.map((a) => [chaveEmpresa(a.empresa_nome ?? a.nome), a])
  )

  const itensPorAncora = new Map<string, (ItemCliente & { ordem: number })[]>()
  for (const a of ancoras) itensPorAncora.set(a.id, [])
  const semGrupo: (ItemCliente & { ordem: number })[] = []

  function destino(ancoraId: string | null | undefined) {
    if (ancoraId && itensPorAncora.has(ancoraId)) return itensPorAncora.get(ancoraId)!
    return semGrupo
  }

  // 1) Contextos de cliente já existentes.
  const contextosCliente = contextos.filter((c) => c.tipo === "cliente")
  const contextoPorClienteTrafego = new Map<string, string>()
  for (const c of contextosCliente) {
    if (c.cliente_id) contextoPorClienteTrafego.set(c.cliente_id, c.id)
    if (!ehAdmin && c.cliente_id && !idsAtivos.has(c.cliente_id)) continue
    // Cliente que está no grupo Desativados (escondido pra não-admin) não
    // pode vazar pra "sem empresa".
    if (
      !ehAdmin &&
      ((c.grupo_id && gruposDesativados.has(c.grupo_id)) ||
        (!c.grupo_id && c.empresa_nome && ehGrupoDesativados(c.empresa_nome)))
    ) {
      continue
    }
    const contagem = contagens.get(c.id)
    // grupo_id é a fonte; o nome só entra como resgate pra linha que ainda
    // não passou pela migração da fase 4.
    const ancora =
      (c.grupo_id ? ancoraPorId.get(c.grupo_id) : undefined) ??
      (c.empresa_nome ? ancoraPorNome.get(chaveEmpresa(c.empresa_nome)) : undefined)
    destino(ancora?.id).push({
      contextoId: c.id,
      clienteId: c.cliente_id,
      nome: c.nome,
      cor: c.cor,
      fotoUrl: c.foto_url,
      pendentes: contagem?.pendentes ?? 0,
      atrasadas: contagem?.atrasadas ?? 0,
      desativado: Boolean(c.cliente_id && idsDesativados.has(c.cliente_id)),
      ordem: c.ordem,
    })
  }

  // 2) Clientes do cadastro de tráfego que ainda não têm pasta. Vão pro fim
  //    do grupo (ordem alta) porque ainda não têm posição escolhida.
  for (const [empresa, clientes] of Object.entries(porEmpresa)) {
    if (!ehAdmin && ehGrupoDesativados(empresa)) continue
    const ancora = ancoraPorNome.get(chaveEmpresa(empresa))
    for (const cliente of clientes) {
      if (contextoPorClienteTrafego.has(cliente.id)) continue
      destino(ancora?.id).push({
        contextoId: null,
        clienteId: cliente.id,
        nome: cliente.nome,
        cor: null,
        fotoUrl: null,
        pendentes: 0,
        atrasadas: 0,
        desativado: false,
        ordem: Number.MAX_SAFE_INTEGER,
      })
    }
  }

  // Um cliente desativado sem pasta também precisa aparecer para o admin.
  // Se não houver âncora, ele fica na seção restrita ao fim da lista.
  const desativadosSemGrupo: (ItemCliente & { ordem: number })[] = []
  if (ehAdmin) {
    for (const cliente of clientesDesativados) {
      if (contextoPorClienteTrafego.has(cliente.id)) continue
      const item = {
        contextoId: null,
        clienteId: cliente.id,
        nome: cliente.display_name?.trim() || cliente.nome,
        cor: null,
        fotoUrl: null,
        pendentes: 0,
        atrasadas: 0,
        desativado: true,
        ordem: Number.MAX_SAFE_INTEGER,
      }
      const ancora = ancoraPorNome.get(chaveEmpresa(cliente.empresa_nome))
      if (ancora) itensPorAncora.get(ancora.id)!.push(item)
      else desativadosSemGrupo.push(item)
    }
  }

  function ordenar(lista: (ItemCliente & { ordem: number })[]): ItemCliente[] {
    return lista
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
      .map(({ ordem: _ordem, ...item }) => item)
  }

  const grupos: GrupoEmpresa[] = ancoras.map((a) => ({
    ancoraId: a.id,
    empresa: a.empresa_nome ?? a.nome,
    itens: ordenar(itensPorAncora.get(a.id) ?? []),
    apenasAdmin: ehGrupoDesativados(a.empresa_nome ?? a.nome),
  }))

  // Sem empresa fica por último e não é arrastável como grupo (não tem
  // âncora pra guardar posição) — some assim que alguém der uma empresa.
  const soltos = ordenar(semGrupo)

  const empresas = grupos.map((g) => g.empresa)

  return (
    <main className="ws-main">
      <div className="ws-topo">
        <WorkspaceNav
          abas={abas}
          presenca={{ id: usuario.id, nome: usuario.nome, foto: pref.foto_url }}
        />
      </div>
      <div className="ws-conteudo">
        <ClientesPainel grupos={grupos} soltos={soltos} desativadosSemGrupo={ordenar(desativadosSemGrupo)} empresas={empresas} />
      </div>
    </main>
  )
}
