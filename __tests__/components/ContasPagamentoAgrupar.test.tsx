// @vitest-environment jsdom
/**
 * "Agrupar" em Minha Organização › Contas de Pagamento (guia de UI §6.12): campo, ordem dos
 * grupos Crescente/Decrescente e recolher/expandir todos. Tela montada de verdade.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import FinancialRegistryManager from '../../components/FinancialRegistryManager';
import { Building2 } from 'lucide-react';

const SELETOR = 'Agrupar as contas';
const ORGS = new Map([['o1', 'Alpa'], ['o2', 'Garden']]);

const ITENS = [
    { id: 'a', name: 'Conta Sicredi', code: '001', bank: 'Sicredi', organization_id: 'o1' },
    { id: 'b', name: 'Conta Itaú', code: '002', bank: 'Itaú', organization_id: 'o2' },
    { id: 'c', name: 'Caixa da obra', code: '003', organization_id: 'o2', is_active: false },
    { id: 'd', name: 'Itaú 2', code: '004', bank: 'Itaú', organization_id: 'o1' },
];

function montar(props: Partial<React.ComponentProps<typeof FinancialRegistryManager>> = {}) {
    return render(
        <FinancialRegistryManager
            title="Contas de Pagamento" description="Contas" icon={Building2}
            items={ITENS} onSave={vi.fn(async () => {})} onDelete={vi.fn(async () => {})}
            onToggleActive={vi.fn(async () => {})}
            showCode showBankDetails showDescription
            agrupar showOrganization organizationNameById={ORGS}
            {...props}
        />,
    );
}

const rotulosDeGrupo = () => Array.from(document.querySelectorAll('span.font-semibold.text-slate-800')).map(e => e.textContent);
const agrupar = (campo: string) => fireEvent.change(screen.getByTitle(SELETOR), { target: { value: campo } });

beforeEach(() => { window.localStorage.clear(); });

describe('Contas de Pagamento › Agrupar', () => {
    it('sem agrupamento: lista plana; ordem dos grupos e recolher ficam desligados com o motivo', () => {
        montar();
        expect(rotulosDeGrupo()).toEqual([]);
        expect(screen.getByText('Conta Sicredi')).toBeTruthy();
        expect((screen.getByLabelText('Ordem dos grupos') as HTMLSelectElement).disabled).toBe(true);
        const recolher = screen.getByLabelText('Recolher todos os grupos') as HTMLButtonElement;
        expect(recolher.disabled).toBe(true);
        expect(recolher.title).toMatch(/Escolha um campo em "Agrupar"/);
    });

    it('por Banco: grupos A→Z, "Sem banco" no fim; Decrescente inverte e mantém o "Sem banco" no fim', () => {
        montar();
        agrupar('banco');
        expect(rotulosDeGrupo()).toEqual(['Itaú', 'Sicredi', 'Sem banco']);
        fireEvent.change(screen.getByLabelText('Ordem dos grupos'), { target: { value: 'desc' } });
        expect(rotulosDeGrupo()).toEqual(['Sicredi', 'Itaú', 'Sem banco']);
    });

    it('por Situação: Ativa antes de Inativa', () => {
        montar();
        agrupar('situacao');
        expect(rotulosDeGrupo()).toEqual(['Ativa', 'Inativa']);
    });

    it('por Organização (só em "Todas"): usa o nome que a coluna mostra; cadastro, sem total em R$', () => {
        montar();
        agrupar('organizacao');
        expect(rotulosDeGrupo()).toEqual(['Alpa', 'Garden']);
        expect(document.body.textContent).not.toContain('R$');
    });

    it('com organização no topo a opção "Organização" não existe, e o campo guardado vale como sem agrupamento', () => {
        window.localStorage.setItem('financialRegistryGroupBy:Contas de Pagamento', JSON.stringify('organizacao'));
        montar({ showOrganization: false });
        expect(Array.from((screen.getByTitle(SELETOR) as HTMLSelectElement).options).map(o => o.value)).toEqual(['none', 'banco', 'situacao']);
        expect(rotulosDeGrupo()).toEqual([]);
    });

    it('recolher esconde as linhas do grupo; "recolher todos" e "expandir todos" alternam', () => {
        montar();
        agrupar('banco');
        const itau = screen.getByText('Itaú', { selector: 'span.font-semibold.text-slate-800' });
        expect(itau.parentElement!.textContent).toContain('2');             // contagem do grupo inteiro
        fireEvent.click(itau.closest('div')!);
        expect(screen.queryByText('Conta Itaú')).toBeNull();
        expect(screen.getByText('Conta Sicredi')).toBeTruthy();

        fireEvent.click(screen.getByLabelText('Expandir todos os grupos'));   // havia um recolhido → expande tudo
        expect(screen.getByText('Conta Itaú')).toBeTruthy();

        fireEvent.click(screen.getByLabelText('Recolher todos os grupos'));
        expect(screen.queryByText('Conta Itaú')).toBeNull();
        expect(screen.queryByText('Conta Sicredi')).toBeNull();
        expect(rotulosDeGrupo()).toEqual(['Itaú', 'Sicredi', 'Sem banco']);   // cabeçalhos continuam
    });

    it('sem a prop `agrupar` (Plano de Contas) os controles não existem', () => {
        montar({ agrupar: false, title: 'Plano de Contas', showBankDetails: false, showDescription: false });
        expect(screen.queryByTitle(SELETOR)).toBeNull();
        expect(screen.queryByLabelText('Ordem dos grupos')).toBeNull();
    });
});
