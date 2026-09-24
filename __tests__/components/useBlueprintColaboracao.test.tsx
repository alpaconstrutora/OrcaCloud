// @vitest-environment jsdom
/**
 * O BROADCAST SÓ SAI COM O CANAL INSCRITO (23/09/2026, P2.43).
 *
 * ⚠️ `channel.send()` num canal que ainda não está `SUBSCRIBED` NÃO falha: o
 * supabase-js cai sozinho para a API REST do Realtime, que pede autorização
 * própria e responde 401. No console do usuário isso apareceu como um par de
 * erros a cada peça inserida — "Realtime send() is automatically falling back
 * to REST API" seguido de "401" —, ao inserir um guarda-corpo.
 *
 * O teste segura o `subscribe` para poder chamar `difundir` ANTES da conexão,
 * que é exatamente a janela em que o defeito acontecia.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBlueprintColaboracao } from '../../hooks/useBlueprintColaboracao';

const send = vi.fn(async () => 'ok');
const track = vi.fn(async () => 'ok');
let avisarInscrito: ((status: string) => void) | null = null;

vi.mock('../../lib/supabase', () => {
  const canal = {
    on: () => canal,
    subscribe: (cb: (s: string) => void) => {
      // Guarda o callback: quem manda conectar é o teste.
      avisarInscrito = cb;
      return canal;
    },
    send: (...a: unknown[]) => send(...a),
    track: (...a: unknown[]) => track(...a),
    untrack: async () => 'ok',
    presenceState: () => ({}),
  };
  return {
    supabase: {
      channel: () => canal,
      removeChannel: async () => 'ok',
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'eu@alpa.com' } } }) },
    },
  };
});

const opcoes = { habilitado: true, branchId: 'br1', userId: 'u1', nome: 'Eu', email: 'eu@alpa.com' };

describe('useBlueprintColaboracao · o broadcast e o canal', () => {
  beforeEach(() => {
    send.mockClear();
    track.mockClear();
    avisarInscrito = null;
  });

  it('antes de o canal ficar SUBSCRIBED, difundir e avisarTravas não mandam nada (era 401 no console)', async () => {
    const { result } = renderHook(() => useBlueprintColaboracao(opcoes));
    await waitFor(() => expect(avisarInscrito).not.toBeNull());
    expect(result.current.conectado).toBe(false);

    act(() => {
      result.current.difundir([{ type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }], 'hash1');
      result.current.avisarTravas('travou');
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('depois de SUBSCRIBED, os dois mandam — e voltam a calar se a conexão cair', async () => {
    const { result } = renderHook(() => useBlueprintColaboracao(opcoes));
    await waitFor(() => expect(avisarInscrito).not.toBeNull());

    act(() => avisarInscrito!('SUBSCRIBED'));
    await waitFor(() => expect(result.current.conectado).toBe(true));

    act(() => {
      result.current.difundir([{ type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }], 'hash1');
      result.current.avisarTravas('travou');
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toMatchObject({ type: 'broadcast', event: 'comando' });
    expect(send.mock.calls[1][0]).toMatchObject({ type: 'broadcast', event: 'travas' });

    // Queda de conexão: o canal continua lá, mas não está mais inscrito.
    send.mockClear();
    act(() => avisarInscrito!('CHANNEL_ERROR'));
    await waitFor(() => expect(result.current.conectado).toBe(false));
    act(() => result.current.difundir([{ type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }], 'hash2'));
    expect(send).not.toHaveBeenCalled();
  });

  it('lote vazio não vira broadcast nem com o canal conectado', async () => {
    const { result } = renderHook(() => useBlueprintColaboracao(opcoes));
    await waitFor(() => expect(avisarInscrito).not.toBeNull());
    act(() => avisarInscrito!('SUBSCRIBED'));
    await waitFor(() => expect(result.current.conectado).toBe(true));
    act(() => result.current.difundir([], 'hash'));
    expect(send).not.toHaveBeenCalled();
  });
});
