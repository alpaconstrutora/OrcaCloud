// @vitest-environment jsdom
/**
 * Fase 6 no painel: muro por lado (checkbox que desliga os h), a lista de
 * muros com altura e face, e a seção Drenagem com as linhas analisadas.
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

function terraplenagem(): TerraplenagemNoPainel {
  const parametros = {
    taludeCorteH: 1.5, taludeAterroH: 1.5, empolamentoPct: 25, contracaoPct: 15,
    alturaDoLanceM: 6, larguraDaBanquetaM: 2, larguraDaViaM: 0, taludePorAresta: [null, { muro: true }], caimentoMinPct: 0.5,
  };
  return {
    base: 'LOTE', onBase: vi.fn(), temEnvelope: false, cotaPlatoM: 100, onCotaPlatoM: vi.fn(), cotaDeEquilibrioM: 101,
    resultado: {
      cotaPlatoM: 100, corteM3: 10, aterroM3: 5, saldoM3: 5, areaPlatoM2: 400, alturaMaxCorteM: 1, alturaMaxAterroM: 0.5,
      ladoDaCelula: [], deltaDaCelulaM: [], celulasSemCota: 0, parametros,
      taludeCorteM3: 2, taludeAterroM3: 1, areaTaludeM2: 30, corteTotalM3: 12, aterroTotalM3: 6,
      corteSoltoM3: 15, aterroEmBancoM3: 6.9, saldoEmBancoM3: 5.1, botaForaM3: 5.1, emprestimoM3: 0,
      areaViaM2: 0, areaBanquetasM2: 0, canaletaPeDeCorteM: 10, canaletaCristaDeAterroM: 0, canaletaDeBanquetaM: 0,
      muros: [
        { aresta: 1, a: { x: 0, y: 0 }, b: { x: 0, y: 20000 }, normal: { x: 1, y: 0 }, comprimentoM: 20, alturaMaxCorteM: 3.2, alturaMaxAterroM: 0, alturaMediaM: 2.1, areaDeFaceM2: 42, lado: 'CORTE' },
      ],
      murosComprimentoM: 20,
      murosAreaDeFaceM2: 42,
    },
    parametros,
    onParametros: vi.fn(),
    arestasM: [20, 20, 20, 20],
    persistenciaIndisponivel: false,
  };
}

function drenagem(extra: Partial<DrenagemNoPainel> = {}): DrenagemNoPainel {
  const pontos = [{ x: 0, y: 0 }, { x: 10000, y: 0 }];
  return {
    linhas: [
      { id: 'a', nome: 'Pé de corte · lado 1', tipo: 'CANALETA', pontos },
      { id: 'b', nome: 'Descida', tipo: 'DESCIDA', pontos },
    ],
    analises: {
      a: { id: 'a', comprimentoM: 10, pontos: [], cotaInicioM: 101.2, cotaFimM: 100.9, caimentoMedioP: 3, contraCaimentoM: 0, caimentoMinP: 0.5, quedaDeExecucaoM: 0.3, profundidadeMaxM: 0, profundidadeNaSaidaM: 0, profundidadeLimiteM: 0.6, atende: true, desague: { x: 10000, y: 0, cotaM: 100.9 }, pontosSemCota: 0 },
      b: { id: 'b', comprimentoM: 10, pontos: [], cotaInicioM: 100, cotaFimM: 100.4, caimentoMedioP: -4, contraCaimentoM: 6.5, caimentoMinP: 0.5, quedaDeExecucaoM: 0.05, profundidadeMaxM: 0.45, profundidadeNaSaidaM: 0.45, profundidadeLimiteM: 0.6, atende: false, desague: { x: 10000, y: 0, cotaM: 100.4 }, pontosSemCota: 0 },
    },
    ativa: 'a',
    onAtiva: vi.fn(),
    onTracar: vi.fn(),
    temPlato: true,
    onGerarDoPlato: vi.fn(),
    onAlterar: vi.fn(),
    onRemover: vi.fn(),
    caimentoMinPct: 0.5,
    onCaimentoMin: vi.fn(),
    ...extra,
  };
}

describe('PainelTopografia · fase 6', () => {
  it('muro por lado: o checkbox grava `muro`, desliga os h do lado e a lista de muros aparece', () => {
    const t = terraplenagem();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia terraplenagem={t} />);
    const lado2 = screen.getByLabelText('Muro de arrimo no lado 2') as HTMLInputElement;
    expect(lado2.checked).toBe(true);
    expect((screen.getByLabelText('Talude de corte do lado 2') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Talude de corte do lado 1') as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Muro de arrimo no lado 3'));
    expect(t.onParametros).toHaveBeenCalledWith({ taludePorAresta: [null, { muro: true }, { muro: true }, null] });

    expect(screen.getByTestId('muros-de-arrimo')).toBeTruthy();
    expect(screen.getByText(/contém o terreno · h máx\. 3,20 m/)).toBeTruthy();
    expect(screen.getByText('face 42,00 m²')).toBeTruthy();
    expect(screen.getByText('Muros (total)')).toBeTruthy();
    // "20,0 m" aparece na linha do muro E no total.
    expect(screen.getAllByText('20,0 m').length).toBeGreaterThanOrEqual(2);
  });

  it('drenagem: lista com veredito, caimento e contra-caimento; gestos de traçar, gerar, alterar e apagar', () => {
    const d = drenagem();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia drenagem={d} />);
    const linhas = screen.getAllByTestId('linha-de-drenagem');
    expect(linhas).toHaveLength(2);
    expect(screen.getByText('Escoa')).toBeTruthy();
    expect(screen.getByText('Não escoa')).toBeTruthy();
    expect(screen.getByText(/6,5 m com a superfície subindo/)).toBeTruthy();
    expect(screen.getByText(/superfície 3,00 %/)).toBeTruthy();
    expect(screen.getByText(/profundidade máx\. 0,45 m \(limite 0,6 m\)/)).toBeTruthy();
    expect(screen.getByText(/deságue a 100,90 m/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Traçar canaleta' }));
    expect(d.onTracar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar canaletas do platô' }));
    expect(d.onGerarDoPlato).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Tipo da linha de drenagem Descida'), { target: { value: 'TUBO' } });
    expect(d.onAlterar).toHaveBeenCalledWith('b', { tipo: 'TUBO' });
    fireEvent.change(screen.getByLabelText('Nome da linha de drenagem Descida'), { target: { value: 'Descida 2' } });
    expect(d.onAlterar).toHaveBeenCalledWith('b', { nome: 'Descida 2' });
    fireEvent.click(screen.getByLabelText('Apagar a linha de drenagem Descida'));
    expect(d.onRemover).toHaveBeenCalledWith('b');
    fireEvent.change(screen.getByLabelText('Caimento mínimo das canaletas (%)'), { target: { value: '1' } });
    expect(d.onCaimentoMin).toHaveBeenCalledWith(1);
  });

  it('sem platô, "Gerar canaletas do platô" fica desabilitado; sem linhas, diz que não há', () => {
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia drenagem={drenagem({ linhas: [], analises: {}, temPlato: false })} />);
    expect((screen.getByRole('button', { name: 'Gerar canaletas do platô' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Nenhuma linha de drenagem ainda.')).toBeTruthy();
  });
});
