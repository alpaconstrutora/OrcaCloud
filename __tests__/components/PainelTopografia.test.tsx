// @vitest-environment jsdom
/**
 * O painel de curvas de nível (`components/blueprint/PainelTopografia.tsx`).
 *
 * O que estes casos protegem é o que a tela NÃO PODE esconder (RF-020 /
 * CA-011): a classe da versão, o aviso, a fonte e a resolução — e o caminho
 * de erro, que precisa aparecer em vez de sumir num console.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';
import { AVISO_LEVANTAMENTO, AVISO_PRELIMINAR } from '../../utils/blueprintTopografia';

vi.mock('../../components/ui/confirm', () => ({
  useConfirm: () => vi.fn(async () => true),
}));

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
      cotaMinM: 100,
      cotaMaxM: 103,
      cotaMediaM: 101.5,
      amplitudeM: 3,
      amostrasValidas: 40,
      amostrasAusentes: 0,
      amostrasNoLote: 40,
      areaM2: 400,
      espacamentoM: 0.5,
      curvas: 6,
      comprimentoDasCurvasM: 120,
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
  return {
    fontes: FONTES,
    fonteCodigo: 'PONTOS_COTADOS',
    setFonteCodigo: vi.fn(),
    fonte: fonteDeElevacao('PONTOS_COTADOS'),
    pontosCotados: [],
    adicionarPonto: vi.fn(),
    alterarPonto: vi.fn(),
    removerPonto: vi.fn(),
    usarVerticesDoLote: vi.fn(),
    qualidade: 'EQUILIBRADA',
    setQualidade: vi.fn(),
    equidistanciaM: null,
    setEquidistanciaM: vi.fn(),
    sugestaoEquidistanciaM: 0.5,
    gerar: vi.fn(async () => {}),
    gerando: false,
    erro: null,
    versoes: [],
    selecionada: null,
    selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}),
    exportar: vi.fn(),
    carregando: false,
    persistenciaIndisponivel: false,
    ...extra,
  };
}

describe('PainelTopografia', () => {
  it('sem lote fechado, só orienta — não oferece gerar', () => {
    render(<PainelTopografia topografia={hook()} temLoteFechado={false} temGeorreferencia={false} />);
    expect(screen.getByText(/Feche o contorno do lote/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Gerar/ })).toBeNull();
  });

  it('com lote, "Usar vértices do lote" e "Gerar" chamam o hook', () => {
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar vértices do lote' }));
    expect(t.usarVerticesDoLote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Gerar curvas/ }));
    expect(t.gerar).toHaveBeenCalledTimes(1);
  });

  it('a fonte remota sem georreferência avisa onde informar', () => {
    const t = hook({ fonteCodigo: 'OPEN_METEO_GLO90', fonte: fonteDeElevacao('OPEN_METEO_GLO90') });
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    expect(screen.getByText(/latitude e longitude do lote/)).toBeTruthy();
    expect(screen.getAllByText(/célula de 90 m/).length).toBeGreaterThan(0);
  });

  it('o erro de geração aparece na tela', () => {
    render(
      <PainelTopografia
        topografia={hook({ erro: 'O lado menor do lote tem 20 m e esta fonte resolve 90 m' })}
        temLoteFechado
        temGeorreferencia
      />,
    );
    expect(screen.getByText(/lado menor do lote/)).toBeTruthy();
  });

  it('a versão mostra estatísticas, proveniência, classe e o aviso — e exporta', () => {
    const v = versao();
    const t = hook({ versoes: [v], selecionada: v });
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia />);
    expect(screen.getByText('103,00 m')).toBeTruthy();
    expect(screen.getByText(/Levantamento digitado/)).toBeTruthy();
    expect(screen.getByText(new RegExp(AVISO_LEVANTAMENTO.slice(0, 30)))).toBeTruthy();
    expect(screen.getByText(/Pontos cotados do levantamento/)).toBeTruthy();
    expect(screen.getByTitle('abcdef0123456789abcdef')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'SVG' }));
    expect(t.exportar).toHaveBeenCalledWith('svg');
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(t.exportar).toHaveBeenCalledWith('csv');
  });

  it('a versão de DEM leva a classe preliminar e o aviso do PRD', () => {
    const v = versao({
      fonte_codigo: 'OPEN_METEO_GLO90',
      fonte_nome: 'Copernicus DEM GLO-90 (Open-Meteo)',
      resolucao_fonte_m: 90,
      referencia_vertical: 'EGM2008',
      classe_qualidade: 'PRELIMINAR_REMOTO',
    });
    render(<PainelTopografia topografia={hook({ versoes: [v], selecionada: v })} temLoteFechado temGeorreferencia />);
    expect(screen.getByText(/Preliminar — dado público remoto/)).toBeTruthy();
    expect(screen.getByText(new RegExp(AVISO_PRELIMINAR.slice(0, 30)))).toBeTruthy();
    expect(screen.getByText(/90 m/)).toBeTruthy();
  });

  it('sem cota de origem, diz que o corte e o 3D usam a cota média', () => {
    const v = versao();
    render(
      <PainelTopografia
        topografia={hook({ versoes: [v], selecionada: v })}
        temLoteFechado
        temGeorreferencia
        cotaDeOrigemInformada={false}
      />,
    );
    expect(screen.getByText(/cota média \(101,50 m\)/)).toBeTruthy();
  });

  it('sem a migration, avisa que nada é gravado', () => {
    render(<PainelTopografia topografia={hook({ persistenciaIndisponivel: true })} temLoteFechado temGeorreferencia />);
    expect(screen.getByText(/não estão sendo gravadas/)).toBeTruthy();
  });
});
