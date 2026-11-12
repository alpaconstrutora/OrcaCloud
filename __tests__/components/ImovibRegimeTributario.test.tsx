// @vitest-environment jsdom
/**
 * Regime tributário na aba Orçamento (item 6.3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, D4): escolha,
 * alíquotas, comparação, sugestão pela empresa, rubricas 7. fora do cálculo e
 * modo só leitura.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    updateStudy: vi.fn(),
    seedCapexTemplate: vi.fn(),
    updateCapexItem: vi.fn(),
    adicionarRubricasPosObra: vi.fn(),
}));
const emp = vi.hoisted(() => ({ getById: vi.fn() }));
const empresas = vi.hoisted(() => ({ get: vi.fn(), getIncorporacao: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { ...emp, listRegulatoryZonesByImovibStudy: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/companyService', () => ({ companyService: empresas }));
vi.mock('../../services/cubService', () => ({ cubDoPadrao: vi.fn().mockResolvedValue({ valorM2: 2000, fonte: 'TABELA', referencia: '10/2026' }) }));
vi.mock('../../services/imovibCurvaDoPlanejamento', () => ({ curvaDoPlanejamentoDaObra: vi.fn().mockResolvedValue({ motivo: 'sem planejamento' }) }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import ImovibCapexForm from '../../components/ImovibCapexForm';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ToastProvider } from '../../components/ui/toast';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { baseStudy } from '../fixtures/imovibEstudos';

const rubricas = [
    { id: 'r7', study_id: 'estudo-teste', category: '7. Impostos', name: 'RET (Regime Especial)', value_type: 'percent', value: 4, base: 'vgv' },
];
const estudo = (over: Record<string, unknown> = {}) => ({ ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '', capex_seeded_at: '2026-10-12', capex_mode: 'detailed', capex_items: rubricas });
const tela = (over: Record<string, unknown> = {}, somenteLeitura = false) => render(
    <ToastProvider>
        <ConfirmProvider>
            <ImovibEdicaoProvider value={somenteLeitura ? { pode: false, motivo: 'Sem permissão' } : { pode: true, motivo: '' }}>
                <ImovibCapexForm study={estudo(over) as never} onDataChanged={vi.fn()} />
            </ImovibEdicaoProvider>
        </ConfirmProvider>
    </ToastProvider>,
);

beforeEach(() => {
    for (const f of [...Object.values(svc), ...Object.values(emp), ...Object.values(empresas)]) f.mockReset();
    svc.updateStudy.mockResolvedValue({});
    svc.seedCapexTemplate.mockResolvedValue(rubricas);
    emp.getById.mockResolvedValue(null);
});

describe('Regime tributário', () => {
    it('escolher o regime grava; manual não mostra alíquotas; a comparação tem os cinco regimes', async () => {
        const user = userEvent.setup();
        tela();
        const secao = await screen.findByRole('region', { name: 'Regime tributário' });
        expect(within(secao).queryByText('RET', { selector: 'span' })).toBeNull();
        expect(within(secao).getAllByRole('row').length).toBeGreaterThanOrEqual(6);
        expect(within(secao).getByText(/escolhido/).closest('tr')!.textContent).toMatch(/Manual/);
        await user.selectOptions(within(secao).getByLabelText('Regime'), 'ret');
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', { tax_regime: 'ret' });
    });

    it('com RET: a alíquota aparece, a rubrica de imposto fica desligada com o motivo e o aviso de imposto em dobro some', async () => {
        tela({ tax_regime: 'ret' });
        const secao = await screen.findByRole('region', { name: 'Regime tributário' });
        expect(within(secao).getByText(/escolhido/).closest('tr')!.textContent).toMatch(/RET \(patrimônio/);
        expect(within(secao).getByText('% da receita')).toBeTruthy();
        const linhaDaRubrica = screen.getByDisplayValue('RET (Regime Especial)').closest('tr')!;
        const valor = within(linhaDaRubrica).getByDisplayValue('4') as HTMLInputElement;
        expect(valor.disabled).toBe(true);
        expect(valor.title).toMatch(/regime tributário/);
        expect(within(secao).getByText('Fora do cálculo neste regime: RET (Regime Especial) (4%).')).toBeTruthy();
        // A rubrica fora do cálculo vale 0 "No cálculo".
        expect(within(linhaDaRubrica).getByText('R$ 0', { normalizer: t => t.replace(/\s/g, ' ').trim() })).toBeTruthy();
    });

    it('6.4 — estudo novo nasce com INSS e ISS da obra no modelo de rubricas', async () => {
        render(
            <ToastProvider>
                <ConfirmProvider>
                    <ImovibEdicaoProvider value={{ pode: true, motivo: '' }}>
                        <ImovibCapexForm study={{ ...estudo(), capex_seeded_at: null } as never} onDataChanged={vi.fn()} />
                    </ImovibEdicaoProvider>
                </ConfirmProvider>
            </ToastProvider>,
        );
        await screen.findByRole('region', { name: 'Regime tributário' });
        const modelo = svc.seedCapexTemplate.mock.calls[0][1] as { name: string; category: string; value: number }[];
        expect(modelo.find(r => r.name === 'INSS da obra (aferição)')).toMatchObject({ category: '4. Construção Indireta', value: 0 });
        expect(modelo.find(r => r.name === 'ISS da construção (construtora terceira)')).toMatchObject({ category: '4. Construção Indireta', value: 0, value_type: 'percent' });
    });

    it('estudo vinculado: sugere RET pela empresa com patrimônio de afetação; "Usar a sugestão" grava', async () => {
        const user = userEvent.setup();
        emp.getById.mockResolvedValue({ id: 'e1', company_id: 'c1' });
        empresas.get.mockResolvedValue({ id: 'c1', razao_social: 'SPE Garden Ltda', regime_tributario: 'lucro_presumido' });
        empresas.getIncorporacao.mockResolvedValue({ company_id: 'c1', tipo_spe: 'patrimonio_afetacao' });
        tela({ estrutura: { origem: 'empreendimento', empreendimento_id: 'e1', torres: 1, unidades: 40, blocos_fora_do_calculo: [] } });
        expect(await screen.findByText(/SPE Garden Ltda tem patrimônio de afetação/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Usar a sugestão' }));
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', { tax_regime: 'ret' });
    });

    it('a afetação do estudo vale mais que o tipo da empresa: estudo com afetação sugere RET', async () => {
        emp.getById.mockResolvedValue({ id: 'e1', company_id: 'c1' });
        empresas.get.mockResolvedValue({ id: 'c1', razao_social: 'SPE Garden Ltda', regime_tributario: 'lucro_presumido' });
        empresas.getIncorporacao.mockResolvedValue({ company_id: 'c1', tipo_spe: 'spe' });
        tela({ patrimonio_afetacao: true, estrutura: { origem: 'empreendimento', empreendimento_id: 'e1', torres: 1, unidades: 40, blocos_fora_do_calculo: [] } });
        expect(await screen.findByText(/o estudo tem patrimônio de afetação/)).toBeTruthy();
    });

    it('estudo marcado sem afetação: não sugere RET mesmo com a empresa no tipo patrimônio de afetação', async () => {
        emp.getById.mockResolvedValue({ id: 'e1', company_id: 'c1' });
        empresas.get.mockResolvedValue({ id: 'c1', razao_social: 'SPE Garden Ltda', regime_tributario: 'lucro_presumido' });
        empresas.getIncorporacao.mockResolvedValue({ company_id: 'c1', tipo_spe: 'patrimonio_afetacao' });
        tela({ patrimonio_afetacao: false, estrutura: { origem: 'empreendimento', empreendimento_id: 'e1', torres: 1, unidades: 40, blocos_fora_do_calculo: [] } });
        expect(await screen.findByText(/está no lucro presumido/)).toBeTruthy();
    });

    it('só leitura: o regime não muda e nada grava', async () => {
        tela({}, true);
        const secao = await screen.findByRole('region', { name: 'Regime tributário' });
        expect((within(secao).getByLabelText('Regime') as HTMLSelectElement).closest('fieldset')!.disabled).toBe(true);
        expect(svc.updateStudy).not.toHaveBeenCalled();
    });
});
