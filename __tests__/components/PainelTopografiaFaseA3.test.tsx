// @vitest-environment jsdom
/**
 * A3 no painel: KMZ e SHP ao lado do KML (KMZ desligado sem georreferência,
 * dizendo por quê; SHP sempre, avisando no title quando sai em coordenadas
 * locais), a seção "Mancha de inundação", o botão "DEM do arquivo" que só
 * existe quando um GeoTIFF o escolheu, e o importador aceitando .zip/.kmz/.tif.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia, { type InundacaoNoPainel } from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
import { FONTES, fonteDeElevacao, type CodigoDaFonte } from '../../utils/blueprintElevacaoProvedores';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

function versao(extra: Partial<BlueprintTopografiaRow> = {}): BlueprintTopografiaRow {
  return {
    id: 'v1', study_id: 's1', organization_id: 'o1', versao: 1, fonte_codigo: 'PONTOS_COTADOS',
    fonte_nome: 'x', dataset_versao: 'x', resolucao_fonte_m: null, referencia_vertical: null, classe_qualidade: 'LEVANTAMENTO_IMPORTADO',
    grade: { origem: { x: 0, y: 0 }, espacamentoMm: 1000, colunas: 3, linhas: 3, cotasM: Array(9).fill(100) },
    equidistancia_m: 0.5, curvas: [],
    estatisticas: { cotaMinM: 100, cotaMaxM: 103, cotaMediaM: 101.5, amplitudeM: 3, amostrasValidas: 9, amostrasAusentes: 0, amostrasNoLote: 9, areaM2: 4, espacamentoM: 1, curvas: 0, comprimentoDasCurvasM: 0 },
    pontos_cotados: [], linhas_de_quebra: [], tin_importada: null, anel: [], georreferencia: null, algoritmo_nome: 'a', algoritmo_versao: '1', hash_entrada: 'e', hash_resultado: 'h', avisos: [], created_by: null, created_at: '2026-09-26T12:00:00Z',
    ...extra,
  };
}

function hook(extra: Partial<Topografia> = {}, v = versao()): Topografia {
  return {
    fontes: FONTES, fonteCodigo: 'PONTOS_COTADOS', setFonteCodigo: vi.fn(), fonte: fonteDeElevacao('PONTOS_COTADOS'),
    pontosCotados: [], adicionarPonto: vi.fn(), alterarPonto: vi.fn(), removerPonto: vi.fn(), usarVerticesDoLote: vi.fn(), linhasDeQuebra: [], tinImportada: null, limparQuebrasETin: vi.fn(),
    definirPontosCotados: vi.fn(), origemDosPontos: null, anelDoLote: null, georreferencia: null,
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5, modoNiveis: 'EQUIDISTANCIA', setModoNiveis: vi.fn(), numeroDeNiveis: 7, setNumeroDeNiveis: vi.fn(), niveisTexto: '', setNiveisTexto: vi.fn(), areaDasCurvas: 'LOTE', setAreaDasCurvas: vi.fn(),
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [v], selecionada: v, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
    ...extra,
  } as Topografia;
}

function inundacao(extra: Partial<InundacaoNoPainel> = {}): InundacaoNoPainel {
  return { cotaM: null, onCotaM: vi.fn(), areaM2: 0, laminaMaxM: 0, cotaMinM: 100, cotaMaxM: 103, ...extra };
}

describe('PainelTopografia · A3', () => {
  it('KMZ desligado sem georreferência dizendo por quê; SHP ligado avisando que sai LOCAL; os dois chamam exportar', () => {
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    const kmz = screen.getByRole('button', { name: 'KMZ' });
    expect(kmz).toBeDisabled();
    expect(kmz.title).toMatch(/Onde fica/);
    const shp = screen.getByRole('button', { name: 'SHP' });
    expect(shp).not.toBeDisabled();
    expect(shp.title).toMatch(/LOCAIS.*sem \.prj/);
    fireEvent.click(shp);
    expect(t.exportar).toHaveBeenCalledWith('shp', expect.any(Object));
  });

  it('com georreferência, KMZ exporta e o SHP promete SIRGAS 2000 / UTM; os lotes vão nos extras', () => {
    const t = hook({}, versao({ georreferencia: { latitude: -19.9, longitude: -43.9 } as never }));
    const lotes = [{ quadra: 'A', numero: '1', areaM2: 300, pontos: [] }];
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia lotesDoLoteamento={lotes} />);
    fireEvent.click(screen.getByRole('button', { name: 'KMZ' }));
    expect(t.exportar).toHaveBeenCalledWith('kmz', expect.any(Object));
    const shp = screen.getByRole('button', { name: 'SHP' });
    expect(shp.title).toMatch(/SIRGAS 2000 \/ UTM.*\.prj/);
    fireEvent.click(shp);
    expect(t.exportar).toHaveBeenLastCalledWith('shp', expect.objectContaining({ lotes }));
  });

  it('mancha de inundação: sem cota, a faixa do terreno; com cota, área e lâmina', () => {
    const i = inundacao();
    const { rerender } = render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia={false} inundacao={i} />);
    const s = screen.getByTestId('topografia-inundacao');
    expect(s.textContent).toMatch(/vai de 100,00 a 103,00 m/);
    fireEvent.change(within(s).getByLabelText('Cota de cheia (m)'), { target: { value: '101.2' } });
    expect(i.onCotaM).toHaveBeenCalledWith(101.2);
    rerender(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia={false} inundacao={inundacao({ cotaM: 101.2, areaM2: 42, laminaMaxM: 1.15 })} />);
    const s2 = screen.getByTestId('topografia-inundacao');
    expect(s2.textContent).toContain('42,00 m²');
    expect(s2.textContent).toContain('1,15 m');
    expect(s2.textContent).toMatch(/Não é modelo hidráulico/);
  });

  it('"DEM do arquivo" só aparece como botão quando é a fonte ativa', () => {
    const { unmount } = render(<PainelTopografia topografia={hook({ selecionada: null, versoes: [] })} temLoteFechado temGeorreferencia={false} />);
    expect(screen.queryByRole('button', { name: 'DEM do arquivo' })).toBeNull();
    unmount();
    render(
      <PainelTopografia
        topografia={hook({ selecionada: null, versoes: [], fonteCodigo: 'DEM_ARQUIVO' as CodigoDaFonte, fonte: fonteDeElevacao('DEM_ARQUIVO') })}
        temLoteFechado
        temGeorreferencia={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'DEM do arquivo' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('o importador aceita KMZ, Shapefile (.zip) e GeoTIFF', () => {
    render(<PainelTopografia topografia={hook({ selecionada: null, versoes: [] })} temLoteFechado temGeorreferencia={false} />);
    const input = screen.getByLabelText('Arquivo de pontos cotados') as HTMLInputElement;
    for (const e of ['.kmz', '.zip', '.tif', '.tiff']) expect(input.accept).toContain(e);
  });
});
