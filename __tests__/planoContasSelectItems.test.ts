import { describe, it, expect } from 'vitest';
import { planoContasSelectItems } from '../components/PlanoContasSelect';

// A hierarquia do plano de contas mora no código pontilhado — o seletor tem
// de derivar pai/filho daí para desenhar o mesmo accordion do Centro de Custo.
describe('planoContasSelectItems', () => {
    const contas = [
        { id: 'a', code: '1', name: 'DESPESAS' },
        { id: 'b', code: '1.1', name: 'Impostos' },
        { id: 'c', code: '1.1.1', name: 'PIS' },
        { id: 'd', code: '1.2.3.9', name: 'Uniformes' },   // não existe "1.2.3" nem "1.2" → pendura em "1"
        { id: 'e', code: '2', name: 'RECEITAS' },
        { id: 'f', code: null, name: 'Sem código' },
    ];

    it('pai = código sem o último segmento', () => {
        const porId = new Map(planoContasSelectItems(contas).map(i => [i.id, i]));
        expect(porId.get('a')?.parentId).toBeNull();
        expect(porId.get('b')).toMatchObject({ parentId: 'a', parentName: 'DESPESAS' });
        expect(porId.get('c')).toMatchObject({ parentId: 'b', parentName: 'Impostos' });
        expect(porId.get('e')?.parentId).toBeNull();
    });

    it('buraco na numeração sobe até o ancestral que existe', () => {
        const d = planoContasSelectItems(contas).find(i => i.id === 'd');
        expect(d).toMatchObject({ parentId: 'a', parentName: 'DESPESAS' });
    });

    it('conta sem código é raiz', () => {
        const f = planoContasSelectItems(contas).find(i => i.id === 'f');
        expect(f?.parentId).toBeNull();
    });

    it('em "Todas as organizações" o pai é o da MESMA org', () => {
        const duasOrgs = [
            { id: 'x1', code: '1', name: 'Raiz X', organization_id: 'X' },
            { id: 'y1', code: '1', name: 'Raiz Y', organization_id: 'Y' },
            { id: 'y11', code: '1.1', name: 'Filho Y', organization_id: 'Y' },
        ];
        const y11 = planoContasSelectItems(duasOrgs).find(i => i.id === 'y11');
        expect(y11).toMatchObject({ parentId: 'y1', parentName: 'Raiz Y' });
    });
});

describe('planoContasSelectItems — várias organizações', () => {
    const duasOrgs = [
        { id: 'x1', code: '1', name: 'DESPESAS', organization_id: 'X' },
        { id: 'x11', code: '1.1', name: 'Impostos', organization_id: 'X' },
        { id: 'y1', code: '1', name: 'DESPESAS', organization_id: 'Y' },
    ];
    const nomes = new Map([['X', 'Alpa'], ['Y', 'SPE Garden']]);

    it('cria um cabeçalho não selecionável por org e pendura as raízes nele', () => {
        const itens = planoContasSelectItems(duasOrgs, nomes);
        const cab = itens.filter(i => i.selecionavel === false);
        expect(cab.map(c => c.name)).toEqual(['Alpa', 'SPE Garden']);
        expect(itens.find(i => i.id === 'x1')).toMatchObject({ parentId: 'org:X', parentName: 'Alpa' });
        expect(itens.find(i => i.id === 'y1')).toMatchObject({ parentId: 'org:Y', parentName: 'SPE Garden' });
        // filho continua pendurado na conta-mãe, não na org
        expect(itens.find(i => i.id === 'x11')).toMatchObject({ parentId: 'x1' });
    });

    it('uma org só: sem cabeçalho', () => {
        const itens = planoContasSelectItems(duasOrgs.filter(c => c.organization_id === 'X'), nomes);
        expect(itens.some(i => i.selecionavel === false)).toBe(false);
        expect(itens.find(i => i.id === 'x1')?.parentId).toBeNull();
    });
});
