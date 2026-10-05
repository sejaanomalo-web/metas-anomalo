import {
  CabecalhoEsqueleto,
  KpisEsqueleto,
  PaginaEsqueleto,
  TabelaEsqueleto,
} from "@/components/ui/Esqueleto"

/** Casca dos Leads — cabeçalho, contadores e a lista. */
export default function LeadsLoading() {
  return (
    <PaginaEsqueleto rotulo="Carregando os Leads">
      <CabecalhoEsqueleto larguraTitulo={220} />
      <KpisEsqueleto quantidade={3} />
      <TabelaEsqueleto linhas={7} />
    </PaginaEsqueleto>
  )
}
