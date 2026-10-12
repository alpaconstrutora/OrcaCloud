import { describe, it, expect } from 'vitest';
import { montarEspelho, planejarRegeneracao } from '../utils/imovibEspelho';

/** Item 4.4 do plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md. */

const estudo = (unidades: any[]): any => ({
    id: 'est1',
    blocks: [{ id: 'b1', name: 'Torre A', units: unidades }],
});
const tipo = (over = {}) => ({ id: 'tA', name: 'Apto', quantity: 2, pavimentos: 2, private_area: 70, common_area: 10, ...over });
const inst = (name: string, over = {}) => ({
    id: `i-${name}`, study_id: 'est1', block_id: 'b1', unit_id: 'tA', name, floor: Number(name.split(' ')[1][0]),
    private_area: 70, position_type: 'FRENTE', sun_orientation: 'LESTE', price: 500_000, status: 'VENDIDO', created_at: '', updated_at: '', ...over,
});

describe('montarEspelho', () => {
    it('gera quantidade × pavimentos por tipologia vendável, com nome tipologia+pavimento+letra', () => {
        const e = montarEspelho(estudo([tipo(), tipo({ id: 'tC', name: 'Salão', is_vendavel: false })]));
        expect(e.map(x => x.name)).toEqual(['Apto 1A', 'Apto 1B', 'Apto 2A', 'Apto 2B']);
    });
});

describe('planejarRegeneracao — não perde preço, status nem ID', () => {
    const atuais = ['Apto 1A', 'Apto 1B', 'Apto 2A', 'Apto 2B'].map(n => inst(n));

    it('espelho igual às tipologias: nada a criar, atualizar ou remover', () => {
        const p = planejarRegeneracao(estudo([tipo()]), atuais as any);
        expect(p).toMatchObject({ criar: [], atualizar: [], sobrando: [], mantidas: 4 });
    });

    it('tipologia ganhou um pavimento: cria só as novas; as existentes ficam (com preço e status)', () => {
        const p = planejarRegeneracao(estudo([tipo({ pavimentos: 3 })]), atuais as any);
        expect(p.criar.map(x => x.name)).toEqual(['Apto 3A', 'Apto 3B']);
        expect(p.mantidas).toBe(4);
        expect(p.sobrando).toEqual([]);
    });

    it('área da tipologia mudou: atualiza só a área, sem tocar preço/status/posição', () => {
        const p = planejarRegeneracao(estudo([tipo({ private_area: 75 })]), atuais as any);
        expect(p.atualizar).toHaveLength(4);
        expect(p.atualizar[0]).toEqual({ id: 'i-Apto 1A', campos: { private_area: 75 } });
    });

    it('tipologia perdeu unidades: as que sobram vão para confirmação, não somem', () => {
        const p = planejarRegeneracao(estudo([tipo({ quantity: 1 })]), atuais as any);
        expect(p.sobrando.map(x => x.name)).toEqual(['Apto 1B', 'Apto 2B']);
        expect(p.criar).toEqual([]);
    });
});
