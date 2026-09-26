// @vitest-environment jsdom
/**
 * A2 no painel: a lista mostra o NOME no lugar do número (e filtra com muitos
 * pontos), a seção "Feições do levantamento" conta por feição, liga/desliga,
 * adensa, avisa duplicados, pontua a linha do perfil e exporta — e o botão
 * desligado diz por quê.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia from '../../components/blueprint/PainelTopografia';
import type { LevantamentoEmEdicao, Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';
import { contarFeicoes, duplicados, linhasDasFeicoes, type PontoDeLevantamento } from '../../utils/blueprintFeicoes';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

const VERSAO: BlueprintTopografiaRow = {
  id: 'v1', study_id: 's1', organization_id: 'o1', versao: 1, fonte_codigo: 'PONTOS_COTADOS',
  fonte_nome: 'Pontos cotados do levantamento', dataset_versao: 'x', resolucao_fonte_m: null, referencia_vertical: null,
  classe_qualidade: 'LEVANTAMENTO_IMPORTADO',
  grade: { origem: { x: 0, y: 0 }, espacamentoMm: 1000, colunas: 11, linhas: 11, cotasM: Array(121).fill(100) },
  equidistancia_m: 0.5, curvas: [],
  estatisticas: { cotaMinM: 100, cotaMaxM: 100, cotaMediaM: 100, amplitudeM: 0, amostrasValidas: 121, amostrasAusentes: 0, amostrasNoLote: 121, areaM2: 100, espacamentoM: 1, curvas: 0, comprimentoDasCurvasM: 0 },
  pontos_cotados: [], linhas_de_quebra: [], tin_importada: null, anel: [], georreferencia: null, algoritmo_nome: 'a', algoritmo_versao: '1', hash_entrada: 'e', hash_resultado: 'abcdef012345', avisos: [], created_by: null, created_at: '2026-09-10T12:00:00Z',
};

const PONTOS: PontoDeLevantamento[] = [
  { x: 0, y: 0, cotaM: 100, nome: 'P1', codigo: 'CE1', descricao: 'arame' },
  { x: 10_000, y: 0, cotaM: 100.5, nome: 'P2', codigo: 'CE1' },
  { x: 10_003, y: 2, cotaM: 100.5, nome: 'P3', codigo: 'PO' },
  { x: 5000, y: 5000, cotaM: 101, nome: 'P1', codigo: 'XY' },
];

function levantamento(pontos: PontoDeLevantamento[], extra: Partial<LevantamentoEmEdicao> = {}): LevantamentoEmEdicao {
  return {
    linhas: linhasDasFeicoes(pontos),
    contagem: contarFeicoes(pontos),
    duplicados: duplicados(pontos),
    removerDuplicados: vi.fn(),
    acrescentarPontos: vi.fn(),
    exportar: vi.fn(),
    feicoesOcultas: new Set(),
    alternarFeicao: vi.fn(),
    estado: 'SALVO',
    id: 'lev-1',
    ...extra,
  };
}

function hook(pontos: PontoDeLevantamento[], lev: LevantamentoEmEdicao | undefined, extra: Partial<Topografia> = {}): Topografia {
  return {
    fontes: FONTES, fonteCodigo: 'PONTOS_COTADOS', setFonteCodigo: vi.fn(), fonte: fonteDeElevacao('PONTOS_COTADOS'),
    pontosCotados: pontos, adicionarPonto: vi.fn(), alterarPonto: vi.fn(), removerPonto: vi.fn(), usarVerticesDoLote: vi.fn(), linhasDeQuebra: [], tinImportada: null, limparQuebrasETin: vi.fn(),
    definirPontosCotados: vi.fn(), origemDosPontos: null, anelDoLote: null, georreferencia: null,
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5, modoNiveis: 'EQUIDISTANCIA', setModoNiveis: vi.fn(), numeroDeNiveis: 7, setNumeroDeNiveis: vi.fn(), niveisTexto: '', setNiveisTexto: vi.fn(), areaDasCurvas: 'LOTE', setAreaDasCurvas: vi.fn(),
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [VERSAO], selecionada: VERSAO, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
    levantamento: lev,
    ...extra,
  } as Topografia;
}

describe('PainelTopografia · levantamento (A2)', () => {
  it('a lista mostra o nome editável no lugar do número, com o código no title', () => {
    const t = hook(PONTOS, levantamento(PONTOS));
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    const nome = screen.getByLabelText('Nome do ponto 1') as HTMLInputElement;
    expect(nome.value).toBe('P1');
    expect(nome.title).toBe('código CE1 · Cerca · arame');
    fireEvent.change(nome, { target: { value: 'M1' } });
    expect(t.alterarPonto).toHaveBeenCalledWith(0, { nome: 'M1' });
  });

  it('feições: conta, liga/desliga, adensa; código fora do catálogo é dito; estado da gravação', () => {
    const lev = levantamento(PONTOS);
    render(<PainelTopografia topografia={hook(PONTOS, lev)} temLoteFechado temGeorreferencia={false} />);
    const s = screen.getByTestId('levantamento-feicoes');
    expect(s.textContent).toContain('Cerca · 2 pontos · 1 linha');
    expect(s.textContent).toContain('Poste · 1 ponto');
    expect(s.textContent).toContain('1 ponto com código fora do catálogo (XY)');
    expect(screen.getByTestId('estado-do-levantamento').textContent).toMatch(/volta ao recarregar/);
    fireEvent.click(screen.getByLabelText('Mostrar Cerca na planta'));
    expect(lev.alternarFeicao).toHaveBeenCalledWith('CERCA');
    fireEvent.click(within(s).getByRole('button', { name: 'Adensar' }));
    const novos = (lev.acrescentarPontos as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // 10 m a passo 5 m: um ponto no meio, com a cota em rampa.
    expect(novos).toEqual([expect.objectContaining({ x: 5000, y: 0, cotaM: 100.25 })]);
  });

  it('duplicados: posição (remover) e nome repetido (renomear, não apagar)', () => {
    const lev = levantamento(PONTOS);
    render(<PainelTopografia topografia={hook(PONTOS, lev)} temLoteFechado temGeorreferencia={false} />);
    const d = screen.getByTestId('duplicados');
    expect(d.textContent).toContain('1 ponto repetido na mesma posição');
    expect(d.textContent).toContain('1 nome repetido em posições diferentes (P1)');
    fireEvent.click(within(d).getByRole('button', { name: 'Remover repetidos' }));
    expect(lev.removerDuplicados).toHaveBeenCalled();
  });

  it('pontuar sem linha de perfil fica desligado DIZENDO por quê; KML sem georreferência também; CSV exporta', () => {
    const lev = levantamento(PONTOS);
    render(<PainelTopografia topografia={hook(PONTOS, lev)} temLoteFechado temGeorreferencia={false} />);
    const pontuar = screen.getByRole('button', { name: 'Pontuar a linha do perfil' });
    expect(pontuar).toBeDisabled();
    expect(pontuar.title).toMatch(/Trace uma linha de perfil/);
    const s = screen.getByTestId('levantamento-feicoes');
    const kml = within(s).getByRole('button', { name: /KML/ });
    expect(kml).toBeDisabled();
    expect(kml.title).toMatch(/Onde fica/);
    fireEvent.click(within(s).getByRole('button', { name: /CSV/ }));
    expect(lev.exportar).toHaveBeenCalledWith('csv');
  });

  it('com a linha do perfil e a versão, pontuar acrescenta pontos com a cota da superfície', () => {
    const lev = levantamento(PONTOS);
    const perfil = {
      origem: 'LINHA' as const, onOrigem: vi.fn(), linhas: 1, linhaIndice: 0, onLinha: vi.fn(), onTracarLinha: vi.fn(), onApagarLinha: vi.fn(),
      cortes: [], corteId: '', onCorte: vi.fn(),
      pontos: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => ({ distM: k, cotaM: 100, x: 1000 + k * 1000, y: 5000 })),
      estatisticas: null, svg: null, onExportar: vi.fn(),
    };
    render(<PainelTopografia topografia={hook(PONTOS, lev)} temLoteFechado temGeorreferencia={false} perfil={perfil as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pontuar a linha do perfil' }));
    const novos = (lev.acrescentarPontos as ReturnType<typeof vi.fn>).mock.calls[0][0] as PontoDeLevantamento[];
    // A amostra colinear vira 2 vértices: 1 m → 9 m a passo 5 m = 1, 6, 9.
    expect(novos.map((p) => p.x)).toEqual([1000, 6000, 9000]);
    expect(novos.every((p) => p.cotaM === 100 && p.codigo === 'PONTUADO')).toBe(true);
  });

  it('com mais de 100 pontos a lista corta e o filtro acha o resto', () => {
    const muitos = Array.from({ length: 150 }, (_, i) => ({ x: i * 100, y: 0, cotaM: 100, nome: `Q${i + 1}` }));
    render(<PainelTopografia topografia={hook(muitos, levantamento(muitos))} temLoteFechado temGeorreferencia={false} />);
    expect(screen.getByTestId('lista-de-pontos').textContent).toContain('Mostrando 100 de 150');
    expect(screen.queryByLabelText('Nome do ponto 140')).toBeNull();
    fireEvent.change(screen.getByLabelText('Filtrar pontos'), { target: { value: 'Q140' } });
    expect((screen.getByLabelText('Nome do ponto 140') as HTMLInputElement).value).toBe('Q140');
  });

  it('sem `levantamento` (fixture antigo) a seção não aparece', () => {
    render(<PainelTopografia topografia={hook(PONTOS, undefined)} temLoteFechado temGeorreferencia={false} />);
    expect(screen.queryByTestId('levantamento-feicoes')).toBeNull();
  });
});
