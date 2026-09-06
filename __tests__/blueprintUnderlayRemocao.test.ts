/**
 * Apagar uma prancha de fundo tem de apagar os ARQUIVOS dela.
 *
 * ─── A DÍVIDA QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * Até 06/09/2026 `removerUnderlay` apagava só a linha do banco. A imagem e o
 * vetor ficavam no bucket para sempre: invisíveis na tela, ocupando espaço e
 * ainda alcançáveis por quem tivesse o caminho.
 *
 * ─── E O CASO QUE QUASE PASSOU DESPERCEBIDO ─────────────────────────────────
 *
 * O caminho é `<org>/<estudo>/<sha256>.png` — derivado do CONTEÚDO. Subir a
 * mesma imagem duas vezes no mesmo estudo dá o MESMO caminho, e o upload é
 * `upsert`: ficam duas linhas e um arquivo só. Apagar o arquivo junto com a
 * primeira linha quebraria a segunda, que continua na tela. É o defeito que a
 * correção ingênua teria introduzido.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

type Linha = { id: string; storage_path: string };
const estado: { linhas: Linha[]; removidos: string[][] } = { linhas: [], removidos: [] };

vi.mock('../lib/supabase', () => {
  const construtor = () => {
    let filtros: Record<string, string> = {};
    let acao: 'select' | 'delete' = 'select';
    const b: Record<string, unknown> = {};
    const casam = () =>
      estado.linhas.filter((l) =>
        Object.entries(filtros).every(([c, v]) => (l as unknown as Record<string, string>)[c] === v),
      );
    Object.assign(b, {
      select: () => b,
      delete: () => { acao = 'delete'; return b; },
      limit: () => b,
      eq: (c: string, v: string) => {
        filtros[c] = v;
        if (acao === 'delete') {
          const fora = new Set(casam().map((l) => l.id));
          estado.linhas = estado.linhas.filter((l) => !fora.has(l.id));
          return Promise.resolve({ error: null });
        }
        return b;
      },
      maybeSingle: () => Promise.resolve({ data: casam()[0] ?? null, error: null }),
      then: (r: (v: { data: Linha[]; error: null }) => unknown) =>
        r({ data: casam(), error: null }),
    });
    return b;
  };
  return {
    supabase: {
      from: () => construtor(),
      storage: {
        from: () => ({
          remove: (caminhos: string[]) => {
            estado.removidos.push(caminhos);
            return Promise.resolve({ error: null });
          },
        }),
      },
    },
  };
});

const CAMINHO = 'org_1/std_1/abc123.png';

beforeEach(() => {
  estado.linhas = [];
  estado.removidos = [];
});

describe('removerUnderlay', () => {
  it('apaga a linha E os dois arquivos — imagem e vetor', async () => {
    const { removerUnderlay, caminhoDoVetor } = await import(
      '../services/blueprintUnderlayService'
    );
    estado.linhas = [{ id: 'u1', storage_path: CAMINHO }];

    await removerUnderlay('u1');

    expect(estado.linhas).toHaveLength(0);
    expect(estado.removidos).toEqual([[CAMINHO, caminhoDoVetor(CAMINHO)]]);
  });

  it('NÃO apaga o arquivo quando outra prancha ainda o cita', async () => {
    // Mesma imagem adicionada duas vezes: mesmo sha256, mesmo caminho, duas
    // linhas. Apagar o arquivo aqui quebraria a prancha que ficou.
    const { removerUnderlay } = await import('../services/blueprintUnderlayService');
    estado.linhas = [
      { id: 'u1', storage_path: CAMINHO },
      { id: 'u2', storage_path: CAMINHO },
    ];

    await removerUnderlay('u1');

    expect(estado.linhas.map((l) => l.id)).toEqual(['u2']);
    expect(estado.removidos, 'o arquivo da prancha que ficou foi apagado').toEqual([]);
  });

  it('e ao apagar a ÚLTIMA que o cita, aí sim o arquivo vai', async () => {
    const { removerUnderlay, caminhoDoVetor } = await import(
      '../services/blueprintUnderlayService'
    );
    estado.linhas = [
      { id: 'u1', storage_path: CAMINHO },
      { id: 'u2', storage_path: CAMINHO },
    ];

    await removerUnderlay('u1');
    await removerUnderlay('u2');

    expect(estado.linhas).toHaveLength(0);
    expect(estado.removidos).toEqual([[CAMINHO, caminhoDoVetor(CAMINHO)]]);
  });

  it('linha inexistente não tenta apagar arquivo nenhum', async () => {
    const { removerUnderlay } = await import('../services/blueprintUnderlayService');
    await removerUnderlay('não-existe');
    expect(estado.removidos).toEqual([]);
  });
});
