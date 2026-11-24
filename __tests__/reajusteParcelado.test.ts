/**
 * Reajuste de contrato PARCELADO (não recorrente).
 *
 * Até 09/11/2026 `applyReajuste` só multiplicava `current_value` e chamava
 * `syncParceladoScheduleToFinance`, que regrava as parcelas a partir de
 * `payment_schedule` — intocado. O reajuste nunca chegava a Contas a Receber.
 * E o fator incidia sobre o contrato inteiro, inclusive o que já tinha sido pago.
 */
import { describe, it, expect } from 'vitest';
import { reajustarCronograma, aniversarioAposRenovacao } from '../utils/reajusteParcelado';
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

    // Venda com juros (Price/SAC): a parcela carrega a parte de juros e a de
    // principal. Se só `value` subisse, o título ficaria com juros + principal ≠ valor.
    it('reajustarCronograma escala juros e principal', () => {
        const r = reajustarCronograma(
            [{ date: '2027-01-10', value: 1000, interest: 200, principal: 800 }], [], C, 1.1, '2026-11-09');
        expect(r.cronograma[0]).toEqual({ date: '2027-01-10', value: 1100, interest: 220, principal: 880 });
    });

    it('juros e principal continuam fechando o valor depois do arredondamento', () => {
        const r = reajustarCronograma(
            [{ date: '2027-01-10', value: 333.33, interest: 111.11, principal: 222.22 }], [], C, 1.0371, '2026-11-09');
        const l = r.cronograma[0];
        expect(l.value).toBe(345.7);
        expect(l.interest).toBe(115.23);
        expect(Math.round(((l.interest ?? 0) + (l.principal ?? 0)) * 100) / 100).toBe(l.value);
    });

    it('parcela sem juros continua sem as chaves de juros', () => {
        const r = reajustarCronograma([{ date: '2027-01-10', value: 1000 }], [], C, 1.1, '2026-11-09');
        expect(r.cronograma[0]).toEqual({ date: '2027-01-10', value: 1100 });
    });

    it('não altera o cronograma recebido', () => {
        const copia = structuredClone(cronograma);
        reajustarCronograma(cronograma, [], C, 1.05, '2026-11-09');
        expect(cronograma).toEqual(copia);
    });
});

/**
 * Renovar ≠ reajustar (pedido 24/11/2026, plano
 * 2026-11-24-locacoes-reajustes-separados-das-renovacoes). A renovação que mantém
 * o aluguel não pode empurrar o aniversário do reajuste para o início do período
 * novo + 12 meses — o reajuste anual seria pulado.
 */
describe('aniversarioAposRenovacao', () => {
    const contrato = { start_date: '2016-09-23', reajuste_data_base: '2024-09-23', reajuste_proximo: '2025-09-23' };

    it('mesmo valor → aniversário continua o do contrato', () => {
        expect(aniversarioAposRenovacao(contrato, '2026-03-23', 4556, 4556))
            .toEqual({ reajuste_data_base: '2024-09-23', reajuste_proximo: '2025-09-23' });
    });
    it('valor diferente = reajuste na renovação → aniversário reinicia no período novo', () => {
        expect(aniversarioAposRenovacao(contrato, '2026-03-23', 4556, 4800))
            .toEqual({ reajuste_data_base: '2026-03-23', reajuste_proximo: '2027-03-23' });
    });
    it('contrato sem aniversário gravado: base = início do contrato, próximo = base + 12 meses', () => {
        expect(aniversarioAposRenovacao({ start_date: '2016-09-23' }, '2019-03-23', 1000, 1000))
            .toEqual({ reajuste_data_base: '2016-09-23', reajuste_proximo: '2017-09-23' });
    });
    it('diferença de arredondamento (< 1 centavo) não conta como reajuste', () => {
        expect(aniversarioAposRenovacao(contrato, '2026-03-23', 4556, 4556.004).reajuste_proximo).toBe('2025-09-23');
    });
});
