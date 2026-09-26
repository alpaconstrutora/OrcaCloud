import { describe, it, expect } from 'vitest';
import { hojeLocal, motivoBaixaBloqueada, mensagemResultadoBaixa, FORMAS_PAGAMENTO } from '../utils/baixaRecebivel';

describe('hojeLocal', () => {
    it('usa o dia LOCAL, não o UTC', () => {
        // 23h30 local: toISOString() já daria o dia seguinte em UTC-3.
        expect(hojeLocal(new Date(2026, 8, 26, 23, 30))).toBe('2026-09-26');
        expect(hojeLocal(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
    });
});

describe('motivoBaixaBloqueada — todo bloqueio diz o porquê', () => {
    const HOJE = '2026-09-26';
    it('sem data, data inválida e data futura têm frase própria', () => {
        expect(motivoBaixaBloqueada('', HOJE)).toBe('Informe a data do pagamento.');
        expect(motivoBaixaBloqueada('26/09/2026', HOJE)).toBe('Data do pagamento inválida.');
        expect(motivoBaixaBloqueada('2026-09-27', HOJE)).toBe('A data do pagamento não pode ser futura.');
    });
    it('hoje e passado liberam', () => {
        expect(motivoBaixaBloqueada(HOJE, HOJE)).toBeNull();
        expect(motivoBaixaBloqueada('2025-12-31', HOJE)).toBeNull();
    });
});

describe('mensagemResultadoBaixa', () => {
    const base = { baixados: 0, falhasBaixa: [], emitirRecibo: true, recibos: 0, falhasRecibo: [], naoGuardados: 0 };

    it('1 título com recibo', () => {
        expect(mensagemResultadoBaixa({ ...base, baixados: 1, recibos: 1 }))
            .toEqual({ texto: '1 título baixado · 1 recibo emitido.', erro: false });
    });

    it('sem recibo não fala de recibo', () => {
        expect(mensagemResultadoBaixa({ ...base, emitirRecibo: false, baixados: 3 }).texto).toBe('3 títulos baixados.');
    });

    it('baixa ok e recibo falhou: é erro, nomeia o título e aponta o caminho', () => {
        const m = mensagemResultadoBaixa({ ...base, baixados: 2, recibos: 1, falhasRecibo: ['Fulano'] });
        expect(m.erro).toBe(true);
        expect(m.texto).toContain('recibo não gerado para Fulano — use o botão Recibo na linha');
    });

    it('falha de baixa no lote lista os nomes', () => {
        const m = mensagemResultadoBaixa({ ...base, baixados: 1, recibos: 1, falhasBaixa: ['A', 'B'] });
        expect(m).toEqual({ texto: '1 título baixado · 1 recibo emitido · baixa falhou em 2: A, B.', erro: true });
    });

    it('PDF não guardado não é erro, mas avisa', () => {
        const m = mensagemResultadoBaixa({ ...base, baixados: 1, recibos: 1, naoGuardados: 1 });
        expect(m.erro).toBe(false);
        expect(m.texto).toContain('não ficou guardado');
    });
});

describe('FORMAS_PAGAMENTO', () => {
    it('as 6 formas do vocabulário de internal_transactions.payment_type', () => {
        expect(FORMAS_PAGAMENTO.map(f => f.value)).toEqual(['PIX', 'TED', 'DOC', 'DINHEIRO', 'CHEQUE', 'PERMUTA']);
    });
});
