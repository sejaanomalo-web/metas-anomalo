import Link from "next/link"
import FormularioComercial from "@/components/FormularioComercial"
import { requererPermissao } from "@/lib/auth"
import { listarEmpresas } from "@/lib/empresas-actions"
import { getClientesAtivosPorEmpresa } from "@/lib/clientes"
import { listarTimePorPapel } from "@/lib/time"

export const dynamic = "force-dynamic"

/**
 * Responder o relatório comercial DENTRO do sistema (autenticado), sem
 * precisar copiar o link público e abrir no navegador. Acessível a quem tem
 * o comercial (dashboard_comercial). O responsável já vem pré-selecionado
 * com o usuário logado; o link público segue disponível como alternativa.
 */
export default async function ResponderComercialPage() {
  const usuario = await requererPermissao("dashboard_comercial")

  const [empresas, time, clientesPorEmpresa] = await Promise.all([
    listarEmpresas(true),
    listarTimePorPapel("comercial"),
    getClientesAtivosPorEmpresa(),
  ])

  // Garante que o usuário logado esteja na lista e pré-selecionado como
  // responsável — mesmo que não esteja no roster comercial canônico.
  const responsaveis = time.map((r) => ({ id: r.id, nome: r.nome }))
  if (!responsaveis.some((r) => r.id === usuario.id)) {
    responsaveis.unshift({ id: usuario.id, nome: usuario.nome })
  }

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 760 }}>
      <div>
        <Link
          href="/dashboard/comercial"
          style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}
          className="hover:text-[#C9953A] transition"
        >
          ← Comercial
        </Link>
        <h1 style={{ fontSize: 32, marginTop: 10 }}>
          Responder relatório do dia
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10 }}>
          Lance os números do dia direto por aqui. Você está respondendo como{" "}
          <strong style={{ color: "var(--text-1)" }}>{usuario.nome}</strong>.
        </p>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <FormularioComercial
        empresas={empresas}
        responsaveis={responsaveis}
        responsavelPadraoId={usuario.id}
        clientesPorEmpresa={clientesPorEmpresa}
      />
    </main>
  )
}
