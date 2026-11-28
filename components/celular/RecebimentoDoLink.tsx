import React from 'react'
import RecebimentoFluxo from '../suprimentos/recebimento/RecebimentoFluxo'
import type { FonteRecebimento } from '../../services/recebimentoFonte'

/**
 * Aba "Receber" do link do celular (`/celular?token=`), ao lado de "Pedido": o mesmo
 * Recebimento do app logado (`RecebimentoFluxo`), lendo e gravando pela fonte do link —
 * RPCs `celular_recebimento_*` e a Edge `pedido-recebimento` com o token.
 * Plano: docs/planos/2026-11-27-recebimento-mobile.md (Fase 5).
 *
 * Escopo: todas as organizações de que o dono do link é membro e em que pode pedir
 * (regra do usuário de 27/11/2026) — o banco confere a cada chamada.
 *
 * A recusa do token (link revogado/vencido) não é tratada aqui: a fonte avisa o
 * `aoRecusar` do gate, que derruba a tela para "link inválido".
 *
 * ⚠️ `fonte` tem de ser estável (useMemo no gate): a lista a tem na dependência da carga.
 */
const RecebimentoDoLink: React.FC<{ fonte: FonteRecebimento }> = ({ fonte }) => (
  <div className="h-full overflow-y-auto -mx-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Receber</h1>
        <p className="text-sm text-slate-600 mt-0.5">Confira o que chegou na obra, registre a retirada e mande a nota.</p>
      </div>
      <RecebimentoFluxo fonte={fonte} />
    </div>
  </div>
)

export default RecebimentoDoLink
