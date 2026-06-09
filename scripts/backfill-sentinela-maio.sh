#!/usr/bin/env bash
# =============================================================================
# Backfill do Sentinela — MAIO/2026
# =============================================================================
# Relê maio direto da API do Meta e popula as métricas de anúncio que NÃO
# foram capturadas na carga original de maio (impressões, cliques, alcance,
# conversas, CPM) em dados_diarios_log + dados_diarios_campanha.
#
# A edge function `sentinela` JÁ aceita ?data=YYYY-MM-DD (no handler:
#   const dateStr = url.searchParams.get("data") || getYesterdayBRT();
# ), então o backfill é só chamá-la uma vez por dia de maio — nada na função
# precisou ser alterado.
#
# PRÉ-REQUISITOS (você roda — backfill é seu, conforme combinado):
#   export SENTINELA_SECRET='...'     # o MESMO secret do cron (obrigatório)
#   export SUPABASE_ANON_KEY='...'    # opcional, só se o gateway exigir auth
#   export SENTINELA_URL='...'        # opcional, sobrescreve a URL da função
#
# USO:
#   # 1) DRY-RUN de um dia — NÃO grava; confirma que o Meta retorna maio:
#   bash scripts/backfill-sentinela-maio.sh --dry-run 2026-05-15
#
#   # 2) Backfill pra valer (todos os 31 dias de maio):
#   bash scripts/backfill-sentinela-maio.sh
#
#   # 3) Um dia específico (debug):
#   bash scripts/backfill-sentinela-maio.sh 2026-05-20
#
# CAVEATS:
#   • Re-puxa do Meta (fonte da verdade): investimento/leads de maio podem
#     mudar um pouco vs. o que está hoje. Esperado e mais correto.
#   • Cada chamada grava 1 execução em logs_sentinela e roda detecção de
#     anomalias. O badge "última execução" aponta pro último backfill até o
#     cron normal de hoje à noite rodar e normalizar.
#   • Só clientes ATIVOS em tokens_meta são re-puxados.
#
# LIMPEZA DOS LOGS DE BACKFILL (opcional — rode no SQL editor do Supabase).
# logs_sentinela.id é bigint sequencial, então apague só o que for MAIOR que o
# id de antes do backfill — nunca pega execução real:
#   1) ANTES do backfill:
#        select max(id) as id_antes from logs_sentinela;          -- anote (ex.: 98)
#   2) rode o backfill (este script)
#   3) PREVIEW (troque 98 pelo seu id_antes; confira que são ~31 linhas):
#        select id, data_execucao, status, total_contas_processadas
#        from logs_sentinela where id > 98 order by id;
#   4) APAGAR:
#        delete from logs_sentinela where id > 98;
#      (se o cron noturno já tiver rodado, limite o topo:
#        delete from logs_sentinela where id > 98 and id <= <maior_id_do_backfill>;)
# =============================================================================

set -euo pipefail

FUNCTIONS_URL="${SENTINELA_URL:-https://cawwccbuejmvfemgdhvl.supabase.co/functions/v1/sentinela}"
MES="2026-05"
DIAS=31

: "${SENTINELA_SECRET:?Defina SENTINELA_SECRET (o mesmo do cron) antes de rodar}"

DRY=""
ONE_DAY=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY="&dry_run=1" ;;
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ONE_DAY="$arg" ;;
    *) echo "arg desconhecido: $arg (use --dry-run e/ou uma data YYYY-MM-DD)" >&2; exit 1 ;;
  esac
done

HEADERS=(-H "x-sentinela-secret: ${SENTINELA_SECRET}")
if [[ -n "${SUPABASE_ANON_KEY:-}" ]]; then
  HEADERS+=(-H "Authorization: Bearer ${SUPABASE_ANON_KEY}")
fi

# Resume o JSON da resposta numa linha. Usa jq se houver; senão, fallback grep.
resumir() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '"status=\(.status) contas=\(.totais.contas_processadas) falhas=\(.totais.contas_falhas) invest=R$\(.totais.investimento_total) leads=\(.totais.leads_totais)"' 2>/dev/null \
      || echo "(resposta não-JSON — confira o secret/URL)"
  else
    tr -d '\n' | sed -E 's/.*"status": *"([^"]+)".*"investimento_total": *([0-9.]+).*"leads_totais": *([0-9]+).*/status=\1 invest=R$\2 leads=\3/' \
      || echo "(instale jq pra um resumo melhor)"
  fi
}

chamar() {
  local d="$1"
  printf '  %s → ' "$d"
  curl -sS "${FUNCTIONS_URL}?data=${d}${DRY}" "${HEADERS[@]}" | resumir || echo "ERRO na chamada"
  sleep 1  # gentil com o rate limit do Meta
}

echo "Backfill Sentinela · ${MES}${DRY:+  (DRY-RUN — não grava)}"
echo "Função: ${FUNCTIONS_URL}"
echo

if [[ -n "$ONE_DAY" ]]; then
  chamar "$ONE_DAY"
else
  for d in $(seq 1 "$DIAS"); do
    chamar "$(printf '%s-%02d' "$MES" "$d")"
  done
fi

echo
if [[ -n "$DRY" ]]; then
  echo "Dry-run concluído — NADA foi gravado. Confira os números acima e rode sem --dry-run pra valer."
else
  echo "Backfill concluído. Abra o dashboard no período de MAIO pra conferir impressões/cliques/alcance/CTR/CPM."
fi
