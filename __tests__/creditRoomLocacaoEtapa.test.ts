import { describe, expect, it } from 'vitest';
import { etapaMaisAvancada, rotuloDaEtapaDeLocacao, situacaoDeLocacao } from '../utils/creditRoomLocacaoEtapa';

const u = (o: Partial<{ status: string; rental_status: string | null; etapa_locacao: string | null }>) =>
    ({ status: 'DISPONIVEL', rental_status: 'DISPONIVEL', etapa_locacao: null, ...o });

describe('situacaoDeLocacao — pela etapa da negociação', () => {
    it('Alugado (COMPLETED) = locada, mesmo com a unidade marcada Disponível', () => {
        expect(situacaoDeLocacao(u({ etapa_locacao: 'COMPLETED' }))).toBe('LOCADA');
    });

    it('Reserva, Contrato e Assinatura = em negociação, mesmo com a unidade marcada Locado', () => {
        for (const e of ['RESERVA', 'WAITING_PAYMENT', 'CONTRATO', 'ASSINATURA']) {
            expect(situacaoDeLocacao(u({ etapa_locacao: e, rental_status: 'LOCADO' }))).toBe('EM_NEGOCIACAO');
        }
    });

    it('caso real 014/102: contrato Ativo, negociação em Assinatura, unidade Reservado → em negociação', () => {
        expect(situacaoDeLocacao(u({ etapa_locacao: 'ASSINATURA', rental_status: 'RESERVADO' }))).toBe('EM_NEGOCIACAO');
    });

    it('sem negociação que decida, vale o status da unidade (cadastro anterior ao fluxo)', () => {
        expect(situacaoDeLocacao(u({ rental_status: 'LOCADO' }))).toBe('LOCADA');
        expect(situacaoDeLocacao(u({ etapa_locacao: 'IN_NEGOTIATION', rental_status: 'LOCADO' }))).toBe('LOCADA');
        expect(situacaoDeLocacao(u({ etapa_locacao: 'PENDING' }))).toBe('DISPONIVEL');
        expect(situacaoDeLocacao(u({ rental_status: 'RESERVADO' }))).toBe('DISPONIVEL');
        expect(situacaoDeLocacao(u({ status: 'VENDIDO' }))).toBe('OUTRA');
    });
});

describe('etapaMaisAvancada', () => {
    it('pega a mais avançada e ignora cancelada e vazio', () => {
        expect(etapaMaisAvancada(['IN_NEGOTIATION', 'ASSINATURA', 'CONTRATO'])).toBe('ASSINATURA');
        expect(etapaMaisAvancada(['CANCELLED', 'RESERVA'])).toBe('RESERVA');
        expect(etapaMaisAvancada(['COMPLETED', 'IN_NEGOTIATION'])).toBe('COMPLETED');
        expect(etapaMaisAvancada(['CANCELLED', null, undefined])).toBeNull();
        expect(etapaMaisAvancada([])).toBeNull();
    });
});

describe('rotuloDaEtapaDeLocacao', () => {
    it('usa o vocabulário do stepper, com Alugado no lugar de Concluído', () => {
        expect(rotuloDaEtapaDeLocacao('ASSINATURA')).toBe('Assinatura');
        expect(rotuloDaEtapaDeLocacao('WAITING_PAYMENT')).toBe('Reserva');
        expect(rotuloDaEtapaDeLocacao('COMPLETED')).toBe('Alugado');
    });
});
