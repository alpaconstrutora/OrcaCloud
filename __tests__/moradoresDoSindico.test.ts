import { describe, it, expect } from 'vitest';
import { motivoDoMorador, motivoNaoConvida, motivoNaoEncerra, pessoasDoPredio, type FormMorador } from '../utils/moradoresDoSindico';

const form = (p: Partial<FormMorador> = {}): FormMorador => ({
    unitId: 'u1', papel: 'INQUILINO', desde: '2026-11-01', clientId: '', nome: 'Ana', documento: '', email: '', telefone: '', ...p,
});

describe('moradores do síndico', () => {
    it('convidar: só quem mora, e com e-mail (frases do banco)', () => {
        expect(motivoNaoConvida({ vigente: true, email: 'a@b.com' }, null)).toBeNull();
        expect(motivoNaoConvida({ vigente: true, email: null }, null)).toBe('O morador não tem e-mail. Preencha o e-mail antes de convidar.');
        expect(motivoNaoConvida({ vigente: false, email: 'a@b.com' }, null)).toBe('Só quem mora no condomínio recebe o convite por aqui.');
        expect(motivoNaoConvida({ vigente: true, email: 'a@b.com' }, 'base')).toBe('base');
    });

    it('encerrar só a vigente', () => {
        expect(motivoNaoEncerra({ vigente: true, ate: null }, null)).toBeNull();
        expect(motivoNaoEncerra({ vigente: false, ate: '2026-10-01' }, null)).toBe('Esta ocupação já está encerrada.');
    });

    it('novo morador: unidade, nome, CPF com 11/14 dígitos, e-mail válido; cadastro existente dispensa o resto', () => {
        expect(motivoDoMorador(form())).toBeNull();
        expect(motivoDoMorador(form({ unitId: '' }))).toBe('Escolha uma unidade deste condomínio.');
        expect(motivoDoMorador(form({ nome: ' ' }))).toBe('Informe o nome do morador.');
        expect(motivoDoMorador(form({ documento: '123' }))).toBe('CPF tem 11 dígitos e CNPJ tem 14.');
        expect(motivoDoMorador(form({ email: 'ana@' }))).toBe('E-mail inválido.');
        expect(motivoDoMorador(form({ clientId: 'c9', nome: '' }))).toBeNull();
    });

    it('pessoas do prédio sem repetir, em ordem', () => {
        const oc = (clientId: string, nome: string) => ({ id: clientId + nome, papel: 'MORADOR' as const, desde: '', ate: null, vigente: true, clientId, nome, email: null, telefone: null, convidadoEm: null, abaCondominio: true });
        expect(pessoasDoPredio([
            { unitId: 'u1', unidade: '11', torre: null, ocupacoes: [oc('c2', 'Zé'), oc('c1', 'Ana')] },
            { unitId: 'u2', unidade: '12', torre: null, ocupacoes: [oc('c2', 'Zé')] },
        ])).toEqual([{ clientId: 'c1', nome: 'Ana' }, { clientId: 'c2', nome: 'Zé' }]);
    });
});
