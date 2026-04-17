import Link from "next/link"
import {
  type EmpresaMeta,
  type Mes,
  formatBRL,
  formatNumero,
  getFaturamentoDezembro,
  getFaturamentoMes,
  getFunilResumo,
} from "@/lib/data"

export default function CardEmpresa({
  empresa,
  mes,
}: {
  empresa: EmpresaMeta
  mes: Mes
}) {
  const funil = getFunilResumo(empresa.slug, mes)
  const faturamentoMes = getFaturamentoMes(empresa.slug, mes)
  const faturamentoDez = getFaturamentoDezembro(empresa.slug)
  const progresso =
    faturamentoDez > 0
      ? Math.min(100, Math.round((faturamentoMes / faturamentoDez) * 100))
      : 0

  const indisponivel = !funil || faturamentoMes === 0

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
        <span className="text-[10px] uppercase tracking-widest text-gold/80">
          {mes}
        </span>
      </div>

      {indisponivel ? (
        <p className="text-sm text-neutral-500">
          Sem dados neste mês{empresa.inicioEm ? ` — início em ${empresa.inicioEm}` : ""}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {funil.rotulos.map((rotulo, i) => (
              <div key={rotulo} className="rounded-lg bg-black/50 border border-neutral-900 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                  {rotulo}
                </p>
                <p className="text-base font-medium text-white mt-0.5">
                  {empresa.tipo === "diego" && i === 0
                    ? formatBRL(funil.valores[i])
                    : empresa.tipo === "diego" && i === 2
                    ? formatBRL(funil.valores[i])
                    : empresa.tipo === "diego" && i === 1
                    ? `${funil.valores[i]}%`
                    : formatNumero(funil.valores[i])}
                </p>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-widest text-neutral-500">
                Faturamento do mês
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
              {progresso}% da meta de Dezembro ({formatBRL(faturamentoDez)})
            </p>
          </div>
        </>
      )}
    </Link>
  )
}
