// Inicialização do Sentry no browser (client components). Carregado
// automaticamente pelo @sentry/nextjs no bundle do client. O DSN aqui é
// público (fica visível no navegador) — isso é esperado e seguro.
import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://5c234c84f1da2989a25d377686649415@o4511448505712640.ingest.us.sentry.io/4511724548521984",
  tracesSampleRate: 0.1,
  // Só reporta em produção — evita ruído no desenvolvimento local.
  enabled: process.env.NODE_ENV === "production",
})
