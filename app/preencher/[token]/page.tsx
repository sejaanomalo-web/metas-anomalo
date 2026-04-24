import { notFound } from "next/navigation"
import FormularioPreenchedor from "@/components/FormularioPreenchedor"
import {
  getPreenchedorByToken,
  listarEmpresasAtribuidas,
} from "@/lib/preenchedores"
import { listarEmpresas } from "@/lib/empresas-actions"
import { getDadosReaisMes } from "@/lib/dados-reais"
import type { DadosReais } from "@/lib/supabase"
import type { Mes } from "@/lib/data"

function mesAtualBRT(): { mes: Mes; ano: number; dataISO: string } {
  const agora = new Date()
  const utc = agora.getTime() + agora.getTimezoneOffset() * 60000
  const brt = new Date(utc + -3 * 3600000)
  const mapa: Record<number, Mes> = {
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro",
  }
  const mes = mapa[brt.getMonth() + 1] ?? "Abril"
  return {
    mes,
    ano: brt.getFullYear(),
    dataISO: brt.toISOString().slice(0, 10),
  }
}

export default async function PreencherFormularioPage({
  params,
}: {
  params: { token: string }
}) {
  const preenchedor = await getPreenchedorByToken(params.token)
  if (!preenchedor) {
    notFound()
  }

  const origem = preenchedor.papel === "gestor_trafego" ? "pago" : "organico"
  const { mes, ano, dataISO } = mesAtualBRT()

  const [dbsAtribuidos, todasEmpresas] = await Promise.all([
    listarEmpresasAtribuidas(preenchedor.id!),
    listarEmpresas(true),
  ])

  const empresasFiltradas = todasEmpresas.filter((e) =>
    dbsAtribuidos.includes(e.db)
  )

  // Busca os dados atuais de cada empresa para pré-preencher o formulário.
  const atualPorEmpresa = new Map<string, DadosReais | null>()
  await Promise.all(
    empresasFiltradas.map(async (e) => {
      const dado = await getDadosReaisMes(e.db, mes, ano, origem)
      atualPorEmpresa.set(e.db, dado)
    })
  )

  const empresasComDados = empresasFiltradas.map((e) => ({
    db: e.db,
    nome: e.nome,
    tipo: e.tipo,
    atual: atualPorEmpresa.get(e.db) ?? null,
  }))

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "32px 20px 60px",
      }}
    >
      <div
        style={{
          marginBottom: 24,
        }}
      >
        <p
          style={{
            fontSize: 9,
            letterSpacing: "2px",
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          ANÔMALO HUB · Formulário diário
        </p>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.5px",
            lineHeight: 1.15,
            marginTop: 6,
          }}
        >
          Olá, {preenchedor.nome.split(" ")[0]}
        </h1>
        <div
          className="gold-divider"
          style={{ marginTop: 8, marginBottom: 10 }}
        />
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 300,
            lineHeight: 1.5,
          }}
        >
          {preenchedor.papel === "gestor_trafego"
            ? "Preenchimento de tráfego pago"
            : "Preenchimento de prospecção orgânica"}{" "}
          · {mes} de {ano} · {dataISO.split("-").reverse().join("/")}
        </p>
        <p
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            fontWeight: 300,
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          Os valores já acumulados no mês aparecem em cada campo. Atualize
          somando o total do dia — os números só sobem, nunca descem.
        </p>
      </div>

      {empresasFiltradas.length === 0 ? (
        <div
          style={{
            padding: 24,
            border: "0.5px dashed rgba(255,255,255,0.1)",
            borderRadius: 12,
            textAlign: "center",
            color: "rgba(255,255,255,0.4)",
            fontSize: 13,
          }}
        >
          Nenhuma empresa atribuída a você ainda. Fale com o gestor do Hub.
        </div>
      ) : (
        <FormularioPreenchedor
          token={params.token}
          papel={preenchedor.papel}
          empresas={empresasComDados}
        />
      )}
    </main>
  )
}
