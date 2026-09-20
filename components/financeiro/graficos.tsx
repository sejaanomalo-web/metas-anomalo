"use client"

import dynamic from "next/dynamic"
import GraficoSkeleton from "./GraficoSkeleton"

/**
 * Versões sob demanda dos gráficos.
 *
 * O Recharts é o pacote mais pesado do bundle do financeiro e toda tela do
 * módulo carrega pelo menos um gráfico. Trazê-lo junto com a página atrasa os
 * KPIs e a lista — que é o que a pessoa veio ver. Com o import dinâmico o
 * número aparece primeiro e o gráfico chega logo depois, no lugar de um
 * esqueleto da MESMA altura (sem pulo de layout).
 *
 * O arquivo é "use client" porque `ssr: false` só existe no cliente. E
 * `ssr: false` é necessário: o Recharts mede o contêiner para desenhar, então
 * renderizar no servidor produziria um SVG de tamanho zero, descartado logo
 * em seguida.
 */

export const GraficoFluxoCaixaLazy = dynamic(() => import("./GraficoFluxoCaixa"), {
  ssr: false,
  loading: () => <GraficoSkeleton altura={320} />,
})

export const GraficoCategoriasLazy = dynamic(() => import("./GraficoCategorias"), {
  ssr: false,
  loading: () => <GraficoSkeleton altura={240} />,
})

export const GraficoComparativoContasLazy = dynamic(
  () => import("./GraficoComparativoContas"),
  { ssr: false, loading: () => <GraficoSkeleton altura={300} /> }
)

export const GraficoEvolucaoLazy = dynamic(() => import("./GraficoEvolucao"), {
  ssr: false,
  loading: () => <GraficoSkeleton altura={260} />,
})
