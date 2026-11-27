import { describe, it, expect } from 'vitest';
import {
    MOTIVO_FORNECEDOR_DE_OUTRA_ORG, andamentoDoContrato, motivoDaConta, motivoDoContrato, motivoNaoEditaFornecedor,
    motivoNaoEncerraContrato, resumoDaConta, type FormContaDoFornecedor, type FormContrato,
} from '../utils/fornecedoresDoSindico';

const conta = (p: Partial<FormContaDoFornecedor> = {}): FormContaDoFornecedor => ({
    pix: '', tipoPix: '', banco: '', agencia: '', conta: '', tipoConta: 'corrente', titular: '', documentoTitular: '', principal: false, ...p,
});
const contrato = (p: Partial<FormContrato> = {}): FormContrato => ({
    objeto: 'Limpeza', fornecedorId: 'f1', valor: 850, periodicidade: 'Mensal', diaVencimento: 10,
    inicio: '2026-12-01', fim: '', centroId: 'cc', categoriaId: 'cat', ...p,
});

describe('fornecedor do condomínio', () => {
    it('o compartilhado por outra empresa só se consulta; o motivo de operar vem antes', () => {
        expect(motivoNaoEditaFornecedor({ editavel: true }, null)).toBeNull();
        expect(motivoNaoEditaFornecedor({ editavel: false }, null)).toBe(MOTIVO_FORNECEDOR_DE_OUTRA_ORG);
        expect(motivoNaoEditaFornecedor({ editavel: false }, 'Entre com e-mail e senha.')).toBe('Entre com e-mail e senha.');
    });

    it('conta: PIX com tipo, conta com agência, documento do titular com 11 ou 14 dígitos (frases do banco)', () => {
        expect(motivoDaConta(conta())).toBe('Informe a chave PIX ou a conta bancária.');
        expect(motivoDaConta(conta({ pix: 'x' }))).toBe('Escolha o tipo da chave PIX.');
        expect(motivoDaConta(conta({ pix: 'x', tipoPix: 'aleatoria' }))).toBeNull();
        expect(motivoDaConta(conta({ conta: '123' }))).toBe('Informe a agência da conta.');
        expect(motivoDaConta(conta({ conta: '123', agencia: '1', documentoTitular: '123' }))).toBe('CPF do titular tem 11 dígitos e CNPJ tem 14.');
        expect(motivoDaConta(conta({ conta: '123', agencia: '1', documentoTitular: '123.456.789-01' }))).toBeNull();
    });

    it('resumo da conta numa linha', () => {
        expect(resumoDaConta({ pix: '11222333000181', tipoPix: 'cnpj', banco: 'Sicredi', agencia: '0812', conta: '123-4' }))
            .toBe('PIX CNPJ 11222333000181 · Sicredi 0812 / 123-4');
        expect(resumoDaConta({ pix: null, tipoPix: null, banco: null, agencia: null, conta: null })).toBe('—');
    });
});

describe('contrato do condomínio', () => {
    it('as mesmas frases de fn_sindico_motivo_contrato', () => {
        expect(motivoDoContrato(contrato())).toBeNull();
        expect(motivoDoContrato(contrato({ objeto: ' ' }))).toBe('Informe o objeto do contrato.');
        expect(motivoDoContrato(contrato({ fornecedorId: '' }))).toBe('Escolha o fornecedor.');
        expect(motivoDoContrato(contrato({ valor: 0 }))).toBe('Informe o valor da parcela.');
        expect(motivoDoContrato(contrato({ fim: '2026-11-30' }))).toBe('O fim não pode ser antes do início.');
        // 29 a 31: a série do app pula fevereiro (setMonth do JavaScript) — o portal fica em 1–28.
        expect(motivoDoContrato(contrato({ diaVencimento: 31 }))).toBe('Dia de vencimento de 1 a 28.');
        expect(motivoDoContrato(contrato({ diaVencimento: 28 }))).toBeNull();
        expect(motivoDoContrato(contrato({ centroId: '' }))).toBe('Escolha um centro de custo deste condomínio.');
        expect(motivoDoContrato(contrato({ categoriaId: '' }))).toBe('Escolha a conta financeira.');
    });

    it('encerrar: só o que está em vigor', () => {
        expect(motivoNaoEncerraContrato({ status: 'Ativo' }, null)).toBeNull();
        expect(motivoNaoEncerraContrato({ status: 'Encerrado' }, null)).toBe('Este contrato já está encerrado.');
        expect(motivoNaoEncerraContrato({ status: 'Ativo' }, 'base')).toBe('base');
    });

    it('andamento', () => {
        expect(andamentoDoContrato({ parcelas: 12, pagas: 3 })).toBe('3 de 12 pagas');
        expect(andamentoDoContrato({ parcelas: 1, pagas: 0 })).toBe('0 de 1 paga');
        expect(andamentoDoContrato({ parcelas: 0, pagas: 0 })).toBe('Sem parcelas');
    });
});
