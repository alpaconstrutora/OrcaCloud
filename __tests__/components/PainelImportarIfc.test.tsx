// @vitest-environment jsdom
/**
 * A tela de importação de IFC — o passo "onde o modelo cai".
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
 *
 * Esta tela existe inteira para impedir erro SILENCIOSO: peça entrando um andar
 * fora, peça sumindo sem aviso, e — desde 06/09/2026 — modelo caindo longe do
 * desenho sem que ninguém tenha sido avisado. Uma tela assim não pode ser
 * verificada só pelo compilador.
 *
 * O parser de IFC é trocado por dublê: o que se verifica aqui é a TELA (o que
 * ela mostra e o que ela manda para o kernel), não a leitura do arquivo — essa
 * já está provada contra o modelo real em `ifcParaKernel`.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../../utils/blueprintKernel';

vi.mock('../../hooks/useOrgContext', () => ({ useOrgContext: () => ({ orgId: 'org_1' }) }));
vi.mock('../../services/digitalFileService', () => ({
  listarArquivos: vi.fn(async () => []),
  baixarArquivo: vi.fn(),
}));
vi.mock('../../services/ifcViewerService', () => ({
  obterApi: vi.fn(async () => ({ OpenModel: () => 7, CloseModel: () => undefined })),
}));
vi.mock('../../services/ifcParametricoService', () => ({
  lerPecasParametricas: vi.fn(async () => ({
    pecas: [],
    // Um pavimento só, na cota 0, para o casamento sugerir o térreo.
    pavimentos: [{ expressID: 100, nome: 'Térreo', elevacao: 0 }],
    recusas: [],
  })),
}));
// Duas peças nos extremos MEDIDOS do arquivo real (Igreja Divino): a pegada
// resultante é de 19,78 × 19,18 m, nascendo quase na origem do IFC.
vi.mock('../../utils/ifcParaKernel', async (real) => {
  const mod = await real<typeof import('../../utils/ifcParaKernel')>();
  return {
    ...mod,
    traduzirPecas: vi.fn(() => ({
      pecas: [
        {
          expressID: 1, globalId: 'a', nome: 'P1', kind: 'PILAR',
          pontos: [point(150, 750)], larguraMm: 200, profundidadeMm: 400,
          alturaMm: 3000, cotaBaseMm: 0, circular: false, rotacaoDeg: 0, pavimento: 100,
        },
        {
          expressID: 2, globalId: 'b', nome: 'P2', kind: 'PILAR',
          pontos: [point(19930, 19930)], larguraMm: 200, profundidadeMm: 400,
          alturaMm: 3000, cotaBaseMm: 0, circular: false, rotacaoDeg: 0, pavimento: 100,
        },
      ],
      recusas: [],
    })),
  };
});

import PainelImportarIfc from '../../components/blueprint/PainelImportarIfc';

/** Desenho existente: uma parede a 50 m da origem, longe do IFC de propósito. */
function comParede(): { model: BlueprintModel; levelId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800,
  });
  const levelId = base.model.levels[0].id;
  const r = applyCommand(base.model, {
    type: 'AddWall', levelId, a: point(50000, 50000), b: point(56000, 50000),
    thicknessMm: 150, heightMm: 2800,
  });
  return { model: r.model, levelId };
}

/** Monta a tela e chega ao passo de conferência, com o arquivo já lido. */
async function abrirComArquivo(onImportar = vi.fn()) {
  const { model, levelId } = comParede();
  const { container } = render(
    <PainelImportarIfc model={model} levelIdAtivo={levelId} onImportar={onImportar} />,
  );
  const input = container.querySelector('#importar-ifc-arquivo') as HTMLInputElement;
  const arquivo = new File(['x'], 'estrutural.ifc', { type: 'application/octet-stream' });
  // jsdom não implementa File.arrayBuffer.
  Object.defineProperty(arquivo, 'arrayBuffer', { value: async () => new ArrayBuffer(8) });
  fireEvent.change(input, { target: { files: [arquivo] } });
  await waitFor(() => expect(screen.getByText(/Posição/)).toBeTruthy());
  return { onImportar };
}

describe('PainelImportarIfc · onde o modelo cai', () => {
  beforeEach(() => vi.clearAllMocks());

  it('DIZ a pegada e a distância até o desenho, antes de confirmar', async () => {
    await abrirComArquivo();
    // 19,78 × 19,18 m — e o centro do IFC (10,04 · 10,34) contra o da parede
    // (53,00 · 50,00) dá hipotenusa de 42,96 e 39,66 = 58,47 m. Era exatamente
    // uma distância assim que o usuário via sem nenhum aviso na tela.
    expect(screen.getByText(/19,78 × 19,18 m/)).toBeTruthy();
    expect(screen.getByText(/58,47/)).toBeTruthy();
  });

  it('o padrão NÃO desloca: as coordenadas do arquivo são preservadas', async () => {
    const { onImportar } = await abrirComArquivo();
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0];
    expect(comandos).toHaveLength(2);
    expect(comandos[0].pontos[0]).toEqual({ x: 150, y: 750 });
    expect(comandos[1].pontos[0]).toEqual({ x: 19930, y: 19930 });
  });

  it('"Centralizar no desenho" move as peças, e move TODAS pelo mesmo vetor', async () => {
    const { onImportar } = await abrirComArquivo();
    fireEvent.change(screen.getByLabelText('Onde ancorar o modelo importado'), {
      target: { value: 'DESENHO' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0];
    const dx = comandos[0].pontos[0].x - 150;
    const dy = comandos[0].pontos[0].y - 750;
    expect(comandos[1].pontos[0].x - 19930).toBeCloseTo(dx, 6);
    expect(comandos[1].pontos[0].y - 19930).toBeCloseTo(dy, 6);
    // O centro das peças passa a ser o centro da parede.
    const cx = (comandos[0].pontos[0].x + comandos[1].pontos[0].x) / 2;
    const cy = (comandos[0].pontos[0].y + comandos[1].pontos[0].y) / 2;
    expect(cx).toBeCloseTo(53000, 6);
    expect(cy).toBeCloseTo(50000, 6);
  });

  it('"Encostar na origem" leva o canto da pegada para (0,0)', async () => {
    const { onImportar } = await abrirComArquivo();
    fireEvent.change(screen.getByLabelText('Onde ancorar o modelo importado'), {
      target: { value: 'ORIGEM' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0];
    expect(comandos[0].pontos[0]).toEqual({ x: 0, y: 0 });
  });
});
