/**
 * Origem do tributo em Tributos a Pagar (22/10/2026).
 * Plano: docs/planos/2026-10-22-tributos-filtro-de-origem.md
 */
import { describe, it, expect } from 'vitest';
import {
    origemDoTributo, origensSelecionadas, filtrarPorOrigem, ORIGENS_TRIBUTO, ORIGEM_TRIBUTO_LABEL,
} from '../utils/tributoOrigem';

const FOLHA = { id: 'f', source_system: 'LABOR', reference_id: 'labor-111-unallocated-fgts' };
const PROLABORE = { id: 'p', source_system: 'PROLABORE', reference_id: 'prolabore-222-inss' };
const COMERCIAL = { id: 'c', source_system: 'COMMERCIAL', reference_id: 'tax-333-p1-iss' };
const MANUAL = { id: 'm', source_system: 'COMMERCIAL', reference_id: undefined };
const TODAS = [FOLHA, PROLABORE, COMERCIAL, MANUAL];

describe('origemDoTributo', () => {
    it('separa folha, pró-labore, comercial e manual', () => {
        expect(TODAS.map(origemDoTributo)).toEqual(['FOLHA', 'PROLABORE', 'COMERCIAL', 'MANUAL']);
    });
    it('reference_id vazio ou só espaços é manual; nulo também', () => {
        expect(origemDoTributo({ source_system: 'COMMERCIAL', reference_id: '' })).toBe('MANUAL');
        expect(origemDoTributo({ source_system: 'COMMERCIAL', reference_id: '  ' })).toBe('MANUAL');
        expect(origemDoTributo({ source_system: 'COMMERCIAL', reference_id: null })).toBe('MANUAL');
    });
    it('a fonte vence o reference_id: folha e pró-labore nunca caem em Manual', () => {
        expect(origemDoTributo({ source_system: 'LABOR', reference_id: null })).toBe('FOLHA');
        expect(origemDoTributo({ source_system: 'PROLABORE', reference_id: '' })).toBe('PROLABORE');
    });
    it('todo valor tem rótulo', () => {
        for (const o of ORIGENS_TRIBUTO) expect(ORIGEM_TRIBUTO_LABEL[o]).toBeTruthy();
        expect(ORIGENS_TRIBUTO).toHaveLength(4);
    });
});

describe('origensSelecionadas', () => {
    it('lixo, vazio ou ausente volta para todas', () => {
        for (const ruim of [undefined, null, 'FOLHA', {}, [], ['XYZ']]) {
            expect(origensSelecionadas(ruim)).toEqual(ORIGENS_TRIBUTO);
        }
    });
    it('descarta o inválido, tira repetido e mantém a ordem do filtro', () => {
        expect(origensSelecionadas(['MANUAL', 'FOLHA', 'FOLHA', 'ANTIGA'])).toEqual(['FOLHA', 'MANUAL']);
    });
});

describe('filtrarPorOrigem', () => {
    it('com todas marcadas devolve a mesma lista (sem copiar)', () => {
        expect(filtrarPorOrigem(TODAS, ORIGENS_TRIBUTO)).toBe(TODAS);
    });
    it('uma origem só', () => {
        expect(filtrarPorOrigem(TODAS, ['FOLHA']).map(l => l.id)).toEqual(['f']);
        expect(filtrarPorOrigem(TODAS, ['MANUAL']).map(l => l.id)).toEqual(['m']);
    });
    it('folha + pró-labore juntas (a guia do mês leva as duas)', () => {
        expect(filtrarPorOrigem(TODAS, ['FOLHA', 'PROLABORE']).map(l => l.id)).toEqual(['f', 'p']);
    });
});
