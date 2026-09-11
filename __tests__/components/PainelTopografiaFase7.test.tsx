// @vitest-environment jsdom
/**
 * Fase 7 no painel: chuva de projeto e seção por linha de drenagem; hipóteses
 * e pré-dimensionamento do muro.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia, {
  type DrenagemNoPainel,
  type TerraplenagemNoPainel,
} from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';
import { ESTRUTURA_PADRAO, HIDRAULICA_PADRAO } from '../../utils/blueprintTopografiaDimensionamento';

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
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5,
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [VERSAO], selecionada: VERSAO, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
  };
}

function drenagem(): DrenagemNoPainel {
  const pontos = [{ x: 0, y: 0 }, { x: 10000, y: 0 }];
  return {
    linhas: [{ id: 'a', nome: 'Canaleta 1', tipo: 'CANALETA', pontos, areaContribuinteM2: null }],
    analises: {
      a: { id: 'a', comprimentoM: 10, pontos: [], cotaInicioM: 101, cotaFimM: 101, caimentoMedioP: 0, contraCaimentoM: 0, caimentoMinP: 0.5, quedaDeExecucaoM: 0.05, profundidadeMaxM: 0.05, profundidadeNaSaidaM: 0.05, profundidadeLimiteM: 0.6, atende: true, desague: { x: 10000, y: 0, cotaM: 101 }, pontosSemCota: 0 },
    },
    ativa: null, onAtiva: vi.fn(), onTracar: vi.fn(), temPlato: true, onGerarDoPlato: vi.fn(), onAlterar: vi.fn(), onRemover: vi.fn(),
    caimentoMinPct: 0.5, onCaimentoMin: vi.fn(),
    dimensionamentos: {
      a: { id: 'a', areaContribuinteM2: 250, tempoDeConcentracaoMin: 10, intensidadeMmH: 147, vazaoM3s: 0.0092, declividadeP: 0.5, secao: { forma: 'RETANGULAR', larguraM: 0.2, alturaM: 0.2, rotulo: '20 × 20 cm' }, capacidadeM3s: 0.027, ocupacao: 0.34, velocidadeMs: 0.75, atende: true, avisos: [] },
    },
    areasSugeridasM2: { a: 250 },
    hidraulica: HIDRAULICA_PADRAO,
    onHidraulica: vi.fn(),
  };
}

function terraplenagem(): TerraplenagemNoPainel {
  const parametros = { taludeCorteH: 1.5, taludeAterroH: 1.5, empolamentoPct: 25, contracaoPct: 15, alturaDoLanceM: 6, larguraDaBanquetaM: 2, larguraDaViaM: 0, taludePorAresta: [null, { muro: true }], caimentoMinPct: 0.5 };
  return {
    base: 'LOTE', onBase: vi.fn(), temEnvelope: false, cotaPlatoM: 100, onCotaPlatoM: vi.fn(), cotaDeEquilibrioM: 101,
    resultado: {
      cotaPlatoM: 100, corteM3: 10, aterroM3: 5, saldoM3: 5, areaPlatoM2: 400, alturaMaxCorteM: 1, alturaMaxAterroM: 0.5,
      ladoDaCelula: [], deltaDaCelulaM: [], celulasSemCota: 0, parametros,
      taludeCorteM3: 2, taludeAterroM3: 1, areaTaludeM2: 30, corteTotalM3: 12, aterroTotalM3: 6,
      corteSoltoM3: 15, aterroEmBancoM3: 6.9, saldoEmBancoM3: 5.1, botaForaM3: 5.1, emprestimoM3: 0,
      areaViaM2: 0, areaBanquetasM2: 0, canaletaPeDeCorteM: 10, canaletaCristaDeAterroM: 0, canaletaDeBanquetaM: 0,
      muros: [{ aresta: 1, a: { x: 0, y: 0 }, b: { x: 0, y: 20000 }, normal: { x: 1, y: 0 }, comprimentoM: 20, alturaMaxCorteM: 2.5, alturaMaxAterroM: 0, alturaMediaM: 1.5, areaDeFaceM2: 30, lado: 'CORTE' }],
      murosComprimentoM: 20, murosAreaDeFaceM2: 30,
    },
    parametros, onParametros: vi.fn(), arestasM: [20, 20, 20, 20],
    murosDimensionados: [{ aresta: 1, tipo: 'GRAVIDADE', alturaM: 3, baseM: 1.8, topoM: 0.3, sapataM: null, empuxoKNm: 37, fsTombamento: 2.4, fsDeslizamento: 1.7, tensaoMaxKPa: 95, atende: true, areaDaSecaoM2: 3.15, volumeDeConcretoM3: 63, armaduraKg: 0, barbacas: 28, drenoDePeM: 20, avisos: [] }],
    estrutura: ESTRUTURA_PADRAO,
    onEstrutura: vi.fn(),
    persistenciaIndisponivel: false,
  };
}

describe('PainelTopografia · fase 7', () => {
  it('drenagem: chuva de projeto editável, área contribuinte (sugerida como placeholder) e a seção escolhida', () => {
    const d = drenagem();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia drenagem={d} />);
    expect(screen.getByTestId('chuva-de-projeto')).toBeTruthy();
    // "147 mm/h" aparece no cabeçalho da chuva E na linha (i por linha, fase 8).
    expect(screen.getByTestId('chuva-de-projeto').textContent).toMatch(/147 mm\/h/);
    fireEvent.change(screen.getByLabelText('Coeficiente C'), { target: { value: '0.7' } });
    expect(d.onHidraulica).toHaveBeenCalledWith({ coeficienteDeEscoamento: 0.7 });
    fireEvent.change(screen.getByLabelText('Intensidade da chuva (mm/h)'), { target: { value: '120' } });
    expect(d.onHidraulica).toHaveBeenCalledWith({ intensidadeMmH: 120 });

    const area = screen.getByLabelText('Área contribuinte da linha Canaleta 1 (m²)') as HTMLInputElement;
    expect(area.value).toBe('');
    expect(area.placeholder).toBe('250');
    fireEvent.change(area, { target: { value: '400' } });
    expect(d.onAlterar).toHaveBeenCalledWith('a', { areaContribuinteM2: 400 });
    expect(screen.getByText('20 × 20 cm')).toBeTruthy();
    expect(screen.getByText(/Q 9,2 L\/s · 0,50 % · ocupação 34 % · v 0,75 m\/s/)).toBeTruthy();
    expect(screen.getByText(/área sugerida pela grade/)).toBeTruthy();
  });

  it('muro: hipóteses editáveis e o pré-dimensionamento com verificações e quantitativos', () => {
    const t = terraplenagem();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia terraplenagem={t} />);
    expect(screen.getByTestId('hipoteses-do-muro')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tipo de muro'), { target: { value: 'FLEXAO' } });
    expect(t.onEstrutura).toHaveBeenCalledWith({ tipo: 'FLEXAO' });
    fireEvent.change(screen.getByLabelText('Sobrecarga'), { target: { value: '20' } });
    expect(t.onEstrutura).toHaveBeenCalledWith({ sobrecargaKNm2: 20 });
    const dim = screen.getByTestId('muro-dimensionado');
    expect(dim.textContent).toMatch(/Fecha/);
    expect(dim.textContent).toMatch(/gravidade · H 3,00 m · base 1,80 m · topo 0,30 m/);
    expect(dim.textContent).toMatch(/FS tomb\. 2,40 · FS desl\. 1,70 · σ 95 kPa/);
    expect(dim.textContent).toMatch(/concreto 63,0 m³/);
    expect(dim.textContent).toMatch(/28 barbacãs/);
    expect(screen.getByText('Concreto dos muros')).toBeTruthy();
  });
});
