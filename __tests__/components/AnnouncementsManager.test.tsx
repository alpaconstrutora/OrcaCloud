// @vitest-environment jsdom
/**
 * Portais › Portal do Investidor › Comunicados — CRUD do gestor (16/11/2026, pedido "portais > portal
 * do investidor > aba comunicados : implementar CRUD"; plano
 * docs/planos/2026-11-16-investidor-comunicados-crud.md).
 *
 * Antes a aba só criava rascunho e publicava: não editava nem excluía, e listava pela organização do
 * INVESTIDOR, não pelo topo. Aqui: a lista segue o topo (REGRA #5), criar/editar/publicar/excluir
 * atualizam a lista local (§22), e comunicado com resposta de investidor fica travado.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    topo: { orgId: 'o1' as string | null },
    escolhaNoModal: null as string | null,
    listAll: vi.fn(), create: vi.fn(), update: vi.fn(), publish: vi.fn(), remove: vi.fn(), listResponses: vi.fn(),
    confirmar: vi.fn(),
}));

vi.mock('../../hooks/useOrgContext', async (orig) => ({
    ...(await orig<typeof import('../../hooks/useOrgContext')>()),
    useOrgContext: () => ({ orgId: h.topo.orgId, isAllOrgs: h.topo.orgId == null, source: h.topo.orgId ? 'organization' : 'all' }),
    // O hook real lê o useOrgContext de DENTRO do módulo (o mock acima não o alcança): aqui o topo manda,
    // e em "Todas" a escolha do modal é `h.escolhaNoModal`.
    useOrgWriteTarget: () => ({
        resolveWriteOrg: async () => {
            const org = h.topo.orgId ?? h.escolhaNoModal;
            return org ? { kind: 'org', orgId: org } : null;
        },
        orgTargetModal: null,
    }),
}));
vi.mock('../../services/announcementsService', async (orig) => ({
    ...(await orig<typeof import('../../services/announcementsService')>()),
    announcementsService: {
        listAll: (...a: unknown[]) => h.listAll(...a),
        create: (...a: unknown[]) => h.create(...a),
        update: (...a: unknown[]) => h.update(...a),
        publish: (...a: unknown[]) => h.publish(...a),
        remove: (...a: unknown[]) => h.remove(...a),
        listResponses: (...a: unknown[]) => h.listResponses(...a),
    },
}));
vi.mock('../../components/ui/confirm', async (orig) => ({
    ...(await orig<typeof import('../../components/ui/confirm')>()),
    useConfirm: () => (...a: unknown[]) => h.confirmar(...a),
}));
vi.mock('../../lib/supabase', () => {
    const q: Record<string, unknown> = {};
    const fim = Promise.resolve({ data: [], error: null });
    for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit', 'is', 'not']) q[m] = () => q;
    q.then = (ok: (r: unknown) => unknown) => fim.then(ok);
    q.auth = { getUser: () => Promise.resolve({ data: { user: null } }) };
    q.channel = () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) });
    q.removeChannel = () => {};
    return { supabase: q };
});
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import AnnouncementsManager from '../../components/investor/AnnouncementsManager';
import { ToastProvider } from '../../components/ui/toast';

const rascunho = { id: 'a1', organization_id: 'o1', title: 'Assembleia de março', body: 'Pauta…', type: 'assembleia', requires_acknowledgment: false, published_at: null, created_at: '2026-11-10T10:00:00Z', ack_count: 0 };
const publicadoSemResposta = { id: 'a2', organization_id: 'o1', title: 'Relatório de outubro', body: 'Disponível.', type: 'comunicado', requires_acknowledgment: false, published_at: '2026-11-01T10:00:00Z', created_at: '2026-11-01T10:00:00Z', ack_count: 0 };
const publicadoComResposta = { id: 'a3', organization_id: 'o1', title: 'Aceite do aditivo', body: 'Confirme.', type: 'aviso', requires_acknowledgment: true, published_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T10:00:00Z', ack_count: 2 };

const montar = () => render(<ToastProvider><AnnouncementsManager /></ToastProvider>);
const linha = (titulo: string) => screen.getByText(titulo).closest('tr') as HTMLElement;
const painel = () => screen.getByRole('dialog');

beforeEach(() => {
    h.topo.orgId = 'o1';
    h.escolhaNoModal = null;
    for (const f of [h.listAll, h.create, h.update, h.publish, h.remove, h.listResponses, h.confirmar]) f.mockReset();
    h.listAll.mockResolvedValue([rascunho, publicadoSemResposta, publicadoComResposta]);
    h.listResponses.mockResolvedValue([]);
    h.confirmar.mockResolvedValue(true);
});

describe('Comunicados (gestor) — lista', () => {
    it('segue o topo: organização escolhida filtra por ela', async () => {
        montar();
        await screen.findByText('Assembleia de março');
        expect(h.listAll).toHaveBeenCalledWith('o1');
    });

    it('"Todas as organizações": lista sem filtro', async () => {
        h.topo.orgId = null;
        montar();
        await screen.findByText('Assembleia de março');
        expect(h.listAll).toHaveBeenCalledWith(null);
    });

    it('mostra a situação de cada comunicado', async () => {
        montar();
        await screen.findByText('Assembleia de março');
        expect(within(linha('Assembleia de março')).getByText('Rascunho')).toBeTruthy();
        expect(within(linha('Relatório de outubro')).getByText('Publicado')).toBeTruthy();
    });
});

describe('Comunicados (gestor) — criar', () => {
    it('novo comunicado vira rascunho na organização do topo e entra na lista sem recarregar', async () => {
        h.create.mockResolvedValue({ ...rascunho, id: 'n1', title: 'Distribuição de lucros' });
        montar();
        await screen.findByText('Assembleia de março');
        fireEvent.click(screen.getByRole('button', { name: /Novo comunicado/ }));
        fireEvent.change(within(painel()).getByLabelText('Título'), { target: { value: 'Distribuição de lucros' } });
        fireEvent.change(within(painel()).getByLabelText('Texto'), { target: { value: 'Valores do trimestre.' } });
        fireEvent.click(within(painel()).getByRole('button', { name: 'Salvar rascunho' }));
        await waitFor(() => expect(h.create).toHaveBeenCalled());
        expect(h.create.mock.calls[0][0]).toBe('o1');
        expect(h.create.mock.calls[0][1]).toMatchObject({ title: 'Distribuição de lucros', body: 'Valores do trimestre.' });
        expect(h.create.mock.calls[0][2]).toBe(false);
        expect(await screen.findByText('Distribuição de lucros')).toBeTruthy();
        expect(h.listAll).toHaveBeenCalledTimes(1);
    });

    it('"Todas as organizações": grava na organização escolhida no modal; cancelar não grava', async () => {
        h.topo.orgId = null;
        h.create.mockResolvedValue({ ...rascunho, id: 'n2', organization_id: 'o2', title: 'Aviso SPE' });
        montar();
        await screen.findByText('Assembleia de março');
        fireEvent.click(screen.getByRole('button', { name: /Novo comunicado/ }));
        fireEvent.change(within(painel()).getByLabelText('Título'), { target: { value: 'Aviso SPE' } });
        fireEvent.change(within(painel()).getByLabelText('Texto'), { target: { value: 'Texto.' } });
        fireEvent.click(within(painel()).getByRole('button', { name: 'Salvar rascunho' }));
        await new Promise(r => setTimeout(r, 0));
        expect(h.create).not.toHaveBeenCalled();          // modal cancelado
        h.escolhaNoModal = 'o2';
        fireEvent.click(within(painel()).getByRole('button', { name: 'Salvar rascunho' }));
        await waitFor(() => expect(h.create).toHaveBeenCalled());
        expect(h.create.mock.calls[0][0]).toBe('o2');
    });

    it('sem título ou texto o botão fica desligado e diz por quê', async () => {
        montar();
        await screen.findByText('Assembleia de março');
        fireEvent.click(screen.getByRole('button', { name: /Novo comunicado/ }));
        const salvar = within(painel()).getByRole('button', { name: 'Salvar rascunho' }) as HTMLButtonElement;
        expect(salvar.disabled).toBe(true);
        expect(within(painel()).getByText('Preencha o título e o texto.')).toBeTruthy();
    });
});

describe('Comunicados (gestor) — editar', () => {
    it('clicar na linha abre o painel com os dados e salvar grava a alteração', async () => {
        h.update.mockResolvedValue({ ...rascunho, title: 'Assembleia de abril' });
        montar();
        await screen.findByText('Assembleia de março');
        fireEvent.click(screen.getByText('Assembleia de março'));
        const titulo = within(painel()).getByLabelText('Título') as HTMLInputElement;
        expect(titulo.value).toBe('Assembleia de março');
        fireEvent.change(titulo, { target: { value: 'Assembleia de abril' } });
        fireEvent.click(within(painel()).getByRole('button', { name: 'Salvar rascunho' }));
        await waitFor(() => expect(h.update).toHaveBeenCalledWith('a1', expect.objectContaining({ title: 'Assembleia de abril' })));
        expect(await screen.findByText('Assembleia de abril')).toBeTruthy();
    });

    it('comunicado com resposta de investidor abre só para leitura, com o motivo', async () => {
        montar();
        await screen.findByText('Aceite do aditivo');
        fireEvent.click(screen.getByText('Aceite do aditivo'));
        expect((within(painel()).getByLabelText('Título') as HTMLInputElement).disabled).toBe(true);
        expect(within(painel()).getByText(/Já tem 2 respostas/)).toBeTruthy();
        expect(within(painel()).queryByRole('button', { name: /Salvar/ })).toBeNull();
        await waitFor(() => expect(h.listResponses).toHaveBeenCalledWith('a3'));
    });
});

describe('Comunicados (gestor) — publicar e excluir', () => {
    it('"Publicar" na linha confirma e passa a "Publicado"', async () => {
        h.publish.mockResolvedValue({ ...rascunho, published_at: '2026-11-16T12:00:00Z' });
        montar();
        await screen.findByText('Assembleia de março');
        fireEvent.click(within(linha('Assembleia de março')).getByRole('button', { name: 'Publicar' }));
        await waitFor(() => expect(h.publish).toHaveBeenCalledWith('a1'));
        expect(h.confirmar).toHaveBeenCalled();
        await waitFor(() => expect(within(linha('Assembleia de março')).getByText('Publicado')).toBeTruthy());
    });

    it('excluir confirma, apaga e tira a linha', async () => {
        h.remove.mockResolvedValue(undefined);
        montar();
        await screen.findByText('Relatório de outubro');
        fireEvent.click(within(linha('Relatório de outubro')).getByRole('button', { name: 'Excluir' }));
        await waitFor(() => expect(h.remove).toHaveBeenCalledWith('a2'));
        await waitFor(() => expect(screen.queryByText('Relatório de outubro')).toBeNull());
    });

    it('cancelar a confirmação não exclui', async () => {
        h.confirmar.mockResolvedValue(false);
        montar();
        await screen.findByText('Relatório de outubro');
        fireEvent.click(within(linha('Relatório de outubro')).getByRole('button', { name: 'Excluir' }));
        await waitFor(() => expect(h.confirmar).toHaveBeenCalled());
        expect(h.remove).not.toHaveBeenCalled();
    });

    it('com resposta de investidor, excluir fica desligado e diz o motivo', async () => {
        montar();
        await screen.findByText('Aceite do aditivo');
        const excluir = within(linha('Aceite do aditivo')).getByRole('button', { name: 'Excluir' }) as HTMLButtonElement;
        expect(excluir.disabled).toBe(true);
        expect(excluir.closest('span[title]')?.getAttribute('title')).toMatch(/2 respostas/);
    });
});
