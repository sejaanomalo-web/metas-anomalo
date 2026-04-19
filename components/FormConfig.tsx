"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { ConfigResumos, Contato } from "@/lib/configuracoes"
import { salvarConfigAction } from "@/lib/configuracoes-actions"

type TipoResumo = "diario" | "semanal" | "mensal"

function sanitizarNumero(raw: string): string {
  return raw.replace(/[^\d]/g, "")
}

function linkWhatsApp(numero: string, mensagem: string): string {
  const num = sanitizarNumero(numero)
  return `https://wa.me/${num}?text=${encodeURIComponent(mensagem)}`
}

export default function FormConfig({
  configInicial,
  mensagemDiario,
  mensagemSemanal,
  mensagemMensal,
}: {
  configInicial: ConfigResumos
  mensagemDiario: string
  mensagemSemanal: string
  mensagemMensal: string
}) {
  const [contatos, setContatos] = useState<Contato[]>(
    configInicial.contatos.length > 0
      ? configInicial.contatos
      : [{ nome: "", numero: "" }]
  )
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  async function salvar() {
    const fd = new FormData()
    for (const c of contatos) {
      if (!c.numero.trim()) continue
      fd.append(
        "contato",
        JSON.stringify({ nome: c.nome.trim(), numero: c.numero.trim() })
      )
    }
    const r = await salvarConfigAction(fd)
    setStatus(r.ok ? "Salvo ✓" : r.erro ?? "Erro")
    if (r.ok) {
      setTimeout(() => setStatus(null), 2500)
      router.refresh()
    }
  }

  function setContato(idx: number, patch: Partial<Contato>) {
    setContatos(contatos.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  function adicionar() {
    setContatos([...contatos, { nome: "", numero: "" }])
  }

  function remover(idx: number) {
    const novos = contatos.filter((_, i) => i !== idx)
    setContatos(novos.length > 0 ? novos : [{ nome: "", numero: "" }])
  }

  const contatosValidos = contatos.filter((c) => c.numero.trim().length > 0)

  return (
    <div className="space-y-8">
      <div className="glass" style={{ padding: 24 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: "1px",
            color: "#fff",
            textTransform: "uppercase",
            fontWeight: 500,
            marginBottom: 6,
          }}
        >
          Contatos do time
        </p>
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 300,
            marginBottom: 18,
          }}
        >
          Adicione as pessoas que recebem os resumos. Ao clicar nos botões
          abaixo, o WhatsApp abre com a mensagem pronta — é só apertar enviar.
        </p>

        <div className="space-y-2">
          {contatos.map((c, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center"
            >
              <input
                value={c.nome}
                onChange={(e) => setContato(idx, { nome: e.target.value })}
                placeholder="Nome"
                className="glass-input"
                style={{ padding: "10px 12px", fontSize: 13 }}
              />
              <input
                value={c.numero}
                onChange={(e) =>
                  setContato(idx, { numero: sanitizarNumero(e.target.value) })
                }
                placeholder="5545999999999"
                className="glass-input"
                inputMode="numeric"
                style={{ padding: "10px 12px", fontSize: 13 }}
              />
              <button
                type="button"
                onClick={() => remover(idx)}
                aria-label="Remover"
                style={{
                  color: "rgba(255,255,255,0.3)",
                  fontSize: 18,
                  padding: "0 8px",
                  lineHeight: 1,
                }}
                className="hover:text-[#e24b4a] transition"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={adicionar}
            style={{
              marginTop: 4,
              width: "100%",
              padding: "8px 0",
              border: "0.5px dashed rgba(255,255,255,0.15)",
              borderRadius: 8,
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              fontWeight: 400,
            }}
            className="hover:text-[#C9953A] hover:border-[#C9953A55] transition"
          >
            + Adicionar contato
          </button>
        </div>

        <div className="flex items-center gap-3 pt-4 mt-4" style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)" }}>
          <button
            type="button"
            onClick={() => startTransition(() => salvar())}
            disabled={pending}
            className="btn-gold-filled uppercase"
            style={{ opacity: pending ? 0.5 : 1 }}
          >
            {pending ? "Salvando..." : "Salvar contatos"}
          </button>
          {status && (
            <span
              style={{
                fontSize: 12,
                color: status.includes("✓") ? "#4caf50" : "#e24b4a",
              }}
            >
              {status}
            </span>
          )}
        </div>
      </div>

      <SecaoResumo
        titulo="Resumo diário"
        legenda="☀️ Foto do status de hoje — use toda manhã, depois que os dados reais do dia estiverem no Supabase."
        mensagem={mensagemDiario}
        contatos={contatosValidos}
        tipo="diario"
      />

      <SecaoResumo
        titulo="Resumo semanal"
        legenda="📊 Consolidado da semana + comissionamento estimado. Inclui link para o formulário de dados da semana."
        mensagem={mensagemSemanal}
        contatos={contatosValidos}
        tipo="semanal"
      />

      <SecaoResumo
        titulo="Resumo mensal"
        legenda="🏆 Fechamento do mês: metas por empresa, tráfego pago e comissionamento final com destaques."
        mensagem={mensagemMensal}
        contatos={contatosValidos}
        tipo="mensal"
      />
    </div>
  )
}

function SecaoResumo({
  titulo,
  legenda,
  mensagem,
  contatos,
  tipo,
}: {
  titulo: string
  legenda: string
  mensagem: string
  contatos: Contato[]
  tipo: TipoResumo
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div className="glass" style={{ padding: 24 }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p
          style={{
            fontSize: 11,
            letterSpacing: "1px",
            color: "#fff",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          {titulo}
        </p>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "2px",
            color: "#C9953A",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          {tipo}
        </span>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.45)",
          fontWeight: 300,
          marginTop: 4,
          marginBottom: 14,
        }}
      >
        {legenda}
      </p>

      <details style={{ marginBottom: 14 }}>
        <summary
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.45)",
            cursor: "pointer",
            userSelect: "none",
            padding: "6px 0",
          }}
        >
          Ver prévia da mensagem
        </summary>
        <pre
          style={{
            marginTop: 10,
            padding: "14px 16px",
            background: "rgba(0,0,0,0.4)",
            border: "0.5px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            fontSize: 11,
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.7)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            maxHeight: 280,
            overflow: "auto",
          }}
        >
          {mensagem}
        </pre>
        <button
          type="button"
          onClick={copiar}
          style={{
            marginTop: 8,
            fontSize: 10,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.5)",
            border: "0.5px solid rgba(255,255,255,0.1)",
            padding: "4px 10px",
            borderRadius: 6,
          }}
          className="hover:text-[#C9953A] hover:border-[#C9953A55] transition"
        >
          {copiado ? "Copiado ✓" : "Copiar texto"}
        </button>
      </details>

      {contatos.length === 0 ? (
        <p
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            fontStyle: "italic",
            fontWeight: 300,
          }}
        >
          Adicione ao menos um contato acima para gerar os botões de envio.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {contatos.map((c, idx) => {
            const label = c.nome || c.numero
            const href = linkWhatsApp(c.numero, mensagem)
            return (
              <a
                key={`${tipo}-${idx}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.3px",
                  color: "#C9953A",
                  background: "rgba(201,149,58,0.08)",
                  border: "0.5px solid rgba(201,149,58,0.35)",
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
                className="hover:bg-[#C9953A] hover:text-[#080808]"
              >
                <span style={{ fontSize: 13 }}>💬</span>
                {label}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
