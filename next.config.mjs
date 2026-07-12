import { withSentryConfig } from "@sentry/nextjs"

/** @type {import('next').NextConfig} */

// Headers de segurança aplicados a TODAS as respostas. Conjunto conservador
// (não inclui Content-Security-Policy, que exige testes por causa dos estilos
// inline do app — fica como passo separado). Nada aqui muda o que o usuário vê.
const securityHeaders = [
  // Impede o browser de "adivinhar" o content-type (anti MIME-sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // O painel nunca é embutido em iframe — bloqueia clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  // Não vaza a URL completa pra origens externas.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desliga APIs sensíveis que o app não usa. `microphone=(self)`: liberado só
  // pra própria origem — necessário pra gravar áudio no CRM (MediaRecorder).
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(self), camera=()",
  },
  // Força HTTPS por 1 ano (Vercel já serve TLS).
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
]

const nextConfig = {
  reactStrictMode: true,
  // Não anuncia "X-Powered-By: Next.js".
  poweredByHeader: false,
  // Necessário no Next 14 pra o Next carregar instrumentation.ts (Sentry).
  // No Next 15+ isso é padrão e o flag pode sair.
  experimental: {
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

// Envolve a config com o Sentry: injeta a instrumentação e sobe source maps no
// build (usando SENTRY_AUTH_TOKEN do ambiente da Vercel; sem o token o build
// segue normal, só sem source maps — os erros ainda são capturados).
export default withSentryConfig(nextConfig, {
  org: "anomalo-hub",
  project: "metas-anomalo",
  // Silencioso fora de CI; oculta source maps do bundle público.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
})
