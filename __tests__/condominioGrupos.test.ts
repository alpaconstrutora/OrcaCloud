import { describe, it, expect } from 'vitest';
import { agruparCondominios, type LeitorDoCondominio } from '../utils/condominioGrupos';

/**
 * "Agrupar" de Comercial › Condomínios (guia de UI §6.12): Organização (pelo id, rótulo =
 * nome da célula), Cidade e Centro de custo (combinação, a linha nunca duplica). "Sem …"
 * sempre por último, nos dois sentidos.
 */

interface C { id: string; org?: string; cidade?: string; ccs?: { id: string; name: string }[] }

const ORGS: Record<string, string> = { o1: 'Condomínio Bella Vista', o2: 'Garden SPE', o3: 'Condomínio Bella Vista' };

const leitor: LeitorDoCondominio<C> = {
    organizacao: c => (c.org && ORGS[c.org] ? { id: c.org, name: ORGS[c.org] } : null),
    cidade: c => c.cidade,
    centrosDeCusto: c => c.ccs ?? [],
};

const rotulos = (g: ReturnType<typeof agruparCondominios<C>>) => g.map(x => `${x.label}:${x.itens.length}`);

describe('agruparCondominios', () => {
    it('organização: chave é o id — homônimas não se fundem; sem organização vai para o fim', () => {
        const itens: C[] = [{ id: 'a', org: 'o1' }, { id: 'b', org: 'o3' }, { id: 'c', org: 'o2' }, { id: 'd' }];
        const g = agruparCondominios(itens, 'organizacao', 'asc', leitor);
        expect(rotulos(g)).toEqual(['Condomínio Bella Vista:1', 'Condomínio Bella Vista:1', 'Garden SPE:1', 'Sem organização:1']);
        expect(rotulos(agruparCondominios(itens, 'organizacao', 'desc', leitor)).at(-1)).toBe('Sem organização:1');
        expect(rotulos(agruparCondominios(itens, 'organizacao', 'desc', leitor))[0]).toBe('Garden SPE:1');
    });

    it('cidade: caixa diferente cai junto; Decrescente inverte e mantém "Sem cidade" no fim', () => {
        const itens: C[] = [{ id: 'a', cidade: 'Cambuí' }, { id: 'b', cidade: 'CAMBUÍ' }, { id: 'c', cidade: 'Anápolis' }, { id: 'd' }];
        expect(rotulos(agruparCondominios(itens, 'cidade', 'asc', leitor))).toEqual(['Anápolis:1', 'Cambuí:2', 'Sem cidade:1']);
        expect(rotulos(agruparCondominios(itens, 'cidade', 'desc', leitor))).toEqual(['Cambuí:2', 'Anápolis:1', 'Sem cidade:1']);
    });

    it('centro de custo: agrupa pela combinação, sem duplicar o condomínio em dois grupos', () => {
        const cc13 = { id: 'cc13', name: '013 — Bella Vista' };
        const cc34 = { id: 'cc34', name: '034 — Bella Vista' };
        const itens: C[] = [{ id: 'a', ccs: [cc34, cc13] }, { id: 'b', ccs: [cc13, cc34] }, { id: 'c', ccs: [cc13] }, { id: 'd' }];
        const g = agruparCondominios(itens, 'centro-custo', 'asc', leitor);
        expect(rotulos(g)).toEqual(['013 — Bella Vista:1', '013 — Bella Vista, 034 — Bella Vista:2', 'Sem centro de custo:1']);
        expect(g.reduce((s, x) => s + x.itens.length, 0)).toBe(itens.length);
    });
});
