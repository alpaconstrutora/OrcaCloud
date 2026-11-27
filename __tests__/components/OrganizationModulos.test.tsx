// @vitest-environment jsdom
/**
 * Ficha da organização › Módulos (27/11/2026) — docs/planos/2026-11-27-modulos-por-organizacao.md.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const salvarModulos = vi.fn();
vi.mock('../../services/organizationService', () => ({
    organizationService: { salvarModulosDaOrganizacao: (...a: unknown[]) => salvarModulos(...a) },
}));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { useStore } from '../../store/useStore';
import OrganizationModulos from '../../components/OrganizationModulos';
import type { Organization } from '../../types';

const EU = 'eu@x.com';
const org = (role: string, settings: Record<string, unknown> = {}): Organization =>
    ({ id: 'o1', name: 'Condomínio', members: [{ id: '1', email: EU, name: 'Eu', role, joinedAt: '', permissions: {} }], settings }) as unknown as Organization;

const fetchOrganizations = vi.fn(async () => {});

beforeEach(() => {
    salvarModulos.mockReset().mockResolvedValue({});
    fetchOrganizations.mockClear();
    useStore.setState({ session: { user: { id: 'u', email: EU } }, fetchOrganizations } as never);
});

describe('OrganizationModulos', () => {
    it('desligar Engenharia e salvar grava o estado e recarrega as organizações', async () => {
        const onDirty = vi.fn();
        render(<OrganizationModulos organization={org('admin')} onDirtyChange={onDirty} />);
        const salvar = screen.getByRole('button', { name: /Salvar módulos/ });
        expect(salvar).toBeDisabled();

        fireEvent.click(screen.getByRole('checkbox', { name: 'Engenharia' }));
        expect(onDirty).toHaveBeenLastCalledWith(true);
        // Riscos e Qualidade desligam junto e travam com o motivo
        expect(screen.getByRole('checkbox', { name: 'Riscos' })).not.toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Riscos' })).toBeDisabled();
        expect(screen.getAllByText('Desligado junto com Engenharia.').length).toBe(2);

        fireEvent.click(salvar);
        await waitFor(() => expect(salvarModulos).toHaveBeenCalledTimes(1));
        expect(salvarModulos.mock.calls[0][0]).toBe('o1');
        expect(salvarModulos.mock.calls[0][1]).toMatchObject({ obras: false, financeiro: true });
        await waitFor(() => expect(fetchOrganizations).toHaveBeenCalled());
    });

    it('mostra o que está gravado (chave ausente = ligado)', () => {
        render(<OrganizationModulos organization={org('owner', { modulos_da_organizacao: { financeiro: false } })} />);
        expect(screen.getByRole('checkbox', { name: 'Financeiro' })).not.toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Engenharia' })).toBeChecked();
    });

    it('membro comum vê só leitura, com o motivo no botão', () => {
        render(<OrganizationModulos organization={org('member')} />);
        expect(screen.getByRole('checkbox', { name: 'Engenharia' })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Salvar módulos/ })).toHaveAttribute('title', expect.stringMatching(/proprietário ou um administrador/));
    });

    it('erro do banco aparece na tela e não marca como salvo', async () => {
        salvarModulos.mockRejectedValue(new Error('Sem permissão para alterar esta organização'));
        render(<OrganizationModulos organization={org('admin')} />);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Fiscal e NF-e' }));
        fireEvent.click(screen.getByRole('button', { name: /Salvar módulos/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão');
        expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();
    });
});
