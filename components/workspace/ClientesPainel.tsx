"use client"

/* eslint-disable @next/next/no-img-element */

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  criarClienteWorkspaceAction,
  garantirContextoDoClienteAction,
  renomearEmpresaWsAction,
} from "@/lib/workspace-actions"
import { PALETA_ASANA, textoSobre } from "@/lib/workspace-cores"

export interface ItemCliente {
  /** Contexto já existente (área de trabalho pronta). */
  contextoId: string | null
  /** Cliente do cadastro de tráfego ainda sem contexto (nasce no clique). */
  clienteId: string | null
  nome: string
  cor: string | null
  fotoUrl: string | null
  pendentes: number
  atrasadas: number
}

export interface GrupoEmpresa {
  empresa: string
  itens: ItemCliente[]
}

/**
 * Aba Clientes no desenho da nota CLIENTES do Asana: grupos por empresa com
 * chips de cliente (foto/cor + nome). Cada clique abre a ÁREA DE TRABALHO do
 * cliente (Nota | Calendário | Lista). "+ Adicionar cliente" cria um cliente
 * direto no Workspace com nome, empresa, cor exata e foto; o lápis do grupo
 * renomeia a empresa DENTRO do workspace (o cadastro de tráfego não muda).
 */
export default function ClientesPainel({
  grupos,
  empresas,
}: {
  grupos: GrupoEmpresa[]
  empresas: string[]
}) {
  const [criando, setCriando] = useState(false)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={() => setCriando((v) => !v)}
          className="no-ds"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 8,
            background: "#4573d2",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Adicionar cliente
        </button>
      </div>

      {criando && <NovoCliente empresas={empresas} aoFechar={() => setCriando(false)} />}

      {grupos.length === 0 && (
        <div
          className="glass"
          style={{ padding: "28px 16px", borderRadius: 12, textAlign: "center", fontSize: 12, color: "var(--text-4)" }}
        >
          Nenhum cliente ainda. Crie o primeiro no botão acima.
        </div>
      )}

      {grupos.map((g) => (
        <Grupo key={g.empresa} grupo={g} />
      ))}
    </div>
  )
}

/* =================== Novo cliente =================== */

function NovoCliente({ empresas, aoFechar }: { empresas: string[]; aoFechar: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState("")
  const [empresa, setEmpresa] = useState("")
  const [cor, setCor] = useState("#cf9338")
  const [fotoBase64, setFotoBase64] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function escolherFoto(f: File | undefined) {
    if (!f) return
    if (f.size > 3 * 1024 * 1024) {
      setErro("Foto grande demais (máx. 3MB).")
      return
    }
    const leitor = new FileReader()
    leitor.onload = () => setFotoBase64(String(leitor.result))
    leitor.readAsDataURL(f)
  }

  function criar() {
    const n = nome.trim()
    if (!n) {
      setErro("Informe o nome do cliente.")
      return
    }
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("nome", n)
      fd.set("empresa_nome", empresa.trim())
      fd.set("cor", cor)
      if (fotoBase64) fd.set("foto_base64", fotoBase64)
      const r = await criarClienteWorkspaceAction(fd)
      if (!r.ok || !r.id) {
        setErro(r.erro ?? "Não foi possível criar.")
        return
      }
      router.push(`/dashboard/workspace/c/${r.id}`)
      router.refresh()
    })
  }

  return (
    <div className="glass" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={rotuloCampo}>
          Nome do cliente
          <input
            autoFocus
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criar()}
            maxLength={120}
            className="glass-input"
            style={inputCampo}
            disabled={pending}
          />
        </label>
        <label style={rotuloCampo}>
          Empresa
          <input
            type="text"
            list="ws-empresas"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            maxLength={120}
            placeholder="Escolha ou digite uma nova"
            className="glass-input"
            style={inputCampo}
            disabled={pending}
          />
          <datalist id="ws-empresas">
            {empresas.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </label>
      </div>

      <div>
        <span style={miniRotulo}>Cor da identidade visual</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 5 }}>
          {PALETA_ASANA.filter((c) => c.nome !== "Nenhuma").map((c) => (
            <button
              key={c.hex}
              type="button"
              aria-label={c.nome}
              title={c.nome}
              onClick={() => setCor(c.hex)}
              className="no-ds"
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: c.hex,
                border: cor === c.hex ? "2px solid #fff" : "2px solid transparent",
                cursor: "pointer",
              }}
            />
          ))}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>
            <input
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              style={{ width: 26, height: 26, border: "none", background: "none", padding: 0, cursor: "pointer" }}
            />
            {cor.toUpperCase()}
          </label>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={miniRotulo}>Foto de perfil (opcional)</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => escolherFoto(e.target.files?.[0])}
          style={{ display: "none" }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="no-ds" style={botaoSecundario}>
          {fotoBase64 ? "Trocar foto" : "Subir foto"}
        </button>
        {fotoBase64 && (
          <img src={fotoBase64} alt="Prévia" width={30} height={30} style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover" }} />
        )}
      </div>

      {erro && <p style={{ fontSize: 11, color: "#e24b4a", margin: 0 }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={criar}
          disabled={pending || !nome.trim()}
          className="no-ds"
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "7px 16px",
            borderRadius: 6,
            background: "#4573d2",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            opacity: pending || !nome.trim() ? 0.5 : 1,
          }}
        >
          {pending ? "Criando…" : "Criar cliente e abrir workspace"}
        </button>
        <button type="button" onClick={aoFechar} className="no-ds" style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* =================== Grupo de empresa =================== */

function Grupo({ grupo }: { grupo: GrupoEmpresa }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(grupo.empresa)
  const [erro, setErro] = useState<string | null>(null)

  function renomear() {
    const n = nome.trim()
    if (!n || n === grupo.empresa) {
      setEditando(false)
      return
    }
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("de", grupo.empresa)
      fd.set("para", n)
      const r = await renomearEmpresaWsAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível renomear.")
        return
      }
      setEditando(false)
      router.refresh()
    })
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {editando ? (
          <input
            autoFocus
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={renomear}
            onKeyDown={(e) => {
              if (e.key === "Enter") renomear()
              if (e.key === "Escape") setEditando(false)
            }}
            maxLength={120}
            className="glass-input"
            style={{ fontSize: 13, fontWeight: 700, padding: "5px 9px", borderRadius: 6 }}
            disabled={pending}
          />
        ) : (
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>
            {grupo.empresa}:
          </h2>
        )}
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          aria-label={`Renomear ${grupo.empresa}`}
          title="Renomear empresa (só no Workspace)"
          className="no-ds ws-btn-icone"
          style={{ width: 24, height: 24 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </button>
        {erro && <span style={{ fontSize: 10, color: "#e24b4a" }}>{erro}</span>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {grupo.itens.map((item) => (
          <ChipCliente key={item.contextoId ?? item.clienteId ?? item.nome} item={item} />
        ))}
      </div>
    </section>
  )
}

/** Chip de cliente, como na nota CLIENTES do Asana: ícone + nome. */
function ChipCliente({ item }: { item: ItemCliente }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function abrir() {
    if (item.contextoId) {
      router.push(`/dashboard/workspace/c/${item.contextoId}`)
      return
    }
    if (!item.clienteId) return
    // Cliente do cadastro de tráfego sem pasta ainda: nasce agora.
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("cliente_id", item.clienteId as string)
      const r = await garantirContextoDoClienteAction(fd)
      if (!r.ok || !r.id) {
        setErro(r.erro ?? "Não foi possível abrir.")
        return
      }
      router.push(`/dashboard/workspace/c/${r.id}`)
    })
  }

  const corIcone = item.cor ?? "#6d6e6f"

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={pending}
      className="no-ds glass glass-hover"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 8,
        border: "none",
        cursor: pending ? "wait" : "pointer",
        color: "var(--text-1)",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {item.fotoUrl ? (
        <img
          src={item.fotoUrl}
          alt=""
          width={22}
          height={22}
          style={{ width: 22, height: 22, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: corIcone,
            color: textoSobre(corIcone),
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {item.nome.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span style={{ fontSize: 13, fontWeight: 600 }}>{item.nome}</span>
      {item.atrasadas > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "rgba(226,75,74,0.16)", color: "#e24b4a" }}>
          {item.atrasadas}
        </span>
      )}
      {item.pendentes > 0 && (
        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "var(--surface-3)", color: "var(--text-3)" }}>
          {item.pendentes}
        </span>
      )}
      {erro && <span style={{ fontSize: 10, color: "#e24b4a" }}>{erro}</span>}
    </button>
  )
}

const rotuloCampo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 10,
  color: "var(--text-4)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  flex: "1 1 200px",
}

const inputCampo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 10px",
  borderRadius: 8,
}

const miniRotulo: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-4)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
}

const botaoSecundario: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "var(--text-2)",
  cursor: "pointer",
}
