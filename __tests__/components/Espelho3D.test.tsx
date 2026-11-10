// @vitest-environment jsdom
/**
 * ESPELHO DE VENDAS 3D (09/11/2026) — a casca: a legenda que destaca, a ficha da unidade e a lista por andar, que
 * faz pelo teclado tudo o que o toque no desenho faz. O desenho (three) fica de fora: aqui ele é um botão que
 * "toca" uma unidade. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { montarCenaDoEspelho, type TorreDoEspelho } from '../../utils/espelhoDeVendas3d';
import type { DadosDaUnidade } from '../../components/espelho3d/FichaDaUnidade';

const webgl = vi.hoisted(() => ({ disponivel: true, cenaQuebra: false }));
vi.mock('../../components/espelho3d/webglDisponivel', () => ({ webglDisponivel: () => webgl.disponivel, reduzMovimento: () => true }));
vi.mock('../../components/espelho3d/Espelho3DCena', () => ({
    default: (p: { destaque: string | null; selecionada: string | null; onSelecionar: (id: string | null) => void }) => {
        if (webgl.cenaQuebra) throw new Error('contexto WebGL perdido');
        return (
            <button type="button" data-testid="cena" data-destaque={p.destaque ?? ''} data-selecionada={p.selecionada ?? ''} onClick={() => p.onSelecionar('A-1-2')}>
                desenho
            </button>
        );
    },
}));

import Espelho3D from '../../components/espelho3d/Espelho3D';

const andar = (n: number, status: string[]) =>
    status.map((s, k) => ({ id: `A-${n}-${k + 1}`, name: `${n}0${k + 1}`, floor: n, floor_tipo: null, private_area: 80, status: s as never, sort_order: k }));

/** Torre A: térreo e 2 andares, 2 unidades por andar. 3 disponíveis, 1 reservada, 2 vendidas. */
const TORRE: TorreDoEspelho = {
    id: 'A',
    name: 'Torre A',
    sort_order: 0,
    units: [...andar(0, ['DISPONIVEL', 'DISPONIVEL']), ...andar(1, ['VENDIDO', 'RESERVADO']), ...andar(2, ['DISPONIVEL', 'VENDIDO'])],
};
const cena = montarCenaDoEspelho({ torres: [TORRE] });
const dados = new Map<string, DadosDaUnidade>([['A-1-2', { tipologia: '2 quartos', areaPrivativaM2: 142.55, dormitorios: 2, banheiros: 2, vagas: 1, preco: 950_000 }]]);

const montar = (over: Partial<React.ComponentProps<typeof Espelho3D>> = {}) => render(<Espelho3D cena={cena} dados={dados} {...over} />);

beforeEach(() => {
    webgl.disponivel = true;
    webgl.cenaQuebra = false;
});

describe('Espelho3D — legenda e destaque', () => {
    it('a legenda traz a contagem de cada status e é o controle de destacar', async () => {
        montar();
        const grupo = screen.getByRole('radiogroup', { name: 'Destacar unidades por status' });
        expect(within(grupo).getByRole('radio', { name: /Disponíveis 3/ })).toBeTruthy();
        expect(within(grupo).getByRole('radio', { name: /Em negociação 1/ })).toBeTruthy();
        expect(within(grupo).getByRole('radio', { name: /Vendidas 2/ })).toBeTruthy();

        fireEvent.click(within(grupo).getByRole('radio', { name: /Vendidas 2/ }));
        expect(within(grupo).getByRole('radio', { name: /Vendidas 2/ }).getAttribute('aria-checked')).toBe('true');
        expect((await screen.findByTestId('cena')).getAttribute('data-destaque')).toBe('sold');
        // Clicar de novo volta a mostrar todas.
        fireEvent.click(within(grupo).getByRole('radio', { name: /Vendidas 2/ }));
        expect(screen.getByTestId('cena').getAttribute('data-destaque')).toBe('');
    });

    it('status sem unidade fica desligado, com o motivo; "Outros status" nem aparece', () => {
        montar();
        const permutadas = screen.getByRole('radio', { name: /Permutadas 0/ }) as HTMLButtonElement;
        expect(permutadas.disabled).toBe(true);
        expect(permutadas.title).toBe('Nenhuma unidade permutada');
        expect(screen.queryByRole('radio', { name: /Outros status/ })).toBeNull();
    });

    it('o desenho tem nome acessível com os números', () => {
        montar();
        expect(screen.getByRole('img', { name: 'Torres em 3D. 6 unidades: 3 disponíveis, 1 em negociação, 2 vendidas.' })).toBeTruthy();
    });
});

describe('Espelho3D — ficha', () => {
    it('tocar numa unidade do desenho abre a ficha com os dados dela', async () => {
        const onSelecionar = vi.fn();
        montar({ mostrarPreco: true, onSelecionar });
        fireEvent.click(await screen.findByTestId('cena'));
        const ficha = screen.getByRole('region', { name: 'Ficha da unidade 102' });
        expect(within(ficha).getByText('Torre A · Pavimento 1')).toBeTruthy();
        expect(within(ficha).getByText('Em negociação')).toBeTruthy();
        expect(within(ficha).getByText('142,55 m²')).toBeTruthy();
        expect(within(ficha).getByText('2 quartos')).toBeTruthy();
        expect(within(ficha).getByText(/R\$\s?950\.000/)).toBeTruthy();
        expect(onSelecionar).toHaveBeenCalledWith('A-1-2');
        expect(screen.getByTestId('cena').getAttribute('data-selecionada')).toBe('A-1-2');
    });

    it('sem `mostrarPreco` a ficha não fala em preço', async () => {
        montar();
        fireEvent.click(await screen.findByTestId('cena'));
        expect(screen.queryByText('Preço de tabela')).toBeNull();
    });

    it('as ações da ficha são as de quem chama, para a unidade tocada', async () => {
        const acao = vi.fn();
        montar({ acoesDaFicha: (p) => <button type="button" onClick={() => acao(p.unitId)}>Fazer proposta</button> });
        fireEvent.click(await screen.findByTestId('cena'));
        fireEvent.click(screen.getByRole('button', { name: 'Fazer proposta' }));
        expect(acao).toHaveBeenCalledWith('A-1-2');
    });

    // F5 (10/11/2026): a planta baixa da tipologia da unidade.
    it('unidade com planta: a ficha mostra a planta da tipologia, e tocar amplia num diálogo (não em tela cheia)', async () => {
        const comPlanta = new Map<string, DadosDaUnidade>([['A-1-2', { tipologia: 'Tipo 3', plantaUrl: 'https://x/tipo3.png' }]]);
        montar({ dados: comPlanta });
        fireEvent.click(await screen.findByTestId('cena'));
        const ficha = screen.getByRole('region', { name: 'Ficha da unidade 102' });
        expect(within(ficha).getByText('Planta da tipologia Tipo 3')).toBeTruthy();
        expect(within(ficha).getByAltText('Planta da tipologia Tipo 3').getAttribute('src')).toBe('https://x/tipo3.png');
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(within(ficha).getByRole('button', { name: 'Ampliar a planta da tipologia tipo 3' }));
        const dialogo = screen.getByRole('dialog');
        expect(within(dialogo).getByAltText('Planta da tipologia Tipo 3')).toBeTruthy();
        expect(within(dialogo).getByText('Unidade 102 · Torre A')).toBeTruthy();
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Fechar a planta' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('unidade sem planta: a ficha não tem o trecho da planta', async () => {
        montar();
        fireEvent.click(await screen.findByTestId('cena'));
        expect(screen.queryByTestId('ficha-planta')).toBeNull();
    });

    it('fechar a ficha tira a seleção', async () => {
        montar();
        fireEvent.click(await screen.findByTestId('cena'));
        fireEvent.click(screen.getByRole('button', { name: 'Fechar a ficha' }));
        expect(screen.queryByRole('region', { name: /Ficha da unidade/ })).toBeNull();
        expect(screen.getByTestId('cena').getAttribute('data-selecionada')).toBe('');
    });
});

describe('Espelho3D — lista por andar', () => {
    const abrirLista = () => fireEvent.click(screen.getByRole('button', { name: /Unidades por andar 6/ }));

    it('com 3D a lista começa fechada; aberta, cada unidade é um botão com a frase inteira', () => {
        montar();
        expect(screen.getByRole('button', { name: /Unidades por andar 6/ }).getAttribute('aria-expanded')).toBe('false');
        abrirLista();
        expect(screen.getByRole('button', { name: 'Unidade 102, Torre A, Pavimento 1, Em negociação' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Unidade 001, Torre A, Térreo, Disponível' })).toBeTruthy();
    });

    it('Tab entra uma vez (só uma unidade com tabindex 0) e as setas andam pela unidade e pelo andar', () => {
        montar();
        abrirLista();
        const lista = screen.getByRole('group', { name: 'Torre A, 6 unidades' });
        const unidades = within(lista).getAllByRole('button');
        // O andar mais alto em cima: 201, 202, 101, 102, 001, 002.
        expect(unidades.map((b) => b.textContent)).toEqual(['201', '202', '101', '102', '001', '002']);
        expect(unidades.filter((b) => b.tabIndex === 0)).toHaveLength(1);
        unidades[0].focus();
        fireEvent.keyDown(unidades[0], { key: 'ArrowRight' });
        expect(document.activeElement).toBe(unidades[1]);
        fireEvent.keyDown(unidades[1], { key: 'ArrowDown' });
        expect(document.activeElement).toBe(unidades[3]);
        fireEvent.keyDown(unidades[3], { key: 'Home' });
        expect(document.activeElement).toBe(unidades[2]);
    });

    it('escolher na lista abre a mesma ficha do toque, e o destaque esmaece o que não casa', () => {
        montar();
        abrirLista();
        fireEvent.click(screen.getByRole('button', { name: 'Unidade 102, Torre A, Pavimento 1, Em negociação' }));
        expect(screen.getByRole('region', { name: 'Ficha da unidade 102' })).toBeTruthy();
        fireEvent.click(screen.getByRole('radio', { name: /Vendidas 2/ }));
        expect(screen.getByRole('button', { name: 'Unidade 102, Torre A, Pavimento 1, Em negociação' }).className).toContain('opacity-25');
        expect(screen.getByRole('button', { name: 'Unidade 101, Torre A, Pavimento 1, Vendida' }).className).not.toContain('opacity-25');
    });
});

describe('Espelho3D — sem 3D', () => {
    it('sem WebGL: nenhum desenho, o aviso diz por quê e a lista já vem aberta', () => {
        webgl.disponivel = false;
        montar();
        expect(screen.queryByTestId('cena')).toBeNull();
        expect(screen.getByRole('status').textContent).toMatch(/Este navegador não desenha 3D\..*lista por andar/);
        expect(screen.getByRole('button', { name: 'Unidade 102, Torre A, Pavimento 1, Em negociação' })).toBeTruthy();
    });

    it('o desenho quebra depois de montado: a lista assume, sem tela em branco', async () => {
        webgl.cenaQuebra = true;
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        montar();
        expect((await screen.findByRole('status')).textContent).toMatch(/não pôde ser aberto neste aparelho/);
        expect(screen.getByRole('button', { name: 'Unidade 201, Torre A, Pavimento 2, Disponível' })).toBeTruthy();
        erro.mockRestore();
    });

    it('cena sem unidade nenhuma: a frase, não um card vazio', () => {
        render(<Espelho3D cena={montarCenaDoEspelho({ torres: [{ ...TORRE, units: [] }] })} />);
        expect(screen.getByText(/Nenhuma unidade para mostrar no espelho\./)).toBeTruthy();
    });
});
