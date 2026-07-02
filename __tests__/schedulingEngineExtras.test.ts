/**
 * Testes de integração do SchedulingEngine para os gaps do Plano de Planejamento
 * (PLANO_MODULO_PLANEJAMENTO_GAPS.md): #1 Feriados e #6a Diagrama de Rede.
 */
import { describe, it, expect } from 'vitest';
import { SchedulingEngine } from '../utils/schedulingEngine';
import { ItemScheduleDetails, ResourceRole, ResourceMaterial } from '../types';

describe('SchedulingEngine.calculate — holidays', () => {
    it('feriado no meio da duração empurra o término (tarefa sem predecessores)', () => {
        // Segunda 2025-01-13 + 3 dias úteis, com quarta 2025-01-15 como feriado.
        const tasks: ItemScheduleDetails[] = [
            { id: 't1', duration: 3 },
        ];

        const withoutHoliday = SchedulingEngine.calculate(
            tasks, '2025-01-13', undefined, true, undefined, [], undefined, [], [], [1, 2, 3, 4, 5], []
        );
        expect(withoutHoliday[0].earlyFinish).toBe('2025-01-16'); // quinta

        const withHoliday = SchedulingEngine.calculate(
            tasks, '2025-01-13', undefined, true, undefined, [], undefined, [], [], [1, 2, 3, 4, 5], ['2025-01-15']
        );
        expect(withHoliday[0].earlyFinish).toBe('2025-01-17'); // sexta — feriado empurrou 1 dia
    });

    it('propaga feriado no cálculo de dependência FS (sucessora pula o dia não útil)', () => {
        const tasks: ItemScheduleDetails[] = [
            { id: 't1', duration: 2 },
            { id: 't2', duration: 1, predecessors: [{ id: 't1', type: 'FS' as any, lag: 0 }] },
        ];

        // 2025-01-15 (quarta) é feriado configurado.
        const result = SchedulingEngine.calculate(
            tasks, '2025-01-13', undefined, true, undefined, [], undefined, [], [], [1, 2, 3, 4, 5], ['2025-01-15']
        );

        const t1 = result.find(t => t.id === 't1')!;
        const t2 = result.find(t => t.id === 't2')!;

        // t1: seg 13/01 + 2 dias úteis (feriado em 15/01 não conta) = termina 16/01 (quinta)
        expect(t1.earlyFinish).toBe('2025-01-16');
        // t2 inicia no dia seguinte útil ao término de t1
        expect(t2.earlyStart).toBe(t1.earlyFinish);
    });
});

describe('SchedulingEngine.getTopologicalOrder — usado pelo Diagrama de Rede', () => {
    it('ordena tarefas respeitando predecessoras', () => {
        const tasks: ItemScheduleDetails[] = [
            { id: 'c', predecessors: [{ id: 'b', type: 'FS' as any, lag: 0 }] },
            { id: 'a' },
            { id: 'b', predecessors: [{ id: 'a', type: 'FS' as any, lag: 0 }] },
        ];
        const order = SchedulingEngine.getTopologicalOrder(tasks);
        expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
        expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });

    it('lança erro em dependência circular', () => {
        const tasks: ItemScheduleDetails[] = [
            { id: 'a', predecessors: [{ id: 'b', type: 'FS' as any, lag: 0 }] },
            { id: 'b', predecessors: [{ id: 'a', type: 'FS' as any, lag: 0 }] },
        ];
        expect(() => SchedulingEngine.getTopologicalOrder(tasks)).toThrow();
    });
});

describe('SchedulingEngine.calculate — recursos Material/Custo/hora extra', () => {
    const roles: ResourceRole[] = [
        { id: 'r1', name: 'Pedreiro', costPerHour: 20, costPerDay: 160, overtimeCostPerHour: 35, costPerUse: 50 },
    ];
    const materials: ResourceMaterial[] = [
        { id: 'm1', name: 'Cimento', unit: 'saco', costPerUnit: 30 },
    ];

    it('material: custo único (quantidade × custo/unidade), não multiplica por duração', () => {
        const tasks: ItemScheduleDetails[] = [{
            id: 't1', duration: 5,
            allocations: [{ id: 'a1', resourceId: 'm1', resourceType: 'MATERIAL', quantity: 10, hoursPerDay: 0 }],
        }];
        const result = SchedulingEngine.calculate(tasks, '2025-01-06', undefined, true, undefined, roles, undefined, [], [], undefined, [], materials);
        expect(result[0].totalLaborCost).toBe(300); // 10 × 30, sem multiplicar por 5 dias
        expect(result[0].totalManHours).toBe(0);
    });

    it('custo avulso: soma fixedCost independente de duração/recursos', () => {
        const tasks: ItemScheduleDetails[] = [{
            id: 't1', duration: 3,
            allocations: [{ id: 'a1', resourceId: 'cost', resourceType: 'COST', quantity: 1, hoursPerDay: 0, fixedCost: 500 }],
        }];
        const result = SchedulingEngine.calculate(tasks, '2025-01-06', undefined, true, undefined, roles, undefined, [], [], undefined, [], materials);
        expect(result[0].totalLaborCost).toBe(500);
    });

    it('hora extra: soma quantidade × overtimeCostPerHour × horas extras × duração', () => {
        const tasks: ItemScheduleDetails[] = [{
            id: 't1', duration: 2,
            allocations: [{ id: 'a1', resourceId: 'r1', resourceType: 'ROLE', quantity: 1, hoursPerDay: 8, overtimeHours: 2 }],
        }];
        const result = SchedulingEngine.calculate(tasks, '2025-01-06', undefined, true, undefined, roles, undefined, [], [], undefined, [], materials);
        // base: 1×20×8×2=320; extra: 1×35×2×2=140; costPerUse: 1×50=50 → total 510
        expect(result[0].totalLaborCost).toBe(510);
    });
});

describe('SchedulingEngine.calculateResourceHistogram — calendário individual do recurso', () => {
    it('recurso com calendário próprio (3 dias/semana) não é contado nos dias que não trabalha', () => {
        const roles: ResourceRole[] = [
            { id: 'r1', name: 'Pedreiro', costPerHour: 20, costPerDay: 160 }, // calendário do projeto (seg-sex)
            { id: 'r2', name: 'Consultor Externo', costPerHour: 50, costPerDay: 400, workDays: [2, 4] }, // só terça e quinta
        ];
        // Segunda 2025-01-06 a sexta 2025-01-10
        const tasks: ItemScheduleDetails[] = [{
            id: 't1', startDate: '2025-01-06', endDate: '2025-01-10',
            allocations: [
                { id: 'a1', resourceId: 'r1', resourceType: 'ROLE', quantity: 1, hoursPerDay: 8 },
                { id: 'a2', resourceId: 'r2', resourceType: 'ROLE', quantity: 1, hoursPerDay: 8 },
            ],
        }];

        const histogram = SchedulingEngine.calculateResourceHistogram(tasks, true, [], [], [], roles);

        // r1 (calendário do projeto): presente todos os 5 dias úteis
        expect(histogram['2025-01-06']?.r1?.total).toBe(1);
        expect(histogram['2025-01-07']?.r1?.total).toBe(1);

        // r2 (só terça/quinta): ausente na segunda, presente na terça e quinta
        expect(histogram['2025-01-06']?.r2).toBeUndefined(); // segunda — r2 não trabalha
        expect(histogram['2025-01-07']?.r2?.total).toBe(1);  // terça
        expect(histogram['2025-01-08']?.r2).toBeUndefined(); // quarta
        expect(histogram['2025-01-09']?.r2?.total).toBe(1);  // quinta
        expect(histogram['2025-01-10']?.r2).toBeUndefined(); // sexta
    });
});
