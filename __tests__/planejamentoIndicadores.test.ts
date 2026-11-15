import { describe, expect, it } from 'vitest';
import { indicadoresDePrazo, folhasDoOrcamento, hojeLocalISO, diasEntre, ultimoDiaTrabalhado } from '../utils/planejamentoIndicadores';

// Conta de prazo única da Central de Comando e da lista Engenharia › Planejamento
// (crítica 2026-11-14). Hoje fixo para os testes não dependerem do relógio.
const HOJE = '2026-11-14';

describe('indicadoresDePrazo', () => {
    it('avanço físico pondera pelo valor orçado e ignora itens órfãos do cronograma', () => {
        const folhas = [{ id: 'a', orcado: 900 }, { id: 'b', orcado: 100 }];
        const r = indicadoresDePrazo(folhas, {
            itemSchedules: [
                { id: 'a', manualRealPct: 10, startDate: '2026-11-01', endDate: '2026-12-01' },
                { id: 'b', manualRealPct: 100, startDate: '2026-11-01', endDate: '2026-11-10' },
                // órfão: item que já saiu do orçamento — não conta como crítica nem atrasada
                { id: 'velho', manualRealPct: 0, startDate: '2026-01-01', endDate: '2026-02-01', isCritical: true },
            ],
        } as never, HOJE);
        expect(r.avancoFisicoPct).toBeCloseTo(19, 5); // (0,1·900 + 1·100) / 1000
        expect(r.atrasadas).toBe(0);
        expect(r.criticas).toBe(0);
        expect(r.temDatas).toBe(true);
    });

    it('atrasada = último dia trabalhado antes de hoje e avanço abaixo de 100%; crítica aberta = crítica não concluída', () => {
        const r = indicadoresDePrazo([{ id: 'a', orcado: 1 }, { id: 'b', orcado: 1 }, { id: 'c', orcado: 1 }], {
            itemSchedules: [
                { id: 'a', manualRealPct: 50, startDate: '2026-10-01', endDate: '2026-11-13', isCritical: true },
                { id: 'b', manualRealPct: 100, startDate: '2026-10-01', endDate: '2026-11-13', isCritical: true },
                { id: 'c', manualRealPct: 0, startDate: '2026-11-14', endDate: '2026-11-20' },
            ],
        } as never, HOJE);
        expect(r.atrasadas).toBe(1);
        expect(r.criticas).toBe(2);
        expect(r.criticasAbertas).toBe(1);
        // c: endDate do motor 20/11 (sex) → último dia trabalhado 19/11 (qui)
        expect(r.fimPrevisto).toBe('2026-11-19');
    });

    it('tarefa cujo ÚLTIMO dia foi ontem já está atrasada (o endDate do motor é hoje)', () => {
        // 10/11 (ter) + 3 dias úteis → endDate 13/11 (sex); trabalhada 10, 11 e 12/11.
        const r = indicadoresDePrazo([{ id: 'a', orcado: 1 }], {
            itemSchedules: [{ id: 'a', manualRealPct: 50, startDate: '2026-11-10', endDate: '2026-11-13' }],
        } as never, '2026-11-13');
        expect(r.atrasadas).toBe(1);
        expect(r.fimPrevisto).toBe('2026-11-12');
    });

    it('SPI = EV/PV com PV pela fração decorrida; null quando nada estava previsto até hoje', () => {
        const metade = indicadoresDePrazo([{ id: 'a', orcado: 1000 }], {
            itemSchedules: [{ id: 'a', manualRealPct: 25, startDate: '2026-11-04', endDate: '2026-11-24' }],
        } as never, HOJE);
        expect(metade.pv).toBeCloseTo(500, 5);
        expect(metade.spi).toBeCloseTo(0.5, 5);
        expect(metade.previstoPct).toBeCloseTo(50, 5);
        expect(metade.avancoFisicoPct).toBeCloseTo(25, 5);
        expect(metade.inicioPrevisto).toBe('2026-11-04');

        const futuro = indicadoresDePrazo([{ id: 'a', orcado: 1000 }], {
            itemSchedules: [{ id: 'a', startDate: '2026-12-01', endDate: '2026-12-31' }],
        } as never, HOJE);
        expect(futuro.spi).toBeNull();
    });

    it('sem orçamento ou sem datas não inventa número', () => {
        const vazio = indicadoresDePrazo([], { itemSchedules: [] } as never, HOJE);
        expect(vazio).toMatchObject({ avancoFisicoPct: 0, spi: null, atrasadas: 0, temDatas: false, fimPrevisto: '' });
        const semCronograma = indicadoresDePrazo([{ id: 'a', orcado: 10 }], undefined, HOJE);
        expect(semCronograma.temDatas).toBe(false);
    });

    it('desvio da linha de base ativa em dias (positivo = atrasou); datas ISO completas viram dia', () => {
        const r = indicadoresDePrazo([{ id: 'a', orcado: 1 }], {
            itemSchedules: [{ id: 'a', startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-11T00:00:00.000Z' }],
            activeBaselineId: 'bl1',
            baselines: [{ id: 'bl1', itemDates: { a: { startDate: '2026-11-01', endDate: '2026-12-01' } } }],
        } as never, HOJE);
        // Término × término: 11/12 (sex) → 10/12; linha de base 01/12 (ter) → 30/11 (seg).
        expect(r.fimPrevisto).toBe('2026-12-10');
        expect(r.fimBaseline).toBe('2026-11-30');
        expect(r.desvioDias).toBe(10);
    });

    it('Divino (15/11/2026): última tarefa 18/11 + 10 dias úteis → motor grava 02/12; término = 01/12, o do cabeçalho', () => {
        const r = indicadoresDePrazo([{ id: 'a', orcado: 1 }], {
            itemSchedules: [{ id: 'a', startDate: '2026-11-18', endDate: '2026-12-02', duration: 10 }],
            endDate: '2026-12-01',
        } as never, HOJE);
        expect(r.fimPrevisto).toBe('2026-12-01');
    });

    it('atraso em dias pelo cronograma ganho: o avanço de hoje é o previsto para uma data passada', () => {
        // 1 tarefa de 01/11 a 01/12 (30 dias corridos), 20% feito em 21/11 (previsto ~66,7%).
        // 20% do PV é alcançado em 01/11 + 6 dias = 07/11 → 14 dias de atraso.
        const r = indicadoresDePrazo([{ id: 'a', orcado: 1000 }], {
            itemSchedules: [{ id: 'a', manualRealPct: 20, startDate: '2026-11-01', endDate: '2026-12-01' }],
        } as never, '2026-11-21');
        expect(r.avancoEquivaleA).toBe('2026-11-07');
        expect(r.atrasoDias).toBe(14);
        expect(r.terminoVencidoDias).toBeNull();

        const emDia = indicadoresDePrazo([{ id: 'a', orcado: 1000 }], {
            itemSchedules: [{ id: 'a', manualRealPct: 80, startDate: '2026-11-01', endDate: '2026-12-01' }],
        } as never, '2026-11-21');
        expect(emDia.atrasoDias).toBe(0);

        const nadaPrevisto = indicadoresDePrazo([{ id: 'a', orcado: 1000 }], {
            itemSchedules: [{ id: 'a', startDate: '2026-12-01', endDate: '2026-12-31' }],
        } as never, '2026-11-21');
        expect(nadaPrevisto.atrasoDias).toBeNull();
    });

    it('término vencido: dias desde o último dia trabalhado, só se não chegou a 100%', () => {
        const garden = indicadoresDePrazo([{ id: 'a', orcado: 1 }], {
            itemSchedules: [{ id: 'a', manualRealPct: 24, startDate: '2026-01-05', endDate: '2026-04-16' }],
        } as never, HOJE);
        expect(garden.fimPrevisto).toBe('2026-04-15');
        expect(garden.terminoVencidoDias).toBe(diasEntre('2026-04-15', HOJE));
        const pronto = indicadoresDePrazo([{ id: 'a', orcado: 1 }], {
            itemSchedules: [{ id: 'a', manualRealPct: 100, startDate: '2026-01-05', endDate: '2026-04-16' }],
        } as never, HOJE);
        expect(pronto.terminoVencidoDias).toBeNull();
    });
});

describe('apoio', () => {
    it('folhasDoOrcamento = quantidade × preço; ausente vira 0', () => {
        expect(folhasDoOrcamento([{ id: 'x', quantity: 3, sinapiItem: { price: 2.5 } }, { id: 'y' }])).toEqual([
            { id: 'x', orcado: 7.5 }, { id: 'y', orcado: 0 },
        ]);
        expect(folhasDoOrcamento(null)).toEqual([]);
    });

    it('ultimoDiaTrabalhado: dia útil anterior ao fim do motor; marco = o próprio dia; pula fim de semana', () => {
        expect(ultimoDiaTrabalhado('2026-11-18', '2026-12-02')).toBe('2026-12-01');
        expect(ultimoDiaTrabalhado('2026-11-13', '2026-11-16')).toBe('2026-11-13'); // sex → seg: 1 dia
        expect(ultimoDiaTrabalhado('2026-11-20', '2026-11-20')).toBe('2026-11-20'); // marco
        expect(ultimoDiaTrabalhado('', '2026-11-20')).toBe('2026-11-20');
        expect(ultimoDiaTrabalhado('2026-11-20', '')).toBe('');
    });

    it('hoje é o dia LOCAL (às 22h em Brasília o UTC já virou o dia)', () => {
        const noite = new Date(2026, 10, 14, 22, 30);
        expect(hojeLocalISO(noite)).toBe('2026-11-14');
        expect(diasEntre('2026-11-14', '2026-12-14')).toBe(30);
    });
});
