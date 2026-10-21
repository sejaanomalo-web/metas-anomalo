/**
 * Quem administra a aba Reuniões. Rodar: `npm run test`.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import { acessoReunioes } from "./reunioes-tipos"

test("admin com acesso completo administra", () => {
  assert.deepEqual(acessoReunioes({ papel: "admin", papelReal: "admin", visao: null }), {
    podeAdministrar: true,
    motivo: "admin",
  })
})

test("admin em visão simplificada NÃO administra, mas o motivo diz isso", () => {
  for (const visao of ["gestor_trafego", "comercial", "custom"]) {
    assert.deepEqual(acessoReunioes({ papel: visao, papelReal: "admin", visao }), {
      podeAdministrar: false,
      motivo: "visao_simplificada",
    })
  }
})

test("quem não é admin no banco não administra (nem com Workspace ligado)", () => {
  for (const papel of ["gestor_trafego", "comercial", "custom"]) {
    assert.deepEqual(acessoReunioes({ papel, papelReal: papel, visao: null }), {
      podeAdministrar: false,
      motivo: "sem_papel_admin",
    })
  }
})

test("visão gravada em quem não é admin real não vira admin", () => {
  assert.equal(acessoReunioes({ papel: "custom", papelReal: "custom", visao: "custom" }).podeAdministrar, false)
})
