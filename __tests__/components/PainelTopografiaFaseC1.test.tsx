// @vitest-environment jsdom
/**
 * C1 no painel: o platô inclinado (toggle + três campos) e o relatório
 * "Volume entre versões" — a medição da terraplenagem executada, que só
 * aparece com duas versões e DIZ quando as malhas não batem.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia, { type TerraplenagemNoPainel } from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

/** 3 × 3 nós a 1 m: quatro células de 1 m² cada. */
function versao(id: string, n: number, cota: number, extra: Partial<BlueprintTopografiaRow> = {}): BlueprintTopografiaRow {
  return {
    id, study_id: 's1', organization_id: 'o1', versao: n, fonte_codigo: 'PONTOS_COTADOS',
    fonte_nome: 'Pontos cotados do levantamento', dataset_versao: 'x', resolucao_fonte_m: null, referencia_vertical: null,
    classe_qualidade: 'LEVANTAMENTO_IMPORTADO',
    grade: { origem: { x: 0, y: 0 }, espacamentoMm: 1000, colunas: 3, linhas: 3, cotasM: Array(9).fill(cota) },
    equidistancia_m: 0.5, curvas: [],
    estatisticas: { cotaMinM: cota, cotaMaxM: cota, cotaMediaM: cota, amplitudeM: 0, amostrasValidas: 9, amostrasAusentes: 0, amostrasNoLote: 9, areaM2: 4, espacamentoM: 1, curvas: 0, comprimentoDasCurvasM: 0 },
    pontos_cotados: [], linhas_de_quebra: [], tin_importada: null, anel: [], georreferencia: null, algoritmo_nome: 'a', algoritmo_versao: '1', hash_entrada: 'e', hash_resultado: `h${n}`, avisos: [], created_by: null, created_at: `2026-09-1${n}T12:00:00Z`,
    ...extra,
  };
}

function hook(versoes: BlueprintTopografiaRow[]): Topografia {
  return {
    fontes: FONTES, fonteCodigo: 'PONTOS_COTADOS', setFonteCodigo: vi.fn(), fonte: fonteDeElevacao('PONTOS_COTADOS'),
    pontosCotados: [], adicionarPonto: vi.fn(), alterarPonto: vi.fn(), removerPonto: vi.fn(), usarVerticesDoLote: vi.fn(), linhasDeQuebra: [], tinImportada: null, limparQuebrasETin: vi.fn(),
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5, modoNiveis: 'EQUIDISTANCIA', setModoNiveis: vi.fn(), numeroDeNiveis: 7, setNumeroDeNiveis: vi.fn(), niveisTexto: '', setNiveisTexto: vi.fn(), areaDasCurvas: 'LOTE', setAreaDasCurvas: vi.fn(),
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes, selecionada: versoes[0], selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
  };
}

function terraplenagem(extra: Partial<TerraplenagemNoPainel> = {}): TerraplenagemNoPainel {
  return {
    base: 'LOTE', onBase: vi.fn(), temEnvelope: false, cotaPlatoM: 101, onCotaPlatoM: vi.fn(), cotaDeEquilibrioM: 101.5,
    inclinacao: null, onInclinacao: vi.fn(),
    resultado: null,
    parametros: { taludeCorteH: 1.5, taludeAterroH: 2, empolamentoPct: 30, contracaoPct: 10 },
    onParametros: vi.fn(),
    arestasM: [],
    persistenciaIndisponivel: false,
    ...extra,
  };
}

describe('platô inclinado no painel', () => {
  it('desligado: só o toggle; ligar chama onInclinacao com um caimento de partida', () => {
    const t = terraplenagem();
    render(<PainelTopografia topografia={hook([versao('v1', 1, 100)])} temLoteFechado temGeorreferencia terraplenagem={t} />);
    const toggle = screen.getByLabelText('Platô inclinado') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByLabelText('Longitudinal')).toBeNull();
    fireEvent.click(toggle);
    expect(t.onInclinacao).toHaveBeenCalledWith({ declividadeLongPct: 1, declividadeTransvPct: 0, azimuteDeg: 0 });
  });

  it('ligado: três campos; editar um mantém os outros e o azimute é normalizado a [0, 360)', () => {
    const t = terraplenagem({ inclinacao: { declividadeLongPct: 2, declividadeTransvPct: 0.5, azimuteDeg: 90 } });
    render(<PainelTopografia topografia={hook([versao('v1', 1, 100)])} temLoteFechado temGeorreferencia terraplenagem={t} />);
    expect((screen.getByLabelText('Platô inclinado') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Longitudinal') as HTMLInputElement).value).toBe('2');
    fireEvent.change(screen.getByLabelText('Transversal'), { target: { value: '1.5' } });
    expect(t.onInclinacao).toHaveBeenLastCalledWith({ declividadeLongPct: 2, declividadeTransvPct: 1.5, azimuteDeg: 90 });
    fireEvent.change(screen.getByLabelText('Azimute'), { target: { value: '370' } });
    expect(t.onInclinacao).toHaveBeenLastCalledWith({ declividadeLongPct: 2, declividadeTransvPct: 0.5, azimuteDeg: 10 });
    // desligar zera
    fireEvent.click(screen.getByLabelText('Platô inclinado'));
    expect(t.onInclinacao).toHaveBeenLastCalledWith(null);
  });
});

describe('volume entre versões no painel', () => {
  it('com uma versão só, a seção não existe', () => {
    render(<PainelTopografia topografia={hook([versao('v1', 1, 100)])} temLoteFechado temGeorreferencia terraplenagem={terraplenagem()} />);
    expect(screen.queryByTestId('topografia-volume-entre-versoes')).toBeNull();
  });

  it('duas versões: antes = anterior, depois = selecionada; A → A+1 m dá 4 m³ de aterro', () => {
    const v2 = versao('v2', 2, 101);
    const v1 = versao('v1', 1, 100);
    render(<PainelTopografia topografia={hook([v2, v1])} temLoteFechado temGeorreferencia terraplenagem={terraplenagem()} />);
    const secao = screen.getByTestId('topografia-volume-entre-versoes');
    expect((screen.getByLabelText('Versão de antes') as HTMLSelectElement).value).toBe('v1');
    expect((screen.getByLabelText('Versão de depois') as HTMLSelectElement).value).toBe('v2');
    expect(secao.textContent).toContain('Aterro executado');
    expect(secao.textContent).toContain('4,0 m³');
    expect(secao.textContent).toContain('Corte executado');
    expect(secao.textContent).toContain('0,0 m³');
    // invertendo, vira corte
    fireEvent.change(screen.getByLabelText('Versão de antes'), { target: { value: 'v2' } });
    fireEvent.change(screen.getByLabelText('Versão de depois'), { target: { value: 'v1' } });
    expect(screen.getByTestId('topografia-volume-entre-versoes').textContent).toContain('Saldo (saiu)');
  });

  it('⚠️ malhas diferentes: o erro é DITO, sem número inventado', () => {
    const v2 = versao('v2', 2, 101, { grade: { origem: { x: 0, y: 0 }, espacamentoMm: 500, colunas: 5, linhas: 5, cotasM: Array(25).fill(101) } });
    const v1 = versao('v1', 1, 100);
    render(<PainelTopografia topografia={hook([v2, v1])} temLoteFechado temGeorreferencia terraplenagem={terraplenagem()} />);
    const secao = screen.getByTestId('topografia-volume-entre-versoes');
    expect(secao.textContent).toContain('mesma malha');
    expect(secao.textContent).not.toContain('Aterro executado');
  });
});
