// Hook de instrumentação do Next (App Router). Carrega a config do Sentry do
// runtime correto e registra o handler de erros de requisição (RSC/route
// handlers/server actions). Requer experimental.instrumentationHook no Next 14
// (ver next.config.mjs); no Next 15+ é padrão.
import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

export const onRequestError = Sentry.captureRequestError
