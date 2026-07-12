import Link from "next/link"
import { requererPermissao } from "@/lib/auth"
import { listarInstancias } from "@/lib/crm-instancias-actions"
import { listarEmpresas } from "@/lib/empresas-actions"
import GerenciadorInstancias from "@/components/crm/GerenciadorInstancias"
import CrmRealtime from "@/components/crm/CrmRealtime"

export const dynamic = "force-dynamic"

/**
 * Admin de instâncias Evolution (números conectados). Cada linha = 1 número
 * = 1 empresa. Criar aqui dispara a instância na Evolution e exibe o QR
 * assim que o webhook (QRCODE_UPDATED) preencher crm_instancias.ultimo_qr.
 */
export default async function CrmConexoesPage() {
  await requererPermissao("crm")

  const [instancias, empresas] = await Promise.all([
    listarInstancias(),
    listarEmpresas(),
  ])

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1120 }}>
      <CrmRealtime />
      <div>
        <Link
          href="/dashboard/crm"
          style={{ fontSize: 12, color: "var(--gold, #C9953A)" }}
        >
          ‹ Voltar às conversas
        </Link>
        <p
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-3)",
            letterSpacing: "0.01em",
            marginTop: 14,
          }}
        >
          CRM
        </p>
        <h1 style={{ fontSize: 32, marginTop: 6 }}>Conexões WhatsApp</h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-3)",
            marginTop: 8,
            lineHeight: 1.6,
            maxWidth: 640,
          }}
        >
          Cada número conectado aqui vira uma instância isolada por empresa —
          o número continua funcionando normalmente no celular, e o CRM lê e
          responde em paralelo.
        </p>
      </div>

      <GerenciadorInstancias instancias={instancias} empresas={empresas} />
    </main>
  )
}
