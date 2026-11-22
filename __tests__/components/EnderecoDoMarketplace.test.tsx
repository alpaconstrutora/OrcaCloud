// @vitest-environment jsdom
/**
 * Endereço do marketplace público (plano docs/planos/2026-11-22-endereco-do-marketplace.md): a vitrine aberta
 * mora em /m/<slug>, e até 22/11/2026 não havia tela para cadastrar o slug — a chave "Também no marketplace
 * público" da oportunidade não tinha efeito nas organizações sem ele (a Garden SPE era uma delas).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/imovibService', () => ({ imovibService: { getStudies: () => Promise.resolve([]), listarVersoes: () => Promise.resolve([]) } }));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: { lidoDoEstudo: () => Promise.resolve({ local: null, parecer: null, empreendimento: null, fotos: [] }) },
}));
vi.mock('../../services/storageService', () => ({ storageService: {} }));
vi.mock('../../services/speService', () => ({ speService: { list: () => Promise.resolve([]) } }));
vi.mock('../../services/taxPayableService', () => ({ taxPayableService: { generateAllForOrganization: vi.fn() } }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import {
    normalizarEnderecoDoMarketplace, enderecoParaGravar, urlDoMarketplace, ehEnderecoDoMarketplaceRepetido,
} from '../../utils/enderecoDoMarketplace';
import { organizationService } from '../../services/organizationService';
import OrganizationPage from '../../components/OrganizationPage';
import { ConfirmProvider } from '../../components/ui/confirm';
import OpportunityForm from '../../components/investor/OpportunityForm';
import { useStore } from '../../store/useStore';
import type { Organization } from '../../types';

const org = (extra: Partial<Organization> = {}): Organization => ({ id: 'garden', name: 'Garden SPE', address: {}, settings: {}, ...extra });

describe('regra do endereço', () => {
    it('normaliza o que se digita: minúsculo, sem acento, só letras, números e hífen', () => {
        expect(normalizarEnderecoDoMarketplace('Garden Cambuhy SPE!')).toBe('garden-cambuhy-spe-');
        expect(normalizarEnderecoDoMarketplace('Construção  do Edifício')).toBe('construcao-do-edificio');
        expect(normalizarEnderecoDoMarketplace('--alpa')).toBe('alpa');
    });
    it('grava sem hífen no fim; vazio vira null (sem vitrine)', () => {
        expect(enderecoParaGravar('garden-cambuhy-')).toBe('garden-cambuhy');
        expect(enderecoParaGravar('')).toBeNull();
        expect(enderecoParaGravar(null)).toBeNull();
    });
    it('URL da vitrine = origem + /m/ + endereço; sem endereço, nenhuma', () => {
        expect(urlDoMarketplace('garden-cambuhy', 'https://orcacloud.vercel.app/')).toBe('https://orcacloud.vercel.app/m/garden-cambuhy');
        expect(urlDoMarketplace(null, 'https://x')).toBeNull();
    });
    it('reconhece o endereço repetido pelo índice único', () => {
        expect(ehEnderecoDoMarketplaceRepetido({ code: '23505', message: 'duplicate key value violates unique constraint "organizations_slug_key"' })).toBe(true);
        expect(ehEnderecoDoMarketplaceRepetido({ code: '23505', message: 'idx_organizations_code' })).toBe(false);
    });
});

describe('o save da organização grava o endereço', () => {
    it('manda normalizado; vazio = null; ausente no objeto = não mexe', () => {
        expect(organizationService.colunasParaSalvar(org({ slug: 'garden-cambuhy-' })).slug).toBe('garden-cambuhy');
        expect(organizationService.colunasParaSalvar(org({ slug: '' })).slug).toBeNull();
        expect('slug' in organizationService.colunasParaSalvar(org())).toBe(false);
    });
});

describe('Minha Organização › Organização › Marketplace público', () => {
    it('o que se digita vira endereço válido e vai no save', async () => {
        const user = userEvent.setup();
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(<ConfirmProvider><OrganizationPage organization={org()} onUpdate={onUpdate} /></ConfirmProvider>);
        const campo = screen.getByLabelText('Endereço do marketplace') as HTMLInputElement;
        await user.type(campo, 'Garden Cambuhy');
        expect(campo.value).toBe('garden-cambuhy');
        expect(screen.queryByText('Abrir a vitrine')).toBeNull();   // ainda não gravado
        await user.click(screen.getByRole('button', { name: /Salvar organização/ }));
        await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ slug: 'garden-cambuhy' })));
    });

    it('com endereço gravado, oferece abrir a vitrine', () => {
        render(<ConfirmProvider><OrganizationPage organization={org({ slug: 'garden-cambuhy' })} onUpdate={vi.fn()} /></ConfirmProvider>);
        expect(screen.getByText('Abrir a vitrine').closest('a')!.getAttribute('href')).toBe(`${window.location.origin}/m/garden-cambuhy`);
    });
});

describe('a oportunidade avisa quando a organização não tem vitrine', () => {
    beforeEach(() => useStore.setState({ organizations: [] }));

    it('sem endereço: diz que a vitrine não abre e onde cadastrar', async () => {
        useStore.setState({ organizations: [org()] });
        render(<OpportunityForm initial={{ title: 'Garden' }} organizationId="garden" onSave={vi.fn()} onClose={vi.fn()} />);
        expect(await screen.findByText(/ainda não tem endereço do marketplace/)).toBeTruthy();
    });

    it('com endereço: mostra o link da vitrine', async () => {
        useStore.setState({ organizations: [org({ slug: 'garden-cambuhy' })] });
        render(<OpportunityForm initial={{ title: 'Garden' }} organizationId="garden" onSave={vi.fn()} onClose={vi.fn()} />);
        expect((await screen.findByText(`${window.location.origin}/m/garden-cambuhy`)).getAttribute('href')).toBe(`${window.location.origin}/m/garden-cambuhy`);
    });
});
