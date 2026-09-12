// @vitest-environment jsdom
/**
 * Fase 4 no painel: banqueta/via/talude por aresta, origem do perfil
 * (corte × linha desenhada) e hipsometria por equidistância.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia, {
  type HipsometriaOpcoesNoPainel,
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

function terraplenagem(extra: Partial<TerraplenagemNoPainel> = {}): TerraplenagemNoPainel {
  const parametros = {
    taludeCorteH: 1.5, taludeAterroH: 2, empolamentoPct: 30, contracaoPct: 10,
    alturaDoLanceM: 6, larguraDaBanquetaM: 2, larguraDaViaM: 3, taludePorAresta: [null, { corteH: 3 }],
  };
  return {
    base: 'LOTE', onBase: vi.fn(), temEnvelope: false, cotaPlatoM: 101, onCotaPlatoM: vi.fn(), cotaDeEquilibrioM: 101.5,
    resultado: {
      cotaPlatoM: 101, corteM3: 50, aterroM3: 80, saldoM3: 30, areaPlatoM2: 300, alturaMaxCorteM: 1, alturaMaxAterroM: 1.2,
      ladoDaCelula: [], deltaDaCelulaM: [], celulasSemCota: 0, parametros,
      taludeCorteM3: 12.5, taludeAterroM3: 20, areaTaludeM2: 60, corteTotalM3: 62.5, aterroTotalM3: 100,
      corteSoltoM3: 81.25, aterroEmBancoM3: 110, saldoEmBancoM3: -47.5, botaForaM3: 0, emprestimoM3: 47.5,
      areaViaM2: 45, areaBanquetasM2: 12.5, canaletaPeDeCorteM: 33.3, canaletaCristaDeAterroM: 21.7, canaletaDeBanquetaM: 6.25, muros: [], murosComprimentoM: 0, murosAreaDeFaceM2: 0,
    },
    parametros,
    onParametros: vi.fn(),
    arestasM: [20, 10, 20, 10],
    persistenciaIndisponivel: false,
    ...extra,
  };
}

function perfil(extra: Partial<PerfilNoPainel> = {}): PerfilNoPainel {
  return {
    origem: 'CORTE', onOrigem: vi.fn(), linhas: 0, linhaIndice: -1, onLinha: vi.fn(), onTracarLinha: vi.fn(), onApagarLinha: vi.fn(),
    cortes: [{ id: 'c1', rotulo: 'A' }], corteId: 'c1', onCorte: vi.fn(),
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

const HIPSO: Hipsometria = {
  classeDaCelula: [], minM: 100, maxM: 104,
  classes: [
    { deM: 100, ateM: 102, cor: '#1a9850', areaM2: 300 },
    { deM: 102, ateM: 104, cor: '#d73027', areaM2: 100 },
  ],
};

function opcoes(extra: Partial<HipsometriaOpcoesNoPainel> = {}): HipsometriaOpcoesNoPainel {
  return { modo: 'IGUAIS', onModo: vi.fn(), intervaloM: null, intervaloEfetivoM: 0.5, onIntervalo: vi.fn(), ...extra };
}

describe('PainelTopografia · fase 4', () => {
  it('banqueta, via e talude por lado: campos editáveis e resultados novos', () => {
    const t = terraplenagem();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia terraplenagem={t} />);
    expect((screen.getByLabelText('Banqueta a cada') as HTMLInputElement).value).toBe('6');
    fireEvent.change(screen.getByLabelText('Via de serviço'), { target: { value: '4' } });
    expect(t.onParametros).toHaveBeenCalledWith({ larguraDaViaM: 4 });

    // Uma linha por aresta; o lado 2 já tem corte 1:3, o resto herda.
    expect(screen.getByTestId('talude-por-aresta')).toBeTruthy();
    expect(screen.getByText('Lado 4 · 10,0 m')).toBeTruthy();
    expect((screen.getByLabelText('Talude de corte do lado 2') as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText('Talude de corte do lado 1') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Talude de aterro do lado 4'), { target: { value: '2.5' } });
    expect(t.onParametros).toHaveBeenCalledWith({
      taludePorAresta: [null, { corteH: 3 }, null, { aterroH: 2.5 }],
    });
    // Limpar volta ao padrão (null), não a zero.
    fireEvent.change(screen.getByLabelText('Talude de corte do lado 2'), { target: { value: '' } });
    expect(t.onParametros).toHaveBeenCalledWith({
      taludePorAresta: [null, { corteH: null }, null, null],
    });

    expect(screen.getByText('Área da via de serviço')).toBeTruthy();
    expect(screen.getByText('45,00 m²')).toBeTruthy();
    expect(screen.getByText('Canaleta pé de corte')).toBeTruthy();
    expect(screen.getByText('33,3 m')).toBeTruthy();
    expect(screen.getByText('Canaleta de banqueta')).toBeTruthy();
  });

  it('sem platô poligonal (menos de 3 lados) a tabela por aresta não aparece', () => {
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia terraplenagem={terraplenagem({ arestasM: [] })} />);
    expect(screen.queryByTestId('talude-por-aresta')).toBeNull();
  });

  it('perfil: sem linha, "Linha desenhada" fica desabilitado e "Traçar linha" liga a ferramenta', () => {
    const p = perfil();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia perfil={p} />);
    const linha = screen.getByRole('button', { name: 'Linha desenhada' }) as HTMLButtonElement;
    expect(linha.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Traçar linha' }));
    expect(p.onTracarLinha).toHaveBeenCalled();
    expect(screen.getByLabelText('Corte ao longo do qual o perfil é traçado')).toBeTruthy();
  });

  it('perfil: com linha, alterna a origem e apaga; na origem LINHA o seletor de corte some', () => {
    const p = perfil({ linhas: 1, linhaIndice: 0, origem: 'LINHA', cortes: [] });
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia perfil={p} />);
    expect(screen.queryByLabelText('Corte ao longo do qual o perfil é traçado')).toBeNull();
    expect(screen.queryByText(/Sem corte no desenho/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Linha de um corte' }));
    expect(p.onOrigem).toHaveBeenCalledWith('CORTE');
    fireEvent.click(screen.getByRole('button', { name: 'Apagar linha' }));
    expect(p.onApagarLinha).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Traçar outra linha' })).toBeTruthy();
  });

  it('hipsometria: alterna para equidistância e edita o intervalo (vazio = da versão)', () => {
    const o = opcoes();
    const { rerender } = render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia hipsometria={HIPSO} hipsometriaOpcoes={o} />);
    expect(screen.queryByLabelText('Intervalo das classes hipsométricas (m)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Por equidistância' }));
    expect(o.onModo).toHaveBeenCalledWith('EQUIDISTANCIA');

    const o2 = opcoes({ modo: 'EQUIDISTANCIA', intervaloEfetivoM: 0.5 });
    rerender(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia hipsometria={HIPSO} hipsometriaOpcoes={o2} />);
    const campo = screen.getByLabelText('Intervalo das classes hipsométricas (m)') as HTMLInputElement;
    expect(campo.value).toBe('');
    expect(campo.placeholder).toBe('0,50');
    expect(screen.getByText(/de 0,50 em 0,50 m/)).toBeTruthy();
    fireEvent.change(campo, { target: { value: '1' } });
    expect(o2.onIntervalo).toHaveBeenCalledWith(1);

    // Com intervalo digitado, apagar devolve `null` (volta à equidistância da versão).
    const o3 = opcoes({ modo: 'EQUIDISTANCIA', intervaloM: 1, intervaloEfetivoM: 1 });
    rerender(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia hipsometria={HIPSO} hipsometriaOpcoes={o3} />);
    const campo3 = screen.getByLabelText('Intervalo das classes hipsométricas (m)') as HTMLInputElement;
    expect(campo3.value).toBe('1');
    fireEvent.change(campo3, { target: { value: '' } });
    expect(o3.onIntervalo).toHaveBeenCalledWith(null);
  });
});
