// @vitest-environment jsdom
/**
 * Aba Sensibilidade e Risco (Fase 3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): cenários, riscos,
 * teste de estresse, simulação e modo só leitura.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    listarCenarios: vi.fn(),
    criarCenariosPadrao: vi.fn(),
    salvarCenario: vi.fn(),
    excluirCenario: vi.fn(),
    listarRiscos: vi.fn(),
    salvarRisco: vi.fn(),
    excluirRisco: vi.fn(),
    updateStudy: vi.fn(),
}));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
// ResizeObserver não existe no jsdom; os gráficos só precisam montar.
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import ImovibSensitivityForm from '../../components/ImovibSensitivityForm';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { ConfirmProvider } from '../../components/ui/confirm';
import { baseStudy } from '../fixtures/imovibEstudos';

const estudo = () => ({ ...baseStudy(), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' });
const tela = (somenteLeitura = false) => render(
    <ConfirmProvider>
        <ImovibEdicaoProvider value={somenteLeitura ? { pode: false, motivo: 'Sem permissão' } : { pode: true, motivo: '' }}>
            <ImovibSensitivityForm study={estudo() as never} onDataChanged={vi.fn()} />
        </ImovibEdicaoProvider>
    </ConfirmProvider>,
);
const PADRAO = [
    { id: 'p', study_id: 'estudo-teste', name: 'Pessimista', kind: 'pessimista', choques: { preco: -10 }, sort_order: 0 },
    { id: 'o', study_id: 'estudo-teste', name: 'Otimista', kind: 'otimista', choques: { preco: 5 }, sort_order: 1 },
];

describe('Sensibilidade e Risco', () => {
    beforeEach(() => {
        for (const f of Object.values(svc)) f.mockReset();
        svc.listarCenarios.mockResolvedValue([]);
        svc.listarRiscos.mockResolvedValue([]);
        svc.criarCenariosPadrao.mockResolvedValue(undefined);
    });

    it('criar cenários padrão grava e a tabela ganha as colunas; com os dois criados, o botão diz por quê está desligado', async () => {
        const user = userEvent.setup();
        tela();
        const botao = await screen.findByRole('button', { name: 'Criar cenários padrão' });
        svc.listarCenarios.mockResolvedValue(PADRAO);
        await user.click(botao);
        expect(svc.criarCenariosPadrao).toHaveBeenCalledTimes(1);
        await screen.findByRole('button', { name: 'Pessimista' });
        expect(screen.getByRole('button', { name: 'Otimista' })).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Criar cenários padrão' })).toBeDisabled());
        expect(screen.getByRole('button', { name: 'Criar cenários padrão' })).toHaveAttribute('title', 'Os cenários Pessimista e Otimista já existem.');
    });

    it('teste de estresse: "Obra atrasa 6 meses" estende o prazo; "Restaurar base" volta', async () => {
        const user = userEvent.setup();
        tela();
        const card = screen.getByText('Teste de estresse').closest('div.bg-white') as HTMLElement;
        const prazo = () => within(card).getByText('Prazo').closest('tr')!;
        expect(within(prazo()).getAllByText('29 meses')).toHaveLength(2);
        await user.click(within(card).getByRole('button', { name: 'Obra atrasa 6 meses' }));
        expect(within(prazo()).getByText('35 meses')).toBeInTheDocument();
        await user.click(within(card).getByRole('button', { name: 'Restaurar base' }));
        expect(within(prazo()).getAllByText('29 meses')).toHaveLength(2);
    });

    it('simulação: o botão roda e mostra a chance de VPL negativo, sem gravar nada', async () => {
        const user = userEvent.setup();
        tela();
        const card = screen.getByText('Simulação de Monte Carlo').closest('div.bg-white') as HTMLElement;
        await user.clear(within(card).getByRole('spinbutton', { name: /Sorteios/ }));
        await user.type(within(card).getByRole('spinbutton', { name: /Sorteios/ }), '200');
        await user.click(within(card).getByRole('button', { name: 'Simular' }));
        await within(card).findByText('Chance de VPL negativo', {}, { timeout: 5000 });
        expect(svc.updateStudy).not.toHaveBeenCalled();
        expect(svc.salvarCenario).not.toHaveBeenCalled();
    });

    it('novo risco: grava pelo serviço e aparece na tabela', async () => {
        const user = userEvent.setup();
        svc.salvarRisco.mockImplementation(async (r: Record<string, unknown>) => ({ ...r, id: 'r1' }));
        tela();
        await user.click(screen.getByRole('button', { name: 'Novo risco' }));
        await user.type(screen.getByLabelText('Risco'), 'Passivo ambiental');
        await user.selectOptions(screen.getByLabelText('Impacto'), '5');
        await user.click(screen.getByRole('button', { name: 'Criar risco' }));
        expect(svc.salvarRisco).toHaveBeenCalledWith(expect.objectContaining({ study_id: 'estudo-teste', description: 'Passivo ambiental', impact: 5, probability: 3 }));
        expect(await screen.findByText('Passivo ambiental')).toBeInTheDocument();
        expect(screen.getByTitle('Probabilidade 3 × impacto 5')).toHaveTextContent('15');
    });

    it('só leitura: criar cenário, novo cenário e novo risco desligados com o motivo; a simulação continua', async () => {
        tela(true);
        for (const nome of ['Criar cenários padrão', 'Novo cenário', 'Novo risco']) {
            const b = await screen.findByRole('button', { name: new RegExp(nome) });
            expect(b, nome).toBeDisabled();
            expect(b, nome).toHaveAttribute('title', 'Sem permissão');
        }
        expect(screen.getByRole('button', { name: 'Simular' })).toBeEnabled();
        expect(svc.criarCenariosPadrao).not.toHaveBeenCalled();
    });
});
