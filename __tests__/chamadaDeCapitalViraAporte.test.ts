/**
 * Fase 7.1 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md: pagar uma chamada de
 * capital é UMA transação no banco (item, capital_paid, status da chamada e o aporte do investidor).
 * O serviço não pode voltar a gravar as tabelas uma a uma pelo cliente.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('../lib/supabase', () => ({
    supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}));

import { capitalCallService, type CapitalCallItem } from '../services/capitalCallService';

const item: CapitalCallItem = {
    id: 'item-1', organization_id: 'org', capital_call_id: 'cc-1', spe_partner_id: 'socio-1',
    amount_due: 1000, amount_paid: 0, status: 'pendente',
};

beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation(() => { throw new Error('pagamento não grava tabela pelo cliente'); });
});

describe('capitalCallService.registerPayment', () => {
    it('chama só a RPC da transação, com item, valor e referência', async () => {
        rpc.mockResolvedValue({ data: { status: 'parcial', sem_obra: false }, error: null });
        await expect(capitalCallService.registerPayment(item, 400, 'PIX 123')).resolves.toEqual({ semObra: false });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('fn_chamada_de_capital_registrar_pagamento', { p_item_id: 'item-1', p_valor: 400, p_referencia: 'PIX 123' });
        expect(from).not.toHaveBeenCalled();
    });

    it('SPE sem obra: devolve semObra para a tela avisar', async () => {
        rpc.mockResolvedValue({ data: { status: 'pago', sem_obra: true }, error: null });
        await expect(capitalCallService.registerPayment(item, 1000)).resolves.toEqual({ semObra: true });
    });

    it('erro do banco sobe (ex.: sem permissão)', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Sem permissão' } });
        await expect(capitalCallService.registerPayment(item, 10)).rejects.toMatchObject({ code: '42501' });
    });
});

describe('migration 990000', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/aplicar_20271121990000_chamada_de_capital_vira_aporte.sql'), 'utf8')
        .replace(/--.*$/gm, '');
    it('lança o aporte liquidado na obra da SPE, ligado ao item', () => {
        expect(sql).toMatch(/INSERT INTO public\.investor_contributions/);
        expect(sql).toMatch(/'aporte'/);
        expect(sql).toMatch(/'liquidado'/);
        expect(sql).toMatch(/capital_call_item_id/);
    });
    it('roda como quem chama e sem EXECUTE para anon', () => {
        expect(sql).toMatch(/SECURITY INVOKER/);
        expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_chamada_de_capital_registrar_pagamento\(uuid, numeric, text, date\) FROM PUBLIC, anon/);
    });
});
