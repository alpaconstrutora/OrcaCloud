// @vitest-environment jsdom
/**
 * Ficha da organização › Organização: salvar o regime não pode apagar o que outra aba
 * gravou depois que a ficha abriu (Módulos, 27/11/2026). O `formData` é a cópia de
 * quando a ficha abriu; o `settings` tem de sair do registro atual (prop).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../services/taxPayableService', () => ({ taxPayableService: { generateAllForOrganization: vi.fn(async () => {}) } }));

import OrganizationPage from '../../components/OrganizationPage';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { Organization } from '../../types';

const org = (settings: Record<string, unknown>): Organization =>
    ({ id: 'o1', name: 'Condomínio', address: {}, settings: { tipo_pessoa: 'PJ', ...settings } }) as unknown as Organization;

describe('OrganizationPage — settings do registro atual', () => {
    it('trocar o regime mantém os módulos gravados por outra aba', async () => {
        const onUpdate = vi.fn(async () => {});
        const { rerender } = render(<OrganizationPage organization={org({})} onUpdate={onUpdate} />, { wrapper: ConfirmProvider });
        // a aba Módulos salvou e a lista recarregou: mesma org, settings novo
        rerender(<OrganizationPage organization={org({ modulos_da_organizacao: { obras: false } })} onUpdate={onUpdate} />);

        fireEvent.change(screen.getByDisplayValue(/Regime de Caixa/), { target: { value: 'COMPETENCIA' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar organização/ }));

        await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
        const enviado = (onUpdate.mock.calls[0] as unknown as [Organization])[0];
        expect(enviado.settings).toMatchObject({ modulos_da_organizacao: { obras: false }, tax_recognition_regime: 'COMPETENCIA', tipo_pessoa: 'PJ' });
    });
});
