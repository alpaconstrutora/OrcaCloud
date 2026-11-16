// @vitest-environment jsdom
/**
 * Pedido de 16/11/2026 ("o painel Cronograma e vendas despadronizado dos demais? verifique tamanho
 * das fonts; dá para compactar, está exageradamente grande"): o SVG tinha viewBox fixo de 760×150 e
 * width 100% — num cartão de ~1550 px tudo dobrava (fonte de 11 px virava ~22 px). Na tela ele passa
 * a desenhar em pixels reais (mede a largura), com as fontes dos outros gráficos (12 px nas
 * categorias, 11 px nos rótulos) e altura compacta. No PDF (`dimensao` fixa) não muda.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LinhaDoTempoDosMarcos } from '../../components/ImovibGraficos';
import type { MarcoDoEstudo } from '../../utils/imovibCronograma';

const marcos = [
    { id: 'aquisicao_terreno', rotulo: 'Aquisição do terreno', mes: 1 },
    { id: 'lancamento', rotulo: 'Lançamento', mes: 1 },
    { id: 'inicio_obra', rotulo: 'Início da obra', mes: 6 },
    { id: 'habite_se', rotulo: 'Habite-se', mes: 29 },
    { id: 'repasse', rotulo: 'Repasse', mes: 29 },
    { id: 'fim_das_vendas', rotulo: 'Fim das vendas', mes: 36 },
    { id: 'encerramento', rotulo: 'Encerramento', mes: 36 },
] as unknown as MarcoDoEstudo[];

const LARGURA = 1500;
const originalRect = HTMLElement.prototype.getBoundingClientRect;
beforeAll(() => {
    globalThis.ResizeObserver = class {
        private cb: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) { this.cb = cb; }
        observe() { this.cb([], this as never); }
        unobserve() {}
        disconnect() {}
    } as never;
    HTMLElement.prototype.getBoundingClientRect = function () { return { width: LARGURA, height: 0, top: 0, left: 0, right: LARGURA, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect; };
});
afterAll(() => { HTMLElement.prototype.getBoundingClientRect = originalRect; });

const tamanhos = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll('text')).map(t => Number(t.getAttribute('font-size')));

describe('linha do tempo dos marcos na tela', () => {
    it('desenha em pixels reais: viewBox na largura medida, sem esticar', () => {
        const { container } = render(<LinhaDoTempoDosMarcos marcos={marcos} />);
        const svg = container.querySelector('svg')!;
        const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
        expect(w).toBe(LARGURA);
        expect(svg.getAttribute('width')).toBe(String(LARGURA));
        expect(svg.getAttribute('height')).toBe(String(h));
        expect(h).toBeLessThanOrEqual(140); // compacta (antes: 150 de viewBox × escala ≈ 300 px)
    });

    it('fontes iguais às dos outros gráficos: 12 px nas categorias, 11 px nos rótulos', () => {
        const { container } = render(<LinhaDoTempoDosMarcos marcos={marcos} />);
        const svg = container.querySelector('svg')!;
        const obra = Array.from(svg.querySelectorAll('text')).find(t => t.textContent === 'Obra')!;
        expect(obra.getAttribute('font-size')).toBe('12');
        expect(Math.max(...tamanhos(svg))).toBe(12);
        expect(Math.min(...tamanhos(svg))).toBe(11);
    });

    it('cada marco e cada faixa continuam escritos', () => {
        const { container } = render(<LinhaDoTempoDosMarcos marcos={marcos} />);
        const texto = container.querySelector('svg')!.textContent!;
        for (const t of ['Obra', 'Vendas', 'mês 6–29', 'mês 1–36', 'Aquisição do terreno · 1', 'Repasse · 29', 'Encerramento · 36']) {
            expect(texto).toContain(t);
        }
    });
});

describe('linha do tempo no PDF (dimensao fixa)', () => {
    it('mantém o desenho de hoje', () => {
        const { container } = render(<LinhaDoTempoDosMarcos marcos={marcos} dimensao={{ largura: 760, altura: 150 }} />);
        const svg = container.querySelector('svg')!;
        expect(svg.getAttribute('viewBox')).toBe('0 0 760 150');
        expect(svg.getAttribute('width')).toBe('760');
        expect(tamanhos(svg)).toContain(10);
    });
});
