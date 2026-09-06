/**
 * Títulos duplicados por sincronização — plano
 * docs/planos/2026-09-05-titulos-duplicados-por-sincronizacao.md.
 *
 * O defeito: `addTransactionBatch` concatenava a série nova na lista existente sem
 * conferir nada, e a série é regerada com `crypto.randomUUID()` novo a cada
 * sincronização do contrato. Rodar o sync três vezes deixava três cópias de cada
 * parcela no JSON do cofre "Gestão Comercial", que o espelho manda para
 * `internal_transactions` como COMMERCIAL.
 *
 * Medido em produção em 05/09/2026: 49 grupos, 61 linhas excedentes, R$ 36.600.
 * Exemplo real: "Fatura Contrato 005 (1) - junho de 2026" existindo cinco vezes.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { chaveNaturalDaTransacao, transacoesAindaNaoGravadas } from '../services/financialService';

const parcela = (dia: string, descricao: string, valor: number, tipo = 'EXPENSE') => ({
    date: `${dia}T12:00:00.000Z`,
    description: descricao,
    value: valor,
    type: tipo,
});

describe('chaveNaturalDaTransacao', () => {
    it('ignora a hora: o gerador grava T12:00 e o legado grava só o dia', () => {
        expect(chaveNaturalDaTransacao({ date: '2026-06-10T12:00:00.000Z', description: 'X', value: 600, type: 'EXPENSE' }))
            .toBe(chaveNaturalDaTransacao({ date: '2026-06-10', description: 'X', value: 600, type: 'EXPENSE' }));
    });

    it('ignora caixa e espaço nas pontas da descrição', () => {
        expect(chaveNaturalDaTransacao({ date: '2026-06-10', description: '  Fatura Contrato 005 (1)  ', value: 600 }))
            .toBe(chaveNaturalDaTransacao({ date: '2026-06-10', description: 'fatura contrato 005 (1)', value: 600 }));
    });

    it('trata o valor com 2 casas: 600 e 600.00 são a mesma parcela', () => {
        expect(chaveNaturalDaTransacao({ date: '2026-06-10', description: 'X', value: 600 }))
            .toBe(chaveNaturalDaTransacao({ date: '2026-06-10', description: 'X', value: 600.0 }));
    });

    it('distingue o que é realmente diferente', () => {
        const base = { date: '2026-06-10', description: 'Fatura', value: 600, type: 'EXPENSE' };
        const k = chaveNaturalDaTransacao(base);
        expect(chaveNaturalDaTransacao({ ...base, date: '2026-06-20' })).not.toBe(k); // outro vencimento
        expect(chaveNaturalDaTransacao({ ...base, value: 600.01 })).not.toBe(k);      // outro valor
        expect(chaveNaturalDaTransacao({ ...base, description: 'Fatura 2' })).not.toBe(k);
        expect(chaveNaturalDaTransacao({ ...base, type: 'INCOME' })).not.toBe(k);     // entrada, não saída
    });
});

describe('transacoesAindaNaoGravadas', () => {
    it('cofre vazio recebe a série inteira', () => {
        const serie = [parcela('2026-06-10', 'Fatura Contrato 005 (1) - junho de 2026', 600)];
        expect(transacoesAindaNaoGravadas([], serie)).toHaveLength(1);
    });

    it('CASO REAL: sincronizar o mesmo contrato de novo não grava nada', () => {
        const serie = [
            parcela('2026-06-10', 'Fatura Contrato 005 (1) - junho de 2026', 600),
            parcela('2026-07-10', 'Fatura Contrato 005 (2) - julho de 2026', 600),
            parcela('2026-08-10', 'Fatura Contrato 005 (3) - agosto de 2026', 600),
        ];
        const jaNoCofre = serie.map(t => ({ ...t, id: 'uuid-antigo' }));
        expect(transacoesAindaNaoGravadas(jaNoCofre, serie)).toEqual([]);
    });

    it('sincronizar três vezes seguidas para de crescer depois da primeira', () => {
        const serie = [
            parcela('2026-06-10', 'Fatura Contrato 005 (1) - junho de 2026', 600),
            parcela('2026-07-10', 'Fatura Contrato 005 (2) - julho de 2026', 600),
        ];
        let cofre: ReturnType<typeof parcela>[] = [];
        for (let i = 0; i < 3; i++) {
            cofre = [...transacoesAindaNaoGravadas(cofre, serie), ...cofre];
        }
        expect(cofre).toHaveLength(2);
    });

    it('contrato prorrogado: só as parcelas novas entram', () => {
        const cofre = [
            parcela('2026-06-10', 'Fatura Contrato 005 (1) - junho de 2026', 600),
            parcela('2026-07-10', 'Fatura Contrato 005 (2) - julho de 2026', 600),
        ];
        const serieMaior = [
            ...cofre,
            parcela('2026-08-10', 'Fatura Contrato 005 (3) - agosto de 2026', 600),
        ];
        const novas = transacoesAindaNaoGravadas(cofre, serieMaior);
        expect(novas).toHaveLength(1);
        expect(novas[0].description).toContain('(3)');
    });

    it('mudar o dia de vencimento gera parcela nova, não sobrescreve a antiga', () => {
        // Foi o que produziu as linhas com 10 e 20 no mesmo mês em produção.
        const cofre = [parcela('2026-06-10', 'Fatura Contrato 005 (1) - junho de 2026', 600)];
        const serie = [parcela('2026-06-20', 'Fatura Contrato 005 (1) - junho de 2026', 600)];
        expect(transacoesAindaNaoGravadas(cofre, serie)).toHaveLength(1);
    });

    it('o próprio lote não pode trazer a mesma parcela duas vezes', () => {
        const p = parcela('2026-06-10', 'Fatura Contrato 005 (1) - junho de 2026', 600);
        expect(transacoesAindaNaoGravadas([], [p, { ...p }])).toHaveLength(1);
    });

    it('parcelas legitimamente iguais em meses diferentes convivem', () => {
        const serie = [
            parcela('2026-06-10', 'Fatura Contrato 005 - mensal', 600),
            parcela('2026-07-10', 'Fatura Contrato 005 - mensal', 600),
            parcela('2026-08-10', 'Fatura Contrato 005 - mensal', 600),
        ];
        expect(transacoesAindaNaoGravadas([], serie)).toHaveLength(3);
    });

    it('lista de existentes indefinida não quebra', () => {
        const serie = [parcela('2026-06-10', 'X', 10)];
        expect(transacoesAindaNaoGravadas(undefined as never, serie)).toHaveLength(1);
    });
});
