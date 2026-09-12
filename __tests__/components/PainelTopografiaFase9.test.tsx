// @vitest-environment jsdom
/**
 * Fase 9 no painel: importar pontos cotados de arquivo — prévia, opções e
 * aplicação, e a proveniência do arquivo na lista.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
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
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [], selecionada: null, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
    ...extra,
  };
}

function escolher(nome: string, conteudo: string) {
  const input = screen.getByLabelText('Arquivo de pontos cotados') as HTMLInputElement;
  const file = new File([conteudo], nome, { type: 'text/plain' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('PainelTopografia · fase 9 (importar pontos)', () => {
  it('CSV PNEZD: prévia com contagem, troca de ordem e "Substituir" leva os pontos com a proveniência', async () => {
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    escolher('levantamento.csv', '1;10,000;2,000;100,50\n2;20,000;4,000;101,00\n3;5,000;8,000;100,80');
    await waitFor(() => expect(screen.getByTestId('previa-da-importacao')).toBeTruthy());
    const previa = screen.getByTestId('previa-da-importacao');
    expect(previa.textContent).toMatch(/levantamento\.csv/);
    expect(previa.textContent).toMatch(/3 pontos lidos/);
    expect(previa.textContent).toMatch(/3 dentro do lote/);

    // Trocar para E, N: os mesmos números, X e Y invertidos — ainda dentro do lote (12 × 30).
    fireEvent.change(screen.getByLabelText('Ordem das colunas do arquivo'), { target: { value: 'ENZ' } });
    await waitFor(() => expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/dentro do lote/));

    fireEvent.click(screen.getByRole('button', { name: 'Substituir os pontos' }));
    expect(t.definirPontosCotados).toHaveBeenCalledTimes(1);
    const [pontos, origem, modo] = (t.definirPontosCotados as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(modo).toBe('SUBSTITUIR');
    expect(pontos).toHaveLength(3);
    expect(pontos[0]).toEqual({ x: 10000, y: 2000, cotaM: 100.5 }); // ordem E,N escolhida
    expect(origem).toMatchObject({ arquivo: 'levantamento.csv', formato: 'texto (CSV/TXT)', quantos: 3 });
    expect(origem.sha256).toHaveLength(64);
    expect(screen.queryByTestId('previa-da-importacao')).toBeNull();
  });

  it('extensão desconhecida avisa; GeoJSON sem georreferência explica; "Acrescentar" só com pontos existentes', async () => {
    const t = hook({ pontosCotados: [{ x: 1000, y: 1000, cotaM: 100 }] });
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    escolher('foto.pdf', 'x');
    await waitFor(() => expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/Não sei ler/));
    escolher('pontos.geojson', JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-46, -22, 100] }, properties: {} }] }));
    await waitFor(() => expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/georreferência/));
    expect((screen.getByRole('button', { name: 'Substituir os pontos' }) as HTMLButtonElement).disabled).toBe(true);
    escolher('ok.txt', '1 2.000 10.000 100.5\n2 4.000 20.000 101\n3 8.000 5.000 100.8');
    await waitFor(() => expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/3 pontos lidos/));
    const acrescentar = screen.getByRole('button', { name: 'Acrescentar aos existentes' }) as HTMLButtonElement;
    expect(acrescentar.disabled).toBe(false);
    fireEvent.click(acrescentar);
    expect((t.definirPontosCotados as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBe('ACRESCENTAR');
  });

  it('a origem dos pontos aparece na lista', () => {
    const t = hook({
      pontosCotados: [{ x: 1000, y: 1000, cotaM: 100 }],
      origemDosPontos: { arquivo: 'lev.csv', formato: 'texto (CSV/TXT)', sha256: 'abcdef0123456789abcdef', quantos: 1 },
    });
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    expect(screen.getByTestId('origem-dos-pontos').textContent).toMatch(/1 pontos de lev\.csv · abcdef012345/);
  });
});

// ── Fase 10: o SVG de perfil do próprio ÒPURA ───────────────────────────────
import { svgDoPerfil } from '../../utils/blueprintTopografiaExport';
import { estatisticasDoPerfil, perfilAoLongo } from '../../utils/blueprintTopografiaAnalises';

describe('PainelTopografia · fase 10 (perfil do ÒPURA)', () => {
  it('sem linha de perfil explica o que falta; com a linha, apoia os pontos e avisa a precisão', async () => {
    const perfil = perfilAoLongo(() => 101.2, [{ x: 1000, y: 1000 }, { x: 6000, y: 20000 }, { x: 11000, y: 28000 }], 1000);
    const svg = svgDoPerfil(perfil, estatisticasDoPerfil(perfil), { titulo: 'Planta — perfil' });
    const t = hook();
    const { rerender } = render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    escolher('Planta - perfil - curvas de nivel v2.svg', svg);
    await waitFor(() => expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/perfil do ÒPURA \(SVG\)/));
    expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/Perfil altimétrico/);
    expect((screen.getByRole('button', { name: 'Substituir os pontos' }) as HTMLButtonElement).disabled).toBe(true);

    const perfilNoPainel = {
      origem: 'LINHA' as const, onOrigem: vi.fn(), linhas: 1, linhaIndice: 0, onLinha: vi.fn(), onTracarLinha: vi.fn(), onApagarLinha: vi.fn(),
      cortes: [], corteId: '', onCorte: vi.fn(), pontos: perfil, estatisticas: estatisticasDoPerfil(perfil), svg, onExportar: vi.fn(),
    };
    rerender(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} perfil={perfilNoPainel} />);
    escolher('Planta - perfil - curvas de nivel v2.svg', svg);
    await waitFor(() => expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/pontos lidos/));
    expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/precisão é a da escala/);
    expect(screen.queryByLabelText('Ancoragem dos pontos no desenho')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Substituir os pontos' }));
    const [pontos, origem] = (t.definirPontosCotados as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pontos.length).toBe(perfil.length);
    expect(Math.abs(pontos[0].cotaM - 101.2)).toBeLessThanOrEqual(0.02);
    expect(origem.formato).toBe('perfil do ÒPURA (SVG)');
  });
});

// ── Fase 11: curvas de nível num SVG ───────────────────────────────────────
describe('PainelTopografia · fase 11 (curvas no SVG)', () => {
  it('um SVG de CAD com polilinhas rotuladas mostra "N curvas de nível" na prévia e importa os pontos', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 300">
      <polyline points="10,50 40,55 80,52 110,60" fill="none"/><text x="42" y="52">101.50</text>
      <path d="M10 150 L50 148 L90 155 L110 150" fill="none"/><text x="52" y="145">102,00</text>
      <path d="M10 250 L60 240 L110 250" fill="none"/>
    </svg>`;
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} />);
    escolher('curvas-cad.svg', svg);
    await waitFor(() => expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/2 curvas de nível/));
    expect(screen.getByTestId('previa-da-importacao').textContent).toMatch(/\(\+1 sem cota\)/);
    fireEvent.click(screen.getByRole('button', { name: 'Substituir os pontos' }));
    const [pontos] = (t.definirPontosCotados as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(new Set(pontos.map((p: { cotaM: number }) => p.cotaM))).toEqual(new Set([101.5, 102]));
  });
});
