"use client"

import { useState } from "react"
import type { EmpresaMeta } from "@/lib/data"
import FormularioComercial from "./FormularioComercial"
import FormularioManual from "./FormularioManual"

type Secao = "comercial" | "trafego"

/**
 * Casca de seções da aba Formulários. Divide visualmente em:
 *   • Comercial    → relatório diário + pipeline (FormularioComercial)
 *   • Tráfego Pago → dados reais por empresa (FormularioManual, legado)
 *
 * Cada seção só aparece se o usuário tem a permissão correspondente
 * (formulario_comercial / formulario_trafego), passada pelo server.
 */
export default function FormulariosSecoes({
  empresas,
  podeComercial,
  podeTrafego,
}: {
  empresas: EmpresaMeta[]
  podeComercial: boolean
  podeTrafego: boolean
}) {
  const inicial: Secao = podeComercial ? "comercial" : "trafego"
  const [secao, setSecao] = useState<Secao>(inicial)

  const abas: { id: Secao; rotulo: string; visivel: boolean }[] = [
    { id: "comercial", rotulo: "Comercial", visivel: podeComercial },
    { id: "trafego", rotulo: "Tráfego Pago", visivel: podeTrafego },
  ]
  const visiveis = abas.filter((a) => a.visivel)

  return (
    <div className="space-y-6">
      {visiveis.length > 1 && (
        <div style={{ display: "flex", gap: 8 }}>
          {visiveis.map((a) => {
            const ativo = secao === a.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setSecao(a.id)}
                className="no-ds"
                style={{
                  padding: "10px 18px",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  borderRadius: 10,
                  cursor: "pointer",
                  color: ativo ? "#0b0b0d" : "var(--text-3)",
                  background: ativo ? "var(--accent, #C9953A)" : "transparent",
                  border: ativo
                    ? "1px solid var(--accent, #C9953A)"
                    : "0.5px solid rgba(255,255,255,0.15)",
                }}
              >
                {a.rotulo}
              </button>
            )
          })}
        </div>
      )}

      {secao === "comercial" && podeComercial && (
        <FormularioComercial empresas={empresas} />
      )}
      {secao === "trafego" && podeTrafego && (
        <FormularioManual empresas={empresas} copiarLinkPublico />
      )}
    </div>
  )
}
