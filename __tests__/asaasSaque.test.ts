import { describe, it, expect } from 'vitest';
import { decidirSaque, idDoPedido, escolherReserva, mesmoDocumento, type PagamentoRegistrado } from '../utils/asaasSaque';

const pix: PagamentoRegistrado = { payment_type: 'PIX_TRANSFER', status: 'APPROVED', value: 1, pix_key: '99991111140', identification_field: null };
const boleto: PagamentoRegistrado = { payment_type: 'BILL', status: 'PENDING', value: 20, pix_key: null, identification_field: '23793381286001234107143000012345890460000002000' };

describe('idDoPedido', () => {
    it('acha o id da transferência ou do boleto', () => {
        expect(idDoPedido({ type: 'TRANSFER', transfer: { id: 'abc' } })).toEqual({ coluna: 'asaas_transfer_id', id: 'abc' });
        expect(idDoPedido({ type: 'BILL', bill: { id: 623471 } })).toEqual({ coluna: 'asaas_bill_id', id: '623471' });
        expect(idDoPedido({ type: 'PIX_REFUND' })).toBeNull();
    });
});

describe('decidirSaque', () => {
    it('aprova o PIX que o OrçaCloud disparou (valor e chave conferem)', () => {
        expect(decidirSaque({ type: 'TRANSFER', transfer: { id: 'x', value: 1, operationType: 'PIX', bankAccount: { pixAddressKey: '999.911.111-40' } } }, pix))
            .toEqual({ status: 'APPROVED' });
    });

    it('aprova quando a Asaas não manda a chave no pedido', () => {
        expect(decidirSaque({ type: 'TRANSFER', transfer: { id: 'x', value: 1, bankAccount: { pixAddressKey: null } } }, pix).status).toBe('APPROVED');
    });

    it('recusa saque que não é nosso, de outro valor, de outra chave ou já encerrado', () => {
        expect(decidirSaque({ type: 'TRANSFER', transfer: { id: 'x', value: 1 } }, null).refuseReason).toMatch(/não encontrado/);
        expect(decidirSaque({ type: 'TRANSFER', transfer: { id: 'x', value: 999 } }, pix).refuseReason).toMatch(/Valor/);
        expect(decidirSaque({ type: 'TRANSFER', transfer: { id: 'x', value: 1, bankAccount: { pixAddressKey: 'outra@chave.com' } } }, pix).refuseReason).toMatch(/Chave/);
        expect(decidirSaque({ type: 'TRANSFER', transfer: { id: 'x', value: 1 } }, { ...pix, status: 'CANCELLED' }).refuseReason).toMatch(/CANCELLED/);
        expect(decidirSaque({ type: 'TRANSFER', transfer: { id: 'x', value: 20 } }, boleto).refuseReason).toMatch(/Tipo/);
    });

    it('telefone com e sem +55 é a mesma chave', () => {
        const tel = { ...pix, pix_key: '+5511912345678' };
        expect(decidirSaque({ type: 'TRANSFER', transfer: { id: 'x', value: 1, bankAccount: { pixAddressKey: '11912345678' } } }, tel).status).toBe('APPROVED');
    });

    it('boleto: linha digitável tem de bater', () => {
        expect(decidirSaque({ type: 'BILL', bill: { id: 1, identificationField: boleto.identification_field! } }, boleto).status).toBe('APPROVED');
        expect(decidirSaque({ type: 'BILL', bill: { id: 1, identificationField: '000' } }, boleto).refuseReason).toMatch(/Linha digitável/);
    });

    it('operações que o OrçaCloud não faz são recusadas', () => {
        for (const type of ['PIX_QR_CODE', 'MOBILE_PHONE_RECHARGE', 'PIX_REFUND', 'PAYMENT_SPLIT', undefined]) {
            expect(decidirSaque({ type }, pix).status).toBe('REFUSED');
        }
    });
});

describe('escolherReserva (pedido chegou antes de o OrçaCloud gravar o id da Asaas)', () => {
    const doc = '60.897.254/0001-86';
    const reg = { ...pix, value: 100, beneficiary_document: doc, id: 'r1' };
    // O exemplo oficial do pedido de PIX traz pixAddressKey null e o cpfCnpj preenchido.
    const pedido = { type: 'TRANSFER', transfer: { id: 't1', value: 100, bankAccount: { pixAddressKey: null, cpfCnpj: '60897254000186' } } };

    it('PIX: valor e CPF/CNPJ do favorecido iguais → acha', () => {
        expect(escolherReserva(pedido, [reg])).toBe(reg);
    });

    it('PIX: mesmo valor, OUTRO favorecido → não acha (antes aprovava só pelo valor)', () => {
        const outro = { ...pedido, transfer: { ...pedido.transfer, bankAccount: { pixAddressKey: null, cpfCnpj: '11222333000181' } } };
        expect(escolherReserva(outro, [reg])).toBeNull();
    });

    it('PIX: sem documento de um dos lados → não acha (falha fechada)', () => {
        expect(escolherReserva(pedido, [{ ...reg, beneficiary_document: null }])).toBeNull();
        expect(escolherReserva({ ...pedido, transfer: { ...pedido.transfer, bankAccount: { pixAddressKey: null, cpfCnpj: null } } }, [reg])).toBeNull();
    });

    it('PIX: duas candidatas iguais → ambíguo, nenhuma', () => {
        expect(escolherReserva(pedido, [reg, { ...reg, id: 'r2' }])).toBeNull();
    });

    it('boleto: linha digitável igual → acha; diferente → não', () => {
        const b = { ...boleto, status: 'APPROVED', id: 'b1' };
        expect(escolherReserva({ type: 'BILL', bill: { id: 1, identificationField: boleto.identification_field! } }, [b])).toBe(b);
        expect(escolherReserva({ type: 'BILL', bill: { id: 1, identificationField: '1'.repeat(47) } }, [b])).toBeNull();
    });

    it('mesmoDocumento: só dígitos, 11 ou 14', () => {
        expect(mesmoDocumento('999.911.111-40', '99991111140')).toBe(true);
        expect(mesmoDocumento('', '')).toBe(false);
        expect(mesmoDocumento('123', '123')).toBe(false);
    });
});
