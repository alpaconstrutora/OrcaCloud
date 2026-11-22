import { describe, expect, it } from 'vitest';
import { agruparSugestoes, estaVencido, type DocumentoSugerido, type OrigemSugestao } from '../utils/creditRoomSugestoes';

const doc = (id: string, origem: OrigemSugestao, extra: Partial<DocumentoSugerido> = {}): DocumentoSugerido => ({
    documentId: id,
    nome: `Doc ${id}`,
    categoria: 'juridico',
    tipoDocumento: 'contrato',
    organizationId: 'org-1',
    dataValidade: null,
    origem,
    referencia: 'ref',
    vencido: false,
    jaCompartilhado: false,
    ...extra,
});

describe('agruparSugestoes', () => {
    it('ordena os grupos CONTRATO, EMPREENDIMENTO, OBRA, CLIENTE', () => {
        const g = agruparSugestoes([
            doc('d', 'CLIENTE'), doc('c', 'OBRA'), doc('b', 'EMPREENDIMENTO'), doc('a', 'CONTRATO'),
        ]);
        expect(g.map(x => x.origem)).toEqual(['CONTRATO', 'EMPREENDIMENTO', 'OBRA', 'CLIENTE']);
    });

    it('omite grupo sem itens', () => {
        const g = agruparSugestoes([doc('a', 'OBRA')]);
        expect(g.map(x => x.origem)).toEqual(['OBRA']);
        expect(agruparSugestoes([])).toEqual([]);
    });

    it('CLIENTE vem desmarcado e com aviso de dados pessoais (LGPD); os demais marcados', () => {
        const g = agruparSugestoes([
            doc('a', 'CONTRATO'), doc('b', 'EMPREENDIMENTO'), doc('c', 'OBRA'), doc('d', 'CLIENTE'),
        ]);
        const porOrigem = Object.fromEntries(g.map(x => [x.origem, x]));
        expect(porOrigem.CLIENTE.marcadoPorPadrao).toBe(false);
        expect(porOrigem.CLIENTE.aviso).toMatch(/dados pessoais/i);
        expect(porOrigem.CLIENTE.aviso).toMatch(/LGPD/);
        for (const o of ['CONTRATO', 'EMPREENDIMENTO', 'OBRA'] as const) {
            expect(porOrigem[o].marcadoPorPadrao).toBe(true);
            expect(porOrigem[o].aviso).toBeUndefined();
        }
    });

    it('documento em mais de uma origem aparece UMA vez, na primeira origem da ordem', () => {
        const g = agruparSugestoes([
            doc('x', 'CLIENTE'), doc('x', 'OBRA'), doc('x', 'CONTRATO'), doc('y', 'CLIENTE'),
        ]);
        const ids = (o: OrigemSugestao) => g.find(x => x.origem === o)?.itens.map(i => i.documentId);
        expect(ids('CONTRATO')).toEqual(['x']);
        expect(ids('OBRA')).toBeUndefined();
        expect(ids('CLIENTE')).toEqual(['y']);
        expect(g.flatMap(x => x.itens).filter(i => i.documentId === 'x')).toHaveLength(1);
    });

    it('jaCompartilhado continua listado e o grupo segue marcado por padrão (a tela decide não marcar o item)', () => {
        const g = agruparSugestoes([doc('a', 'CONTRATO', { jaCompartilhado: true })]);
        expect(g[0].itens[0].jaCompartilhado).toBe(true);
        expect(g[0].marcadoPorPadrao).toBe(true);
    });

    it('vencido continua listado com vencido: true', () => {
        const g = agruparSugestoes([doc('a', 'EMPREENDIMENTO', { vencido: true, dataValidade: '2020-01-01' })]);
        expect(g[0].itens).toHaveLength(1);
        expect(g[0].itens[0].vencido).toBe(true);
    });

    it('mantém a ordem de entrada dentro do grupo', () => {
        const g = agruparSugestoes([doc('b', 'OBRA'), doc('a', 'OBRA')]);
        expect(g[0].itens.map(i => i.documentId)).toEqual(['b', 'a']);
    });
});

describe('estaVencido', () => {
    it('compara a validade com "hoje" local, sem Date', () => {
        expect(estaVencido('2026-11-21', '2026-11-22')).toBe(true);
        expect(estaVencido('2026-11-22', '2026-11-22')).toBe(false);
        expect(estaVencido('2026-12-01', '2026-11-22')).toBe(false);
    });
    it('sem validade (ou inválida) não é vencido — dado ausente não é vencido', () => {
        expect(estaVencido(null, '2026-11-22')).toBe(false);
        expect(estaVencido(undefined, '2026-11-22')).toBe(false);
        expect(estaVencido('', '2026-11-22')).toBe(false);
        expect(estaVencido('lixo', '2026-11-22')).toBe(false);
    });
});
