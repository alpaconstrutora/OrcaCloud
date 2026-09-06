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
/**
 * O cenário é MUTÁVEL para que um caso possa trocar os pavimentos sem remontar
 * os dublês. `elevacaoMm` vem preenchido de propósito: é o serviço que converte,
 * medindo o fator na matriz — a tela não converte nada, e foi converter na tela
 * que causou o defeito de 06/09/2026.
 */
const cenario: {
  pavimentos: { expressID: number; nome: string; elevacao: number; elevacaoMm: number | null }[];
  pecas: PecaTraduzidaFalsa[];
} = {
  pavimentos: [{ expressID: 100, nome: 'Térreo', elevacao: 0, elevacaoMm: 0 }],
  pecas: [],
};

vi.mock('../../services/ifcParametricoService', () => ({
  lerPecasParametricas: vi.fn(async () => ({
    pecas: [],
    pavimentos: cenario.pavimentos,
    recusas: [],
    fatorParaMm: 10,
  })),
}));
// Duas peças nos extremos MEDIDOS do arquivo real (Igreja Divino): a pegada
// resultante é de 19,78 × 19,18 m, nascendo quase na origem do IFC.
type PecaTraduzidaFalsa = ReturnType<typeof pilar>;

/** Um pilar no ponto dado, pertencente ao pavimento dado. */
function pilar(x: number, y: number, pavimento: number, nome: string) {
  return {
    expressID: x, globalId: nome, nome, kind: 'PILAR' as const,
    pontos: [point(x, y)], larguraMm: 200, profundidadeMm: 400,
    alturaMm: 3000, cotaBaseMm: 0, circular: false, rotacaoDeg: 0, pavimento,
  };
}

vi.mock('../../utils/ifcParaKernel', async (real) => {
  const mod = await real<typeof import('../../utils/ifcParaKernel')>();
  return {
    ...mod,
    traduzirPecas: vi.fn(() => ({ pecas: cenario.pecas, recusas: [] })),
  };
});

import PainelImportarIfc from '../../components/blueprint/PainelImportarIfc';

// Duas peças nos extremos MEDIDOS do arquivo real (Igreja Divino): a pegada
// resultante é de 19,78 × 19,18 m, nascendo quase na origem do IFC.
const NOS_EXTREMOS = [pilar(150, 750, 100, 'P1'), pilar(19930, 19930, 100, 'P2')];

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

/** Térreo em 0 e Superior em 7,80 m — as cotas reais do modelo. */
function comDoisNiveis(): { model: BlueprintModel; levelId: string } {
  const a = applyCommand(emptyModel(), {
    type: 'AddLevel', name: 'Térreo', elevationMm: 3400, defaultHeightMm: 2800,
  });
  const b = applyCommand(a.model, {
    type: 'AddLevel', name: 'Superior', elevationMm: 7800, defaultHeightMm: 2800,
  });
  return { model: b.model, levelId: b.model.levels[0].id };
}

/** Dispara a leitura do arquivo e espera a tela de conferência. */
async function lerArquivo(container: HTMLElement) {
  const input = container.querySelector('#importar-ifc-arquivo') as HTMLInputElement;
  const arquivo = new File(['x'], 'estrutural.ifc', { type: 'application/octet-stream' });
  Object.defineProperty(arquivo, 'arrayBuffer', { value: async () => new ArrayBuffer(8) });
  fireEvent.change(input, { target: { files: [arquivo] } });
  await waitFor(() => expect(screen.getByText(/Pavimentos/)).toBeTruthy());
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
  beforeEach(() => {
    vi.clearAllMocks();
    cenario.pavimentos = [{ expressID: 100, nome: 'Térreo', elevacao: 0, elevacaoMm: 0 }];
    cenario.pecas = NOS_EXTREMOS;
  });

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

  it('sugere o pavimento pela COTA EM MM, e mostra a cota na tela', async () => {
    // Os dois primeiros pavimentos do modelo real: Térreo a 3,40 m e Superior
    // a 7,80 m (o arquivo está em centímetro; o serviço já converteu).
    cenario.pavimentos = [
      { expressID: 100, nome: 'Térreo', elevacao: 340, elevacaoMm: 3400 },
      { expressID: 200, nome: 'Superior', elevacao: 780, elevacaoMm: 7800 },
    ];
    cenario.pecas = [pilar(1000, 1000, 100, 'P1'), pilar(2000, 2000, 200, 'P2')];

    const { model, levelId } = comDoisNiveis();
    const { container } = render(
      <PainelImportarIfc model={model} levelIdAtivo={levelId} onImportar={vi.fn()} />,
    );
    await lerArquivo(container);

    // A cota aparece: sem ela, um par errado não teria como ser percebido.
    // `getAllByText` porque o mesmo "3,40 m" aparece também na opção do nível
    // do desenho — e as duas coincidirem é justamente o acerto que se quer.
    expect(screen.getAllByText(/3,40 m/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/7,80 m/).length).toBeGreaterThan(0);

    // E cada pavimento do IFC aponta para o do desenho na MESMA cota.
    const selects = screen.getAllByLabelText(/Para qual pavimento do desenho vai/);
    expect((selects[0] as HTMLSelectElement).value).toBe(model.levels[0].id);
    expect((selects[1] as HTMLSelectElement).value).toBe(model.levels[1].id);
  });

  it('com o fator ANTIGO (1) os dois pavimentos cairiam no mesmo andar', async () => {
    // É o defeito reproduzido: 340 e 780 lidos como MILÍMETROS. O primeiro fica
    // a 34 cm do térreo (dentro da tolerância de meio metro) e o segundo, a
    // 78 cm de tudo, cai no pavimento ATIVO. Nenhum aponta para o Superior.
    cenario.pavimentos = [
      { expressID: 100, nome: 'Térreo', elevacao: 340, elevacaoMm: 340 },
      { expressID: 200, nome: 'Superior', elevacao: 780, elevacaoMm: 780 },
    ];
    cenario.pecas = [pilar(1000, 1000, 100, 'P1'), pilar(2000, 2000, 200, 'P2')];

    const { model, levelId } = comDoisNiveis();
    const { container } = render(
      <PainelImportarIfc model={model} levelIdAtivo={levelId} onImportar={vi.fn()} />,
    );
    await lerArquivo(container);

    const selects = screen.getAllByLabelText(/Para qual pavimento do desenho vai/);
    expect((selects[0] as HTMLSelectElement).value).toBe(model.levels[0].id);
    expect((selects[1] as HTMLSelectElement).value).toBe(model.levels[0].id);
    expect((selects[1] as HTMLSelectElement).value).not.toBe(model.levels[1].id);
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
