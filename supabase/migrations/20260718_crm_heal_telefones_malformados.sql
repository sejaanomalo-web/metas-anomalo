-- CRM — sanear telefones de leads MANUAIS gravados malformados. 2026-07-18.
--
-- Bug: o normalizador antigo (lib/crm-telefone.ts, versão anterior) só
-- prependia o código do país "55" quando o número tinha ≤ 11 dígitos. Um
-- número digitado com o prefixo de tronco ("0" + DDD), tipo "045991122829"
-- (12 dígitos), passava sem ganhar o 55 E sem perder o 0 → ia malformado pro
-- WhatsApp e a Evolution rejeitava com "Bad Request" (mensagem não saía).
--
-- Este UPDATE tira o(s) zero(s) à esquerda e prepende "55". É CONSERVADOR de
-- propósito — só toca em números que começam com "0" (E.164 nunca começa
-- com 0, então é sempre um brasileiro malformado). Números que chegaram
-- limpos do WhatsApp, inclusive ESTRANGEIROS (ex: "447710173736" = +44 Reino
-- Unido), NÃO começam com 0 e ficam intocados.
--
-- Idempotente: rodar de novo não faz nada (os números já não começam com 0).
-- O envio no app também auto-cura o número no próximo disparo
-- (resolverNumeroEnvio em lib/crm-mensagens-actions.ts); esta migração só
-- adianta a limpeza pros leads que ainda não foram mensageados.

update public.crm_leads as l
set
  telefone_e164 = '55' || regexp_replace(l.telefone_e164, '^0+', ''),
  updated_at = now()
where l.telefone_e164 like '0%'
  -- depois de tirar os zeros à esquerda, precisa sobrar um número nacional
  -- válido (DDD 2 + fixo 8 ou celular 9 = 10 ou 11 dígitos).
  and char_length(regexp_replace(l.telefone_e164, '^0+', '')) in (10, 11)
  -- não colide com a UNIQUE(empresa_slug, telefone_e164): se o número certo
  -- já existir como outro lead da mesma empresa, deixa quieto (evita o
  -- UPDATE quebrar; esse caso raro se resolve à mão).
  and not exists (
    select 1
    from public.crm_leads x
    where x.empresa_slug = l.empresa_slug
      and x.telefone_e164 = '55' || regexp_replace(l.telefone_e164, '^0+', '')
  );
