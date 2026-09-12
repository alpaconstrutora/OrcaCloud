// @vitest-environment jsdom
/**
 * Fase 13 no painel: o quarto modo de níveis, "Intervalo" (passo a partir do
 * mínimo), com o seu campo, a ajuda e a estatística da versão.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
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
    definirPontosCotados: vi.fn(), origemDosPontos: null, anelDoLote: LOTE, georreferencia: null,
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5,
    modoNiveis: 'EQUIDISTANCIA', setModoNiveis: vi.fn(), numeroDeNiveis: 7, setNumeroDeNiveis: vi.fn(), niveisTexto: '', setNiveisTexto: vi.fn(),
    areaDasCurvas: 'LOTE', setAreaDasCurvas: vi.fn(),
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [], selecionada: null, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
    ...extra,
  };
}

const VERSAO: BlueprintTopografiaRow = {
  id: 'v1', study_id: 's1', organization_id: 'o1', versao: 1, fonte_codigo: 'PONTOS_COTADOS',
  fonte_nome: 'Pontos cotados do levantamento', dataset_versao: 'x', resolucao_fonte_m: null, referencia_vertical: null,
  classe_qualidade: 'LEVANTAMENTO_IMPORTADO',
  grade: { origem: { x: 0, y: 0 }, espacamentoMm: 500, colunas: 2, linhas: 2, cotasM: [1, 1, 1, 1] },
  equidistancia_m: 0.5, modo_niveis: 'INTERVALO', niveis_m: [100.82, 101.32, 101.82], curvas: [],
  estatisticas: { cotaMinM: 100.32, cotaMaxM: 102.27, cotaMediaM: 101.3, amplitudeM: 1.95, amostrasValidas: 40, amostrasAusentes: 0, amostrasNoLote: 40, areaM2: 360, espacamentoM: 0.5, curvas: 3, comprimentoDasCurvasM: 90 },
  pontos_cotados: [], anel: [], georreferencia: null, algoritmo_nome: 'a', algoritmo_versao: '1', hash_entrada: 'e', hash_resultado: 'abcdef012345', avisos: [], created_by: null, created_at: '2026-09-12T12:00:00Z',
};

describe('PainelTopografia · fase 13 (modo Intervalo)', () => {
  it('o toggle tem o quarto botão e ele chama setModoNiveis("INTERVALO")', () => {
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    const toggle = screen.getByTestId('modo-de-niveis');
    expect(toggle.querySelectorAll('button')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Intervalo' }));
    expect(t.setModoNiveis).toHaveBeenCalledWith('INTERVALO');
    expect(screen.queryByLabelText('Intervalo a partir do mínimo (m)')).toBeNull();
  });

  it('no modo Intervalo aparece o campo do passo (o mesmo estado da equidistância) e a ajuda; o da equidistância some', () => {
    const t = hook({ modoNiveis: 'INTERVALO' });
    const { rerender } = render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    expect(screen.queryByLabelText('Equidistância entre curvas (m)')).toBeNull();
    const campo = screen.getByLabelText('Intervalo a partir do mínimo (m)') as HTMLInputElement;
    expect(campo.value).toBe('');
    expect(campo.placeholder).toBe('0,50');
    expect(screen.getByText(/a partir da cota mínima do terreno/)).toBeTruthy();
    expect(screen.getByText(/Vazio usa 0,50 m/)).toBeTruthy();
    fireEvent.change(campo, { target: { value: '0.25' } });
    expect(t.setEquidistanciaM).toHaveBeenCalledWith(0.25);

    const t2 = hook({ modoNiveis: 'INTERVALO', equidistanciaM: 1 });
    rerender(<PainelTopografia topografia={t2} temLoteFechado temGeorreferencia={false} />);
    expect((screen.getByLabelText('Intervalo a partir do mínimo (m)') as HTMLInputElement).value).toBe('1');
    expect(screen.queryByText(/Vazio usa/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Intervalo a partir do mínimo (m)'), { target: { value: '' } });
    expect(t2.setEquidistanciaM).toHaveBeenCalledWith(null);
  });

  it('a versão gerada por intervalo diz "X m do mínimo"', () => {
    render(<PainelTopografia topografia={hook({ versoes: [VERSAO], selecionada: VERSAO })} temLoteFechado temGeorreferencia={false} />);
    const res = screen.getByTestId('topografia-resultado').textContent!.replace(/\s+/g, ' ');
    expect(res).toMatch(/Curvas\s*3 · 0,50 m do mínimo/);
  });
});
