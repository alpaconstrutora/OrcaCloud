/**
 * Barra de rolagem que alarga quando o cursor SE APROXIMA dela (pedido de 11/10/2026:
 * *"Faça a barra de rolagem alargar um pouco quando o cursor do usuário se aproximar
 * dela"*; plano docs/planos/2026-10-11-barras-de-rolagem-e-altura-do-gantt.md).
 *
 * Só com CSS o Chrome alarga o polegar com o mouse EM CIMA dele (`::-webkit-scrollbar-
 * thumb:hover`) — 4px de alvo. Não há seletor para "perto da barra" nem para "sobre o
 * trilho". Aqui um único `pointermove` no documento (um por quadro) acha o contêiner
 * rolável sob o cursor e, se o cursor está a até `DISTANCIA_PX` da borda onde mora a
 * barra (direita = vertical, embaixo = horizontal), marca o contêiner com
 * `data-barra-proxima="v" | "h"`. O CSS (index.css) alarga e escurece o polegar nesse
 * estado. Mudar o atributo muda um estilo do próprio contêiner, que é o que faz o Chrome
 * repintar a barra (ver o comentário de `--barra-sob-o-mouse` no index.css).
 */

export const DISTANCIA_PX = 16;

export type EixoDaBarra = 'v' | 'h';

interface Caixa {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/**
 * Qual barra o cursor está perto (ou em cima), dado o retângulo do contêiner, se ele rola
 * em cada eixo e a espessura de cada barra. A distância conta a partir de onde a BARRA
 * começa (não da borda externa, que inclui a própria barra). `null` = nenhuma. Puro, para
 * testar sem DOM.
 */
export function barraProxima(
    caixa: Caixa,
    cursor: { x: number; y: number },
    rola: { vertical: boolean; horizontal: boolean },
    espessura: { vertical: number; horizontal: number } = { vertical: 0, horizontal: 0 },
    distancia = DISTANCIA_PX,
): EixoDaBarra | null {
    const dentro = cursor.x >= caixa.left && cursor.x <= caixa.right && cursor.y >= caixa.top && cursor.y <= caixa.bottom;
    if (!dentro) return null;
    if (rola.vertical && caixa.right - espessura.vertical - cursor.x <= distancia) return 'v';
    if (rola.horizontal && caixa.bottom - espessura.horizontal - cursor.y <= distancia) return 'h';
    return null;
}

const rolaNoEixo = (el: Element, eixo: 'y' | 'x') => {
    const h = el as HTMLElement;
    const sobra = eixo === 'y' ? h.scrollHeight > h.clientHeight + 1 : h.scrollWidth > h.clientWidth + 1;
    if (!sobra) return false;
    const o = getComputedStyle(h)[eixo === 'y' ? 'overflowY' : 'overflowX'];
    return o === 'auto' || o === 'scroll';
};

/** Liga o comportamento no documento. Devolve a função que desliga. */
export function ligarBarraDeRolagemProxima(doc: Document = document): () => void {
    let marcado: HTMLElement | null = null;
    let pendente: PointerEvent | null = null;
    let quadro = 0;

    const marcar = (el: HTMLElement | null, eixo: EixoDaBarra | null) => {
        if (marcado && (marcado !== el || !eixo)) {
            marcado.removeAttribute('data-barra-proxima');
            marcado = null;
        }
        if (el && eixo) {
            if (el.getAttribute('data-barra-proxima') !== eixo) el.setAttribute('data-barra-proxima', eixo);
            marcado = el;
        }
    };

    const processar = () => {
        quadro = 0;
        const e = pendente;
        pendente = null;
        if (!e || e.pointerType === 'touch') return;
        // O contêiner rolável mais interno sob o cursor que está com o cursor perto da
        // sua barra. Sobre a própria barra o alvo do evento é o contêiner — também conta.
        for (let n = e.target instanceof Element ? e.target : null; n && n !== doc.documentElement; n = n.parentElement) {
            const v = rolaNoEixo(n, 'y');
            const h = rolaNoEixo(n, 'x');
            if (!v && !h) continue;
            const el = n as HTMLElement;
            const espessura = {
                vertical: Math.max(0, el.offsetWidth - el.clientWidth - el.clientLeft * 2),
                horizontal: Math.max(0, el.offsetHeight - el.clientHeight - el.clientTop * 2),
            };
            const eixo = barraProxima(el.getBoundingClientRect(), { x: e.clientX, y: e.clientY }, { vertical: v, horizontal: h }, espessura);
            if (eixo) { marcar(n as HTMLElement, eixo); return; }
        }
        marcar(null, null);
    };

    const aoMover = (e: PointerEvent) => {
        pendente = e;
        if (!quadro) quadro = requestAnimationFrame(processar);
    };
    const aoSair = () => marcar(null, null);

    doc.addEventListener('pointermove', aoMover, { passive: true });
    doc.addEventListener('pointerleave', aoSair);
    return () => {
        doc.removeEventListener('pointermove', aoMover);
        doc.removeEventListener('pointerleave', aoSair);
        if (quadro) cancelAnimationFrame(quadro);
        marcar(null, null);
    };
}
