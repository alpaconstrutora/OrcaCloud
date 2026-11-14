/**
 * Unidade que saiu do Espelho de Vendas não entra na oferta (Tabela de Preços,
 * aba Unidades, Portal do Corretor). Plano:
 * docs/planos/2026-11-14-venda-de-ativos-unidades-analise-contrato-tabela.md (item 4).
 */
import { describe, it, expect } from 'vitest';
import { unidadesForaDoEspelho } from '../lib/espelhoDeVendas';

const PREDIO = 'predio-do-empreendimento';
const AVULSO = 'predio-sem-empreendimento';

describe('unidadesForaDoEspelho', () => {
    const unidades = [
        { id: 'vinculada-venda', parent_id: PREDIO },
        { id: 'vinculada-locacao', parent_id: PREDIO },
        { id: 'desvinculada', parent_id: PREDIO },
        { id: 'do-predio-avulso', parent_id: AVULSO },
        { id: 'sem-predio', parent_id: null },
        { id: PREDIO, parent_id: null },
    ];
    const fora = unidadesForaDoEspelho(
        unidades,
        new Set([PREDIO]),
        new Set(['vinculada-venda', 'vinculada-locacao']),
    );

    it('corta a filha de edifício do empreendimento que nenhuma unidade do espelho aponta', () => {
        expect([...fora]).toEqual(['desvinculada']);
    });

    it('mantém a vinculada por venda ou por locação', () => {
        expect(fora.has('vinculada-venda')).toBe(false);
        expect(fora.has('vinculada-locacao')).toBe(false);
    });

    it('edifício sem empreendimento e imóvel avulso não mudam', () => {
        expect(fora.has('do-predio-avulso')).toBe(false);
        expect(fora.has('sem-predio')).toBe(false);
        expect(fora.has(PREDIO)).toBe(false);
    });

    it('sem edifício do espelho, nada sai', () => {
        expect(unidadesForaDoEspelho(unidades, new Set(), new Set()).size).toBe(0);
    });
});
