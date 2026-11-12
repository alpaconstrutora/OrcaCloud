// @vitest-environment jsdom
/**
 * Capital › Sócios (item 9.2 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ listarSocios: vi.fn(), salvarSocio: vi.fn(), excluirSocio: vi.fn(), importarSociosDaEmpresa: vi.fn() }));
const emp = vi.hoisted(() => ({ getById: vi.fn() }));
const cia = vi.hoisted(() => ({ get: vi.fn(), listPartners: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: emp }));
vi.mock('../../services/companyService', () => ({ companyService: cia }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import ImovibSociosCard from '../../components/ImovibSociosCard';
import { ToastProvider } from '../../components/ui/toast';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { computeImovibMath } from '../../hooks/useImovibMath';
import { baseStudy } from '../fixtures/imovibEstudos';

const vinculado = { origem: 'empreendimento' as const, empreendimento_id: 'emp-1', empreendimento_nome: 'Residencial', blueprint_study_id: null, torres: 1, unidades: 40, blocos_fora_do_calculo: [] };
const socio = (id: string, name: string, share_percent: number, capital_percent: number) =>
    ({ id, study_id: 'estudo-teste', name, share_percent, capital_percent, sort_order: 0 });
const tela = (over: Record<string, unknown> = {}, somenteLeitura = false) => {
    const user = userEvent.setup();
    const study = { ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' };
    render(
        <ToastProvider>
            <ConfirmProvider>
                <ImovibEdicaoProvider value={somenteLeitura ? { pode: false, motivo: 'Sem permissão' } : { pode: true, motivo: '' }}>
                    <ImovibSociosCard study={study as never} resultado={computeImovibMath(study as never)} />
                </ImovibEdicaoProvider>
            </ConfirmProvider>
        </ToastProvider>,
    );
    return user;
};
const cartao = () => screen.getByRole('region', { name: 'Sócios' });

beforeEach(() => {
    for (const f of [...Object.values(svc), ...Object.values(emp), ...Object.values(cia)]) f.mockReset();
    svc.listarSocios.mockResolvedValue([socio('a', 'Ana', 60, 60), socio('b', 'Bruno', 40, 40)]);
    emp.getById.mockResolvedValue(null);
});

describe('9.2 — sócios e resultado por sócio', () => {
    it('lista os sócios com aportes, lucro e TIR; 60/40 nos dois percentuais não avisa', async () => {
        tela();
        expect(await within(cartao()).findByText('Ana')).toBeTruthy();
        expect(within(cartao()).getByText('Bruno')).toBeTruthy();
        expect(within(cartao()).getAllByText(/% a\.a\./).length).toBeGreaterThanOrEqual(2);
        expect(within(cartao()).queryByText(/soma/)).toBeNull();
    });

    it('soma diferente de 100%: aviso no cartão', async () => {
        svc.listarSocios.mockResolvedValue([socio('a', 'Ana', 50, 60), socio('b', 'Bruno', 40, 40)]);
        tela();
        expect(await within(cartao()).findByText(/resultado soma 90%/)).toBeTruthy();
    });

    it('novo sócio: o drawer grava e fecha (criar fecha)', async () => {
        svc.listarSocios.mockResolvedValue([]);
        svc.salvarSocio.mockImplementation(async (s: Record<string, unknown>) => ({ id: 'novo', ...s }));
        const user = tela();
        await user.click(await within(cartao()).findByRole('button', { name: /Novo sócio/ }));
        await user.type(screen.getByLabelText('Nome'), 'Carla');
        await user.type(screen.getByLabelText('Participação no resultado (%)'), '100');
        await user.type(screen.getByLabelText('Participação nos aportes (%)'), '100');
        await user.click(screen.getByRole('button', { name: 'Criar sócio' }));
        expect(svc.salvarSocio).toHaveBeenCalledWith(expect.objectContaining({ study_id: 'estudo-teste', name: 'Carla', share_percent: 100, capital_percent: 100 }));
        expect(await within(cartao()).findByText('Carla')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Criar sócio' })).toBeNull();
    });

    it('importar os sócios da empresa do empreendimento: só os atuais', async () => {
        emp.getById.mockResolvedValue({ id: 'emp-1', company_id: 'cia-1' });
        cia.get.mockResolvedValue({ id: 'cia-1', razao_social: 'Residencial SPE Ltda' });
        cia.listPartners.mockResolvedValue([
            { id: 'p1', nome: 'Ana', participacao_pct: 70 },
            { id: 'p2', nome: 'Saiu', participacao_pct: 30, data_saida: '2020-01-01' },
            { id: 'p3', nome: 'Ainda não entrou', participacao_pct: 10, data_entrada: '2999-01-01' },
        ]);
        svc.listarSocios.mockResolvedValue([]);
        svc.importarSociosDaEmpresa.mockResolvedValue([socio('x', 'Ana', 70, 70)]);
        const user = tela({ estrutura: vinculado });
        const botao = await within(cartao()).findByRole('button', { name: /Importar os sócios da empresa/ }) as HTMLButtonElement;
        await vi.waitFor(() => expect(botao.disabled).toBe(false));
        await user.click(botao);
        expect(svc.importarSociosDaEmpresa).toHaveBeenCalledWith('estudo-teste', [{ id: 'p1', nome: 'Ana', participacao_pct: 70 }], 0);
        expect(await within(cartao()).findByText('Ana')).toBeTruthy();
    });

    it('importar quando todos já estão na lista: avisa em vez de não fazer nada', async () => {
        emp.getById.mockResolvedValue({ id: 'emp-1', company_id: 'cia-1' });
        cia.get.mockResolvedValue({ id: 'cia-1', razao_social: 'Residencial SPE Ltda' });
        cia.listPartners.mockResolvedValue([{ id: 'p1', nome: 'Ana', participacao_pct: 60 }]);
        svc.listarSocios.mockResolvedValue([{ ...socio('a', 'Ana', 60, 60), company_partner_id: 'p1' }]);
        svc.importarSociosDaEmpresa.mockResolvedValue([{ ...socio('a', 'Ana', 60, 60), company_partner_id: 'p1' }]);
        const user = tela({ estrutura: vinculado });
        await within(cartao()).findByText('Ana');
        const botao = await within(cartao()).findByRole('button', { name: /Importar os sócios da empresa/ }) as HTMLButtonElement;
        await vi.waitFor(() => expect(botao.disabled).toBe(false));
        await user.click(botao);
        expect(await screen.findByText(/já estão na lista/i)).toBeTruthy();
    });

    it('falha ao ler a empresa: o botão diz o erro, não "não tem empresa"', async () => {
        emp.getById.mockRejectedValue(new Error('rede caiu'));
        tela({ estrutura: vinculado });
        const botao = await within(cartao()).findByRole('button', { name: /Importar os sócios da empresa/ });
        await vi.waitFor(() => expect(botao.getAttribute('title')).toMatch(/rede caiu/));
    });

    it('estudo sem vínculo: não oferece importar', async () => {
        tela();
        await within(cartao()).findByText('Ana');
        expect(within(cartao()).queryByRole('button', { name: /Importar os sócios da empresa/ })).toBeNull();
    });

    it('quem só lê vê a lista e não cria nem importa', async () => {
        emp.getById.mockResolvedValue({ id: 'emp-1', company_id: 'cia-1' });
        cia.get.mockResolvedValue({ id: 'cia-1', razao_social: 'Residencial SPE Ltda' });
        cia.listPartners.mockResolvedValue([{ id: 'p1', nome: 'Ana', participacao_pct: 70 }]);
        tela({ estrutura: vinculado }, true);
        expect(await within(cartao()).findByText('Ana')).toBeTruthy();
        const novo = within(cartao()).getByRole('button', { name: /Novo sócio/ }) as HTMLButtonElement;
        expect(novo.disabled).toBe(true);
        expect(novo.getAttribute('title')).toBe('Sem permissão');
        const importar = await within(cartao()).findByRole('button', { name: /Importar os sócios da empresa/ }) as HTMLButtonElement;
        expect(importar.disabled).toBe(true);
        expect(svc.importarSociosDaEmpresa).not.toHaveBeenCalled();
        expect(svc.salvarSocio).not.toHaveBeenCalled();
    });
});
