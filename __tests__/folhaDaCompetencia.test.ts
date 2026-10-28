import { describe, it, expect } from 'vitest';
import { ehFolhaComCusto, folhasDaCompetencia } from '../utils/folhaDaCompetencia';

const folha = (o: Partial<{ id: string; org_id: string; start_date: string; status: string; type: string; created_at: string }>) => ({
    id: 'r', org_id: 'alpa', start_date: '2026-09-01', status: 'PROCESSANDO', type: 'mensal', created_at: '2026-10-01T00:00:00Z', ...o,
});

describe('ehFolhaComCusto', () => {
    it('mensal FECHADO ou PROCESSANDO conta', () => {
        expect(ehFolhaComCusto(folha({ status: 'FECHADO' }))).toBe(true);
        expect(ehFolhaComCusto(folha({ status: 'PROCESSANDO' }))).toBe(true);
    });

    it('adiantamento não conta: o custo dele está na mensal (somar duplicaria)', () => {
        expect(ehFolhaComCusto(folha({ type: 'adiantamento', status: 'FECHADO' }))).toBe(false);
    });

    it('status que não existe no banco (o antigo filtro pedia RASCUNHO) não conta', () => {
        expect(ehFolhaComCusto(folha({ status: 'RASCUNHO' }))).toBe(false);
    });
});

describe('folhasDaCompetencia', () => {
    it('pega a última competência até o mês de referência — a folha de outubro só existe em novembro', () => {
        const r = folhasDaCompetencia([
            folha({ id: 'ago', start_date: '2026-08-01' }),
            folha({ id: 'set', start_date: '2026-09-01' }),
        ], '2026-10-28');
        expect(r.competencia).toBe('2026-09');
        expect(r.folhas.map(f => f.id)).toEqual(['set']);
    });

    it('ignora folha de competência DEPOIS da referência', () => {
        const r = folhasDaCompetencia([
            folha({ id: 'set', start_date: '2026-09-01' }),
            folha({ id: 'nov', start_date: '2026-11-01' }),
        ], '2026-10-28');
        expect(r.competencia).toBe('2026-09');
    });

    it('"Todas": uma folha por organização na mesma competência', () => {
        const r = folhasDaCompetencia([
            folha({ id: 'alpa-set', org_id: 'alpa' }),
            folha({ id: 'spe-set', org_id: 'spe' }),
            folha({ id: 'alpa-ago', org_id: 'alpa', start_date: '2026-08-01' }),
        ], '2026-10-28');
        expect(r.folhas.map(f => f.id).sort()).toEqual(['alpa-set', 'spe-set']);
    });

    it('duas mensais da mesma org no mês: a FECHADA vence; entre iguais, a mais recente', () => {
        const r = folhasDaCompetencia([
            folha({ id: 'proc', status: 'PROCESSANDO', created_at: '2026-10-05T00:00:00Z' }),
            folha({ id: 'fech', status: 'FECHADO', created_at: '2026-10-01T00:00:00Z' }),
        ], '2026-10-28');
        expect(r.folhas.map(f => f.id)).toEqual(['fech']);

        const r2 = folhasDaCompetencia([
            folha({ id: 'velha', created_at: '2026-10-01T00:00:00Z' }),
            folha({ id: 'nova', created_at: '2026-10-05T00:00:00Z' }),
        ], '2026-10-28');
        expect(r2.folhas.map(f => f.id)).toEqual(['nova']);
    });

    it('sem folha com custo: competência nula (a tela diz "não medido", nunca R$ 0)', () => {
        const r = folhasDaCompetencia([folha({ type: 'adiantamento' })], '2026-10-28');
        expect(r).toEqual({ competencia: null, folhas: [] });
    });
});
