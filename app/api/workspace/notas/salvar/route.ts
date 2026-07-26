import { NextResponse } from "next/server"
import { exigirWorkspace } from "@/lib/workspace-acesso"
import { gravarNota, type CamposNota } from "@/lib/workspace-notas-gravar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Flush de emergência do editor de notas.
 *
 * POR QUE EXISTE, se já existe a Server Action: quando a aba está sendo fechada
 * (`pagehide`) ou o sistema congela a página em segundo plano
 * (`visibilitychange` → hidden), o browser não garante que uma requisição
 * comum ainda saia — e uma Server Action não tem como pedir `keepalive`. Esta
 * rota é chamada com `fetch(..., { keepalive: true })`, a única forma
 * suportada de dizer ao browser "termine este POST mesmo que a página morra".
 *
 * Sem ela, o último trecho digitado antes de trocar de aba ou fechar a janela
 * ia embora — que é exatamente o bug relatado.
 *
 * MESMA autorização e MESMA sanitização da action: as duas passam por
 * exigirWorkspace() e gravarNota(). O corpo chega em JSON porque
 * `fetch(keepalive)` com FormData tem limite de tamanho menor em alguns
 * browsers.
 */
export async function POST(req: Request) {
  const { usuario, erro } = await exigirWorkspace()
  if (!usuario) {
    return NextResponse.json({ ok: false, erro }, { status: 401 })
  }

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido." }, { status: 400 })
  }

  const dados = (corpo ?? {}) as {
    id?: unknown
    titulo?: unknown
    corpo_html?: unknown
  }

  const id = typeof dados.id === "string" ? dados.id.trim() : ""
  if (!UUID.test(id)) {
    return NextResponse.json({ ok: false, erro: "Nota inválida." }, { status: 400 })
  }

  // Só os campos que vieram — campo ausente não é sobrescrito.
  const campos: CamposNota = {}
  if (typeof dados.titulo === "string") campos.titulo = dados.titulo
  if (typeof dados.corpo_html === "string") campos.corpo_html = dados.corpo_html

  const r = await gravarNota(usuario.id, id, campos)
  return NextResponse.json(r, { status: r.ok ? 200 : 500 })
}
