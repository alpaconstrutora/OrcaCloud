// @vitest-environment jsdom
/**
 * Conta Asaas › a configuração grava no "Salvar" do drawer (18/10/2026).
 *
 * O defeito: a seção tinha um botão próprio "Salvar configuração Asaas" ao lado
 * do "Salvar" do drawer. O usuário desmarcou o modo piloto, clicou no Salvar do
 * drawer e a mudança se perdeu sem aviso. E "Testar conexão" recarregava do banco
 * e desfazia a edição pendente.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const GRAVADO = {
    payment_account_id: 'conta-1', env: 'production', ativo: true, piloto: true,
    teto_por_pagamento: 500, teto_por_dia: 2000, teto_avulso: 200,
    tem_chave: true, chave_atualizada_em: null, extrato_desde: '2026-10-17',
    extrato_sincronizado_ate: null, saldo: 0, saldo_em: null, ultimo_erro: null, ultimo_erro_em: null,
};

const salvar = vi.fn(async (_cfg: unknown) => {});
const get = vi.fn(async () => ({ ...GRAVADO }));
const testar = vi.fn(async () => ({ ok: true, saldo: 10, env: 'production' }));

vi.mock('../../services/asaasContaService', () => ({
    asaasContaService: { get: () => get(), salvar: (c: unknown) => salvar(c), testar: () => testar() },
    CONTA_ASAAS_PADRAO: {},
}));

import ContaAsaasSecao from '../../components/financeiro/ContaAsaasSecao';

function montar() {
    let registrado: (() => Promise<void>) | null = null;
    const registrar = (fn: (() => Promise<void>) | null) => { registrado = fn; };
    render(<ContaAsaasSecao paymentAccountId="conta-1" registrarAoSalvar={registrar} />);
    return { salvarDoDrawer: () => registrado!() };
}

const piloto = () => screen.getByRole('checkbox', { name: /Modo piloto/ }) as HTMLInputElement;

describe('ContaAsaasSecao — salvar pelo drawer', () => {
    beforeEach(() => { salvar.mockClear(); get.mockClear(); testar.mockClear(); });

    it('desmarcar o piloto e clicar no Salvar do drawer grava piloto=false', async () => {
        const { salvarDoDrawer } = montar();
        await waitFor(() => expect(piloto().checked).toBe(true));
        fireEvent.click(piloto());
        expect(screen.getByText(/grava ao clicar em Salvar/)).toBeTruthy();
        await act(() => salvarDoDrawer());
        expect(salvar).toHaveBeenCalledTimes(1);
        expect(salvar.mock.calls[0][0]).toMatchObject({ payment_account_id: 'conta-1', piloto: false });
    });

    it('sem mudança, o Salvar do drawer não chama a Asaas', async () => {
        const { salvarDoDrawer } = montar();
        await waitFor(() => expect(piloto().checked).toBe(true));
        await act(() => salvarDoDrawer());
        expect(salvar).not.toHaveBeenCalled();
    });

    it('o botão próprio de salvar some quando a seção está no drawer', async () => {
        montar();
        await waitFor(() => expect(piloto()).toBeTruthy());
        expect(screen.queryByText('Salvar configuração Asaas')).toBeNull();
    });

    it('"Testar conexão" não desfaz o piloto desmarcado e ainda não salvo', async () => {
        const { salvarDoDrawer } = montar();
        await waitFor(() => expect(piloto().checked).toBe(true));
        fireEvent.click(piloto());
        fireEvent.click(screen.getByText(/Testar conexão/));
        await waitFor(() => expect(testar).toHaveBeenCalled());
        await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
        expect(piloto().checked).toBe(false);
        await act(() => salvarDoDrawer());
        expect(salvar.mock.calls[0][0]).toMatchObject({ piloto: false });
    });

    it('falha da Asaas vira erro com o motivo (o drawer fica aberto)', async () => {
        salvar.mockRejectedValueOnce(new Error('Só proprietário ou administrador da organização configura a conta Asaas.'));
        const { salvarDoDrawer } = montar();
        await waitFor(() => expect(piloto().checked).toBe(true));
        fireEvent.click(piloto());
        await expect(salvarDoDrawer()).rejects.toThrow(/configuração da conta Asaas não: Só proprietário/);
    });
});
