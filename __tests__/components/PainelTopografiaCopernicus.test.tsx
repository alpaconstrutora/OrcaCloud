// @vitest-environment jsdom
/**
 * Botões de fonte do painel (11/10/2026): só as fontes oferecidas — Pontos
 * cotados, Copernicus 30 m e SRTM 30 m. Uma versão antiga gravada com o
 * Open-Meteo (que saiu dos botões) ainda mostra o seu.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import { FONTES, fonteDeElevacao, type CodigoDaFonte } from '../../utils/blueprintElevacaoProvedores';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

const LOTE = [
  { x: 0, y: 0 },
  { x: 288000, y: 0 },
  { x: 288000, y: 248000 },
  { x: 0, y: 248000 },
];

function hook(codigo: CodigoDaFonte): Topografia {
  return {
    fontes: FONTES, fonteCodigo: codigo, setFonteCodigo: vi.fn(), fonte: fonteDeElevacao(codigo),
    pontosCotados: [], adicionarPonto: vi.fn(), alterarPonto: vi.fn(), removerPonto: vi.fn(), usarVerticesDoLote: vi.fn(),
    definirPontosCotados: vi.fn(), origemDosPontos: null, linhasDeQuebra: [], tinImportada: null, limparQuebrasETin: vi.fn(), anelDoLote: LOTE, georreferencia: null,
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 1,
    modoNiveis: 'EQUIDISTANCIA', setModoNiveis: vi.fn(), numeroDeNiveis: 7, setNumeroDeNiveis: vi.fn(), niveisTexto: '', setNiveisTexto: vi.fn(),
    areaDasCurvas: 'LOTE', setAreaDasCurvas: vi.fn(),
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [], selecionada: null, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
  };
}

const botoesDeFonte = () =>
  screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed') && FONTES.some((f) => f.rotuloCurto === b.textContent));

describe('PainelTopografia · fontes oferecidas', () => {
  it('três botões; Copernicus 30 m escolhe a fonte nova', () => {
    const t = hook('PONTOS_COTADOS');
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia />);
    expect(botoesDeFonte().map((b) => b.textContent)).toEqual(['Pontos cotados', 'Copernicus 30 m', 'SRTM 30 m']);
    fireEvent.click(screen.getByRole('button', { name: 'Copernicus 30 m' }));
    expect(t.setFonteCodigo).toHaveBeenCalledWith('COPERNICUS_GLO30');
  });

  it('com Copernicus ativo, a proveniência aparece antes de gerar', () => {
    render(<PainelTopografia topografia={hook('COPERNICUS_GLO30')} temLoteFechado temGeorreferencia />);
    expect(screen.getByText(/Copernicus DEM GLO-30 \(AWS Open Data\) · célula de 30 m · referência vertical: EGM2008/)).toBeTruthy();
    expect(screen.getByText(/licença livre inclusive para uso comercial/)).toBeTruthy();
  });

  it('versão antiga com o Open-Meteo: o botão "DEM 90 m" ainda aparece, ativo', () => {
    render(<PainelTopografia topografia={hook('OPEN_METEO_GLO90')} temLoteFechado temGeorreferencia />);
    const b = screen.getByRole('button', { name: 'DEM 90 m' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(botoesDeFonte()).toHaveLength(4);
  });
});
