/**
 * Locações › Reajustes dentro de um empreendimento (pedido de 24/11/2026: "Inves
 * de listar os locatarios referentes ao respectivo empreedimento esta trazendo
 * todos"). A aba Contratos já recorta pelo edifício aberto; Reajustes recebia só
 * a organização. Contrato renovado não tem deal_id (aponta para o pai por
 * parent_contract_id) — a negociação vem da raiz da cadeia.
 */
import { describe, it, expect } from 'vitest';
import { negociacaoDaCadeia, filaDoEmpreendimento } from '../utils/reajusteAniversario';

const CADEIA = new Map([
    ['c-orig', { deal_id: 'd1', parent_contract_id: null }],
    ['c-ren1', { deal_id: null, parent_contract_id: 'c-orig' }],
    ['c-ren2', { deal_id: null, parent_contract_id: 'c-ren1' }],
    ['c-solto', { deal_id: null, parent_contract_id: null }],
    ['c-laco-a', { deal_id: null, parent_contract_id: 'c-laco-b' }],
    ['c-laco-b', { deal_id: null, parent_contract_id: 'c-laco-a' }],
]);

describe('negociacaoDaCadeia', () => {
    it('contrato da negociação: o próprio deal_id', () => {
        expect(negociacaoDaCadeia('c-orig', CADEIA)).toBe('d1');
    });
    it('renovado (e renovado do renovado): a negociação da raiz', () => {
        expect(negociacaoDaCadeia('c-ren1', CADEIA)).toBe('d1');
        expect(negociacaoDaCadeia('c-ren2', CADEIA)).toBe('d1');
    });
    it('sem negociação em nenhum elo: null', () => {
        expect(negociacaoDaCadeia('c-solto', CADEIA)).toBeNull();
    });
    it('cadeia com laço não trava: null', () => {
        expect(negociacaoDaCadeia('c-laco-a', CADEIA)).toBeNull();
    });
});

describe('filaDoEmpreendimento', () => {
    const fila = [
        { id: 'a', negociacaoId: 'd1' },
        { id: 'b', negociacaoId: 'd2' },
        { id: 'c', negociacaoId: null },
    ];
    it('fora de um empreendimento (null): a fila inteira', () => {
        expect(filaDoEmpreendimento(fila, null).map(l => l.id)).toEqual(['a', 'b', 'c']);
    });
    it('dentro: só os contratos cuja negociação é do empreendimento', () => {
        expect(filaDoEmpreendimento(fila, new Set(['d1'])).map(l => l.id)).toEqual(['a']);
    });
    it('empreendimento sem negociação: lista vazia (não a fila inteira)', () => {
        expect(filaDoEmpreendimento(fila, new Set())).toEqual([]);
    });
});

// Renovações usa o mesmo recorte (pedido de 24/11/2026, item 1: "Sim").
import { vi } from 'vitest';
const lidos: string[][] = [];
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => {
            let ids: string[] = [];
            const q: Record<string, unknown> = {};
            q.select = () => q;
            q.in = (_c: string, v: string[]) => { ids = v; lidos.push(v); return q; };
            q.then = (ok: (r: unknown) => unknown) => Promise.resolve({
                data: ids.flatMap(id => (id === 'pai' ? [{ id: 'pai', deal_id: null, parent_contract_id: 'avo' }]
                    : id === 'avo' ? [{ id: 'avo', deal_id: 'd-avo', parent_contract_id: null }] : [])),
                error: null,
            }).then(ok);
            return q;
        },
    },
}));
import { negociacoesDosContratos } from '../services/negociacaoDoContratoService';

describe('negociacoesDosContratos (Reajustes e Renovações)', () => {
    it('lê os pais que faltam, nível a nível, e devolve a negociação da raiz', async () => {
        lidos.length = 0;
        const m = await negociacoesDosContratos([
            { id: 'neto', deal_id: null, parent_contract_id: 'pai' },
            { id: 'direto', deal_id: 'd9', parent_contract_id: null },
        ]);
        expect(m.get('neto')).toBe('d-avo');
        expect(m.get('direto')).toBe('d9');
        expect(lidos).toEqual([['pai'], ['avo']]);
    });
});
