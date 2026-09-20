import {
  AbasEsqueleto,
  CabecalhoEsqueleto,
  CartaoEsqueleto,
  KpisEsqueleto,
  PaginaEsqueleto,
} from "@/components/ui/Esqueleto"

/**
 * Casca do detalhe de empresa — e, por herança, das sub-rotas (/trafego,
 * /clientes, /metas).
 *
 * É a rota mais pesada do sistema: mesmo depois de achatar a cascata, são
 * quatro ondas de ida ao banco antes do primeiro pixel. Era a tela onde o
 * clique parecia mais "morto".
 */
export default function EmpresaLoading() {
  return (
    <PaginaEsqueleto rotulo="Carregando a empresa">
      <CabecalhoEsqueleto larguraTitulo={340} />
      <AbasEsqueleto quantidade={4} />
      <KpisEsqueleto quantidade={4} />
      <CartaoEsqueleto altura={260} />
      <section className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>
        <CartaoEsqueleto altura={200} />
        <CartaoEsqueleto altura={200} />
      </section>
    </PaginaEsqueleto>
  )
}
