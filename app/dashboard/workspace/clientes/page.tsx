import { requererPermissao } from "@/lib/auth"
import { getClientesAtivosPorEmpresa } from "@/lib/clientes"
import { contarPorContexto, listarAbas, listarContextos } from "@/lib/workspace"
import WorkspaceNav from "@/components/workspace/WorkspaceNav"
import ClientesPainel, {
  type GrupoEmpresa,
  type ItemCliente,
} from "@/components/workspace/ClientesPainel"

export const dynamic = "force-dynamic"

/**
 * Aba Clientes — lista vertical reordenável. Três origens, sem duplicar:
 *   • contextos tipo 'empresa' = ÂNCORAS de grupo (permitem grupo vazio e
 *     dão ao grupo uma posição própria na ordenação);
 *   • contextos tipo 'cliente' = as áreas de trabalho (reordenáveis);
 *   • clientes de tráfego ativos ainda sem contexto (a pasta nasce no clique).
 * A ORDEM visual é ws_contextos.ordem — grupos ordenados pela menor ordem
 * entre seus contextos, itens pela própria.
 */
export default async function ClientesPage() {
  const usuario = await requererPermissao("workspace")

  const [porEmpresa, contextos, contagens, abas] = await Promise.all([
    getClientesAtivosPorEmpresa(),
    listarContextos(),
    contarPorContexto(),
    listarAbas(),
  ])

  const ancoras = contextos.filter((c) => c.tipo === "empresa")
  const contextosCliente = contextos.filter((c) => c.tipo === "cliente")
  const contextoPorCliente = new Map<string, (typeof contextosCliente)[number]>()
  for (const c of contextosCliente) {
    if (c.cliente_id) contextoPorCliente.set(c.cliente_id, c)
  }

  interface GrupoAcc {
    itens: (ItemCliente & { ordem: number })[]
    ancoraId: string | null
    menorOrdem: number
  }
  const grupos = new Map<string, GrupoAcc>()
  function grupo(chaveBruta: string): GrupoAcc {
    const chave = chaveBruta.trim() || "Sem empresa"
    let g = grupos.get(chave)
    if (!g) {
      g = { itens: [], ancoraId: null, menorOrdem: Number.MAX_SAFE_INTEGER }
      grupos.set(chave, g)
    }
    return g
  }

  // Âncoras primeiro: criam o grupo (mesmo vazio) e definem posição.
  for (const a of ancoras) {
    const g = grupo(a.empresa_nome ?? a.nome)
    g.ancoraId = a.id
    g.menorOrdem = Math.min(g.menorOrdem, a.ordem)
  }

  // Contextos de cliente.
  for (const c of contextosCliente) {
    const g = grupo(c.empresa_nome ?? "Sem empresa")
    const contagem = contagens.get(c.id)
    g.menorOrdem = Math.min(g.menorOrdem, c.ordem)
    g.itens.push({
      contextoId: c.id,
      clienteId: c.cliente_id,
      nome: c.nome,
      cor: c.cor,
      fotoUrl: c.foto_url,
      pendentes: contagem?.pendentes ?? 0,
      atrasadas: contagem?.atrasadas ?? 0,
      ordem: c.ordem,
    })
  }

  // Clientes do cadastro que ainda não têm pasta (vão pro fim do grupo).
  for (const [empresa, clientes] of Object.entries(porEmpresa)) {
    for (const cliente of clientes) {
      if (contextoPorCliente.has(cliente.id)) continue
      grupo(empresa).itens.push({
        contextoId: null,
        clienteId: cliente.id,
        nome: cliente.nome,
        cor: null,
        fotoUrl: null,
        pendentes: 0,
        atrasadas: 0,
        ordem: Number.MAX_SAFE_INTEGER,
      })
    }
  }

  const gruposOrdenados: GrupoEmpresa[] = [...grupos.entries()]
    .sort(
      ([a, ga], [b, gb]) =>
        ga.menorOrdem - gb.menorOrdem || a.localeCompare(b, "pt-BR")
    )
    .map(([empresa, g]) => ({
      empresa,
      ancoraId: g.ancoraId,
      itens: g.itens
        .sort((x, y) => x.ordem - y.ordem || x.nome.localeCompare(y.nome, "pt-BR"))
        .map(({ ordem: _ordem, ...item }) => item),
    }))

  const empresas = gruposOrdenados.map((g) => g.empresa).filter((e) => e !== "Sem empresa")

  return (
    <main className="ws-main">
      <div className="ws-topo">
        <WorkspaceNav abas={abas} presenca={{ id: usuario.id, nome: usuario.nome }} />
      </div>
      <div className="ws-conteudo">
        <ClientesPainel grupos={gruposOrdenados} empresas={empresas} />
      </div>
    </main>
  )
}
