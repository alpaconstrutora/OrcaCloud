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

    // Pedido de 14/11/2026: "o cronograma não é editável?" — início e prazo da obra e das
    // vendas passam a se editar aqui também (mesmas colunas da aba Dinâmica).
    it('início e prazo da obra e das vendas se editam no Cronograma; a linha do tempo acompanha; grava com "Salvar Premissas"', async () => {
        const user = userEvent.setup();
        premissas();
        await user.click(screen.getByRole('button', { name: /2\. Cronograma/ }));
        const duracaoObra = screen.getByLabelText('Duração da obra (meses)') as HTMLInputElement;
        expect(duracaoObra.value).toBe('24');
        expect((screen.getByLabelText('Início da obra (mês)') as HTMLInputElement).value).toBe('6');
        expect((screen.getByLabelText('Início das vendas (mês)') as HTMLInputElement).value).toBe('1');
        expect((screen.getByLabelText('Duração das vendas (meses)') as HTMLInputElement).value).toBe('24');

        const linha = screen.getByRole('list', { name: 'Linha do tempo dos marcos' });
        const habiteSe = () => within(linha).getByText('Habite-se (fim da obra)').closest('li')!.textContent;
        expect(habiteSe()).toContain('Mês 29');
        await user.clear(duracaoObra);
        await user.type(duracaoObra, '12');
        expect(habiteSe()).toContain('Mês 17');

        // Apagar volta ao padrão (vazio = coluna vazia, o motor usa o padrão).
        await user.clear(screen.getByLabelText('Duração das vendas (meses)'));
        expect((screen.getByLabelText('Duração das vendas (meses)') as HTMLInputElement).placeholder).toBe('Vazio = 36 meses');

        expect(svc.updateStudy).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Salvar Premissas' }));
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', expect.objectContaining({
            construction_duration_months: 12, construction_start_month: 6, sales_start_month: 1, sales_duration_months: null,
        }));
    });

    it('só leitura: os campos de obra e vendas ficam travados', async () => {
        const user = userEvent.setup();
        premissas({}, true);
        await user.click(screen.getByRole('button', { name: /2\. Cronograma/ }));
        expect(screen.getByLabelText('Duração da obra (meses)')).toBeDisabled();
        expect(screen.getByLabelText('Início das vendas (mês)')).toBeDisabled();
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
        expect(svc.salvarItemDaDueDiligence).toHaveBeenCalledWith('dd7', { status: 'problema' });
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

    it('curva personalizada: pesos digitados em sequência não se perdem antes de o estudo recarregar', async () => {
        const user = userEvent.setup();
        svc.seedCapexTemplate.mockResolvedValue(rubricas);
        envolver(<ImovibCapexForm study={estudo({ cost_curve_type: 'custom', construction_duration_months: 4 }) as never} onDataChanged={vi.fn()} />);
        await user.type(await screen.findByLabelText('Mês 6'), '40');
        await user.tab();
        await user.type(screen.getByLabelText('Mês 7'), '60');
        await user.tab();
        expect(svc.updateStudy).toHaveBeenLastCalledWith('estudo-teste', { cost_curve_custom: [40, 60, 0, 0] });
        expect((screen.getByLabelText('Mês 6') as HTMLInputElement).value).toBe('40');
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

describe('Premissas abre na sub-aba pedida (aviso → sub-aba)', () => {
    it('subAba="cronograma" abre o Cronograma e troca quando o pedido muda', () => {
        const { rerender } = envolver(<ImovibPremisesForm study={estudo() as never} onDataChanged={vi.fn()} subAba={{ sub: 'cronograma', n: 1 }} />);
        expect(screen.getByRole('list', { name: 'Linha do tempo dos marcos' })).toBeTruthy();
        rerender(
            <ToastProvider><ConfirmProvider><ImovibEdicaoProvider value={{ pode: true, motivo: '' }}>
                <ImovibPremisesForm study={estudo() as never} onDataChanged={vi.fn()} subAba={{ sub: 'terreno', n: 2 }} />
            </ImovibEdicaoProvider></ConfirmProvider></ToastProvider>,
        );
        expect(screen.getByText(/Pagamento à vista/)).toBeTruthy();
    });
});

/** Pendências da Fase 5 do plano 2026-11-11: valor digitado ficava no campo depois de erro ao gravar. */
describe('erro ao gravar volta o campo ao que está gravado', () => {
    it('observação da due diligence: grava só a observação; com erro, o campo volta', async () => {
        const user = userEvent.setup();
        svc.listarDueDiligence.mockResolvedValue(itensDD().map(i => (i.id === 'dd0' ? { ...i, notes: 'velha' } : i)));
        svc.salvarItemDaDueDiligence.mockRejectedValue(new Error('Sem permissão para editar a due diligence deste estudo.'));
        premissas();
        await user.click(screen.getByRole('button', { name: /3\. Terreno/ }));
        const campo = await screen.findByLabelText('Observação de Matrícula atualizada') as HTMLInputElement;
        await user.clear(campo);
        await user.type(campo, 'nova');
        await user.tab();
        expect(svc.salvarItemDaDueDiligence).toHaveBeenCalledWith('dd0', { notes: 'nova' });
        await waitFor(() => expect((screen.getByLabelText('Observação de Matrícula atualizada') as HTMLInputElement).value).toBe('velha'));
    });

    it('meses de pós-obra da rubrica: com erro, o campo volta', async () => {
        const user = userEvent.setup();
        svc.seedCapexTemplate.mockResolvedValue([
            { id: 'p1', study_id: 'estudo-teste', category: '10. Pós-obra', name: 'Assistência técnica', value_type: 'currency', value: 1000, base: 'obra', timing: 'pos_obra', timing_months: 12 },
        ]);
        svc.updateCapexItem.mockRejectedValue(new Error('falhou'));
        envolver(<ImovibCapexForm study={estudo() as never} onDataChanged={vi.fn()} />);
        const campo = await screen.findByLabelText('Meses de pós-obra: Assistência técnica') as HTMLInputElement;
        await user.clear(campo);
        await user.type(campo, '24');
        await user.tab();
        expect(svc.updateCapexItem).toHaveBeenCalledWith('p1', { timing_months: 24 });
        await waitFor(() => expect((screen.getByLabelText('Meses de pós-obra: Assistência técnica') as HTMLInputElement).value).toBe('12'));
    });
});

describe('revisão do grupo C — erro numa rubrica não mexe nas outras', () => {
    it('falha ao gravar A não apaga o que está sendo digitado em B', async () => {
        const user = userEvent.setup();
        svc.seedCapexTemplate.mockResolvedValue([
            { id: 'p1', study_id: 'estudo-teste', category: '10. Pós-obra', name: 'Assistência técnica', value_type: 'currency', value: 1000, base: 'obra', timing: 'pos_obra', timing_months: 12 },
            { id: 'p2', study_id: 'estudo-teste', category: '10. Pós-obra', name: 'Manutenção', value_type: 'currency', value: 1000, base: 'obra', timing: 'pos_obra', timing_months: 12 },
        ]);
        let falhar!: (e: Error) => void;
        svc.updateCapexItem.mockImplementation(() => new Promise((_, rej) => { falhar = rej; }));
        envolver(<ImovibCapexForm study={estudo() as never} onDataChanged={vi.fn()} />);
        const a = await screen.findByLabelText('Meses de pós-obra: Assistência técnica') as HTMLInputElement;
        await user.clear(a);
        await user.type(a, '24');
        const b = screen.getByLabelText('Meses de pós-obra: Manutenção') as HTMLInputElement;
        await user.click(b);
        await user.clear(b);
        await user.type(b, '30');
        falhar(new Error('falhou'));
        await waitFor(() => expect((screen.getByLabelText('Meses de pós-obra: Assistência técnica') as HTMLInputElement).value).toBe('12'));
        expect((screen.getByLabelText('Meses de pós-obra: Manutenção') as HTMLInputElement).value).toBe('30');
    });
});

describe('Orçamento › "No cálculo" (pendência da Fase 5)', () => {
    it('o cabeçalho e a célula de rubrica com momento dizem que o valor leva o índice dos meses em que sai', async () => {
        svc.seedCapexTemplate.mockResolvedValue([
            { id: 'r1', study_id: 'estudo-teste', category: '2. Projetos e Consultorias', name: 'Projeto', value_type: 'currency', value: 100000, base: 'obra', timing: 'pre_obra' },
        ]);
        envolver(<ImovibCapexForm study={estudo() as never} onDataChanged={vi.fn()} />);
        await screen.findByLabelText('Quando sai: Projeto');
        expect(screen.getByRole('columnheader', { name: 'No cálculo' }).getAttribute('title')).toMatch(/índice/);
        const linha = screen.getByLabelText('Quando sai: Projeto').closest('tr')!;
        const celula = within(linha).getAllByRole('cell').at(-2)!;
        expect(celula.getAttribute('title')).toMatch(/índice dos meses em que sai/);
    });
});
