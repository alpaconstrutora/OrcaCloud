// @vitest-environment jsdom
/**
 * "Sair" não pode virar eco entre abas (16/11/2026).
 *
 * O defeito: o ouvinte do aviso SIGNED_OUT (hooks/useTabRouter, montado em toda aba
 * pelo App) chamava `logout()`, e o `logout()` reenviava o aviso. Cada aba que ouvia
 * reenviava; a aba que enviou também ouvia o próprio aviso (o BroadcastChannel entrega
 * a todo OUTRO objeto de canal, inclusive o da mesma aba). Medido em produção com 2 e 3
 * abas: >1.000 avisos em 0,3 s, e cada reenvio reiniciava a navegação para "/" — com
 * 3 abas nenhuma terminou de carregar em 21 s ("fica tentando abrir alguma tela").
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useStore, sairPorAvisoDeOutraAba } from '../store/useStore';
import { useTabRouter } from '../hooks/useTabRouter';
import { broadcastSignOut } from '../lib/tabRouter';

const CANAL = 'orca_auth_sync';
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

let avisos = 0;
beforeAll(() => {
  // jsdom não traz BroadcastChannel; o do Node entrega entre objetos do mesmo processo,
  // como o navegador entre abas (e entre objetos da mesma aba).
  if (!('BroadcastChannel' in window)) {
    (window as unknown as Record<string, unknown>).BroadcastChannel = globalThis.BroadcastChannel;
  }
  const original = BroadcastChannel.prototype.postMessage;
  vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, m: unknown) {
    if ((m as { type?: string })?.type === 'SIGNED_OUT') avisos++;
    return original.call(this, m);
  });
});
afterEach(() => { avisos = 0; });

describe('Sair com o app aberto em mais de uma aba', () => {
  it('um clique em Sair gera UM aviso — nem a outra aba nem a própria reenviam', async () => {
    // Ouvinte ligado como o App liga (o caso abaixo trava a ligação no App.tsx).
    const montados = [
      renderHook(() => useTabRouter('central', () => {}, sairPorAvisoDeOutraAba)), // "outra aba"
      renderHook(() => useTabRouter('central', () => {}, sairPorAvisoDeOutraAba)), // esta aba
    ];
    useStore.getState().logout();
    await esperar(300);
    montados.forEach(m => m.unmount());
    expect(avisos).toBe(1);
  });

  it('o App liga o ouvinte a sairPorAvisoDeOutraAba, nunca ao logout que reenvia', () => {
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    const chamada = app.match(/useTabRouter\(([^)]*)\)/)?.[1] ?? '';
    expect(chamada).toContain('sairPorAvisoDeOutraAba');
    expect(chamada).not.toMatch(/\.logout\b/);
  });

  it('a aba ignora o próprio aviso e atende o de outra aba (com ou sem origem)', async () => {
    const aoSair = vi.fn();
    const m = renderHook(() => useTabRouter('central', () => {}, aoSair));

    broadcastSignOut(); // o aviso desta aba
    await esperar(50);
    expect(aoSair).not.toHaveBeenCalled();

    const outra = new BroadcastChannel(CANAL);
    outra.postMessage({ type: 'SIGNED_OUT', origem: 'outra-aba' });
    await esperar(50);
    expect(aoSair).toHaveBeenCalledTimes(1);

    outra.postMessage({ type: 'SIGNED_OUT' }); // aba ainda no build anterior, sem origem
    await esperar(50);
    expect(aoSair).toHaveBeenCalledTimes(2);

    outra.postMessage({ type: 'OUTRA_COISA', origem: 'outra-aba' });
    await esperar(50);
    expect(aoSair).toHaveBeenCalledTimes(2);

    outra.close();
    m.unmount();
  });

  it('quem responde ao aviso limpa a sessão e volta à entrada, como o Sair', async () => {
    useStore.setState({ session: { access_token: 'x' }, projectId: 'p1' });
    localStorage.setItem('orca_activeView', 'financeiro');
    localStorage.setItem('blueprint:modoDeCor', 'claro'); // preferência sobrevive
    sairPorAvisoDeOutraAba();
    await esperar(50);
    expect(avisos).toBe(0);
    expect(useStore.getState().session).toBeNull();
    expect(useStore.getState().projectId).toBeNull();
    expect(localStorage.getItem('orca_activeView')).toBeNull();
    expect(localStorage.getItem('blueprint:modoDeCor')).toBe('claro');
  });
});
