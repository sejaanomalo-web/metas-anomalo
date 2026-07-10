import Link from "next/link"
import type { CrmLeadRow } from "@/lib/crm-leads"
import Avatar from "@/components/crm/Avatar"
import { EtiquetaChip } from "@/components/crm/Etiquetas"

function tempoRelativo(iso: string | null): string {
  if (!iso) return ""
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export default function ListaConversas({
  leads,
  leadSelecionadoId,
  corPorEmpresa,
}: {
  leads: CrmLeadRow[]
  leadSelecionadoId?: string
  /** empresa_slug -> cor da instância (identificação visual por número). */
  corPorEmpresa: Record<string, string>
}) {
  if (leads.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-3)", padding: 16 }}>
        Nenhuma conversa ainda. Conecte um número em{" "}
        <Link href="/dashboard/crm/conexoes" style={{ color: "var(--gold, #C9953A)" }}>
          Conexões
        </Link>
        .
      </p>
    )
  }

  // Seções: não lidas em cima (como um inbox de verdade), depois o resto — cada
  // grupo já vem ordenado por recência do servidor.
  const naoLidas = leads.filter((l) => l.nao_lidas > 0)
  const lidas = leads.filter((l) => l.nao_lidas === 0)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {naoLidas.length > 0 && (
        <>
          <SecaoHeader titulo={`Não lidas · ${naoLidas.length}`} destaque />
          {naoLidas.map((lead) => (
            <LinhaConversa
              key={lead.id}
              lead={lead}
              selecionado={lead.id === leadSelecionadoId}
              cor={corPorEmpresa[lead.empresa_slug] ?? "#C9953A"}
            />
          ))}
        </>
      )}
      {lidas.length > 0 && (
        <>
          {naoLidas.length > 0 && <SecaoHeader titulo="Conversas" />}
          {lidas.map((lead) => (
            <LinhaConversa
              key={lead.id}
              lead={lead}
              selecionado={lead.id === leadSelecionadoId}
              cor={corPorEmpresa[lead.empresa_slug] ?? "#C9953A"}
            />
          ))}
        </>
      )}
    </div>
  )
}

function SecaoHeader({ titulo, destaque }: { titulo: string; destaque?: boolean }) {
  return (
    <p
      style={{
        fontSize: 9,
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        fontWeight: 600,
        color: destaque ? "var(--gold, #C9953A)" : "var(--text-4)",
        padding: "10px 12px 4px",
        position: "sticky",
        top: 0,
        background: "var(--card-bg)",
        zIndex: 1,
      }}
    >
      {titulo}
    </p>
  )
}

function LinhaConversa({
  lead,
  selecionado,
  cor,
}: {
  lead: CrmLeadRow
  selecionado: boolean
  cor: string
}) {
  const nomeExibido = lead.nome || lead.telefone_e164 || "Lead sem nome"
  const semNome = !lead.nome
  return (
    <Link
      href={`/dashboard/crm?lead=${lead.id}`}
      className="flex items-start gap-3"
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        borderLeft: `3px solid ${selecionado ? cor : `${cor}55`}`,
        background: selecionado ? "rgba(201,149,58,0.10)" : "transparent",
        // Pula pintura de linhas fora da viewport — mata o "engasgo" do scroll
        // em listas longas. A altura estimada evita salto de barra de rolagem.
        contentVisibility: "auto",
        containIntrinsicSize: "0 66px",
      }}
    >
      <Avatar nome={nomeExibido} cor={cor} fotoUrl={lead.foto_url} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: selecionado
                ? "var(--gold, #C9953A)"
                : semNome
                ? "var(--text-3)"
                : "inherit",
              fontStyle: semNome ? "italic" : "normal",
            }}
            className="truncate"
          >
            {nomeExibido}
          </p>
          <span style={{ fontSize: 10, color: "var(--text-4)", flexShrink: 0 }}>
            {tempoRelativo(lead.ultima_interacao_em)}
          </span>
        </div>
        {lead.ultima_msg_preview && (
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p
              style={{
                fontSize: 11,
                color: lead.nao_lidas > 0 ? "var(--text-2, #ddd)" : "var(--text-3)",
                fontWeight: lead.nao_lidas > 0 ? 500 : 400,
              }}
              className="truncate"
            >
              {lead.ultima_msg_preview}
            </p>
            {lead.nao_lidas > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#0a0a0a",
                  background: "var(--gold, #C9953A)",
                  borderRadius: 999,
                  padding: "1px 7px",
                  flexShrink: 0,
                }}
              >
                {lead.nao_lidas}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span
            style={{ fontSize: 10, color: cor, fontWeight: 500 }}
            className="truncate"
          >
            {lead.empresa_nome}
          </span>
          {lead.nao_lidas > 0 && !lead.ultima_msg_preview && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#0a0a0a",
                background: "var(--gold, #C9953A)",
                borderRadius: 999,
                padding: "1px 7px",
                flexShrink: 0,
              }}
            >
              {lead.nao_lidas}
            </span>
          )}
        </div>
        {lead.etiquetas.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {lead.etiquetas.map((e) => (
              <EtiquetaChip key={e.id} nome={e.nome} cor={e.cor} />
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
