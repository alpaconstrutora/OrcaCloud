import { describe, it, expect } from 'vitest';
import {
    buildUnitMirror,
    mirrorTowers,
    rotuloCurtoDaUnidade,
    rotuloDoAndar,
    type UnitMirrorCell,
} from '../lib/rentalUnitMirror';
import { groupRentalAnalysis, type AnalysisProperty } from '../lib/rentalByEmpreendimento';
import type { StatusEvent } from '../lib/rentalVacancy';

/**
 * Espelho das unidades da aba Análise de Locações (overdrive, 26/10/2026).
 *
 * A garantia é a mesma da aba inteira: o espelho é uma PARTIÇÃO do mesmo balde
 * dos indicadores. Se o espelho mostrasse 3 unidades com atraso e o gráfico de
 * atraso dissesse outra coisa, o desenho mais bonito da tela seria o menos
 * confiável.
 */

const NOW = new Date('2026-08-12T12:00:00');

const properties: AnalysisProperty[] = [
    { id: 'b', parent_id: null, status: 'AVAILABLE', name: 'Edifício' },
    { id: 'u1', parent_id: 'b', status: 'RENTED', name: 'Sala - 301', block: 'TORRE A', floor: 3, rental_price: 2000, private_area: 40 },
    { id: 'u2', parent_id: 'b', status: 'AVAILABLE', name: 'Sala - 302', block: 'TORRE A', floor: 3, rental_price: 1800 },
    { id: 'u3', parent_id: 'b', status: 'RENTED', name: 'Loja - 101', block: 'TORRE A', floor: 1, rental_price: 5000 },
    { id: 'u4', parent_id: 'b', status: 'RESERVED', name: '12', block: 'TORRE B', floor: 0, rental_price: 900 },
    { id: 'u5', parent_id: 'b', status: 'AVAILABLE', name: 'Estacionamento 1', block: 'TORRE B', floor: -1 },
    { id: 'u6', parent_id: 'b', status: 'MAINTENANCE', name: 'Sem posição' },
];

const deals = [
    { id: 'd1', type: 'RENTAL', status: 'COMPLETED', property_id: 'u1', installment_value: 1900 },
    // Um contrato para DUAS unidades: o atraso aparece nas duas, e cada uma sabe disso.
    { id: 'd3', type: 'RENTAL', status: 'COMPLETED', units: [{ property_id: 'u3' }, { property_id: 'u4' }], installment_value: 5000 },
];

const contracts = [
    { id: 'c1', deal_id: 'd1', status: 'Ativo', end_date: '2026-10-01', current_value: 1900 },   // vence em 50 dias
    { id: 'c1r', deal_id: null, parent_contract_id: 'c1', status: 'Ativo', end_date: '2027-10-01', current_value: 2000, renewal_seq: 1 },
    { id: 'c3', deal_id: 'd3', status: 'Ativo', end_date: '2028-01-31', current_value: 5000 },
];

const receivablesByContract = new Map([
    ['c1', [{ amount: 1900, due_date: '2026-03-10', settled: false }, { amount: 1900, due_date: '2026-07-30', settled: false }]],
    ['c3', [{ amount: 5000, due_date: '2026-08-01', settled: false }, { amount: 5000, due_date: '2026-07-01', settled: true }]],
]);

const events: StatusEvent[] = [
    { property_id: 'u2', from_status: 'RENTED', to_status: 'AVAILABLE', changed_at: '2026-04-14T00:00:00Z', source: 'APP' },
    { property_id: 'u5', from_status: null, to_status: 'AVAILABLE', changed_at: '2026-07-13T00:00:00Z', source: 'BACKFILL' },
];

const contratado: Record<string, number> = { u1: 1900, u3: 2500, u4: 2500 };

const mirror = buildUnitMirror({
    leaves: properties.filter(p => p.parent_id),
    deals,
    contracts,
    receivablesByContract,
    events,
    rentalValueOf: p => Number(p.rental_price ?? 0),
    contractedValueOf: id => contratado[id] ?? 0,
    now: NOW,
});
const cel = (id: string) => mirror.find(c => c.id === id)!;

describe('buildUnitMirror', () => {
    it('uma célula por unidade locável, com o status nas 5 categorias do donut', () => {
        expect(mirror).toHaveLength(6);
        expect(cel('u1').status).toBe('rented');
        expect(cel('u4').status).toBe('reserved');
        expect(cel('u6').status).toBe('maintenance');
    });

    it('dias de vaga vêm do log; marco de backfill fica marcado como aproximado', () => {
        expect(cel('u2').vacantDays).toBe(120);
        expect(cel('u2').vacancyApproximate).toBe(false);
        expect(cel('u5').vacantDays).toBe(30);
        expect(cel('u5').vacancyApproximate).toBe(true);
        expect(cel('u1').vacantDays).toBeNull();          // alugada não tem "dias vaga"
    });

    it('atraso chega à unidade pelo contrato → negócio, e o > 90 dias é separado', () => {
        expect(cel('u1').overdue).toBe(3800);
        expect(cel('u1').overdue90).toBe(1900);
        expect(cel('u2').overdue).toBe(0);
    });

    it('contrato de várias unidades: o atraso aparece em cada uma e ela sabe quantas são', () => {
        expect(cel('u3').overdue).toBe(5000);
        expect(cel('u4').overdue).toBe(5000);
        expect(cel('u3').contractUnits).toBe(2);
        expect(cel('u1').contractUnits).toBe(1);
    });

    it('vence em 90 dias = contrato vigente com término na janela (renovação segue o pai)', () => {
        expect(cel('u1').expiresWithin90).toBe(true);
        expect(cel('u3').expiresWithin90).toBe(false);
    });

    it('aluguel contratado e valor base por unidade', () => {
        expect(cel('u1').contracted).toBe(1900);
        expect(cel('u1').base).toBe(2000);
        expect(cel('u5').base).toBe(0);
    });
});

describe('mirrorTowers', () => {
    const torres = mirrorTowers(mirror);

    it('torres em ordem, andares de cima para baixo, sem posição por último', () => {
        expect(torres.map(t => t.block)).toEqual(['TORRE A', 'TORRE B', '']);
        expect(torres[0].floors.map(f => f.floor)).toEqual([3, 1]);
        expect(torres[1].floors.map(f => f.floor)).toEqual([0, -1]);
        expect(torres[2].floors[0].floor).toBeNull();
    });

    it('unidades do andar em ordem natural do rótulo', () => {
        expect(torres[0].floors[0].cells.map(c => c.label)).toEqual(['301', '302']);
    });

    it('a soma das células é a carteira (nenhuma unidade some)', () => {
        const n = torres.reduce((acc, t) => acc + t.floors.reduce((a, f) => a + f.cells.length, 0), 0);
        expect(n).toBe(mirror.length);
    });
});

describe('rótulos', () => {
    it('rótulo curto pega o número no fim do nome', () => {
        expect(rotuloCurtoDaUnidade('Sala - 301')).toBe('301');
        expect(rotuloCurtoDaUnidade('Loja - 101A')).toBe('101A');
        expect(rotuloCurtoDaUnidade('Estacionamento 1')).toBe('Estac. 1');
        expect(rotuloCurtoDaUnidade('Salão')).toBe('Salão');
    });

    it('andar: térreo, subsolo e pavimento', () => {
        expect(rotuloDoAndar(0)).toEqual({ curto: 'T', longo: 'Térreo' });
        expect(rotuloDoAndar(-1)).toEqual({ curto: 'S1', longo: '1º subsolo' });
        expect(rotuloDoAndar(3)).toEqual({ curto: '3º', longo: '3º pavimento' });
        expect(rotuloDoAndar(null)).toEqual({ curto: '—', longo: 'Sem andar cadastrado' });
    });
});

describe('espelho no escopo da análise', () => {
    it('cada balde traz as suas células, e o espelho fecha com a composição e com o atraso', () => {
        const { total } = groupRentalAnalysis({
            properties,
            deals,
            empreendimentoByProperty: { b: { id: 'emp', name: 'Emp' } },
            rentalValueOf: p => Number(p.rental_price ?? 0),
            contractedValueOf: id => contratado[id] ?? 0,
            contracts,
            receivablesByContract,
            vacancyEvents: events,
            now: NOW,
        });
        const units: UnitMirrorCell[] = total.units;
        expect(units).toHaveLength(total.unitsCount);
        expect(units.filter(u => u.status === 'available').length).toBe(total.unitStatus.available);
        // Contrato de 2 unidades conta o atraso UMA vez no gráfico; no espelho, por contrato.
        const porContrato = new Map<string, number>();
        units.forEach(u => u.overdueByContract.forEach(([c, v]) => porContrato.set(c, v)));
        const soma = [...porContrato.values()].reduce((a, v) => a + v, 0);
        expect(soma).toBeCloseTo(total.aging!.totalOverdue, 6);
    });
});
