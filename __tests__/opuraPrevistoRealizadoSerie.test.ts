import { describe, it, expect } from 'vitest';
import { montarSeriePrevistoRealizado } from '../lib/opuraPrevistoRealizadoSerie';

/**
 * O que estes testes protegem: a série do gráfico "Previsto × Realizado" da
 * Central de Clientes é a MESMA base dos KPIs Recebido / Saldo devedor, e o
 * eixo do tempo nunca pula período — mês sem lançamento aparece como zero.
 */

const rows = [
    { dimension_key: '2026-01', credit_previsto: 100, credit_realizado: 50 },
    { dimension_key: '2026-03', credit_previsto: 0,   credit_realizado: 300 },
    { dimension_key: '2027-01', credit_previsto: 700, credit_realizado: 0 },
    { dimension_key: null,      credit_previsto: 999, credit_realizado: 999 }, // sem data: fora
];

describe('montarSeriePrevistoRealizado — mensal', () => {
    it('todos os meses do intervalo presentes, mês vazio = 0, soma fecha com o insumo', () => {
        const s = montarSeriePrevistoRealizado(rows, '2026-01-01', '2026-04-30', 'mensal');
        expect(s.map(p => p.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
        expect(s[1]).toMatchObject({ previsto: 0, realizado: 0 });
        expect(s.reduce((a, p) => a + p.previsto, 0)).toBe(100);
        expect(s.reduce((a, p) => a + p.realizado, 0)).toBe(350);
    });

    it('ano só no primeiro rótulo e em janeiro', () => {
        const s = montarSeriePrevistoRealizado([], '2026-11-15', '2027-02-01', 'mensal');
        expect(s.map(p => p.label)).toEqual(['nov/26', 'dez', 'jan/27', 'fev']);
    });

    it('intervalo invertido ou inválido devolve vazio (não um gráfico zerado)', () => {
        expect(montarSeriePrevistoRealizado(rows, '2026-05-01', '2026-01-01', 'mensal')).toEqual([]);
        expect(montarSeriePrevistoRealizado(rows, '', '2026-01-01', 'mensal')).toEqual([]);
    });

    it('valor numérico vindo como string (NUMERIC do Postgres) é somado, não concatenado', () => {
        const s = montarSeriePrevistoRealizado(
            [{ dimension_key: '2026-01', credit_previsto: '10' as unknown as number, credit_realizado: '5' as unknown as number },
             { dimension_key: '2026-01', credit_previsto: 10, credit_realizado: 5 }],
            '2026-01-01', '2026-01-31', 'mensal',
        );
        expect(s[0]).toMatchObject({ previsto: 20, realizado: 10 });
    });
});

describe('montarSeriePrevistoRealizado — anual', () => {
    it('um ponto por ano do intervalo, somando os meses de cada ano', () => {
        const s = montarSeriePrevistoRealizado(rows, '2026-01-01', '2027-12-31', 'anual');
        expect(s).toEqual([
            { key: '2026', label: '2026', previsto: 100, realizado: 350 },
            { key: '2027', label: '2027', previsto: 700, realizado: 0 },
        ]);
    });

    it('mês fora do intervalo não entra no ano, mesmo que a linha venha', () => {
        const s = montarSeriePrevistoRealizado(rows, '2026-02-01', '2026-12-31', 'anual');
        expect(s).toEqual([{ key: '2026', label: '2026', previsto: 0, realizado: 300 }]);
    });
});
