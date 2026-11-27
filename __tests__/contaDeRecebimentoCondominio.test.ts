/**
 * Condomínio › Financeiro: "Conta de recebimento" (27/11/2026).
 * Plano: docs/planos/2026-11-27-condominio-conta-de-recebimento.md
 *
 * O motivo que desliga "Emitir boletos": sem conta, conta repetida; leitura pendente não trava.
 */
import { describe, it, expect } from 'vitest';
import { motivoSemContaDeRecebimento } from '../utils/contaDeRecebimentoCondominio';

const CONTA = { id: 'a', nome: 'Asaas BV', propria: true, orgDona: 'Condomínio Bella Vista', ambiente: 'production' as const };

describe('motivoSemContaDeRecebimento', () => {
    it('ainda não lida (ou leitura falhou) não trava — o servidor decide', () => {
        expect(motivoSemContaDeRecebimento(null)).toBeNull();
    });
    it('com conta (própria ou emprestada) pode emitir', () => {
        expect(motivoSemContaDeRecebimento({ orgNome: 'Condomínio Bella Vista', conta: CONTA, problema: null })).toBeNull();
        expect(motivoSemContaDeRecebimento({ orgNome: 'X', conta: { ...CONTA, propria: false }, problema: null })).toBeNull();
    });
    it('sem conta diz onde cadastrar e em qual organização', () => {
        expect(motivoSemContaDeRecebimento({ orgNome: 'Condomínio Bella Vista', conta: null, problema: null }))
            .toBe('Nenhuma conta Asaas recebe por este condomínio. Cadastre em Minha Organização › Contas na organização Condomínio Bella Vista.');
        expect(motivoSemContaDeRecebimento({ orgNome: null, conta: null, problema: null }))
            .toBe('Nenhuma conta Asaas recebe por este condomínio. Cadastre em Minha Organização › Contas.');
    });
    it('mais de uma conta: a frase da recusa da emissão', () => {
        const p = 'A organização tem 2 contas Asaas ativas — desative as que não usa em Minha Organização › Contas.';
        expect(motivoSemContaDeRecebimento({ orgNome: 'X', conta: null, problema: p })).toBe(p);
    });
});
