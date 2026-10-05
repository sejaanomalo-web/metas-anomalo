import {
  CabecalhoEsqueleto,
  CartaoEsqueleto,
  KpisEsqueleto,
  PaginaEsqueleto,
} from "@/components/ui/Esqueleto"

/** Casca do Comercial — cabeçalho, KPIs do funil e os blocos de cliente. */
export default function ComercialLoading() {
  return (
    <PaginaEsqueleto rotulo="Carregando o Comercial">
      <CabecalhoEsqueleto larguraTitulo={300} />
      <KpisEsqueleto quantidade={4} />
      <CartaoEsqueleto altura={280} />
      <CartaoEsqueleto altura={200} />
    </PaginaEsqueleto>
  )
}
