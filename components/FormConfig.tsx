"use client"

import { useState } from "react"

type TipoResumo = "diario" | "semanal" | "mensal"

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
    <div className="space-y-6">
      <SecaoResumo
        titulo="Resumo diário"
        legenda="☕ Status do dia para usar todo fim de dia, depois que os dados reais do dia estiverem no Supabase."
        mensagem={mensagemDiario}
        tipo="diario"
      />

      <SecaoResumo
        titulo="Resumo semanal"
        legenda="📊 Consolidado da semana + comissionamento estimado. Inclui link para o formulário de dados da semana."
        mensagem={mensagemSemanal}
        tipo="semanal"
      />

      <SecaoResumo
        titulo="Resumo mensal"
        legenda="🏆 Fechamento do mês: metas por empresa, tráfego pago e comissionamento final com destaques."
        mensagem={mensagemMensal}
        tipo="mensal"
      />
    </div>
  )
}

function SecaoResumo({
  titulo,
  legenda,
  mensagem,
  tipo,
}: {
  titulo: string
  legenda: string
  mensagem: string
  tipo: TipoResumo
}) {
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState(false)

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
          marginBottom: 14,
        }}
      >
        {mensagem}
      </pre>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={copiar}
          className="btn-gold-filled uppercase"
        >
          {copiado ? "Copiado ✓" : "Copiar mensagem"}
        </button>
        {erro && (
          <span style={{ fontSize: 11, color: "#e24b4a" }}>
            Não consegui copiar — selecione o texto acima e use Ctrl+C.
          </span>
        )}
        {copiado && (
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 300,
            }}
          >
            Cole no WhatsApp · emojis e formatação preservados
          </span>
        )}
      </div>
    </div>
  )
}
