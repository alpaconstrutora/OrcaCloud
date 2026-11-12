// utils/imovibAreaEquivalente.ts
//
// Área equivalente NBR 12721 no estudo de viabilidade (item 8.2 do plano
// docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). O estudo NÃO
// recalcula a norma: lê o Quadro I congelado numa versão publicada da Planta
// Inteligente do empreendimento, escolhida pela mesma regra do memorial de
// incorporação (`versaoDoMemorial`).

import { situacaoDasAprovacoes, versaoDoMemorial, type AprovacaoDoDocumento } from './nbr12721/documento';

export interface VersaoComQuadro {
    snapshotId: string;
    revisao: number;
    aprovacoes: Pick<AprovacaoDoDocumento, 'tipo'>[];
    /** 'failed' = o quadro tem pendência bloqueante. */
    status: 'success' | 'failed';
    quadroI: { qi_18_floor_equivalent_total_raw: number }[];
}

export interface AreaEquivalenteDaPlanta {
    snapshotId: string;
    revisao: number;
    /** Soma de qi_18_floor_equivalent_total_raw do Quadro I, em m². */
    total: number;
    situacao: string;
    status: 'success' | 'failed';
}

/** null = não medido (sem versão com quadro, ou quadro sem área) — a tela nunca mostra zero. */
export function areaEquivalenteDasVersoes(versoes: readonly VersaoComQuadro[]): AreaEquivalenteDaPlanta | null {
    const escolhida = versaoDoMemorial(versoes);
    if (!escolhida) return null;
    const v = versoes.find(x => x.snapshotId === escolhida.snapshotId)!;
    const total = v.quadroI.reduce((acc, l) => acc + (Number(l.qi_18_floor_equivalent_total_raw) || 0), 0);
    if (total <= 0) return null;
    return { snapshotId: v.snapshotId, revisao: v.revisao, total, situacao: situacaoDasAprovacoes(v.aprovacoes), status: v.status };
}
