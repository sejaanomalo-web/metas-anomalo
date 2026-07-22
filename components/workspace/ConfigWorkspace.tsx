"use client"

/* eslint-disable @next/next/no-img-element */

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { salvarPreferenciaAction } from "@/lib/workspace-actions"
import Avatar from "./Avatar"
import type { PreferenciaUsuario } from "@/lib/workspace-tipos"

/**
 * Configurações do Workspace — preferências DO USUÁRIO logado:
 *   • foto de perfil (o avatar que aparece nos cartões do calendário
 *     compartilhado e nos comentários);
 *   • modo de cor do calendário: colorido (cor do cliente em cada cartão)
 *     ou monocromático.
 */
export default function ConfigWorkspace({
  pref,
  meuNome,
}: {
  pref: PreferenciaUsuario
  meuNome: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [fotoBase64, setFotoBase64] = useState<string | null>(null)
  const [removerFoto, setRemoverFoto] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fotoPreview = removerFoto ? null : fotoBase64 ?? pref.foto_url

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

  function salvar(campos: { modo_cor?: "colorido" | "mono"; comFoto?: boolean }) {
    setErro(null)
    setSalvo(false)
    startTransition(async () => {
      const fd = new FormData()
      if (campos.modo_cor) fd.set("modo_cor", campos.modo_cor)
      if (campos.comFoto && fotoBase64) fd.set("foto_base64", fotoBase64)
      if (campos.comFoto && removerFoto) fd.set("remover_foto", "1")
      const r = await salvarPreferenciaAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível salvar.")
        return
      }
      setSalvo(true)
      setFotoBase64(null)
      setRemoverFoto(false)
      router.refresh()
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
      {(erro || salvo || pending) && (
        <p role="status" style={{ fontSize: 11, margin: 0, color: erro ? "#e24b4a" : pending ? "var(--text-4)" : "#5da283" }}>
          {erro ?? (pending ? "Salvando…" : "Salvo")}
        </p>
      )}

      {/* ---------- Foto de perfil ---------- */}
      <section className="glass" style={{ padding: 14, borderRadius: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px", color: "var(--text-1)" }}>
          Sua foto de perfil
        </h3>
        <p style={{ fontSize: 11, color: "var(--text-4)", margin: "0 0 10px" }}>
          Aparece nos cartões do calendário compartilhado e nos comentários —
          só a sua; cada pessoa configura a própria aqui.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {fotoPreview ? (
            <img
              src={fotoPreview}
              alt="Sua foto"
              width={56}
              height={56}
              style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <Avatar nome={meuNome} tamanho={56} />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => escolherFoto(e.target.files?.[0])}
            style={{ display: "none" }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className="no-ds" style={botao}>
            {fotoPreview ? "Trocar foto" : "Subir foto"}
          </button>
          {pref.foto_url && !removerFoto && (
            <button
              type="button"
              onClick={() => {
                setRemoverFoto(true)
                setFotoBase64(null)
              }}
              className="no-ds"
              style={{ ...botao, color: "#e24b4a", borderColor: "rgba(226,75,74,0.4)" }}
            >
              Remover
            </button>
          )}
          {(fotoBase64 || removerFoto) && (
            <button
              type="button"
              onClick={() => salvar({ comFoto: true })}
              disabled={pending}
              className="no-ds"
              style={{ ...botao, background: "#4573d2", color: "#fff", border: "none" }}
            >
              Salvar foto
            </button>
          )}
        </div>
      </section>

      {/* ---------- Modo de cor ---------- */}
      <section className="glass" style={{ padding: 14, borderRadius: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px", color: "var(--text-1)" }}>
          Cores do calendário
        </h3>
        <p style={{ fontSize: 11, color: "var(--text-4)", margin: "0 0 10px" }}>
          Colorido pinta cada cartão com a cor do cliente/projeto (como o
          Asana). Monocromático deixa tudo neutro.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              { valor: "colorido", rotulo: "Colorido" },
              { valor: "mono", rotulo: "Monocromático" },
            ] as const
          ).map((op) => {
            const ativo = pref.modo_cor === op.valor
            return (
              <button
                key={op.valor}
                type="button"
                onClick={() => salvar({ modo_cor: op.valor })}
                disabled={pending || ativo}
                className="no-ds"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: ativo ? "1px solid #4573d2" : "1px solid rgba(255,255,255,0.15)",
                  background: ativo ? "rgba(69,115,210,0.18)" : "transparent",
                  color: ativo ? "#7aa5f8" : "var(--text-2)",
                  cursor: ativo ? "default" : "pointer",
                }}
              >
                {op.rotulo}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

const botao: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 14px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "var(--text-2)",
  cursor: "pointer",
}
