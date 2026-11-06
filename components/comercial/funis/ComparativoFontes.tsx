import { formatBRL, formatNumero } from "@/lib/data"
import { formatarPct, type ResumoFunil } from "@/lib/funil-calculo"
import type { FonteFunil } from "@/lib/funil-tipos"
import estilos from "./funis.module.css"

/** As fontes lado a lado, com as etapas do próprio funil. */
export default function ComparativoFontes({
  linhas,
  aoEscolher,
}: {
  linhas: { fonte: FonteFunil; resumo: ResumoFunil }[]
  aoEscolher: (id: string) => void
}) {
  const etapas = linhas[0]?.resumo.etapas ?? []
  const nomeTopo = etapas[0]?.nome ?? "Topo"
  const nomeFundo = etapas[etapas.length - 1]?.nome ?? "Fundo"
  const custoFundo = (r: ResumoFunil) => {
    const custo = r.etapas[r.etapas.length - 1]?.custo ?? null
    return custo === null ? "—" : formatBRL(custo)
  }
  const conversao = (r: ResumoFunil) =>
    formatarPct(r.etapas[r.etapas.length - 1]?.conversaoTopo ?? null)
  const dinheiro = (r: ResumoFunil, v: number) =>
    r.registros === 0 ? "—" : formatBRL(v)

  return (
    <>
      <ul className={estilos.comparativoCartoes}>
        {linhas.map(({ fonte, resumo }) => (
          <li key={fonte.id} className={`glass ${estilos.evolucaoCartao}`}>
            <div className={estilos.evolucaoTopo}>
              <button
                type="button"
                className={estilos.linkFonte}
                onClick={() => aoEscolher(fonte.id)}
              >
                {fonte.nome}
              </button>
              <span>{dinheiro(resumo, resumo.investimento)}</span>
            </div>
            <dl>
              <div>
                <dt>{nomeTopo}</dt>
                <dd>{formatNumero(resumo.etapas[0]?.valor ?? 0)}</dd>
              </div>
              <div>
                <dt>{nomeFundo}</dt>
                <dd>{formatNumero(resumo.fechados)}</dd>
              </div>
              <div>
                <dt>Conversão do topo ao fundo</dt>
                <dd>{conversao(resumo)}</dd>
              </div>
              <div>
                <dt>Custo por {nomeFundo}</dt>
                <dd>{custoFundo(resumo)}</dd>
              </div>
              <div>
                <dt>Faturamento</dt>
                <dd>{dinheiro(resumo, resumo.faturamento)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className={`glass ${estilos.comparativoTabela}`}>
        <table>
          <thead>
            <tr>
              <th scope="col">Fonte</th>
              <th scope="col">Investido</th>
              <th scope="col">{nomeTopo}</th>
              <th scope="col">{nomeFundo}</th>
              <th scope="col">Conversão</th>
              <th scope="col">Custo por {nomeFundo}</th>
              <th scope="col">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ fonte, resumo }) => (
              <tr key={fonte.id}>
                <th scope="row">
                  <button
                    type="button"
                    className={estilos.linkFonte}
                    onClick={() => aoEscolher(fonte.id)}
                  >
                    {fonte.nome}
                  </button>
                </th>
                <td>{dinheiro(resumo, resumo.investimento)}</td>
                <td>{formatNumero(resumo.etapas[0]?.valor ?? 0)}</td>
                <td>{formatNumero(resumo.fechados)}</td>
                <td>{conversao(resumo)}</td>
                <td>{custoFundo(resumo)}</td>
                <td>{dinheiro(resumo, resumo.faturamento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
