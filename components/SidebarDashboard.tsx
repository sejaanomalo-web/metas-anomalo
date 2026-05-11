"use client"

import { useState } from "react"
import Link from "next/link"
import DrawerEmpresas from "@/components/DrawerEmpresas"
import type { Ano, EmpresaMeta, Mes } from "@/lib/data"

/**
 * Sidebar à esquerda do /dashboard com duas seções colapsáveis:
 *
 *   • Empresas — lista de empresas ativas (link → /dashboard/[slug])
 *                + botão "Gerenciar empresas" (drawer)
 *   • Time     — atalhos para Comissionamento e Formulários diários
 *
 * Cada seção tem um chevron clicável que expande/recolhe o conteúdo.
 * Default: ambas expandidas. Estado fica em memória do client (não
 * persiste entre páginas — proposital, simplicidade).
 *
 * Sticky: a sidebar acompanha o scroll da página (top alinha com o
 * header sticky de 64px de altura).
 */
export default function SidebarDashboard({
  empresas,
  empresasInativas,
  supabaseOk,
  mes,
  ano,
}: {
  empresas: EmpresaMeta[]
  empresasInativas: EmpresaMeta[]
  supabaseOk: boolean
  mes: Mes
  ano: Ano
}) {
  const [empresasAberto, setEmpresasAberto] = useState(true)
  const [timeAberto, setTimeAberto] = useState(true)

  return (
    <aside className="sidebar-dashboard">
      <div
        className="glass"
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* Empresas */}
        <SecaoCabecalho
          titulo="Empresas"
          aberto={empresasAberto}
          onToggle={() => setEmpresasAberto((v) => !v)}
          contagem={empresas.length}
        />
        {empresasAberto && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              marginTop: 4,
              marginBottom: 8,
            }}
          >
            {empresas.length === 0 && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-4)",
                  fontStyle: "italic",
                  padding: "8px 10px",
                }}
              >
                Nenhuma empresa cadastrada
              </p>
            )}
            {empresas.map((e) => (
              <Link
                key={e.slug}
                href={`/dashboard/${e.slug}?mes=${mes}&ano=${ano}`}
                style={{
                  display: "block",
                  padding: "8px 10px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-2)",
                  borderRadius: 8,
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
                className="hover:bg-[rgba(255,255,255,0.04)] hover:text-white"
              >
                {e.nome}
              </Link>
            ))}
            <div style={{ marginTop: 8 }}>
              <DrawerEmpresas
                empresas={empresas}
                empresasInativas={empresasInativas}
                supabaseOk={supabaseOk}
              />
            </div>
          </div>
        )}

        <Divider />

        {/* Time */}
        <SecaoCabecalho
          titulo="Time"
          aberto={timeAberto}
          onToggle={() => setTimeAberto((v) => !v)}
        />
        {timeAberto && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              marginTop: 4,
            }}
          >
            <Link
              href={`/dashboard/comissionamento?mes=${mes}&ano=${ano}`}
              style={{
                display: "block",
                padding: "8px 10px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-2)",
                borderRadius: 8,
                transition: "background 0.15s ease, color 0.15s ease",
              }}
              className="hover:bg-[rgba(255,255,255,0.04)] hover:text-white"
            >
              Comissionamento
            </Link>
            <Link
              href="/dashboard/preenchedores"
              style={{
                display: "block",
                padding: "8px 10px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-2)",
                borderRadius: 8,
                transition: "background 0.15s ease, color 0.15s ease",
              }}
              className="hover:bg-[rgba(255,255,255,0.04)] hover:text-white"
            >
              Formulários diários
            </Link>
          </div>
        )}
      </div>
    </aside>
  )
}

function SecaoCabecalho({
  titulo,
  aberto,
  onToggle,
  contagem,
}: {
  titulo: string
  aberto: boolean
  onToggle: () => void
  contagem?: number
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="no-ds"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "8px 10px",
        background: "transparent",
        color: "var(--text-3)",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "1.17px",
        textTransform: "uppercase",
        borderRadius: 8,
        cursor: "pointer",
        transition: "color 0.15s ease",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {titulo}
        {typeof contagem === "number" && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-4)",
              background: "rgba(255,255,255,0.05)",
              padding: "2px 6px",
              borderRadius: 999,
              letterSpacing: 0,
            }}
          >
            {contagem}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        style={{
          fontSize: 10,
          transform: aberto ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s ease",
          color: "var(--text-3)",
        }}
      >
        ▾
      </span>
    </button>
  )
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "rgba(255,255,255,0.06)",
        margin: "10px 0",
      }}
    />
  )
}
