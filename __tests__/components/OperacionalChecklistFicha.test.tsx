// @vitest-environment jsdom
/**
 * Qualidade SiAC, fase 2 — Task 5: a ficha de verificação dentro da OE (`OperacionalChecklist`)
 * (docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md, Task 5).
 * Banco e serviços simulados: aqui se prova o que a FICHA faz com o que eles devolvem.
 *
 *  (a) critério e método aparecem sob a descrição; item inativo sem resposta some, com resposta fica;
 *  (b) "N/A" em item obrigatório abre a observação obrigatória — sem ela não grava; com ela grava `notes`;
 *  (c) trocar a resposta não zera `nc_id` (o histórico é do banco);
 *  (d) OE controlada sem `canInspectQualitySystem` no SGQ → respostas desligadas com o motivo;
 *      com a permissão → ligadas;
 *  (e) erro do banco (42501) ao gravar vira aviso com a mensagem dele;
 *  (f) "Histórico" do item abre o painel com as respostas anteriores;
 *  (g) decisão (a) do controlador: OE controlada com registro → "Trocar template" desligado com o
 *      motivo; OE comum: exclusão das respostas que falha NÃO troca a ficha;
 *  (h) decisão (b): membro só da SPE (a RLS esconde os itens da ficha do SGQ) → a ficha explica
 *      que é do sistema da qualidade de outra organização, em vez de "nenhum checklist".
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MOTIVO_SEM_INSPECAO } from '../../utils/permissaoQualidadeSiac';

// ── banco simulado ───────────────────────────────────────────────────────────
type Filtros = Record<string, unknown>;
interface Operacao { tabela: string; tipo: 'select' | 'update' | 'insert' | 'delete'; payload?: unknown; filtros: Filtros }

const ops: Operacao[] = [];
let erros: Record<string, { message: string; code: string }> = {};
let estado: {
    wo: Record<string, unknown>;
    itens: Array<Record<string, unknown>>;
    respostas: Array<Record<string, unknown>>;
    templates: Array<Record<string, unknown>>;
};

function resolver(tabela: string, tipo: Operacao['tipo']): unknown {
    if (tipo === 'insert' && tabela === 'non_conformances') return { id: 'nc-nova' };
    if (tipo !== 'select') return null;
    switch (tabela) {
        case 'work_orders': return estado.wo;
        case 'oe_checklist_templates': return estado.templates;
        case 'oe_checklist_items': return estado.itens;
        case 'oe_checklist_responses': return estado.respostas;
        default: return null;
    }
}

function consulta(tabela: string) {
    const filtros: Filtros = {};
    let tipo: Operacao['tipo'] = 'select';
    let payload: unknown;
    const q: Record<string, unknown> = {};
    const encadeia = () => q;
    Object.assign(q, {
        select: encadeia, order: encadeia, single: encadeia, maybeSingle: encadeia,
        eq: (c: string, v: unknown) => { filtros[c] = v; return q; },
        in: (c: string, v: unknown) => { filtros[c] = v; return q; },
        update: (p: unknown) => { tipo = 'update'; payload = p; return q; },
        insert: (p: unknown) => { tipo = 'insert'; payload = p; return q; },
        delete: () => { tipo = 'delete'; return q; },
        then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
            ops.push({ tabela, tipo, payload, filtros });
            const erro = erros[`${tabela}:${tipo}`];
            return Promise.resolve(erro ? { data: null, error: erro } : { data: resolver(tabela, tipo), error: null }).then(ok, falha);
        },
    });
    return q;
}

vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: (t: string) => consulta(t),
        rpc: vi.fn(async () => ({ data: null, error: null })),
        storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) },
    },
}));

// ── serviços simulados ───────────────────────────────────────────────────────
const listarHistoricoResposta = vi.fn();
vi.mock('../../services/workOrderService', () => ({
    workOrderService: { listarHistoricoResposta: (...a: unknown[]) => listarHistoricoResposta(...a) },
}));
const sgqDaOrganizacao = vi.fn();
const sgqLegivel = vi.fn();
const oeTemRegistro = vi.fn();
vi.mock('../../services/qualidadeSiacService', () => ({
    qualidadeSiacService: {
        sgqDaOrganizacao: (...a: unknown[]) => sgqDaOrganizacao(...a),
        sgqLegivel: (...a: unknown[]) => sgqLegivel(...a),
        oeTemRegistro: (...a: unknown[]) => oeTemRegistro(...a),
    },
}));
vi.mock('../../services/projectTypeTemplatesService', () => ({
    projectTypeTemplatesService: { getTemplate: vi.fn(async () => null) },
}));

import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';
import OperacionalChecklist from '../../components/OperacionalChecklist';

const item = (p: Record<string, unknown>) => ({
    id: 'it', description: 'Item', required: false, requires_photo: false, gate: 'pre_completion', sort_order: 0,
    severity: null, category: null, criterio: null, metodo: null, ativo: true, ...p,
});
const resposta = (p: Record<string, unknown>) => ({
    id: 'r', item_id: 'it', completed: true, response_status: 'conforme', notes: null, evidence_id: null,
    nc_id: null, completed_at: '2026-11-20T10:00:00Z', ...p,
});

const PRUMO = item({
    id: 'it-prumo', description: 'Prumo da parede', required: true, sort_order: 1,
    criterio: 'Desvio máximo de 3 mm por metro', metodo: 'Régua de alumínio de 2 m e nível',
});
const LIMPEZA = item({ id: 'it-limpeza', description: 'Limpeza do local', sort_order: 2 });
const ANTIGO_SEM = item({ id: 'it-antigo', description: 'Item antigo sem resposta', ativo: false, sort_order: 3 });
const ANTIGO_COM = item({ id: 'it-antigo-resp', description: 'Item antigo respondido', ativo: false, sort_order: 4 });

const motivo = (el: HTMLElement) => el.closest('[title]')?.getAttribute('title') ?? '';
const montar = () => render(<ConfirmProvider><OperacionalChecklist workOrderId="wo-1" orgId="org-spe" /></ConfirmProvider>);
const botaoDoItem = (descricao: string, rotulo: string) => {
    const bloco = screen.getByText(descricao).closest('[data-item-ficha]') as HTMLElement;
    return within(bloco).getByRole('button', { name: rotulo });
};
const gravacoes = (tipo: 'update' | 'insert', tabela = 'oe_checklist_responses') =>
    ops.filter(o => o.tabela === tabela && o.tipo === tipo);

beforeEach(() => {
    vi.clearAllMocks();
    ops.length = 0;
    erros = {};
    estado = {
        wo: { checklist_template_id: 'tpl-1', project_id: 'obra-1', org_id: 'org-spe', controlled_item_id: null },
        itens: [PRUMO, LIMPEZA, ANTIGO_SEM, ANTIGO_COM],
        respostas: [resposta({ id: 'r-antigo', item_id: 'it-antigo-resp' })],
        templates: [{ id: 'tpl-1', name: 'Ficha própria', service_type: null }, { id: 'tpl-2', name: 'Outra ficha', service_type: null }],
    };
    sgqDaOrganizacao.mockResolvedValue('org-alpa');
    sgqLegivel.mockResolvedValue(true);
    oeTemRegistro.mockResolvedValue(false);
    listarHistoricoResposta.mockResolvedValue([]);
    useStore.setState({
        session: { user: { id: 'u-1', email: 'ana@spe.com' } } as never,
        currentProfile: { ...useStore.getState().currentProfile, group: 'USUARIO' } as never,
        organizations: [
            { id: 'org-spe', name: 'SPE Garden', address: {}, members: [{ id: 'm1', email: 'ana@spe.com', role: 'member', userId: 'u-1', name: 'Ana', permissions: {} }] },
        ] as never,
    });
});

describe('OperacionalChecklist — ficha de verificação (fase 2)', () => {
    it('(a) critério e método sob a descrição; item inativo sem resposta some, com resposta fica', async () => {
        montar();
        expect(await screen.findByText('Prumo da parede')).toBeTruthy();
        expect(screen.getByText(/Desvio máximo de 3 mm por metro/)).toBeTruthy();
        expect(screen.getByText(/Régua de alumínio de 2 m e nível/)).toBeTruthy();
        expect(screen.queryByText('Item antigo sem resposta')).toBeNull();
        expect(screen.getByText('Item antigo respondido')).toBeTruthy();
    });

    it('(b) N/A em item obrigatório: sem observação não grava; com observação grava notes', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByText('Prumo da parede');
        await user.click(botaoDoItem('Prumo da parede', 'N/A'));
        expect(gravacoes('insert')).toHaveLength(0);

        const campo = screen.getByLabelText(/Observação do não aplicável/) as HTMLTextAreaElement;
        const confirmar = screen.getByRole('button', { name: 'Confirmar não aplicável' });
        expect((confirmar as HTMLButtonElement).disabled).toBe(true);
        expect(motivo(confirmar)).toMatch(/observação/i);
        await user.click(confirmar);
        expect(gravacoes('insert')).toHaveLength(0);

        await user.type(campo, 'Parede de drywall, sem alvenaria');
        await user.click(screen.getByRole('button', { name: 'Confirmar não aplicável' }));
        await waitFor(() => expect(gravacoes('insert')).toHaveLength(1));
        expect(gravacoes('insert')[0].payload).toMatchObject({
            work_order_id: 'wo-1', item_id: 'it-prumo', response_status: 'nao_aplicavel',
            notes: 'Parede de drywall, sem alvenaria',
        });
    });

    it('(b) N/A em item NÃO obrigatório grava direto, sem pedir observação', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByText('Limpeza do local');
        await user.click(botaoDoItem('Limpeza do local', 'N/A'));
        await waitFor(() => expect(gravacoes('insert')).toHaveLength(1));
        expect(gravacoes('insert')[0].payload).toMatchObject({ item_id: 'it-limpeza', response_status: 'nao_aplicavel' });
        expect(screen.queryByLabelText(/Observação do não aplicável/)).toBeNull();
    });

    it('(c) trocar a resposta não manda nc_id (não zera a NC do item)', async () => {
        estado.respostas = [resposta({ id: 'r-prumo', item_id: 'it-prumo', response_status: 'nao_conforme', nc_id: 'nc-1' })];
        const user = userEvent.setup();
        montar();
        await screen.findByText('Prumo da parede');
        await user.click(botaoDoItem('Prumo da parede', 'Conforme'));
        await waitFor(() => expect(gravacoes('update')).toHaveLength(1));
        const payload = gravacoes('update')[0].payload as Record<string, unknown>;
        expect(payload.response_status).toBe('conforme');
        expect('nc_id' in payload).toBe(false);
    });

    it('(d) OE controlada sem canInspectQualitySystem no SGQ → respostas desligadas com o motivo', async () => {
        estado.wo = { ...estado.wo, controlled_item_id: 'srv-alv' };
        useStore.setState({
            organizations: [
                { id: 'org-spe', name: 'SPE Garden', address: {}, members: [{ id: 'm1', email: 'ana@spe.com', role: 'member', userId: 'u-1', name: 'Ana', permissions: {} }] },
                { id: 'org-alpa', name: 'Alpa', address: {}, members: [{ id: 'm2', email: 'ana@spe.com', role: 'member', userId: 'u-1', name: 'Ana', permissions: { canInspectQualitySystem: false } }] },
            ] as never,
        });
        montar();
        await screen.findByText('Prumo da parede');
        await waitFor(() => expect((botaoDoItem('Prumo da parede', 'Conforme') as HTMLButtonElement).disabled).toBe(true));
        expect(motivo(botaoDoItem('Prumo da parede', 'Conforme'))).toBe(MOTIVO_SEM_INSPECAO);
        expect((botaoDoItem('Prumo da parede', 'N/A') as HTMLButtonElement).disabled).toBe(true);
        expect(sgqDaOrganizacao).toHaveBeenCalledWith('org-spe');
    });

    it('(d) OE controlada com canInspectQualitySystem no SGQ → respostas ligadas', async () => {
        estado.wo = { ...estado.wo, controlled_item_id: 'srv-alv' };
        useStore.setState({
            organizations: [
                { id: 'org-alpa', name: 'Alpa', address: {}, members: [{ id: 'm2', email: 'ana@spe.com', role: 'member', userId: 'u-1', name: 'Ana', permissions: { canInspectQualitySystem: true } }] },
            ] as never,
        });
        montar();
        await screen.findByText('Prumo da parede');
        await waitFor(() => expect((botaoDoItem('Prumo da parede', 'Conforme') as HTMLButtonElement).disabled).toBe(false));
    });

    it('(d) grupo DESENVOLVEDOR sem e-mail de superadmin não liga: a régua é a do banco (is_superadmin)', async () => {
        estado.wo = { ...estado.wo, controlled_item_id: 'srv-alv' };
        useStore.setState({
            currentProfile: { ...useStore.getState().currentProfile, group: 'DESENVOLVEDOR' } as never,
            organizations: [
                { id: 'org-alpa', name: 'Alpa', address: {}, members: [{ id: 'm2', email: 'ana@spe.com', role: 'member', userId: 'u-1', name: 'Ana', permissions: {} }] },
            ] as never,
        });
        montar();
        await screen.findByText('Prumo da parede');
        await waitFor(() => expect(motivo(botaoDoItem('Prumo da parede', 'Conforme'))).toBe(MOTIVO_SEM_INSPECAO));
        expect((botaoDoItem('Prumo da parede', 'Conforme') as HTMLButtonElement).disabled).toBe(true);
    });

    it('(d) falha ao conferir o SGQ fecha: respostas desligadas com a mensagem do erro', async () => {
        estado.wo = { ...estado.wo, controlled_item_id: 'srv-alv' };
        sgqDaOrganizacao.mockRejectedValue(new Error('tempo esgotado'));
        // admin da SPE: se o hook caísse para a org da OE, ligaria — o banco recusaria
        useStore.setState({
            organizations: [
                { id: 'org-spe', name: 'SPE Garden', address: {}, members: [{ id: 'm1', email: 'ana@spe.com', role: 'admin', userId: 'u-1', name: 'Ana', permissions: {} }] },
            ] as never,
        });
        montar();
        await screen.findByText('Prumo da parede');
        await waitFor(() => expect(motivo(botaoDoItem('Prumo da parede', 'Conforme'))).toMatch(/tempo esgotado/));
        expect((botaoDoItem('Prumo da parede', 'Conforme') as HTMLButtonElement).disabled).toBe(true);
    });

    it('(e) erro do banco ao gravar aparece com a mensagem dele', async () => {
        erros['oe_checklist_responses:insert'] = { message: 'Sem permissão para inspecionar serviço controlado', code: '42501' };
        const user = userEvent.setup();
        montar();
        await screen.findByText('Limpeza do local');
        await user.click(botaoDoItem('Limpeza do local', 'Conforme'));
        expect(await screen.findByText(/Sem permissão para inspecionar serviço controlado/)).toBeTruthy();
    });

    it('(f) "Histórico" do item abre o painel com as respostas anteriores', async () => {
        estado.respostas = [resposta({ id: 'r-prumo', item_id: 'it-prumo', response_status: 'conforme' })];
        listarHistoricoResposta.mockResolvedValue([{
            id: 'h1', response_id: 'r-prumo', work_order_id: 'wo-1', item_id: 'it-prumo', response_status: 'nao_conforme',
            notes: 'Fora de prumo', nc_id: 'nc-1', evidence_id: null, respondido_por: 'u-1', respondido_em: '2026-11-18T09:00:00Z',
            copia: { item_criterio: 'Desvio máximo de 3 mm por metro' }, evento: 'alteracao', alterado_por: 'u-1', created_at: '2026-11-19T09:00:00Z',
        }]);
        const user = userEvent.setup();
        montar();
        await screen.findByText('Prumo da parede');
        await user.click(botaoDoItem('Prumo da parede', 'Histórico'));
        await waitFor(() => expect(listarHistoricoResposta).toHaveBeenCalledWith('r-prumo'));
        const painel = await screen.findByRole('dialog');
        expect(within(painel).getByText('Não conforme')).toBeTruthy();
        expect(within(painel).getByText(/Fora de prumo/)).toBeTruthy();
        expect(within(painel).getAllByText(/Ana/).length).toBeGreaterThan(0);
    });

    it('(g) OE controlada com registro → "Trocar template" desligado com o motivo', async () => {
        estado.wo = { ...estado.wo, controlled_item_id: 'srv-alv' };
        oeTemRegistro.mockResolvedValue(true);
        montar();
        await screen.findByText('Prumo da parede');
        const trocar = await screen.findByRole('button', { name: /Trocar template/ });
        await waitFor(() => expect((trocar as HTMLButtonElement).disabled).toBe(true));
        expect(motivo(trocar)).toMatch(/não pode ser trocada/);
    });

    it('(g) estado vazio: OE controlada com registro e sem ficha → "Aplicar" desligado com o motivo', async () => {
        estado.wo = { ...estado.wo, controlled_item_id: 'srv-alv', checklist_template_id: null };
        estado.respostas = [];
        oeTemRegistro.mockResolvedValue(true);
        const user = userEvent.setup();
        montar();
        expect(await screen.findByText('Nenhum checklist vinculado')).toBeTruthy();
        await user.selectOptions(screen.getByLabelText('Modelo de checklist'), 'tpl-1');
        const aplicar = screen.getByRole('button', { name: /Aplicar/ }) as HTMLButtonElement;
        expect(aplicar.disabled).toBe(true);
        expect(motivo(aplicar)).toMatch(/não pode ser trocada/);
    });

    it('(g) OE comum: exclusão das respostas falha → não troca a ficha e mostra o erro', async () => {
        erros['oe_checklist_responses:delete'] = { message: 'Falha ao apagar as respostas', code: '42501' };
        const user = userEvent.setup();
        montar();
        await screen.findByText('Prumo da parede');
        await user.click(screen.getByRole('button', { name: /Trocar template/ }));
        await user.selectOptions(screen.getByLabelText('Modelo de checklist'), 'tpl-2');
        await user.click(screen.getByRole('button', { name: /Aplicar/ }));
        // a troca apaga as respostas: pergunta antes (useConfirm, não window.confirm)
        await user.click(await screen.findByRole('button', { name: 'Trocar ficha' }));
        expect(await screen.findByText(/Falha ao apagar as respostas/)).toBeTruthy();
        expect(gravacoes('update', 'work_orders')).toHaveLength(0);
    });

    it('(h) membro só da SPE: a ficha diz que é do SGQ de outra organização', async () => {
        estado.wo = { ...estado.wo, controlled_item_id: 'srv-alv' };
        estado.itens = []; // a RLS esconde os itens da ficha do SGQ
        estado.respostas = [];
        sgqLegivel.mockResolvedValue(false);
        montar();
        expect(await screen.findByText(
            'A ficha deste serviço é do sistema da qualidade de outra organização — você não tem acesso para inspecionar',
        )).toBeTruthy();
        expect(screen.queryByText('Nenhum checklist vinculado')).toBeNull();
    });

    it('(h) com o nome do SGQ conhecido, a mensagem o mostra', async () => {
        estado.wo = { ...estado.wo, controlled_item_id: 'srv-alv' };
        estado.itens = [];
        estado.respostas = [];
        sgqLegivel.mockResolvedValue(false);
        useStore.setState({
            organizations: [
                ...(useStore.getState().organizations as unknown[]),
                { id: 'org-alpa', name: 'Alpa Construtora', address: {}, members: [] },
            ] as never,
        });
        montar();
        expect(await screen.findByText(
            'A ficha deste serviço é do sistema da qualidade de Alpa Construtora — você não tem acesso para inspecionar',
        )).toBeTruthy();
    });
});
