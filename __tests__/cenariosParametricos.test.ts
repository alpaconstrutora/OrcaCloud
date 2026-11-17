/**
 * Cenários do orçamento paramétrico (pedido "Corrigir problemas com cenários", 17/11/2026).
 * Regras puras: ler o que está gravado no projeto, numerar sem repetir, comparar com a
 * simulação atual e avisar quando o projeto mudou desde que o cenário foi salvo.
 */
import { describe, it, expect } from 'vitest';
import {
    lerCenarios,
    proximoNumero,
    criarCenario,
    comparacaoComAtual,
    diferencasDeContexto,
    formatarPercentual,
    formatarFatorK,
    lerSimulacao,
    simulacaoDoProjeto,
    mesmaSimulacao,
    renomearCenario,
    referenciaAoCenario,
} from '../utils/cenariosParametricos';

const BDI = { taxes: 8.5, profit: 12, risk: 2, insurance: 1, admin: 5, guarantee: 0, finance: 0 };
const ENTRADA = {
    totalValue: 1_250_000,
    costPerM2: 1_250,
    bdi: 31.2345,
    bdiComposition: BDI,
    kFactor: 1.2,
    sensitivity: { materials: 5, labor: -2 },
    durationMonths: 24,
    area: 1000,
    standard: 'R8-N',
};

describe('cenários do paramétrico — regras puras', () => {
    it('numera pelo maior número salvo + 1, sem repetir depois de excluir', () => {
        expect(proximoNumero([])).toBe(1);
        const c1 = criarCenario(ENTRADA, []);
        const c2 = criarCenario(ENTRADA, [c1]);
        expect([c1.number, c2.number]).toEqual([1, 2]);
        // Excluiu o 1: o próximo é 3, não "Cenário 2" de novo.
        const c3 = criarCenario(ENTRADA, [c2]);
        expect(c3.number).toBe(3);
        expect(c3.name).toBe('Cenário 3 (R8-N)');
        expect(c3.id).not.toBe(c2.id);
    });

    it('guarda data E hora (não só a hora) e tudo o que reproduz o valor', () => {
        const c = criarCenario(ENTRADA, [], new Date('2026-11-17T14:05:00Z'));
        expect(c.createdAt).toBe('2026-11-17T14:05:00.000Z');
        expect(c.bdiComposition).toEqual(BDI);
        expect(c.sensitivity).toEqual({ materials: 5, labor: -2 });
        expect(c.durationMonths).toBe(24);
    });

    it('lê o que está gravado no projeto e descarta lixo', () => {
        const valido = criarCenario(ENTRADA, []);
        expect(lerCenarios(undefined)).toEqual([]);
        expect(lerCenarios('x')).toEqual([]);
        const lidos = lerCenarios([valido, null, { id: 'sem-valor' }, { ...valido, id: 'zero', totalValue: 0 }]);
        expect(lidos.map(c => c.id)).toEqual([valido.id]);
    });

    it('compara com a simulação atual em texto neutro, sem Infinity nem sinal ambíguo', () => {
        expect(comparacaoComAtual(1_000_000, 1_000_000)).toBe('igual ao atual');
        expect(comparacaoComAtual(1_000_400, 1_000_000)).toBe('igual ao atual');
        expect(comparacaoComAtual(877_000, 1_000_000)).toBe('12,3% abaixo do atual');
        expect(comparacaoComAtual(1_041_000, 1_000_000)).toBe('4,1% acima do atual');
        expect(comparacaoComAtual(0, 1_000_000)).toBeNull();
        expect(comparacaoComAtual(1_000_000, 0)).toBeNull();
    });

    it('avisa o que mudou no projeto desde que o cenário foi salvo', () => {
        const c = criarCenario(ENTRADA, []);
        expect(diferencasDeContexto(c, { standard: 'R8-N', area: 1000 })).toEqual([]);
        expect(diferencasDeContexto(c, { standard: 'R16-A', area: 1200 })).toEqual([
            'padrão R8-N (hoje R16-A)',
            'área 1.000 m² (hoje 1.200 m²)',
        ]);
    });

    it('formata percentual e fator K em pt-BR', () => {
        expect(formatarPercentual(31.2345)).toBe('31,23%');
        expect(formatarFatorK(1.2)).toBe('x1,20');
    });
});

describe('simulação guardada no orçamento (settings.parametricSimulation)', () => {
    const PROJETO = { bdiComposition: { ...BDI, profit: 15 }, kFactor: 1.1 };

    it('sem simulação gravada, parte do BDI e do fator K do projeto, sem variação e com prazo de 18 meses', () => {
        expect(lerSimulacao(undefined, PROJETO)).toEqual({
            bdiComposition: { ...BDI, profit: 15 },
            kFactor: 1.1,
            sensitivity: { materials: 0, labor: 0 },
            durationMonths: 18,
        });
    });

    it('projeto sem BDI nem fator K usa a composição padrão e K 1', () => {
        expect(simulacaoDoProjeto({})).toEqual({
            bdiComposition: BDI,
            kFactor: 1,
            sensitivity: { materials: 0, labor: 0 },
            durationMonths: 18,
        });
    });

    it('lê a simulação gravada; campo estragado volta ao valor do projeto', () => {
        const gravada = {
            bdiComposition: { ...BDI, profit: 20 },
            kFactor: 'x',
            sensitivity: { materials: 5, labor: 'muito' },
            durationMonths: 24,
        };
        expect(lerSimulacao(gravada, PROJETO)).toEqual({
            bdiComposition: { ...BDI, profit: 20 },
            kFactor: 1.1,
            sensitivity: { materials: 5, labor: 0 },
            durationMonths: 24,
        });
    });

    it('prazo e fator K precisam ser positivos', () => {
        expect(lerSimulacao({ kFactor: 0, durationMonths: -3 }, PROJETO)).toMatchObject({ kFactor: 1.1, durationMonths: 18 });
    });

    it('mesmaSimulacao compara valor a valor', () => {
        const base = simulacaoDoProjeto(PROJETO);
        expect(mesmaSimulacao(base, { ...base, bdiComposition: { ...base.bdiComposition } })).toBe(true);
        expect(mesmaSimulacao(base, { ...base, kFactor: 1.2 })).toBe(false);
        expect(mesmaSimulacao(base, { ...base, bdiComposition: { ...base.bdiComposition, taxes: 9 } })).toBe(false);
        expect(mesmaSimulacao(base, { ...base, sensitivity: { materials: 0, labor: 1 } })).toBe(false);
    });
});

describe('renomear cenário', () => {
    const cenarios = [criarCenario(ENTRADA, []), criarCenario(ENTRADA, [criarCenario(ENTRADA, [])])];

    it('troca só o nome do cenário pedido, sem espaços sobrando', () => {
        const novos = renomearCenario(cenarios, cenarios[0].id, '  Otimista   com  permuta ');
        expect(novos?.[0].name).toBe('Otimista com permuta');
        expect(novos?.[0].number).toBe(1);
        expect(novos?.[1]).toBe(cenarios[1]);
    });

    it('nome vazio ou igual ao atual não grava nada', () => {
        expect(renomearCenario(cenarios, cenarios[0].id, '   ')).toBeNull();
        expect(renomearCenario(cenarios, cenarios[0].id, cenarios[0].name)).toBeNull();
        expect(renomearCenario(cenarios, 'nao-existe', 'Otimista')).toBeNull();
    });

    it('corta em 80 caracteres', () => {
        expect(renomearCenario(cenarios, cenarios[0].id, 'a'.repeat(120))?.[0].name).toHaveLength(80);
    });

    it('referência no texto: nome padrão como está, nome livre entre aspas', () => {
        expect(referenciaAoCenario(cenarios[0])).toBe('Cenário 1 (R8-N)');
        expect(referenciaAoCenario({ ...cenarios[0], name: 'Otimista' })).toBe('cenário "Otimista"');
    });
});
