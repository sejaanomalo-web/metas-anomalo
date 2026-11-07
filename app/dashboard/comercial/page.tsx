import AbasArea from "@/components/AbasArea"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import BarraFunis from "@/components/comercial/funis/BarraFunis"
import PainelFunil from "@/components/comercial/funis/PainelFunil"
import SeletorUsuarioFunil from "@/components/comercial/funis/SeletorUsuarioFunil"
import estilos from "@/components/comercial/funis/funis.module.css"
import { requererPermissao } from "@/lib/auth"
import { hojeBRT } from "@/lib/funil-calculo"
import {
  contarLancamentos,
  listarFunis,
  listarLancamentos,
  listarUsuariosComercial,
} from "@/lib/funis-comerciais"
import { parsePeriodo } from "@/lib/periodo"
import { periodoQS } from "@/lib/periodo-url"

export const dynamic = "force-dynamic"

/**
 * Interface comercial de cada usuário. Quem tem acesso ao Comercial vê e edita
 * só os próprios funis. Admin pode abrir a de qualquer pessoa (?usuario=). O
 * ?usuario= de quem não é admin é ignorado, e o ?funil= só vale para um funil
 * da lista daquela pessoa, então trocar o id na URL não abre funil alheio.
 *
 * O filtro de período é o seletor global, o mesmo do Caixa e das outras telas.
 */
export default async function ComercialPage({
  searchParams,
}: {
  searchParams: {
    modo?: string
    de?: string
    ate?: string
    mes?: string
    ano?: string
    funil?: string
    usuario?: string
  }
}) {
  const usuario = await requererPermissao("dashboard_comercial")
  const ehAdmin = usuario.papel === "admin"

  const hoje = hojeBRT()
  const periodo = parsePeriodo(searchParams)

  const usuariosDoTime = ehAdmin ? await listarUsuariosComercial() : []
  const dono =
    (ehAdmin && usuariosDoTime.find((u) => u.id === searchParams.usuario)) || {
      id: usuario.id,
      nome: usuario.nome,
    }
  const vendoOutraPessoa = dono.id !== usuario.id

  const { funis, tabelaAusente } = await listarFunis(dono.id)
  const funil = funis.find((f) => f.id === searchParams.funil) ?? funis[0] ?? null

  const [lancamentos, totalLancamentos] = funil
    ? await Promise.all([
        listarLancamentos([funil.id], periodo.de, periodo.ate),
        contarLancamentos(funil.id),
      ])
    : [[], 0]

  const paramsAba = new URLSearchParams(periodoQS(periodo))
  if (vendoOutraPessoa) paramsAba.set("usuario", dono.id)

  // Lançar dentro do período que está na tela: hoje se couber, senão o início.
  const dataPadrao = hoje >= periodo.de && hoje <= periodo.ate ? hoje : periodo.de

  return (
    <main className="mx-auto px-4 md:px-8 py-10 space-y-10" style={{ maxWidth: 1280 }}>
      <div className="hero-banner">
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}>
          Comercial · {vendoOutraPessoa ? dono.nome : "Minha interface"}
        </p>
        <div className={estilos.heroTopo}>
          <h1 style={{ fontSize: 36 }}>Comercial · {periodo.rotulo}</h1>
          <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
        </div>
        <p style={{ fontSize: 14, color: "var(--text-2)", marginTop: 10 }}>
          Funis, fontes de demanda e gargalos do período.
        </p>
        {ehAdmin && (
          <div className={estilos.heroRodape}>
            <AbasArea
              itens={[
                {
                  label: "Funis",
                  href: `/dashboard/comercial?${paramsAba.toString()}`,
                  ativo: true,
                },
                {
                  label: "Time",
                  href: `/dashboard/comercial/time?${periodoQS(periodo)}`,
                  ativo: false,
                },
                {
                  label: "Histórico",
                  href: "/dashboard/comercial/historico",
                  ativo: false,
                },
              ]}
            />
            <SeletorUsuarioFunil usuarios={usuariosDoTime} atual={dono.id} />
          </div>
        )}
      </div>

      {tabelaAusente ? (
        <div className="glass" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 18 }}>Falta preparar o banco</h2>
          <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-2)" }}>
            Os funis precisam da migration{" "}
            <code>20261106_comercial_funis.sql</code>. Rode-a no SQL Editor do
            Supabase e recarregue a página.
          </p>
        </div>
      ) : (
        <>
          <BarraFunis
            funis={funis}
            selecionado={funil}
            usuarioId={dono.id}
            totalLancamentos={totalLancamentos}
            dataPadrao={dataPadrao}
          />

          {!funil ? (
            <div className="glass" style={{ padding: 28, textAlign: "center" }}>
              <h2 style={{ fontSize: 18 }}>
                {vendoOutraPessoa
                  ? `${dono.nome} ainda não tem funis`
                  : "Você ainda não tem funis"}
              </h2>
              <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-2)" }}>
                Use &quot;Novo funil&quot; para criar o primeiro. Ele já vem com
                as etapas de leads a contratos, e você pode ajustar todas.
              </p>
            </div>
          ) : (
            <PainelFunil
              key={funil.id}
              funil={funil}
              lancamentos={lancamentos}
              de={periodo.de}
              ate={periodo.ate}
              dataPadrao={dataPadrao}
            />
          )}
        </>
      )}
    </main>
  )
}
