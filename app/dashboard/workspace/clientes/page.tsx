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
 * Aba Clientes — união de DUAS origens, sem duplicar cadastro:
 *   • contextos tipo 'cliente' (área de trabalho já existente — inclui os
 *     criados direto no Workspace, sem cadastro de tráfego);
 *   • clientes de tráfego ativos que ainda NÃO têm contexto (a pasta nasce
 *     no primeiro clique, como sempre foi).
 * O agrupamento usa a empresa do CONTEXTO quando há contexto (é o que o
 * lápis renomeia) e a do cadastro quando ainda não há.
 */
export default async function ClientesPage() {
  await requererPermissao("workspace")

  const [porEmpresa, contextos, contagens, abas] = await Promise.all([
    getClientesAtivosPorEmpresa(),
    listarContextos(),
    contarPorContexto(),
    listarAbas(),
  ])

  const contextosCliente = contextos.filter((c) => c.tipo === "cliente")
  const contextoPorCliente = new Map<string, (typeof contextosCliente)[number]>()
  for (const c of contextosCliente) {
    if (c.cliente_id) contextoPorCliente.set(c.cliente_id, c)
  }

  const grupos = new Map<string, ItemCliente[]>()
  function empurrar(empresa: string, item: ItemCliente) {
    const chave = empresa.trim() || "Sem empresa"
    const lista = grupos.get(chave) ?? []
    lista.push(item)
    grupos.set(chave, lista)
  }

  // 1) Contextos de cliente existentes (com ou sem cadastro de tráfego).
  for (const c of contextosCliente) {
    const contagem = contagens.get(c.id)
    empurrar(c.empresa_nome ?? "Sem empresa", {
      contextoId: c.id,
      clienteId: c.cliente_id,
      nome: c.nome,
      cor: c.cor,
      fotoUrl: c.foto_url,
      pendentes: contagem?.pendentes ?? 0,
      atrasadas: contagem?.atrasadas ?? 0,
    })
  }

  // 2) Clientes do cadastro que ainda não têm pasta.
  for (const [empresa, clientes] of Object.entries(porEmpresa)) {
    for (const cliente of clientes) {
      if (contextoPorCliente.has(cliente.id)) continue
      empurrar(empresa, {
        contextoId: null,
        clienteId: cliente.id,
        nome: cliente.nome,
        cor: null,
        fotoUrl: null,
        pendentes: 0,
        atrasadas: 0,
      })
    }
  }

  const gruposOrdenados: GrupoEmpresa[] = [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([empresa, itens]) => ({
      empresa,
      itens: itens.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    }))

  const empresas = gruposOrdenados.map((g) => g.empresa).filter((e) => e !== "Sem empresa")

  return (
    <main style={{ padding: "16px 16px 48px", maxWidth: 1120, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <WorkspaceNav abas={abas} />
        <ClientesPainel grupos={gruposOrdenados} empresas={empresas} />
      </div>
    </main>
  )
}
