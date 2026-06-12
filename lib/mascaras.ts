/**
 * Máscaras e formatação pt-BR para inputs (digitação em tempo real).
 *
 * Princípio: cada formatador recebe o que o usuário digitou e devolve a
 * versão FORMATADA pra exibir. Funções puras, sem dependência de React —
 * usadas pelos componentes de input em components/inputs/.
 *
 * Para campos numéricos (moeda/decimal), o componente exibe a versão bonita
 * ("R$ 1.234,56") mas submete um VALOR-MÁQUINA limpo ("1234.56") num campo
 * oculto, porque o parser do servidor (lib/parse-numero.ts) rejeita texto com
 * letras e o caso ambíguo "1.234". Ver `valorMaquinaDeCentavos`.
 */

/** Remove tudo que não é dígito. */
export function apenasDigitos(v: string): string {
  return (v ?? "").replace(/\D/g, "")
}

/** Limita a string a `max` dígitos (após remover não-dígitos). */
export function limitarDigitos(v: string, max: number): string {
  return apenasDigitos(v).slice(0, max)
}

// ============================================================
// Documentos e contatos
// ============================================================

/** Telefone BR progressivo: (99) 9999-9999 (fixo) ou (99) 99999-9999 (celular).
 *  Aceita até 11 dígitos. Formata conforme o usuário digita. */
export function formatarTelefone(v: string): string {
  const d = limitarDigitos(v, 11)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Telefone com DDI BR no formato E.164 a partir dos dígitos (55 + DDD + nº).
 *  Para campos telefone_e164. Sem DDI digitado, prefixa 55. */
export function telefoneParaE164(v: string): string {
  const d = apenasDigitos(v)
  if (d.length === 0) return ""
  // Já veio com 55 + 10/11 dígitos (12/13 no total) → mantém.
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+${d}`
  // 10/11 dígitos (DDD + número) → prefixa 55.
  if (d.length === 10 || d.length === 11) return `+55${d}`
  // Qualquer outro tamanho: retorna os dígitos com + (validação fica no submit).
  return `+${d}`
}

/** CEP BR: 99999-999 (8 dígitos). */
export function formatarCEP(v: string): string {
  const d = limitarDigitos(v, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

/** CPF: 999.999.999-99 (11 dígitos). */
export function formatarCPF(v: string): string {
  const d = limitarDigitos(v, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** CNPJ: 99.999.999/9999-99 (14 dígitos). */
export function formatarCNPJ(v: string): string {
  const d = limitarDigitos(v, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** Valida dígitos verificadores de CPF (11 dígitos). Rejeita repetidos. */
export function cpfValido(v: string): boolean {
  const d = apenasDigitos(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const calc = (fatorInicial: number, ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (fatorInicial - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return calc(10, 9) === Number(d[9]) && calc(11, 10) === Number(d[10])
}

/** Valida dígitos verificadores de CNPJ (14 dígitos). Rejeita repetidos. */
export function cnpjValido(v: string): boolean {
  const d = apenasDigitos(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (tam: number) => {
    const pesos =
      tam === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < tam; i++) soma += Number(d[i]) * pesos[i]
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

// ============================================================
// Números: moeda e decimal (abordagem "centavos da direita")
// ============================================================

/** Pretty BR a partir de dígitos crus, com `casas` decimais. O usuário digita
 *  só dígitos e os últimos `casas` viram a parte decimal (abordagem caixa-
 *  registradora — sem ambiguidade). Ex.: "123456" + casas 2 → "1.234,56". */
export function formatarNumeroBR(v: string, casas: number): string {
  const d = apenasDigitos(v)
  if (d.length === 0) return ""
  const cru = d.padStart(casas + 1, "0")
  const corte = cru.length - casas
  const inteira = cru.slice(0, corte).replace(/^0+(?=\d)/, "")
  const decimal = cru.slice(corte)
  const inteiraSep = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return casas > 0 ? `${inteiraSep},${decimal}` : inteiraSep
}

/** Moeda BR com "R$ " na frente. Ex.: "123456" → "R$ 1.234,56". */
export function formatarMoeda(v: string): string {
  const n = formatarNumeroBR(v, 2)
  return n === "" ? "" : `R$ ${n}`
}

/** Converte dígitos crus + casas no VALOR-MÁQUINA submetível (ponto decimal,
 *  sem separador de milhar) que o parser do servidor aceita. Ex.: "123456",2
 *  → "1234.56". Vazio → "". */
export function valorMaquina(v: string, casas: number): string {
  const d = apenasDigitos(v)
  if (d.length === 0) return ""
  if (casas === 0) return String(Number(d))
  const cru = d.padStart(casas + 1, "0")
  const corte = cru.length - casas
  const inteira = cru.slice(0, corte).replace(/^0+(?=\d)/, "")
  const decimal = cru.slice(corte)
  return `${inteira}.${decimal}`
}

/** Extrai só os dígitos de um valor-máquina/pretty pré-existente, pra
 *  inicializar o estado do componente a partir de um defaultValue numérico.
 *  Ex.: 1234.5 (casas 2) → "123450"; 1234.56 → "123456". */
export function digitosDeValor(valor: number | string | null | undefined, casas: number): string {
  if (valor === null || valor === undefined || valor === "") return ""
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."))
  if (!Number.isFinite(n)) return ""
  const escala = Math.pow(10, casas)
  return String(Math.round(n * escala))
}
