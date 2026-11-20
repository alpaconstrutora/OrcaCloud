// @vitest-environment jsdom
/**
 * Empreendimento › Espelho de vendas — coluna "Vendável" (plano docs/planos/2026-11-19-espelho-vendavel-vgv.md, F2.2).
 * Grava `empreendimento_units.is_vendavel` na hora; não vendável não se publica (Publicar desligado com motivo).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ listAllUnitsForEmpreendimento: vi.fn(), updateUnit: vi.fn() }));
vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: svc,
    buildCommercialAddressFields: () => ({}),
}));
vi.mock('../../services/commercialService', () => ({ commercialService: {} }));
vi.mock('../../lib/supabase', () => {
    const q: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'eq', 'in', 'order']) q[m] = () => q;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return { supabase: q };
});

import { EspelhoVendasTab } from '../../components/empreendimento/EspelhoVendasTab';
import { ConfirmProvider } from '../../components/ui/confirm';

const unidade = (id: string, name: string, is_vendavel: boolean | null) => ({
    id, name, tower_id: 't1', _tower_name: 'Torre A', floor: 1, private_area: 70, status: 'DISPONIVEL', is_vendavel, commercial_property_id: null,
});
const EMP = { id: 'emp-1', organization_id: 'org-1', name: 'Garden' } as never;
const montar = () => render(<ConfirmProvider><EspelhoVendasTab empreendimento={EMP} /></ConfirmProvider>);
const linha = async (nome: string) => (await screen.findByText(nome)).closest('tr')!;

beforeEach(() => {
    svc.listAllUnitsForEmpreendimento.mockReset().mockResolvedValue([unidade('u1', '101', true), unidade('u2', 'G1', false), unidade('u3', '102', null)]);
    svc.updateUnit.mockReset().mockResolvedValue(undefined);
});

describe('coluna Vendável', () => {
    it('mostra o estado de cada unidade (vazio = vendável)', async () => {
        montar();
        expect((within(await linha('101')).getByRole('checkbox', { name: 'Vendável — 101' }) as HTMLInputElement).checked).toBe(true);
        expect((within(await linha('G1')).getByRole('checkbox', { name: 'Vendável — G1' }) as HTMLInputElement).checked).toBe(false);
        expect((within(await linha('102')).getByRole('checkbox', { name: 'Vendável — 102' }) as HTMLInputElement).checked).toBe(true);
    });

    it('desligar grava is_vendavel = false na hora', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(within(await linha('101')).getByRole('checkbox', { name: 'Vendável — 101' }));
        expect(svc.updateUnit).toHaveBeenCalledWith('u1', { is_vendavel: false });
        expect((within(await linha('101')).getByRole('checkbox', { name: 'Vendável — 101' }) as HTMLInputElement).checked).toBe(false);
    });

    it('não vendável não se publica: o Publicar da linha fica desligado com o motivo', async () => {
        montar();
        const publicar = within(await linha('G1')).getByRole('checkbox', { name: 'Publicar — G1' }) as HTMLInputElement;
        expect(publicar.disabled).toBe(true);
        expect(publicar.closest('label')!.getAttribute('title')).toMatch(/Não vendável/);
    });

    it('falha ao gravar desfaz e avisa', async () => {
        const user = userEvent.setup();
        svc.updateUnit.mockRejectedValue(new Error('sem permissão'));
        montar();
        await user.click(within(await linha('101')).getByRole('checkbox', { name: 'Vendável — 101' }));
        await vi.waitFor(async () => expect((within(await linha('101')).getByRole('checkbox', { name: 'Vendável — 101' }) as HTMLInputElement).checked).toBe(true));
        expect(await screen.findByText(/sem permissão/)).toBeTruthy();
    });
});
