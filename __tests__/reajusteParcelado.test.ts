/**
 * Reajuste de contrato PARCELADO (não recorrente).
 *
 * Até 09/11/2026 `applyReajuste` só multiplicava `current_value` e chamava
 * `syncParceladoScheduleToFinance`, que regrava as parcelas a partir de
 * `payment_schedule` — intocado. O reajuste nunca chegava a Contas a Receber.
 * E o fator incidia sobre o contrato inteiro, inclusive o que já tinha sido pago.
 */
import { describe, it, expect } from 'vitest';
import { reajustarCronograma } from '../utils/reajusteParcelado';
import type { ParcelaExistente } from '../utils/contratoParcelaVariavel';

const C = 'ctr-1';
const cronograma = [
    { date: '2026-09-10', value: 1000, installment_type: 'MENSAL' },
    { date: '2026-10-10', value: 1000, installment_type: 'MENSAL' },
    { date: '2026-11-10', value: 1000, installment_type: 'MENSAL' },
    { date: '2026-12-10', value: 1000, installment_type: 'MENSAL' },
];
const aberta = (n: number, due: string): ParcelaExistente => ({
    reference_id: `${C}:p${n}`, status: 'PENDING', business_status: 'PREVISTO', due_date: due, amount: 1000,
});

describe('reajustarCronograma', () => {
    it('só as parcelas a vencer em aberto sobem pelo fator; o acréscimo é a soma das diferenças', () => {
        const r = reajustarCronograma(cronograma, [
            { ...aberta(1, '2026-09-10'), status: 'CONCILIATED', business_status: 'RECEBIDO' },
            aberta(2, '2026-10-10'),
            aberta(3, '2026-11-10'),
            aberta(4, '2026-12-10'),
        ], C, 1.05, '2026-11-09');
        expect(r.cronograma.map(l => l.value)).toEqual([1000, 1000, 1050, 1050]);
        expect(r.acrescimo).toBe(100);
        expect(r.reajustadas).toBe(2);
    });

    it('parcela paga com vencimento futuro não muda', () => {
        const r = reajustarCronograma(cronograma, [
            { ...aberta(4, '2026-12-10'), business_status: 'PAGO' },
        ], C, 1.05, '2026-11-09');
        expect(r.cronograma[3].value).toBe(1000);
        expect(r.cronograma[2].value).toBe(1050); // p3 ainda não lançada: segue o contrato
    });

    it('parcela com valor alterado à mão não muda', () => {
        const r = reajustarCronograma(cronograma, [
            { ...aberta(3, '2026-11-10'), valor_manual: true, amount: 900 },
        ], C, 1.05, '2026-11-09');
        expect(r.cronograma[2].value).toBe(1000);
        expect(r.reajustadas).toBe(1);
    });

    it('vencimento alterado à mão: vale a data da linha, não a do cronograma', () => {
        const r = reajustarCronograma(cronograma, [
            { ...aberta(2, '2026-11-20'), vencimento_manual: true },
            { ...aberta(4, '2026-11-01'), vencimento_manual: true },
        ], C, 1.05, '2026-11-09');
        expect(r.cronograma[1].value).toBe(1050); // cronograma diz out/26, linha diz 20/11
        expect(r.cronograma[3].value).toBe(1000); // cronograma diz dez/26, linha diz 01/11
    });

    it('arredonda em centavos e preserva os demais campos da linha', () => {
        const r = reajustarCronograma([{ date: '2027-01-10', value: 333.33, installment_type: 'CHAVES' }], [], C, 1.0371, '2026-11-09');
        expect(r.cronograma[0]).toEqual({ date: '2027-01-10', value: 345.7, installment_type: 'CHAVES' });
        expect(r.acrescimo).toBe(12.37);
    });

    it('não altera o cronograma recebido', () => {
        const copia = structuredClone(cronograma);
        reajustarCronograma(cronograma, [], C, 1.05, '2026-11-09');
        expect(cronograma).toEqual(copia);
    });
});
