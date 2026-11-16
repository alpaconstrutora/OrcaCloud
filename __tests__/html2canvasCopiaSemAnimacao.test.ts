// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { coresCompativeisNaCopia } from '../utils/html2canvasCores';

/**
 * O html2canvas 1.4 fotografa uma CÓPIA do documento num iframe, onde as animações recomeçam do
 * zero, e lê o estilo calculado ANTES de zerar a duração delas (`ElementContainer`). Com as
 * animações de entrada valendo (16/11/2026, `tw-animate-css`), um `animate-in fade-in` dentro da
 * área capturada sairia transparente no PDF. Na cópia, nenhuma animação roda: a foto é do estado
 * final. Todas as capturas do app passam por `coresCompativeisNaCopia` no `onclone`.
 */
describe('cópia do html2canvas sem animação', () => {
    beforeEach(() => {
        document.head.innerHTML = '';
        document.body.innerHTML = '<div id="raiz"><div class="animate-in fade-in duration-500">valor</div></div>';
    });

    it('a cópia ganha a regra que desliga toda animação', () => {
        coresCompativeisNaCopia(document.getElementById('raiz')!);
        const regra = document.head.querySelector('style[data-captura-sem-animacao]');
        expect(regra?.textContent).toMatch(/\*, \*::before, \*::after \{ animation: none !important; \}/);
    });

    it('chamar duas vezes não duplica a regra', () => {
        const raiz = document.getElementById('raiz')!;
        coresCompativeisNaCopia(raiz);
        coresCompativeisNaCopia(raiz);
        expect(document.head.querySelectorAll('style[data-captura-sem-animacao]')).toHaveLength(1);
    });
});
