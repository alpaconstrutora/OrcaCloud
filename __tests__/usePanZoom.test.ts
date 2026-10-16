// @vitest-environment jsdom
/**
 * Câmera do canvas da Torre de Controle (hooks/usePanZoom.ts) — C.1 de
 * docs/planos/2026-10-16-torre-p2p-processo-visual.md.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { usePanZoom } from '../hooks/usePanZoom';

describe('usePanZoom', () => {
  it('aproximar duas vezes e afastar duas vezes volta à escala inicial', () => {
    const { result } = renderHook(() => usePanZoom());
    expect(result.current.vista.escala).toBe(1);
    act(() => { result.current.zoomIn(); });
    act(() => { result.current.zoomIn(); });
    expect(result.current.vista.escala).toBeCloseTo(1.44);
    act(() => { result.current.zoomOut(); });
    act(() => { result.current.zoomOut(); });
    expect(result.current.vista.escala).toBeCloseTo(1);
  });

  it('respeita os limites: nunca passa do máximo nem fica abaixo do mínimo', () => {
    const { result } = renderHook(() => usePanZoom({ min: 0.5, max: 2 }));
    for (let i = 0; i < 10; i++) act(() => { result.current.zoomIn(); });
    expect(result.current.vista.escala).toBe(2);
    for (let i = 0; i < 20; i++) act(() => { result.current.zoomOut(); });
    expect(result.current.vista.escala).toBe(0.5);
  });

  it('enquadrar sem área medida (ref vazia, jsdom) fica na vista neutra', () => {
    const { result } = renderHook(() => usePanZoom());
    act(() => { result.current.zoomIn(); });
    act(() => { result.current.enquadrar({ w: 2000, h: 800 }); });
    expect(result.current.vista).toEqual({ escala: 1, dx: 0, dy: 0 });
  });
});
