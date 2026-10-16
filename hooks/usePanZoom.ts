/**
 * Câmera pan/zoom para uma camada HTML/SVG posicionada com
 * `transform: translate(dx, dy) scale(escala)` (origem 0 0). Nasceu para o
 * canvas da Torre de Controle (fluxo P2P), 16/10/2026.
 *
 * Não é o `useCanvasVista`: aquele é px-por-mm com o eixo Y invertido, para
 * `<canvas>` de desenho técnico. Aqui o mundo é px de tela com Y para baixo —
 * o que uma camada de `div`s e um `<svg>` entendem sem conversão.
 *
 * A roda entra por `useRodaNaoPassiva` (listener nativo, `passive: false`):
 * o `onWheel` do React é passivo e o `preventDefault` dele é ignorado — a
 * página rolaria junto com o zoom (defeito medido em 09/09/2026 na Planta).
 */
import { useCallback, useRef, useState } from 'react';
import { useRodaNaoPassiva } from './useRodaNaoPassiva';
import { enquadrarDesenho } from '../utils/p2pLayout';

export interface Vista {
  escala: number;
  dx: number;
  dy: number;
}

interface Opcoes {
  min?: number;
  max?: number;
  /** Fator de cada passo de zoom (botão ou um "clique" da roda). */
  passo?: number;
  /** Deslocamento mínimo (px) para o arraste virar pan — abaixo disso é clique. */
  limiarArraste?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function usePanZoom<T extends HTMLElement = HTMLDivElement>(opcoes: Opcoes = {}) {
  // 0,35 é o que deixa o fluxo inteiro (7 colunas) caber num canvas de ~700px ao enquadrar.
  const min = opcoes.min ?? 0.35;
  const max = opcoes.max ?? 2;
  const passo = opcoes.passo ?? 1.2;
  const limiar = opcoes.limiarArraste ?? 4;

  const [vista, setVista] = useState<Vista>({ escala: 1, dx: 0, dy: 0 });
  const ref = useRef<T | null>(null);
  const arrasto = useRef<{ x0: number; y0: number; dx0: number; dy0: number; moveu: boolean } | null>(null);

  const tamanhoDaArea = useCallback(() => {
    const el = ref.current;
    if (!el) return { w: 0, h: 0 };
    return { w: el.clientWidth, h: el.clientHeight };
  }, []);

  /** Zoom por um fator, mantendo o ponto `ancora` (px da área) parado — sem âncora, o centro da área. */
  const zoomPor = useCallback((fator: number, ancora?: { x: number; y: number }) => {
    const area = tamanhoDaArea();
    setVista(v => {
      const escala = clamp(v.escala * fator, min, max);
      if (escala === v.escala) return v;
      const k = escala / v.escala;
      const a = ancora ?? { x: area.w / 2, y: area.h / 2 };
      return { escala, dx: a.x - (a.x - v.dx) * k, dy: a.y - (a.y - v.dy) * k };
    });
  }, [max, min, tamanhoDaArea]);

  const zoomIn = useCallback(() => zoomPor(passo), [passo, zoomPor]);
  const zoomOut = useCallback(() => zoomPor(1 / passo), [passo, zoomPor]);

  /**
   * Enquadra o desenho na área. Com `legivel`, não desce abaixo dessa escala
   * (vista inicial: legível, alinhada ao início). Sem área medida (jsdom,
   * primeiro frame) fica na vista neutra.
   */
  const enquadrar = useCallback((desenho: { w: number; h: number }, legivel?: number) => {
    setVista(enquadrarDesenho(desenho, tamanhoDaArea(), { min, max, legivel }));
  }, [max, min, tamanhoDaArea]);

  useRodaNaoPassiva(ref, (e: WheelEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    zoomPor(e.deltaY < 0 ? passo : 1 / passo, { x: e.clientX - r.left, y: e.clientY - r.top });
  });

  /**
   * Arraste no FUNDO = pan. Quem monta a camada marca nós e rótulos com
   * `data-no-pan`: um `pointerdown` neles não inicia arraste, então clicar num
   * cartão nunca vira pan e soltar um pan sobre um cartão nunca vira clique
   * (o `click` só dispara quando `down` e `up` caem no mesmo elemento).
   */
  const onPointerDown = useCallback((e: React.PointerEvent<T>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-pan]')) return;
    arrasto.current = { x0: e.clientX, y0: e.clientY, dx0: vista.dx, dy0: vista.dy, moveu: false };
    // Não existe no jsdom; no navegador prende o ponteiro para o arraste sobreviver a sair da área.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [vista.dx, vista.dy]);

  const onPointerMove = useCallback((e: React.PointerEvent<T>) => {
    const a = arrasto.current;
    if (!a) return;
    const ddx = e.clientX - a.x0;
    const ddy = e.clientY - a.y0;
    if (!a.moveu && Math.hypot(ddx, ddy) < limiar) return;
    a.moveu = true;
    setVista(v => ({ ...v, dx: a.dx0 + ddx, dy: a.dy0 + ddy }));
  }, [limiar]);

  const onPointerUp = useCallback((e: React.PointerEvent<T>) => {
    if (arrasto.current) (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    arrasto.current = null;
  }, []);

  /** Verdadeiro enquanto um arraste de fundo está em curso e já passou do limiar. */
  const arrastando = useCallback(() => !!arrasto.current?.moveu, []);

  return { vista, ref, zoomIn, zoomOut, zoomPor, enquadrar, onPointerDown, onPointerMove, onPointerUp, arrastando, min, max };
}
