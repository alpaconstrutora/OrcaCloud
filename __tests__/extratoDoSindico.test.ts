import { describe, it, expect } from 'vitest';
import {
    linhasParaImportar, motivoNaoConciliaMovimento, motivoNaoIgnoraMovimento, resumoDoExtrato, situacaoDoMovimento,
    type MovimentoDoExtrato,
} from '../utils/extratoDoSindico';

function mov(p: Partial<MovimentoDoExtrato> = {}): MovimentoDoExtrato {
    return {
        id: 'b1', data: '2026-09-10', valor: 100, direcao: 'DEBIT', descricao: 'PAGTO', status: 'NORMALIZED',
        vinculos: [], candidatosExatos: 0, ...p,
    };
}

describe('situação do movimento do extrato', () => {
    it('conciliado, sugestão, pendente, ignorado, transferência', () => {
        expect(situacaoDoMovimento(mov({ status: 'MATCHED', vinculos: [{ matchId: 'm', tituloId: 't', descricao: 'x', valor: 100, vencimento: '2026-09-10', credor: null }] }))).toBe('CONCILIADO');
        expect(situacaoDoMovimento(mov({ candidatosExatos: 1 }))).toBe('SUGESTAO');
        expect(situacaoDoMovimento(mov())).toBe('PENDENTE');
        expect(situacaoDoMovimento(mov({ status: 'IGNORED' }))).toBe('IGNORADO');
        expect(situacaoDoMovimento(mov({ status: 'TRANSFER' }))).toBe('TRANSFERENCIA');
    });
});

describe('botões do movimento dizem por que estão desligados', () => {
    it('o motivo de operar vem antes', () => {
        expect(motivoNaoConciliaMovimento(mov(), 'Entre com e-mail e senha.')).toBe('Entre com e-mail e senha.');
    });
    it('conciliar: não em conciliado, ignorado ou transferência', () => {
        expect(motivoNaoConciliaMovimento(mov(), null)).toBeNull();
        expect(motivoNaoConciliaMovimento(mov({ status: 'MATCHED' }), null)).toMatch(/já está conciliado/);
        expect(motivoNaoConciliaMovimento(mov({ status: 'IGNORED' }), null)).toMatch(/ignorado/);
        expect(motivoNaoConciliaMovimento(mov({ status: 'TRANSFER' }), null)).toMatch(/transferência/);
    });
    it('ignorar: não em conciliado (restaurar é a mesma ação ao contrário)', () => {
        expect(motivoNaoIgnoraMovimento(mov(), null)).toBeNull();
        expect(motivoNaoIgnoraMovimento(mov({ status: 'IGNORED' }), null)).toBeNull();
        expect(motivoNaoIgnoraMovimento(mov({ status: 'MATCHED' }), null)).toMatch(/desfaça o vínculo/);
    });
});

describe('linhas do arquivo para o banco', () => {
    it('leva data, valor com sinal, memo, descrição, FITID e a descrição normalizada', () => {
        const l = linhasParaImportar([
            { date: '2026-09-10', amount: -12.9, memo: 'Tarifa Pacote', fitid: 'F1' },
            { date: '2026-09-11', amount: 500, description: 'Transferência recebida' },
        ]);
        expect(l[0]).toEqual({ data: '2026-09-10', valor: -12.9, memo: 'Tarifa Pacote', descricao: null, fitid: 'F1', normalizada: 'TARIFA PACOTE' });
        expect(l[1].valor).toBe(500);
        expect(l[1].normalizada).toBe('TRANSFERENCIA RECEBIDA');
    });
});

describe('resumo do extrato', () => {
    it('entradas, saídas e quantos faltam conciliar (ignorado não conta)', () => {
        const r = resumoDoExtrato([
            mov({ direcao: 'CREDIT', valor: 500 }),
            mov({ valor: 100, status: 'MATCHED' }),
            mov({ valor: 30 }),
            mov({ valor: 7, status: 'IGNORED' }),
        ]);
        expect(r).toEqual({ entradas: 500, saidas: 137, conciliados: 1, pendentes: 2, ignorados: 1 });
    });
});
