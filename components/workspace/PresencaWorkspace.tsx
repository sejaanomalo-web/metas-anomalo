"use client"

import { useEffect, useState } from "react"
import { createClient, type RealtimeChannel } from "@supabase/supabase-js"
import Avatar from "./Avatar"

interface Presente {
  id: string
  nome: string
  foto: string | null
}

/**
 * Bolinhas de quem está ATIVO no Workspace agora (canto superior direito,
 * como os avatares do topo do Asana). Usa presence do Supabase Realtime:
 * cada aba aberta anuncia {id, nome, foto} num canal compartilhado — nada
 * disso toca banco nem PII além do nome que todos já veem.
 * Clique abre a lista com os nomes.
 */
export default function PresencaWorkspace({
  meuId,
  meuNome,
  minhaFoto,
}: {
  meuId: string
  meuNome: string
  minhaFoto?: string | null
}) {
  const [presentes, setPresentes] = useState<Presente[]>([])
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const canal: RealtimeChannel = supabase.channel("ws-presenca", {
      config: { presence: { key: meuId } },
    })

    canal
      .on("presence", { event: "sync" }, () => {
        const estado = canal.presenceState<Presente>()
        const lista: Presente[] = []
        for (const chave of Object.keys(estado)) {
          const meta = estado[chave][0]
          if (meta?.id && meta?.nome) {
            lista.push({ id: meta.id, nome: meta.nome, foto: meta.foto ?? null })
          }
        }
        // Eu primeiro, resto por nome — ordem estável entre syncs.
        lista.sort((a, b) =>
          a.id === meuId ? -1 : b.id === meuId ? 1 : a.nome.localeCompare(b.nome, "pt-BR")
        )
        setPresentes(lista)
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await canal.track({ id: meuId, nome: meuNome, foto: minhaFoto ?? null })
        }
      })

    return () => {
      supabase.removeChannel(canal)
    }
  }, [meuId, meuNome, minhaFoto])

  if (presentes.length === 0) return null

  const visiveis = presentes.slice(0, 5)
  const extras = presentes.length - visiveis.length

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={`${presentes.length} pessoa(s) ativa(s) no Workspace`}
        title="Quem está ativo agora"
        className="no-ds"
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 2,
        }}
      >
        {visiveis.map((p, i) => (
          <span
            key={p.id}
            style={{
              marginLeft: i === 0 ? 0 : -8,
              borderRadius: "50%",
              border: "2px solid var(--ws-fundo, #1e2022)",
              display: "inline-flex",
              zIndex: visiveis.length - i,
            }}
          >
            <Avatar nome={p.nome} foto={p.foto} tamanho={24} />
          </span>
        ))}
        {extras > 0 && (
          <span
            style={{
              marginLeft: -8,
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "var(--surface-3)",
              color: "var(--text-3)",
              fontSize: 10,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid var(--ws-fundo, #1e2022)",
            }}
          >
            +{extras}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <button
            type="button"
            aria-label="Fechar lista"
            onClick={() => setAberto(false)}
            className="no-ds"
            style={{ position: "fixed", inset: 0, background: "transparent", border: "none", cursor: "default", zIndex: 30 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 200,
              background: "var(--surface-2)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              padding: 8,
              zIndex: 31,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}
          >
            <p style={{ fontSize: 10, color: "var(--text-4)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Ativos agora · {presentes.length}
            </p>
            {presentes.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px" }}>
                <Avatar nome={p.nome} foto={p.foto} tamanho={22} />
                <span style={{ fontSize: 12, color: "var(--text-1)" }}>
                  {p.nome}
                  {p.id === meuId ? " (você)" : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
