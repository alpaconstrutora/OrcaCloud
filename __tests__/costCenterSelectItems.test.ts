import { describe, expect, it } from 'vitest';
import { costCenterSelectItems } from '../components/CostCenterSelect';

// Grupo não recebe lançamento (pedido de 09/11/2026): no seletor ele só abre/fecha.
// Ver docs/planos/2026-11-09-centro-de-custo-conta-e-trava-de-grupo.md
describe('costCenterSelectItems — grupo não escolhível', () => {
    const ccs = [
        { id: 'g1', code: '001', name: 'Administrativo', parent_id: null, organization_id: 'A' },
        { id: 'f1', code: '002', name: 'Pro-labore', parent_id: 'g1', organization_id: 'A' },
        { id: 'g2', code: '003', name: 'Comercial', parent_id: null, organization_id: 'A' },
    ];
    const sel = (itens: ReturnType<typeof costCenterSelectItems>, id: string) => itens.find(i => i.id === id)?.selecionavel;

    it('grupo (parent_id null) não é escolhível; centro de custo é', () => {
        const itens = costCenterSelectItems(ccs);
        expect(sel(itens, 'g1')).toBe(false);
        expect(sel(itens, 'f1')).toBeUndefined();
    });

    it('permitirGrupo (filtro/relatório): grupo escolhível', () => {
        const itens = costCenterSelectItems(ccs, new Map(), { permitirGrupo: true });
        expect(sel(itens, 'g1')).toBeUndefined();
    });

    // 13/11/2026: "001 Condomínio" sem filho continuava no drawer do Extrato depois de o
    // usuário excluir o centro de custo de dentro dele — parecia exclusão que não pegou.
    describe('grupo sem nenhum centro de custo dentro', () => {
        it('some do drawer (não tem o que escolher)', () => {
            expect(costCenterSelectItems(ccs).map(i => i.id)).toEqual(['g1', 'f1']);
        });
        it('fica se for o valor gravado no campo (por id ou, no campo legado, por nome)', () => {
            expect(costCenterSelectItems(ccs, new Map(), { valorAtual: 'g2' }).some(i => i.id === 'g2')).toBe(true);
            expect(costCenterSelectItems(ccs, new Map(), { valorAtual: 'Comercial' }).some(i => i.id === 'g2')).toBe(true);
        });
        it('fica com permitirGrupo (filtro/relatório pode escolher o grupo)', () => {
            expect(costCenterSelectItems(ccs, new Map(), { permitirGrupo: true }).some(i => i.id === 'g2')).toBe(true);
        });
        it('org cujos grupos são todos vazios não ganha cabeçalho', () => {
            const itens = costCenterSelectItems([...ccs, { id: 'gB', code: '001', name: 'Condomínio', parent_id: null, organization_id: 'B' }]);
            expect(itens.some(i => i.id === 'gB' || i.id === 'org:B')).toBe(false);
            expect(itens.some(i => i.id.startsWith('org:'))).toBe(false);
        });
    });

    it('`selecionavel` explícito vence a regra', () => {
        const itens = costCenterSelectItems([{ ...ccs[0], selecionavel: true }, { ...ccs[1], selecionavel: false }]);
        expect(sel(itens, 'g1')).toBe(true);
        expect(sel(itens, 'f1')).toBe(false);
    });

    it('lista sem parent_id (campo ausente): não adivinha, deixa escolhível', () => {
        const itens = costCenterSelectItems([{ id: 'x', name: 'Obra > Bloco A' }]);
        expect(sel(itens, 'x')).toBeUndefined();
    });

    it('várias organizações: grupo continua travado debaixo do cabeçalho da org', () => {
        const itens = costCenterSelectItems([...ccs,
            { id: 'g9', code: '001', name: 'Obra', parent_id: null, organization_id: 'B' },
            { id: 'f9', code: '002', name: 'Bloco A', parent_id: 'g9', organization_id: 'B' }]);
        expect(itens.find(i => i.id === 'g9')).toMatchObject({ parentId: 'org:B', selecionavel: false });
        expect(sel(itens, 'org:A')).toBe(false);
    });
});
