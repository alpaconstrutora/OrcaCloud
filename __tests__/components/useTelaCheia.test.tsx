// @vitest-environment jsdom
/**
 * `hooks/useTelaCheia.ts` — o modo tela cheia extraído da Planta Inteligente
 * para Engenharia › Planejamento (19/09/2026).
 *
 * O que interessa provar: (1) o botão liga/desliga o estado interno mesmo
 * sem `requestFullscreen` (jsdom não tem — é o caso "iframe/permissão");
 * (2) ligar pede Fullscreen ao navegador e desligar sai dele; (3) sair pelo
 * NAVEGADOR (Esc/F11 → `fullscreenchange` sem `fullscreenElement`) desliga o
 * estado interno — senão o shell voltaria a aparecer atrás de um editor que
 * ainda se acha em tela cheia.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTelaCheia } from '../../hooks/useTelaCheia';

afterEach(() => {
  vi.restoreAllMocks();
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
  delete (document as { exitFullscreen?: unknown }).exitFullscreen;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
});

describe('useTelaCheia', () => {
  it('sem requestFullscreen (jsdom) o modo interno liga e desliga sozinho', () => {
    const { result } = renderHook(() => useTelaCheia());
    expect(result.current.telaCheia).toBe(false);

    act(() => result.current.alternarTelaCheia());
    expect(result.current.telaCheia).toBe(true);

    act(() => result.current.alternarTelaCheia());
    expect(result.current.telaCheia).toBe(false);
  });

  it('ligar pede Fullscreen ao navegador; desligar sai dele quando está dentro', () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const exitFullscreen = vi.fn(() => Promise.resolve());
    (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen = requestFullscreen;
    (document as { exitFullscreen?: unknown }).exitFullscreen = exitFullscreen;

    const { result } = renderHook(() => useTelaCheia());
    act(() => result.current.alternarTelaCheia());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(exitFullscreen).not.toHaveBeenCalled();

    // O navegador entrou de verdade.
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
    act(() => result.current.alternarTelaCheia());
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.telaCheia).toBe(false);
  });

  it('sair pelo navegador (Esc → fullscreenchange sem fullscreenElement) desliga o modo', () => {
    const { result } = renderHook(() => useTelaCheia());
    act(() => result.current.alternarTelaCheia());
    expect(result.current.telaCheia).toBe(true);

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.telaCheia).toBe(false);
  });

  it('um fullscreenchange que AINDA está em tela cheia não desliga nada', () => {
    const { result } = renderHook(() => useTelaCheia());
    act(() => result.current.alternarTelaCheia());

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.telaCheia).toBe(true);
  });
});
