// @vitest-environment jsdom
/**
 * Orçamento paramétrico › cenários (pedido "Corrigir problemas com cenários", 17/11/2026).
 *
 * Até aqui os cenários viviam só no estado da tela: saíam ao trocar de tela ou recarregar.
 * "Restaurar" só trazia o fator K (o cenário nem guardava a composição do BDI), "Salvar
 * cenário" funcionava durante o carregamento (cenário de R$ 0,00 → "Infinity%"), excluir e
 * "Limpar tudo" apagavam sem perguntar, e a comparação dizia "Variação VGV" de um custo.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(async () => ({ data: [], error: null })) } }));

const ITENS = [{ id: 'i1', subPhase: '01.01.01 Fundação', sinapiItem: { price: 800_000, nature: 'Materiais' } }];
const consultas = vi.hoisted(() => ({ total: 0, liberar: null as null | (() => void) }));

vi.mock('../../services/parametricService', async (original) => {
    const real = (await original()) as { parametricService: Record<string, unknown> };
    return {
        parametricService: {
            ...real.parametricService,
            calculateTotalEstimatedValueAsync: vi.fn(async () => {
                consultas.total += 1;
                if (consultas.liberar === null) return 1_000_000;
                await new Promise<void>(resolve => { consultas.liberar = resolve; });
                return 1_000_000;
            }),
            generateParametricBudgetAsync: vi.fn(async () => ITENS),
            getHistoricalCubDataAsync: vi.fn(async () => []),
            getRegionalComparisonDataAsync: vi.fn(async () => []),
            getMixComparisonAsync: vi.fn(async () => null),
        },
    };
});

import ParametricEstimator from '../../components/ParametricEstimator';
import { ConfirmProvider } from '../../components/ui/confirm';

const SETTINGS = { id: 'p1', name: 'Obra', area: 1000, standard: 'R8-N', location: 'MS', bdi: 25, kFactor: 1 };

/** Faz o papel do App: onUpdateSettings troca as configurações do projeto (o autosave grava no banco). */
function Tela({ inicial, onGravar }: { inicial: Record<string, unknown>; onGravar: (s: Record<string, unknown>) => void }) {
    const [settings, setSettings] = React.useState(inicial);
    return (
        <ConfirmProvider>
            <ParametricEstimator
                settings={settings as never}
                onUpdateBudget={vi.fn()}
                onUpdateSettings={(s) => { onGravar(s as never); setSettings(s as never); }}
                onNavigate={vi.fn()}
            />
        </ConfirmProvider>
    );
}

const botaoSalvar = () => screen.findByRole('button', { name: /Salvar cenário/i });
const abrirAbaCenarios = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Inteligência de Mercado' }));
    fireEvent.click(screen.getByRole('button', { name: /^Cenários/ }));
};

beforeEach(() => {
    consultas.total = 0;
    consultas.liberar = null;
});

describe('Paramétrico › cenários', () => {
    it('salvar grava no projeto e o cenário continua lá depois de sair da tela e voltar', async () => {
        const gravados: Record<string, unknown>[] = [];
        const primeira = render(<Tela inicial={SETTINGS} onGravar={s => gravados.push(s)} />);
        const salvar = await botaoSalvar();
        await waitFor(() => expect((salvar as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(salvar);

        expect(gravados).toHaveLength(1);
        const cenarios = gravados[0].parametricScenarios as Array<Record<string, unknown>>;
        expect(cenarios).toHaveLength(1);
        expect(cenarios[0].name).toBe('Cenário 1 (R8-N)');
        expect(gravados[0].name).toBe('Obra'); // o resto das configurações não se perde
        // Salvar cenário não pode recarregar o CUB (a tela piscaria o "Consultando dados…").
        expect(consultas.total).toBe(1);

        primeira.unmount();
        render(<Tela inicial={gravados[0]} onGravar={vi.fn()} />);
        await botaoSalvar();
        abrirAbaCenarios();
        expect(await screen.findByText('Cenário 1 (R8-N)')).toBeTruthy();
    });

    it('"Salvar cenário" fica desligado enquanto o CUB carrega, e diz por quê', async () => {
        consultas.liberar = () => {};
        render(<Tela inicial={SETTINGS} onGravar={vi.fn()} />);
        const salvar = (await botaoSalvar()) as HTMLButtonElement;
        expect(salvar.disabled).toBe(true);
        expect(salvar.closest('[title]')?.getAttribute('title')).toMatch(/carregando/i);
    });

    it('aplicar um cenário traz de volta BDI e fator K, não só o K', async () => {
        const { container } = render(<Tela inicial={SETTINGS} onGravar={vi.fn()} />);
        const salvar = await botaoSalvar();
        await waitFor(() => expect((salvar as HTMLButtonElement).disabled).toBe(false));

        const fatorK = container.querySelector('input[type="range"]') as HTMLInputElement;
        const lucro = container.querySelectorAll('input[type="number"]')[0] as HTMLInputElement;
        fireEvent.change(fatorK, { target: { value: '1.2' } });
        fireEvent.change(lucro, { target: { value: '20' } });
        fireEvent.click(salvar);

        fireEvent.change(fatorK, { target: { value: '1' } });
        fireEvent.change(lucro, { target: { value: '10' } });

        abrirAbaCenarios();
        fireEvent.click(await screen.findByRole('button', { name: /Restaurar|Aplicar os parâmetros/ }));
        const dialogo = await screen.findByRole('dialog');
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Aplicar' }));

        await waitFor(() => expect(fatorK.value).toBe('1.2'));
        expect((container.querySelectorAll('input[type="number"]')[0] as HTMLInputElement).value).toBe('20');
    });

    it('excluir pergunta antes; cancelar mantém o cenário', async () => {
        render(<Tela inicial={SETTINGS} onGravar={vi.fn()} />);
        const salvar = await botaoSalvar();
        await waitFor(() => expect((salvar as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(salvar);
        abrirAbaCenarios();

        fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
        const dialogo = await screen.findByRole('dialog');
        expect(within(dialogo).getByText(/Excluir o Cenário 1/)).toBeTruthy();
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByText('Cenário 1 (R8-N)')).toBeTruthy();
    });

    it('compara com a simulação atual em texto, sem "Variação VGV"', async () => {
        render(<Tela inicial={SETTINGS} onGravar={vi.fn()} />);
        const salvar = await botaoSalvar();
        await waitFor(() => expect((salvar as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(salvar);
        abrirAbaCenarios();
        expect(screen.queryByText('Variação VGV')).toBeNull();
        expect(screen.getByText('igual ao atual')).toBeTruthy();
    });
});
