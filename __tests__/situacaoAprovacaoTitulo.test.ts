import { describe, it, expect } from 'vitest';
import {
    situacaoDoTitulo,
    motivoParaNaoPagar,
    niveisAprovadosNaRodada,
    MOTIVO_ALCADA_PENDENTE,
    MOTIVO_ALCADA_REJEITADA,
} from '../utils/situacaoAprovacaoTitulo';

const HOJE = '2026-10-26';

describe('situacaoDoTitulo', () => {
    it('pendente na alçada = Aguardando aprovação, não paga', () => {
        const s = situacaoDoTitulo({ effective_status: 'PREVISTO', approval_status: 'PENDENTE', due_date: '2026-11-10' }, HOJE);
        expect(s.chave).toBe('AGUARDANDO_APROVACAO');
        expect(s.podePagar).toBe(false);
        expect(s.motivo).toBe(MOTIVO_ALCADA_PENDENTE);
        expect(s.detalhes).toEqual([]);
    });

    it('pendente e vencido mostra Vencido na segunda linha', () => {
        const s = situacaoDoTitulo({ effective_status: 'VENCIDO', approval_status: 'PENDENTE', due_date: '2026-10-01' }, HOJE);
        expect(s.chave).toBe('AGUARDANDO_APROVACAO');
        expect(s.vencido).toBe(true);
        expect(s.detalhes).toEqual(['Vencido']);
    });

    it('pendente com o business_status antigo AGUARDANDO_APROVACAO ainda reconhece o vencimento pela data', () => {
        const s = situacaoDoTitulo({ effective_status: 'AGUARDANDO_APROVACAO', approval_status: 'PENDENTE', due_date: '2026-10-01' }, HOJE);
        expect(s.vencido).toBe(true);
    });

    it('2 níveis com o nível 1 aprovado diz "Nível 1 de 2 aprovado"', () => {
        const s = situacaoDoTitulo({
            effective_status: 'PREVISTO', approval_status: 'PENDENTE', approval_required_levels: 2, due_date: '2026-11-10',
            approval_chain: [{ level: 1, role: 'Gestor', action: 'APROVADO', approved_by: 'a', approved_at: 'x' }],
        }, HOJE);
        expect(s.detalhes).toEqual(['Nível 1 de 2 aprovado']);
    });

    it('aprovado = Liberado para pagamento, paga; vencido na segunda linha', () => {
        const s = situacaoDoTitulo({ effective_status: 'VENCIDO', approval_status: 'APROVADO', due_date: '2026-10-01' }, HOJE);
        expect(s.chave).toBe('LIBERADO_PARA_PAGAMENTO');
        expect(s.podePagar).toBe(true);
        expect(s.motivo).toBeNull();
        expect(s.detalhes).toEqual(['Vencido']);
    });

    it('rejeitado = Bloqueado, não paga, traz o motivo da rejeição', () => {
        const s = situacaoDoTitulo({
            effective_status: 'BLOQUEADO', approval_status: 'REJEITADO', due_date: '2026-11-10',
            approval_chain: [{ level: 1, role: 'Rejeição', action: 'REJEITADO', approved_by: 'a', approved_at: 'x', notes: 'valor errado' }],
        }, HOJE);
        expect(s.chave).toBe('BLOQUEADO');
        expect(s.podePagar).toBe(false);
        expect(s.motivo).toBe(MOTIVO_ALCADA_REJEITADA);
        expect(s.motivoRejeicao).toBe('valor errado');
    });

    it.each(['PAGO', 'CANCELADO', 'RETIDO'])('%s passa como está, sem pagamento a fazer', (st) => {
        const s = situacaoDoTitulo({ effective_status: st, approval_status: 'PENDENTE', due_date: '2026-10-01' }, HOJE);
        expect(s.chave).toBe(st);
        expect(s.podePagar).toBe(false);
        expect(s.motivo).toBeNull();
        expect(s.detalhes).toEqual([]);
    });

    it('parcial mantém o rótulo, mas segue a alçada para pagar', () => {
        const s = situacaoDoTitulo({ effective_status: 'PARCIAL', approval_status: 'PENDENTE', due_date: '2026-11-10' }, HOJE);
        expect(s.chave).toBe('PARCIAL');
        expect(s.podePagar).toBe(false);
        expect(s.motivo).toBe(MOTIVO_ALCADA_PENDENTE);
    });

    it('rascunho (fora da regra) segue o status de sempre e paga', () => {
        const s = situacaoDoTitulo({ effective_status: 'VENCIDO', approval_status: 'RASCUNHO', due_date: '2026-10-01' }, HOJE);
        expect(s.chave).toBe('VENCIDO');
        expect(s.podePagar).toBe(true);
    });

    it('sem approval_status (linha antiga) se comporta como rascunho', () => {
        const s = situacaoDoTitulo({ effective_status: 'PREVISTO', due_date: null }, HOJE);
        expect(s.chave).toBe('PREVISTO');
        expect(s.podePagar).toBe(true);
    });
});

describe('motivoParaNaoPagar', () => {
    it('trava PENDENTE e REJEITADO, libera o resto', () => {
        expect(motivoParaNaoPagar('PENDENTE')).toBe(MOTIVO_ALCADA_PENDENTE);
        expect(motivoParaNaoPagar('REJEITADO')).toBe(MOTIVO_ALCADA_REJEITADA);
        expect(motivoParaNaoPagar('APROVADO')).toBeNull();
        expect(motivoParaNaoPagar('RASCUNHO')).toBeNull();
        expect(motivoParaNaoPagar(null)).toBeNull();
    });
});

describe('niveisAprovadosNaRodada', () => {
    const passo = (level: 1 | 2, action: 'APROVADO' | 'REJEITADO') => ({ level, role: 'r', action, approved_by: 'a', approved_at: 'x' });

    it('conta os níveis aprovados', () => {
        expect(niveisAprovadosNaRodada([passo(1, 'APROVADO'), passo(2, 'APROVADO')])).toEqual([1, 2]);
    });

    it('aprovação anterior à última rejeição não conta (reenvio recomeça a rodada)', () => {
        expect(niveisAprovadosNaRodada([passo(1, 'APROVADO'), passo(1, 'REJEITADO')])).toEqual([]);
        expect(niveisAprovadosNaRodada([passo(1, 'APROVADO'), passo(1, 'REJEITADO'), passo(1, 'APROVADO')])).toEqual([1]);
    });

    it('cadeia vazia ou nula', () => {
        expect(niveisAprovadosNaRodada([])).toEqual([]);
        expect(niveisAprovadosNaRodada(null)).toEqual([]);
    });

    it('reenviado depois de rejeitado com nível 1 antigo não mostra "Nível 1 de 2"', () => {
        const s = situacaoDoTitulo({
            effective_status: 'PREVISTO', approval_status: 'PENDENTE', approval_required_levels: 2, due_date: '2026-11-10',
            approval_chain: [passo(1, 'APROVADO'), passo(2, 'REJEITADO')],
        }, HOJE);
        expect(s.detalhes).toEqual([]);
    });
});
