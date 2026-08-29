/**
 * Câmera pan/zoom para um `<canvas>` — a mesma convenção do `BlueprintCanvas`,
 * extraída para ser reusada pelas VISTAS (elevações), que são só leitura.
 *
 * `escala` é px por mm; `dx`/`dy` a translação em px. O eixo Y do mundo cresce
 * para CIMA e a tela para BAIXO, então `paraTela` inverte o Y — igual ao
 * renderer da planta baixa. Não é `BlueprintCanvas` refatorado: aquele arquivo
 * tem 3.900 linhas de EDIÇÃO (snap, alças, ferramentas) que a elevação não usa.
 * Este hook nasce servindo só o `ElevationCanvas`.
 */

import { useCallback, useRef, useState } from 'react';

export interface Vista {
  /** px por mm. */
  escala: number;
  dx: number;
  dy: number;
}

/** Retângulo em coordenada de mundo (mm), eixos alinhados. Y cresce para cima. */
export interface BBoxMundo {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Ponto {
  x: number;
  y: number;
}

interface Opcoes {
  escalaMin?: number;
  escalaMax?: number;
  margemPx?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function useCanvasVista(opcoes: Opcoes = {}) {
  const escalaMin = opcoes.escalaMin ?? 0.002;
  const escalaMax = opcoes.escalaMax ?? 4;
  const margemPx = opcoes.margemPx ?? 48;

  const [vista, setVista] = useState<Vista>({ escala: 0.05, dx: 0, dy: 0 });
  const tamanhoRef = useRef({ w: 0, h: 0 });
  const arrastando = useRef(false);

  const paraTela = useCallback(
    (p: Ponto): Ponto => ({
      x: p.x * vista.escala + vista.dx,
      y: -p.y * vista.escala + vista.dy,
    }),
    [vista],
  );

  const paraMundo = useCallback(
    (px: number, py: number): Ponto => ({
      x: (px - vista.dx) / vista.escala,
      y: -(py - vista.dy) / vista.escala,
    }),
    [vista],
  );

  /** Ajusta a vista para o `bbox` caber na área, centralizado. */
  const enquadrar = useCallback(
    (bbox: BBoxMundo, tam?: { w: number; h: number }) => {
      const t = tam ?? tamanhoRef.current;
      if (!t.w || !t.h) return;
      const largura = Math.max(1, bbox.maxX - bbox.minX);
      const altura = Math.max(1, bbox.maxY - bbox.minY);
      const escala = clamp(
        Math.min((t.w - 2 * margemPx) / largura, (t.h - 2 * margemPx) / altura),
        escalaMin,
        escalaMax,
      );
      const cx = (bbox.minX + bbox.maxX) / 2;
      const cy = (bbox.minY + bbox.maxY) / 2;
      // Centro do mundo no centro da tela: resolve paraTela(centro) = (w/2, h/2).
      setVista({ escala, dx: t.w / 2 - cx * escala, dy: t.h / 2 + cy * escala });
    },
    [escalaMin, escalaMax, margemPx],
  );

  const registrarTamanho = useCallback((w: number, h: number) => {
    tamanhoRef.current = { w, h };
  }, []);

  const aoRolar = useCallback(
    (e: React.WheelEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const antes = paraMundo(px, py);
      const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const escala = clamp(vista.escala * fator, escalaMin, escalaMax);
      // Mantém o ponto sob o cursor fixo — zoom "para onde se olha". O sinal do
      // Y acompanha `paraTela`.
      setVista({ escala, dx: px - antes.x * escala, dy: py + antes.y * escala });
    },
    [vista, paraMundo, escalaMin, escalaMax],
  );

  const aoApontarBaixo = useCallback((e: React.PointerEvent<HTMLElement>) => {
    arrastando.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const aoApontarMover = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!arrastando.current) return;
    setVista((v) => ({ ...v, dx: v.dx + e.movementX, dy: v.dy + e.movementY }));
  }, []);

  const aoApontarCima = useCallback((e: React.PointerEvent<HTMLElement>) => {
    arrastando.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  return {
    vista,
    setVista,
    paraTela,
    paraMundo,
    enquadrar,
    registrarTamanho,
    tamanhoRef,
    aoRolar,
    aoApontarBaixo,
    aoApontarMover,
    aoApontarCima,
  };
}
