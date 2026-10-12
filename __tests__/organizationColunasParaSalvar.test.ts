import { describe, it, expect } from 'vitest';
import { organizationService } from '../services/organizationService';
import type { Organization } from '../types';

// Org PJ: CNPJ, e-mail, telefone, site e endereço são espelho da empresa matriz,
// mantido pelo banco — o save da org não os manda. Org PF não tem matriz: manda.
// Ver docs/planos/2026-10-12-fundir-organizacao-e-grupo.md (item C1).
const base: Organization = {
    id: 'o1',
    code: '001',
    name: 'Alpa',
    cnpj: '09.264.396/0001-59',
    email: 'a@a.com',
    phone: '3599',
    website: 'alpa.com',
    logoUrl: 'data:image/png;base64,AAA',
    address: { street: 'Rua A', city: 'Cambuí' },
    settings: { tax_recognition_regime: 'CAIXA' },
};

const ESPELHADAS = ['cnpj', 'email', 'phone', 'website', 'address'];

describe('organizationService.colunasParaSalvar', () => {
    it('org PJ (sem tipo_pessoa) não manda os campos espelhados da matriz', () => {
        const cols = organizationService.colunasParaSalvar(base);
        for (const c of ESPELHADAS) expect(cols).not.toHaveProperty(c);
        expect(cols).toMatchObject({ code: '001', name: 'Alpa', logo_url: base.logoUrl, settings: base.settings });
    });

    it('org PJ explícita idem', () => {
        const cols = organizationService.colunasParaSalvar({ ...base, settings: { tipo_pessoa: 'PJ' } });
        for (const c of ESPELHADAS) expect(cols).not.toHaveProperty(c);
    });

    it('org PF manda CPF, contato e endereço', () => {
        const pf = { ...base, cnpj: '123.456.789-00', settings: { tipo_pessoa: 'PF' as const } };
        expect(organizationService.colunasParaSalvar(pf)).toMatchObject({
            cnpj: '123.456.789-00', email: 'a@a.com', phone: '3599', website: 'alpa.com', address: base.address,
        });
    });

    it('save parcial sem settings (não dá para saber o tipo) não arrisca regravar os espelhados', () => {
        const cols = organizationService.colunasParaSalvar({ name: 'X', cnpj: 'lixo' });
        expect(cols).not.toHaveProperty('cnpj');
    });

    it('code ausente não vira null', () => {
        const { code: _ignorado, ...semCodigo } = base;
        expect(organizationService.colunasParaSalvar(semCodigo)).not.toHaveProperty('code');
    });
});

describe('organizationService.ehPessoaFisica', () => {
    it('só PF explícito', () => {
        expect(organizationService.ehPessoaFisica({ settings: { tipo_pessoa: 'PF' } })).toBe(true);
        expect(organizationService.ehPessoaFisica({ settings: { tipo_pessoa: 'PJ' } })).toBe(false);
        expect(organizationService.ehPessoaFisica({ settings: {} })).toBe(false);
        expect(organizationService.ehPessoaFisica(null)).toBe(false);
    });
});
