// Aba "Condomínio" do Portal do Cliente — as duas regras puras da tela.
// Plano: docs/planos/2026-09-01-condominio-no-portal-do-cliente.md
//
// Por que só estas duas: o resto da aba é leitura de um payload que a RPC já
// monta. O que erra em SILÊNCIO é o agrupamento (renderiza dois cabeçalhos
// iguais e ninguém repara num print) e a escala da fração — este domínio já
// teve um erro de 100× de verdade, com frações decimais salvas em campo de %.
import { describe, it, expect } from 'vitest';
import {
    agruparPorCondominio, fracaoParaPercentual,
} from '../components/client/CondominioTab';
import type { PortalUnidadeCondominio } from '../services/clientPortalService';

const unidade = (over: Partial<PortalUnidadeCondominio>): PortalUnidadeCondominio => ({
    unitId: 'u1', unidade: 'Sala - 201', torre: 'Torre Única', pavimento: 2,
    tipologia: 'Sala', areaPrivativa: 17.01, fracaoIdeal: 0.0833333,
    fracaoOrigem: 'CONVENCAO', papeis: ['INQUILINO'],
    condominioId: 'c-010', condominioCode: '010',
    condominioNome: '010 - Galeria Altavista', condominioCnpj: null,
    ocupacoes: [], ...over,
});

describe('agruparPorCondominio', () => {
    it('junta as 3 unidades da Defensoria num condomínio só', () => {
        // O caso real: Defensoria Pública de MG ocupa Salas 201, 202 e 203 da
        // Galeria Altavista. Tem de sair UM cabeçalho com três unidades.
        const g = agruparPorCondominio([
            unidade({ unitId: 'u1', unidade: 'Sala - 201' }),
            unidade({ unitId: 'u2', unidade: 'Sala - 202' }),
            unidade({ unitId: 'u3', unidade: 'Sala - 203' }),
        ]);
        expect(g).toHaveLength(1);
        expect(g[0].nome).toBe('010 - Galeria Altavista');
        expect(g[0].unidades.map(u => u.unidade)).toEqual(['Sala - 201', 'Sala - 202', 'Sala - 203']);
    });

    it('separa condomínios diferentes e preserva a ordem de chegada', () => {
        const g = agruparPorCondominio([
            unidade({ unitId: 'a', condominioId: 'c-007', condominioNome: '007 - Bella Vista' }),
            unidade({ unitId: 'b', condominioId: 'c-010' }),
            unidade({ unitId: 'c', condominioId: 'c-007', condominioNome: '007 - Bella Vista' }),
        ]);
        expect(g.map(x => x.nome)).toEqual(['007 - Bella Vista', '010 - Galeria Altavista']);
        expect(g[0].unidades).toHaveLength(2);
        expect(g[1].unidades).toHaveLength(1);
    });

    it('agrupa pelo ID, não pelo nome — dois prédios podem se chamar igual', () => {
        const g = agruparPorCondominio([
            unidade({ unitId: 'a', condominioId: 'c-1', condominioNome: 'Residencial Central' }),
            unidade({ unitId: 'b', condominioId: 'c-2', condominioNome: 'Residencial Central' }),
        ]);
        expect(g).toHaveLength(2);
        expect(g.map(x => x.id)).toEqual(['c-1', 'c-2']);
    });

    it('devolve lista vazia sem unidades (é o estado vazio da aba)', () => {
        expect(agruparPorCondominio([])).toEqual([]);
    });

    it('não perde os papéis somados da mesma unidade', () => {
        // A RPC devolve UMA linha por unidade com os papéis agregados: a mesma
        // pessoa costuma ser inquilina E responsável financeira da mesma sala.
        const g = agruparPorCondominio([
            unidade({ papeis: ['INQUILINO', 'RESPONSAVEL_FINANCEIRO'] }),
        ]);
        expect(g[0].unidades[0].papeis).toEqual(['INQUILINO', 'RESPONSAVEL_FINANCEIRO']);
    });
});

describe('fracaoParaPercentual', () => {
    it('converte decimal em porcentagem com 4 casas', () => {
        // 1/12 do prédio. Truncar para 2 casas faria 12 unidades somarem
        // 99,96% e alguém procurar o erro que não existe.
        expect(fracaoParaPercentual(0.0833333)).toBe('8,3333%');
        expect(fracaoParaPercentual(0.25)).toBe('25,0000%');
    });

    it('não confunde decimal com percentual já convertido', () => {
        // A armadilha de 100× deste domínio: 8,3333 no banco significaria 833%.
        // A função não "conserta" — mostra o que está gravado, para o erro ficar
        // visível em vez de ser mascarado na exibição.
        expect(fracaoParaPercentual(8.3333)).toBe('833,3300%');
    });

    it('trata ausência sem quebrar', () => {
        expect(fracaoParaPercentual(null)).toBe('—');
        expect(fracaoParaPercentual(undefined)).toBe('—');
    });

    it('zero é zero, não é ausência', () => {
        expect(fracaoParaPercentual(0)).toBe('0,0000%');
    });
});
