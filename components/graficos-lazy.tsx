"use client"

import dynamic from "next/dynamic"
import GraficoSkeleton from "./financeiro/GraficoSkeleton"

/**
 * Versões sob demanda dos gráficos do Painel, do detalhe de empresa e do
 * Tráfego — o mesmo padrão que components/financeiro/graficos.tsx já usa
 * em produção, estendido para as rotas que ficaram de fora.
 *
 * Por que importa mais aqui do que no Financeiro
 * ----------------------------------------------
 * O recharts é o maior pacote do projeto e entrava ESTÁTICO no bundle de
 * /dashboard — que é o `start_url` do manifest, ou seja, a primeira tela
 * que abre ao tocar no ícone do celular. O React hidrata a árvore de uma
 * vez: enquanto esse JS não termina de baixar e avaliar, NENHUM handler de
 * clique existe. E o primeiro alvo do dedo no celular é justamente um
 * handler — o botão do menu hambúrguer. Daí o "o primeiro toque no menu não
 * faz nada".
 *
 * Tirando o recharts do caminho crítico, os KPIs e o menu respondem
 * primeiro e o gráfico chega em seguida, no lugar de um esqueleto da mesma
 * altura (sem pulo de layout).
 *
 * `ssr: false` porque o recharts mede o contêiner para desenhar: renderizar
 * no servidor produz um SVG de tamanho zero que é descartado no cliente.
 */

export const GraficoHubLazy = dynamic(() => import("./GraficoHub"), {
  ssr: false,
  loading: () => <GraficoSkeleton altura={320} />,
})

export const GraficoFaturamentoLazy = dynamic(() => import("./GraficoFaturamento"), {
  ssr: false,
  loading: () => <GraficoSkeleton altura={240} />,
})

export const GraficosTrafegoLazy = dynamic(() => import("./trafego/GraficosTrafego"), {
  ssr: false,
  loading: () => <GraficoSkeleton altura={300} />,
})
