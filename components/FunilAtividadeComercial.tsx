import { formatBRL, formatNumero } from "@/lib/data"
import type { ResumoComercial } from "@/lib/comercial-tipos"

/**
 * Funil de ATIVIDADE comercial do período — o que o time fez, em uma
 * sequência clara: Mensagens enviadas → Retorno → Qualificados → Reuniões
 * → Contratos → Faturamento. Derivado dos relatórios diários
 * (relatorios_comerciais).
 *
 * Substitui a sobreposição antiga (KPIs soltos + funil de oportunidades),
 * que duplicava "reunião" e confundia. Aqui é um funil só.
 */
export default function FunilAtividadeComercial({
  resumo,
}: {
  resumo: ResumoComercial
}) {
  const semDados = resumo.registros === 0

  const etapas: {
    label: string
    valor: string
    sub: string
    destaque?: boolean
  }[] = [
    {
      label: "Mensagens enviadas",
      valor: formatNumero(resumo.mensagens),
      sub: "enviadas",
    },
    {
      label: "Retorno",
      valor: formatNumero(resumo.retorno_mensagens),
      sub: "responderam",
    },
    {
      label: "Qualificados",
      valor: formatNumero(resumo.qualificados),
      sub: "qualificados",
    },
    {
      label: "Reuniões",
      valor: formatNumero(resumo.reunioes_realizadas),
      sub: `${formatNumero(resumo.reunioes_agendadas)} agend · ${formatNumero(
        resumo.no_shows
      )} no-show`,
    },
    {
      label: "Contratos",
      valor: formatNumero(resumo.contratos_fechados),
      sub: `${formatNumero(resumo.propostas_enviadas)} propostas`,
      destaque: true,
    },
    {
      label: "Faturamento",
      valor: formatBRL(resumo.faturamento_gerado),
      sub: "gerado",
      destaque: true,
    },
  ]

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
      style={{ gap: 12 }}
    >
      {etapas.map((e) => (
        <div
          key={e.label}
          className="glass"
          style={{
            padding: "18px 16px",
            borderColor: e.destaque ? "rgba(201,149,58,0.35)" : undefined,
          }}
        >
          <p
            style={{
              fontSize: 10,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "var(--accent, #C9953A)",
              fontWeight: 600,
            }}
          >
            {e.label}
          </p>
          <p
            style={{
              fontSize: e.label === "Faturamento" ? 22 : 30,
              fontWeight: 700,
              marginTop: 6,
              fontVariantNumeric: "tabular-nums",
              color: semDados ? "var(--text-4)" : "var(--text-1)",
            }}
          >
            {semDados ? "·" : e.valor}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>
            {e.sub}
          </p>
        </div>
      ))}
    </div>
  )
}
