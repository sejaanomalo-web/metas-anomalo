"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { salvarDadosReaisAction } from "@/lib/dados-reais"
import type { DadosReais } from "@/lib/supabase"
import type { EmpresaDb, Mes } from "@/lib/data"

interface Props {
  empresa: EmpresaDb
  mes: Mes
  ano: number
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
        className="text-xs uppercase tracking-widest gold-gradient text-black font-medium rounded-lg px-4 py-2 hover:brightness-110"
      >
        Inserir dados reais
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
            className="absolute inset-0 bg-black/70"
          />

          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-surface border-l border-gold/30 shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-surface/95 backdrop-blur border-b border-neutral-900 px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-neutral-500">
                  Dados reais · {mes} {ano}
                </p>
                <p className="text-sm font-medium text-white">{empresa}</p>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="text-neutral-500 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            {!supabaseOk && (
              <div className="mx-6 mt-4 p-3 rounded-lg border border-red-900/60 bg-red-950/40 text-sm text-red-300">
                Supabase não configurado. Defina as variáveis
                NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no
                Vercel para salvar dados reais.
              </div>
            )}

            <form
              action={(fd) => startTransition(() => onSubmit(fd))}
              className="p-6 space-y-4"
            >
              <input type="hidden" name="empresa" value={empresa} />
              <input type="hidden" name="mes" value={mes} />
              <input type="hidden" name="ano" value={ano} />

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
                <span className="text-xs uppercase tracking-widest text-neutral-400">
                  Observações
                </span>
                <textarea
                  name="observacoes"
                  rows={3}
                  defaultValue={existentes?.observacoes ?? ""}
                  className="mt-2 w-full rounded-lg bg-black/60 border border-neutral-800 focus:border-gold focus:outline-none px-3 py-2 text-white placeholder-neutral-600 text-sm"
                  placeholder="Anotações do mês..."
                />
              </label>

              {erro && (
                <p className="text-sm text-red-400">{erro}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={pending || !supabaseOk}
                  className="flex-1 gold-gradient text-black font-medium rounded-lg py-2.5 transition hover:brightness-110 disabled:opacity-50"
                >
                  {pending ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="text-sm text-neutral-400 hover:text-white px-4 py-2.5"
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
      <span className="text-xs uppercase tracking-widest text-neutral-400">
        {label}
      </span>
      <input
        type={tipo}
        name={name}
        step={step}
        defaultValue={defaultValue === null ? "" : defaultValue}
        className="mt-2 w-full rounded-lg bg-black/60 border border-neutral-800 focus:border-gold focus:outline-none px-3 py-2 text-white placeholder-neutral-600 text-sm"
        placeholder="—"
      />
    </label>
  )
}
