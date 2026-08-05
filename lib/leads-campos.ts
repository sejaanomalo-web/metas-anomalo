// =============================================================================
// Normalização do field_data dos formulários instantâneos do Meta.
// =============================================================================
// A Graph API devolve as respostas como:
//   [{ "name": "full_name", "values": ["João da Silva"] },
//    { "name": "phone_number", "values": ["+5545999998888"] },
//    { "name": "voce_tem_cnh?", "values": ["Sim"] }]
//
// Dois problemas práticos:
//   1. Cada cliente nomeia os campos como quer. "telefone", "phone_number",
//      "numero_de_telefone" e "whatsapp" são todos O telefone.
//   2. Perguntas customizadas têm nomes arbitrários e nunca vão caber num
//      esquema fixo de colunas.
//
// Estratégia: extrair nome/telefone/email pra colunas próprias (busca e
// exibição rápida) e PRESERVAR o field_data inteiro em jsonb. A tela mostra
// os campos reconhecidos primeiro e depois todo o resto do jeito que veio —
// assim uma pergunta nova de um cliente aparece sozinha, sem deploy.
//
// Módulo PURO (sem I/O): importado por Server Components e pela ingestão.
// =============================================================================

import { normalizarTelefone } from "./crm-telefone"

export interface CampoLead {
  /** Nome cru do campo, como veio da Meta. */
  nome: string
  /** Rótulo legível ("Qual seu melhor e-mail?"). */
  rotulo: string
  /** Valor já unido (campos de múltipla escolha vêm com vários valores). */
  valor: string
}

export interface DadosExtraidos {
  nome: string | null
  telefone: string | null
  email: string | null
  campos: CampoLead[]
}

// Nomes de campo que a Meta usa por padrão + as variações em português que
// aparecem em formulário customizado. Comparação sempre normalizada
// (minúsculas, sem acento, sem separador).
const CHAVES_NOME = [
  "fullname",
  "name",
  "nome",
  "nomecompleto",
  "seunome",
  "qualseunome",
  "firstname",
  "primeironome",
]

const CHAVES_SOBRENOME = ["lastname", "sobrenome", "ultimonome"]

const CHAVES_TELEFONE = [
  "phonenumber",
  "phone",
  "telefone",
  "celular",
  "whatsapp",
  "numerodetelefone",
  "numero",
  "contato",
  "telefonecelular",
  "seutelefone",
  "seuwhatsapp",
]

const CHAVES_EMAIL = ["email", "emailaddress", "seuemail", "melhoremail", "mail"]

/** minúsculas, sem acento, só letras e números — pra casar "Nome Completo",
 *  "nome_completo" e "nomeCompleto" na mesma chave. */
function normalizarChave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/** Transforma "nome_completo" / "qual_seu_melhor_email" em algo legível. */
function humanizar(nomeCru: string): string {
  const limpo = nomeCru.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  if (limpo === "") return nomeCru
  return limpo.charAt(0).toUpperCase() + limpo.slice(1)
}

/** Aceita tanto o array da Graph API quanto qualquer lixo (jsonb corrompido,
 *  null, objeto). Nunca lança — a ingestão não pode morrer por causa de um
 *  formato inesperado num único lead. */
function comoArray(field_data: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(field_data)) return []
  return field_data.filter(
    (x): x is Record<string, unknown> => typeof x === "object" && x !== null
  )
}

function valorDe(item: Record<string, unknown>): string {
  const v = item.values
  if (Array.isArray(v)) {
    return v
      .map((x) => (x === null || x === undefined ? "" : String(x)))
      .filter((s) => s.trim() !== "")
      .join(", ")
  }
  if (v === null || v === undefined) return ""
  return String(v)
}

/**
 * Extrai nome, telefone e e-mail do field_data e devolve também a lista
 * completa de campos pra exibição.
 *
 * O telefone passa por normalizarTelefone (lib/crm-telefone.ts) pra virar
 * E.164 só-dígitos, que é o formato que o link wa.me espera. Se a
 * normalização falhar (número estrangeiro fora do padrão BR, campo
 * preenchido com texto), guarda o valor CRU em vez de descartar — melhor um
 * telefone estranho na tela do que campo vazio.
 */
export function extrairDados(field_data: unknown): DadosExtraidos {
  const itens = comoArray(field_data)

  const campos: CampoLead[] = []
  let nome: string | null = null
  let sobrenome: string | null = null
  let telefone: string | null = null
  let email: string | null = null

  for (const item of itens) {
    const nomeCru = typeof item.name === "string" ? item.name : ""
    if (nomeCru === "") continue
    const valor = valorDe(item)
    const chave = normalizarChave(nomeCru)

    if (valor.trim() !== "") {
      if (nome === null && CHAVES_NOME.includes(chave)) {
        nome = valor.trim()
      } else if (sobrenome === null && CHAVES_SOBRENOME.includes(chave)) {
        sobrenome = valor.trim()
      } else if (telefone === null && CHAVES_TELEFONE.includes(chave)) {
        telefone = normalizarTelefone(valor) ?? valor.trim()
      } else if (email === null && CHAVES_EMAIL.includes(chave)) {
        email = valor.trim().toLowerCase()
      }
    }

    campos.push({
      nome: nomeCru,
      rotulo: humanizar(nomeCru),
      valor,
    })
  }

  // Formulário que separa nome/sobrenome: junta nas colunas de exibição.
  if (nome && sobrenome) nome = `${nome} ${sobrenome}`
  else if (!nome && sobrenome) nome = sobrenome

  return { nome, telefone, email, campos }
}

/** Só os campos que NÃO viraram coluna própria — o "resto" da ficha, pra não
 *  repetir nome/telefone/e-mail duas vezes na tela. */
export function camposExtras(campos: CampoLead[]): CampoLead[] {
  return campos.filter((c) => {
    const k = normalizarChave(c.nome)
    return (
      !CHAVES_NOME.includes(k) &&
      !CHAVES_SOBRENOME.includes(k) &&
      !CHAVES_TELEFONE.includes(k) &&
      !CHAVES_EMAIL.includes(k) &&
      c.valor.trim() !== ""
    )
  })
}

/** Telefone E.164 → "(45) 99999-8888". Devolve o valor cru se não reconhecer
 *  o formato brasileiro (ex.: número estrangeiro). */
export function formatarTelefone(tel: string | null): string {
  if (!tel) return "—"
  const d = tel.replace(/\D/g, "")
  const semPais = d.startsWith("55") ? d.slice(2) : d
  if (semPais.length === 11) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 7)}-${semPais.slice(7)}`
  }
  if (semPais.length === 10) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 6)}-${semPais.slice(6)}`
  }
  return tel
}

/** Link wa.me pra abrir a conversa direto. null se não houver telefone
 *  utilizável — o mesmo padrão viewer-only do CRM (Fase 8): a conversa
 *  acontece no WhatsApp do usuário, o sistema só abre a porta. */
export function linkWhatsApp(tel: string | null): string | null {
  if (!tel) return null
  const d = tel.replace(/\D/g, "")
  if (d.length < 10) return null
  return `https://wa.me/${d}`
}
