"use client"

import { useEffect } from "react"
import { useSentinelaRefresh } from "@/components/SentinelaRefreshProvider"

/**
 * Dispara a coleta da Sentinela AO ABRIR a aba de Tráfego pago.
 *
 * Substitui o cron das 09:00 (removido em 20260725_workspace_fase3.sql): o
 * time entra no painel todo dia, então a atualização acontece exatamente
 * quando alguém vai olhar — e não de madrugada, sem ninguém ver.
 *
 * O trabalho vive no SentinelaRefreshProvider (layout do dashboard, que não
 * desmonta ao trocar de aba): a coleta segue rodando em segundo plano com o
 * indicador flutuante, e o usuário navega pelo painel enquanto isso.
 *
 * A janela de silêncio de 15 min é do provider — entrar e sair da aba não
 * redispara. Este componente não renderiza nada.
 */
export default function SentinelaAutoRefresh() {
  const { iniciarAuto } = useSentinelaRefresh()

  useEffect(() => {
    iniciarAuto()
  }, [iniciarAuto])

  return null
}
