import '@testing-library/jest-dom';
// @vitest-environment jsdom
/**
 * Condomínio › Manutenção › campo "Sistema predial" — docs/planos/2026-10-15-condominio-sistema-predial-crud.md
 *
 * O campo abre um seletor em drawer com o cadastro dentro. O que trava:
 *   1. escolher grava o id e fecha; "Sem sistema definido" limpa;
 *   2. cadastrar grava na org DO REGISTRO, com slug derivado, e já escolhe o novo;
 *   3. nome repetido (sem caixa/acento) é recusado sem ir ao banco;
 *   4. editar renomeia sem trocar o slug;
 *   5. excluir: sem uso pede confirmação e exclui; em uso oferece DESATIVAR;
 *   6. desativado sai da escolha e pode ser reativado;
 *   7. lista vazia oferece cadastrar os sistemas padrão.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { BuildingSystem } from '../../types/condominio';

const svc = {
    createSystem: vi.fn(), updateSystem: vi.fn(), deleteSystem: vi.fn(),
    countSystemUsage: vi.fn(), seedDefaultSystems: vi.fn(),
};
vi.mock('../../services/maintenanceService', () => ({
    maintenanceService: new Proxy({}, { get: (_t, k: string) => (...a: unknown[]) => (svc as Record<string, (...x: unknown[]) => unknown>)[k](...a) }),
}));

import BuildingSystemSelect from '../../components/condominio/BuildingSystemSelect';
import { ConfirmProvider } from '../../components/ui/confirm';

const sis = (id: string, name: string, extra: Partial<BuildingSystem> = {}): BuildingSystem => ({
    id, organization_id: 'org-a', name, slug: name.toLowerCase(), description: null, norm_ref: null,
    is_active: true, sort_order: 10, created_at: '', updated_at: '', ...extra,
});

let ultimoValor = '';
let ultimaLista: BuildingSystem[] = [];

function Campo({ inicial, valor = '' }: { inicial: BuildingSystem[]; valor?: string }) {
    const [lista, setLista] = React.useState(inicial);
    const [v, setV] = React.useState(valor);
    return (
        <BuildingSystemSelect
            organizationId="org-a"
            sistemas={lista}
            onSistemasChange={l => { ultimaLista = l; setLista(l); }}
            value={v}
            onChange={x => { ultimoValor = x; setV(x); }}
        />
    );
}

const montar = (inicial: BuildingSystem[], valor = '') =>
    render(<ConfirmProvider><Campo inicial={inicial} valor={valor} /></ConfirmProvider>);

const abrir = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { expanded: false }));
    // Espera a gaveta ABRIR, não só o título existir: o seletor monta o Sheet
    // fechado e abre um quadro depois; fechado ele é `inert` (27/10/2026) e o
    // getByRole logo em seguida perdia a corrida na CI.
    return await screen.findByRole('dialog', { name: 'Sistemas prediais' });
};

beforeEach(() => {
    Object.values(svc).forEach(f => f.mockReset());
    ultimoValor = '';
    ultimaLista = [];
});

describe('BuildingSystemSelect', () => {
    it('escolher grava o id e fecha; "Sem sistema definido" limpa', async () => {
        const user = userEvent.setup();
        montar([sis('s1', 'Elevadores', { norm_ref: 'NBR 16083' }), sis('s2', 'Gerador')]);
        await abrir(user);
        expect(screen.getByText('NBR 16083')).toBeInTheDocument();
        await user.click(screen.getByText('Gerador'));
        expect(ultimoValor).toBe('s2');
        await waitFor(() => expect(screen.queryByText('Sistemas prediais')).not.toBeInTheDocument());
        expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Gerador');

        await abrir(user);
        await user.click(screen.getByRole('button', { name: 'Sem sistema definido' }));
        expect(ultimoValor).toBe('');
    });

    it('cadastrar grava na org do registro, com slug derivado, e já escolhe o novo', async () => {
        const user = userEvent.setup();
        svc.createSystem.mockImplementation(async (p: any) => sis('novo', p.name, { slug: p.slug, norm_ref: p.norm_ref, sort_order: p.sort_order }));
        montar([sis('s1', 'Elevadores', { sort_order: 30 })]);
        await abrir(user);
        await user.click(screen.getByRole('button', { name: /Novo/ }));
        await user.type(screen.getByLabelText('Nome'), 'Piscina aquecida');
        await user.type(screen.getByLabelText('Norma de referência'), 'NBR 10339');
        await user.click(screen.getByRole('button', { name: 'Cadastrar e escolher' }));
        await waitFor(() => expect(svc.createSystem).toHaveBeenCalledTimes(1));
        expect(svc.createSystem.mock.calls[0][0]).toMatchObject({
            organization_id: 'org-a', name: 'Piscina aquecida', slug: 'piscina-aquecida', norm_ref: 'NBR 10339', sort_order: 40,
        });
        expect(ultimoValor).toBe('novo');
        expect(ultimaLista.map(s => s.id)).toEqual(['s1', 'novo']);
    });

    it('nome repetido (sem caixa/acento) é recusado sem ir ao banco', async () => {
        const user = userEvent.setup();
        montar([sis('s1', 'Portões', { is_active: false })]);
        await abrir(user);
        await user.click(screen.getByRole('button', { name: /Novo/ }));
        await user.type(screen.getByLabelText('Nome'), 'portoes');
        await user.click(screen.getByRole('button', { name: 'Cadastrar e escolher' }));
        expect(await screen.findByText(/Já existe "Portões", desativado/)).toBeInTheDocument();
        expect(svc.createSystem).not.toHaveBeenCalled();
    });

    it('editar renomeia sem mandar slug', async () => {
        const user = userEvent.setup();
        svc.updateSystem.mockImplementation(async (id: string, patch: any) => sis(id, patch.name, { norm_ref: patch.norm_ref }));
        montar([sis('s1', 'Bombas')], 's1');
        await abrir(user);
        await user.click(screen.getByTitle('Editar'));
        const nome = screen.getByLabelText('Nome');
        await user.clear(nome);
        await user.type(nome, 'Bombas e recalque');
        await user.click(screen.getByRole('button', { name: 'Salvar' }));
        await waitFor(() => expect(svc.updateSystem).toHaveBeenCalledTimes(1));
        const [id, patch] = svc.updateSystem.mock.calls[0];
        expect(id).toBe('s1');
        expect(patch).not.toHaveProperty('slug');
        expect(patch).toMatchObject({ name: 'Bombas e recalque', is_active: true });
        expect(ultimaLista[0].name).toBe('Bombas e recalque');
    });

    it('excluir sem uso pede confirmação e exclui; o campo que apontava para ele fica vazio', async () => {
        const user = userEvent.setup();
        svc.countSystemUsage.mockResolvedValue({ itens: 0, ativos: 0, ordens: 0 });
        svc.deleteSystem.mockResolvedValue(undefined);
        montar([sis('s1', 'Gerador')], 's1');
        await abrir(user);
        await user.click(screen.getByTitle('Excluir'));
        const dialogo = await screen.findByText('Excluir o sistema predial?');
        await user.click(within(dialogo.closest('[role="dialog"]') as HTMLElement).getByRole('button', { name: 'Excluir' }));
        await waitFor(() => expect(svc.deleteSystem).toHaveBeenCalledWith('s1'));
        expect(ultimaLista).toEqual([]);
        expect(ultimoValor).toBe('');
    });

    it('excluir sistema em uso oferece desativar e não exclui', async () => {
        const user = userEvent.setup();
        svc.countSystemUsage.mockResolvedValue({ itens: 3, ativos: 1, ordens: 0 });
        svc.updateSystem.mockImplementation(async (id: string, patch: any) => sis(id, 'Elevadores', patch));
        montar([sis('s1', 'Elevadores')]);
        await abrir(user);
        await user.click(screen.getByTitle('Excluir'));
        expect(await screen.findByText('Desativar em vez de excluir?')).toBeInTheDocument();
        expect(screen.getByText(/3 itens de plano, 1 ativo/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Desativar' }));
        await waitFor(() => expect(svc.updateSystem).toHaveBeenCalledWith('s1', { is_active: false }));
        expect(svc.deleteSystem).not.toHaveBeenCalled();
        // Desativado: sai da escolha e aparece em "Desativados" com Reativar.
        expect(await screen.findByText('Desativados (1)')).toBeInTheDocument();
        svc.updateSystem.mockImplementation(async (id: string, patch: any) => sis(id, 'Elevadores', patch));
        await user.click(screen.getByRole('button', { name: 'Reativar' }));
        await waitFor(() => expect(svc.updateSystem).toHaveBeenLastCalledWith('s1', { is_active: true }));
        await waitFor(() => expect(screen.queryByText('Desativados (1)')).not.toBeInTheDocument());
    });

    it('lista vazia oferece cadastrar os sistemas padrão', async () => {
        const user = userEvent.setup();
        svc.seedDefaultSystems.mockResolvedValue([sis('s1', 'Elevadores'), sis('s2', 'Gerador')]);
        montar([]);
        await abrir(user);
        await user.click(screen.getByRole('button', { name: /Cadastrar os 12 sistemas padrão/ }));
        await waitFor(() => expect(svc.seedDefaultSystems).toHaveBeenCalledWith('org-a'));
        expect(await screen.findByText('Gerador')).toBeInTheDocument();
    });
});
