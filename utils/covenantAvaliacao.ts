/**
 * A conta de "folga" de um covenant, em TypeScript.
 *
 * Ela já existe em SQL, dentro de `fn_debt_covenant_evaluate`
 * (aplicar_20270915000008), e continua sendo a fonte para os covenants de
 * contrato — que leem EBITDA e dívida direto do razão.
 *
 * Esta cópia existe por um motivo específico, não por conveniência: o covenant
 * de uma OPERAÇÃO de crédito (R8 do PRD) não se apura no razão, e sim no
 * SNAPSHOT congelado — que é justamente o dado que o banco viu. Mandar o SQL
 * ler o snapshot significaria interpretar JSONB lá dentro e duplicar a regra do
 * fluxo elegível; trazer a fórmula para cá, testada, sai mais barato e mais
 * honesto.
 *
 * ⚠️ Se a regra mudar no SQL, muda aqui — e os testes desta função são o lugar
 * onde a divergência aparece antes de virar número errado na frente do banco.
 */

import { round2 } from './financialMath';

export type CovenantComparador = 'MAX' | 'MIN';
export type CovenantSituacaoCalc = 'REGULAR' | 'ATENCAO' | 'VIOLADO' | 'NAO_APURADO';

export interface AvaliacaoCovenant {
    /** O valor medido. `null` quando não há como apurar. */
    apurado: number | null;
    /** Quanto o apurado está DENTRO da meta, em %. Negativo = violado. */
    margemPct: number | null;
    situacao: CovenantSituacaoCalc;
}

/**
 * `comparador` MAX = teto (não pode passar): folga = (meta − apurado) / |meta|.
 * `comparador` MIN = piso (não pode ficar abaixo): folga = (apurado − meta) / |meta|.
 *
 * `margemDeAtencaoPct` é a faixa amarela ANTES da quebra — o §76 do PRD é
 * explícito em não alertar só depois de violar.
 */
export function avaliarCovenant(
    apurado: number | null | undefined,
    meta: number,
    comparador: CovenantComparador,
    margemDeAtencaoPct: number,
): AvaliacaoCovenant {
    if (apurado == null || Number.isNaN(apurado)) {
        return { apurado: null, margemPct: null, situacao: 'NAO_APURADO' };
    }
    // Meta zero não tem folga relativa — dividir por ela devolveria Infinity, e
    // a tela mostraria uma folga absurda em vez de admitir que não dá para medir.
    if (meta === 0) {
        return { apurado: round2(apurado), margemPct: null, situacao: 'NAO_APURADO' };
    }

    const margem = comparador === 'MAX'
        ? ((meta - apurado) / Math.abs(meta)) * 100
        : ((apurado - meta) / Math.abs(meta)) * 100;

    const margemPct = round2(margem);
    const situacao: CovenantSituacaoCalc =
        margemPct < 0 ? 'VIOLADO'
            : margemPct <= margemDeAtencaoPct ? 'ATENCAO'
                : 'REGULAR';

    return { apurado: round2(apurado), margemPct, situacao };
}
