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
 *
 * CANAIS PRIVADOS (15/11/2026, achado F58): o ramo tem dois canais `private` —
 * `blueprint:ramo:<id>` (presença e travas) e `blueprint:ramo:<id>:comandos`. O
 * dublê guarda um canal por tópico para o teste conferir o que vai em qual.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBlueprintColaboracao } from '../../hooks/useBlueprintColaboracao';

const send = vi.fn(async (_topico: string, _msg: unknown) => 'ok');
const track = vi.fn(async () => 'ok');

interface CanalFalso {
  topico: string;
  config: Record<string, unknown>;
  inscrito: ((status: string) => void) | null;
  ouvintes: { tipo: string; evento: string; cb: (x: { payload: unknown }) => void }[];
}
const canais: CanalFalso[] = [];

function criarCanal(topico: string, opcoes?: { config?: Record<string, unknown> }) {
  const reg: CanalFalso = { topico, config: opcoes?.config ?? {}, inscrito: null, ouvintes: [] };
  canais.push(reg);
  const canal = {
    on: (tipo: string, filtro: { event: string }, cb: (x: { payload: unknown }) => void) => {
      reg.ouvintes.push({ tipo, evento: filtro.event, cb });
      return canal;
    },
    subscribe: (cb: (s: string) => void) => {
      // Guarda o callback: quem manda conectar é o teste.
      reg.inscrito = cb;
      return canal;
    },
    send: (msg: unknown) => send(topico, msg),
    track: (...a: unknown[]) => track(...(a as [])),
    untrack: async () => 'ok',
    presenceState: () => ({}),
  };
  return canal;
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: (topico: string, opcoes?: { config?: Record<string, unknown> }) => criarCanal(topico, opcoes),
    removeChannel: async () => 'ok',
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'eu@alpa.com' } } }) },
  },
}));

const aoReceber = vi.fn(() => ({ ok: true, erro: null, divergiu: false }));
const opcoes = { habilitado: true, branchId: 'br1', userId: 'u1', nome: 'Eu', email: 'eu@alpa.com', aoReceber };
const RAMO = 'blueprint:ramo:br1';
const COMANDOS = 'blueprint:ramo:br1:comandos';

const canalDe = (topico: string) => canais.filter((c) => c.topico === topico).at(-1)!;
const prontos = () => expect(canais.filter((c) => c.inscrito).map((c) => c.topico).sort()).toEqual([RAMO, COMANDOS]);
const avisarTodos = (status: string) => {
  for (const c of canais) c.inscrito?.(status);
};

describe('useBlueprintColaboracao · o broadcast e o canal', () => {
  beforeEach(() => {
    send.mockClear();
    track.mockClear();
    aoReceber.mockClear();
    canais.length = 0;
  });

  it('antes de o canal ficar SUBSCRIBED, difundir e avisarTravas não mandam nada (era 401 no console)', async () => {
    const { result } = renderHook(() => useBlueprintColaboracao(opcoes));
    await waitFor(prontos);
    expect(result.current.conectado).toBe(false);

    act(() => {
      result.current.difundir([{ type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }], 'hash1');
      result.current.avisarTravas('travou');
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('depois de SUBSCRIBED, os dois mandam — cada um no seu canal — e voltam a calar se a conexão cair', async () => {
    const { result } = renderHook(() => useBlueprintColaboracao(opcoes));
    await waitFor(prontos);

    act(() => avisarTodos('SUBSCRIBED'));
    await waitFor(() => expect(result.current.conectado).toBe(true));

    act(() => {
      result.current.difundir([{ type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }], 'hash1');
      result.current.avisarTravas('travou');
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBe(COMANDOS);
    expect(send.mock.calls[0][1]).toMatchObject({ type: 'broadcast', event: 'comando' });
    expect(send.mock.calls[1][0]).toBe(RAMO);
    expect(send.mock.calls[1][1]).toMatchObject({ type: 'broadcast', event: 'travas' });

    // Queda de conexão: o canal continua lá, mas não está mais inscrito.
    send.mockClear();
    act(() => avisarTodos('CHANNEL_ERROR'));
    await waitFor(() => expect(result.current.conectado).toBe(false));
    act(() => result.current.difundir([{ type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }], 'hash2'));
    expect(send).not.toHaveBeenCalled();
  });

  it('lote vazio não vira broadcast nem com o canal conectado', async () => {
    const { result } = renderHook(() => useBlueprintColaboracao(opcoes));
    await waitFor(prontos);
    act(() => avisarTodos('SUBSCRIBED'));
    await waitFor(() => expect(result.current.conectado).toBe(true));
    act(() => result.current.difundir([], 'hash'));
    expect(send).not.toHaveBeenCalled();
  });

  it('os dois canais são PRIVADOS, e o comando só é ouvido no canal de comandos (no do ramo, o leitor escreve)', async () => {
    renderHook(() => useBlueprintColaboracao(opcoes));
    await waitFor(prontos);

    expect(canalDe(RAMO).config).toMatchObject({ private: true, presence: { key: 'u1' } });
    expect(canalDe(COMANDOS).config).toMatchObject({ private: true });
    expect(canalDe(RAMO).ouvintes.map((o) => o.evento).sort()).toEqual(['sync', 'travas']);
    expect(canalDe(COMANDOS).ouvintes.map((o) => o.evento)).toEqual(['comando']);

    const ouvinte = canalDe(COMANDOS).ouvintes[0];
    act(() => ouvinte.cb({ payload: { id: 'm1', autorId: 'u2', autorNome: 'Outra', comandos: [], hashDepois: 'h', enviadoEm: '' } }));
    expect(aoReceber).toHaveBeenCalledTimes(1);
    // O próprio eco não é reaplicado.
    act(() => ouvinte.cb({ payload: { id: 'm2', autorId: 'u1', autorNome: 'Eu', comandos: [], hashDepois: 'h', enviadoEm: '' } }));
    expect(aoReceber).toHaveBeenCalledTimes(1);
  });
});
