import { describe, it, expect } from 'vitest';
import {
    avaliarAprovacaoDiario, podeEscolherStatus, registroTravado,
    MOTIVO_SEM_PERMISSAO_APROVAR, MOTIVO_REGISTRO_APROVADO,
} from '../utils/diaryAprovacao';

// Mesma tabela do roteiro SQL de fn_pode_aprovar_diario (aplicar_20271014600000).
describe('diário · quem aprova', () => {
    it('admin e owner aprovam', () => {
        expect(avaliarAprovacaoDiario({ orgCarregada: true, membro: { role: 'admin' } }).pode).toBe(true);
        expect(avaliarAprovacaoDiario({ orgCarregada: true, membro: { role: 'owner', permissions: { canApproveDiary: false } } }).pode).toBe(true);
    });
    it('member sem a chave NÃO aprova (padrão do papel)', () => {
        const r = avaliarAprovacaoDiario({ orgCarregada: true, membro: { role: 'member', permissions: {} } });
        expect(r).toEqual({ pode: false, motivo: MOTIVO_SEM_PERMISSAO_APROVAR });
        expect(avaliarAprovacaoDiario({ orgCarregada: true, membro: { role: 'member', permissions: null } }).pode).toBe(false);
    });
    it('member/viewer com a chave aprovam; chave falsa ou não-booleana não', () => {
        expect(avaliarAprovacaoDiario({ orgCarregada: true, membro: { role: 'member', permissions: { canApproveDiary: true } } }).pode).toBe(true);
        expect(avaliarAprovacaoDiario({ orgCarregada: true, membro: { role: 'viewer', permissions: { canApproveDiary: true } } }).pode).toBe(true);
        expect(avaliarAprovacaoDiario({ orgCarregada: true, membro: { role: 'member', permissions: { canApproveDiary: false } } }).pode).toBe(false);
        expect(avaliarAprovacaoDiario({ orgCarregada: true, membro: { role: 'member', permissions: { canApproveDiary: 'sim' } } }).pode).toBe(false);
    });
    it('não é membro: não aprova, com motivo', () => {
        const r = avaliarAprovacaoDiario({ orgCarregada: true, membro: null });
        expect(r.pode).toBe(false);
        expect(r.motivo).toMatch(/não é membro/);
    });
    it('org ainda não carregada: libera (o banco confere)', () => {
        expect(avaliarAprovacaoDiario({ orgCarregada: false, membro: null }).pode).toBe(true);
    });
});

describe('diário · status e trava', () => {
    const nao = { pode: false, motivo: MOTIVO_SEM_PERMISSAO_APROVAR };
    const sim = { pode: true };
    it('sem permissão: Aprovado/Recusado novos ficam fora; Rascunho/Em Análise livres', () => {
        expect(podeEscolherStatus('Aprovado', 'Rascunho', nao).pode).toBe(false);
        expect(podeEscolherStatus('Recusado', 'Em Análise', nao).pode).toBe(false);
        expect(podeEscolherStatus('Em Análise', 'Rascunho', nao).pode).toBe(true);
        expect(podeEscolherStatus('Rascunho', null, nao).pode).toBe(true);
    });
    it('manter o Recusado que já está no banco é livre (corrigir e reenviar)', () => {
        expect(podeEscolherStatus('Recusado', 'Recusado', nao).pode).toBe(true);
    });
    it('com permissão tudo vale', () => {
        expect(podeEscolherStatus('Aprovado', 'Rascunho', sim).pode).toBe(true);
    });
    it('aprovado no banco trava quem não aprova; o resto não trava', () => {
        expect(registroTravado('Aprovado', nao)).toEqual({ pode: false, motivo: MOTIVO_REGISTRO_APROVADO });
        expect(registroTravado('Aprovado', sim).pode).toBe(true);
        expect(registroTravado('Recusado', nao).pode).toBe(true);
        expect(registroTravado(null, nao).pode).toBe(true);
    });
});
