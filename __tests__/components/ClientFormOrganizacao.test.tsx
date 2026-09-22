// @vitest-environment jsdom
/**
 * Minha Organização › Meus Clientes › novo cliente — erro de 2026-09-22:
 *
 *   POST /rest/v1/clients 403
 *   42501 new row violates row-level security policy for table "clients"
 *
 * Causa: o campo "Organização" do formulário oferecia (a) "Todas as
 * Organizações", que grava `organization_id` NULL, e (b) TODAS as organizações
 * de `useStore().organizations` — lista que inclui organizações das quais o
 * usuário não é membro, porque a RLS de `organizations` é mais frouxa que a das
 * tabelas de dados (medido em 22/09/2026: 4 no seletor, membro de 1). A policy
 * de `clients` exige `is_org_member(organization_id)`, que recusa as duas.
 *
 * O que este teste trava:
 *  1. o campo só lista organizações em que o usuário PODE gravar;
 *  2. não existe a opção "Todas as Organizações" (cliente é de UMA org —
 *     exceção 4 da REGRA #5);
 *  3. topo em "Todas" com uma única organização gravável → já vem preenchida;
 *  4. com N graváveis o campo nasce vazio e salvar sem escolher NÃO chama o
 *     serviço — avisa na tela, em vez de levar 42501 do banco;
 *  5. gravação recusada (onSubmit devolve null) não fecha o formulário.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/clientCategoryService', () => ({
    clientCategoryService: { list: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Vendas' }]) },
}));
vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/clientEmpreendimentoService', () => ({
    clientEmpreendimentoService: { listIdsByClient: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/masterDataService', () => ({
    masterDataService: { listStates: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../lib/supabase', () => ({
    supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } },
}));

import ClientForm from '../../components/ClientForm';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';

const EMAIL = 'dev@exemplo.com';

const org = (id: string, name: string, membros: string[]) => ({
    id,
    name,
    members: membros.map((email, i) => ({ id: `${id}-m${i}`, email, name: email, role: 'member' })),
} as never);

/** Membro de UMA das quatro — o cenário real medido no banco em 22/09/2026. */
const MINHA = org('org-1', 'Alpa Construtora', [EMAIL]);
const OUTRA = org('org-2', 'ALPA Empreendimentos', ['outro@exemplo.com']);
const SPE = org('org-3', 'Garden Cambuhy SPE', ['outro@exemplo.com']);

const montar = (organizations: unknown[], activeOrganizationId: string | null, onSubmit = vi.fn()) => {
    useStore.setState({
        organizations: organizations as never,
        activeOrganizationId,
        activeEmpresaId: null,
        currentProfile: { ...useStore.getState().currentProfile, email: EMAIL },
    } as never);
    const onClose = vi.fn();
    render(<ConfirmProvider><ClientForm onSubmit={onSubmit} onClose={onClose} /></ConfirmProvider>);
    return { onSubmit, onClose };
};

/** Os rótulos do formulário não usam `htmlFor`: acha-se o campo pelo bloco do rótulo. */
const campo = <T extends HTMLElement>(rotulo: string): T => {
    const bloco = screen.getByText(rotulo).parentElement as HTMLElement;
    return bloco.querySelector('select, input') as T;
};
const campoOrganizacao = () => campo<HTMLSelectElement>('Organização');

describe('ClientForm — organização do cadastro', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lista só as organizações graváveis e não oferece "Todas as Organizações"', async () => {
        montar([MINHA, OUTRA, SPE], null);

        const select = campoOrganizacao();
        const rotulos = Array.from(select.options).map(o => o.textContent);
        expect(rotulos).toEqual(['Alpa Construtora']);
        expect(rotulos.join(' ')).not.toMatch(/Todas as Organiza/i);
        expect(Array.from(select.options).some(o => o.value === '')).toBe(false);
    });

    it('topo em "Todas" com uma única organização gravável: já vem preenchida', () => {
        montar([MINHA, OUTRA, SPE], null);
        expect(campoOrganizacao().value).toBe('org-1');
    });

    it('topo apontando para uma organização: usa ela (REGRA #5)', () => {
        montar([MINHA, org('org-4', 'Segunda Minha', [EMAIL]), OUTRA], 'org-4');
        expect(campoOrganizacao().value).toBe('org-4');
    });

    it('N graváveis e topo em "Todas": nasce vazio e salvar sem escolher não chama o serviço', async () => {
        const { onSubmit } = montar([MINHA, org('org-4', 'Segunda Minha', [EMAIL]), OUTRA], null);

        expect(campoOrganizacao().value).toBe('');

        fireEvent.change(campo<HTMLInputElement>('Nome completo / Razão social'), { target: { value: 'Cliente Teste' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar cliente/i }));

        expect(await screen.findByText('Escolha a organização do cliente para salvar.')).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('gravação recusada não fecha o formulário', async () => {
        const { onSubmit, onClose } = montar([MINHA, OUTRA, SPE], null, vi.fn().mockResolvedValue(null));

        fireEvent.change(campo<HTMLInputElement>('Nome completo / Razão social'), { target: { value: 'Cliente Teste' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar cliente/i }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit.mock.calls[0][0].organization_id).toBe('org-1');
        expect(onClose).not.toHaveBeenCalled();
    });
});
