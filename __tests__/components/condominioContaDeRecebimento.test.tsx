// @vitest-environment jsdom
/**
 * Condomínio › Financeiro: "Conta de recebimento" (27/11/2026).
 * Plano: docs/planos/2026-11-27-condominio-conta-de-recebimento.md
 *
 * O que fica travado:
 *  1. sem conta Asaas: a faixa diz em qual organização cadastrar, e "Emitir boletos" fica
 *     desligado com o mesmo motivo; "Cadastrar conta" leva a Minha Organização › Contas;
 *  2. com conta emprestada: a faixa diz o nome, a org dona e que é sandbox; emitir liga.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rateioSvc = vi.hoisted(() => ({
    getCentrosDeCusto: vi.fn(), listar: vi.fn(), aprovacaoDesatualizada: vi.fn(),
    listarDisponiveis: vi.fn(), listarLancamentos: vi.fn(),
}));
const cobrancaSvc = vi.hoisted(() => ({ contarEmitidas: vi.fn(), contaDeRecebimento: vi.fn() }));
vi.mock('../../services/condominioRateioService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/condominioRateioService')>()),
    condominioRateioService: rateioSvc,
}));
vi.mock('../../services/condominioCobrancaService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/condominioCobrancaService')>()),
    condominioCobrancaService: cobrancaSvc,
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import FinanceiroTab from '../../components/condominio/FinanceiroTab';
import { useStore } from '../../store/useStore';
import type { Empreendimento } from '../../types/empreendimento';

const EMP = { id: 'e1', name: 'Bella Vista', organization_id: 'org-construtora', condominio_org_id: 'org-bv' } as unknown as Empreendimento;
const RATEIO = {
    id: 'r1', empreendimento_id: 'e1', organization_id: 'org-bv', competencia: '2026-11-01', tipo: 'ORDINARIO',
    criterio: 'FRACAO_IDEAL', status: 'FECHADO', total_despesas: 1000, total_rateado: 1000, number: 'R-1',
    cobranca_gerada_em: '2026-11-20T10:00:00Z', fechado_em: '2026-11-19T10:00:00Z',
    created_at: '2026-11-18T10:00:00Z', updated_at: '2026-11-20T10:00:00Z',
};

const montar = () => render(<ConfirmProvider><FinanceiroTab empreendimento={EMP} /></ConfirmProvider>);
const botaoEmitir = () => screen.getByTitle('Emitir boletos no Asaas (não se desfaz)').closest('button') as HTMLButtonElement;

beforeEach(() => {
    Object.values(rateioSvc).forEach(f => f.mockReset());
    Object.values(cobrancaSvc).forEach(f => f.mockReset());
    rateioSvc.getCentrosDeCusto.mockResolvedValue([{ id: 'cc1', code: '010', name: 'Condomínio Bella Vista' }]);
    rateioSvc.listar.mockResolvedValue([RATEIO]);
    rateioSvc.aprovacaoDesatualizada.mockResolvedValue({});
    rateioSvc.listarDisponiveis.mockResolvedValue([]);
    rateioSvc.listarLancamentos.mockResolvedValue([]);
    cobrancaSvc.contarEmitidas.mockResolvedValue({ r1: { emitidas: 0, total: 8 } });
});

describe('Condomínio › Financeiro › conta de recebimento', () => {
    it('1. sem conta: faixa com a organização, Emitir desligado com o motivo, atalho para Contas', async () => {
        cobrancaSvc.contaDeRecebimento.mockResolvedValue({ orgNome: 'Condomínio Bella Vista', conta: null, problema: null });
        montar();
        const motivo = 'Nenhuma conta Asaas recebe por este condomínio. Cadastre em Minha Organização › Contas na organização Condomínio Bella Vista.';
        expect(await screen.findByText(motivo)).toBeTruthy();
        expect(cobrancaSvc.contaDeRecebimento).toHaveBeenCalledWith('org-bv');
        await waitFor(() => expect(botaoEmitir().disabled).toBe(true));
        expect(botaoEmitir().closest('span')?.getAttribute('title')).toBe(motivo);

        fireEvent.click(screen.getByRole('button', { name: 'Cadastrar conta' }));
        expect(useStore.getState().managementTab).toBe('accounts');
        expect(window.location.hash).toBe('#/organization');
    });

    it('2. conta emprestada em sandbox: nome, org dona e aviso; Emitir ligado', async () => {
        cobrancaSvc.contaDeRecebimento.mockResolvedValue({
            orgNome: 'Condomínio Bella Vista', problema: null,
            conta: { id: 'a1', nome: 'Asaas', propria: false, orgDona: 'Alpa Construtora', ambiente: 'sandbox' },
        });
        montar();
        expect(await screen.findByText('Boletos saem pela conta')).toBeTruthy();
        expect(screen.getByText('Alpa Construtora')).toBeTruthy();
        expect(screen.getByText(/Asaas de teste — sandbox/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Ver contas' })).toBeTruthy();
        await waitFor(() => expect(botaoEmitir().disabled).toBe(false));
    });
});
