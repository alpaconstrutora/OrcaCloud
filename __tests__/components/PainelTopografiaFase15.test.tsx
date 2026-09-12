// @vitest-environment jsdom
/**
 * Fase 15 no painel: a prévia diz quantas linhas de quebra e quantas faces
 * de TIN o arquivo traz, "Substituir" leva as duas coisas ao hook, e a linha
 * "quebras-e-tin" mostra o que está em uso e deixa remover.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

const LOTE = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 30000 },
  { x: 0, y: 30000 },
];

function hook(extra: Partial<Topografia> = {}): Topografia {
  return {
    fontes: FONTES, fonteCodigo: 'PONTOS_COTADOS', setFonteCodigo: vi.fn(), fonte: fonteDeElevacao('PONTOS_COTADOS'),
    pontosCotados: [], adicionarPonto: vi.fn(), alterarPonto: vi.fn(), removerPonto: vi.fn(), usarVerticesDoLote: vi.fn(),
    definirPontosCotados: vi.fn(), origemDosPontos: null, linhasDeQuebra: [], tinImportada: null, limparQuebrasETin: vi.fn(),
    anelDoLote: LOTE, georreferencia: null,
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5,
    modoNiveis: 'EQUIDISTANCIA', setModoNiveis: vi.fn(), numeroDeNiveis: 7, setNumeroDeNiveis: vi.fn(), niveisTexto: '', setNiveisTexto: vi.fn(),
    areaDasCurvas: 'LOTE', setAreaDasCurvas: vi.fn(),
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [], selecionada: null, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
    ...extra,
  };
}

function escolher(nome: string, conteudo: string) {
  const input = screen.getByLabelText('Arquivo de pontos cotados') as HTMLInputElement;
  const file = new File([conteudo], nome, { type: 'text/plain' });
  fireEvent.change(input, { target: { files: [file] } });
}

const par = (c: number | string, v: number | string) => `${c}\n${v}\n`;
const secao = (nome: string, corpo: string) => par(0, 'SECTION') + par(2, nome) + corpo + par(0, 'ENDSEC');

describe('PainelTopografia · fase 15 (linhas de quebra e TIN)', () => {
  it('DXF com polilinha elevada: a prévia conta a linha de quebra e "Substituir" a leva ao hook', async () => {
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    const dxf =
      secao('HEADER', par(9, '$INSUNITS') + par(70, 6)) +
      secao(
        'ENTITIES',
        par(0, 'POINT') + par(10, 1) + par(20, 1) + par(30, 100) +
          par(0, 'POINT') + par(10, 11) + par(20, 1) + par(30, 100.6) +
          par(0, 'POINT') + par(10, 11) + par(20, 29) + par(30, 103) +
          par(0, 'LWPOLYLINE') + par(38, 101) + par(70, 0) + par(10, 2) + par(20, 5) + par(10, 6) + par(20, 5) + par(10, 10) + par(20, 5),
      );
    escolher('levantamento.dxf', dxf);
    await waitFor(() => expect(screen.getByTestId('previa-quebras')).toBeTruthy());
    expect(screen.getByTestId('previa-quebras').textContent).toBe('1 linhas de quebra');
    expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/6 pontos lidos/);
    fireEvent.click(screen.getByRole('button', { name: 'Substituir os pontos' }));
    const [pontos, , modo, extras] = (t.definirPontosCotados as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(modo).toBe('SUBSTITUIR');
    expect(pontos).toHaveLength(6);
    expect(extras.linhasDeQuebra).toHaveLength(1);
    expect(extras.linhasDeQuebra[0].pontos).toEqual([
      { x: 2000, y: 5000, cotaM: 101 },
      { x: 6000, y: 5000, cotaM: 101 },
      { x: 10000, y: 5000, cotaM: 101 },
    ]);
    expect(extras.tinImportada).toBeNull();
  });

  it('LandXML: a prévia diz o formato e as faces da TIN', async () => {
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    const xml =
      '<LandXML><Units><Metric linearUnit="meter"/></Units><Surfaces><Surface><Definition><Pnts><P id="1">0 0 100</P><P id="2">0 12 110</P><P id="3">30 12 100</P><P id="4">30 0 110</P></Pnts>' +
      '<Faces><F>1 2 3</F><F>1 3 4</F></Faces></Definition></Surface></Surfaces></LandXML>';
    escolher('superficie.xml', xml);
    await waitFor(() => expect(screen.getByTestId('previa-tin')).toBeTruthy());
    expect(screen.getByTestId('previa-tin').textContent).toBe('TIN com 2 faces');
    expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/LandXML/);
    fireEvent.click(screen.getByRole('button', { name: 'Substituir os pontos' }));
    const extras = (t.definirPontosCotados as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(extras.tinImportada).toEqual({ faces: [0, 1, 2, 0, 2, 3] });
  });

  it('a linha "quebras-e-tin" mostra o que está em uso e "Remover" limpa', () => {
    const t = hook({
      pontosCotados: [{ x: 0, y: 0, cotaM: 100 }],
      linhasDeQuebra: [{ pontos: [{ x: 0, y: 0, cotaM: 100 }, { x: 1000, y: 0, cotaM: 101 }, { x: 2000, y: 0, cotaM: 102 }] }],
      tinImportada: { faces: [0, 1, 2] },
    });
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    const linha = screen.getByTestId('quebras-e-tin');
    expect(linha.textContent).toMatch(/1 linha de quebra \(3 vértices\)/);
    expect(linha.textContent).toMatch(/TIN importada \(1 faces\)/);
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(t.limparQuebrasETin).toHaveBeenCalledTimes(1);
  });
});
