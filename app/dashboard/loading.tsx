import {
  CabecalhoEsqueleto,
  CartaoEsqueleto,
  KpisEsqueleto,
  PaginaEsqueleto,
} from "@/components/ui/Esqueleto"

/**
 * Fronteira de carregamento padrão de TODO o /dashboard.
 *
 * Um `loading.tsx` vale para o segmento e para todos os filhos que não
 * tenham o seu próprio. Este arquivo, portanto, cobre o painel, Metas,
 * Empresas, Formulários, Configurações, Leads e o detalhe de empresa —
 * qualquer rota que não precise de uma casca mais específica.
 *
 * Antes dele, trocar de seção deixava a tela anterior congelada até o
 * servidor responder, porque sem fronteira de Suspense o roteador não tem
 * o que desenhar no lugar.
 */
export default function DashboardLoading() {
  return (
    <PaginaEsqueleto rotulo="Carregando a página">
      <CabecalhoEsqueleto />
      <KpisEsqueleto quantidade={4} />
      <CartaoEsqueleto altura={300} />
      <section className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>
        <CartaoEsqueleto altura={180} />
        <CartaoEsqueleto altura={180} />
      </section>
    </PaginaEsqueleto>
  )
}
