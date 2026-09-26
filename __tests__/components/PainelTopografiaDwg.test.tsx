// @vitest-environment jsdom
/**
 * DWG no "Importar levantamento" (26/09/2026): o .dwg vai à conversão no
 * servidor (a mesma do "Importar do DXF/DWG" de paredes) e o DXF devolvido
 * segue pelo leitor de levantamento — pontos, linhas de quebra, contorno. A
 * prévia diz que era DWG e a versão; aviso do conversor vira aviso da
 * importação; falha da conversão aparece como erro. A proveniência é o hash
 * do DWG, não do DXF gerado.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PainelTopografia from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
const conversor = vi.hoisted(() => ({ converterDwgParaDxf: vi.fn() }));
vi.mock('../../services/blueprintDwgService', () => conversor);

const LOTE = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 30000 },
  { x: 0, y: 30000 },
];

function hook(): Topografia {
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
  } as Topografia;
}

const par = (c: number | string, v: number | string) => `${c}\n${v}\n`;
const secao = (nome: string, corpo: string) => par(0, 'SECTION') + par(2, nome) + corpo + par(0, 'ENDSEC');
const DXF =
  secao('HEADER', par(9, '$INSUNITS') + par(70, 6)) +
  secao(
    'ENTITIES',
    par(0, 'POINT') + par(10, 1) + par(20, 1) + par(30, 100) +
      par(0, 'POINT') + par(10, 11) + par(20, 1) + par(30, 100.6) +
      par(0, 'POINT') + par(10, 11) + par(20, 29) + par(30, 103) +
      par(0, 'LWPOLYLINE') + par(38, 101) + par(70, 0) + par(10, 2) + par(20, 5) + par(10, 6) + par(20, 5) + par(10, 10) + par(20, 5),
  );

// Bytes de um "DWG": o cabeçalho AC1032 e mais nada — o conversor é simulado.
const BYTES_DO_DWG = new TextEncoder().encode('AC1032\0\0\0\0');

function escolherDwg(nome = 'levantamento.dwg') {
  const input = screen.getByLabelText('Arquivo de pontos cotados') as HTMLInputElement;
  expect(input.accept).toContain('.dwg');
  fireEvent.change(input, { target: { files: [new File([BYTES_DO_DWG], nome, { type: 'application/acad' })] } });
}

async function sha256Hex(b: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

describe('PainelTopografia · levantamento em DWG', () => {
  beforeEach(() => {
    conversor.converterDwgParaDxf.mockReset();
  });

  it('⭐ o DWG é convertido e lido como DXF: pontos, quebra, versão na prévia e hash do DWG na proveniência', async () => {
    conversor.converterDwgParaDxf.mockResolvedValue({ dxf: DXF, versao: 'AC1032', release: 'AutoCAD 2018+', bytes: BYTES_DO_DWG.length, codigoLibredwg: 0 });
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    escolherDwg();
    expect(screen.getByTestId('convertendo-dwg').textContent).toMatch(/levantamento\.dwg/);
    await waitFor(() => expect(screen.getByTestId('previa-quebras')).toBeTruthy());
    expect(conversor.converterDwgParaDxf).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('convertendo-dwg')).toBeNull();
    const previa = screen.getByTestId('previa-da-importacao').textContent ?? '';
    expect(previa).toMatch(/DWG AC1032 · AutoCAD 2018\+, convertido para DXF no servidor/);
    expect(previa).toMatch(/6 pontos lidos/);
    fireEvent.click(screen.getByRole('button', { name: 'Substituir os pontos' }));
    const [pontos, origem, modo, extras] = (t.definirPontosCotados as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(modo).toBe('SUBSTITUIR');
    expect(pontos).toHaveLength(6);
    expect(extras.linhasDeQuebra).toHaveLength(1);
    expect(JSON.stringify(origem)).toContain(await sha256Hex(BYTES_DO_DWG));
  });

  it('aviso do conversor (código > 0) vira aviso da importação', async () => {
    conversor.converterDwgParaDxf.mockResolvedValue({ dxf: DXF, versao: 'AC1027', release: 'AutoCAD 2013/2017', bytes: 10, codigoLibredwg: 4 });
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia={false} />);
    escolherDwg();
    await waitFor(() => expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/conversor de DWG avisou \(código 4\)/));
  });

  it('falha da conversão aparece como erro, e aplicar fica desligado', async () => {
    conversor.converterDwgParaDxf.mockRejectedValue(new Error('Conversão DWG → DXF falhou: arquivo truncado'));
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia={false} />);
    escolherDwg();
    await waitFor(() => expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/arquivo truncado/));
    expect(screen.getByRole('button', { name: 'Substituir os pontos' })).toBeDisabled();
    expect(screen.queryByTestId('convertendo-dwg')).toBeNull();
  });
});
