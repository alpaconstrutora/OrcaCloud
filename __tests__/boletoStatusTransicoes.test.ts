/**
 * Campo Status da página do boleto (23/10/2026 —
 * docs/planos/2026-10-23-boleto-status-editavel.md, item 1).
 *
 * Decisão do usuário: o campo segue o FLUXO, não troca rótulo. Cada status só
 * oferece as mudanças que existem a partir dele, e cada uma diz o que faz no
 * financeiro — é essa frase que a tela mostra antes de confirmar.
 */
import { describe, expect, it } from 'vitest';
import { transicoesDoBoleto, MOTIVO_STATUS_PROGRAMADO, motivoSemTransicao } from '../utils/boletoStatus';

const para = (status: Parameters<typeof transicoesDoBoleto>[0], temLancamento = false) =>
    transicoesDoBoleto(status, temLancamento).map(t => `${t.para}:${t.efeito}`);

describe('transicoesDoBoleto', () => {
    it('rascunho e revisão trocam entre si sem efeito, aprovam ou cancelam', () => {
        expect(para('rascunho')).toEqual(['revisao:rotulo', 'aprovado:aprovar', 'cancelado:cancelar']);
        expect(para('revisao')).toEqual(['rascunho:rotulo', 'aprovado:aprovar', 'cancelado:cancelar']);
    });

    it('aprovado: dá baixa, volta a rascunho estornando, ou cancela', () => {
        expect(para('aprovado', true)).toEqual(['pago:pagar', 'rascunho:estornar', 'cancelado:cancelar']);
    });

    it('pago só volta a rascunho (estorno); cancelado só reabre', () => {
        expect(para('pago', true)).toEqual(['rascunho:estornar']);
        expect(para('cancelado', true)).toEqual(['rascunho:estornar']);
        expect(para('cancelado', false)).toEqual(['rascunho:estornar']);
    });

    it('programado não muda pela tela — a Asaas é quem move — e diz por quê', () => {
        expect(transicoesDoBoleto('programado', true)).toEqual([]);
        expect(motivoSemTransicao('programado')).toBe(MOTIVO_STATUS_PROGRAMADO);
        expect(motivoSemTransicao('aprovado')).toBeNull();
    });

    it('a frase diz o que acontece no financeiro, e muda quando não há lançamento', () => {
        const [, estorno, cancelar] = transicoesDoBoleto('aprovado', true);
        expect(estorno.descricao).toMatch(/título e a nota/);
        expect(cancelar.descricao).toMatch(/título.*cancelad/i);
        const [reabrirSemLancamento] = transicoesDoBoleto('cancelado', false);
        expect(reabrirSemLancamento.descricao).toMatch(/nada muda no financeiro/i);
        const [, , cancelarRascunho] = transicoesDoBoleto('rascunho', false);
        expect(cancelarRascunho.descricao).not.toMatch(/título/i);
        expect(transicoesDoBoleto('revisao', false)[0].descricao).toMatch(/nada muda no financeiro/i);
    });

    it('só o que mexe no financeiro pede confirmação (rascunho ↔ revisão aplica na hora)', () => {
        const confirma = (s: Parameters<typeof transicoesDoBoleto>[0]) => transicoesDoBoleto(s, true).map(t => t.confirmar);
        expect(confirma('rascunho')).toEqual([false, true, true]);
        expect(confirma('aprovado')).toEqual([true, true, true]);
    });
});
