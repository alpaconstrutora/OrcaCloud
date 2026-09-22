import { describe, it, expect } from 'vitest';
import {
    obrasDoEmpreendimento,
    empreendimentosComObra,
    obraAoTrocarEmpreendimento,
    motivoSalvarBloqueado,
    type EmpreendimentoPorObra,
} from '../utils/pedidoObra';

const OBRAS = [
    { id: 'obra-a', name: 'Residencial A' },
    { id: 'obra-b', name: 'Torre B1' },
    { id: 'obra-c', name: 'Torre B2' },
    { id: 'obra-solta', name: 'Obra sem empreendimento' },
];

const MAPA: EmpreendimentoPorObra = {
    'obra-a': { id: 'emp-1', name: 'Empreendimento 1' },
    'obra-b': { id: 'emp-2', name: 'Empreendimento 2', towerName: 'Torre 1' },
    'obra-c': { id: 'emp-2', name: 'Empreendimento 2', towerName: 'Torre 2' },
};

describe('obrasDoEmpreendimento', () => {
    it('sem empreendimento escolhido, oferece todas as obras', () => {
        expect(obrasDoEmpreendimento(OBRAS, '', MAPA)).toHaveLength(4);
    });

    it('recorta pelas obras do empreendimento, torres inclusive', () => {
        expect(obrasDoEmpreendimento(OBRAS, 'emp-2', MAPA).map(o => o.id)).toEqual(['obra-b', 'obra-c']);
    });

    it('empreendimento sem obra devolve lista vazia', () => {
        expect(obrasDoEmpreendimento(OBRAS, 'emp-sem-obra', MAPA)).toEqual([]);
    });
});

describe('empreendimentosComObra', () => {
    it('lista só os que têm obra para escolher', () => {
        const comObra = empreendimentosComObra(OBRAS, MAPA);
        expect([...comObra].sort()).toEqual(['emp-1', 'emp-2']);
        expect(comObra.has('emp-sem-obra')).toBe(false);
    });
});

describe('obraAoTrocarEmpreendimento', () => {
    it('BUG 22/09/2026: trocar de empreendimento não pode deixar o pedido sem obra quando há uma só', () => {
        // Era aqui que o pedido perdia a obra e o "Salvar alterações" desligava
        // sem dizer nada.
        expect(obraAoTrocarEmpreendimento('obra-a', 'emp-2', [OBRAS[0], OBRAS[1]], MAPA)).toBe('obra-b');
    });

    it('"Todos os empreendimentos" é só filtro — não mexe na obra', () => {
        expect(obraAoTrocarEmpreendimento('obra-a', '', OBRAS, MAPA)).toBe('obra-a');
    });

    it('mantém a obra quando ela já é do empreendimento escolhido', () => {
        expect(obraAoTrocarEmpreendimento('obra-b', 'emp-2', OBRAS, MAPA)).toBe('obra-b');
    });

    it('com mais de uma obra, exige escolha explícita', () => {
        expect(obraAoTrocarEmpreendimento('obra-a', 'emp-2', OBRAS, MAPA)).toBe('');
    });

    it('empreendimento sem obra nenhuma preserva a obra atual', () => {
        expect(obraAoTrocarEmpreendimento('obra-a', 'emp-sem-obra', OBRAS, MAPA)).toBe('obra-a');
    });

    it('pedido ainda sem obra continua sem obra quando não há candidata única', () => {
        expect(obraAoTrocarEmpreendimento('', 'emp-2', OBRAS, MAPA)).toBe('');
        expect(obraAoTrocarEmpreendimento('', 'emp-1', OBRAS, MAPA)).toBe('obra-a');
    });
});

describe('motivoSalvarBloqueado', () => {
    const completo = { fornecedorId: 'f1', obraId: 'obra-a', itensSelecionados: 2, itensAvulsos: 0 };

    it('pedido completo pode salvar', () => {
        expect(motivoSalvarBloqueado(completo)).toBeNull();
    });

    it('item avulso sozinho já basta', () => {
        expect(motivoSalvarBloqueado({ ...completo, itensSelecionados: 0, itensAvulsos: 1 })).toBeNull();
    });

    it('diz qual é a única coisa que falta', () => {
        expect(motivoSalvarBloqueado({ ...completo, obraId: '' })).toBe('Falta escolher a obra.');
        expect(motivoSalvarBloqueado({ ...completo, fornecedorId: '' })).toBe('Falta escolher o fornecedor.');
        expect(motivoSalvarBloqueado({ ...completo, itensSelecionados: 0 }))
            .toBe('Falta escolher pelo menos um item.');
    });

    it('enumera quando falta mais de uma', () => {
        expect(motivoSalvarBloqueado({ fornecedorId: '', obraId: '', itensSelecionados: 0, itensAvulsos: 0 }))
            .toBe('Falta escolher o fornecedor, a obra e pelo menos um item.');
    });
});
