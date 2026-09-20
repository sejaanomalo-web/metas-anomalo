import {
  AbasEsqueleto,
  CabecalhoEsqueleto,
  CartaoEsqueleto,
  KpisEsqueleto,
  PaginaEsqueleto,
} from "@/components/ui/Esqueleto"

/**
 * Casca do Financeiro. Vale para a Visão geral e todas as abas
 * (Lançamentos, Recorrentes, Contas, Categorias, Relatórios, Importar),
 * porque nenhuma delas tem `loading.tsx` próprio.
 *
 * As sete pílulas de navegação entram no esqueleto de propósito: elas são
 * a primeira coisa que a pessoa procura ao trocar de aba, e vê-las já
 * posicionadas é o que faz a troca parecer instantânea.
 */
export default function FinanceiroLoading() {
  return (
    <PaginaEsqueleto rotulo="Carregando o Financeiro">
      <CabecalhoEsqueleto larguraTitulo={320} />
      <AbasEsqueleto quantidade={7} />
      <KpisEsqueleto quantidade={4} />
      <CartaoEsqueleto altura={320} />
    </PaginaEsqueleto>
  )
}
