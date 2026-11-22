import { describe, expect, it } from 'vitest';
import { faltaNoComprador } from '../components/assinatura/EnviarParaAssinaturaSheet';

/** O que a gaveta de envio cobra do cadastro do comprador — mesma régua da RPC assinatura_criar. */
const base = { id: 'c1', name: 'Ana', email: 'ana@x.com', document: '529.982.247-25', legal_rep_name: null, legal_rep_document: null };

describe('faltaNoComprador', () => {
    it('pessoa física pronta', () => expect(faltaNoComprador(base)).toBe(null));
    it('sem e-mail', () => expect(faltaNoComprador({ ...base, email: '' })).toBe('sem e-mail no cadastro'));
    it('CPF inválido', () => expect(faltaNoComprador({ ...base, document: '111.111.111-11' })).toBe('sem CPF válido no cadastro'));
    it('pessoa jurídica precisa do representante legal com CPF', () => {
        const pj = { ...base, document: '12.345.678/0001-90' };
        expect(faltaNoComprador(pj)).toBe('pessoa jurídica sem representante legal no cadastro');
        expect(faltaNoComprador({ ...pj, legal_rep_name: 'João', legal_rep_document: '123' })).toBe('CPF do representante legal inválido no cadastro');
        expect(faltaNoComprador({ ...pj, legal_rep_name: 'João', legal_rep_document: '529.982.247-25' })).toBe(null);
    });
});
