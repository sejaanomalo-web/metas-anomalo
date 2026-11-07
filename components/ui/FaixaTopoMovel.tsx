import estilos from "./FaixaTopoMovel.module.css"

/**
 * No celular, o menu e o sino são fixos, e o conteúdo rola por baixo deles. Sem
 * um fundo, o título da página aparecia colado nos botões, e parte dele ficava
 * escondida. Esta faixa dá esse fundo. Fica nos layouts de cada área, para valer
 * também durante o carregamento e em todas as abas.
 */
export default function AreaComFaixaTopo({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={estilos.area}>
      <div aria-hidden className={estilos.faixa} />
      {children}
    </div>
  )
}
