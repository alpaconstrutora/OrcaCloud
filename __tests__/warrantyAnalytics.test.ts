import { describe, expect, it } from 'vitest';
import {
    breakdownPor,
    computeWarrantyKPIs,
    fluxoMensal,
    slaVencido,
    SEM_CLASSIFICACAO,
    type WarrantyKPIRow,
} from '../utils/warrantyAnalytics';
import type { ClaimState, WarrantyClaim } from '../types/warranty';

/** 15/08/2026 12:00 no fuso local — longe da meia-noite, para o teste não depender do fuso. */
const AGORA = new Date(2026, 7, 15, 12, 0, 0);

function kpiRow(over: Partial<WarrantyKPIRow> = {}): WarrantyKPIRow {
    return {
        state: 'ABERTO',
        in_warranty: undefined,
        nps_nota: undefined,
        custo_real: undefined,
        sla_deadline: undefined,
        created_at: '2026-08-10T09:00:00Z',
        ...over,
    };
}

describe('computeWarrantyKPIs', () => {
    it('conta em aberto ignorando os dois estados terminais', () => {
        const rows = [
            kpiRow({ state: 'ABERTO' }),
            kpiRow({ state: 'EM_REPARO' }),
            kpiRow({ state: 'ENCERRADO' }),
            kpiRow({ state: 'FORA_GARANTIA' }),
        ];
        expect(computeWarrantyKPIs(rows, AGORA).total_abertos).toBe(2);
    });

    it('em garantia exclui encerrados; fora de garantia conta pelo booleano', () => {
        const rows = [
            kpiRow({ in_warranty: true,  state: 'EM_GARANTIA' }),
            kpiRow({ in_warranty: true,  state: 'ENCERRADO' }),
            kpiRow({ in_warranty: false, state: 'FORA_GARANTIA' }),
            kpiRow({ in_warranty: undefined }),
        ];
        const kpis = computeWarrantyKPIs(rows, AGORA);
        expect(kpis.em_garantia).toBe(1);
        expect(kpis.fora_garantia).toBe(1);
    });

    it('encerrados e custo do mês olham created_at, não a data de encerramento', () => {
        // Comportamento herdado de warrantyService.getKPIs e preservado de
        // propósito na extração — a tabela não tem closed_at.
        const rows = [
            kpiRow({ state: 'ENCERRADO', created_at: '2026-08-02T10:00:00Z', custo_real: 1500 }),
            kpiRow({ state: 'ENCERRADO', created_at: '2026-07-28T10:00:00Z', custo_real: 900 }),
            kpiRow({ state: 'ABERTO',    created_at: '2026-08-05T10:00:00Z', custo_real: 400 }),
        ];
        const kpis = computeWarrantyKPIs(rows, AGORA);
        expect(kpis.encerrados_mes).toBe(1);
        expect(kpis.custo_total_mes).toBe(1500);
    });

    it('NPS é a média das notas presentes, e null quando não há nenhuma', () => {
        expect(computeWarrantyKPIs([kpiRow({ nps_nota: 8 }), kpiRow({ nps_nota: 10 })], AGORA).nps_medio).toBe(9);
        expect(computeWarrantyKPIs([kpiRow()], AGORA).nps_medio).toBeNull();
    });

    it('conta SLA vencido só de chamado ainda na fila', () => {
        const rows = [
            kpiRow({ sla_deadline: '2026-08-01', state: 'EM_REPARO' }),   // vencido
            kpiRow({ sla_deadline: '2026-08-01', state: 'ENCERRADO' }),   // terminal
            kpiRow({ sla_deadline: '2026-08-20', state: 'ABERTO' }),      // no prazo
            kpiRow({ sla_deadline: undefined,    state: 'ABERTO' }),      // sem prazo
        ];
        expect(computeWarrantyKPIs(rows, AGORA).sla_vencidos).toBe(1);
    });

    it('o prazo de hoje ainda não está vencido', () => {
        const rows = [kpiRow({ sla_deadline: '2026-08-15', state: 'ABERTO' })];
        expect(computeWarrantyKPIs(rows, AGORA).sla_vencidos).toBe(0);
    });

    it('lista vazia devolve zeros, não NaN', () => {
        const kpis = computeWarrantyKPIs([], AGORA);
        expect(kpis).toEqual({
            total_abertos: 0, em_garantia: 0, fora_garantia: 0, encerrados_mes: 0,
            nps_medio: null, custo_total_mes: 0, sla_vencidos: 0,
        });
    });
});

describe('slaVencido', () => {
    it('compara como string, sem passar por new Date (que voltaria um dia em UTC-3)', () => {
        expect(slaVencido({ sla_deadline: '2026-08-14', state: 'ABERTO' }, '2026-08-15')).toBe(true);
        expect(slaVencido({ sla_deadline: '2026-08-15', state: 'ABERTO' }, '2026-08-15')).toBe(false);
        expect(slaVencido({ sla_deadline: undefined,    state: 'ABERTO' }, '2026-08-15')).toBe(false);
    });
});

describe('breakdownPor', () => {
    const rows = [
        { sistema: 'HID' }, { sistema: 'HID' }, { sistema: 'HID' },
        { sistema: 'EST' }, { sistema: 'EST' },
        { sistema: 'VED' },
        { sistema: undefined },
    ];
    const rotulo = (c: string) => ({ HID: 'Hidráulica', EST: 'Estrutura', VED: 'Vedação' }[c] ?? c);

    it('ordena do maior para o menor', () => {
        const out = breakdownPor(rows, r => r.sistema, rotulo);
        expect(out.map(i => [i.label, i.total])).toEqual([
            ['Hidráulica', 3], ['Estrutura', 2], [SEM_CLASSIFICACAO, 1], ['Vedação', 1],
        ]);
    });

    it('agrupa o que não tem valor numa fatia visível, em vez de descartar', () => {
        const out = breakdownPor(rows, r => r.sistema, rotulo);
        expect(out.find(i => i.label === SEM_CLASSIFICACAO)?.total).toBe(1);
    });

    it('respeita o limite de fatias', () => {
        expect(breakdownPor(rows, r => r.sistema, rotulo, 2)).toHaveLength(2);
    });

    it('empate desempata pelo rótulo, para a ordem não variar entre renders', () => {
        const out = breakdownPor(
            [{ k: 'b' }, { k: 'a' }],
            r => r.k,
            c => c.toUpperCase(),
        );
        expect(out.map(i => i.label)).toEqual(['A', 'B']);
    });
});

describe('fluxoMensal', () => {
    type Row = Pick<WarrantyClaim, 'state' | 'created_at' | 'updated_at'>;
    const row = (state: ClaimState, created: string, updated: string): Row =>
        ({ state, created_at: created, updated_at: updated });

    it('devolve exatamente a janela pedida, terminando no mês corrente', () => {
        const serie = fluxoMensal([], 3, AGORA);
        expect(serie.map(m => m.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    });

    it('conta abertura pelo created_at e encerramento pelo updated_at', () => {
        const serie = fluxoMensal([
            row('ENCERRADO', '2026-06-10T10:00:00Z', '2026-08-02T10:00:00Z'),
            row('ABERTO',    '2026-08-03T10:00:00Z', '2026-08-03T10:00:00Z'),
        ], 3, AGORA);
        const junho  = serie.find(m => m.month === '2026-06')!;
        const agosto = serie.find(m => m.month === '2026-08')!;
        expect([junho.abertos, junho.encerrados]).toEqual([1, 0]);
        expect([agosto.abertos, agosto.encerrados]).toEqual([1, 1]);
    });

    it('ignora chamado fora da janela em vez de somar no primeiro mês', () => {
        const serie = fluxoMensal([row('ABERTO', '2025-01-05T10:00:00Z', '2025-01-05T10:00:00Z')], 3, AGORA);
        expect(serie.reduce((s, m) => s + m.abertos, 0)).toBe(0);
    });

    it('mês vem do prefixo da string ISO — 1º de setembro não cai em agosto', () => {
        // new Date('2026-09-01T00:30:00Z') é 31/08 21:30 em UTC-3; getMonth()
        // devolveria agosto. O slice(0,7) não tem esse problema.
        const serie = fluxoMensal([row('ABERTO', '2026-09-01T00:30:00Z', '2026-09-01T00:30:00Z')], 2,
            new Date(2026, 8, 15, 12, 0, 0));
        expect(serie.find(m => m.month === '2026-09')?.abertos).toBe(1);
        expect(serie.find(m => m.month === '2026-08')?.abertos).toBe(0);
    });
});
