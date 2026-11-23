// @vitest-environment jsdom
/**
 * Menu ⋮ (InlineDisclosureMenu) — 14/11/2026: nas últimas linhas da tabela do Orçamento
 * Analítico o painel abria para baixo e ficava cortado pela área de rolagem. Agora vai para o
 * <body> (position: fixed) e abre PARA CIMA quando não cabe embaixo; dentro de diálogo Radix
 * fica no lugar (portal para o body ali seria inclicável).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InlineDisclosureMenu } from '../../components/ui/inline-disclosure-menu';

const ITENS = [{ icon: null, label: 'Duplicar', onClick: vi.fn() }];

function botaoEm(top: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.getAttribute('aria-label') === 'Mais ações') {
            return { top, bottom: top + 32, left: 968, right: 1000, width: 32, height: 32, x: 968, y: top, toJSON: () => ({}) } as DOMRect;
        }
        return { top: 0, bottom: 768, left: 0, right: 1024, width: 1024, height: 768, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
}
const painel = () => screen.getByText('Mais opções').closest('div.w-52') as HTMLElement;

describe('InlineDisclosureMenu — onde o painel abre', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
    });
    afterEach(() => vi.restoreAllMocks());

    it('fora de diálogo vai para o <body> e abre embaixo quando cabe', () => {
        botaoEm(100);
        const { container } = render(<InlineDisclosureMenu menuItems={ITENS} />);
        fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
        const p = painel();
        expect(container.contains(p)).toBe(false);
        expect(p.className).toContain('fixed');
        // 23/11/2026: com z-[60] o painel nascia ATRÁS das telas-overlay (DealModal é
        // z-[110]) — "Modelos de documento" na negociação ficava sem Duplicar/Excluir.
        expect(p.className).toContain('z-[10000]');
        expect(p.style.top).toBe('140px'); // 100 + 32 + 8
        expect(p.style.right).toBe('24px'); // 1024 − 1000
    });

    it('na última linha (sem espaço embaixo) abre PARA CIMA', () => {
        botaoEm(700);
        render(<InlineDisclosureMenu menuItems={ITENS} />);
        fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
        expect(painel().style.top).toBe('492px'); // 700 − 8 − 200
        expect(painel().style.transformOrigin).toBe('bottom right');
    });

    it('dentro de diálogo fica no lugar e vira para cima com a classe', () => {
        botaoEm(700);
        const { container } = render(<div role="dialog"><InlineDisclosureMenu menuItems={ITENS} /></div>);
        fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
        const p = painel();
        expect(container.contains(p)).toBe(true);
        expect(p.className).toContain('bottom-10');
    });

    it('Esc fecha e devolve o foco ao botão', () => {
        botaoEm(100);
        render(<InlineDisclosureMenu menuItems={ITENS} />);
        const botao = screen.getByRole('button', { name: 'Mais ações' });
        fireEvent.click(botao);
        expect(botao.getAttribute('aria-expanded')).toBe('true');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(botao.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(botao);
    });

    it('clicar num item dentro do painel (no body) não conta como "clique fora"', () => {
        botaoEm(100);
        const onClick = vi.fn();
        render(<InlineDisclosureMenu menuItems={[{ icon: null, label: 'Duplicar', onClick }]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
        const item = screen.getByRole('button', { name: 'Duplicar' });
        fireEvent.mouseDown(item);
        fireEvent.click(item);
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
