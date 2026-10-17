import { describe, it, expect } from 'vitest';
import { colaboradorDoTituloDaFolha, favorecidoDoTitulo } from '../utils/pixDestino';

// reference_id reais da folha (17/10/2026, títulos abertos).
const FOLHA = '728260c9-5cd4-497b-ae3d-1bc0a6300ff8';
const COLAB = '20adaea1-a393-4d1b-91fa-3b37dbb0ead6';
const OBRA = 'bde85723-9e46-4123-bb82-0a16c7c02f27';

describe('colaboradorDoTituloDaFolha', () => {
    it('rubrica individualizada', () => {
        expect(colaboradorDoTituloDaFolha(`labor-${FOLHA}-indiv-ADIANTAMENTO-${COLAB}`)).toBe(COLAB);
        expect(colaboradorDoTituloDaFolha(`labor-${FOLHA}-indiv-ADIANTAMENTO-${COLAB}-cls-d6aacdaf-d3e7-4035-9f62-75f7680748fe-9dfda3`)).toBe(COLAB);
    });
    it('folha por colaborador (obra + colaborador)', () => {
        expect(colaboradorDoTituloDaFolha(`labor-${FOLHA}-${OBRA}-${COLAB}-salario-cls-d6aacdaf`)).toBe(COLAB);
    });
    it('agrupados não têm colaborador', () => {
        expect(colaboradorDoTituloDaFolha(`labor-${FOLHA}-unallocated-salario`)).toBeNull();
        expect(colaboradorDoTituloDaFolha(`labor-${FOLHA}-${OBRA}-salario`)).toBeNull();
        expect(colaboradorDoTituloDaFolha(`labor-${FOLHA}-${OBRA}-terceiros-INSS`)).toBeNull();
        expect(colaboradorDoTituloDaFolha(null)).toBeNull();
    });
});

describe('favorecidoDoTitulo', () => {
    it('fornecedor por supplier_id, venha de onde vier', () => {
        expect(favorecidoDoTitulo({ source_system: 'BOLETO', supplier_id: 's1' })).toEqual({ origem: 'fornecedor', id: 's1', motivo: null });
        expect(favorecidoDoTitulo({ source_system: 'CONTRACT_RECURRING', party_type: 'SUPPLIER', supplier_id: 's2' }).origem).toBe('fornecedor');
    });
    it('colaborador pelo reference_id da folha', () => {
        expect(favorecidoDoTitulo({ source_system: 'LABOR', party_type: 'EMPLOYEE', reference_id: `labor-${FOLHA}-indiv-ADIANTAMENTO-${COLAB}` }))
            .toEqual({ origem: 'colaborador', id: COLAB, motivo: null });
    });
    it('folha agrupada cai em avulso com o motivo', () => {
        const f = favorecidoDoTitulo({ source_system: 'LABOR', party_type: 'EMPLOYEE', reference_id: `labor-${FOLHA}-unallocated-salario` });
        expect(f.origem).toBe('avulso');
        expect(f.motivo).toMatch(/AGRUPADO/);
    });
    it('pró-labore líquido aponta para o item da folha societária', () => {
        expect(favorecidoDoTitulo({ source_system: 'PROLABORE', reference_id: '363AA981-EEEC-42F3-8731-5EE70CDF19B5' }))
            .toEqual({ origem: 'socio', id: '363aa981-eeec-42f3-8731-5ee70cdf19b5', motivo: null });
    });
    it('o resto é avulso', () => {
        expect(favorecidoDoTitulo({ source_system: 'COMMERCIAL', party_type: 'TAX' }).origem).toBe('avulso');
        expect(favorecidoDoTitulo({ source_system: 'PROJECT' }).motivo).toMatch(/digite/);
    });
});
