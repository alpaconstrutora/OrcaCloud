import type { ContractInstallment } from '../types/contracts';
import { parcelaBaixada, type ParcelaExistente } from './contratoParcelaVariavel';

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Valor atual do contrato NÃO recorrente: original + aditivos aprovados + reajuste
 * acumulado. Fórmula única do "Salvar" do contrato e da aprovação de aditivo — até
 * 09/11/2026 as duas paravam nos aditivos e apagavam o reajuste.
 */
export function valorAtualDoContrato(original: number, aditivosAprovados: number, reajusteAcumulado: number | null | undefined): number {
    return centavos(Number(original || 0) + Number(aditivosAprovados || 0) + Number(reajusteAcumulado || 0));
}

/**
 * Reajuste de contrato PARCELADO: aplica o fator ao CRONOGRAMA, que é de onde
 * `syncParceladoScheduleToFinance` tira o valor de cada parcela. Até 09/11/2026
 * `applyReajuste` só mudava `current_value` e o sync seguinte regravava as parcelas
 * com os valores antigos — o reajuste nunca chegava a Contas a Receber.
 *
 * Sobe só o SALDO: parcela que vence a partir de `hoje`, não baixada e sem valor
 * alterado à mão. A linha `i` do cronograma é o título `<contrato>:p<i+1>`; com
 * vencimento alterado à mão, vale a data do título.
 *
 * `acrescimo` é o que o contrato passa a valer a mais — o chamador soma em
 * `current_value`, para a soma das parcelas continuar batendo com o valor atual.
 */
export function reajustarCronograma(
    cronograma: ContractInstallment[],
    parcelas: ParcelaExistente[],
    contractId: string,
    fator: number,
    hoje: string,
): { cronograma: ContractInstallment[]; acrescimo: number; reajustadas: number } {
    const porRef = new Map(parcelas.filter(p => p.reference_id).map(p => [p.reference_id as string, p]));
    let acrescimo = 0;
    let reajustadas = 0;

    const novo = cronograma.map((linha, i) => {
        const titulo = porRef.get(`${contractId}:p${i + 1}`);
        if (titulo && (parcelaBaixada(titulo) || titulo.valor_manual)) return { ...linha };
        const vencimento = (titulo?.vencimento_manual && titulo.due_date ? titulo.due_date : linha.date).slice(0, 10);
        if (vencimento < hoje) return { ...linha };
        const valor = centavos(linha.value * fator);
        acrescimo += valor - linha.value;
        reajustadas++;
        return { ...linha, value: valor };
    });

    return { cronograma: novo, acrescimo: centavos(acrescimo), reajustadas };
}
