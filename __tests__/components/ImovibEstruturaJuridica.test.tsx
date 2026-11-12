// @vitest-environment jsdom
/**
 * Premissas › Identificação › Estrutura jurídica (item 9.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ updateStudy: vi.fn(), listarEmpreendimentosParaVincular: vi.fn() }));
const emp = vi.hoisted(() => ({ getById: vi.fn(), listRegulatoryZonesByImovibStudy: vi.fn() }));
const cia = vi.hoisted(() => ({ get: vi.fn(), getIncorporacao: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: emp }));
vi.mock('../../services/companyService', () => ({ companyService: cia }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import ImovibPremisesForm from '../../components/ImovibPremisesForm';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ToastProvider } from '../../components/ui/toast';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { baseStudy } from '../fixtures/imovibEstudos';

const vinculado = { origem: 'empreendimento' as const, empreendimento_id: 'emp-1', empreendimento_nome: 'Residencial', blueprint_study_id: null, torres: 1, unidades: 40, blocos_fora_do_calculo: [] };
const tela = (over: Record<string, unknown> = {}, somenteLeitura = false) => {
    const user = userEvent.setup();
    render(
        <ToastProvider>
            <ConfirmProvider>
                <ImovibEdicaoProvider value={somenteLeitura ? { pode: false, motivo: 'Sem permissão' } : { pode: true, motivo: '' }}>
                    <ImovibPremisesForm study={{ ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never} onDataChanged={vi.fn()} />
                </ImovibEdicaoProvider>
            </ConfirmProvider>
        </ToastProvider>,
    );
    return user;
};
const cartao = () => screen.getByRole('region', { name: 'Estrutura jurídica' });

beforeEach(() => {
    for (const f of [...Object.values(svc), ...Object.values(emp), ...Object.values(cia)]) f.mockReset();
    svc.updateStudy.mockResolvedValue({});
    svc.listarEmpreendimentosParaVincular.mockResolvedValue([]);
    emp.listRegulatoryZonesByImovibStudy.mockResolvedValue([]);
    emp.getById.mockResolvedValue(null);
});

describe('9.1 — estrutura jurídica', () => {
    it('estudo sem vínculo: edita veículo e afetação à mão e grava com "Salvar Premissas"', async () => {
        const user = tela();
        await user.selectOptions(within(cartao()).getByLabelText('Veículo da incorporação'), 'spe');
        await user.click(within(cartao()).getByLabelText('Patrimônio de afetação'));
        expect(within(cartao()).getByText(/devolução padrão no distrato passa a 50%/i)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: /Salvar Premissas/ }));
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', expect.objectContaining({ legal_vehicle: 'spe', patrimonio_afetacao: true }));
        expect(cia.getIncorporacao).not.toHaveBeenCalled();
    });

    it('vinculado a empreendimento sem empresa: diz onde cadastrar', async () => {
        emp.getById.mockResolvedValue({ id: 'emp-1', company_id: null });
        tela({ estrutura: vinculado });
        expect(await within(cartao()).findByText(/empreendimento vinculado não tem empresa/i)).toBeTruthy();
        expect(within(cartao()).queryByRole('button', { name: /Usar o cadastro da empresa/ })).toBeNull();
    });

    it('vinculado com empresa: mostra o cadastro só leitura e "Usar o cadastro da empresa" preenche os dois campos', async () => {
        emp.getById.mockResolvedValue({ id: 'emp-1', company_id: 'cia-1' });
        cia.get.mockResolvedValue({ id: 'cia-1', razao_social: 'Residencial SPE Ltda' });
        cia.getIncorporacao.mockResolvedValue({ company_id: 'cia-1', tipo_spe: 'patrimonio_afetacao', registro_incorporacao: 'R-7/12.345', cartorio: '2º RI de Campinas', matriculas: ['12.345'], alvara_construcao: '123/2026', habite_se: null });
        const user = tela({ estrutura: vinculado });
        expect(await within(cartao()).findByText('R-7/12.345')).toBeTruthy();
        expect(within(cartao()).getByText('2º RI de Campinas')).toBeTruthy();
        await user.click(within(cartao()).getByRole('button', { name: /Usar o cadastro da empresa/ }));
        expect((within(cartao()).getByLabelText('Veículo da incorporação') as HTMLSelectElement).value).toBe('propria');
        expect((within(cartao()).getByLabelText('Patrimônio de afetação') as HTMLInputElement).checked).toBe(true);
        await user.click(screen.getByRole('button', { name: /Salvar Premissas/ }));
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', expect.objectContaining({ legal_vehicle: 'propria', patrimonio_afetacao: true }));
    });

    it('empresa sem dados de incorporação: diz onde cadastrar', async () => {
        emp.getById.mockResolvedValue({ id: 'emp-1', company_id: 'cia-1' });
        cia.get.mockResolvedValue({ id: 'cia-1', razao_social: 'Residencial SPE Ltda' });
        cia.getIncorporacao.mockResolvedValue(null);
        tela({ estrutura: vinculado });
        expect(await within(cartao()).findByText(/aba Incorporação/i)).toBeTruthy();
    });

    it('quem só lê não edita nem preenche pelo cadastro', async () => {
        emp.getById.mockResolvedValue({ id: 'emp-1', company_id: 'cia-1' });
        cia.get.mockResolvedValue({ id: 'cia-1', razao_social: 'Residencial SPE Ltda' });
        cia.getIncorporacao.mockResolvedValue({ company_id: 'cia-1', tipo_spe: 'spe' });
        tela({ estrutura: vinculado }, true);
        const botao = await within(cartao()).findByRole('button', { name: /Usar o cadastro da empresa/ });
        expect((botao as HTMLButtonElement).disabled).toBe(true);
        expect(botao.getAttribute('title')).toBe('Sem permissão');
        // Desligado pelo <fieldset disabled> (a propriedade `disabled` do campo não reflete o fieldset).
        expect(within(cartao()).getByLabelText('Veículo da incorporação').matches(':disabled')).toBe(true);
    });
});
