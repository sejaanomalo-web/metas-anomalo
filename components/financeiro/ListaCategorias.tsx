"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import CategoriaDrawer from "./CategoriaDrawer"
import DialogoExcluirCategoria from "./DialogoExcluirCategoria"
import { corDaCategoria, type TipoLancamento } from "@/lib/financeiro-regras"
import type { CategoriaFinanceira } from "@/lib/financeiro"

export default function ListaCategorias({
  categorias,
  qsPeriodo,
}: {
  categorias: CategoriaFinanceira[]
  /** Query string do período global, pra o detalhe abrir no mesmo recorte.
   *  Vem como string porque função não atravessa servidor→cliente. */
  qsPeriodo: string
}) {
  const hrefDetalhe = (id: string) =>
    `/dashboard/financeiro/categorias/${id}${qsPeriodo ? `?${qsPeriodo}` : ""}`

  const router = useRouter()
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<CategoriaFinanceira | null>(null)
  const [tipoNova, setTipoNova] = useState<TipoLancamento>("despesa")
  const [excluindo, setExcluindo] = useState<CategoriaFinanceira | null>(null)
  const [busca, setBusca] = useState("")
  const [aviso, setAviso] = useState<string | null>(null)

  function abrirNova(tipo: TipoLancamento) {
    setTipoNova(tipo)
    setEditando(null)
    setDrawerAberto(true)
  }
  function editar(c: CategoriaFinanceira) {
    setTipoNova(c.tipo)
    setEditando(c)
    setDrawerAberto(true)
  }

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return categorias
    return categorias.filter((c) => c.nome.toLowerCase().includes(termo))
  }, [categorias, busca])

  const receitas = filtradas.filter((c) => c.tipo === "receita")
  const despesas = filtradas.filter((c) => c.tipo === "despesa")

  // Cores já em uso — a categoria nova nasce com a primeira livre da paleta.
  const coresEmUso = categorias.map((c) => c.cor)

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar categoria…"
          className="glass-input"
          style={{ flex: "1 1 220px", maxWidth: 360 }}
        />
        {busca && (
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            {filtradas.length} de {categorias.length}
          </span>
        )}
      </div>

      {aviso && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            fontSize: 13,
            color: "var(--text-1)",
            background: "rgba(22, 163, 74, 0.12)",
            border: "0.5px solid rgba(22, 163, 74, 0.40)",
          }}
        >
          {aviso}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
        <Bloco
          titulo="Receitas"
          tipo="receita"
          categorias={receitas}
          editar={editar}
          excluir={setExcluindo}
          nova={() => abrirNova("receita")}
          hrefDetalhe={hrefDetalhe}
        />
        <Bloco
          titulo="Despesas"
          tipo="despesa"
          categorias={despesas}
          editar={editar}
          excluir={setExcluindo}
          nova={() => abrirNova("despesa")}
          hrefDetalhe={hrefDetalhe}
        />
      </div>

      {/* Renderizado só quando aberto, de propósito.
          O drawer faz `if (!aberto) return null` DEPOIS dos hooks, então ele
          nunca desmontava: os inicializadores de useState rodavam uma única
          vez, no primeiro render da página — quando não havia registro
          nenhum selecionado. Nas aberturas seguintes, tipo/status/conta/
          categoria/cor continuavam com o valor da vez anterior, enquanto os
          campos não controlados (descrição, valor, datas) se atualizavam
          normalmente: o formulário abria metade certo, metade errado.
          Montar a cada abertura garante estado novo. A animação de entrada
          continua igual — o painel interno já era criado e destruído. */}
      {drawerAberto && (
        <CategoriaDrawer
          aberto={drawerAberto}
          fechar={() => setDrawerAberto(false)}
          categoria={editando}
          tipoInicial={tipoNova}
          coresEmUso={coresEmUso}
          onPedirExclusao={setExcluindo}
        />
      )}

      {excluindo && (
        <DialogoExcluirCategoria
          categoria={excluindo}
          fechar={() => setExcluindo(null)}
          aoConcluir={(mensagem) => {
            setExcluindo(null)
            setAviso(mensagem)
            // Só refresh: o reload apagava o aviso recém-definido acima.
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function Bloco({
  titulo,
  tipo,
  categorias,
  editar,
  excluir,
  nova,
  hrefDetalhe,
}: {
  titulo: string
  tipo: TipoLancamento
  categorias: CategoriaFinanceira[]
  editar: (c: CategoriaFinanceira) => void
  excluir: (c: CategoriaFinanceira) => void
  nova: () => void
  hrefDetalhe: (id: string) => string
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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--muted-foreground)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {titulo}
          </p>
          <p style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{categorias.length}</p>
        </div>
        <button type="button" onClick={nova} className="btn-gold-outline">
          + Nova
        </button>
      </div>

      {categorias.length === 0 ? (
        <p style={{ padding: 20, color: "var(--muted-foreground)", fontSize: 13 }}>
          Nenhuma categoria de {tipo === "receita" ? "receita" : "despesa"}.
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
                padding: "10px 20px",
                borderTop: "1px solid var(--border)",
                opacity: c.ativa ? 1 : 0.5,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: corDaCategoria(c),
                  flexShrink: 0,
                }}
              />
              <Link
                href={hrefDetalhe(c.id)}
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: "var(--text-1)",
                  textDecoration: "none",
                  minWidth: 0,
                }}
              >
                {c.nome}
                {!c.ativa && (
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: 6 }}>
                    (inativa)
                  </span>
                )}
              </Link>
              <IconeBotao onClick={() => editar(c)} rotulo={`Editar ${c.nome}`}>
                <IconeLapis />
              </IconeBotao>
              <IconeBotao
                onClick={() => excluir(c)}
                rotulo={`Excluir ${c.nome}`}
                perigo
              >
                <IconeLixeira />
              </IconeBotao>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function IconeBotao({
  onClick,
  rotulo,
  perigo,
  children,
}: {
  onClick: () => void
  rotulo: string
  perigo?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        background: "transparent",
        border: "0.5px solid rgba(255,255,255,0.12)",
        borderRadius: 6,
        cursor: "pointer",
        color: perigo ? "#ef4444" : "var(--text-2)",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function IconeLapis() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconeLixeira() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
    </svg>
  )
}
