"use client"

import { useState, useTransition } from "react"
import type { ConfigResumos } from "@/lib/configuracoes"
import {
  salvarConfigAction,
  testarResumoAction,
} from "@/lib/configuracoes-actions"

export default function FormConfig({
  configInicial,
}: {
  configInicial: ConfigResumos
}) {
  const [config, setConfig] = useState<ConfigResumos>(configInicial)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const [testando, setTestando] = useState<string | null>(null)

  async function salvar() {
    const fd = new FormData()
    if (config.diario_ativo) fd.set("diario_ativo", "on")
    if (config.semanal_ativo) fd.set("semanal_ativo", "on")
    if (config.mensal_ativo) fd.set("mensal_ativo", "on")
    fd.set("numeros", config.numeros.join(","))
    const r = await salvarConfigAction(fd)
    setStatus(r.ok ? "Salvo ✓" : r.erro ?? "Erro")
  }

  async function testar(tipo: "diario" | "semanal" | "mensal") {
    setTestando(tipo)
    setStatus(null)
    const r = await testarResumoAction(tipo)
    setTestando(null)
    setStatus(r.ok ? "Teste enviado ✓" : r.erro ?? "Erro")
  }

  function setNumero(idx: number, valor: string) {
    const novos = [...config.numeros]
    novos[idx] = valor
    setConfig({ ...config, numeros: novos })
  }

  function adicionarNumero() {
    setConfig({ ...config, numeros: [...config.numeros, ""] })
  }

  function removerNumero(idx: number) {
    setConfig({
      ...config,
      numeros: config.numeros.filter((_, i) => i !== idx),
    })
  }

  return (
    <div className="space-y-6">
      <div className="glass" style={{ padding: 24 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: "1px",
            color: "#fff",
            textTransform: "uppercase",
            fontWeight: 500,
            marginBottom: 16,
          }}
        >
          Resumos automáticos
        </p>

        <div className="space-y-3">
          <ToggleRow
            label="Resumo diário"
            descricao="Todo dia às 07:00 BRT"
            ativo={config.diario_ativo}
            onChange={(v) => setConfig({ ...config, diario_ativo: v })}
            onTestar={() => testar("diario")}
            testando={testando === "diario"}
          />
          <ToggleRow
            label="Resumo semanal"
            descricao="Toda sexta às 17:00 BRT"
            ativo={config.semanal_ativo}
            onChange={(v) => setConfig({ ...config, semanal_ativo: v })}
            onTestar={() => testar("semanal")}
            testando={testando === "semanal"}
          />
          <ToggleRow
            label="Resumo mensal"
            descricao="Último dia do mês às 18:00 BRT"
            ativo={config.mensal_ativo}
            onChange={(v) => setConfig({ ...config, mensal_ativo: v })}
            onTestar={() => testar("mensal")}
            testando={testando === "mensal"}
          />
        </div>
      </div>

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
          Destinatários
        </p>
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 300,
            marginBottom: 16,
          }}
        >
          Números com DDD + DDI (ex: 5545999999999). O número principal em
          WHATSAPP_NUMBER recebe sempre.
        </p>

        <div className="space-y-2">
          {config.numeros.map((n, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={n}
                onChange={(e) => setNumero(idx, e.target.value)}
                placeholder="5545999999999"
                className="glass-input"
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                onClick={() => removerNumero(idx)}
                style={{
                  color: "rgba(255,255,255,0.3)",
                  fontSize: 18,
                  padding: "0 8px",
                }}
                className="hover:text-[#e24b4a] transition"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={adicionarNumero}
            style={{
              marginTop: 4,
              width: "100%",
              padding: "8px 0",
              border: "0.5px dashed rgba(255,255,255,0.15)",
              borderRadius: 8,
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
            }}
            className="hover:text-[#C9953A] hover:border-[#C9953A55] transition"
          >
            + Adicionar número
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => startTransition(() => salvar())}
          disabled={pending}
          className="btn-gold-filled uppercase"
          style={{ opacity: pending ? 0.5 : 1 }}
        >
          {pending ? "Salvando..." : "Salvar configurações"}
        </button>
        {status && (
          <span
            style={{
              fontSize: 12,
              color:
                status.includes("✓") ? "#4caf50" : "#e24b4a",
            }}
          >
            {status}
          </span>
        )}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  descricao,
  ativo,
  onChange,
  onTestar,
  testando,
}: {
  label: string
  descricao: string
  ativo: boolean
  onChange: (v: boolean) => void
  onTestar: () => void
  testando: boolean
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "12px 14px",
        border: "0.5px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
      }}
    >
      <div>
        <p style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{label}</p>
        <p
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            fontWeight: 300,
          }}
        >
          {descricao}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTestar}
          disabled={testando}
          style={{
            fontSize: 10,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
            padding: "4px 10px",
            border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            opacity: testando ? 0.5 : 1,
          }}
          className="hover:text-[#C9953A] hover:border-[#C9953A55] transition"
        >
          {testando ? "Enviando..." : "Testar agora"}
        </button>
        <label className="cursor-pointer">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => onChange(e.target.checked)}
            style={{
              width: 18,
              height: 18,
              accentColor: "#C9953A",
            }}
          />
        </label>
      </div>
    </div>
  )
}
