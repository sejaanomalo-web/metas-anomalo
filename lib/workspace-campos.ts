// =============================================================================
// Workspace — registry de campos personalizados. PURO, seguro no browser.
// =============================================================================
//
// O pedido era "criar um campo novo no banco e no frontend". A resposta NÃO é
// ALTER TABLE ws_tarefas por campo: com 30 campos "Colaborators" (um por
// projeto no Asana) isso viraria 30 colunas mortas, e cada campo futuro exigiria
// migration + deploy.
//
// Aqui um campo é DADO: uma linha em ws_campos_definicoes, opções em
// ws_campos_opcoes, valor tipado em ws_campos_valores. Este arquivo é o
// contrato compartilhado — diz, para cada tipo canônico, em qual coluna o valor
// mora, qual componente renderiza e quais filtros existem. Backend e frontend
// leem o mesmo registry, então um campo novo aparece nos dois sem código novo.
//
// TIPO DESCONHECIDO: nunca é convertido para texto em silêncio. Vira
// 'desconhecido', o payload cru fica em valor_bruto, e a reconciliação marca
// BLOCKER — o cutover não acontece até alguém implementar o tipo de verdade.

export type TipoCampo =
  | "texto"
  | "texto_rico"
  | "numero"
  | "moeda"
  | "percentual"
  | "enum"
  | "multi_enum"
  | "pessoas"
  | "data"
  | "data_hora"
  | "booleano"
  | "url"
  | "desconhecido"

/** Coluna de ws_campos_valores onde o valor daquele tipo é persistido. */
export type ColunaValor =
  | "valor_texto"
  | "valor_numero"
  | "valor_booleano"
  | "valor_data"
  | "valor_data_hora"
  | "valor_json"
  | "relacao_opcoes"
  | "relacao_pessoas"
  | "nenhuma"

export type OperadorFiltro =
  | "contem"
  | "igual"
  | "diferente"
  | "maior"
  | "menor"
  | "entre"
  | "algum_de"
  | "todos_de"
  | "vazio"
  | "preenchido"

export interface EspecCampo {
  tipo: TipoCampo
  rotulo: string
  coluna: ColunaValor
  /** Chave do componente de UI. 'nao_suportado' renderiza somente leitura. */
  renderer: string
  operadores: OperadorFiltro[]
  filtravel: boolean
  ordenavel: boolean
  /** false = bloqueia o cutover enquanto existir valor deste tipo. */
  suportado: boolean
}

export const REGISTRY_CAMPOS: Record<TipoCampo, EspecCampo> = {
  texto: {
    tipo: "texto", rotulo: "Texto", coluna: "valor_texto", renderer: "texto",
    operadores: ["contem", "igual", "diferente", "vazio", "preenchido"],
    filtravel: true, ordenavel: true, suportado: true,
  },
  texto_rico: {
    tipo: "texto_rico", rotulo: "Texto longo", coluna: "valor_texto", renderer: "texto_longo",
    operadores: ["contem", "vazio", "preenchido"],
    filtravel: true, ordenavel: false, suportado: true,
  },
  numero: {
    tipo: "numero", rotulo: "Número", coluna: "valor_numero", renderer: "numero",
    operadores: ["igual", "diferente", "maior", "menor", "entre", "vazio", "preenchido"],
    filtravel: true, ordenavel: true, suportado: true,
  },
  moeda: {
    tipo: "moeda", rotulo: "Moeda", coluna: "valor_numero", renderer: "moeda",
    operadores: ["igual", "maior", "menor", "entre", "vazio", "preenchido"],
    filtravel: true, ordenavel: true, suportado: true,
  },
  percentual: {
    tipo: "percentual", rotulo: "Percentual", coluna: "valor_numero", renderer: "percentual",
    operadores: ["igual", "maior", "menor", "entre", "vazio", "preenchido"],
    filtravel: true, ordenavel: true, suportado: true,
  },
  enum: {
    tipo: "enum", rotulo: "Seleção única", coluna: "relacao_opcoes", renderer: "select",
    operadores: ["igual", "diferente", "algum_de", "vazio", "preenchido"],
    filtravel: true, ordenavel: true, suportado: true,
  },
  multi_enum: {
    tipo: "multi_enum", rotulo: "Seleção múltipla", coluna: "relacao_opcoes", renderer: "multi_select",
    operadores: ["algum_de", "todos_de", "vazio", "preenchido"],
    filtravel: true, ordenavel: false, suportado: true,
  },
  pessoas: {
    tipo: "pessoas", rotulo: "Pessoas", coluna: "relacao_pessoas", renderer: "pessoas",
    operadores: ["algum_de", "vazio", "preenchido"],
    filtravel: true, ordenavel: false, suportado: true,
  },
  data: {
    tipo: "data", rotulo: "Data", coluna: "valor_data", renderer: "data",
    operadores: ["igual", "maior", "menor", "entre", "vazio", "preenchido"],
    filtravel: true, ordenavel: true, suportado: true,
  },
  data_hora: {
    tipo: "data_hora", rotulo: "Data e hora", coluna: "valor_data_hora", renderer: "data_hora",
    operadores: ["maior", "menor", "entre", "vazio", "preenchido"],
    filtravel: true, ordenavel: true, suportado: true,
  },
  booleano: {
    tipo: "booleano", rotulo: "Sim/Não", coluna: "valor_booleano", renderer: "booleano",
    operadores: ["igual", "vazio", "preenchido"],
    filtravel: true, ordenavel: true, suportado: true,
  },
  url: {
    tipo: "url", rotulo: "Link", coluna: "valor_texto", renderer: "url",
    operadores: ["contem", "igual", "vazio", "preenchido"],
    filtravel: true, ordenavel: false, suportado: true,
  },
  desconhecido: {
    tipo: "desconhecido", rotulo: "Não suportado", coluna: "nenhuma", renderer: "nao_suportado",
    operadores: [], filtravel: false, ordenavel: false, suportado: false,
  },
}

/**
 * Traduz o tipo do Asana para o tipo canônico.
 *
 * O Asana usa `type` (legado) e `resource_subtype` (atual) — os dois precisam
 * ser olhados. Qualquer coisa fora desta lista cai em 'desconhecido' DE
 * PROPÓSITO: converter para texto pareceria funcionar e perderia a semântica
 * (um multi_enum viraria string, e nenhum filtro voltaria a funcionar).
 */
export function tipoCampoDoAsana(
  type: string | undefined,
  resourceSubtype: string | undefined
): TipoCampo {
  const bruto = (resourceSubtype ?? type ?? "").toLowerCase()
  switch (bruto) {
    case "text": return "texto"
    case "number": return "numero"
    case "enum": return "enum"
    case "multi_enum": return "multi_enum"
    case "people": return "pessoas"
    case "date": return "data"
    case "boolean": return "booleano"
    default: return "desconhecido"
  }
}

/**
 * Refina numero → moeda/percentual pelo `format` do Asana. Sem isto, um campo
 * de dinheiro perderia o símbolo e viraria número solto na interface.
 */
export function refinarNumero(tipo: TipoCampo, format?: string): TipoCampo {
  if (tipo !== "numero") return tipo
  if (format === "currency") return "moeda"
  if (format === "percentage") return "percentual"
  return tipo
}

export function especDe(tipo: TipoCampo): EspecCampo {
  return REGISTRY_CAMPOS[tipo] ?? REGISTRY_CAMPOS.desconhecido
}

export function tipoSuportado(tipo: TipoCampo): boolean {
  return especDe(tipo).suportado
}

/** Todos os tipos que hoje bloqueariam um cutover, para o relatório. */
export function tiposNaoSuportados(): TipoCampo[] {
  return (Object.keys(REGISTRY_CAMPOS) as TipoCampo[]).filter((t) => !tipoSuportado(t))
}
