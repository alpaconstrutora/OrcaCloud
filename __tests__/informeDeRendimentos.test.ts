/**
 * Informe de rendimentos por ano (Fase B5 do plano docs/planos/2026-11-21-portal-do-investidor-consolidacao.md):
 * antes a tela dizia "Ano-calendário 2025" e somava todas as movimentações de todos os anos.
 */
import { describe, expect, it } from 'vitest';
import { anosComMovimento, informeDoAno } from '../utils/informeDeRendimentos';

const l = (type: string, amount: number, paid_date: string | null, status = 'liquidado', project_id = 'o1') => ({ project_id, type, amount, status, paid_date });
const lancs = [
    l('aporte', 100_000, '2024-05-10'),
    l('aporte', 50_000, '2025-03-01'),
    l('retirada', 10_000, '2025-08-01'),
    l('aporte', 70_000, '2026-02-01'),
    l('dividendo', 3_000, '2024-12-20'),
    l('dividendo', 4_000, '2025-06-30'),
    l('distribuicao', 1_000, '2025-12-31'),
    l('dividendo', 9_000, '2026-01-05'),
    l('dividendo', 500, '2025-07-01', 'pendente'),
    l('aporte', 1, null),
];

describe('informeDoAno', () => {
    it('2025: rendimentos pagos em 2025; custo em 31/12/2024 e em 31/12/2025', () => {
        const r = informeDoAno(lancs, 2025, () => 'Garden');
        expect(r.rendimentos).toBe(5_000);
        expect(r.custoAnterior).toBe(100_000);
        expect(r.custoAtual).toBe(140_000);
        expect(r.semData).toBe(1);
        expect(r.linhas).toEqual([{ projectId: 'o1', nome: 'Garden', custoAnterior: 100_000, custoAtual: 140_000, rendimentos: 5_000 }]);
    });
    it('anos do seletor: só com movimento liquidado, do mais recente', () => {
        expect(anosComMovimento(lancs)).toEqual([2026, 2025, 2024]);
    });
});
