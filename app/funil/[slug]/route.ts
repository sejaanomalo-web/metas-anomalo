import { carregarFunil, lerTokenPrevia } from "@/lib/funil-estaticos"
import { cabecalhosSeguranca, paginaFunil, paginaIndisponivel } from "@/lib/funil-estaticos-pagina"

// Página pública do funil. Route Handler (não página React) de propósito:
// HTML mínimo, sem o layout/CSS global do Workspace — ver lib/funil-estaticos-cliente.ts.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function html(corpo: string, status: number, cacheavel: boolean) {
  return new Response(corpo, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Só configuração/textos são cacheados na CDN (nunca disponibilidade).
      "cache-control": cacheavel ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300" : "private, no-store",
      ...cabecalhosSeguranca(),
    },
  })
}

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const url = new URL(req.url)
  const previaBruta = url.searchParams.get("previa")
  let funil = await carregarFunil(params.slug)
  if (!funil) return html(paginaIndisponivel("Página não encontrada."), 404, false)
  // Slug antigo → endereço atual, preservando os parâmetros do anúncio.
  if (funil.slug !== params.slug) {
    return Response.redirect(new URL(`/funil/${funil.slug}${url.search}`, url.origin), 308)
  }
  let previa: string | null = null
  if (previaBruta) {
    const versaoId = lerTokenPrevia(funil.id, previaBruta)
    if (!versaoId) return html(paginaIndisponivel("Link de teste inválido ou expirado."), 403, false)
    const comVersao = await carregarFunil(params.slug, { versaoId })
    if (!comVersao) return html(paginaIndisponivel("Versão de teste inválida."), 404, false)
    funil = comVersao
    previa = previaBruta
  } else if (!funil.ativo) {
    return html(paginaIndisponivel(funil.definicao.textos.inativo), 200, true)
  }
  return html(paginaFunil({
    slug: funil.slug, nome: funil.nome, versaoId: funil.versaoId, def: funil.definicao, api: "/api/public/funil",
    privacidadeUrl: funil.privacidadeUrl, consentimentoModo: funil.consentimentoModo,
    // Prévia não carrega o Pixel de produção (evita PageView/Lead de teste no conjunto de dados).
    pixelId: previa ? null : funil.pixelId, eventosMeta: funil.eventosMeta, previa,
  }), 200, !previa)
}
