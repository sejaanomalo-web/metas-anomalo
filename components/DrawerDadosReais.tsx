"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { salvarDadosReaisAction } from "@/lib/dados-reais"
import type { DadosReais } from "@/lib/supabase"
import type { Ano, EmpresaDb, Mes } from "@/lib/data"

interface Props {
  empresa: EmpresaDb
  mes: Mes
  ano: Ano
  supabaseOk: boolean
  tipoEmpresa: "leads-reunioes-contratos" | "hato" | "aton" | "diego"
  existentes: DadosReais | null
}

export default function DrawerDadosReais({
  empresa,
  mes,
  ano,
  supabaseOk,
  tipoEmpresa,
  existentes,
}: Props) {
  const [aberto, setAberto] = useState(false)
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  async function onSubmit(formData: FormData) {
    setErro(null)
    const resultado = await salvarDadosReaisAction(formData)
    if (!resultado.ok) {
      setErro(resultado.erro ?? "Erro desconhecido.")
      return
    }
    setAberto(false)
    router.refresh()
  }

  const rotuloReunioes =
    tipoEmpresa === "aton"
      ? "Orçamentos reais"
      : tipoEmpresa === "hato"
      ? "Vendas influenciador reais"
      : "Reuniões reais"

  const rotuloContratos =
    tipoEmpresa === "aton" || tipoEmpresa === "hato"
      ? "Vendas reais"
      : "Contratos reais"

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        style={{
          background: "transparent",
          border: "0.5px solid #C9953A",
          color: "#C9953A",
          fontSize: 12,
          padding: "8px 16px",
          borderRadius: 4,
          fontWeight: 400,
        }}
        className="hover:bg-[#C9953A] hover:text-[#080808] transition"
      >
        Inserir dados reais
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.7)" }}
          />

          <aside
            className="absolute right-0 top-0 h-full overflow-y-auto"
            style={{
              width: 400,
              background: "#0c0c0c",
              borderLeft: "0.5px solid #1e1e1e",
            }}
          >
            <div
              className="sticky top-0"
              style={{
                background: "rgba(12,12,12,0.95)",
                backdropFilter: "blur(6px)",
                borderBottom: "0.5px solid #141414",
                padding: "20px 24px",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      letterSpacing: "1px",
                      color: "#666",
                      textTransform: "uppercase",
                      fontWeight: 400,
                    }}
                  >
                    {mes} · {ano}
                  </p>
                  <p
                    style={{
                      fontSize: 16,
                      color: "#fff",
                      fontWeight: 500,
                      marginTop: 6,
                    }}
                  >
                    Dados reais
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  style={{ color: "#666", fontSize: 22, lineHeight: 1 }}
                  className="hover:text-[#fff] transition"
                >
                  ×
                </button>
              </div>
            </div>

            {!supabaseOk && (
              <div
                style={{
                  margin: "18px 24px 0",
                  padding: 12,
                  border: "0.5px solid #5a1e1e",
                  background: "#1a0a0a",
                  color: "#e24b4a",
                  fontSize: 12,
                  fontWeight: 400,
                }}
              >
                Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e
                NEXT_PUBLIC_SUPABASE_ANON_KEY no Vercel.
              </div>
            )}

            <form
              action={(fd) => startTransition(() => onSubmit(fd))}
              style={{ padding: 24 }}
            >
              <input type="hidden" name="empresa" value={empresa} />
              <input type="hidden" name="mes" value={mes} />
              <input type="hidden" name="ano" value={ano} />

              <div className="space-y-4">
                <Campo
                  label="Investimento real (R$)"
                  name="investimento_real"
                  tipo="number"
                  step="0.01"
                  defaultValue={existentes?.investimento_real ?? ""}
                />
                <Campo
                  label="Leads reais"
                  name="leads_real"
                  tipo="number"
                  defaultValue={existentes?.leads_real ?? ""}
                />
                <Campo
                  label={rotuloReunioes}
                  name="reunioes_real"
                  tipo="number"
                  defaultValue={existentes?.reunioes_real ?? ""}
                />
                <Campo
                  label={rotuloContratos}
                  name="contratos_real"
                  tipo="number"
                  defaultValue={existentes?.contratos_real ?? ""}
                />
                <Campo
                  label="Faturamento real (R$)"
                  name="faturamento_real"
                  tipo="number"
                  step="0.01"
                  defaultValue={existentes?.faturamento_real ?? ""}
                />
                <Campo
                  label="Criativos entregues"
                  name="criativos_entregues"
                  tipo="number"
                  defaultValue={existentes?.criativos_entregues ?? ""}
                />

                <label className="block">
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.5px",
                      color: "#666",
                      textTransform: "uppercase",
                      fontWeight: 400,
                    }}
                  >
                    Observações
                  </span>
                  <textarea
                    name="observacoes"
                    rows={3}
                    defaultValue={existentes?.observacoes ?? ""}
                    style={{
                      marginTop: 8,
                      width: "100%",
                      background: "#111",
                      border: "0.5px solid #1e1e1e",
                      color: "#ccc",
                      fontSize: 14,
                      padding: "10px 14px",
                      borderRadius: 4,
                      outline: "none",
                      fontWeight: 400,
                    }}
                    placeholder="..."
                  />
                </label>

                {erro && (
                  <p style={{ color: "#e24b4a", fontSize: 12 }}>{erro}</p>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={pending || !supabaseOk}
                    style={{
                      flex: 1,
                      background: "#C9953A",
                      color: "#080808",
                      padding: "10px 0",
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: 4,
                      opacity: pending || !supabaseOk ? 0.5 : 1,
                    }}
                    className="hover:brightness-110 transition"
                  >
                    {pending ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAberto(false)}
                    style={{
                      background: "transparent",
                      border: "0.5px solid #1e1e1e",
                      color: "#666",
                      padding: "10px 16px",
                      fontSize: 13,
                      borderRadius: 4,
                      fontWeight: 400,
                    }}
                    className="hover:text-[#fff] transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  )
}

function Campo({
  label,
  name,
  tipo,
  step,
  defaultValue,
}: {
  label: string
  name: string
  tipo: "number" | "text"
  step?: string
  defaultValue?: string | number | null
}) {
  return (
    <label className="block">
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.5px",
          color: "#666",
          textTransform: "uppercase",
          fontWeight: 400,
        }}
      >
        {label}
      </span>
      <input
        type={tipo}
        name={name}
        step={step}
        defaultValue={defaultValue === null ? "" : defaultValue}
        style={{
          marginTop: 8,
          width: "100%",
          background: "#111",
          border: "0.5px solid #1e1e1e",
          color: "#ccc",
          fontSize: 14,
          padding: "10px 14px",
          borderRadius: 4,
          outline: "none",
          fontWeight: 400,
        }}
        placeholder="—"
      />
    </label>
  )
}
