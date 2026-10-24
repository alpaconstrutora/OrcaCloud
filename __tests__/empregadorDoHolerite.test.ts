import { describe, it, expect } from 'vitest';
import { empregadorDoHolerite } from '../utils/empregadorDoHolerite';

// 24/10/2026: o recibo de pagamento saía com o empregador FIXO no código —
// "OPURA PRO", "CNPJ: 00.000.000/0001-00", "Endereço: Unidade Operacional -
// Obra Garden". Pedido do usuário: trazer nome e CNPJ da organização.

describe('empregadorDoHolerite', () => {
    it('PJ: nome, CNPJ e endereço da organização em uma linha', () => {
        expect(empregadorDoHolerite({
            name: 'Alpa Construtora e Incorporadora',
            cnpj: '09.264.396/0001-59',
            address: { street: 'Rua Ângelo Bernardo Faccio', number: '90', neighborhood: 'Centro', city: 'Cambuí', state: 'MG', zipCode: '37600-000' },
            settings: {},
        })).toEqual({
            nome: 'Alpa Construtora e Incorporadora',
            documentoRotulo: 'CNPJ',
            documento: '09.264.396/0001-59',
            endereco: 'Rua Ângelo Bernardo Faccio, 90 - Centro, Cambuí/MG - CEP 37600-000',
        });
    });

    it('sem endereço cadastrado, o endereço vem vazio (a tela some com a linha)', () => {
        const e = empregadorDoHolerite({ name: 'Construção do Edifício Garden Cambuhy SPE', cnpj: '60.897.254/0001-86', address: {}, settings: null });
        expect(e.documento).toBe('60.897.254/0001-86');
        expect(e.endereco).toBe('');
    });

    it('pessoa física: o documento é CPF', () => {
        const e = empregadorDoHolerite({ name: 'Altair Pereira da Rosa', cnpj: '123.456.789-00', address: null, settings: { tipo_pessoa: 'PF' } });
        expect(e.documentoRotulo).toBe('CPF');
        expect(e.documento).toBe('123.456.789-00');
    });

    it('sem documento cadastrado, vem vazio (não inventa número)', () => {
        expect(empregadorDoHolerite({ name: 'ALPA Empreendimentos e Construções', cnpj: null, address: {}, settings: {} }).documento).toBe('');
    });
});
