"use client"

import { useState } from "react"

interface TokenFantasma {
  empresa: string
  ad_account_id: string
  campaign_filter: string | null
  empresa_config_nome: string | null
  empresa_config_ativa: boolean | null
}

interface EmpresaSemTracking {
  nome: string
  slug: string
  db: string
}

interface DadosReaisSlug {
  empresa: string
  mes: string
  ano: number
  investimento_real: number | null
  faturamento_real: number | null
  updated_at: string
}

interface Divergencia {
  empresa: string
  campo: "investimento" | "faturamento"
  total_dados_reais: number
  total_dados_diarios_log: number
  diferenca: number
}

interface ReconciliarResponse {
  mes_atual: string
  ano_atual: number
  tokens_fantasmas: TokenFantasma[]
  empresas_sem_tracking: EmpresaSemTracking[]
  dados_reais_slug: DadosReaisSlug[]
  divergencias: Divergencia[]
}

type Estado =
  | { tipo: "ocioso" }
  | { tipo: "carregando" }
  | { tipo: "ok"; dados: ReconciliarResponse }
  | { tipo: "erro"; mensagem: string }

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Botão admin que dispara GET /api/reconciliar e mostra inline as 4
 * listas de inconsistência (tokens fantasmas, empresas sem tracking,
 * dados_reais com chave em slug, divergências dr ↔ ddl no mês atual).
 *
 * É só visualização — não muda estado. As ações corretivas (reativar
 * empresa, desativar token, apagar linha) o admin faz no Supabase ou
 * no drawer de empresas — esse painel só sinaliza o que está fora do
 * lugar pra não reaparecer silenciosamente daqui a 3 meses.
 */
export default function ReconciliarBotao() {
  const [estado, setEstado] = useState<Estado>({ tipo: "ocioso" })

  async function disparar() {
    setEstado({ tipo: "carregando" })
    try {
      const r = await fetch("/api/reconciliar", { cache: "no-store" })
      if (!r.ok) {
        const txt = await r.text()
        setEstado({ tipo: "erro", mensagem: `HTTP ${r.status} — ${txt}` })
        return
      }
      const dados = (await r.json()) as ReconciliarResponse
      setEstado({ tipo: "ok", dados })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setEstado({ tipo: "erro", mensagem: msg })
    }
  }

  return (
    <section
      className="glass"
      style={{
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text-1)",
              marginBottom: 4,
            }}
          >
            Reconciliar fontes de dados
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-3)",
              lineHeight: 1.5,
              maxWidth: 560,
            }}
          >
            Lista divergências entre <code>empresas_config</code>,{" "}
            <code>tokens_meta</code>, <code>dados_reais</code> e{" "}
            <code>dados_diarios_log</code>. Use para detectar empresas
            removidas que ainda aparecem em totais, tokens órfãos e
            registros com chave em slug.
          </p>
        </div>
        <button
          type="button"
          onClick={disparar}
          disabled={estado.tipo === "carregando"}
          style={{
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-1)",
            background: "var(--accent)",
            border: "none",
            borderRadius: 6,
            cursor: estado.tipo === "carregando" ? "wait" : "pointer",
            opacity: estado.tipo === "carregando" ? 0.6 : 1,
          }}
        >
          {estado.tipo === "carregando" ? "Verificando..." : "Verificar agora"}
        </button>
      </div>

      {estado.tipo === "erro" && (
        <div
          style={{
            padding: 12,
            background: "rgba(220,38,38,0.12)",
            color: "var(--text-1)",
            border: "1px solid rgba(220,38,38,0.35)",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          Erro: {estado.mensagem}
        </div>
      )}

      {estado.tipo === "ok" && <Resultado dados={estado.dados} />}
    </section>
  )
}

function Resultado({ dados }: { dados: ReconciliarResponse }) {
  const tudoOk =
    dados.tokens_fantasmas.length === 0 &&
    dados.empresas_sem_tracking.length === 0 &&
    dados.dados_reais_slug.length === 0 &&
    dados.divergencias.length === 0

  if (tudoOk) {
    return (
      <div
        style={{
          padding: 12,
          background: "rgba(34,197,94,0.10)",
          border: "1px solid rgba(34,197,94,0.35)",
          borderRadius: 6,
          fontSize: 13,
          color: "var(--text-1)",
        }}
      >
        ✓ Tudo coerente. Sem fantasmas, sem empresas sem tracking, sem
        chaves em slug e sem divergências no mês corrente ({dados.mes_atual}{" "}
        {dados.ano_atual}).
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Bloco
        titulo={`Tokens fantasmas (${dados.tokens_fantasmas.length})`}
        descricao="Token Meta ativo, mas empresa não está ativa em empresas_config. Sentinela coleta gasto que vira órfão."
        vazio={dados.tokens_fantasmas.length === 0}
      >
        <ul style={listaStyle}>
          {dados.tokens_fantasmas.map((t) => (
            <li key={`${t.empresa}|${t.ad_account_id}`} style={itemStyle}>
              <strong>{t.empresa}</strong> · {t.ad_account_id}
              {t.campaign_filter ? ` · filter=${t.campaign_filter}` : " · fallback"}
              {t.empresa_config_nome === null
                ? " · empresa_config inexistente"
                : ` · empresa_config.ativa=${t.empresa_config_ativa}`}
            </li>
          ))}
        </ul>
      </Bloco>

      <Bloco
        titulo={`Empresas sem tracking (${dados.empresas_sem_tracking.length})`}
        descricao="Empresa ativa em empresas_config, mas sem token Meta ativo. Não aparece em /dashboard/trafego."
        vazio={dados.empresas_sem_tracking.length === 0}
      >
        <ul style={listaStyle}>
          {dados.empresas_sem_tracking.map((e) => (
            <li key={e.slug} style={itemStyle}>
              <strong>{e.nome}</strong> · slug={e.slug} · db={e.db}
            </li>
          ))}
        </ul>
      </Bloco>

      <Bloco
        titulo={`dados_reais com chave em slug (${dados.dados_reais_slug.length})`}
        descricao="Linhas legadas onde empresa= snake_case (ex.: f2_sports). Sentinela grava nome canônico; essas são lixo do parseNumero quebrado."
        vazio={dados.dados_reais_slug.length === 0}
      >
        <ul style={listaStyle}>
          {dados.dados_reais_slug.map((r) => (
            <li
              key={`${r.empresa}|${r.mes}|${r.ano}`}
              style={itemStyle}
            >
              <strong>{r.empresa}</strong> · {r.mes}/{r.ano} · inv=
              {fmtBRL(r.investimento_real ?? 0)} · fat=
              {fmtBRL(r.faturamento_real ?? 0)}
            </li>
          ))}
        </ul>
      </Bloco>

      <Bloco
        titulo={`Divergências dr ↔ ddl em ${dados.mes_atual} ${dados.ano_atual} (${dados.divergencias.length})`}
        descricao="Soma de dados_reais difere de dados_diarios_log. Sinal de write-divergence — leituras devem sair só de ddl."
        vazio={dados.divergencias.length === 0}
      >
        <ul style={listaStyle}>
          {dados.divergencias.map((d, i) => (
            <li key={`${d.empresa}|${d.campo}|${i}`} style={itemStyle}>
              <strong>{d.empresa}</strong> · {d.campo} · dr=
              {fmtBRL(d.total_dados_reais)} · ddl=
              {fmtBRL(d.total_dados_diarios_log)} · Δ=
              {fmtBRL(d.diferenca)}
            </li>
          ))}
        </ul>
      </Bloco>
    </div>
  )
}

function Bloco({
  titulo,
  descricao,
  vazio,
  children,
}: {
  titulo: string
  descricao: string
  vazio: boolean
  children: React.ReactNode
}) {
  return (
    <details
      open={!vazio}
      style={{
        padding: 12,
        background: vazio
          ? "rgba(34,197,94,0.08)"
          : "rgba(76, 78, 84,0.08)",
        border: `1px solid ${
          vazio ? "rgba(34,197,94,0.30)" : "rgba(76, 78, 84,0.30)"
        }`,
        borderRadius: 6,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-1)",
        }}
      >
        {vazio ? "✓ " : "⚠ "}
        {titulo}
      </summary>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-3)",
          marginTop: 8,
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      >
        {descricao}
      </p>
      {!vazio && children}
    </details>
  )
}

const listaStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 12,
  color: "var(--text-2)",
  lineHeight: 1.6,
  fontFamily: "ui-monospace, monospace",
}

const itemStyle: React.CSSProperties = {
  marginBottom: 4,
}
