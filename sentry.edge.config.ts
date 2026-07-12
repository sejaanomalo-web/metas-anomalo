// Inicialização do Sentry no runtime Edge (middleware e rotas edge). Carregado
// por instrumentation.ts quando NEXT_RUNTIME=edge. Mesmo DSN dos demais.
import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://5c234c84f1da2989a25d377686649415@o4511448505712640.ingest.us.sentry.io/4511724548521984",
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
})
