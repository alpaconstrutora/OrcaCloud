// utils/imovibAreaEquivalente.ts
//
// Área equivalente NBR 12721 no estudo de viabilidade (item 8.2 do plano
// docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). O estudo NÃO
// recalcula a norma: lê o Quadro I congelado numa versão publicada da Planta
// Inteligente do empreendimento, escolhida pela mesma regra do memorial de
// incorporação (`versaoDoMemorial`, em imovibService.areaEquivalenteDaPlanta).

import { situacaoDasAprovacoes, type AprovacaoDoDocumento } from './nbr12721/documento';

export interface VersaoDoQuadro {
    snapshotId: string;
    revisao: number;
    aprovacoes: Pick<AprovacaoDoDocumento, 'tipo'>[];
    /** 'failed' = o quadro tem pendência bloqueante. */
    status: 'success' | 'failed';
}

export type LinhaDoQuadroI = { qi_18_floor_equivalent_total_raw: number };

export interface AreaEquivalenteDaPlanta {
    snapshotId: string;
    revisao: number;
    /** Soma de qi_18_floor_equivalent_total_raw do Quadro I, em m². */
    total: number;
    situacao: string;
    status: 'success' | 'failed';
}

/** null = não medido (Quadro I vazio ou sem área) — a tela nunca mostra zero. */
export function areaEquivalenteDaVersao(v: VersaoDoQuadro, quadroI: readonly LinhaDoQuadroI[] | null): AreaEquivalenteDaPlanta | null {
    const total = (quadroI ?? []).reduce((acc, l) => acc + (Number(l.qi_18_floor_equivalent_total_raw) || 0), 0);
    if (total <= 0) return null;
    return { snapshotId: v.snapshotId, revisao: v.revisao, total, situacao: situacaoDasAprovacoes(v.aprovacoes), status: v.status };
}
