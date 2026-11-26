// @vitest-environment jsdom
/**
 * Qualidade SiAC, fase 2 — Task 4: o campo "Serviço controlado" no formulário da OE
 * (docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md, Task 4).
 * Serviços e banco simulados: aqui se prova o que o FORMULÁRIO faz com o que eles devolvem.
 *
 *  (a) item de orçamento com código ligado a um serviço → o campo vem sugerido ("sugerido pelo
 *      código do item") e a ficha do serviço entra no modelo de checklist;
 *  (b) atividade do planejamento → o código é o do item de orçamento do projeto de planejamento
 *      (lido do `budget` dele) e também sugere;
 *  (c) salvar grava `controlledItemId` e `checklistTemplateId` do serviço;
 *  (d) OE com registro de inspeção → campo e ficha DESLIGADOS com o motivo (decisão do controlador:
 *      no lugar da confirmação do brief — o banco recusa a troca);
 *  (e) OE em inspeção sem registro → campo desligado com o motivo do status;
 *  (f) OE sem registro → trocar o serviço aplica a ficha dele direto, sem pergunta;
 *  (g) serviço de SGQ que o usuário não lê → "Serviço controlado do sistema da qualidade", sem nome,
 *      desligado com "…de outra organização, que você não acessa";
 *  (h) SGQ legível e vazio → "Nenhum serviço controlado ativo para esta obra";
 *  (i) com serviço controlado, os colaboradores avisam "obrigatório para mandar para inspeção";
 *  (j) erro do banco ao salvar aparece com a mensagem dele (não o texto genérico);
 *  (k) revisão final: com serviço controlado, o "Modelo de checklist" fica PRESO à ficha do serviço
 *      (desligado, com o motivo) — o banco só deixa a OE ir à inspeção com a ficha do serviço;
 *  (l) serviço sem ficha → "Crie a ficha de verificação do serviço na Qualidade" e a OE vai sem ficha
 *      (null explícito: não fica a ficha antiga escolhida à mão).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ItemControlado } from '../../types/qualidadeSiac';

// ── banco simulado ───────────────────────────────────────────────────────────
type Filtros = Record<string, unknown>;
const BUDGET_OBRA = [
    { id: 'b1', phase: 'Alvenaria', sinapiItem: { code: '87503', description: 'Alvenaria bloco cerâmico', unit: 'm2', price: 50 } },
    { id: 'b2', phase: 'Pintura', sinapiItem: { code: '11111', description: 'Pintura látex', unit: 'm2', price: 20 } },
];
const PROJETO_PLANEJAMENTO = {
    id: 'plan-1',
    name: 'Planejamento Obra 1',
    settings: { schedule: { itemSchedules: [{ id: 'p1', startDate: '2026-12-01', endDate: '2026-12-10' }] } },
    budget: [{ id: 'p1', phase: 'Revestimentos', sinapiItem: { code: '999', description: 'Reboco interno', unit: 'm2', price: 30 } }],
};
const FICHAS_SGQ = [
    { id: 'tpl-alv', name: 'FVS Alvenaria', service_type: null },
    { id: 'tpl-rev', name: 'FVS Revestimento', service_type: null },
];

function resolver(tabela: string, f: Filtros): unknown {
    switch (tabela) {
        case 'labor_teams': return [];
        case 'employees': return [{ id: 'e1', name: 'João', role: null }];
        case 'work_orders': return [];
        case 'oe_checklist_templates':
            if (Array.isArray(f.id)) return FICHAS_SGQ.filter(t => (f.id as string[]).includes(t.id));
            return [{ id: 'tpl-own', name: 'Ficha própria', service_type: null }];
        case 'projects':
            if (f.id === 'obra-1') return { budget: BUDGET_OBRA, name: 'Obra 1' };
            if (f.id === 'plan-1') return { budget: PROJETO_PLANEJAMENTO.budget };
            return [PROJETO_PLANEJAMENTO];
        default: return null;
    }
}

function consulta(tabela: string) {
    const filtros: Filtros = {};
    const q: Record<string, unknown> = {};
    const encadeia = () => q;
    Object.assign(q, {
        select: encadeia, order: encadeia, neq: encadeia, filter: encadeia, limit: encadeia, single: encadeia,
        eq: (col: string, val: unknown) => { filtros[col] = val; return q; },
        in: (col: string, val: unknown) => { filtros[col] = val; return q; },
        then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) =>
            Promise.resolve({ data: resolver(tabela, filtros), error: null }).then(ok, erro),
    });
    return q;
}

vi.mock('../../lib/supabase', () => ({
    supabase: { from: (t: string) => consulta(t), rpc: vi.fn(async () => ({ data: null, error: null })) },
}));

// ── serviços simulados ───────────────────────────────────────────────────────
const getById = vi.fn();
const create = vi.fn();
const update = vi.fn();
vi.mock('../../services/workOrderService', () => ({
    workOrderService: {
        getById: (...a: unknown[]) => getById(...a),
        create: (...a: unknown[]) => create(...a),
        update: (...a: unknown[]) => update(...a),
    },
}));
vi.mock('../../services/taskService', () => ({ taskService: { ensureTaskForWorkOrder: vi.fn(async () => undefined) } }));

const servicosParaOE = vi.fn();
const sgqDaOrganizacao = vi.fn();
const sgqLegivel = vi.fn();
const oeTemRegistro = vi.fn();
vi.mock('../../services/qualidadeSiacService', () => ({
    qualidadeSiacService: {
        servicosParaOE: (...a: unknown[]) => servicosParaOE(...a),
        sgqDaOrganizacao: (...a: unknown[]) => sgqDaOrganizacao(...a),
        sgqLegivel: (...a: unknown[]) => sgqLegivel(...a),
        oeTemRegistro: (...a: unknown[]) => oeTemRegistro(...a),
    },
}));

import OperacionalForm from '../../components/OperacionalForm';

const servico = (p: Partial<ItemControlado>): ItemControlado => ({
    id: 'i', organization_id: 'org-alpa', tipo: 'SERVICO', nome: 'Serviço', etapa: null, origem: 'ANEXO4',
    anexo4_numero: null, chave_padrao: null, substitui_item_id: null, situacao: 'ATIVO', justificativa: null,
    procedure_document_id: null, training_course_id: null, ordem: 0, codigos: [], checklist_template_id: null, ...p,
});
const ALVENARIA = servico({ id: 'srv-alv', nome: 'Alvenaria de vedação', codigos: ['87503'], checklist_template_id: 'tpl-alv' });
const REVESTIMENTO = servico({ id: 'srv-rev', nome: 'Revestimento interno', codigos: ['999'], checklist_template_id: 'tpl-rev' });

const oe = (p: Record<string, unknown> = {}) => ({
    id: 'wo-1', org_id: 'org-spe', project_id: 'obra-1', status: 'planned', title: 'OE alvenaria',
    type: 'own', priority: 'normal', collaborator_ids: [], controlled_item_id: null, checklist_template_id: null,
    checklist_template: null, budget_item_ref: null, planning_item_ref: null, ...p,
});

const campoServico = () => screen.getByLabelText('Serviço controlado') as HTMLSelectElement;
const campoFicha = () => screen.getByLabelText('Modelo de checklist') as HTMLSelectElement;
const textoDaOpcao = (s: HTMLSelectElement) => s.options[s.selectedIndex]?.textContent ?? '';
const motivo = (el: HTMLElement) => el.closest('[title]')?.getAttribute('title') ?? '';

function renderizar(workOrderId?: string) {
    const onSave = vi.fn();
    render(<OperacionalForm workOrderId={workOrderId} projectId="obra-1" orgId="org-spe" onSave={onSave} onCancel={vi.fn()} />);
    return { onSave };
}

beforeEach(() => {
    vi.clearAllMocks();
    servicosParaOE.mockResolvedValue([ALVENARIA, REVESTIMENTO]);
    sgqDaOrganizacao.mockResolvedValue('org-alpa');
    sgqLegivel.mockResolvedValue(true);
    oeTemRegistro.mockResolvedValue(false);
    create.mockResolvedValue({ id: 'wo-novo', code: 'OE-1' });
    update.mockResolvedValue({ id: 'wo-1', code: 'OE-1' });
});

describe('OperacionalForm — serviço controlado (Qualidade SiAC fase 2)', () => {
    it('(a)(c)(i) item de orçamento com código ligado sugere o serviço, aplica a ficha e salvar grava os dois', async () => {
        const user = userEvent.setup();
        const { onSave } = renderizar();
        await waitFor(() => expect(servicosParaOE).toHaveBeenCalledWith('org-spe', 'obra-1'));
        await waitFor(() => expect(campoServico().disabled).toBe(false));
        expect(screen.queryByText('obrigatório para mandar para inspeção')).toBeNull();

        await user.click(screen.getByRole('button', { name: /Selecionar item do orçamento/ }));
        await user.click(screen.getByRole('button', { name: /Alvenaria bloco cerâmico/ }));

        await waitFor(() => expect(campoServico().value).toBe('srv-alv'));
        expect(screen.getByText('sugerido pelo código do item')).toBeTruthy();
        await waitFor(() => expect(campoFicha().value).toBe('tpl-alv'));
        expect(textoDaOpcao(campoFicha())).toContain('FVS Alvenaria');
        expect(screen.getByText('obrigatório para mandar para inspeção')).toBeTruthy();

        await user.type(screen.getByPlaceholderText(/Execução de alvenaria/), 'OE alvenaria');
        await user.click(screen.getByRole('button', { name: /Criar OE/ }));

        await waitFor(() => expect(create).toHaveBeenCalled());
        expect(create.mock.calls[0][0]).toMatchObject({ controlledItemId: 'srv-alv', checklistTemplateId: 'tpl-alv' });
        await waitFor(() => expect(onSave).toHaveBeenCalledWith('wo-novo'));
    });

    it('(a) escolher o serviço à mão tira o "sugerido"', async () => {
        const user = userEvent.setup();
        renderizar();
        await waitFor(() => expect(campoServico().disabled).toBe(false));
        await user.click(screen.getByRole('button', { name: /Selecionar item do orçamento/ }));
        await user.click(screen.getByRole('button', { name: /Alvenaria bloco cerâmico/ }));
        await waitFor(() => expect(campoServico().value).toBe('srv-alv'));

        await user.selectOptions(campoServico(), 'srv-rev');
        expect(screen.queryByText('sugerido pelo código do item')).toBeNull();
        expect(campoFicha().value).toBe('tpl-rev');
    });

    it('(b) atividade do planejamento sugere pelo código do item de orçamento do projeto de planejamento', async () => {
        const user = userEvent.setup();
        renderizar();
        await waitFor(() => expect(campoServico().disabled).toBe(false));

        await user.click(screen.getByRole('button', { name: /Selecionar atividade do cronograma/ }));
        await waitFor(() => expect(screen.getByRole('option', { name: 'Planejamento Obra 1' })).toBeTruthy());
        await user.selectOptions(screen.getByDisplayValue('Selecione o projeto de planejamento...'), 'plan-1');
        await user.click(await screen.findByRole('button', { name: /Reboco interno/ }));

        await waitFor(() => expect(campoServico().value).toBe('srv-rev'));
        expect(screen.getByText('sugerido pelo código do item')).toBeTruthy();
        expect(campoFicha().value).toBe('tpl-rev');
    });

    it('(d) OE com registro de inspeção: serviço e ficha desligados com o motivo', async () => {
        getById.mockResolvedValue(oe({
            controlled_item_id: 'srv-alv', checklist_template_id: 'tpl-alv', status: 'in_progress',
            checklist_template: { id: 'tpl-alv', name: 'FVS Alvenaria', service_type: null },
        }));
        oeTemRegistro.mockResolvedValue(true);
        renderizar('wo-1');

        await waitFor(() => expect(oeTemRegistro).toHaveBeenCalledWith('wo-1'));
        await waitFor(() => expect(campoServico().disabled).toBe(true));
        expect(campoServico().value).toBe('srv-alv');
        expect(motivo(campoServico())).toMatch(/registro de inspeção/);
        expect(campoFicha().disabled).toBe(true);
        expect(motivo(campoFicha())).toMatch(/registro de inspeção/);
        // a lista vem do SGQ da org DA OE (a do registro), não da prop
        expect(servicosParaOE).toHaveBeenCalledWith('org-spe', 'obra-1');
    });

    it('(e) OE em inspeção sem registro: serviço desligado com o motivo do status', async () => {
        getById.mockResolvedValue(oe({ controlled_item_id: 'srv-alv', checklist_template_id: 'tpl-alv', status: 'pending_inspection' }));
        renderizar('wo-1');
        await waitFor(() => expect(campoServico().disabled).toBe(true));
        expect(motivo(campoServico())).toMatch(/inspeção, aprovada, reprovada, medida ou encerrada/);
    });

    it('(f) OE sem registro: trocar o serviço aplica a ficha dele direto e salvar grava', async () => {
        const user = userEvent.setup();
        getById.mockResolvedValue(oe({ controlled_item_id: 'srv-alv', checklist_template_id: 'tpl-alv' }));
        renderizar('wo-1');
        await waitFor(() => expect(campoServico().disabled).toBe(false));
        expect(campoServico().value).toBe('srv-alv');

        await user.selectOptions(campoServico(), 'srv-rev');
        expect(campoFicha().value).toBe('tpl-rev');
        await user.click(screen.getByRole('button', { name: /Salvar alterações/ }));

        await waitFor(() => expect(update).toHaveBeenCalled());
        expect(update.mock.calls[0][0]).toBe('wo-1');
        expect(update.mock.calls[0][1]).toMatchObject({ controlledItemId: 'srv-rev', checklistTemplateId: 'tpl-rev' });
    });

    it('(g) serviço de SGQ que o usuário não lê: sem nome, desligado com o motivo', async () => {
        servicosParaOE.mockResolvedValue([]);
        sgqLegivel.mockResolvedValue(false);
        getById.mockResolvedValue(oe({ controlled_item_id: 'srv-alv', checklist_template_id: 'tpl-alv' }));
        renderizar('wo-1');

        await waitFor(() => expect(campoServico().disabled).toBe(true));
        expect(textoDaOpcao(campoServico())).toBe('Serviço controlado do sistema da qualidade');
        expect(screen.queryByText(/Alvenaria de vedação/)).toBeNull();
        expect(motivo(campoServico())).toBe(
            'Os serviços controlados vêm do sistema da qualidade de outra organização, que você não acessa');
        expect(sgqLegivel).toHaveBeenCalledWith('org-alpa');
    });

    it('(g) OE nova sem acesso ao SGQ: lista vazia explicada', async () => {
        servicosParaOE.mockResolvedValue([]);
        sgqLegivel.mockResolvedValue(false);
        renderizar();
        await waitFor(() => expect(campoServico().disabled).toBe(true));
        expect(motivo(campoServico())).toBe(
            'Os serviços controlados vêm do sistema da qualidade de outra organização, que você não acessa');
    });

    it('(h) SGQ legível e vazio: "Nenhum serviço controlado ativo para esta obra"', async () => {
        servicosParaOE.mockResolvedValue([]);
        sgqDaOrganizacao.mockResolvedValue('org-spe');
        renderizar();
        await waitFor(() => expect(campoServico().disabled).toBe(true));
        expect(motivo(campoServico())).toBe('Nenhum serviço controlado ativo para esta obra');
    });

    it('(j) erro do banco ao salvar mostra a mensagem dele', async () => {
        const user = userEvent.setup();
        getById.mockResolvedValue(oe({ controlled_item_id: 'srv-alv', checklist_template_id: 'tpl-alv' }));
        update.mockRejectedValue({ message: 'O serviço controlado de uma OE com registro de inspeção não pode ser trocado', code: '42501' });
        renderizar('wo-1');
        await waitFor(() => expect(campoServico().disabled).toBe(false));
        await user.selectOptions(campoServico(), 'srv-rev');
        await user.click(screen.getByRole('button', { name: /Salvar alterações/ }));
        expect(await screen.findByText(/não pode ser trocado/)).toBeTruthy();
    });
    it('(k) com serviço controlado, o modelo de checklist fica preso à ficha do serviço (desligado, com o motivo)', async () => {
        const user = userEvent.setup();
        renderizar();
        await waitFor(() => expect(campoServico().disabled).toBe(false));
        expect(campoFicha().disabled).toBe(false); // OE comum escolhe livre

        await user.selectOptions(campoServico(), 'srv-alv');
        expect(campoFicha().value).toBe('tpl-alv');
        expect(campoFicha().disabled).toBe(true);
        expect(motivo(campoFicha())).toMatch(/vem do serviço controlado/);

        await user.selectOptions(campoServico(), '');
        expect(campoFicha().disabled).toBe(false);
    });

    it('(k) OE controlada sem registro com ficha diferente da do serviço: salvar grava a ficha do serviço', async () => {
        const user = userEvent.setup();
        getById.mockResolvedValue(oe({
            controlled_item_id: 'srv-alv', checklist_template_id: 'tpl-own',
            checklist_template: { id: 'tpl-own', name: 'Ficha própria', service_type: null },
        }));
        renderizar('wo-1');
        await waitFor(() => expect(campoServico().disabled).toBe(false));
        await waitFor(() => expect(campoFicha().value).toBe('tpl-alv'));
        expect(campoFicha().disabled).toBe(true);
        await user.click(screen.getByRole('button', { name: /Salvar alterações/ }));
        await waitFor(() => expect(update).toHaveBeenCalled());
        expect(update.mock.calls[0][1]).toMatchObject({ controlledItemId: 'srv-alv', checklistTemplateId: 'tpl-alv' });
    });

    it('(l) serviço sem ficha: aviso para criar a ficha na Qualidade e a OE vai sem ficha (null)', async () => {
        const SEM_FICHA = servico({ id: 'srv-sem', nome: 'Impermeabilização', checklist_template_id: null });
        servicosParaOE.mockResolvedValue([ALVENARIA, SEM_FICHA]);
        const user = userEvent.setup();
        getById.mockResolvedValue(oe({
            checklist_template_id: 'tpl-own',
            checklist_template: { id: 'tpl-own', name: 'Ficha própria', service_type: null },
        }));
        renderizar('wo-1');
        await waitFor(() => expect(campoServico().disabled).toBe(false));
        expect(screen.queryByText(/Crie a ficha de verificação do serviço na Qualidade/)).toBeNull();

        await user.selectOptions(campoServico(), 'srv-sem');
        expect(screen.getByText(/Crie a ficha de verificação do serviço na Qualidade/)).toBeTruthy();
        expect(campoFicha().value).toBe('');
        expect(campoFicha().disabled).toBe(true);

        await user.click(screen.getByRole('button', { name: /Salvar alterações/ }));
        await waitFor(() => expect(update).toHaveBeenCalled());
        expect(update.mock.calls[0][1]).toMatchObject({ controlledItemId: 'srv-sem', checklistTemplateId: null });
    });

    it('(d) OE com registro: a ficha que está fica (não é trocada pela do serviço)', async () => {
        const user = userEvent.setup();
        getById.mockResolvedValue(oe({
            controlled_item_id: 'srv-alv', checklist_template_id: 'tpl-own', status: 'in_progress',
            checklist_template: { id: 'tpl-own', name: 'Ficha própria', service_type: null },
        }));
        oeTemRegistro.mockResolvedValue(true);
        renderizar('wo-1');
        await waitFor(() => expect(campoFicha().disabled).toBe(true));
        expect(campoFicha().value).toBe('tpl-own');
        await user.click(screen.getByRole('button', { name: /Salvar alterações/ }));
        await waitFor(() => expect(update).toHaveBeenCalled());
        expect(update.mock.calls[0][1]).toMatchObject({ checklistTemplateId: 'tpl-own' });
    });
});
