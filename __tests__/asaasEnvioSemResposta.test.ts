import { describe, it, expect } from 'vitest';
import { resultadoDoEnvio, envioSemConfirmacao, candidatoDaReferencia } from '../utils/asaasEnvioSemResposta';

describe('resultadoDoEnvio', () => {
    it('2xx com id: aceito', () => {
        expect(resultadoDoEnvio(200, true)).toBe('aceito');
    });

    it('4xx: a Asaas recusou, nada foi criado', () => {
        expect(resultadoDoEnvio(400, false)).toBe('recusado');
        expect(resultadoDoEnvio(401, false)).toBe('recusado');
        expect(resultadoDoEnvio(429, false)).toBe('recusado');
    });

    it('sem resposta, 408, 5xx ou 2xx sem id: PODE ter sido criado — não é falha', () => {
        expect(resultadoDoEnvio(null, false)).toBe('sem_confirmacao');
        expect(resultadoDoEnvio(408, false)).toBe('sem_confirmacao');
        expect(resultadoDoEnvio(502, false)).toBe('sem_confirmacao');
        expect(resultadoDoEnvio(504, false)).toBe('sem_confirmacao');
        expect(resultadoDoEnvio(200, false)).toBe('sem_confirmacao');
    });
});

describe('envioSemConfirmacao', () => {
    const agora = Date.parse('2026-11-14T12:00:00Z');
    const base = { status: 'APPROVED', asaas_bill_id: null, asaas_transfer_id: null, created_at: '2026-11-14T11:50:00Z' };

    it('aprovado sem número há mais de 5 min: sem confirmação', () => {
        expect(envioSemConfirmacao(base, agora)).toBe(true);
    });

    it('recente, com número ou em outro status: não', () => {
        expect(envioSemConfirmacao({ ...base, created_at: '2026-11-14T11:58:00Z' }, agora)).toBe(false);
        expect(envioSemConfirmacao({ ...base, asaas_bill_id: 'b1' }, agora)).toBe(false);
        expect(envioSemConfirmacao({ ...base, status: 'PENDING' }, agora)).toBe(false);
    });
});

describe('candidatoDaReferencia', () => {
    const cands = [
        { id: 'sp-1', boleto_id: 'bol-1', payment_account_id: 'conta-A' },
        { id: 'sp-2', boleto_id: null, payment_account_id: 'conta-A' },
        { id: 'sp-3', boleto_id: 'bol-3', payment_account_id: 'conta-B' },
    ];

    it('boleto: externalReference = id do boleto', () => {
        expect(candidatoDaReferencia(cands, 'conta-A', 'bol-1')?.id).toBe('sp-1');
    });

    it('PIX/saque: externalReference = id do pagamento', () => {
        expect(candidatoDaReferencia(cands, 'conta-A', 'sp-2')?.id).toBe('sp-2');
    });

    it('outra conta, referência vazia ou desconhecida: nenhum', () => {
        expect(candidatoDaReferencia(cands, 'conta-A', 'bol-3')).toBeNull();
        expect(candidatoDaReferencia(cands, 'conta-A', null)).toBeNull();
        expect(candidatoDaReferencia(cands, 'conta-A', 'xyz')).toBeNull();
    });
});
