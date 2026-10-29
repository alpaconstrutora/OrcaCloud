// @vitest-environment jsdom
/**
 * Minha Organização › Contas de Pagamento: campo "Empresa" (29/10/2026).
 * Até aqui nenhuma tela gravava `payment_accounts.empresa_id`, e o Dashboard da Conciliação
 * mostrava "Sem empresa" sem ter onde resolver. Toda organização PJ tem uma empresa (a matriz):
 * o app já sabe a resposta e preenche; a pessoa física não tem nenhuma, e o campo diz isso.
 * Plano: docs/planos/2026-10-29-conciliacao-conta-desativada-e-empresa-da-conta.md.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import FinancialRegistryManager from '../../components/FinancialRegistryManager';
import { Building2 } from 'lucide-react';

const EMPRESAS = [
    { id: 'emp-alpa', orgId: 'org-alpa', name: 'Alpa Construtora e Incorporadora' },
    { id: 'emp-garden', orgId: 'org-garden', name: 'Garden Cambuhy SPE' },
];

function montar(props: Partial<React.ComponentProps<typeof FinancialRegistryManager>> = {}) {
    const onSave = vi.fn(async () => {});
    render(
        <FinancialRegistryManager
            title="Contas de Pagamento" description="Contas" icon={Building2}
            items={[]} onSave={onSave} onDelete={vi.fn(async () => {})}
            showCode showBankDetails showDescription
            empresaOptions={EMPRESAS}
            {...props}
        />,
    );
    return onSave;
}

describe('Contas de Pagamento — empresa da conta', () => {
    it('conta nova numa organização com uma empresa: o campo já vem com a matriz, e grava', async () => {
        const onSave = montar({ defaultOrganizationId: 'org-alpa' });
        fireEvent.click(screen.getByRole('button', { name: /Novo cadastro/ }));
        const campo = await screen.findByLabelText('Empresa') as HTMLSelectElement;
        expect(campo.value).toBe('emp-alpa');
        fireEvent.change(screen.getByPlaceholderText('Ex: 3.01.02'), { target: { value: '001' } });
        fireEvent.change(screen.getByPlaceholderText('Ex: Banco Itaú'), { target: { value: 'Asaas' } });
        fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ empresa_id: 'emp-alpa' })));
    });

    it('conta existente sem empresa: a sugestão preenche o vazio, mas não troca uma escolhida', async () => {
        montar({
            defaultOrganizationId: 'org-alpa',
            items: [
                { id: 'a1', name: 'Asaas', code: '001', organization_id: 'org-alpa', empresa_id: null },
                { id: 'a2', name: 'Outra', code: '002', organization_id: 'org-alpa', empresa_id: 'emp-x' },
            ],
        });
        fireEvent.click(screen.getByText('Asaas'));
        expect((await screen.findByLabelText('Empresa') as HTMLSelectElement).value).toBe('emp-alpa');
    });

    it('organização sem empresa (pessoa física): o campo explica, sem select vazio', async () => {
        montar({ defaultOrganizationId: 'org-pf' });
        fireEvent.click(screen.getByRole('button', { name: /Novo cadastro/ }));
        expect(await screen.findByText(/não tem empresa cadastrada \(pessoa física\)/)).toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Empresa' })).toBeNull();
    });

    it('em "Todas": trocar a organização troca a empresa sugerida', async () => {
        montar({ organizations: [{ id: 'org-alpa', name: 'Alpa' }, { id: 'org-garden', name: 'Garden' }] });
        fireEvent.click(screen.getByRole('button', { name: /Novo cadastro/ }));
        expect(await screen.findByText('Escolha a organização primeiro.')).toBeInTheDocument();
        fireEvent.change(screen.getByDisplayValue('Selecione uma organização…'), { target: { value: 'org-garden' } });
        expect((screen.getByLabelText('Empresa') as HTMLSelectElement).value).toBe('emp-garden');
    });

    it('sem empresaOptions (Plano de Contas) o campo não aparece', () => {
        montar({ empresaOptions: undefined, showBankDetails: false });
        fireEvent.click(screen.getByRole('button', { name: /Novo cadastro/ }));
        expect(screen.queryByText('Empresa')).toBeNull();
    });
});
