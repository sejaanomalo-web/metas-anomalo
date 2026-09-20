import {
  AbasEsqueleto,
  CabecalhoEsqueleto,
  CartaoEsqueleto,
  KpisEsqueleto,
  PaginaEsqueleto,
} from "@/components/ui/Esqueleto"

/**
 * Casca do Tráfego. É a tela mais pesada de dados do sistema (métricas do
 * Meta por empresa e por cliente), então é também onde a espera sem
 * resposta visual mais incomodava.
 */
export default function TrafegoLoading() {
  return (
    <PaginaEsqueleto rotulo="Carregando o Tráfego">
      <CabecalhoEsqueleto larguraTitulo={300} />
      <AbasEsqueleto quantidade={4} />
      <KpisEsqueleto quantidade={4} />
      <KpisEsqueleto quantidade={4} />
      <CartaoEsqueleto altura={300} />
    </PaginaEsqueleto>
  )
}
