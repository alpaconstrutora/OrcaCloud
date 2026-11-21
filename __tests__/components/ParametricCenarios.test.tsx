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
import { criarCenario } from '../../utils/cenariosParametricos';

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
        // Na volta o CUB DEMORA (100 ms), como numa máquina de CI lenta: o teste tem de esperar o
        // carregamento, não correr contra ele.
        consultas.liberar = () => {};
        setTimeout(() => consultas.liberar?.(), 100);
        render(<Tela inicial={gravados[0]} onGravar={vi.fn()} />);
        // Esperar o CUB carregar, não só o botão existir: "Inteligência de Mercado" só aparece
        // depois do carregamento. Sem isto o clique corria contra a consulta e falhava em
        // máquina lenta (CI #5057, 21/11/2026).
        const salvarDeNovo = await botaoSalvar();
        await waitFor(() => expect((salvarDeNovo as HTMLButtonElement).disabled).toBe(false));
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

const COMPOSICAO = { taxes: 8.5, profit: 12, risk: 2, insurance: 1, admin: 5, guarantee: 0, finance: 0 };
const UM_CENARIO = criarCenario({
    totalValue: 1_500_000, costPerM2: 1_500, bdi: 30, bdiComposition: { ...COMPOSICAO, profit: 20 }, kFactor: 1.2,
    sensitivity: { materials: 5, labor: 0 }, durationMonths: 24, area: 1000, standard: 'R8-N',
}, [], new Date('2026-11-17T10:00:00Z'));

const esperarCarregar = async () => {
    const salvar = await botaoSalvar();
    await waitFor(() => expect((salvar as HTMLButtonElement).disabled).toBe(false));
    return salvar;
};
const fatorK = (c: HTMLElement) => c.querySelector('input[type="range"]') as HTMLInputElement;
const lucro = (c: HTMLElement) => c.querySelectorAll('input[type="number"]')[0] as HTMLInputElement;

describe('Paramétrico › simulação guardada no orçamento', () => {
    it('só abrir a tela não grava nada no projeto', async () => {
        const onGravar = vi.fn();
        render(<Tela inicial={SETTINGS} onGravar={onGravar} />);
        await esperarCarregar();
        expect(onGravar).not.toHaveBeenCalled();
    });

    it('BDI e fator K mexidos ficam no orçamento, sem tocar no BDI do projeto, e voltam depois de sair da tela', async () => {
        const gravados: Record<string, unknown>[] = [];
        const primeira = render(<Tela inicial={SETTINGS} onGravar={s => gravados.push(s)} />);
        await esperarCarregar();
        fireEvent.change(fatorK(primeira.container), { target: { value: '1.2' } });
        fireEvent.change(lucro(primeira.container), { target: { value: '20' } });

        const ultimo = gravados[gravados.length - 1];
        expect(ultimo.parametricSimulation).toMatchObject({ kFactor: 1.2, bdiComposition: { profit: 20 } });
        // O BDI e o K do projeto (Configurações) não mudam: a simulação é um campo à parte.
        expect(ultimo.kFactor).toBe(1);
        expect(ultimo.bdiComposition).toBeUndefined();
        // Mexer na simulação não recarrega o CUB.
        expect(consultas.total).toBe(1);

        primeira.unmount();
        const segunda = render(<Tela inicial={ultimo} onGravar={vi.fn()} />);
        await esperarCarregar();
        expect(fatorK(segunda.container).value).toBe('1.2');
        expect(lucro(segunda.container).value).toBe('20');
    });

    it('aplicar um cenário também fica guardado no orçamento', async () => {
        const gravados: Record<string, unknown>[] = [];
        render(<Tela inicial={{ ...SETTINGS, parametricScenarios: [UM_CENARIO] }} onGravar={s => gravados.push(s)} />);
        await esperarCarregar();
        abrirAbaCenarios();
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar os parâmetros deste cenário' }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aplicar' }));

        await waitFor(() => expect(gravados.length).toBeGreaterThan(0));
        expect(gravados[gravados.length - 1].parametricSimulation).toEqual({
            bdiComposition: { ...COMPOSICAO, profit: 20 },
            kFactor: 1.2,
            sensitivity: { materials: 5, labor: 0 },
            durationMonths: 24,
        });
    });

    it('"Voltar aos valores do projeto" pergunta e tira a simulação gravada', async () => {
        const gravados: Record<string, unknown>[] = [];
        const simulada = { ...SETTINGS, parametricSimulation: { bdiComposition: COMPOSICAO, kFactor: 1.3, sensitivity: { materials: 0, labor: 0 }, durationMonths: 18 } };
        const { container } = render(<Tela inicial={simulada} onGravar={s => gravados.push(s)} />);
        await esperarCarregar();
        expect(fatorK(container).value).toBe('1.3');

        fireEvent.click(screen.getByRole('button', { name: 'Voltar aos valores do projeto' }));
        const dialogo = await screen.findByRole('dialog');
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Voltar' }));

        await waitFor(() => expect(fatorK(container).value).toBe('1'));
        expect(gravados[gravados.length - 1].parametricSimulation).toBeUndefined();
        expect(screen.queryByRole('button', { name: 'Voltar aos valores do projeto' })).toBeNull();
    });

    it('sem simulação gravada não aparece "Voltar aos valores do projeto"', async () => {
        render(<Tela inicial={SETTINGS} onGravar={vi.fn()} />);
        await esperarCarregar();
        expect(screen.queryByRole('button', { name: 'Voltar aos valores do projeto' })).toBeNull();
    });
});

describe('Paramétrico › renomear cenário', () => {
    it('o lápis abre o nome para edição; Enter grava, Esc desiste', async () => {
        const gravados: Record<string, unknown>[] = [];
        render(<Tela inicial={{ ...SETTINGS, parametricScenarios: [UM_CENARIO] }} onGravar={s => gravados.push(s)} />);
        await esperarCarregar();
        abrirAbaCenarios();

        fireEvent.click(screen.getByRole('button', { name: 'Renomear cenário' }));
        const campo = screen.getByRole('textbox', { name: 'Nome do cenário' }) as HTMLInputElement;
        expect(campo.value).toBe('Cenário 1 (R8-N)');
        fireEvent.change(campo, { target: { value: 'Otimista' } });
        fireEvent.keyDown(campo, { key: 'Enter' });

        expect((gravados[gravados.length - 1].parametricScenarios as Array<{ name: string }>)[0].name).toBe('Otimista');
        expect(screen.getByText('Otimista')).toBeTruthy();

        const antes = gravados.length;
        fireEvent.click(screen.getByRole('button', { name: 'Renomear cenário' }));
        const deNovo = screen.getByRole('textbox', { name: 'Nome do cenário' });
        fireEvent.change(deNovo, { target: { value: 'Outro nome' } });
        fireEvent.keyDown(deNovo, { key: 'Escape' });
        expect(gravados.length).toBe(antes);
        expect(screen.getByText('Otimista')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
        expect(within(await screen.findByRole('dialog')).getByText('Excluir o cenário "Otimista"?')).toBeTruthy();
    });
});
