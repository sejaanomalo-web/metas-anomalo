"use client"

/* eslint-disable @next/next/no-img-element */

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { atualizarContextoAction } from "@/lib/workspace-actions"
import { PALETA_ASANA, textoSobre } from "@/lib/workspace-cores"
import type { Contexto } from "@/lib/workspace-tipos"

const ABAS: { chave: string; rotulo: string }[] = [
  { chave: "nota", rotulo: "Nota" },
  { chave: "calendario", rotulo: "Calendário" },
  { chave: "lista", rotulo: "Lista" },
]

/**
 * Cabeçalho da área do cliente, no desenho do projeto do Asana: ícone
 * (foto de perfil ou quadrado na cor da identidade), nome, e as abas
 * Nota | Calendário | Lista. O lápis abre o editor completo: nome, empresa,
 * COR EXATA (input color + paleta do Asana) e foto de perfil — a cor escolhida
 * pinta os cartões do cliente em todos os calendários.
 */
export default function ClienteHeader({
  contexto,
  abaAtiva,
}: {
  contexto: Contexto
  abaAtiva: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [nome, setNome] = useState(contexto.nome)
  const [empresa, setEmpresa] = useState(contexto.empresa_nome ?? "")
  const [cor, setCor] = useState(contexto.cor ?? "#cf9338")
  const [fotoBase64, setFotoBase64] = useState<string | null>(null)
  const [removerFoto, setRemoverFoto] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fotoPreview = removerFoto ? null : fotoBase64 ?? contexto.foto_url

  function urlAba(chave: string): string {
    const qs = new URLSearchParams(searchParams.toString())
    qs.set("aba", chave)
    qs.delete("tarefa")
    return `${pathname}?${qs.toString()}`
  }

  function escolherFoto(f: File | undefined) {
    if (!f) return
    if (f.size > 3 * 1024 * 1024) {
      setErro("Foto grande demais (máx. 3MB).")
      return
    }
    const leitor = new FileReader()
    leitor.onload = () => {
      setFotoBase64(String(leitor.result))
      setRemoverFoto(false)
    }
    leitor.readAsDataURL(f)
  }

  function salvar() {
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", contexto.id)
      fd.set("nome", nome.trim())
      fd.set("empresa_nome", empresa.trim())
      fd.set("cor", cor)
      if (fotoBase64) fd.set("foto_base64", fotoBase64)
      if (removerFoto) fd.set("remover_foto", "1")
      const r = await atualizarContextoAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível salvar.")
        return
      }
      setEditando(false)
      setFotoBase64(null)
      setRemoverFoto(false)
      router.refresh()
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0 8px" }}>
        <Link
          href="/dashboard/workspace/clientes"
          aria-label="Voltar para Clientes"
          className="ws-btn-icone"
          style={{ textDecoration: "none", color: "var(--text-3)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>

        {fotoPreview ? (
          <img
            src={fotoPreview}
            alt={contexto.nome}
            width={34}
            height={34}
            style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <span
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: contexto.cor ?? "#6d6e6f",
              color: textoSobre(contexto.cor ?? "#6d6e6f"),
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {contexto.nome.slice(0, 1).toUpperCase()}
          </span>
        )}

        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              margin: 0,
              color: "var(--text-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {contexto.nome}
          </h1>
          {contexto.empresa_nome && (
            <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>
              {contexto.empresa_nome}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          aria-label="Editar cliente"
          title="Editar nome, cor, empresa e foto"
          className="no-ds ws-btn-icone"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </button>

        {pending && <span style={{ fontSize: 11, color: "var(--text-4)" }}>Salvando…</span>}
        {erro && <span style={{ fontSize: 11, color: "#e24b4a" }}>{erro}</span>}
      </div>

      {editando && (
        <div
          className="glass"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 12,
            borderRadius: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={rotuloCampo}>
              Nome
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={120}
                className="glass-input"
                style={inputCampo}
              />
            </label>
            <label style={rotuloCampo}>
              Empresa
              <input
                type="text"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                maxLength={120}
                placeholder="Ex: ASSESSORIA SUN"
                className="glass-input"
                style={inputCampo}
              />
            </label>
          </div>

          <div>
            <span style={{ fontSize: 10, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Cor da identidade visual
            </span>
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
              <label
                title="Cor exata"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  color: "var(--text-3)",
                  cursor: "pointer",
                }}
              >
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
            <span style={{ fontSize: 10, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Foto de perfil
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => escolherFoto(e.target.files?.[0])}
              style={{ display: "none" }}
            />
            <button type="button" onClick={() => fileRef.current?.click()} className="no-ds" style={botaoSecundario}>
              {fotoPreview ? "Trocar foto" : "Subir foto"}
            </button>
            {fotoPreview && (
              <button
                type="button"
                onClick={() => {
                  setRemoverFoto(true)
                  setFotoBase64(null)
                }}
                className="no-ds"
                style={{ ...botaoSecundario, color: "#e24b4a", borderColor: "rgba(226,75,74,0.4)" }}
              >
                Remover foto
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={salvar}
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
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="no-ds"
              style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <nav
        style={{
          display: "flex",
          gap: 2,
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {ABAS.map((a) => {
          const ativo = abaAtiva === a.chave
          return (
            <Link
              key={a.chave}
              href={urlAba(a.chave)}
              scroll={false}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "7px 10px",
                fontSize: 13,
                fontWeight: ativo ? 600 : 400,
                color: ativo ? "var(--text-1)" : "var(--text-3)",
                textDecoration: "none",
                borderBottom: ativo ? "2px solid var(--text-1)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {a.rotulo}
            </Link>
          )
        })}
      </nav>
    </div>
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
  flex: "1 1 180px",
}

const inputCampo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 10px",
  borderRadius: 8,
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
