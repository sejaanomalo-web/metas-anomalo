import Link from "next/link"
import {
  ANO_PADRAO,
  type EmpresaMeta,
  type Mes,
  SUBTITULO_EMPRESA,
  formatBRL,
  getFaturamentoMes,
  getVerbaMes,
  metaAcumuladaAteHoje,
} from "@/lib/data"

export default function CardEmpresa({
  empresa,
  mes,
  faturamentoReal,
}: {
  empresa: EmpresaMeta
  mes: Mes
  faturamentoReal: number | null
}) {
  const investimento = getVerbaMes(empresa.slug, mes)
  const meta = getFaturamentoMes(empresa.slug, mes)
  const indisponivel = meta === 0 && investimento === 0

  const metaAcumulada = metaAcumuladaAteHoje(meta, mes, ANO_PADRAO)
  const temReal = typeof faturamentoReal === "number" && faturamentoReal > 0

  const corBolinha = !temReal
    ? "#555"
    : faturamentoReal >= metaAcumulada
    ? "#4caf50"
    : "#e24b4a"

  const progressoPct =
    temReal && meta > 0
      ? Math.min(100, Math.round((faturamentoReal / meta) * 100))
      : 0

  return (
    <Link
      href={`/dashboard/${empresa.slug}?mes=${mes}`}
      className="card p-5 flex flex-col gap-5 hover:shadow-gold transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-white">{empresa.nome}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {SUBTITULO_EMPRESA[empresa.slug]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: corBolinha }}
            title={
              !temReal
                ? "Sem faturamento real inserido"
                : faturamentoReal >= metaAcumulada
                ? "Acima da meta acumulada"
                : "Abaixo da meta acumulada"
            }
          />
          <span className="text-[10px] uppercase tracking-widest text-gold">
            {mes}
          </span>
        </div>
      </div>

      {indisponivel ? (
        <p className="text-sm text-neutral-500">
          Sem dados neste mês
          {empresa.inicioEm ? ` — início em ${empresa.inicioEm}` : ""}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">
                Invest.
              </p>
              <p className="mt-1 text-base font-medium text-white">
                {formatBRL(investimento)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">
                Faturamento
              </p>
              <p className="mt-1 text-base font-medium text-white">
                {formatBRL(meta)}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                Meta do mês
              </span>
              <span className="text-sm font-medium text-gold">
                {formatBRL(meta)}
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-neutral-900 overflow-hidden">
              <div
                className="h-full gold-gradient"
                style={{ width: `${progressoPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">
              {temReal
                ? `${progressoPct}% da meta de ${mes} atingida (${formatBRL(
                    faturamentoReal
                  )} de ${formatBRL(meta)})`
                : `Nenhum dado inserido para ${mes}`}
            </p>
          </div>
        </>
      )}
    </Link>
  )
}
