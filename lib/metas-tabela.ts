import {
  MESES,
  type LinhaAton,
  type LinhaDiego,
  type LinhaHato,
  type LinhaPadrao,
  type Mes,
  type TipoFunil,
} from "@/lib/data"

// ============================================================
// Helpers de tabela/funil de Metas — compartilhados entre o dashboard
// da empresa (app/dashboard/[empresa]/page.tsx) e o dashboard de metas
// por cliente (app/dashboard/[empresa]/metas/[cliente]/page.tsx).
// São funções puras (sem I/O) que dependem só do TipoFunil + linhas.
// ============================================================

type LinhaMeta = LinhaPadrao | LinhaAton | LinhaHato | LinhaDiego

/** Meta comparável (CenarioReal) do mês, a partir das linhas de meta do tipo. */
export function extrairMetaComparavel(
  tipo: TipoFunil,
  dados: LinhaMeta[],
  mes: Mes
) {
  if (tipo === "leads-reunioes-contratos") {
    const l = (dados as LinhaPadrao[]).find((x) => x.mes === mes) as
      | (LinhaPadrao & { respostas?: number; agendamentos?: number })
      | undefined
    return l
      ? {
          investimento: l.verba,
          leads: l.leads,
          // Metas orgânicas (override): Retorno e Agendamentos.
          respostas: l.respostas,
          agendamentos: l.agendamentos,
          reunioes: l.reunioes,
          contratos: l.contratos,
          faturamento: l.faturamento,
        }
      : {}
  }
  if (tipo === "aton") {
    const l = (dados as LinhaAton[]).find((x) => x.mes === mes) as
      | (LinhaAton & { respostas?: number })
      | undefined
    return l
      ? {
          investimento: l.verba,
          leads: l.leads,
          respostas: l.respostas,
          reunioes: l.orcamentos,
          contratos: l.vendas,
          faturamento: l.faturamento,
        }
      : {}
  }
  if (tipo === "hato") {
    const l = (dados as LinhaHato[]).find((x) => x.mes === mes)
    return l
      ? {
          investimento: l.verba,
          leads: l.influenciadores,
          reunioes: l.vendas_influenciador,
          contratos: l.total_vendas,
          faturamento: l.receita,
        }
      : {}
  }
  return {}
}

/** Colunas + linhas da TabelaMeses para um tipo de funil. */
export function construirTabelaMetas(tipo: TipoFunil, dados: LinhaMeta[]) {
  if (tipo === "leads-reunioes-contratos") {
    return {
      colunas: [
        { chave: "mes", titulo: "Mês" },
        { chave: "verba", titulo: "Investimento", tipo: "brl" as const },
        { chave: "criativos", titulo: "Criativos" },
        { chave: "leads", titulo: "Leads" },
        { chave: "respostas", titulo: "Retorno" },
        { chave: "agendamentos", titulo: "Agendamentos" },
        { chave: "reunioes", titulo: "Reunião realizada" },
        { chave: "contratos", titulo: "Contratos" },
        { chave: "churn", titulo: "Churn" },
        { chave: "ticket", titulo: "Ticket", tipo: "brl" as const },
        { chave: "faturamento", titulo: "Faturamento", tipo: "brl" as const },
      ],
      linhas: dados as unknown as Record<string, string | number>[],
    }
  }

  if (tipo === "aton") {
    return {
      colunas: [
        { chave: "mes", titulo: "Mês" },
        { chave: "verba", titulo: "Investimento", tipo: "brl" as const },
        { chave: "criativos", titulo: "Criativos" },
        { chave: "leads", titulo: "Leads" },
        { chave: "respostas", titulo: "Retorno" },
        { chave: "orcamentos", titulo: "Orçamentos" },
        { chave: "vendas", titulo: "Vendas" },
        { chave: "ticket", titulo: "Ticket", tipo: "brl" as const },
        { chave: "faturamento", titulo: "Faturamento", tipo: "brl" as const },
      ],
      linhas: dados as unknown as Record<string, string | number>[],
    }
  }

  if (tipo === "hato") {
    return {
      colunas: [
        { chave: "mes", titulo: "Mês" },
        { chave: "verba", titulo: "Investimento", tipo: "brl" as const },
        { chave: "criativos", titulo: "Criativos" },
        { chave: "influenciadores", titulo: "Influ." },
        { chave: "respostas", titulo: "Retorno" },
        { chave: "vendas_influenciador", titulo: "Vendas Influ." },
        { chave: "vendas_direto", titulo: "Vendas Direto" },
        { chave: "total_vendas", titulo: "Total Vendas" },
        { chave: "receita", titulo: "Receita", tipo: "brl" as const },
        {
          chave: "custo_influenciadores",
          titulo: "Custo Influ.",
          tipo: "brl" as const,
        },
      ],
      linhas: dados as unknown as Record<string, string | number>[],
    }
  }

  if (tipo === "diego") {
    return {
      colunas: [
        { chave: "mes", titulo: "Mês" },
        {
          chave: "faturamento_diego",
          titulo: "Faturamento Diego",
          tipo: "brl" as const,
        },
        { chave: "percentual", titulo: "%", tipo: "percent" as const },
        { chave: "receita_hub", titulo: "Receita Hub", tipo: "brl" as const },
      ],
      linhas: dados as unknown as Record<string, string | number>[],
    }
  }

  return { colunas: [], linhas: [] }
}

/**
 * Skeleton de meses com todos os campos zerados, conforme o tipo de funil.
 * Usado quando não há projeções hardcoded (empresas adicionadas via UI e
 * todos os clientes de tráfego). Valores reais entram depois via overrides.
 */
export function esqueletoMeses(
  tipo: TipoFunil
): LinhaPadrao[] | LinhaAton[] | LinhaHato[] | LinhaDiego[] {
  if (tipo === "leads-reunioes-contratos") {
    return MESES.map(
      (mes): LinhaPadrao => ({
        mes,
        verba: 0,
        criativos: 0,
        criativos_semana: 0,
        leads: 0,
        reunioes: 0,
        contratos: 0,
        churn: 0,
        clientes: 0,
        ticket: 0,
        faturamento: 0,
      })
    )
  }
  if (tipo === "aton") {
    return MESES.map(
      (mes): LinhaAton => ({
        mes,
        verba: 0,
        criativos: 0,
        criativos_semana: 0,
        leads: 0,
        orcamentos: 0,
        vendas: 0,
        ticket: 0,
        faturamento: 0,
      })
    )
  }
  if (tipo === "hato") {
    return MESES.map(
      (mes): LinhaHato => ({
        mes,
        verba: 0,
        criativos: 0,
        criativos_semana: 0,
        influenciadores: 0,
        vendas_influenciador: 0,
        vendas_direto: 0,
        total_vendas: 0,
        receita: 0,
        custo_influenciadores: 0,
      })
    )
  }
  return MESES.map(
    (mes): LinhaDiego => ({
      mes,
      faturamento_diego: 0,
      percentual: 0,
      receita_hub: 0,
    })
  )
}
