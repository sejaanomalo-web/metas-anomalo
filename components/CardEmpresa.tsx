import Link from "next/link"
import {
  type EmpresaMeta,
  type Mes,
  formatBRL,
  formatNumero,
  getCriativosMes,
  getFaturamentoDezembro,
  getFaturamentoMes,
  getLeadsMes,
  getVerbaMes,
} from "@/lib/data"

export default function CardEmpresa({
  empresa,
  mes,
  temDadosReais,
}: {
  empresa: EmpresaMeta
  mes: Mes
  temDadosReais: boolean
}) {
  const investimento = getVerbaMes(empresa.slug, mes)
  const criativos = getCriativosMes(empresa.slug, mes)
  const leads = getLeadsMes(empresa.slug, mes)
  const faturamentoMes = getFaturamentoMes(empresa.slug, mes)
  const faturamentoDez = getFaturamentoDezembro(empresa.slug)
  const progresso =
    faturamentoDez > 0
      ? Math.min(100, Math.round((faturamentoMes / faturamentoDez) * 100))
      : 0
  const indisponivel = faturamentoMes === 0 && investimento === 0 && leads === 0

  return (
    <Link
      href={`/dashboard/${empresa.slug}?mes=${mes}`}
      className="card p-5 flex flex-col gap-4 hover:shadow-gold transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-medium text-white">{empresa.nome}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {empresa.tipo === "diego"
              ? "Receita Hub"
              : empresa.tipo === "hato"
              ? "Direto + Influenciadores"
              : "Funil de vendas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              temDadosReais ? "bg-emerald-400" : "bg-neutral-700"
            }`}
            title={temDadosReais ? "Dados reais inseridos" : "Apenas meta"}
          />
          <span className="text-[10px] uppercase tracking-widest text-gold/80">
            {mes}
          </span>
        </div>
      </div>

      {indisponivel ? (
        <p className="text-sm text-neutral-500">
          Sem dados neste mês{empresa.inicioEm ? ` — início em ${empresa.inicioEm}` : ""}.
        </p>
      ) : (
        <>
          {empresa.tipo === "diego" ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-black/50 border border-neutral-900 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Receita Hub
                </p>
                <p className="text-base font-medium text-white mt-0.5">
                  {formatBRL(faturamentoMes)}
                </p>
              </div>
              <div className="rounded-lg bg-black/50 border border-neutral-900 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Meta de Dezembro
                </p>
                <p className="text-base font-medium text-white mt-0.5">
                  {formatBRL(faturamentoDez)}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              <EtapaMini rotulo="Inv." valor={formatBRL(investimento)} />
              <EtapaMini rotulo="Criat." valor={formatNumero(criativos.mes)} />
              <EtapaMini rotulo="Leads" valor={formatNumero(leads)} />
              <EtapaMini rotulo="Fat." valor={formatBRL(faturamentoMes)} />
            </div>
          )}

          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-widest text-neutral-500">
                Meta do mês
              </span>
              <span className="text-sm font-medium text-white">
                {formatBRL(faturamentoMes)}
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-neutral-900 overflow-hidden">
              <div
                className="h-full gold-gradient"
                style={{ width: `${progresso}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">
              {progresso}% do faturamento de Dezembro ({formatBRL(faturamentoDez)})
            </p>
          </div>
        </>
      )}
    </Link>
  )
}

function EtapaMini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg bg-black/50 border border-neutral-900 p-2">
      <p className="text-[9px] uppercase tracking-wider text-neutral-500">
        {rotulo}
      </p>
      <p className="text-xs font-medium text-white mt-0.5 truncate">{valor}</p>
    </div>
  )
}
