// @vitest-environment jsdom
/**
 * O painel de importação de DXF.
 *
 * ─── AS DUAS PERGUNTAS QUE ELE FAZ ──────────────────────────────────────────
 *
 * Qual camada é parede e em que unidade o arquivo está. Nenhuma das duas dá
 * para adivinhar: o projeto real da empresa tem `PAREDE`, mas também
 * `ARQ-LAYOUT` e `dc_paisagismo` cheias de traço; e ele DECLARA milímetro
 * estando em metro.
 *
 * ⚠️ A unidade é o caso mais perigoso. Errá-la dá uma casa de 13 centímetros
 * COM A FORMA PERFEITA — plausível na miniatura, e o erro só aparece quando
 * alguém cota alguma coisa.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import PainelImportarDxf from '../../components/blueprint/PainelImportarDxf';
import { applyCommand, emptyModel } from '../../utils/blueprintKernel';
import { gerarTemplateOpura, REGRAS_DO_PADRAO } from '../../utils/dxfPadraoOpura';

// E9.1: o DWG passa pela Edge Function; aqui ela é o mock — o que se testa é
// que o .dwg entra pelo MESMO pipeline do DXF e que a versão fica declarada.
const converterDwgParaDxf = vi.fn();
vi.mock('../../services/blueprintDwgService', () => ({
  converterDwgParaDxf: (...a: unknown[]) => converterDwgParaDxf(...a),
}));

/** Um DXF mínimo com uma parede de 150 mm: duas faces paralelas de 4 m. */
function dxfDeUmaParede(escala = 1): string {
  const e = (v: number) => String(v * escala);
  const pares: [string, string][] = [
    ['0', 'SECTION'],
    ['2', 'HEADER'],
    ['9', '$INSUNITS'],
    ['70', '4'],
    ['0', 'ENDSEC'],
    ['0', 'SECTION'],
    ['2', 'ENTITIES'],
    // Face de baixo e face de cima, a 150 mm uma da outra.
    ['0', 'LINE'],
    ['8', 'PAREDE'],
    ['10', e(0)],
    ['20', e(0)],
    ['11', e(4000)],
    ['21', e(0)],
    ['0', 'LINE'],
    ['8', 'PAREDE'],
    ['10', e(0)],
    ['20', e(150)],
    ['11', e(4000)],
    ['21', e(150)],
    // Um traço de cota, noutra camada, para a escolha ter o que escolher.
    ['0', 'LINE'],
    ['8', 'COTAS'],
    ['10', e(0)],
    ['20', e(-500)],
    ['11', e(4000)],
    ['21', e(-500)],
    ['0', 'ENDSEC'],
    ['0', 'EOF'],
  ];
  return pares.flatMap(([c, v]) => [c, v]).join('\n');
}

function comNivel() {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

async function abrirComArquivo(texto: string) {
  const onImportar = vi.fn();
  const { model, levelId } = comNivel();
  const { container } = render(
    <PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={onImportar} />,
  );
  const input = container.querySelector('#importar-dxf-arquivo') as HTMLInputElement;
  const arquivo = new File([texto], 'planta.dxf', { type: 'application/dxf' });
  // jsdom não implementa File.text().
  Object.defineProperty(arquivo, 'text', { value: async () => texto });
  fireEvent.change(input, { target: { files: [arquivo] } });
  await waitFor(() => expect(screen.getByText('planta.dxf')).toBeTruthy());
  return { onImportar };
}

describe('importar DXF · as escolhas', () => {
  it('oferece as camadas do arquivo, com a contagem de traços', async () => {
    await abrirComArquivo(dxfDeUmaParede());
    const select = screen.getByLabelText('Camada que contém as paredes') as HTMLSelectElement;
    const rotulos = [...select.options].map((o) => o.textContent);
    expect(rotulos.some((r) => r?.includes('PAREDE'))).toBe(true);
    expect(rotulos.some((r) => r?.includes('COTAS'))).toBe(true);
  });

  it('SUGERE a unidade medindo, e mostra quantas paredes cada uma daria', async () => {
    // Num arquivo desenhado em milímetro, a opção "milímetro" é a que produz
    // parede plausível — e é ela que a tela põe na frente.
    await abrirComArquivo(dxfDeUmaParede(1));
    const select = screen.getByLabelText(
      'Unidade em que o arquivo foi desenhado',
    ) as HTMLSelectElement;
    expect(select.options[0].textContent).toMatch(/milímetro/);
    expect(select.options[0].textContent).toMatch(/plausíve/);
  });

  it('a mesma planta desenhada em METRO é reconhecida como metro', async () => {
    // ⚠️ Escala 0,001: a mesma geometria, em metro. Se a tela acreditasse no
    // `$INSUNITS` (que continua dizendo milímetro), a casa entraria mil vezes
    // menor, com a forma perfeita.
    await abrirComArquivo(dxfDeUmaParede(0.001));
    const select = screen.getByLabelText(
      'Unidade em que o arquivo foi desenhado',
    ) as HTMLSelectElement;
    expect(select.options[0].textContent).toMatch(/metro/);
  });
});

describe('importar DXF · o que entra', () => {
  it('a parede entra com a espessura DERIVADA das faces', async () => {
    const { onImportar } = await abrirComArquivo(dxfDeUmaParede());
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0];
    expect(comandos).toHaveLength(1);
    expect(comandos[0].type).toBe('AddWall');
    expect(comandos[0].thicknessMm).toBe(150);
    // O DXF não sabe altura: ela vem do pé-direito do pavimento.
    expect(comandos[0].heightMm).toBe(2800);
  });

  it('pelo modo EIXO, cada traço vira uma parede com a espessura informada', async () => {
    // Duas faces viram DOIS eixos aqui, de propósito: no modo eixo o traço não
    // é interpretado, é lido. Quem escolhe a camada sabe o que ela contém.
    const { onImportar } = await abrirComArquivo(dxfDeUmaParede());
    fireEvent.click(screen.getByRole('button', { name: 'Camada de eixo' }));
    fireEvent.change(screen.getByLabelText('Espessura das paredes da camada de eixo'), {
      target: { value: '200' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0];
    expect(comandos).toHaveLength(2);
    expect(comandos.every((c: { thicknessMm: number }) => c.thicknessMm === 200)).toBe(true);
  });

  it('camada sem parede reconhecível NÃO deixa importar', async () => {
    // O botão desabilitado é a resposta certa: importar zero parede e dizer que
    // deu certo seria pior que dizer que não deu.
    await abrirComArquivo(dxfDeUmaParede());
    fireEvent.change(screen.getByLabelText('Camada que contém as paredes'), {
      target: { value: 'COTAS' },
    });
    expect(screen.getByText(/Nenhuma parede reconhecida/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Importar/ })).toHaveProperty('disabled', true);
  });
});

/**
 * ESQUADRIAS (P2.33): parede de 6 m (faces y=0/150) com porta de 900 em [2000, 2900] (arco de folha
 * com dobradiça em x=2000, na camada PORTAS) e janela de 1200 em [4000, 5200] (duas linhas em JANELAS).
 */
function dxfComEsquadrias(): string {
  const L = (x1: number, y1: number, x2: number, y2: number, camada = 'PAREDE'): [string, string][] => [['0', 'LINE'], ['8', camada], ['10', String(x1)], ['20', String(y1)], ['11', String(x2)], ['21', String(y2)]];
  const pares: [string, string][] = [
    ['0', 'SECTION'], ['2', 'HEADER'], ['9', '$INSUNITS'], ['70', '4'], ['0', 'ENDSEC'],
    ['0', 'SECTION'], ['2', 'ENTITIES'],
    ...L(0, 0, 2000, 0), ...L(0, 150, 2000, 150), ...L(2900, 0, 4000, 0), ...L(2900, 150, 4000, 150), ...L(5200, 0, 6000, 0), ...L(5200, 150, 6000, 150),
    ...L(2000, 0, 2000, 150), ...L(2900, 0, 2900, 150), ...L(4000, 0, 4000, 150), ...L(5200, 0, 5200, 150),
    ['0', 'ARC'], ['8', 'PORTAS'], ['10', '2000'], ['20', '0'], ['40', '900'], ['50', '0'], ['51', '90'],
    ...L(4000, 50, 5200, 50, 'JANELAS'), ...L(4000, 100, 5200, 100, 'JANELAS'),
    ['0', 'ENDSEC'], ['0', 'EOF'],
  ];
  return pares.flatMap(([c, v]) => [c, v]).join('\n');
}

describe('importar DXF · esquadrias (P2.33)', () => {
  beforeEach(() => localStorage.clear());

  it('conta porta e janela no resumo, e o lote leva AddWall com uid e AddOpening pelo wallUid com as hipóteses', async () => {
    const { onImportar } = await abrirComArquivo(dxfComEsquadrias());
    expect(screen.getByTestId('resumo-esquadrias').textContent).toBe('1 porta(s) · 1 janela(s) · 0 vão(s) livre(s)');
    expect(screen.getByRole('button', { name: /Importar/ }).textContent).toMatch(/Importar 1 \+ 2/);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(comandos.map((c) => c.type)).toEqual(['AddWall', 'AddOpening', 'AddOpening']);
    const parede = comandos[0];
    expect(typeof parede.uid).toBe('string');
    const porta = comandos.find((c) => c.kind === 'door')!;
    const janela = comandos.find((c) => c.kind === 'window')!;
    expect(porta).toMatchObject({ wallId: '', wallUid: parede.uid, widthMm: 900, heightMm: 2100, sillMm: 0 });
    expect(typeof porta.hingeAtStart).toBe('boolean');
    expect(typeof porta.swingReversed).toBe('boolean');
    expect(janela).toMatchObject({ wallUid: parede.uid, widthMm: 1200, heightMm: 1200, sillMm: 1000 });
  });

  it('as hipóteses editadas entram nas aberturas e ficam persistidas por tela', async () => {
    const { onImportar } = await abrirComArquivo(dxfComEsquadrias());
    fireEvent.change(screen.getByLabelText('Altura da porta'), { target: { value: '2400' } });
    fireEvent.change(screen.getByLabelText('Peitoril da janela'), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(comandos.find((c) => c.kind === 'door')).toMatchObject({ heightMm: 2400 });
    expect(comandos.find((c) => c.kind === 'window')).toMatchObject({ sillMm: 900 });
    expect(JSON.parse(localStorage.getItem('blueprint:dxf-esquadrias')!)).toMatchObject({ portaAlturaMm: 2400, janelaPeitorilMm: 900 });
  });

  it('desligando o reconhecimento de símbolos, os buracos viram vãos livres', async () => {
    const { onImportar } = await abrirComArquivo(dxfComEsquadrias());
    fireEvent.click(screen.getByLabelText('Reconhecer portas e janelas pelos símbolos'));
    expect(screen.getByTestId('resumo-esquadrias').textContent).toBe('0 porta(s) · 0 janela(s) · 2 vão(s) livre(s)');
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(comandos.filter((c) => c.type === 'AddOpening').map((c) => c.kind)).toEqual(['passage', 'passage']);
  });
});

/** P2.34: uma parede de 150 (4 m) e uma "parede" de 60 mm (duas linhas de grade a 60 mm, 1 m). */
function dxfComDuasEspessuras(): string {
  const L = (x1: number, y1: number, x2: number, y2: number): [string, string][] => [['0', 'LINE'], ['8', 'PAREDE'], ['10', String(x1)], ['20', String(y1)], ['11', String(x2)], ['21', String(y2)]];
  const pares: [string, string][] = [
    ['0', 'SECTION'], ['2', 'HEADER'], ['9', '$INSUNITS'], ['70', '4'], ['0', 'ENDSEC'],
    ['0', 'SECTION'], ['2', 'ENTITIES'],
    ...L(0, 0, 4000, 0), ...L(0, 150, 4000, 150),
    ...L(0, 3000, 1000, 3000), ...L(0, 3060, 1000, 3060),
    ['0', 'ENDSEC'], ['0', 'EOF'],
  ];
  return pares.flatMap(([c, v]) => [c, v]).join('\n');
}

describe('importar DXF · filtro de espessuras e relatório (P2.34)', () => {
  it('lista as espessuras com contagem, deixa desmarcar uma, e "Só as principais" tira a grade de 60 mm', async () => {
    const { onImportar } = await abrirComArquivo(dxfComDuasEspessuras());
    expect(screen.getByTestId('resumo-dxf').textContent).toMatch(/2 paredes .* espessuras 60, 150 mm/);
    const chip60 = screen.getByRole('button', { name: 'Espessura 60 mm' });
    expect(chip60.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip60);
    expect(chip60.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('resumo-dxf').textContent).toMatch(/1 parede .* espessuras 150 mm/);
    expect(screen.getByTestId('resumo-ignorados').textContent).toMatch(/1 parede\(s\) fora pelo filtro de espessura/);
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(screen.getByTestId('resumo-dxf').textContent).toMatch(/2 paredes/);
    // 1 m de 60 mm em 5 m totais = 20% → fica; a regra dos 4% só tira o que é ruído de verdade.
    fireEvent.click(screen.getByRole('button', { name: 'Só as principais' }));
    expect(screen.getByTestId('resumo-dxf').textContent).toMatch(/2 paredes/);
    fireEvent.click(chip60);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(comandos).toHaveLength(1);
    expect(comandos[0]).toMatchObject({ type: 'AddWall', thicknessMm: 150 });
  });

  it('o relatório de leitura diz quantas pontas vão ficar soltas', async () => {
    await abrirComArquivo(dxfComEsquadrias());
    expect(screen.getByTestId('relatorio-dxf').textContent).toMatch(/Relatório de leitura/);
    // Uma parede isolada: as duas pontas soltas.
    expect(screen.getByTestId('resumo-juncoes').textContent).toBe('2 ponta(s) de parede vão ficar soltas');
  });
});

describe('importar DXF · Padrão ÒPURA (P2.35)', () => {
  it('o template baixado volta detectado: paredes pelo eixo, esquadrias pelos atributos, ambiente pelo texto — e o lote leva PlaceSpaceLabel', async () => {
    const { onImportar } = await abrirComArquivo(gerarTemplateOpura());
    expect(screen.getByTestId('aviso-opura').textContent).toMatch(/Arquivo no Padrão ÒPURA/);
    expect(screen.getByTestId('resumo-opura').textContent).toBe('4 parede(s) de 150 mm · 1 porta(s) · 1 janela(s) · 0 de correr · 0 vão(s) · 1 ambiente(s)');
    // As perguntas que o padrão já respondeu não aparecem.
    expect(screen.queryByLabelText('Camada que contém as paredes')).toBeNull();
    expect(screen.queryByLabelText('Unidade em que o arquivo foi desenhado')).toBeNull();
    expect(screen.getByTestId('resumo-juncoes').textContent).toBe('Todas as pontas de parede encostam em outra.');
    expect(screen.getByRole('button', { name: /Importar/ }).textContent).toMatch(/Importar 4 \+ 3/);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(comandos.filter((c) => c.type === 'AddWall')).toHaveLength(4);
    expect(comandos.find((c) => c.kind === 'door')).toMatchObject({ widthMm: 800, heightMm: 2100, esquadria: { nome: 'P1' } });
    expect(comandos.find((c) => c.kind === 'window')).toMatchObject({ widthMm: 1200, heightMm: 1200, sillMm: 1000, esquadria: { nome: 'J1' } });
    expect(comandos.find((c) => c.type === 'PlaceSpaceLabel')).toMatchObject({ name: 'SALA', at: { x: 1700, y: 1500 } });
  });

  it('desligar "Ler pelo Padrão ÒPURA" volta ao caminho comum (camada e unidade reaparecem)', async () => {
    await abrirComArquivo(gerarTemplateOpura());
    fireEvent.click(screen.getByLabelText('Ler pelo Padrão ÒPURA'));
    expect(screen.getByLabelText('Camada que contém as paredes')).toBeTruthy();
  });

  it('antes de escolher arquivo, o painel oferece o template e as regras', () => {
    const { model, levelId } = comNivel();
    render(<PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={vi.fn()} />);
    expect(screen.getByTestId('padrao-opura').textContent).toMatch(/Padrão ÒPURA de desenho v1\.0/);
    expect(screen.getByRole('button', { name: /Baixar template/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver as regras' }));
    expect(screen.getByTestId('regras-opura').querySelectorAll('li')).toHaveLength(REGRAS_DO_PADRAO.length);
  });
});

/** jsdom não tem canvas 2D: um contexto que só grava e um `toBlob` que devolve um PNG vazio. */
function comCanvasFalso() {
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: unknown; toBlob: unknown };
  const getContext = proto.getContext;
  const toBlob = proto.toBlob;
  const ctx = { lineWidth: 1, strokeStyle: '', lineCap: 'butt', beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, stroke() {} };
  proto.getContext = () => ctx;
  proto.toBlob = function (this: HTMLCanvasElement, cb: (b: Blob | null) => void) { cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })); };
  return () => { proto.getContext = getContext; proto.toBlob = toBlob; };
}

describe('importar DXF · coordenadas do arquivo longe da origem (P2.37)', () => {
  it('com o desenho a quilômetros da origem, "manter as coordenadas" não deixa importar — o kernel recusaria e derrubava o editor', async () => {
    // O mesmo desenho, deslocado 4 km em x: é o caso do projeto real da empresa (3.976.897 mm).
    const longe = dxfDeUmaParede().replace(/\n(10|11)\n(-?[\d.]+)\n/g, (m, c, v) => `\n${c}\n${Number(v) + 4_000_000}\n`);
    await abrirComArquivo(longe);
    const botao = screen.getByRole('button', { name: /Importar/ });
    expect(botao).toHaveProperty('disabled', false);
    fireEvent.change(screen.getByLabelText('Onde ancorar o desenho importado'), { target: { value: 'ARQUIVO' } });
    expect(screen.getByTestId('aviso-longe').textContent).toMatch(/escolha outra posição/);
    expect(screen.getByRole('button', { name: /Importar/ })).toHaveProperty('disabled', true);
    // Nas outras posições o desenho entra normalmente.
    fireEvent.change(screen.getByLabelText('Onde ancorar o desenho importado'), { target: { value: 'ORIGEM' } });
    expect(screen.getByRole('button', { name: /Importar/ })).toHaveProperty('disabled', false);
  });
});

describe('importar DXF · o desenho original como planta de fundo (P2.36)', () => {
  it('rasteriza o arquivo inteiro já aferido e entrega ao editor ANTES das paredes; o fundo anda com a ancoragem', async () => {
    const restaurar = comCanvasFalso();
    try {
      const onFundo = vi.fn(async () => true);
      const onImportar = vi.fn();
      const { model, levelId } = comNivel();
      const { container } = render(<PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={onImportar} onFundo={onFundo} />);
      const texto = dxfComEsquadrias();
      const arquivo = new File([texto], 'planta.dxf', { type: 'application/dxf' });
      Object.defineProperty(arquivo, 'text', { value: async () => texto });
      fireEvent.change(container.querySelector('#importar-dxf-arquivo') as HTMLInputElement, { target: { files: [arquivo] } });
      await waitFor(() => expect(screen.getByText('planta.dxf')).toBeTruthy());
      expect(screen.getByTestId('plano-do-fundo').textContent).toMatch(/Todas as camadas, já aferido: \d+ × \d+ px · [\d,.]+ mm\/px · camada PAREDE em destaque/);
      // Ancoragem "manter as coordenadas do arquivo": dx = dy = 0, então o canto do desenho é (0, 150) com a margem de 8 px.
      fireEvent.change(screen.getByLabelText('Onde ancorar o desenho importado'), { target: { value: 'ARQUIVO' } });
      fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
      await waitFor(() => expect(onImportar).toHaveBeenCalledTimes(1));
      expect(onFundo).toHaveBeenCalledTimes(1);
      const [blob, nome, underlay, larguraPx, desenho] = onFundo.mock.calls[0] as unknown as [Blob, string, { origemXMm: number; origemYMm: number; mmPorPixel: number; rotacaoMrad: number }, number, { v: number; camada: string; mmPorUnidade: number; texto: string; dx: number; dy: number }];
      // P2.38: o desenho de origem vai junto, com os parâmetros da importação — é o que permite gerar de novo.
      expect(desenho).toMatchObject({ v: 1, nomeArquivo: 'planta.dxf', camada: 'PAREDE', mmPorUnidade: 1, modo: 'FACES' });
      expect(desenho.texto).toContain('PAREDE');
      expect(blob.type).toBe('image/png');
      expect(nome).toBe('planta.dxf');
      // Desenho de 6000 mm de largura (o arco da porta sobe até y = 900): 6000 / 4080 = 1,47 mm/px, margem de 8 px.
      expect(underlay.mmPorPixel).toBeCloseTo(6000 / 4080, 4);
      expect(underlay.origemXMm).toBeCloseTo(-8 * underlay.mmPorPixel, 4);
      expect(underlay.origemYMm).toBeCloseTo(900 + 8 * underlay.mmPorPixel, 4);
      expect(underlay.rotacaoMrad).toBe(0);
      expect(larguraPx).toBe(4096);
      expect(onFundo.mock.invocationCallOrder[0]).toBeLessThan(onImportar.mock.invocationCallOrder[0]);
    } finally {
      restaurar();
    }
  });

  it('desmarcando, só as paredes entram; se o editor não guardar o fundo, as paredes entram e o aviso aparece', async () => {
    const restaurar = comCanvasFalso();
    try {
      localStorage.clear();
      const onFundo = vi.fn(async () => false);
      const onImportar = vi.fn();
      const { model, levelId } = comNivel();
      const { container } = render(<PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={onImportar} onFundo={onFundo} fundoAtivo />);
      const texto = dxfDeUmaParede();
      const arquivo = new File([texto], 'planta.dxf', { type: 'application/dxf' });
      Object.defineProperty(arquivo, 'text', { value: async () => texto });
      fireEvent.change(container.querySelector('#importar-dxf-arquivo') as HTMLInputElement, { target: { files: [arquivo] } });
      await waitFor(() => expect(screen.getByText('planta.dxf')).toBeTruthy());
      expect(screen.getByTestId('plano-do-fundo').textContent).toMatch(/entra como mais uma prancha de fundo/);
      fireEvent.click(screen.getByLabelText('Guardar o desenho original como planta de fundo'));
      expect(screen.getByTestId('plano-do-fundo').textContent).toMatch(/Só as paredes entram/);
      fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
      await waitFor(() => expect(onImportar).toHaveBeenCalledTimes(1));
      expect(onFundo).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem('blueprint:dxf-fundo')!)).toBe(false);
    } finally {
      restaurar();
    }
  });

  it('se o editor não guardar o fundo, as paredes entram mesmo assim e o aviso aparece', async () => {
    // Com o fundo ligado, mas o editor recusando: aviso, e as paredes entraram mesmo assim.
    const restaurar2 = comCanvasFalso();
    try {
      localStorage.clear();
      const onFundo = vi.fn(async () => false);
      const onImportar = vi.fn();
      const { model, levelId } = comNivel();
      const { container } = render(<PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={onImportar} onFundo={onFundo} />);
      const texto = dxfDeUmaParede();
      const arquivo = new File([texto], 'outra.dxf', { type: 'application/dxf' });
      Object.defineProperty(arquivo, 'text', { value: async () => texto });
      fireEvent.change(container.querySelector('#importar-dxf-arquivo') as HTMLInputElement, { target: { files: [arquivo] } });
      await waitFor(() => expect(screen.getByText('outra.dxf')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
      await waitFor(() => expect(onImportar).toHaveBeenCalledTimes(1));
      expect(onFundo).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/As paredes entraram, mas a planta de fundo não foi guardada/)).toBeTruthy();
    } finally {
      restaurar2();
    }
  });
});

describe('importar DXF · gerar de novo com o desenho guardado (P2.38)', () => {
  const guardado = () => ({
    v: 1 as const,
    nomeArquivo: 'planta.dxf',
    mmPorUnidade: 1,
    camada: 'PAREDE',
    modo: 'FACES' as const,
    espessuraMm: 150,
    dx: 1000,
    dy: 2000,
    texto: dxfComEsquadrias(),
  });

  it('a prancha com desenho guardado oferece gerar de novo: restaura camada e unidade, entra alinhado ao fundo e NÃO sobe outro fundo', async () => {
    const restaurar = comCanvasFalso();
    try {
      const onFundo = vi.fn(async () => true);
      const onImportar = vi.fn();
      const { model, levelId } = comNivel();
      render(
        <PainelImportarDxf
          model={model}
          levelIdAtivo={levelId}
          onImportar={onImportar}
          onFundo={onFundo}
          fundoAtivo
          onDesenhoGuardado={async () => guardado()}
        />,
      );
      await waitFor(() => expect(screen.getByTestId('desenho-guardado')).toBeTruthy());
      expect(screen.getByTestId('desenho-guardado').textContent).toMatch(/planta\.dxf · camada PAREDE · milímetro/);
      fireEvent.click(screen.getByRole('button', { name: /Gerar de novo com este desenho/ }));
      await waitFor(() => expect(screen.getByText('planta.dxf')).toBeTruthy());
      // A posição não se escolhe: é a da planta de fundo, senão o gerado não cairia em cima dela.
      expect(screen.getByTestId('alinhado-ao-fundo').textContent).toMatch(/alinhada à planta de fundo/);
      expect(screen.queryByLabelText('Onde ancorar o desenho importado')).toBeNull();
      expect(screen.queryByTestId('fundo-dxf')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
      await waitFor(() => expect(onImportar).toHaveBeenCalledTimes(1));
      expect(onFundo).not.toHaveBeenCalled();
      // O deslocamento guardado (1000, 2000) é o que posiciona as paredes.
      const parede = (onImportar.mock.calls[0][0] as Array<Record<string, { x: number; y: number }>>).find((c) => (c as unknown as { type: string }).type === 'AddWall')!;
      expect(parede.a).toEqual({ x: 1000, y: 2075 });
    } finally {
      restaurar();
    }
  });

  it('a região limita o que é gerado, e diz quantas ficaram de fora', async () => {
    const restaurar = comCanvasFalso();
    try {
      const onImportar = vi.fn();
      const { model, levelId } = comNivel();
      // Duas paredes no desenho: a de 6 m em y≈75 e outra, distante, em y≈5000.
      const doisTrechos = {
        ...guardado(),
        dx: 0,
        dy: 0,
        texto: dxfComEsquadrias().replace('0\nENDSEC\n0\nEOF', ['0', 'LINE', '8', 'PAREDE', '10', '0', '20', '5000', '11', '4000', '21', '5000', '0', 'LINE', '8', 'PAREDE', '10', '0', '20', '5150', '11', '4000', '21', '5150', '0', 'ENDSEC', '0', 'EOF'].join('\n')),
      };
      const { rerender } = render(
        <PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={onImportar} onDesenhoGuardado={async () => doisTrechos} onArmarRegiao={() => {}} onLimparRegiao={() => {}} />,
      );
      await waitFor(() => expect(screen.getByTestId('desenho-guardado')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Gerar de novo com este desenho/ }));
      await waitFor(() => expect(screen.getByText('planta.dxf')).toBeTruthy());
      expect(screen.getByTestId('resumo-dxf').textContent).toMatch(/2 paredes/);
      expect(screen.getByTestId('regiao-dxf').textContent).toMatch(/Sem região, o desenho inteiro entra/);

      // Região em torno da parede de baixo (y≈75): a de cima fica de fora.
      rerender(
        <PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={onImportar} onDesenhoGuardado={async () => doisTrechos} onArmarRegiao={() => {}} onLimparRegiao={() => {}} regiao={{ x0: -500, y0: -500, x1: 7000, y1: 500 }} />,
      );
      expect(screen.getByTestId('resumo-dxf').textContent).toMatch(/1 parede /);
      expect(screen.getByTestId('regiao-dxf').textContent).toMatch(/1 fora dele/);
      // Os contadores são do que VAI ENTRAR: a parede que ficou leva a porta e as janelas dela.
      expect(screen.getByTestId('resumo-esquadrias').textContent).toBe('1 porta(s) · 1 janela(s) · 0 vão(s) livre(s)');
      expect(screen.getByRole('button', { name: /Importar/ }).textContent).toMatch(/Importar 1 \+ 2/);
      fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
      await waitFor(() => expect(onImportar).toHaveBeenCalledTimes(1));
      const comandos = onImportar.mock.calls[0][0] as Array<{ type: string; a?: { y: number } }>;
      expect(comandos.filter((c) => c.type === 'AddWall')).toHaveLength(1);
      expect(comandos.find((c) => c.type === 'AddWall')!.a!.y).toBe(75);
    } finally {
      restaurar();
    }
  });

  it('prancha sem desenho guardado (o caso do PDF) não oferece nada', async () => {
    const { model, levelId } = comNivel();
    render(<PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={vi.fn()} onDesenhoGuardado={async () => null} />);
    await waitFor(() => expect(screen.getByTestId('padrao-opura')).toBeTruthy());
    expect(screen.queryByTestId('desenho-guardado')).toBeNull();
  });
});

describe('importar DWG (E9.1) · pela Edge Function, no pipeline do DXF', () => {
  it('um .dwg vai ao conversor, volta como DXF e a tela declara a versão; o resultado é a mesma parede que o DXF daria', async () => {
    converterDwgParaDxf.mockResolvedValue({ dxf: dxfDeUmaParede(), versao: 'AC1032', release: 'AutoCAD 2018+', bytes: 25920, codigoLibredwg: 4 });
    const onImportar = vi.fn();
    const { model, levelId } = comNivel();
    const { container } = render(<PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={onImportar} />);
    expect(screen.getByTestId('aviso-dwg').textContent).toMatch(/convertido para DXF no servidor/);
    expect((container.querySelector('#importar-dxf-arquivo') as HTMLInputElement).accept).toBe('.dxf,.dwg');
    const input = container.querySelector('#importar-dxf-arquivo') as HTMLInputElement;
    const arquivo = new File([new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x33, 0x32])], 'TERRENO.dwg', { type: 'application/acad' });
    fireEvent.change(input, { target: { files: [arquivo] } });
    await waitFor(() => expect(screen.getByText('TERRENO.dwg')).toBeTruthy());
    expect(converterDwgParaDxf).toHaveBeenCalledTimes(1);
    expect((converterDwgParaDxf.mock.calls[0][0] as File).name).toBe('TERRENO.dwg');
    const versao = screen.getByTestId('versao-do-dwg');
    expect(versao.textContent).toMatch(/DWG AC1032 · AutoCAD 2018\+ · 25 KB/);
    expect(versao.textContent).toMatch(/libredwg avisou: código 4/);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0];
    expect(comandos).toHaveLength(1);
    expect(comandos[0]).toMatchObject({ type: 'AddWall', thicknessMm: 150, heightMm: 2800 });
  });

  it('a recusa do conversor aparece na tela, e nada é importado', async () => {
    converterDwgParaDxf.mockRejectedValue(new Error('Conversão DWG → DXF falhou: O libredwg não conseguiu ler este DWG (código 256).'));
    const { model, levelId } = comNivel();
    const { container } = render(<PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={vi.fn()} />);
    const input = container.querySelector('#importar-dxf-arquivo') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(10)], 'quebrado.dwg')] } });
    await waitFor(() => expect(screen.getByText(/código 256/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Importar/ })).toBeNull();
  });
});
