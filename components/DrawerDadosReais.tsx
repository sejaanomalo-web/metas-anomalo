"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { salvarDadosReaisAction } from "@/lib/dados-reais"
import type { DadosReais } from "@/lib/supabase"
import { ORIGEM_PADRAO, type Ano, type EmpresaDb, type Mes, type OrigemDadosReais } from "@/lib/data"

interface Props {
  empresa: EmpresaDb
  mes: Mes
  ano: Ano
  supabaseOk: boolean
  tipoEmpresa: "leads-reunioes-contratos" | "hato" | "aton" | "diego"
  existentes: DadosReais | null
  origem?: OrigemDadosReais
}

export default function DrawerDadosReais({
  empresa,
  mes,
  ano,
  supabaseOk,
  tipoEmpresa,
  existentes,
  origem = ORIGEM_PADRAO,
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

  const ehPago = origem === "pago"
  const rotuloOrigem = ehPago ? "Tráfego pago" : "Prospecção orgânica"

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="btn-gold-filled uppercase"
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
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
          />

          <aside
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto"
            style={{
              background: "rgba(15,15,15,0.85)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderLeft: "0.5px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              className="sticky top-0"
              style={{
                background: "rgba(10,10,10,0.7)",
                backdropFilter: "blur(16px)",
                borderBottom: "0.5px solid rgba(255,255,255,0.06)",
                padding: "18px 24px",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    style={{
                      fontSize: 9,
                      letterSpacing: "2px",
                      color: "rgba(255,255,255,0.35)",
                      textTransform: "uppercase",
                      fontWeight: 500,
                    }}
                  >
                    Dados reais · {mes} {ano}
                  </p>
                  <p
                    style={{
                      fontSize: 16,
                      color: "#ffffff",
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {empresa}
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      letterSpacing: "1.2px",
                      color: "#C9953A",
                      fontWeight: 600,
                      marginTop: 6,
                      textTransform: "uppercase",
                    }}
                  >
                    {rotuloOrigem}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 22,
                    lineHeight: 1,
                  }}
                  className="hover:text-white transition"
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
                  border: "0.5px solid rgba(226,75,74,0.35)",
                  background: "rgba(226,75,74,0.08)",
                  color: "#e24b4a",
                  fontSize: 12,
                  borderRadius: 8,
                }}
              >
                Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e
                NEXT_PUBLIC_SUPABASE_ANON_KEY no Vercel.
              </div>
            )}

            <form
              action={(fd) => startTransition(() => onSubmit(fd))}
              style={{ padding: 24 }}
              className="space-y-4"
            >
              <input type="hidden" name="empresa" value={empresa} />
              <input type="hidden" name="mes" value={mes} />
              <input type="hidden" name="ano" value={ano} />
              <input type="hidden" name="origem" value={origem} />

              {ehPago && (
                <Campo
                  label="Investimento real (R$)"
                  name="investimento_real"
                  tipo="number"
                  step="0.01"
                  defaultValue={existentes?.investimento_real ?? ""}
                />
              )}
              <Campo
                label="Leads reais"
                name="leads_real"
                tipo="number"
                defaultValue={existentes?.leads_real ?? ""}
              />
              {!ehPago && (
                <Campo
                  label="Respostas"
                  name="respostas"
                  tipo="number"
                  defaultValue={existentes?.respostas ?? ""}
                />
              )}
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
              {ehPago && (
                <Campo
                  label="Criativos entregues"
                  name="criativos_entregues"
                  tipo="number"
                  defaultValue={existentes?.criativos_entregues ?? ""}
                />
              )}

              <label className="block">
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "2px",
                    color: "rgba(255,255,255,0.35)",
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  Observações
                </span>
                <textarea
                  name="observacoes"
                  rows={3}
                  defaultValue={existentes?.observacoes ?? ""}
                  className="glass-input"
                  style={{
                    marginTop: 8,
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 400,
                  }}
                  placeholder="Anotações do mês..."
                />
              </label>

              {erro && (
                <p style={{ fontSize: 12, color: "#e24b4a" }}>{erro}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={pending || !supabaseOk}
                  className="btn-gold-solid flex-1"
                  style={{
                    padding: "10px 0",
                    fontSize: 12,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    opacity: pending || !supabaseOk ? 0.5 : 1,
                  }}
                >
                  {pending ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.45)",
                    padding: "10px 16px",
                    fontWeight: 400,
                  }}
                  className="hover:text-white transition"
                >
                  Cancelar
                </button>
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
          fontSize: 9,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <input
        type={tipo}
        name={name}
        step={step}
        defaultValue={defaultValue === null ? "" : defaultValue}
        className="glass-input"
        style={{
          marginTop: 8,
          width: "100%",
          padding: "10px 14px",
          fontSize: 13,
          fontWeight: 400,
        }}
        placeholder="—"
      />
    </label>
  )
}
