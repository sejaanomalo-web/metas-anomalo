"use client"

import { useState, useTransition } from "react"
import { registrarVendaClienteAction } from "@/lib/vendas-cliente-actions"
import CampoInteiro from "@/components/inputs/CampoInteiro"
import CampoMoeda from "@/components/inputs/CampoMoeda"

/** Data atual em BRT (UTC-3 sem DST) — default do seletor de data. */
function hojeBRT(): string {
  const agora = new Date()
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000
  return new Date(utcMs - 3 * 60 * 60_000).toISOString().slice(0, 10)
}

/** "2026-06-11" → "11/06/2026" — usado no feedback de sucesso. */
function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

/**
 * Formulário público de vendas do cliente (/vendas/<token>). Mobile-first:
 * 3 campos + observação. Dois caminhos de envio:
 *   • "Registrar venda"  — quantidade ≥ 1 (+ valor opcional)
 *   • "Não tivemos vendas nessa data" — registra confirmação de zero
 *     (importante pra equipe saber que o cliente RESPONDEU, e não esqueceu)
 *
 * Campos numéricos usam os componentes de máscara do projeto: CampoInteiro
 * (só dígitos, clamp 1–999) na quantidade e CampoMoeda ("R$ 1.234,56" na
 * tela, valor-máquina no submit) no valor — o servidor lê via parseNumeroForm.
 */
export default function FormularioVendaCliente({ token }: { token: string }) {
  const [data, setData] = useState(hojeBRT())
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<
    { tipo: "venda" | "zero"; data: string } | null
  >(null)

  async function enviar(fd: FormData) {
    setErro(null)
    const resultado = await registrarVendaClienteAction(fd)
    if (resultado.ok) {
      const qtd = parseInt(String(fd.get("quantidade") ?? "0"), 10) || 0
      setSucesso({ tipo: qtd > 0 ? "venda" : "zero", data: String(fd.get("data")) })
    } else {
      setErro(resultado.erro ?? "Erro desconhecido. Tente novamente.")
    }
  }

  function enviarSemVendas() {
    const fd = new FormData()
    fd.set("token", token)
    fd.set("data", data)
    fd.set("quantidade", "0")
    startTransition(() => enviar(fd))
  }

  if (sucesso) {
    return (
      <div className="glass" style={{ padding: 28, textAlign: "center" }}>
        <p style={{ fontSize: 34, lineHeight: 1 }} aria-hidden="true">
          {sucesso.tipo === "venda" ? "🎉" : "✅"}
        </p>
        <p
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text-1)",
            marginTop: 14,
          }}
        >
          {sucesso.tipo === "venda"
            ? "Venda registrada — obrigado!"
            : "Confirmação registrada — obrigado!"}
        </p>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-3)",
            marginTop: 8,
            lineHeight: 1.6,
          }}
        >
          {sucesso.tipo === "venda"
            ? `O registro do dia ${dataBR(sucesso.data)} já entrou no seu painel.`
            : `Anotamos que não houve vendas em ${dataBR(sucesso.data)}.`}
        </p>
        <button
          type="button"
          onClick={() => {
            setSucesso(null)
            setErro(null)
          }}
          className="btn-gold-filled uppercase"
          style={{ marginTop: 20 }}
        >
          Registrar outra venda
        </button>
      </div>
    )
  }

  return (
    <div className="glass" style={{ padding: 28 }}>
      <form
        action={(fd) => startTransition(() => enviar(fd))}
        className="space-y-4"
      >
        <input type="hidden" name="token" value={token} />

        <Campo label="Data da venda">
          <input
            type="date"
            name="data"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
            max={hojeBRT()}
            className="glass-input"
            style={inputEstilo}
          />
        </Campo>

        <Campo label="Quantas vendas?">
          <CampoInteiro
            name="quantidade"
            maxDigitos={3}
            valorMax={999}
            defaultValue={1}
            required
            className="glass-input"
            style={inputEstilo}
          />
        </Campo>

        <Campo label="Valor total das vendas (R$) — opcional">
          <CampoMoeda
            name="valor"
            className="glass-input"
            style={inputEstilo}
            placeholder="R$ 0,00"
          />
        </Campo>

        <Campo label="Observações — opcional">
          <textarea
            name="observacoes"
            rows={3}
            maxLength={600}
            className="glass-input"
            style={{ ...inputEstilo, resize: "vertical", minHeight: 72 }}
            placeholder="Ex.: cliente chegou pelo WhatsApp, fechou o plano X…"
          />
        </Campo>

        <div style={{ marginTop: 18 }}>
          <button
            type="submit"
            disabled={pending}
            className="btn-gold-filled uppercase"
            style={{ width: "100%", opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Enviando…" : "Registrar venda"}
          </button>
          <button
            type="button"
            onClick={enviarSemVendas}
            disabled={pending}
            className="hover:text-[#C9953A] transition no-ds"
            style={{
              width: "100%",
              marginTop: 12,
              padding: "10px 14px",
              fontSize: 11,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
              border: "0.5px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              background: "transparent",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Não tivemos vendas nessa data
          </button>
          {erro && (
            <p
              style={{
                fontSize: 12,
                color: "#e24b4a",
                fontWeight: 500,
                marginTop: 12,
                textAlign: "center",
              }}
            >
              {erro}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

const inputEstilo: React.CSSProperties = {
  marginTop: 8,
  width: "100%",
  padding: "11px 14px",
  fontSize: 14,
  fontWeight: 400,
}

function Campo({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span
        style={{
          fontSize: 10,
          letterSpacing: "1.5px",
          color: "rgba(255,255,255,0.45)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}
