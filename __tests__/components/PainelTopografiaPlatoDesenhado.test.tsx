// @vitest-environment jsdom
/**
 * 25/11/2026: o platô DESENHADO no painel de Corte e aterro (plano
 * docs/planos/2026-11-25-planta-plato-desenhado-3d.md, Tarefa 3): o botão "Desenhado" só com desenho guardado,
 * "Desenhar platô" (a ferramenta da planta), "Editar contorno" (copia o anel em uso) e o aviso dos lados.
 * Montagem copiada de `PainelTopografiaFase2.test.tsx`.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PainelTopografia, { type TerraplenagemNoPainel } from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

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
      cotaMinM: 100, cotaMaxM: 103, cotaMediaM: 101.5, amplitudeM: 3, amostrasValidas: 40,
      amostrasAusentes: 0, amostrasNoLote: 40, areaM2: 400, espacamentoM: 0.5, curvas: 6, comprimentoDasCurvasM: 120,
    },
    pontos_cotados: [], linhas_de_quebra: [], tin_importada: null,
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
  const v = versao(extra.selecionada ? {} : {});
  return {
    fontes: FONTES, fonteCodigo: 'PONTOS_COTADOS', setFonteCodigo: vi.fn(), fonte: fonteDeElevacao('PONTOS_COTADOS'),
    pontosCotados: [], adicionarPonto: vi.fn(), alterarPonto: vi.fn(), removerPonto: vi.fn(), usarVerticesDoLote: vi.fn(), linhasDeQuebra: [], tinImportada: null, limparQuebrasETin: vi.fn(),
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5, modoNiveis: 'EQUIDISTANCIA', setModoNiveis: vi.fn(), numeroDeNiveis: 7, setNumeroDeNiveis: vi.fn(), niveisTexto: '', setNiveisTexto: vi.fn(), areaDasCurvas: 'LOTE', setAreaDasCurvas: vi.fn(),
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [v], selecionada: v, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
    ...extra,
  };
}

function terraplenagem(extra: Partial<TerraplenagemNoPainel> = {}): TerraplenagemNoPainel {
  return {
    base: 'ENVELOPE', onBase: vi.fn(), temEnvelope: true, cotaPlatoM: null, onCotaPlatoM: vi.fn(),
    cotaDeEquilibrioM: 101.5,
    resultado: {
      cotaPlatoM: 101.5, corteM3: 120.4, aterroM3: 120.4, saldoM3: 0, areaPlatoM2: 300, alturaMaxCorteM: 1.2,
      alturaMaxAterroM: 0.9, ladoDaCelula: [], deltaDaCelulaM: [], celulasSemCota: 0,
      parametros: { taludeCorteH: 1.5, taludeAterroH: 1.5, empolamentoPct: 25, contracaoPct: 15 },
      taludeCorteM3: 10, taludeAterroM3: 5, areaTaludeM2: 40, corteTotalM3: 130.4, aterroTotalM3: 125.4,
      corteSoltoM3: 163, aterroEmBancoM3: 144.21, saldoEmBancoM3: -13.81, botaForaM3: 0, emprestimoM3: 13.81,
      areaViaM2: 0, areaBanquetasM2: 0, canaletaPeDeCorteM: 0, canaletaCristaDeAterroM: 0, canaletaDeBanquetaM: 0, muros: [], murosComprimentoM: 0, murosAreaDeFaceM2: 0,
    },
    parametros: { taludeCorteH: 1.5, taludeAterroH: 1.5, empolamentoPct: 25, contracaoPct: 15 },
    onParametros: vi.fn(),
    arestasM: [],
    persistenciaIndisponivel: false,
    ...extra,
  };
}

const montar = (extra: Partial<TerraplenagemNoPainel> = {}) => {
  const t = terraplenagem({ onDesenharPlato: vi.fn(), onEditarContorno: vi.fn(), onEsquecerAvisoDosLados: vi.fn(), ...extra });
  render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia terraplenagem={t} />);
  return t;
};

describe('PainelTopografia · o platô desenhado', () => {
  afterEach(cleanup);

  it('sem desenho guardado não há o botão "Desenhado"; com ele, escolher chama onBase(DESENHADO)', () => {
    montar();
    expect(screen.queryByRole('button', { name: 'Desenhado' })).toBeNull();
    cleanup();
    const t = montar({ temDesenho: true });
    fireEvent.click(screen.getByRole('button', { name: 'Desenhado' }));
    expect(t.onBase).toHaveBeenCalledWith('DESENHADO');
  });

  it('"Desenhar platô" chama onDesenharPlato', () => {
    const t = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Desenhar platô' }));
    expect(t.onDesenharPlato).toHaveBeenCalledTimes(1);
  });

  it('"Editar contorno" chama onEditarContorno; sem anel em uso fica desligado e diz o motivo', () => {
    const t = montar({ podeEditarContorno: true });
    fireEvent.click(screen.getByRole('button', { name: 'Editar contorno' }));
    expect(t.onEditarContorno).toHaveBeenCalledTimes(1);
    cleanup();
    montar({ podeEditarContorno: false });
    const b = screen.getByRole('button', { name: 'Editar contorno' });
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toMatch(/feche o lote/i);
  });

  it('o contorno recusado aparece com o motivo', () => {
    montar({ avisoDoPlato: 'O contorno não pode se cruzar — desenhe de novo, sem cruzar os lados.' });
    expect(screen.getByText(/não pode se cruzar/)).toBeTruthy();
  });

  it('o aviso dos lados mostra de N para M e some no "Entendi"', () => {
    const t = montar({ avisoDosLados: { de: 4, para: 5 } });
    expect(screen.getByText(/voltaram ao padrão \(o contorno mudou de 4 para 5 lados\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(t.onEsquecerAvisoDosLados).toHaveBeenCalledTimes(1);
  });
});
