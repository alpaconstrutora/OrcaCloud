// @vitest-environment jsdom
/**
 * A2 — o levantamento SOBREVIVE a recarregar, e a versão aponta para ele.
 *
 * O caso de aceite do plano: importar 500 pontos com código, "recarregar"
 * (desmontar e montar o hook de novo, lendo do serviço) e os 500 continuarem,
 * com nome e código; gerar uma versão e ela levar `levantamento_id`, com
 * `pontos_cotados` e hash SÓ sobre {x, y, cota}.
 *
 * O serviço é um banco em memória — o que se prova aqui é o caminho do hook
 * (marcar → gravar com respiro → ler ao montar → apontar na versão). A tabela
 * de verdade foi conferida de fora (colunas, grants e policy) na migration.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlueprintLevantamentoRow, BlueprintTopografiaRow } from '../../types/blueprint';

const banco: { lev: BlueprintLevantamentoRow | null; versoes: BlueprintTopografiaRow[]; saves: number } = { lev: null, versoes: [], saves: 0 };

vi.mock('../../services/blueprintLevantamentoService', () => ({
  blueprintLevantamentoService: {
    get: vi.fn(async () => (banco.lev ? structuredClone(banco.lev) : null)),
    save: vi.fn(async (studyId: string, organizationId: string, lev: Pick<BlueprintLevantamentoRow, 'pontos' | 'linhas_de_quebra' | 'hash_pontos' | 'origem'>) => {
      banco.saves++;
      banco.lev = {
        id: banco.lev?.id ?? 'lev-1',
        study_id: studyId,
        organization_id: organizationId,
        ...structuredClone(lev),
        created_at: '2026-09-26T00:00:00Z',
        updated_at: '2026-09-26T00:00:00Z',
      };
      return structuredClone(banco.lev);
    }),
  },
}));

vi.mock('../../services/blueprintTopografiaService', () => ({
  blueprintTopografiaService: {
    listar: vi.fn(async () => structuredClone(banco.versoes)),
    criar: vi.fn(async (input: Omit<BlueprintTopografiaRow, 'id' | 'created_by' | 'created_at'>) => {
      const row = { ...input, id: `v${banco.versoes.length + 1}`, created_by: null, created_at: '2026-09-26T00:00:00Z' } as BlueprintTopografiaRow;
      banco.versoes.unshift(row);
      return row;
    }),
    apagar: vi.fn(async () => {}),
  },
}));

const { useBlueprintTopografia } = await import('../../hooks/useBlueprintTopografia');

const ANEL = [
  { x: 0, y: 0 },
  { x: 25_000, y: 0 },
  { x: 25_000, y: 20_000 },
  { x: 0, y: 20_000 },
];
const CODIGOS = ['CE1', 'MU', 'PO', 'AR', 'MF2', ''];
const QUINHENTOS = Array.from({ length: 500 }, (_, i) => ({
  x: 500 + 1000 * (i % 25) - (i % 25 === 24 ? 1000 : 0),
  y: 500 + 1000 * Math.floor(i / 25) - (Math.floor(i / 25) === 19 ? 1000 : 0) + (i % 3) * 7,
  cotaM: 100 + (i % 25) * 0.1 + Math.floor(i / 25) * 0.05,
  nome: `P${i + 1}`,
  ...(CODIGOS[i % CODIGOS.length] ? { codigo: CODIGOS[i % CODIGOS.length] } : {}),
}));

function montar() {
  return renderHook(() => useBlueprintTopografia('s1', 'o1', 'Estudo', ANEL, null));
}

describe('useBlueprintTopografia · levantamento persistido (A2)', () => {
  beforeEach(() => {
    banco.lev = null;
    banco.versoes = [];
    banco.saves = 0;
  });

  it('500 pontos importados voltam depois de recarregar, com nome e código', async () => {
    const a = montar();
    await waitFor(() => expect(a.result.current.carregando).toBe(false));
    expect(a.result.current.levantamento?.estado).toBe('VAZIO');
    act(() => {
      a.result.current.definirPontosCotados(QUINHENTOS, { arquivo: 'campo.csv', formato: 'texto', sha256: 'f'.repeat(64), quantos: 500 }, 'SUBSTITUIR');
    });
    expect(a.result.current.levantamento?.estado).toBe('SALVANDO');
    await waitFor(() => expect(a.result.current.levantamento?.estado).toBe('SALVO'), { timeout: 3000 });
    expect(banco.lev?.pontos).toHaveLength(500);
    expect(banco.lev?.hash_pontos).toMatch(/^[0-9a-f]{64}$/);
    a.unmount();

    // "Recarregar": um hook novo, que só conhece o que está no serviço.
    const b = montar();
    await waitFor(() => expect(b.result.current.carregando).toBe(false));
    expect(b.result.current.pontosCotados).toHaveLength(500);
    expect(b.result.current.pontosCotados[0]).toMatchObject({ nome: 'P1', codigo: 'CE1' });
    expect(b.result.current.pontosCotados[2]).toMatchObject({ nome: 'P3', codigo: 'PO' });
    expect(b.result.current.origemDosPontos?.arquivo).toBe('campo.csv');
    expect(b.result.current.levantamento?.estado).toBe('SALVO');
    // As feições saem dos códigos: cerca e muro viram linhas; poste é pontual.
    expect(b.result.current.levantamento?.contagem.porFeicao.CERCA).toBeGreaterThan(0);
    expect(b.result.current.levantamento?.linhas.some((l) => l.feicao === 'CERCA')).toBe(true);
    expect(b.result.current.linhasDeQuebra).toEqual([]);
    b.unmount();
  });

  it('a versão gerada aponta o levantamento e guarda/hasheia só {x, y, cota}', async () => {
    const a = montar();
    await waitFor(() => expect(a.result.current.carregando).toBe(false));
    act(() => {
      a.result.current.definirPontosCotados(QUINHENTOS.slice(0, 60), null, 'SUBSTITUIR');
    });
    await act(async () => {
      await a.result.current.gerar();
    });
    expect(a.result.current.erro).toBeNull();
    const v = banco.versoes[0];
    expect(v).toBeTruthy();
    expect(v.levantamento_id).toBe('lev-1');
    expect(v.pontos_cotados).toHaveLength(60);
    expect(Object.keys(v.pontos_cotados[0]).sort()).toEqual(['cotaM', 'x', 'y']);

    // Mesmo conjunto SEM nomes/códigos → mesmo hash de entrada: o caderno de campo não entra no hash.
    act(() => {
      a.result.current.definirPontosCotados(QUINHENTOS.slice(0, 60).map(({ x, y, cotaM }) => ({ x, y, cotaM })), null, 'SUBSTITUIR');
    });
    await act(async () => {
      await a.result.current.gerar();
    });
    expect(banco.versoes[0].hash_entrada).toBe(banco.versoes[1].hash_entrada);
    a.unmount();
  });

  it('mexer num ponto marca para gravar; remover duplicados e acrescentar também', async () => {
    const a = montar();
    await waitFor(() => expect(a.result.current.carregando).toBe(false));
    act(() => {
      a.result.current.definirPontosCotados(
        [
          { x: 0, y: 0, cotaM: 1, nome: 'A' },
          { x: 3, y: 3, cotaM: 1, nome: 'B' },
          { x: 5000, y: 0, cotaM: 2, nome: 'C' },
        ],
        null,
        'SUBSTITUIR',
      );
    });
    expect(a.result.current.levantamento?.duplicados).toHaveLength(1);
    act(() => a.result.current.levantamento?.removerDuplicados());
    expect(a.result.current.pontosCotados.map((p) => p.nome)).toEqual(['A', 'C']);
    act(() => a.result.current.levantamento?.acrescentarPontos([{ x: 9000, y: 0, cotaM: 3, nome: 'D' }]));
    act(() => a.result.current.alterarPonto(0, { nome: 'A1' }));
    await waitFor(() => expect(a.result.current.levantamento?.estado).toBe('SALVO'), { timeout: 3000 });
    expect(banco.lev?.pontos.map((p) => p.nome)).toEqual(['A1', 'C', 'D']);
    a.unmount();
  });
});
