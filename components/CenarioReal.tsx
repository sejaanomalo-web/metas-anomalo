import { type DadosReais } from "@/lib/supabase"
import { formatBRL, formatNumero } from "@/lib/data"

interface MetaComparavel {
  investimento?: number
  leads?: number
  reunioes?: number
  contratos?: number
  faturamento?: number
}

export default function CenarioReal({
  dados,
  meta,
}: {
  dados: DadosReais | null
  meta: MetaComparavel
}) {
  if (!dados) {
    return (
      <div className="card p-6">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Cenário Real
        </p>
        <p className="mt-4 text-sm text-neutral-400">
          Nenhum dado real inserido para este mês. Clique em
          <span className="text-gold mx-1 font-medium">Inserir dados reais</span>
          para registrar.
        </p>
      </div>
    )
  }

  const cpl =
    dados.investimento_real !== null &&
    dados.leads_real !== null &&
    dados.leads_real > 0
      ? dados.investimento_real / dados.leads_real
      : null

  const linhas: {
    rotulo: string
    real: number | null
    meta: number | undefined
    tipo: "moeda" | "numero"
  }[] = [
    {
      rotulo: "Investimento",
      real: dados.investimento_real,
      meta: meta.investimento,
      tipo: "moeda",
    },
    {
      rotulo: "Leads",
      real: dados.leads_real,
      meta: meta.leads,
      tipo: "numero",
    },
    {
      rotulo: "Reuniões/Orçamentos",
      real: dados.reunioes_real,
      meta: meta.reunioes,
      tipo: "numero",
    },
    {
      rotulo: "Contratos/Vendas",
      real: dados.contratos_real,
      meta: meta.contratos,
      tipo: "numero",
    },
    {
      rotulo: "Faturamento",
      real: dados.faturamento_real,
      meta: meta.faturamento,
      tipo: "moeda",
    },
  ]

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Cenário Real
        </p>
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {linhas.map((l) => {
          const abaixo =
            l.real !== null && l.meta !== undefined && l.real < l.meta
          const acima =
            l.real !== null && l.meta !== undefined && l.real >= l.meta
          return (
            <div
              key={l.rotulo}
              className="rounded-lg bg-black/40 border border-neutral-900 p-3"
            >
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">
                {l.rotulo}
              </p>
              <p className="mt-1.5 text-base font-medium text-white">
                {l.real === null
                  ? "—"
                  : l.tipo === "moeda"
                  ? formatBRL(l.real)
                  : formatNumero(l.real)}
              </p>
              {l.meta !== undefined && (
                <p
                  className={`text-[11px] mt-0.5 ${
                    acima
                      ? "text-emerald-400"
                      : abaixo
                      ? "text-red-400"
                      : "text-neutral-500"
                  }`}
                >
                  Meta: {l.tipo === "moeda" ? formatBRL(l.meta) : formatNumero(l.meta)}
                </p>
              )}
            </div>
          )
        })}

        <div className="rounded-lg bg-black/40 border border-neutral-900 p-3">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">
            CPL Real
          </p>
          <p className="mt-1.5 text-base font-medium text-white">
            {cpl === null ? "—" : formatBRL(cpl)}
          </p>
          <p className="text-[11px] text-neutral-500">invest. ÷ leads</p>
        </div>

        {dados.criativos_entregues !== null && (
          <div className="rounded-lg bg-black/40 border border-neutral-900 p-3">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">
              Criativos entregues
            </p>
            <p className="mt-1.5 text-base font-medium text-white">
              {formatNumero(dados.criativos_entregues)}
            </p>
          </div>
        )}
      </div>

      {dados.observacoes && (
        <div className="mt-4 rounded-lg bg-black/40 border border-neutral-900 p-3">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">
            Observações
          </p>
          <p className="mt-1.5 text-sm text-white whitespace-pre-wrap">
            {dados.observacoes}
          </p>
        </div>
      )}
    </div>
  )
}
