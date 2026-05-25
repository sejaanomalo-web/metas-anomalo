/**
 * Parser numérico tolerante a formatos PT-BR e US, com rejeição de
 * entradas ambíguas. Retorna `{ value, erro }`:
 *
 *   - vazio (`null`/`""`)                → { value: null, erro: null }
 *   - "222,75"                           → 222.75 (BR vírgula decimal)
 *   - "1.234,56"                         → 1234.56 (BR ponto milhar)
 *   - "1,234.56"                         → 1234.56 (US ponto decimal)
 *   - "22,5" / "22.5" / "1.50"           → decimais óbvios
 *   - "1.234.567"                        → 1234567 (milhares só-ponto)
 *   - "22.275" (sem vírgula, ponto + 3)  → null + erro (AMBÍGUO)
 *
 * Heurística do passo 6: ponto seguido de exatamente 3 dígitos sem
 * vírgula no input é ambíguo (pode ser milhar BR ou decimal extremo).
 * O `replace(/\./g, "")` legado interpretava silenciosamente como
 * milhar, criando entradas fantasma (ex.: "22.275" → 22275 em vez do
 * 22,275 pretendido). Aqui rejeita explicitamente.
 *
 * Vive em arquivo próprio (não em lib/dados-reais.ts) porque aquele
 * tem "use server" no topo, e Next.js exige que TODOS os exports de
 * um módulo "use server" sejam funções async. Helper síncrono fica
 * em módulo neutro.
 */
export function parseNumeroForm(v: FormDataEntryValue | null): {
  value: number | null
  erro: string | null
} {
  if (v === null) return { value: null, erro: null }
  const raw = String(v).trim()
  if (raw === "") return { value: null, erro: null }
  if (!/^-?[0-9.,]+$/.test(raw)) {
    return { value: null, erro: `Número inválido: "${raw}".` }
  }
  const sinal = raw.startsWith("-") ? -1 : 1
  const corpo = raw.replace(/^-/, "")
  const temVirgula = corpo.includes(",")
  const temPonto = corpo.includes(".")

  const erroAmbiguo = (orig: string) =>
    `Número ambíguo: "${orig}". Para milhar use ponto (1.234) só com 4+ dígitos; para decimal use vírgula (22,275).`

  let normalizado: string

  if (!temVirgula && !temPonto) {
    normalizado = corpo
  } else if (temVirgula && !temPonto) {
    // Só vírgulas.
    const grupos = corpo.split(",")
    if (grupos.length === 2) {
      const [a, b] = grupos
      if (!/^[0-9]+$/.test(a) || !/^[0-9]+$/.test(b)) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      normalizado = a + "." + b
    } else {
      // Múltiplas vírgulas — só vale como separador de milhar (todos os
      // grupos após o primeiro devem ter 3 dígitos).
      const primeiroOk = /^[0-9]{1,3}$/.test(grupos[0])
      const demaisOk = grupos.slice(1).every((g) => /^[0-9]{3}$/.test(g))
      if (primeiroOk && demaisOk) {
        normalizado = grupos.join("")
      } else {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
    }
  } else if (temPonto && !temVirgula) {
    // Só pontos.
    const grupos = corpo.split(".")
    if (grupos.length === 2) {
      const [a, b] = grupos
      if (!/^[0-9]+$/.test(a) || !/^[0-9]+$/.test(b)) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      if (b.length <= 2) {
        // Decimal: "22.5" / "22.27" / "1.5".
        normalizado = a + "." + b
      } else if (b.length === 3) {
        // Ambíguo: pode ser milhar (1234) ou decimal extremo (1.234).
        return { value: null, erro: erroAmbiguo(raw) }
      } else {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
    } else {
      // Múltiplos pontos: só vale como milhar.
      const primeiroOk = /^[0-9]{1,3}$/.test(grupos[0])
      const demaisOk = grupos.slice(1).every((g) => /^[0-9]{3}$/.test(g))
      if (primeiroOk && demaisOk) {
        normalizado = grupos.join("")
      } else {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
    }
  } else {
    // Tem vírgula E ponto. O separador à direita é decimal; o à
    // esquerda é milhar (mas precisa ter exatamente 1 do tipo decimal).
    const idxV = corpo.lastIndexOf(",")
    const idxP = corpo.lastIndexOf(".")
    if (idxV > idxP) {
      // BR: pontos = milhar, vírgula = decimal.
      const semPontos = corpo.replace(/\./g, "")
      const partes = semPontos.split(",")
      if (partes.length !== 2) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      const [a, b] = partes
      if (!/^[0-9]+$/.test(a) || !/^[0-9]+$/.test(b)) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      normalizado = a + "." + b
    } else {
      // US: vírgulas = milhar, ponto = decimal.
      const semVirgulas = corpo.replace(/,/g, "")
      const partes = semVirgulas.split(".")
      if (partes.length !== 2) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      const [a, b] = partes
      if (!/^[0-9]+$/.test(a) || !/^[0-9]+$/.test(b)) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      normalizado = a + "." + b
    }
  }

  const n = Number(normalizado)
  if (!Number.isFinite(n)) {
    return { value: null, erro: `Número inválido: "${raw}".` }
  }
  return { value: sinal * n, erro: null }
}
