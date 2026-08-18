import { describe, expect, it } from 'vitest';
import { formatDocumentNumber, buildScopeKey, variablesInUse } from '../services/documentNumbering/format';
import { NumberingConfig } from '../services/documentNumbering/types';

/**
 * `formatDocumentNumber` é a função pura que monta o número final a partir da
 * máscara configurável em Configurações do Sistema › Nomenclatura. Espelha
 * `fn_format_document_number` em
 * supabase/migrations/20270912000004_services_numbering_triggers.sql —
 * qualquer mudança de comportamento aqui precisa da mesma mudança lá.
 */
describe('formatDocumentNumber', () => {
    it('reproduz o exemplo do pedido original', () => {
        // { }-{ }-{prefixo}-{Empreendimento}-{Fornecedor}-{Centro de custo}-{seq} = PED-003-004-001
        const config: NumberingConfig = {
            slots: ['EMPTY', 'EMPTY', 'PREFIX', 'EMPREENDIMENTO', 'FORNECEDOR', 'CENTRO_CUSTO'],
            prefix: 'PED',
            separator: '-',
            seqPadding: 3,
        };
        const result = formatDocumentNumber(config, { EMPREENDIMENTO: '003', FORNECEDOR: '004' }, 1);
        expect(result).toBe('PED-003-004-001');
    });

    it('colapsa slots vazios sem separador duplicado', () => {
        const config: NumberingConfig = { slots: ['EMPTY', 'PREFIX', 'EMPTY', 'EMPREENDIMENTO'], prefix: 'PC', separator: '-', seqPadding: 4 };
        expect(formatDocumentNumber(config, { EMPREENDIMENTO: 'RES01' }, 7)).toBe('PC-RES01-0007');
    });

    it('usa o separador configurado (.)', () => {
        const config: NumberingConfig = { slots: ['PREFIX', 'EMPREENDIMENTO', 'OBRA'], prefix: 'PC', separator: '.', seqPadding: 4 };
        expect(formatDocumentNumber(config, { EMPREENDIMENTO: 'RES01', OBRA: 'TR1' }, 1)).toBe('PC.RES01.TR1.0001');
    });

    it('respeita o padding de 1 a 9 dígitos', () => {
        const base: NumberingConfig = { slots: ['PREFIX'], prefix: 'X', separator: '-', seqPadding: 1 };
        expect(formatDocumentNumber(base, {}, 5)).toBe('X-5');
        expect(formatDocumentNumber({ ...base, seqPadding: 6 }, {}, 5)).toBe('X-000005');
    });

    it('prefixo pode ficar em qualquer posição da máscara', () => {
        const config: NumberingConfig = { slots: ['EMPREENDIMENTO', 'PREFIX', 'OBRA'], prefix: 'PC', separator: '-', seqPadding: 4 };
        expect(formatDocumentNumber(config, { EMPREENDIMENTO: 'RES01', OBRA: 'TR1' }, 1)).toBe('RES01-PC-TR1-0001');
    });

    it('máscara sem nenhuma variável gera só prefixo + sequencial (compat com o legado de 3 dígitos)', () => {
        const config: NumberingConfig = { slots: [], prefix: '', separator: '-', seqPadding: 3 };
        expect(formatDocumentNumber(config, {}, 1)).toBe('001');
    });

    it('variável ausente do mapa de valores é omitida, não gera "undefined"', () => {
        const config: NumberingConfig = { slots: ['PREFIX', 'CLIENTE'], prefix: 'CV', separator: '-', seqPadding: 4 };
        expect(formatDocumentNumber(config, {}, 1)).toBe('CV-0001');
    });
});

describe('buildScopeKey', () => {
    it('junta os valores das variáveis na ordem da máscara, ignorando EMPTY/PREFIX', () => {
        const slots: NumberingConfig['slots'] = ['EMPTY', 'PREFIX', 'EMPREENDIMENTO', 'FORNECEDOR'];
        expect(buildScopeKey(slots, { EMPREENDIMENTO: 'RES01', FORNECEDOR: 'FORN003' })).toBe('RES01|FORN003');
    });

    it('máscara sem variáveis dá escopo vazio (contador único do tipo)', () => {
        expect(buildScopeKey(['PREFIX'], {})).toBe('');
    });

    it('máscaras com variáveis diferentes reiniciam o contador em escopos diferentes', () => {
        const slots: NumberingConfig['slots'] = ['PREFIX', 'EMPREENDIMENTO'];
        const escopoA = buildScopeKey(slots, { EMPREENDIMENTO: 'RES01' });
        const escopoB = buildScopeKey(slots, { EMPREENDIMENTO: 'RES02' });
        expect(escopoA).not.toBe(escopoB);
    });
});

describe('variablesInUse', () => {
    it('extrai só os tokens de variável, sem EMPTY/PREFIX', () => {
        expect(variablesInUse(['EMPTY', 'PREFIX', 'EMPREENDIMENTO', 'OBRA'])).toEqual(['EMPREENDIMENTO', 'OBRA']);
    });

    it('máscara só com prefixo não pede nenhuma variável', () => {
        expect(variablesInUse(['PREFIX'])).toEqual([]);
    });
});
