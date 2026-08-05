import BotaoLinkLeads from "@/components/leads/BotaoLinkLeads"
import GerenciadorFormsLeads from "@/components/leads/GerenciadorFormsLeads"
import { requererPermissao } from "@/lib/auth"
import { clienteDisplayName } from "@/lib/clientes"
import {
  getResumoLeadsPorCliente,
  listarLeadsOrfaos,
  listarTodosClientesAtivos,
  listarTodosMapeamentos,
} from "@/lib/leads"
import { diaBRT, formatarDiaLongo } from "@/lib/leads-datas"

export const dynamic = "force-dynamic"

/**
 * Tela interna do módulo de leads do Meta.
 *
 * Três funções, nessa ordem de importância:
 *   1. Copiar o link do painel de cada cliente — é ASSIM que o lead chega ao
 *      cliente. Não há envio automático; o time copia daqui e manda no
 *      WhatsApp.
 *   2. Cadastrar quais formulários do Meta pertencem a cada cliente.
 *   3. Mostrar os leads ÓRFÃOS (formulário não mapeado) — a fila de "campanha
 *      nova entrou no ar e ninguém cadastrou". O lead não se perdeu, mas não
 *      chega ao cliente até alguém mapear.
 */
export default async function LeadsAdminPage() {
  await requererPermissao("leads")

  const hoje = diaBRT()
  const [clientes, mapeamentos, resumos, orfaos] = await Promise.all([
    listarTodosClientesAtivos(),
    listarTodosMapeamentos(),
    getResumoLeadsPorCliente(hoje),
    listarLeadsOrfaos(50),
  ])

  // Agrupa por empresa pra espelhar a organização do resto do dashboard.
  const porEmpresa = new Map<string, typeof clientes>()
  for (const c of clientes) {
    const lista = porEmpresa.get(c.empresa_nome) ?? []
    lista.push(c)
    porEmpresa.set(c.empresa_nome, lista)
  }

  const totalMapeados = mapeamentos.filter((m) => m.ativo).length
  const semToken = mapeamentos.filter((m) => m.ativo && !m.tem_token)

  return (
    <div style={{ padding: "0 0 40px" }}>
      <header style={{ marginBottom: 22 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-1)",
            letterSpacing: "-0.3px",
          }}
        >
          Leads do Meta
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-3)",
            marginTop: 6,
            lineHeight: 1.6,
            maxWidth: 620,
          }}
        >
          Cada cliente tem um link próprio, sem login, onde vê os leads dele e
          filtra por período e formulário. Copie o link e envie pelo WhatsApp —
          ele é fixo e continua valendo para sempre.
        </p>
      </header>

      {/* Avisos que exigem ação */}
      {semToken.length > 0 && (
        <div className="glass" style={{ ...aviso, marginBottom: 12 }}>
          <p style={avisoTitulo}>
            ⚠️ {semToken.length} formulário(s) sem Page Access Token
          </p>
          <p style={avisoTexto}>
            {semToken.map((m) => m.rotulo).join(", ")} — sem o token o sistema
            não consegue ler os dados do lead na Meta. O lead entra, mas chega
            vazio.
          </p>
        </div>
      )}

      {orfaos.length > 0 && (
        <div className="glass" style={{ ...aviso, marginBottom: 20 }}>
          <p style={avisoTitulo}>
            ⚠️ {orfaos.length} lead(s) de formulário não cadastrado
          </p>
          <p style={avisoTexto}>
            Estes leads foram salvos, mas não aparecem para nenhum cliente
            porque o formulário não está mapeado. Cadastre o ID abaixo no
            cliente certo e eles passam a aparecer.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 10,
            }}
          >
            {[...new Set(orfaos.map((o) => o.form_id))].map((formId) => (
              <span
                key={formId}
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  padding: "4px 8px",
                  borderRadius: 5,
                  border: "0.5px solid rgba(229,165,10,0.35)",
                  background: "rgba(229,165,10,0.1)",
                  color: "#e5a50a",
                }}
              >
                {formId} ({orfaos.filter((o) => o.form_id === formId).length})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Resumo */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <Indicador rotulo="Clientes ativos" valor={clientes.length} />
        <Indicador rotulo="Formulários ativos" valor={totalMapeados} />
        <Indicador
          rotulo="Leads hoje"
          valor={[...resumos.values()].reduce((s, r) => s + r.hoje, 0)}
        />
        <Indicador
          rotulo="Leads no total"
          valor={[...resumos.values()].reduce((s, r) => s + r.total, 0)}
        />
      </div>

      {clientes.length === 0 && (
        <div className="glass" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--text-2)" }}>
            Nenhum cliente de tráfego ativo cadastrado.
          </p>
        </div>
      )}

      {[...porEmpresa.entries()].map(([empresa, lista]) => (
        <section key={empresa} style={{ marginBottom: 26 }}>
          <h2
            style={{
              fontSize: 11,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "var(--text-4)",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            {empresa}
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lista.map((c) => {
              const meus = mapeamentos.filter((m) => m.cliente_id === c.id)
              const r = resumos.get(c.id)
              return (
                <div key={c.id} className="glass" style={{ padding: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: "var(--text-1)",
                        }}
                      >
                        {clienteDisplayName(c)}
                      </p>
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--text-3)",
                          marginTop: 3,
                        }}
                      >
                        {r?.total ?? 0} lead(s) · {r?.hoje ?? 0} hoje ·{" "}
                        {meus.filter((m) => m.ativo).length} formulário(s)
                      </p>
                    </div>
                    <BotaoLinkLeads token={c.leads_dash_token} />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <GerenciadorFormsLeads
                      clienteId={c.id}
                      clienteNome={clienteDisplayName(c)}
                      mapeamentos={meus}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {/* Órfãos detalhados */}
      {orfaos.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <h2
            style={{
              fontSize: 11,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "var(--text-4)",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Leads sem cliente
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {orfaos.slice(0, 20).map((o) => (
              <div
                key={o.id}
                className="glass"
                style={{
                  padding: "10px 13px",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                  {o.nome ?? "Sem nome"}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-4)",
                    fontFamily: "monospace",
                  }}
                >
                  {o.form_id} · {formatarDiaLongo(o.data_brt)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="glass" style={{ padding: "12px 16px", minWidth: 130 }}>
      <p
        style={{
          fontSize: 10,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          color: "var(--text-4)",
          fontWeight: 500,
        }}
      >
        {rotulo}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--text-1)",
          marginTop: 4,
        }}
      >
        {valor}
      </p>
    </div>
  )
}

const aviso: React.CSSProperties = {
  padding: 15,
  border: "0.5px solid rgba(229,165,10,0.3)",
}

const avisoTitulo: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  color: "#e5a50a",
}

const avisoTexto: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--text-3)",
  marginTop: 6,
  lineHeight: 1.6,
}
