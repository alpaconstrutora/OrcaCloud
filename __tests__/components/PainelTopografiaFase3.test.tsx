// @vitest-environment jsdom
/**
 * Fase 3 no painel: parâmetros de talude/material, perfil altimétrico e
 * legenda hipsométrica.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia, {
  type PerfilNoPainel,
  type TerraplenagemNoPainel,
} from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';
import type { Hipsometria } from '../../utils/blueprintTopografiaAnalises';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

const VERSAO: BlueprintTopografiaRow = {
  id: 'v1', study_id: 's1', organization_id: 'o1', versao: 1, fonte_codigo: 'PONTOS_COTADOS',
  fonte_nome: 'Pontos cotados do levantamento', dataset_versao: 'x', resolucao_fonte_m: null, referencia_vertical: null,
  classe_qualidade: 'LEVANTAMENTO_IMPORTADO',
  grade: { origem: { x: 0, y: 0 }, espacamentoMm: 500, colunas: 2, linhas: 2, cotasM: [1, 1, 1, 1] },
  equidistancia_m: 0.5, curvas: [],
  estatisticas: { cotaMinM: 100, cotaMaxM: 103, cotaMediaM: 101.5, amplitudeM: 3, amostrasValidas: 40, amostrasAusentes: 0, amostrasNoLote: 40, areaM2: 400, espacamentoM: 0.5, curvas: 6, comprimentoDasCurvasM: 120 },
  pontos_cotados: [], anel: [], georreferencia: null, algoritmo_nome: 'a', algoritmo_versao: '1', hash_entrada: 'e', hash_resultado: 'abcdef012345', avisos: [], created_by: null, created_at: '2026-09-10T12:00:00Z',
};

function hook(): Topografia {
  return {
    fontes: FONTES, fonteCodigo: 'PONTOS_COTADOS', setFonteCodigo: vi.fn(), fonte: fonteDeElevacao('PONTOS_COTADOS'),
    pontosCotados: [], adicionarPonto: vi.fn(), alterarPonto: vi.fn(), removerPonto: vi.fn(), usarVerticesDoLote: vi.fn(),
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5, modoNiveis: 'EQUIDISTANCIA', setModoNiveis: vi.fn(), numeroDeNiveis: 7, setNumeroDeNiveis: vi.fn(), niveisTexto: '', setNiveisTexto: vi.fn(), areaDasCurvas: 'LOTE', setAreaDasCurvas: vi.fn(),
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [VERSAO], selecionada: VERSAO, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
  };
}

function terraplenagem(): TerraplenagemNoPainel {
  return {
    base: 'LOTE', onBase: vi.fn(), temEnvelope: false, cotaPlatoM: 101, onCotaPlatoM: vi.fn(), cotaDeEquilibrioM: 101.5,
    resultado: {
      cotaPlatoM: 101, corteM3: 50, aterroM3: 80, saldoM3: 30, areaPlatoM2: 300, alturaMaxCorteM: 1, alturaMaxAterroM: 1.2,
      ladoDaCelula: [], deltaDaCelulaM: [], celulasSemCota: 0,
      parametros: { taludeCorteH: 1.5, taludeAterroH: 2, empolamentoPct: 30, contracaoPct: 10 },
      taludeCorteM3: 12.5, taludeAterroM3: 20, areaTaludeM2: 60, corteTotalM3: 62.5, aterroTotalM3: 100,
      corteSoltoM3: 81.25, aterroEmBancoM3: 110, saldoEmBancoM3: -47.5, botaForaM3: 0, emprestimoM3: 47.5,
      areaViaM2: 0, areaBanquetasM2: 0, canaletaPeDeCorteM: 12, canaletaCristaDeAterroM: 8, canaletaDeBanquetaM: 0, muros: [], murosComprimentoM: 0, murosAreaDeFaceM2: 0,
    },
    parametros: { taludeCorteH: 1.5, taludeAterroH: 2, empolamentoPct: 30, contracaoPct: 10 },
    onParametros: vi.fn(),
    arestasM: [],
    persistenciaIndisponivel: false,
  };
}

const HIPSO: Hipsometria = {
  classeDaCelula: [], minM: 100, maxM: 104,
  classes: [
    { deM: 100, ateM: 102, cor: '#1a9850', areaM2: 300 },
    { deM: 102, ateM: 104, cor: '#d73027', areaM2: 100 },
  ],
};

function perfil(extra: Partial<PerfilNoPainel> = {}): PerfilNoPainel {
  return {
    origem: 'CORTE',
    onOrigem: vi.fn(),
    linhas: 0,
    linhaIndice: -1,
    onLinha: vi.fn(),
    onTracarLinha: vi.fn(),
    onApagarLinha: vi.fn(),
    cortes: [{ id: 'c1', rotulo: 'A' }, { id: 'c2', rotulo: 'B' }],
    corteId: 'c1',
    onCorte: vi.fn(),
    pontos: [],
    estatisticas: {
      comprimentoM: 24, cotaInicioM: 100, cotaFimM: 102.4, cotaMinM: 100, cotaMaxM: 102.4, desnivelM: 2.4,
      subidaM: 2.4, descidaM: 0, declividadeMediaP: 10, declividadeMaxP: 14.2, pontosSemCota: 3,
    },
    svg: '<svg xmlns="http://www.w3.org/2000/svg" data-testid="grafico-perfil"></svg>',
    onExportar: vi.fn(),
    ...extra,
  };
}

describe('PainelTopografia · fase 3', () => {
  it('talude e material: quatro parâmetros editáveis e o balanço com empréstimo', () => {
    const t = terraplenagem();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia terraplenagem={t} />);
    const empolamento = screen.getByLabelText('Empolamento') as HTMLInputElement;
    expect(empolamento.value).toBe('30');
    fireEvent.change(empolamento, { target: { value: '35' } });
    expect(t.onParametros).toHaveBeenCalledWith({ empolamentoPct: 35 });
    fireEvent.change(screen.getByLabelText('Talude corte 1:'), { target: { value: '1' } });
    expect(t.onParametros).toHaveBeenCalledWith({ taludeCorteH: 1 });
    expect(screen.getByText('Talude de corte')).toBeTruthy();
    expect(screen.getByText('81,3 m³')).toBeTruthy(); // solto
    expect(screen.getByText('Empréstimo')).toBeTruthy();
    expect(screen.getByText('47,5 m³')).toBeTruthy();
    expect(screen.getByText(/pré-dimensionamento com hipóteses declaradas/)).toBeTruthy();
  });

  it('parâmetro abaixo do mínimo é ignorado', () => {
    const t = terraplenagem();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia terraplenagem={t} />);
    fireEvent.change(screen.getByLabelText('Talude corte 1:'), { target: { value: '0' } });
    expect(t.onParametros).not.toHaveBeenCalledWith({ taludeCorteH: 0 });
  });

  it('perfil: escolhe o corte, mostra gráfico, estatísticas, aviso de nodata e exporta', () => {
    const p = perfil();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia perfil={p} />);
    fireEvent.change(screen.getByLabelText('Corte ao longo do qual o perfil é traçado'), { target: { value: 'c2' } });
    expect(p.onCorte).toHaveBeenCalledWith('c2');
    // O gráfico vai como IMAGEM (data URL), não como HTML injetado — o build
    // recusa sink de HTML sem sanitização.
    const img = screen.getByAltText('Perfil altimétrico') as HTMLImageElement;
    expect(img.src.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(img.src)).toContain('grafico-perfil');
    expect(screen.getByText('+2,40 m')).toBeTruthy();
    expect(screen.getByText('10,0 %')).toBeTruthy();
    expect(screen.getByText(/3 pontos da linha fora da grade/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'CSV do perfil' }));
    expect(p.onExportar).toHaveBeenCalledWith('csv');
  });

  it('sem corte, o perfil ensina a traçar um', () => {
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia perfil={perfil({ cortes: [], corteId: '', pontos: null, estatisticas: null, svg: null })} />);
    expect(screen.getByText(/Sem corte no desenho/)).toBeTruthy();
  });

  it('legenda hipsométrica: classes do topo para o vale, com área e percentual', () => {
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia hipsometria={HIPSO} />);
    expect(screen.getByText('102,0–104,0 m')).toBeTruthy();
    expect(screen.getByText('(75 %)')).toBeTruthy();
    expect(screen.getByText(/de 100,00 a 104,00 m/)).toBeTruthy();
  });
});
