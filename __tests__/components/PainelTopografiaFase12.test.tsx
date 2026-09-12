// @vitest-environment jsdom
/**
 * Fase 12 no painel: os modos de níveis (equidistância / nº de níveis / lista),
 * a área coberta, e a hipsometria "Arco-íris" com curvas coloridas, casas da
 * legenda e a legenda por nível — como no Contour Map Creator.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia, { type HipsometriaOpcoesNoPainel } from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';
import { corArcoIrisDaCota, type Hipsometria } from '../../utils/blueprintTopografiaAnalises';

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

const NIVEIS = [888.5, 891, 893.5, 896, 898.5, 901, 903.5];

const VERSAO: BlueprintTopografiaRow = {
  id: 'v1', study_id: 's1', organization_id: 'o1', versao: 1, fonte_codigo: 'PONTOS_COTADOS',
  fonte_nome: 'Pontos cotados do levantamento', dataset_versao: 'x', resolucao_fonte_m: null, referencia_vertical: null,
  classe_qualidade: 'LEVANTAMENTO_IMPORTADO',
  grade: { origem: { x: 0, y: 0 }, espacamentoMm: 500, colunas: 2, linhas: 2, cotasM: [1, 1, 1, 1] },
  equidistancia_m: 2.5, modo_niveis: 'NUMERO', niveis_m: NIVEIS, curvas: [],
  estatisticas: { cotaMinM: 886, cotaMaxM: 906, cotaMediaM: 896, amplitudeM: 20, amostrasValidas: 40, amostrasAusentes: 0, amostrasNoLote: 40, areaM2: 400, espacamentoM: 0.5, curvas: 7, comprimentoDasCurvasM: 120 },
  pontos_cotados: [], anel: [], georreferencia: null, algoritmo_nome: 'a', algoritmo_versao: '1', hash_entrada: 'e', hash_resultado: 'abcdef012345', avisos: [], created_by: null, created_at: '2026-09-10T12:00:00Z',
};

const HIPSO: Hipsometria = {
  classeDaCelula: [], minM: 886, maxM: 906,
  classes: [
    { deM: 886, ateM: 896, cor: '#0000ff', areaM2: 300 },
    { deM: 896, ateM: 906, cor: '#ff0000', areaM2: 100 },
  ],
};

function opcoes(extra: Partial<HipsometriaOpcoesNoPainel> = {}): HipsometriaOpcoesNoPainel {
  return {
    modo: 'CONTINUO', onModo: vi.fn(), intervaloM: null, intervaloEfetivoM: 0.5, onIntervalo: vi.fn(),
    niveis: NIVEIS, corDaCota: (c) => corArcoIrisDaCota(c, NIVEIS[0], NIVEIS[NIVEIS.length - 1]),
    curvasPelaCota: false, onCurvasPelaCota: vi.fn(), casas: 2, onCasas: vi.fn(),
    ...extra,
  };
}

describe('PainelTopografia · fase 12 (níveis e arco-íris)', () => {
  it('os três modos de níveis: o toggle chama setModoNiveis e cada modo mostra o seu campo', () => {
    const t = hook();
    const { rerender } = render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    const toggle = screen.getByTestId('modo-de-niveis');
    expect(toggle.textContent).toMatch(/Equidistância/);
    expect(toggle.textContent).toMatch(/Nº de níveis/);
    expect(toggle.textContent).toMatch(/Lista/);
    expect(screen.getByLabelText('Equidistância entre curvas (m)')).toBeTruthy();
    expect(screen.queryByLabelText('Número de níveis')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Nº de níveis' }));
    expect(t.setModoNiveis).toHaveBeenCalledWith('NUMERO');
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
    expect(t.setModoNiveis).toHaveBeenCalledWith('PERSONALIZADO');

    const t2 = hook({ modoNiveis: 'NUMERO' });
    rerender(<PainelTopografia topografia={t2} temLoteFechado temGeorreferencia={false} />);
    expect(screen.queryByLabelText('Equidistância entre curvas (m)')).toBeNull();
    const numero = screen.getByLabelText('Número de níveis') as HTMLInputElement;
    expect(numero.value).toBe('7');
    fireEvent.change(numero, { target: { value: '12' } });
    expect(t2.setNumeroDeNiveis).toHaveBeenCalledWith(12);
    fireEvent.change(numero, { target: { value: '999' } });
    expect(t2.setNumeroDeNiveis).toHaveBeenCalledWith(200);
    expect(screen.getByText(/7 cotas igualmente espaçadas/)).toBeTruthy();

    const t3 = hook({ modoNiveis: 'PERSONALIZADO', niveisTexto: '890' });
    rerender(<PainelTopografia topografia={t3} temLoteFechado temGeorreferencia={false} />);
    const lista = screen.getByLabelText('Níveis personalizados (m)') as HTMLInputElement;
    expect(lista.value).toBe('890');
    fireEvent.change(lista, { target: { value: '890, 895, 900' } });
    expect(t3.setNiveisTexto).toHaveBeenCalledWith('890, 895, 900');
    expect(screen.queryByLabelText('Número de níveis')).toBeNull();
  });

  it('área coberta pelas curvas: só o lote ou o retângulo inteiro', () => {
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    const area = screen.getByLabelText('Área coberta pelas curvas') as HTMLSelectElement;
    expect(area.value).toBe('LOTE');
    fireEvent.change(area, { target: { value: 'RETANGULO' } });
    expect(t.setAreaDasCurvas).toHaveBeenCalledWith('RETANGULO');
  });

  it('hipsometria "Arco-íris": curvas pela cota, casas da legenda e a legenda por nível na cor do nível', () => {
    const o = opcoes({ modo: 'IGUAIS' });
    const { rerender } = render(<PainelTopografia topografia={hook({ versoes: [VERSAO], selecionada: VERSAO })} temLoteFechado temGeorreferencia hipsometria={HIPSO} hipsometriaOpcoes={o} />);
    expect(screen.queryByTestId('hipsometria-arco-iris')).toBeNull();
    expect(screen.queryByTestId('legenda-por-nivel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Arco-íris' }));
    expect(o.onModo).toHaveBeenCalledWith('CONTINUO');

    const o2 = opcoes();
    rerender(<PainelTopografia topografia={hook({ versoes: [VERSAO], selecionada: VERSAO })} temLoteFechado temGeorreferencia hipsometria={HIPSO} hipsometriaOpcoes={o2} />);
    expect(screen.getByTestId('hipsometria-arco-iris')).toBeTruthy();
    expect(screen.getByText(/Contour Map Creator/)).toBeTruthy();
    const curvas = screen.getByLabelText('Curvas coloridas pela cota') as HTMLInputElement;
    expect(curvas.checked).toBe(false);
    fireEvent.click(curvas);
    expect(o2.onCurvasPelaCota).toHaveBeenCalledWith(true);
    const casas = screen.getByLabelText('Casas decimais da legenda') as HTMLInputElement;
    expect(casas.value).toBe('2');
    fireEvent.change(casas, { target: { value: '0' } });
    expect(o2.onCasas).toHaveBeenCalledWith(0);
    fireEvent.change(casas, { target: { value: '9' } });
    expect(o2.onCasas).toHaveBeenCalledWith(3);

    // A legenda: um quadrado por nível, do mais alto ao mais baixo, azul embaixo e vermelho em cima.
    const legenda = screen.getByTestId('legenda-por-nivel');
    const itens = legenda.querySelectorAll('li');
    expect(itens).toHaveLength(7);
    expect(itens[0].textContent).toBe('903,50 m');
    expect(itens[6].textContent).toBe('888,50 m');
    expect((itens[0].querySelector('span') as HTMLElement).style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect((itens[6].querySelector('span') as HTMLElement).style.backgroundColor).toBe('rgb(0, 0, 255)');

    // Com 0 casas, a legenda arredonda.
    rerender(<PainelTopografia topografia={hook({ versoes: [VERSAO], selecionada: VERSAO })} temLoteFechado temGeorreferencia hipsometria={HIPSO} hipsometriaOpcoes={opcoes({ casas: 0 })} />);
    expect(screen.getByTestId('legenda-por-nivel').querySelectorAll('li')[0].textContent).toBe('904 m');
  });
});
