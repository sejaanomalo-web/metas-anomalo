import Link from "next/link"
import { getSupabaseAdmin } from "@/lib/supabase"

/** 3ª integração da aba Reuniões → Integrações (ao lado de Cal.com e ATIVO). */
export default async function CartaoFunilIntegracao() {
  const db = getSupabaseAdmin()
  const { data: funis, error } = db
    ? await db.from("funil_config").select("nome, slug, ativo, canal_chave, pixel_id, capi_ativo")
    : { data: null, error: true }
  const { data: canais } = db ? await db.from("reunioes_canais_nativos").select("chave, ativo") : { data: null }
  return (
    <section className="glass" style={{ padding: 14, borderRadius: 10, fontSize: 12, color: "var(--text-2)", display: "grid", gap: 6 }}>
      <strong style={{ color: "var(--text-1)" }}>Funil Estáticos Meta</strong>
      {error || !funis?.length ? (
        <span>Migration <code>20261127_funil_estaticos_meta.sql</code> ainda não aplicada.</span>
      ) : funis.map(f => {
        const agenda = canais?.find(c => c.chave === f.canal_chave)
        return (
          <div key={f.slug} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span>{f.ativo ? "Publicado" : "Inativo"} · agenda {agenda ? (agenda.ativo ? "ativa" : "inativa") : "não configurada"} · Pixel {f.pixel_id ? "configurado" : "—"} · CAPI {f.capi_ativo ? "ligada" : "desligada"}</span>
            <Link href={`/dashboard/workspace/funis/${f.slug}`} className="ws-btn-editar" style={{ textDecoration: "none", fontSize: 12 }}>Abrir funil</Link>
          </div>
        )
      })}
    </section>
  )
}
