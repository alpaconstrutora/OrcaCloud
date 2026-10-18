import { describe, it, expect } from 'vitest';
import { decidirLinhaManual, colunasParaGravar, COLUNAS_DA_LINHA } from '../utils/boletoLinhaManual';

const base = { valorBoleto: 61.65, valorDaLinha: 61.65, errosDaLinha: [] as string[] };

describe('decidirLinhaManual', () => {
    it('rascunho e revisão: a linha completa o boleto', () => {
        expect(decidirLinhaManual({ ...base, status: 'rascunho' })).toEqual({ modo: 'completar' });
        expect(decidirLinhaManual({ ...base, status: 'revisao', valorBoleto: null })).toEqual({ modo: 'completar' });
    });

    it('aprovado com o mesmo valor: só as colunas da linha', () => {
        expect(decidirLinhaManual({ ...base, status: 'aprovado' })).toEqual({ modo: 'so_linha' });
    });

    it('aprovado com valor diferente: recusa (seria pagar outra conta)', () => {
        const d = decidirLinhaManual({ ...base, status: 'aprovado', valorDaLinha: 99.9 });
        expect('recusa' in d && d.recusa).toMatch(/R\$\s?99,90.*R\$\s?61,65/);
    });

    it('aprovado com linha sem valor embutido: aceita só a linha', () => {
        expect(decidirLinhaManual({ ...base, status: 'aprovado', valorDaLinha: undefined })).toEqual({ modo: 'so_linha' });
    });

    it('programado, pago e cancelado: recusa', () => {
        for (const status of ['programado', 'pago', 'cancelado'] as const) {
            expect('recusa' in decidirLinhaManual({ ...base, status })).toBe(true);
        }
    });

    it('DV errado: recusa com o motivo', () => {
        const d = decidirLinhaManual({ ...base, status: 'rascunho', errosDaLinha: ['DV segmento 2 inválido'] });
        expect(d).toEqual({ recusa: 'Linha digitável inválida: DV segmento 2 inválido.' });
    });
});

describe('colunasParaGravar', () => {
    const colunas = {
        linha_digitavel: '8365', codigo_barras: '8365', banco_codigo: null, banco_nome: null,
        metodo_extracao: 'manual', confidence_score: 90, engine_versao: 'x', extracao_em: 't',
        checksum_valido: true, erros_validacao: null,
        valor: 61.65, vencimento: null, beneficiario_nome: null, beneficiario_cnpj: null,
        multa: null, extracao_raw: { linhaDigitavel: '8365' },
    };

    it('so_linha: nada além das colunas da linha', () => {
        expect(Object.keys(colunasParaGravar(colunas, { modo: 'so_linha' })).sort()).toEqual([...COLUNAS_DA_LINHA].sort());
    });

    it('completar: traz o valor, mas não apaga beneficiário/multa nem regrava o raw', () => {
        const g = colunasParaGravar(colunas, { modo: 'completar' });
        expect(g.valor).toBe(61.65);
        expect('beneficiario_nome' in g).toBe(false);
        expect('multa' in g).toBe(false);
        expect('vencimento' in g).toBe(false);
        expect('extracao_raw' in g).toBe(false);
    });
});
