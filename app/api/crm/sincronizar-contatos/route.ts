import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { bearerValido } from "@/lib/cron-auth"
import { buscarPerfilContatoEvolution } from "@/lib/evolution"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Batelada por execução — folgado o bastante pra não estourar maxDuration=60s
// (cada chamada à Evolution tem timeout de 12s), mas limitado pra não
// martelar a API em contas com muitos leads sem foto/nome de uma vez.
const LOTE = 25
const THROTTLE_MS = 20 * 60 * 60 * 1000 // ~20h — não retenta todo dia sem folga

/**
 * Cron diário: completa nome/recado/foto dos leads que ainda não têm (e não
 * foram nomeados à mão) sem precisar abrir cada conversa manualmente — cobre
 * o backlog de contatos antigos e os que a Fase 4 não pegou. O auto-sync
 * "ao abrir a conversa" (Thread.tsx) cobre o caso instantâneo; este cron
 * cobre os leads que ninguém abriu ainda.
 */
async function executar() {
  const authHeader = headers().get("authorization")
  if (!bearerValido(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  if (!db) return NextResponse.json({ erro: "service_role_ausente" }, { status: 500 })

  const corteIso = new Date(Date.now() - THROTTLE_MS).toISOString()
  const { data: candidatos, error } = await db
    .from("crm_leads")
    .select("id, usuario_id, empresa_slug, telefone_e164, nome, foto_url, nome_manual")
    .eq("nome_manual", false)
    .eq("arquivado", false)
    .not("telefone_e164", "is", null)
    .or("nome.is.null,foto_url.is.null")
    .or(`perfil_sync_tentado_em.is.null,perfil_sync_tentado_em.lt.${corteIso}`)
    .limit(LOTE)

  if (error) {
    console.error("[crm/sincronizar-contatos] erro ao listar candidatos", error.message)
    return NextResponse.json({ erro: "leitura_falhou" }, { status: 500 })
  }

  let atualizados = 0
  let semInstancia = 0
  let semNovidade = 0
  const agora = new Date().toISOString()

  for (const lead of candidatos ?? []) {
    const { data: inst } = await db
      .from("crm_instancias")
      .select("instance_name")
      .eq("empresa_slug", lead.empresa_slug as string)
      .eq("usuario_id", lead.usuario_id as string)
      .eq("ativo", true)
      .eq("status_conexao", "conectado")
      .limit(1)
      .maybeSingle()

    if (!inst) {
      semInstancia++
      // Carimba mesmo sem instância — evita reconsultar leads de empresas
      // sem conexão ativa a cada execução do cron.
      await db.from("crm_leads").update({ perfil_sync_tentado_em: agora }).eq("id", lead.id)
      continue
    }

    const perfil = await buscarPerfilContatoEvolution(
      inst.instance_name as string,
      lead.telefone_e164 as string
    )

    const patch: Record<string, unknown> = {
      updated_at: agora,
      perfil_sync_tentado_em: agora,
    }
    if (perfil.nome && !lead.nome_manual) patch.nome = perfil.nome
    if (perfil.sobre) patch.sobre = perfil.sobre
    if (perfil.foto) patch.foto_url = perfil.foto

    await db.from("crm_leads").update(patch).eq("id", lead.id)

    if (perfil.nome || perfil.sobre || perfil.foto) atualizados++
    else semNovidade++
  }

  return NextResponse.json({
    ok: true,
    candidatos: (candidatos ?? []).length,
    atualizados,
    sem_instancia: semInstancia,
    sem_novidade: semNovidade,
  })
}

export async function GET() {
  return executar()
}

export async function POST() {
  return executar()
}
