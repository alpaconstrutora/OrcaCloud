import { describe, it, expect } from 'vitest';
import { dataCurta, dataPorExtenso, hojeIso, localEData, partesDaData } from '../services/docGen/dataExtenso';
import { chavesNoTexto, chavesPendentes, substituirVariaveis } from '../services/docGen/variaveis';

describe('docGen · data por extenso', () => {
    it('lê YYYY-MM-DD pelo texto, sem passar por Date (fuso não mexe no dia)', () => {
        expect(partesDaData('2026-10-07')).toEqual({ dia: 7, mes: 10, ano: 2026 });
        expect(partesDaData('2026-10-07T03:00:00.000Z')).toEqual({ dia: 7, mes: 10, ano: 2026 });
        expect(partesDaData('07/10/2026')).toBeNull();
        expect(partesDaData('')).toBeNull();
        expect(partesDaData(null)).toBeNull();
    });

    it('formata curta e por extenso', () => {
        expect(dataCurta('2026-10-07')).toBe('07/10/2026');
        expect(dataPorExtenso('2026-10-07')).toBe('7 de outubro de 2026');
        expect(dataPorExtenso('2026-03-01')).toBe('1 de março de 2026');
        expect(dataPorExtenso(new Date(2026, 0, 15))).toBe('15 de janeiro de 2026');
    });

    it('local e data: com cidade e sem cidade', () => {
        expect(localEData('Cambuí', '2026-10-07')).toBe('Cambuí, 7 de outubro de 2026');
        expect(localEData('', '2026-10-07')).toBe('7 de outubro de 2026');
        expect(localEData('Cambuí', null)).toBe('');
    });

    it('hojeIso usa o horário local', () => {
        expect(hojeIso(new Date(2026, 9, 7, 23, 30))).toBe('2026-10-07');
    });
});

describe('docGen · variáveis em texto', () => {
    it('acha as chaves {{a.b}} sem repetir e na ordem', () => {
        expect(chavesNoTexto('{{empresa.razao_social}} — {{ empresa.cidade }} / {{empresa.razao_social}}'))
            .toEqual(['empresa.razao_social', 'empresa.cidade']);
        expect(chavesNoTexto('sem variável')).toEqual([]);
        expect(chavesNoTexto('{{semponto}}')).toEqual([]);
    });

    it('substitui e marca o que falta como [[chave]]', () => {
        const r = substituirVariaveis('{{empresa.razao_social}} · {{empresa.site}}', { 'empresa.razao_social': 'ALPA', 'empresa.site': '' });
        expect(r).toBe('ALPA · [[empresa.site]]');
    });

    it('lista as pendentes', () => {
        expect(chavesPendentes(['a.b', 'c.d', 'e.f'], { 'a.b': 'x', 'c.d': '  ' })).toEqual(['c.d', 'e.f']);
    });
});
