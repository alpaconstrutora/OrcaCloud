// @vitest-environment jsdom
/**
 * Telas da Fase 5 (plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md):
 * Premissas › Cronograma e Terreno (5.1, 5.2), due diligence (5.9), "Quando sai"
 * e pós-obra no CAPEX (5.5, 5.6), e o modo só leitura.
 */
import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    updateStudy: vi.fn(),
    seedCapexTemplate: vi.fn(),
    upsertCapexItems: vi.fn(),
    updateCapexItem: vi.fn(),
    adicionarRubricasPosObra: vi.fn(),
    listarDueDiligence: vi.fn(),
    criarDueDiligence: vi.fn(),
    salvarItemDaDueDiligence: vi.fn(),
    listarEmpreendimentosParaVincular: vi.fn(),
}));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: { listRegulatoryZonesByImovibStudy: vi.fn().mockResolvedValue([]), getById: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../../services/cubService', () => ({ cubDoPadrao: vi.fn().mockResolvedValue({ valorM2: 2000, fonte: 'TABELA', referencia: '10/2026 · Com Desoneração' }) }));
vi.mock('../../services/imovibCurvaDoPlanejamento', () => ({ curvaDoPlanejamentoDaObra: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import ImovibPremisesForm from '../../components/ImovibPremisesForm';
import ImovibCapexForm from '../../components/ImovibCapexForm';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ToastProvider } from '../../components/ui/toast';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { IMOVIB_DUE_DILIGENCE } from '../../constants/imovibDueDiligence';
import { baseStudy } from '../fixtures/imovibEstudos';

const estudo = (over: Record<string, unknown> = {}) => ({ ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '', capex_seeded_at: '2026-10-12', capex_mode: 'detailed' });
const envolver = (el: React.ReactElement, somenteLeitura = false) => render(
    <ToastProvider>
        <ConfirmProvider>
            <ImovibEdicaoProvider value={somenteLeitura ? { pode: false, motivo: 'Sem permissão' } : { pode: true, motivo: '' }}>{el}</ImovibEdicaoProvider>
        </ConfirmProvider>
    </ToastProvider>,
);
const premissas = (over: Record<string, unknown> = {}, somenteLeitura = false) =>
    envolver(<ImovibPremisesForm study={estudo(over) as never} onDataChanged={vi.fn()} />, somenteLeitura);
const itensDD = () => IMOVIB_DUE_DILIGENCE.map((it, i) => ({ id: `dd${i}`, study_id: 'estudo-teste', item_key: it.key, label: it.label, status: 'pendente', notes: null, sort_order: i }));

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    svc.updateStudy.mockResolvedValue({});
    svc.listarDueDiligence.mockResolvedValue([]);
    svc.listarEmpreendimentosParaVincular.mockResolvedValue([]);
});

describe('Premissas › Cronograma (5.1)', () => {
    it('linha do tempo com os marcos; registro depois do lançamento avisa; grava com "Salvar Premissas"', async () => {
        const user = userEvent.setup();
        premissas({ base_date: '2027-01-15' });
        await user.click(screen.getByRole('button', { name: /2\. Cronograma/ }));
        const linha = screen.getByRole('list', { name: 'Linha do tempo dos marcos' });
        expect(within(linha).getByText('Início da obra')).toBeTruthy();
        expect(within(linha).getByText(/jun\/27 \(mês 6\)/)).toBeTruthy();
        await user.type(screen.getByLabelText('Registro da incorporação (mês)'), '5');
        expect(await screen.findByText(/Lei 4\.591\/64/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Salvar Premissas' }));
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', expect.objectContaining({ incorporation_registry_month: 5 }));
    });
});

describe('Premissas › Terreno (5.2 e 5.9)', () => {
    it('parcelas: soma e aviso quando não fecha 100%', async () => {
        const user = userEvent.setup();
        premissas();
        await user.click(screen.getByRole('button', { name: /3\. Terreno/ }));
        expect(screen.getByText(/Pagamento à vista/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Adicionar parcela' }));
        const pct = screen.getByLabelText('% do terreno');
        await user.clear(pct);
        await user.type(pct, '40');
        expect(screen.getByText(/Soma das parcelas: 40%/)).toBeTruthy();
        expect(screen.getByText(/As parcelas do terreno somam 40%/)).toBeTruthy();
    });

    it('due diligence: "Criar checklist" grava os 14 itens; mudar a situação grava e atualiza o contador', async () => {
        const user = userEvent.setup();
        svc.criarDueDiligence.mockResolvedValue(itensDD());
        svc.salvarItemDaDueDiligence.mockImplementation(async (id: string, c: Record<string, unknown>) => ({ ...itensDD().find(i => i.id === id)!, ...c }));
        premissas();
        await user.click(screen.getByRole('button', { name: /3\. Terreno/ }));
        await user.click(await screen.findByRole('button', { name: 'Criar checklist' }));
        expect(svc.criarDueDiligence).toHaveBeenCalledWith('estudo-teste', IMOVIB_DUE_DILIGENCE);
        expect(await screen.findByText(/0 de 14 ok/)).toBeTruthy();
        await user.selectOptions(screen.getByLabelText('Situação de Matrícula atualizada'), 'ok');
        await user.selectOptions(screen.getByLabelText('Situação de Contaminação'), 'problema');
        await waitFor(() => expect(screen.getByText(/1 de 14 ok, 1 com problema/)).toBeTruthy());
        expect(svc.salvarItemDaDueDiligence).toHaveBeenCalledWith('dd7', { status: 'problema', notes: null });
        expect(screen.queryByRole('button', { name: 'Criar checklist' })).toBeNull();
    });

    it('só leitura: due diligence sem botão habilitado, e nada grava ao abrir', async () => {
        const user = userEvent.setup();
        premissas({}, true);
        await user.click(screen.getByRole('button', { name: /3\. Terreno/ }));
        const criar = await screen.findByRole('button', { name: 'Criar checklist' });
        expect(criar.hasAttribute('disabled')).toBe(true);
        expect(criar.getAttribute('title')).toBe('Sem permissão');
        expect(svc.criarDueDiligence).not.toHaveBeenCalled();
        expect(svc.updateStudy).not.toHaveBeenCalled();
    });
});

describe('CAPEX: momento das rubricas e pós-obra (5.5 e 5.6)', () => {
    const rubricas = [
        { id: 'r1', study_id: 'estudo-teste', category: '2. Projetos e Consultorias', name: 'Projeto', value_type: 'currency', value: 100000, base: 'obra', timing: null },
        { id: 'r2', study_id: 'estudo-teste', category: '5. Marketing e Vendas', name: 'Comissão', value_type: 'percent', value: 5, base: 'vgv', timing: null },
    ];
    const capex = (somenteLeitura = false) => envolver(<ImovibCapexForm study={estudo() as never} onDataChanged={vi.fn()} />, somenteLeitura);

    it('"Quando sai" grava o momento; rubrica em % do VGV sai com a receita', async () => {
        const user = userEvent.setup();
        svc.seedCapexTemplate.mockResolvedValue(rubricas);
        svc.updateCapexItem.mockResolvedValue(undefined);
        capex();
        await user.selectOptions(await screen.findByLabelText('Quando sai: Projeto'), 'pre_obra');
        expect(svc.updateCapexItem).toHaveBeenCalledWith('r1', { timing: 'pre_obra' });
        expect(screen.queryByLabelText('Quando sai: Comissão')).toBeNull();
        expect(screen.getByText('Com a receita')).toBeTruthy();
    });

    it('"Adicionar rubricas de pós-obra" cria a categoria 10 e depois fica desligado com o motivo', async () => {
        const user = userEvent.setup();
        svc.seedCapexTemplate.mockResolvedValue(rubricas);
        const posObra = [
            { id: 'p1', study_id: 'estudo-teste', category: '10. Pós-obra', name: 'Assistência técnica', value_type: 'percent', value: 0, base: 'obra', timing: 'pos_obra' },
            { id: 'p2', study_id: 'estudo-teste', category: '10. Pós-obra', name: 'Manutenção e garantia', value_type: 'currency', value: 0, base: 'obra', timing: 'pos_obra' },
        ];
        svc.adicionarRubricasPosObra.mockResolvedValue([...rubricas, ...posObra]);
        capex();
        const botao = await screen.findByRole('button', { name: 'Adicionar rubricas de pós-obra' });
        await user.click(botao);
        expect(svc.adicionarRubricasPosObra).toHaveBeenCalledWith('estudo-teste');
        expect(await screen.findByText('10. Pós-obra')).toBeTruthy();
        expect(botao.hasAttribute('disabled')).toBe(true);
        expect(botao.getAttribute('title')).toMatch(/já existem/);
    });
});
