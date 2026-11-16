/**
 * Realce que DESLIZA até a aba ativa (Portal do Investidor, 16/11/2026 — "/impeccable animate").
 * Trocar de aba move um único realce, em vez de apagar um e acender outro: o olho segue de onde
 * saiu para onde foi.
 *
 * Uso: o contêiner (posicionado, `relative`) recebe `ref`; a aba ativa leva `data-ativo="true"`;
 * o realce é um elemento `absolute` com `style={estilo}`. A transição (`portal-indicador`, em
 * index.css) só liga depois da primeira medida — senão o realce viria deslizando do canto ao abrir
 * a tela — e some com `prefers-reduced-motion` (o realce pula, sem movimento).
 */
import React from 'react';

export interface PosicaoDoRealce { x: number; y: number; largura: number; altura: number }

export function useRealceDaAbaAtiva<T extends HTMLElement>(ativa: string | null | undefined) {
    const ref = React.useRef<T>(null);
    const [pos, setPos] = React.useState<PosicaoDoRealce | null>(null);
    const [pronto, setPronto] = React.useState(false);

    React.useLayoutEffect(() => {
        const caixa = ref.current;
        if (!caixa) return;
        const medir = () => {
            const el = caixa.querySelector<HTMLElement>('[data-ativo="true"]');
            setPos(el ? { x: el.offsetLeft, y: el.offsetTop, largura: el.offsetWidth, altura: el.offsetHeight } : null);
        };
        medir();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(medir);
        ro.observe(caixa);
        return () => ro.disconnect();
    }, [ativa]);

    // Liga a transição no quadro seguinte à primeira posição: abrir a tela não desliza.
    React.useEffect(() => {
        if (!pos || pronto) return;
        const id = requestAnimationFrame(() => setPronto(true));
        return () => cancelAnimationFrame(id);
    }, [pos, pronto]);

    return { ref, pos, transicao: pronto ? 'portal-indicador' : '' };
}
