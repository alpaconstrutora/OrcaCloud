/**
 * Boletos a Pagar — pedidos de 13/11/2026 (docs/planos/2026-11-13-boletos-a-pagar-dez-pedidos.md).
 *
 * Item 10: "Ao excluir um boleto o app está cancelando." O banco apagava certo; a TELA avisava a
 * lista com `onSaved({ ...boleto, status: 'cancelado' })` e a linha ficava como Cancelado.
 * Excluir e cancelar são coisas diferentes — o formulário agora chama `onExcluido` e a lista
 * remove a linha.
 *
 * Item 3: o lote descartava imagem calado e travava sem organização (ver o plano).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aceitoNoLote } from '../utils/boletoArquivoAceito';

const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8');

/** O corpo de uma função `async function nome(` até a próxima `async function`/`function` do mesmo nível. */
function corpoDe(src: string, nome: string): string {
    const i = src.indexOf(`async function ${nome}(`);
    expect(i, `função ${nome}`).toBeGreaterThan(-1);
    const resto = src.slice(i + 10);
    const fim = resto.search(/\n {4}(async )?function /);
    return resto.slice(0, fim === -1 ? undefined : fim);
}

describe('excluir boleto não vira "cancelado" na tela', () => {
    it('o Excluir do formulário avisa a lista com onExcluido, nunca com status cancelado', () => {
        const corpo = corpoDe(fonte('components/BoletoFormModal.tsx'), 'handleExcluir');
        expect(corpo).toContain('boletoService.excluir(');
        expect(corpo).toContain('onExcluido(boleto.id)');
        expect(corpo).not.toMatch(/status:\s*'cancelado'/);
    });

    it('a lista tira a linha do boleto excluído', () => {
        const src = fonte('components/BoletoManager.tsx');
        expect(src).toContain('onExcluido={handleExcluido}');
        const i = src.indexOf('function handleExcluido(');
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 400)).toContain('prev.filter(b => b.id !== boletoId)');
    });
});

describe('importação em lote aceita o que a captura de 1 boleto aceita', () => {
    it('PDF e imagem entram; o resto não', () => {
        expect(aceitoNoLote({ type: 'application/pdf', name: 'ordemPagamentoInfracao_QOU0H30.pdf' })).toBe(true);
        expect(aceitoNoLote({ type: '', name: 'MULTA.PDF' })).toBe(true);
        expect(aceitoNoLote({ type: 'image/jpeg', name: 'multa.jpg' })).toBe(true);
        expect(aceitoNoLote({ type: '', name: 'foto.png' })).toBe(true);
        expect(aceitoNoLote({ type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'contrato.docx' })).toBe(false);
    });

    it('o seletor de organização do lote tem a opção vazia (não finge a 1ª organização)', () => {
        const src = fonte('components/BoletoLoteModal.tsx');
        expect(src).toContain('— Selecione a organização —');
        expect(src).toContain('useWritableOrganizations');
    });
});
