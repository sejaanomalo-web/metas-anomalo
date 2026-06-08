"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type TipoResumo = "diario" | "semanal" | "mensal"

/**
 * Resumos para WhatsApp em formato COMPACTO: cada um ocupa uma linha só
 * — "Resumo diário" + botões "Copiar mensagem" e "Atualizar dados". A
 * mensagem completa só aparece ao clicar no NOME (expande/colapsa).
 */
export default function FormConfig({
  mensagemDiario,
  mensagemSemanal,
  mensagemMensal,
}: {
  mensagemDiario: string
  mensagemSemanal: string
  mensagemMensal: string
}) {
  return (
    <section className="glass" style={{ padding: "8px 4px" }}>
      <LinhaResumo
        titulo="Resumo diário"
        legenda="☕ Status do dia para usar todo fim de dia, depois que os dados reais do dia estiverem no Supabase."
        mensagem={mensagemDiario}
        tipo="diario"
        primeira
      />
      <LinhaResumo
        titulo="Resumo semanal"
        legenda="📊 Consolidado da semana com funil, eficiência e movimento por empresa. Inclui link para o formulário de dados da semana."
        mensagem={mensagemSemanal}
        tipo="semanal"
      />
      <LinhaResumo
        titulo="Resumo mensal"
        legenda="🏆 Fechamento do mês: metas por empresa, tráfego pago e destaques de performance."
        mensagem={mensagemMensal}
        tipo="mensal"
      />
    </section>
  )
}

function LinhaResumo({
  titulo,
  legenda,
  mensagem,
  tipo,
  primeira,
}: {
  titulo: string
  legenda: string
  mensagem: string
  tipo: TipoResumo
  primeira?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState(false)
  const [atualizado, setAtualizado] = useState(false)
  const [atualizando, startAtualizacao] = useTransition()
  const router = useRouter()

  async function copiar() {
    setErro(false)
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setErro(true)
      setTimeout(() => setErro(false), 2500)
    }
  }

  function atualizar() {
    setAtualizado(false)
    startAtualizacao(() => {
      router.refresh()
      setTimeout(() => {
        setAtualizado(true)
        setTimeout(() => setAtualizado(false), 1800)
      }, 200)
    })
  }

  return (
    <div
      style={{
        padding: "14px 18px",
        borderTop: primeira ? "none" : "0.5px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Nome clicável (expande/colapsa a mensagem completa) */}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="no-ds"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
          aria-expanded={aberto}
        >
          <span
            aria-hidden="true"
            style={{
              color: "var(--accent, #C9953A)",
              fontSize: 12,
              transform: aberto ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
            }}
          >
            ▸
          </span>
          <span
            style={{
              fontSize: 12,
              letterSpacing: "0.5px",
              color: "#fff",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {titulo}
          </span>
        </button>

        {/* Botões na mesma linha */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={copiar}
            className="btn-gold-filled uppercase"
            style={{ padding: "8px 14px", fontSize: 11 }}
          >
            {copiado ? "Copiado ✓" : "Copiar mensagem"}
          </button>
          <button
            type="button"
            onClick={atualizar}
            disabled={atualizando}
            style={{
              padding: "8px 14px",
              fontSize: 11,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              color: atualizado ? "#4caf50" : "rgba(255,255,255,0.55)",
              border: `0.5px solid ${
                atualizado ? "rgba(76,175,80,0.45)" : "rgba(255,255,255,0.15)"
              }`,
              borderRadius: 6,
              background: "transparent",
              fontWeight: 500,
              opacity: atualizando ? 0.6 : 1,
            }}
            className="hover:text-[#C9953A] hover:border-[#C9953A55] transition"
          >
            {atualizando
              ? "Atualizando..."
              : atualizado
              ? "Atualizado ✓"
              : "Atualizar dados"}
          </button>
        </div>
      </div>

      {erro && (
        <p style={{ fontSize: 11, color: "#e24b4a", marginTop: 8 }}>
          Não consegui copiar · expanda e use Ctrl+C.
        </p>
      )}

      {/* Mensagem completa — só quando expandido */}
      {aberto && (
        <>
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 300,
              marginTop: 12,
              marginBottom: 10,
            }}
          >
            {legenda}
          </p>
          <pre
            style={{
              padding: "14px 16px",
              background: "rgba(0,0,0,0.4)",
              border: "0.5px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.78)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              maxHeight: 360,
              overflow: "auto",
            }}
          >
            {mensagem}
          </pre>
        </>
      )}
    </div>
  )
}
