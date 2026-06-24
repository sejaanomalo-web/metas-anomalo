"use client"

import { useState } from "react"
import type { EmpresaMeta } from "@/lib/data"
import FormularioComercial from "./FormularioComercial"

export type FormId = "comercial"

interface FormDef {
  id: FormId
  titulo: string
  descricao: string
  rota: string
}

const FORMS: FormDef[] = [
  {
    id: "comercial",
    titulo: "Formulário Comercial",
    descricao: "Relatório diário do comercial por empresa",
    rota: "/formulario-comercial",
  },
]

/**
 * Seção "Formulários" dentro de Configurações. Lista os dois formulários
 * como cards expansíveis. Cada card tem:
 *   • botão "Copiar link" (link público pra enviar ao time)
 *   • ao clicar/expandir, abre o próprio formulário (preencher/editar)
 *
 * Substitui a antiga aba lateral de Formulários — agora a gestão vive
 * aqui, abaixo de "Usuários do sistema".
 */
export default function GerenciadorFormularios({
  empresas,
  formsPermitidos,
  responsaveisComercial,
  clientesPorEmpresa,
}: {
  empresas: EmpresaMeta[]
  formsPermitidos?: FormId[]
  responsaveisComercial?: { id: string; nome: string }[]
  /** Clientes ativos por assessoria — habilita o seletor de cliente no
   *  formulário comercial (orgânico POR CLIENTE), igual ao link público. */
  clientesPorEmpresa?: Record<string, { id: string; nome: string }[]>
}) {
  const formsVisiveis = formsPermitidos
    ? FORMS.filter((f) => formsPermitidos.includes(f.id))
    : FORMS
  const [aberto, setAberto] = useState<FormId | null>(null)
  const [copiado, setCopiado] = useState<FormId | null>(null)

  async function copiar(form: FormDef) {
    if (typeof window === "undefined") return
    const url = `${window.location.origin}${form.rota}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(form.id)
      setTimeout(() => setCopiado((c) => (c === form.id ? null : c)), 2400)
    } catch {
      // Fallback silencioso — o link aparece no título do card de qualquer forma.
    }
  }

  return (
    <section
      className="glass"
      style={{ padding: "24px 26px" }}
      aria-label="Formulários"
    >
      <p
        style={{
          fontSize: 11,
          letterSpacing: "1.5px",
          color: "var(--text-3)",
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        Formulários
      </p>
      <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 18 }}>
        Copie o link público pra enviar ao time, ou clique para abrir e
        preencher.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {formsVisiveis.map((form) => {
          const expandido = aberto === form.id
          return (
            <div
              key={form.id}
              style={{
                border: "0.5px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                overflow: "hidden",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              {/* Header do card */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 16px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => setAberto(expandido ? null : form.id)}
                  className="no-ds"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      color: "var(--accent, #C9953A)",
                      fontSize: 13,
                      transform: expandido ? "rotate(90deg)" : "none",
                      transition: "transform 0.15s",
                    }}
                    aria-hidden="true"
                  >
                    ▸
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--text-1)",
                      }}
                    >
                      {form.titulo}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12,
                        color: "var(--text-4)",
                      }}
                    >
                      {form.descricao}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => copiar(form)}
                  className="hover:text-[#C9953A] hover:border-[#C9953A55] transition no-ds"
                  style={{
                    padding: "8px 14px",
                    fontSize: 11,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    color:
                      copiado === form.id
                        ? "#4caf50"
                        : "rgba(255,255,255,0.55)",
                    border: "0.5px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    background: "transparent",
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copiado === form.id ? "Copiado ✓" : "Copiar link"}
                </button>
              </div>

              {/* Corpo expandido: o formulário */}
              {expandido && (
                <div
                  style={{
                    padding: "0 16px 18px 16px",
                    borderTop: "0.5px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ marginTop: 16 }}>
                    <FormularioComercial
                      empresas={empresas}
                      responsaveis={responsaveisComercial}
                      clientesPorEmpresa={clientesPorEmpresa}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
