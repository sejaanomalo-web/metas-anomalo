// Inicialização do Sentry no runtime Node (server components, route handlers,
// server actions). Carregado por instrumentation.ts quando NEXT_RUNTIME=nodejs.
// O DSN é público por natureza (também vai pro bundle do client); o que é
// segredo é o SENTRY_AUTH_TOKEN (só no build, na Vercel) pra subir source maps.
import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://5c234c84f1da2989a25d377686649415@o4511448505712640.ingest.us.sentry.io/4511724548521984",
  // Amostragem de performance (traces). Erros são SEMPRE capturados,
  // independente disso. 10% pra não estourar a cota do plano.
  tracesSampleRate: 0.1,
  // Só reporta em produção (build da Vercel) — evita ruído rodando `next dev`.
  enabled: process.env.NODE_ENV === "production",
})
