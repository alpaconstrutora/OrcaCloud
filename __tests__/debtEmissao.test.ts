/**
 * Emissão de títulos de dívida — o recorte de quais parcelas são alcançadas.
 *
 * Origem (2026-09-09): o contrato 5772 foi "emitido" e nada chegou ao Contas a
 * Pagar. As 44 parcelas venciam entre 2021 e 2025 e o corte padrão da emissão é
 * `hoje`, então o filtro devolvia lista vazia — e a tela reportava "0 título(s)"
 * no mesmo aviso verde do caminho de sucesso.
 *
 * O primeiro caso aqui é esse contrato: ele documenta que a lista vazia é o
 * comportamento correto do filtro, e que quem tem de reagir a ela é a tela.
 *
 * Plano: docs/planos/2026-09-09-divida-contrato-historico-emissao-zero.md
 */

import { describe, it, expect } from 'vitest';
import { parcelasEmitiveis, parcelasEmAberto } from '../services/debtFinanceService';
import type { DebtInstallment, DebtInstallmentStatus } from '../types/debt';

/** Parcela mínima — só os campos que os dois filtros olham. */
function parcela(
    seq: number,
    dueDate: string,
    status: DebtInstallmentStatus = 'PREVISTA',
): DebtInstallment {
    return {
        id: `i-${seq}`,
        organizationId: 'org-1',
        debtScheduleId: 'sch-1',
        seq,
        dueDate,
        competenciaDate: dueDate,
        openingBalance: 0,
        amortization: 1461.54,
        interest: 0,
        monetaryCorrection: 0,
        iof: 0,
        insurance: 0,
        fees: 0,
        lateFine: 0,
        lateInterest: 0,
        total: 1461.54,
        closingBalance: 0,
        status,
    } as DebtInstallment;
}

/** O 5772: 44 mensais de 2021-07-26 a 2025-02-26, todas anteriores a hoje. */
const CONTRATO_HISTORICO: DebtInstallment[] = Array.from({ length: 44 }, (_, i) => {
    const d = new Date(Date.UTC(2021, 6, 26));
    d.setUTCMonth(d.getUTCMonth() + i);
    return parcela(i + 1, d.toISOString().slice(0, 10));
});

const HOJE = '2026-09-09';

describe('parcelasEmitiveis — o corte que decide o que vai ao Contas a Pagar', () => {
    it('devolve vazio para contrato cujo cronograma inteiro já venceu (caso 5772)', () => {
        expect(parcelasEmitiveis(CONTRATO_HISTORICO, HOJE)).toHaveLength(0);
    });

    it('alcança as 44 quando o corte é a primeira parcela — a emissão retroativa', () => {
        expect(parcelasEmitiveis(CONTRATO_HISTORICO, '2021-07-26')).toHaveLength(44);
    });

    it('inclui a parcela que vence exatamente no corte (o filtro é >=, não >)', () => {
        const p = [parcela(1, '2026-09-08'), parcela(2, HOJE), parcela(3, '2026-09-10')];
        expect(parcelasEmitiveis(p, HOJE).map(x => x.seq)).toEqual([2, 3]);
    });

    it('nunca emite parcela cancelada, nem no futuro nem no retroativo', () => {
        const p = [
            parcela(1, '2026-10-01'),
            parcela(2, '2026-10-01', 'CANCELADA'),
            parcela(3, '2021-01-01', 'CANCELADA'),
        ];
        expect(parcelasEmitiveis(p, HOJE).map(x => x.seq)).toEqual([1]);
        expect(parcelasEmitiveis(p, '2020-01-01').map(x => x.seq)).toEqual([1]);
    });

    it('emite parcela já paga que ainda está no futuro — o filtro não olha pagamento', () => {
        // Quem exclui parcela paga é `parcelasEmAberto`; separar os dois filtros
        // é o que deixa a regeração reescrever o futuro sem apagar o passado.
        const p = [parcela(1, '2026-10-01', 'PAGA')];
        expect(parcelasEmitiveis(p, HOJE)).toHaveLength(1);
    });
});

describe('parcelasEmAberto — a base do saldo devedor e da quitação histórica', () => {
    it('conta as 44 do contrato histórico enquanto ninguém quitou', () => {
        expect(parcelasEmAberto(CONTRATO_HISTORICO)).toHaveLength(44);
    });

    it('descarta paga e cancelada, e só elas', () => {
        const p = [
            parcela(1, '2021-01-01', 'PAGA'),
            parcela(2, '2021-02-01', 'CANCELADA'),
            parcela(3, '2021-03-01', 'VENCIDA'),
            parcela(4, '2021-04-01', 'PREVISTA'),
            parcela(5, '2021-05-01', 'PARCIALMENTE_PAGA'),
        ];
        expect(parcelasEmAberto(p).map(x => x.seq)).toEqual([3, 4, 5]);
    });
});
