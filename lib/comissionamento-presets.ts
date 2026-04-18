import type { ConfiguracaoComissao } from "./supabase"

// Presets padrão usados ao criar um novo colaborador.
export const ESCALA_PADRAO: ConfiguracaoComissao = {
  tipo: "escala",
  faixas: [
    { minimo: 0, bonus: 0 },
    { minimo: 10, bonus: 100 },
    { minimo: 15, bonus: 200 },
    { minimo: 20, bonus: 350 },
    { minimo: 25, bonus: 500 },
    { minimo: 30, bonus: 700 },
  ],
}

export const GATILHOS_PADRAO: ConfiguracaoComissao = {
  tipo: "gatilhos",
  gatilhos: [
    { chave: "cpl_meta", rotulo: "CPL dentro da meta", valor: 200 },
    { chave: "leads_meta", rotulo: "Meta de leads atingida", valor: 200 },
    {
      chave: "roas_alvo",
      rotulo: "ROAS acima do alvo",
      valor: 150,
      alvoRoas: 2.5,
    },
    { chave: "posts_prazo", rotulo: "100% posts no prazo", valor: 150 },
  ],
}
