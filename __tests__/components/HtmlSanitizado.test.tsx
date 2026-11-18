// @vitest-environment jsdom
/**
 * Trava do invólucro de HTML de fora — achado F70 (varredura de 15/11/2026).
 *
 * `sanitizeHtml` mantém `style` e `class` (os modelos precisam), e isso bastava
 * para um membro de papel baixo plantar uma camada de tela inteira com link
 * sobre a tela de um admin. A defesa é o invólucro: `contain: paint` (o
 * invólucro vira o bloco de contenção do `position:fixed` e nada é pintado fora
 * dele) + `overflow: auto` (conteúdo largo rola dentro do quadro).
 *
 * O jsdom não faz layout, então aqui se prova o CONTRATO — o payload continua
 * intacto (a sanitização não foi mexida) e está dentro de um invólucro com as
 * duas declarações, que quem chama não consegue desligar. Que o navegador de
 * fato confina a camada foi medido no Chromium (evidência no PR).
 *
 * Que toda tela use este invólucro é trava do `scripts/check-xss-sinks.sh` (CI).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    HtmlSanitizado,
    ESTILO_HTML_CONTIDO,
    preencherComHtmlSanitizado,
} from '../../components/ui/HtmlSanitizado';

const CAMADA_POR_STYLE =
    '<a href="x" style="position:fixed;inset:0;z-index:9999">Sua sessão expirou</a>';
const CAMADA_POR_CLASSE =
    '<div class="fixed inset-0 z-[9999]"><a href="x">Sua sessão expirou</a></div>';

/** O invólucro é o elemento que o componente devolve. */
const involucroDe = (html: string, props: Record<string, unknown> = {}) => {
    const { container } = render(<HtmlSanitizado html={html} {...props} />);
    return container.firstElementChild as HTMLElement;
};

const expectContido = (el: HTMLElement) => {
    expect(el.style.getPropertyValue('contain')).toBe('paint');
    expect(el.style.getPropertyValue('overflow')).toBe('auto');
};

describe('HtmlSanitizado · contém a camada de tela inteira (F70)', () => {
    it('style inline position:fixed;inset:0 fica dentro de um invólucro com contain: paint e overflow auto', () => {
        const involucro = involucroDe(CAMADA_POR_STYLE);
        expectContido(involucro);

        const link = involucro.querySelector('a')!;
        expect(link).not.toBeNull();
        expect(involucro.contains(link)).toBe(true);
        // A sanitização NÃO foi alterada: o style do autor continua lá — quem
        // neutraliza é o invólucro, não a remoção do CSS.
        expect(link.getAttribute('style')).toContain('position:fixed');
    });

    it('classes do Tailwind fixed inset-0 z-[9999] ficam dentro do mesmo invólucro', () => {
        const involucro = involucroDe(CAMADA_POR_CLASSE);
        expectContido(involucro);

        const camada = involucro.querySelector('div')!;
        expect(camada.className).toBe('fixed inset-0 z-[9999]');
        expect(involucro.contains(camada)).toBe(true);
    });

    it('o style de quem chama não desliga a contenção', () => {
        const involucro = involucroDe(CAMADA_POR_STYLE, {
            style: { contain: 'none', overflow: 'visible', color: 'rgb(1, 2, 3)' },
        });
        expectContido(involucro);
        // o resto do style do chamador passa
        expect(involucro.style.color).toBe('rgb(1, 2, 3)');
    });

    it('className e demais atributos passam para o invólucro', () => {
        const involucro = involucroDe('<p>oi</p>', { className: 'prose prose-sm', 'data-teste': 'x' });
        expect(involucro.className).toBe('prose prose-sm');
        expect(involucro.getAttribute('data-teste')).toBe('x');
        expect(involucro.textContent).toBe('oi');
    });

    it('a constante exportada é exatamente contain: paint + overflow: auto', () => {
        expect(ESTILO_HTML_CONTIDO).toEqual({ contain: 'paint', overflow: 'auto' });
    });
});

describe('HtmlSanitizado · continua sanitizando', () => {
    it('remove <script> e onerror — recebe o HTML cru', () => {
        const involucro = involucroDe('<p>texto</p><script>window.__xss=1</script><img src=x onerror="window.__xss=2">');
        expect(involucro.querySelector('script')).toBeNull();
        expect(involucro.querySelector('img[onerror]')).toBeNull();
        expect(involucro.textContent).toContain('texto');
    });

    it('html nulo vira invólucro vazio, ainda contido', () => {
        const involucro = involucroDe(null as unknown as string);
        expect(involucro.innerHTML).toBe('');
        expectContido(involucro);
    });
});

describe('preencherComHtmlSanitizado · versão imperativa (PDF do contrato)', () => {
    it('contém e sanitiza sem apagar o cssText que o chamador já definiu', () => {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;padding:40px';

        preencherComHtmlSanitizado(el, `${CAMADA_POR_STYLE}${CAMADA_POR_CLASSE}<img src=x onerror="alert(1)">`);

        expectContido(el);
        // o posicionamento fora da tela do chamador continua
        expect(el.style.position).toBe('fixed');
        expect(el.style.left).toBe('-9999px');
        expect(el.style.width).toBe('794px');
        // conteúdo sanitizado, camadas dentro
        expect(el.querySelector('img[onerror]')).toBeNull();
        expect(el.querySelector('a[style*="position:fixed"]')).not.toBeNull();
        expect(el.querySelector('div.fixed.inset-0')).not.toBeNull();
    });
});
