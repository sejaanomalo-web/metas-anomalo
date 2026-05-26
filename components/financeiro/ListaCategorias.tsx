"use client"

import { useState } from "react"
import CategoriaDrawer from "./CategoriaDrawer"
import type { CategoriaFinanceira, TipoLancamento } from "@/lib/financeiro"

export default function ListaCategorias({
  categorias,
}: {
  categorias: CategoriaFinanceira[]
}) {
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<CategoriaFinanceira | null>(null)

  function abrirNova() {
    setEditando(null)
    setDrawerAberto(true)
  }
  function editar(c: CategoriaFinanceira) {
    setEditando(c)
    setDrawerAberto(true)
  }

  const receitas = categorias.filter((c) => c.tipo === "receita")
  const despesas = categorias.filter((c) => c.tipo === "despesa")

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button type="button" onClick={abrirNova} className="btn-gold-filled">
          + Nova categoria
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
        <Bloco titulo="Receitas" tipo="receita" categorias={receitas} editar={editar} />
        <Bloco titulo="Despesas" tipo="despesa" categorias={despesas} editar={editar} />
      </div>

      <CategoriaDrawer
        aberto={drawerAberto}
        fechar={() => setDrawerAberto(false)}
        categoria={editando}
      />
    </>
  )
}

function Bloco({
  titulo,
  tipo,
  categorias,
  editar,
}: {
  titulo: string
  tipo: TipoLancamento
  categorias: CategoriaFinanceira[]
  editar: (c: CategoriaFinanceira) => void
}) {
  return (
    <div
      className="glass"
      style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--muted-foreground)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {titulo} — {tipo}
        </p>
        <p style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{categorias.length}</p>
      </div>
      {categorias.length === 0 ? (
        <p style={{ padding: 20, color: "var(--muted-foreground)", fontSize: 13 }}>
          Nenhuma categoria.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {categorias.map((c) => (
            <li
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 20px",
                borderTop: "1px solid var(--border)",
                cursor: "pointer",
                opacity: c.ativa ? 1 : 0.5,
              }}
              onClick={() => editar(c)}
              role="button"
              tabIndex={0}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: c.cor,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, fontSize: 14 }}>{c.nome}</span>
              {!c.ativa && (
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>inativa</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
