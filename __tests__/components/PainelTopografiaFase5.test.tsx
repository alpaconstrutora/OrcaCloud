// @vitest-environment jsdom
/**
 * Fase 5 no painel: várias linhas desenhadas do perfil — seletor, apagar a
 * escolhida, e o texto da concordância nos cantos.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia, { type PerfilNoPainel } from '../../components/blueprint/PainelTopografia';
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
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5, modoNiveis: 'EQUIDISTANCIA', setModoNiveis: vi.fn(), numeroDeNiveis: 7, setNumeroDeNiveis: vi.fn(), niveisTexto: '', setNiveisTexto: vi.fn(), areaDasCurvas: 'LOTE', setAreaDasCurvas: vi.fn(),
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [VERSAO], selecionada: VERSAO, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
  };
}

function perfil(extra: Partial<PerfilNoPainel> = {}): PerfilNoPainel {
  return {
    origem: 'LINHA', onOrigem: vi.fn(), linhas: 3, linhaIndice: 1, onLinha: vi.fn(), onTracarLinha: vi.fn(), onApagarLinha: vi.fn(),
    cortes: [], corteId: '', onCorte: vi.fn(),
    pontos: [],
    estatisticas: {
      comprimentoM: 24, cotaInicioM: 100, cotaFimM: 102.4, cotaMinM: 100, cotaMaxM: 102.4, desnivelM: 2.4,
      subidaM: 2.4, descidaM: 0, declividadeMediaP: 10, declividadeMaxP: 14.2, pontosSemCota: 0,
    },
    svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    onExportar: vi.fn(),
    ...extra,
  };
}

describe('PainelTopografia · fase 5', () => {
  it('com várias linhas: seletor numerado, troca e apaga a escolhida', () => {
    const p = perfil();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia perfil={p} />);
    const seletor = screen.getByLabelText('Linha desenhada ao longo da qual o perfil é traçado') as HTMLSelectElement;
    expect(seletor.value).toBe('1');
    expect(seletor.options.length).toBe(3);
    fireEvent.change(seletor, { target: { value: '2' } });
    expect(p.onLinha).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar linha 2' }));
    expect(p.onApagarLinha).toHaveBeenCalled();
  });

  it('com uma linha só não há seletor, e na origem CORTE também não', () => {
    const { rerender } = render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia perfil={perfil({ linhas: 1, linhaIndice: 0 })} />);
    expect(screen.queryByLabelText('Linha desenhada ao longo da qual o perfil é traçado')).toBeNull();
    expect(screen.getByRole('button', { name: 'Apagar linha' })).toBeTruthy();
    rerender(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia perfil={perfil({ origem: 'CORTE', cortes: [{ id: 'c1', rotulo: 'A' }], corteId: 'c1' })} />);
    expect(screen.queryByLabelText('Linha desenhada ao longo da qual o perfil é traçado')).toBeNull();
    expect(screen.getByLabelText('Corte ao longo do qual o perfil é traçado')).toBeTruthy();
  });
});
