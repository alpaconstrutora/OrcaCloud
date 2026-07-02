/**
 * Testes de utils/recurrence.ts — expansão de datas de tarefas recorrentes
 * (PLANO_MODULO_PLANEJAMENTO_GAPS.md #5a).
 */
import { describe, it, expect } from 'vitest';
import { expandRecurrenceDates } from '../utils/recurrence';

describe('expandRecurrenceDates', () => {
    it('gera N datas semanais a partir da data inicial', () => {
        // 2025-01-06 é segunda-feira (dia útil)
        const dates = expandRecurrenceDates('2025-01-06', { frequency: 'WEEKLY', interval: 1, count: 3 }, [1, 2, 3, 4, 5], []);
        expect(dates).toEqual(['2025-01-06', '2025-01-13', '2025-01-20']);
    });

    it('gera N datas diárias respeitando o intervalo', () => {
        const dates = expandRecurrenceDates('2025-01-06', { frequency: 'DAILY', interval: 2, count: 3 }, [1, 2, 3, 4, 5], []);
        // 06/01 (seg) -> +2 dias corridos = 08/01 (qua) -> +2 = 10/01 (sex)
        expect(dates).toEqual(['2025-01-06', '2025-01-08', '2025-01-10']);
    });

    it('empurra a data inicial para o próximo dia útil se cair em fim de semana', () => {
        // 2025-01-04 é sábado
        const dates = expandRecurrenceDates('2025-01-04', { frequency: 'WEEKLY', interval: 1, count: 1 }, [1, 2, 3, 4, 5], []);
        expect(dates).toEqual(['2025-01-06']); // segunda seguinte
    });

    it('pula feriado configurado', () => {
        // Ocorrência semanal cairia em 2025-01-13 (feriado) — deve avançar para 14/01
        const dates = expandRecurrenceDates('2025-01-06', { frequency: 'WEEKLY', interval: 1, count: 2 }, [1, 2, 3, 4, 5], ['2025-01-13']);
        expect(dates).toEqual(['2025-01-06', '2025-01-14']);
    });

    it('gera datas mensais', () => {
        const dates = expandRecurrenceDates('2025-01-06', { frequency: 'MONTHLY', interval: 1, count: 3 }, [1, 2, 3, 4, 5], []);
        expect(dates).toEqual(['2025-01-06', '2025-02-06', '2025-03-06']);
    });

    it('limita count a no mínimo 1', () => {
        const dates = expandRecurrenceDates('2025-01-06', { frequency: 'DAILY', interval: 1, count: 0 }, [1, 2, 3, 4, 5], []);
        expect(dates).toHaveLength(1);
    });
});
