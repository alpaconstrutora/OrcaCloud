// @vitest-environment jsdom
/**
 * Qualidade SiAC, fase 2 — Task 7: o editor de modelos de checklist (`OperacionalTemplateManager`)
 * (docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md, Task 7).
 * Banco simulado: aqui se prova o que o EDITOR faz com o que ele devolve.
 *
 *  (a) salvar o item grava `criterio` e `metodo`; adicionar item também;
 *  (b) excluir item com resposta (erro 23503 do banco) → oferece "Desativar" e grava `ativo=false`;
 *      recusar a oferta não grava nada; outro erro vira aviso com a mensagem dele (não some calado);
 *  (c) item desativado aparece riscado, com "Reativar" (grava `ativo=true`);
 *  (d) `somenteTemplateId` mostra só esse modelo (sem criar/importar/lista dos outros);
 *  (e) excluir modelo cujos itens têm resposta (23503) → mensagem clara; outro erro → mensagem do banco.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── banco simulado ───────────────────────────────────────────────────────────
type Filtros = Record<string, unknown>;
interface Operacao { tabela: string; tipo: 'select' | 'update' | 'insert' | 'delete'; payload?: unknown; filtros: Filtros; colunas?: string }

const ops: Operacao[] = [];
let erros: Record<string, { message: string; code: string }> = {};
let estado: {
    templates: Array<Record<string, unknown>>;
    itens: Array<Record<string, unknown>>;
};

function resolver(tabela: string, tipo: Operacao['tipo'], filtros: Filtros): unknown {
    if (tipo !== 'select') return null;
    if (tabela === 'oe_checklist_templates') {
        return estado.templates.filter(t => filtros.id === undefined || t.id === filtros.id);
    }
    if (tabela === 'oe_checklist_items') return estado.itens;
    return null;
}

function consulta(tabela: string) {
    const filtros: Filtros = {};
    let tipo: Operacao['tipo'] = 'select';
    let payload: unknown;
    let colunas: string | undefined;
    const q: Record<string, unknown> = {};
    const encadeia = () => q;
    Object.assign(q, {
        order: encadeia, single: encadeia, maybeSingle: encadeia,
        select: (c?: string) => { if (tipo === 'select') colunas = c; return q; },
        eq: (c: string, v: unknown) => { filtros[c] = v; return q; },
        in: (c: string, v: unknown) => { filtros[c] = v; return q; },
        update: (p: unknown) => { tipo = 'update'; payload = p; return q; },
        insert: (p: unknown) => { tipo = 'insert'; payload = p; return q; },
        delete: () => { tipo = 'delete'; return q; },
        then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
            ops.push({ tabela, tipo, payload, filtros, colunas });
            const erro = erros[`${tabela}:${tipo}`];
            return Promise.resolve(erro ? { data: null, error: erro } : { data: resolver(tabela, tipo, filtros), error: null }).then(ok, falha);
        },
    });
    return q;
}

vi.mock('../../lib/supabase', () => ({
    supabase: { from: (t: string) => consulta(t), rpc: vi.fn(async () => ({ data: null, error: null })) },
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import OperacionalTemplateManager from '../../components/OperacionalTemplateManager';

const item = (p: Record<string, unknown>) => ({
    id: 'it', template_id: 'tpl-1', description: 'Item', required: false, requires_photo: false,
    gate: 'free', sort_order: 0, severity: 'moderate', category: null, criterio: null, metodo: null, ativo: true, ...p,
});
const PRUMO = item({ id: 'it-prumo', description: 'Prumo da parede', criterio: 'Desvio máximo de 3 mm por metro', metodo: 'Régua de 2 m' });
const ANTIGO = item({ id: 'it-antigo', description: 'Item antigo', sort_order: 1, ativo: false });

const montar = (props: { somenteTemplateId?: string } = {}) =>
    render(<ConfirmProvider><OperacionalTemplateManager orgId="org-1" {...props} /></ConfirmProvider>);
const gravacoes = (tipo: 'update' | 'insert' | 'delete', tabela = 'oe_checklist_items') =>
    ops.filter(o => o.tabela === tabela && o.tipo === tipo);
const bloco = (descricao: string) => screen.getByText(descricao).closest('[data-item-modelo]') as HTMLElement;
const abrirModelo = async (user: ReturnType<typeof userEvent.setup>, nome = 'Ficha de alvenaria') => {
    await user.click(await screen.findByText(nome));
    await screen.findByText('Prumo da parede');
};

beforeEach(() => {
    vi.clearAllMocks();
    ops.length = 0;
    erros = {};
    estado = {
        templates: [
            { id: 'tpl-1', name: 'Ficha de alvenaria', service_type: 'Alvenaria', active: true, created_at: '2026-11-01', oe_checklist_items: [{ count: 2 }] },
            { id: 'tpl-2', name: 'Ficha de pintura', service_type: 'Pintura', active: true, created_at: '2026-11-02', oe_checklist_items: [{ count: 0 }] },
        ],
        itens: [PRUMO, ANTIGO],
    };
});

describe('OperacionalTemplateManager — ficha do modelo (fase 2)', () => {
    it('(a) editar o item mostra critério e método, e salvar grava os dois', async () => {
        const user = userEvent.setup();
        montar();
        await abrirModelo(user);
        expect(screen.getByText(/Desvio máximo de 3 mm por metro/)).toBeTruthy();
        expect(screen.getByText(/Régua de 2 m/)).toBeTruthy();

        await user.click(within(bloco('Prumo da parede')).getByRole('button', { name: 'Editar' }));
        const criterio = screen.getByLabelText('Critério de aceitação') as HTMLInputElement;
        const metodo = screen.getByLabelText('Método de verificação') as HTMLInputElement;
        expect(criterio.value).toBe('Desvio máximo de 3 mm por metro');
        await user.clear(criterio);
        await user.type(criterio, 'Desvio máximo de 2 mm por metro');
        await user.clear(metodo);
        await user.type(metodo, 'Prumo de face e nível a laser');
        await user.click(screen.getByRole('button', { name: /Salvar/ }));

        await waitFor(() => expect(gravacoes('update')).toHaveLength(1));
        expect(gravacoes('update')[0].payload).toMatchObject({
            description: 'Prumo da parede',
            criterio: 'Desvio máximo de 2 mm por metro',
            metodo: 'Prumo de face e nível a laser',
        });
        expect(gravacoes('update')[0].filtros).toMatchObject({ id: 'it-prumo' });
        // a leitura que recarrega os itens traz as colunas novas
        const leituraItens = ops.filter(o => o.tabela === 'oe_checklist_items' && o.tipo === 'select');
        expect(leituraItens.every(o => /criterio/.test(o.colunas ?? '') && /metodo/.test(o.colunas ?? '') && /ativo/.test(o.colunas ?? ''))).toBe(true);
    });

    it('(a) item novo grava critério e método (vazio vira null)', async () => {
        const user = userEvent.setup();
        montar();
        await abrirModelo(user);
        await user.click(screen.getByRole('button', { name: /Adicionar item/ }));
        await user.type(screen.getByPlaceholderText('Descrição do item de checklist'), 'Nível da laje');
        await user.type(screen.getByLabelText('Critério de aceitação'), 'Até 5 mm em 3 m');
        await user.click(screen.getByRole('button', { name: /^Adicionar$/ }));

        await waitFor(() => expect(gravacoes('insert')).toHaveLength(1));
        expect(gravacoes('insert')[0].payload).toMatchObject({
            template_id: 'tpl-1', description: 'Nível da laje', criterio: 'Até 5 mm em 3 m', metodo: null,
        });
    });

    it('(b) excluir item com resposta (23503) oferece Desativar e grava ativo=false', async () => {
        erros['oe_checklist_items:delete'] = { message: 'violates foreign key constraint "oe_checklist_responses_item_id_fkey"', code: '23503' };
        const user = userEvent.setup();
        montar();
        await abrirModelo(user);

        await user.click(within(bloco('Prumo da parede')).getByRole('button', { name: 'Excluir' }));
        await user.click(await screen.findByRole('button', { name: 'Remover' }));
        await waitFor(() => expect(gravacoes('delete')).toHaveLength(1));
        expect(gravacoes('update')).toHaveLength(0);

        expect(await screen.findByText(/já tem respostas/i)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Desativar' }));
        await waitFor(() => expect(gravacoes('update')).toHaveLength(1));
        expect(gravacoes('update')[0].payload).toEqual({ ativo: false });
        expect(gravacoes('update')[0].filtros).toMatchObject({ id: 'it-prumo' });
    });

    it('(b) recusar a oferta de Desativar não grava nada', async () => {
        erros['oe_checklist_items:delete'] = { message: 'fk', code: '23503' };
        const user = userEvent.setup();
        montar();
        await abrirModelo(user);
        await user.click(within(bloco('Prumo da parede')).getByRole('button', { name: 'Excluir' }));
        await user.click(await screen.findByRole('button', { name: 'Remover' }));
        await screen.findByText(/já tem respostas/i);
        await user.click(screen.getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByText(/já tem respostas/i)).toBeNull());
        expect(gravacoes('update')).toHaveLength(0);
    });

    it('(b) outro erro ao excluir item vira aviso com a mensagem do banco, sem oferta de desativar', async () => {
        erros['oe_checklist_items:delete'] = { message: 'permission denied for table oe_checklist_items', code: '42501' };
        const user = userEvent.setup();
        montar();
        await abrirModelo(user);
        await user.click(within(bloco('Prumo da parede')).getByRole('button', { name: 'Excluir' }));
        await user.click(await screen.findByRole('button', { name: 'Remover' }));
        expect(await screen.findByText(/permission denied for table oe_checklist_items/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Desativar' })).toBeNull();
        expect(gravacoes('update')).toHaveLength(0);
    });

    it('(b) exclusão que dá certo não oferece desativar', async () => {
        const user = userEvent.setup();
        montar();
        await abrirModelo(user);
        await user.click(within(bloco('Prumo da parede')).getByRole('button', { name: 'Excluir' }));
        await user.click(await screen.findByRole('button', { name: 'Remover' }));
        await waitFor(() => expect(gravacoes('delete')).toHaveLength(1));
        expect(screen.queryByRole('button', { name: 'Desativar' })).toBeNull();
    });

    it('(c) item desativado aparece riscado com Reativar, que grava ativo=true', async () => {
        const user = userEvent.setup();
        montar();
        await abrirModelo(user);
        const texto = screen.getByText('Item antigo');
        expect(texto.className).toMatch(/line-through/);
        expect(screen.getByText('Prumo da parede').className).not.toMatch(/line-through/);
        expect(within(bloco('Prumo da parede')).queryByRole('button', { name: 'Reativar' })).toBeNull();

        await user.click(within(bloco('Item antigo')).getByRole('button', { name: 'Reativar' }));
        await waitFor(() => expect(gravacoes('update')).toHaveLength(1));
        expect(gravacoes('update')[0].payload).toEqual({ ativo: true });
        expect(gravacoes('update')[0].filtros).toMatchObject({ id: 'it-antigo' });
    });

    it('(d) somenteTemplateId mostra só esse modelo, já aberto, sem criar nem importar', async () => {
        montar({ somenteTemplateId: 'tpl-1' });
        expect(await screen.findByText('Ficha de alvenaria')).toBeTruthy();
        expect(await screen.findByText('Prumo da parede')).toBeTruthy();
        expect(screen.queryByText('Ficha de pintura')).toBeNull();
        expect(screen.queryByRole('button', { name: /Novo template/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Importar/ })).toBeNull();
        const leitura = ops.find(o => o.tabela === 'oe_checklist_templates' && o.tipo === 'select');
        expect(leitura?.filtros).toMatchObject({ id: 'tpl-1' });
    });

    it('(d2) somenteTemplateId que o usuário não lê (RLS devolve nada): diz isso, não "Nenhum template criado"', async () => {
        montar({ somenteTemplateId: 'tpl-de-outra-org' });
        expect(await screen.findByText('Ficha não encontrada')).toBeTruthy();
        expect(screen.getByText(/de uma organização que você não acessa/)).toBeTruthy();
        expect(screen.queryByText('Nenhum template criado')).toBeNull();
    });

    it('(d) sem somenteTemplateId lista todos e mostra criar/importar', async () => {
        montar();
        expect(await screen.findByText('Ficha de alvenaria')).toBeTruthy();
        expect(screen.getByText('Ficha de pintura')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Novo template/ })).toBeTruthy();
    });

    it('(e) excluir modelo com respostas (23503) mostra a mensagem clara e não some calado', async () => {
        erros['oe_checklist_templates:delete'] = { message: 'update or delete violates foreign key', code: '23503' };
        const user = userEvent.setup();
        montar();
        const card = (await screen.findByText('Ficha de alvenaria')).closest('.bg-white') as HTMLElement;
        await user.click(within(card).getByRole('button', { name: 'Excluir' }));
        await user.click(await screen.findByRole('button', { name: 'Excluir modelo' }));
        expect(await screen.findByText('Este modelo já tem respostas em tarefas; desative-o em vez de excluir')).toBeTruthy();
    });

    it('(e) outro erro ao excluir modelo mostra a mensagem do banco', async () => {
        erros['oe_checklist_templates:delete'] = { message: 'permission denied for table oe_checklist_templates', code: '42501' };
        const user = userEvent.setup();
        montar();
        const card = (await screen.findByText('Ficha de alvenaria')).closest('.bg-white') as HTMLElement;
        await user.click(within(card).getByRole('button', { name: 'Excluir' }));
        await user.click(await screen.findByRole('button', { name: 'Excluir modelo' }));
        expect(await screen.findByText(/permission denied for table oe_checklist_templates/)).toBeTruthy();
    });
});
