// @vitest-environment jsdom
/**
 * As seções da fase 2 no painel de curvas de nível: curva clicada, legenda de
 * declividade, corte e aterro, e os botões KML/DXF.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia, { type TerraplenagemNoPainel } from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';
import type { Declividade } from '../../utils/blueprintTopografiaAnalises';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

function versao(extra: Partial<BlueprintTopografiaRow> = {}): BlueprintTopografiaRow {
  return {
    id: 'v1',
    study_id: 's1',
    organization_id: 'o1',
    versao: 1,
    fonte_codigo: 'PONTOS_COTADOS',
    fonte_nome: 'Pontos cotados do levantamento',
    dataset_versao: 'informado pelo usuário',
    resolucao_fonte_m: null,
    referencia_vertical: null,
    classe_qualidade: 'LEVANTAMENTO_IMPORTADO',
    grade: { origem: { x: 0, y: 0 }, espacamentoMm: 500, colunas: 2, linhas: 2, cotasM: [1, 1, 1, 1] },
    equidistancia_m: 0.5,
    curvas: [],
    estatisticas: {
      cotaMinM: 100, cotaMaxM: 103, cotaMediaM: 101.5, amplitudeM: 3, amostrasValidas: 40,
      amostrasAusentes: 0, amostrasNoLote: 40, areaM2: 400, espacamentoM: 0.5, curvas: 6, comprimentoDasCurvasM: 120,
    },
    pontos_cotados: [],
    anel: [],
    georreferencia: null,
    algoritmo_nome: 'opura-curvas-de-nivel',
    algoritmo_versao: '1.0.0',
    hash_entrada: 'e'.repeat(64),
    hash_resultado: 'abcdef0123456789abcdef',
    avisos: [],
    created_by: null,
    created_at: '2026-09-10T12:00:00Z',
    ...extra,
  };
}

function hook(extra: Partial<Topografia> = {}): Topografia {
  const v = versao(extra.selecionada ? {} : {});
  return {
    fontes: FONTES, fonteCodigo: 'PONTOS_COTADOS', setFonteCodigo: vi.fn(), fonte: fonteDeElevacao('PONTOS_COTADOS'),
    pontosCotados: [], adicionarPonto: vi.fn(), alterarPonto: vi.fn(), removerPonto: vi.fn(), usarVerticesDoLote: vi.fn(),
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5,
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [v], selecionada: v, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
    ...extra,
  };
}

const DECLIVIDADE: Declividade = {
  celulasP: [], faixaDaCelula: [], areaPorFaixaM2: [100, 200, 50, 50], areaAnalisadaM2: 400, mediaP: 8.5, maximaP: 42,
};

function terraplenagem(extra: Partial<TerraplenagemNoPainel> = {}): TerraplenagemNoPainel {
  return {
    base: 'ENVELOPE', onBase: vi.fn(), temEnvelope: true, cotaPlatoM: null, onCotaPlatoM: vi.fn(),
    cotaDeEquilibrioM: 101.5,
    resultado: {
      cotaPlatoM: 101.5, corteM3: 120.4, aterroM3: 120.4, saldoM3: 0, areaPlatoM2: 300, alturaMaxCorteM: 1.2,
      alturaMaxAterroM: 0.9, ladoDaCelula: [], deltaDaCelulaM: [], celulasSemCota: 0,
    },
    persistenciaIndisponivel: false,
    ...extra,
  };
}

describe('PainelTopografia · fase 2', () => {
  it('a curva clicada aparece com cota e comprimento, e Limpar chama o callback', () => {
    const onLimpar = vi.fn();
    render(
      <PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia curvaSelecionada={{ cotaM: 102.5, comprimentoM: 18.34, mestra: true }} onLimparCurva={onLimpar} />,
    );
    expect(screen.getByText(/Curva mestra/)).toBeTruthy();
    expect(screen.getByText('102,50 m')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(onLimpar).toHaveBeenCalled();
  });

  it('a legenda de declividade lista as quatro faixas com área e percentual', () => {
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia declividade={DECLIVIDADE} />);
    expect(screen.getByText('0–5 %')).toBeTruthy();
    expect(screen.getByText('> 30 %')).toBeTruthy();
    expect(screen.getByText('200,00 m²')).toBeTruthy();
    expect(screen.getByText('(50 %)')).toBeTruthy();
    expect(screen.getByText(/máxima 42,0 %/)).toBeTruthy();
  });

  it('corte e aterro: base, cota com equilíbrio como placeholder e volumes', () => {
    const t = terraplenagem();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia terraplenagem={t} />);
    expect(screen.getByRole('button', { name: 'No lote inteiro' })).toBeTruthy();
    const cota = screen.getByLabelText('Cota do platô (m)') as HTMLInputElement;
    expect(cota.placeholder).toBe('101,50');
    fireEvent.change(cota, { target: { value: '103' } });
    expect(t.onCotaPlatoM).toHaveBeenCalledWith(103);
    expect(screen.getAllByText('120,4 m³')).toHaveLength(2);
    expect(screen.getByText(/sem talude/)).toBeTruthy();
  });

  it('sem envelope válido, avisa que o platô usa o lote', () => {
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia terraplenagem={terraplenagem({ temEnvelope: false })} />);
    expect(screen.getByText(/usa o lote inteiro/)).toBeTruthy();
  });

  it('KML fica desabilitado sem georreferência e explica; DXF exporta', () => {
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    const kml = screen.getByRole('button', { name: 'KML' }) as HTMLButtonElement;
    expect(kml.disabled).toBe(true);
    expect(kml.title).toMatch(/Onde fica/);
    fireEvent.click(screen.getByRole('button', { name: 'DXF' }));
    expect(t.exportar).toHaveBeenCalledWith('dxf');
  });

  it('KML habilitado quando a versão tem georreferência', () => {
    const v = versao({ georreferencia: { latitude: -22, longitude: -46 } });
    const t = hook({ versoes: [v], selecionada: v });
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia />);
    fireEvent.click(screen.getByRole('button', { name: 'KML' }));
    expect(t.exportar).toHaveBeenCalledWith('kml');
  });
});
