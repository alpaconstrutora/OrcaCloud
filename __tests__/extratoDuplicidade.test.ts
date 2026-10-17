import { describe, it, expect } from 'vitest';
import { chaveDoMovimento, separarGemeasDeOutroFormato, type LinhaDeExtrato } from '../utils/extratoDuplicidade';

const l = (data: string, valor: number, dir: string, fp: string, id: string | null = null): LinhaDeExtrato =>
    ({ transaction_date: data, amount: valor, direction: dir, fingerprint: fp, external_id: id });

describe('chaveDoMovimento', () => {
    it('ignora a descrição e o sinal do valor', () => {
        expect(chaveDoMovimento(l('2024-03-12', 600, 'DEBIT', 'a'))).toBe('2024-03-12|600.00|DEBIT');
        expect(chaveDoMovimento(l('2024-03-12T00:00:00', -600, 'DEBIT', 'b'))).toBe('2024-03-12|600.00|DEBIT');
    });
});

describe('separarGemeasDeOutroFormato', () => {
    it('o caso real: o mesmo PIX já gravado pelo OFX volta pela planilha e é recusado', () => {
        const noBanco = [l('2024-03-12', 600, 'DEBIT', 'fp-ofx', '13247103932')];
        const planilha = [l('2024-03-12', 600, 'DEBIT', 'fp-planilha')];
        const r = separarGemeasDeOutroFormato([planilha], noBanco);
        expect(r.novas).toHaveLength(0);
        expect(r.gemeas).toEqual(planilha);
    });

    it('dois movimentos iguais no mesmo dia com só um no banco: entra exatamente um', () => {
        const noBanco = [l('2024-04-26', 150, 'DEBIT', 'fp-ofx-1', '1')];
        const planilha = [l('2024-04-26', 150, 'DEBIT', 'p1'), l('2024-04-26', 150, 'DEBIT', 'p2')];
        const r = separarGemeasDeOutroFormato([planilha], noBanco);
        expect(r.novas).toHaveLength(1);
        expect(r.gemeas).toHaveLength(1);
    });

    it('mesmo arquivo de novo: tudo já existia pelo fingerprint, nada é gêmea', () => {
        const noBanco = [l('2024-01-02', 10, 'CREDIT', 'x'), l('2024-01-02', 10, 'CREDIT', 'y')];
        const r = separarGemeasDeOutroFormato([[l('2024-01-02', 10, 'CREDIT', 'x'), l('2024-01-02', 10, 'CREDIT', 'y')]], noBanco);
        expect(r.novas).toHaveLength(0);
        expect(r.jaExistiam).toHaveLength(2);
        expect(r.gemeas).toHaveLength(0);
    });

    it('mesmo id do banco com descrição diferente (parser antigo × novo) conta como já existente', () => {
        const noBanco = [l('2024-05-10', 600, 'DEBIT', 'fp-antigo', '13831410766')];
        const r = separarGemeasDeOutroFormato([[l('2024-05-10', 600, 'DEBIT', 'fp-novo', '13831410766')]], noBanco);
        expect(r.novas).toHaveLength(0);
        expect(r.jaExistiam).toHaveLength(1);
    });

    it('período novo entra inteiro, inclusive repetições reais do mesmo dia', () => {
        const arquivo = [l('2026-10-01', 150, 'DEBIT', 'a'), l('2026-10-01', 150, 'DEBIT', 'b'), l('2026-10-02', 99.9, 'CREDIT', 'c')];
        const r = separarGemeasDeOutroFormato([arquivo], []);
        expect(r.novas).toEqual(arquivo);
        expect(r.gemeas).toHaveLength(0);
    });

    it('OFX e planilha do mesmo período no MESMO envio: entra o maior de um arquivo, preferindo o que tem id', () => {
        const ofx = [l('2024-02-01', 750, 'DEBIT', 'o1', 'F1'), l('2024-02-01', 600, 'DEBIT', 'o2', 'F2')];
        const planilha = [l('2024-02-01', 750, 'DEBIT', 'p1'), l('2024-02-01', 600, 'DEBIT', 'p2')];
        const r = separarGemeasDeOutroFormato([planilha, ofx], []);
        expect(r.novas.map(n => n.fingerprint).sort()).toEqual(['o1', 'o2']);
        expect(r.gemeas.map(n => n.fingerprint).sort()).toEqual(['p1', 'p2']);
    });

    it('o mesmo fingerprint em dois arquivos do lote vira uma linha só', () => {
        const a = l('2024-06-01', 5, 'DEBIT', 'igual');
        const b = l('2024-06-01', 5, 'DEBIT', 'igual');
        const r = separarGemeasDeOutroFormato([[a], [b]], []);
        expect(r.novas).toHaveLength(1);
        expect(r.jaExistiam).toHaveLength(1);
    });

    it('direção e valor diferentes não são gêmeas', () => {
        const noBanco = [l('2024-03-12', 600, 'DEBIT', 'd')];
        const r = separarGemeasDeOutroFormato([[l('2024-03-12', 600, 'CREDIT', 'c'), l('2024-03-12', 600.01, 'DEBIT', 'e')]], noBanco);
        expect(r.novas).toHaveLength(2);
    });
});
