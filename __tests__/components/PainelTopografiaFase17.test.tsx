// @vitest-environment jsdom
/**
 * Fase 17 no painel: a seção "Projeto executivo (ART)" — campos do
 * responsável e da sondagem, a lista de verificações, o botão que só emite
 * com tudo atendido, a emissão válida e o histórico com o memorial.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTopografia, { type ExecutivoNoPainel } from '../../components/blueprint/PainelTopografia';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { BlueprintProjetoExecutivoRow, BlueprintTopografiaRow } from '../../types/blueprint';
import { FONTES, fonteDeElevacao } from '../../utils/blueprintElevacaoProvedores';
import { RESPONSAVEL_VAZIO, SONDAGEM_VAZIA, type ResultadoDoExecutivo } from '../../utils/blueprintTopografiaExecutivo';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

const LOTE = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 30000 },
  { x: 0, y: 30000 },
];

const VERSAO: BlueprintTopografiaRow = {
  id: 'v1', study_id: 's1', organization_id: 'o1', versao: 1, fonte_codigo: 'PONTOS_COTADOS',
  fonte_nome: 'Pontos cotados do levantamento', dataset_versao: 'x', resolucao_fonte_m: null, referencia_vertical: null,
  classe_qualidade: 'LEVANTAMENTO_IMPORTADO',
  grade: { origem: { x: 0, y: 0 }, espacamentoMm: 500, colunas: 2, linhas: 2, cotasM: [1, 1, 1, 1] },
  equidistancia_m: 0.5, modo_niveis: 'EQUIDISTANCIA', niveis_m: null, curvas: [],
  estatisticas: { cotaMinM: 100, cotaMaxM: 103, cotaMediaM: 101.5, amplitudeM: 3, amostrasValidas: 40, amostrasAusentes: 0, amostrasNoLote: 40, areaM2: 400, espacamentoM: 0.5, curvas: 6, comprimentoDasCurvasM: 120 },
  pontos_cotados: [], linhas_de_quebra: [], tin_importada: null, anel: [], georreferencia: null, algoritmo_nome: 'a', algoritmo_versao: '1', hash_entrada: 'e', hash_resultado: 'abcdef012345', avisos: [], created_by: null, created_at: '2026-09-12T12:00:00Z',
};

function hook(): Topografia {
  return {
    fontes: FONTES, fonteCodigo: 'PONTOS_COTADOS', setFonteCodigo: vi.fn(), fonte: fonteDeElevacao('PONTOS_COTADOS'),
    pontosCotados: [], adicionarPonto: vi.fn(), alterarPonto: vi.fn(), removerPonto: vi.fn(), usarVerticesDoLote: vi.fn(),
    definirPontosCotados: vi.fn(), origemDosPontos: null, linhasDeQuebra: [], tinImportada: null, limparQuebrasETin: vi.fn(),
    anelDoLote: LOTE, georreferencia: null,
    qualidade: 'EQUILIBRADA', setQualidade: vi.fn(), equidistanciaM: null, setEquidistanciaM: vi.fn(), sugestaoEquidistanciaM: 0.5,
    modoNiveis: 'EQUIDISTANCIA', setModoNiveis: vi.fn(), numeroDeNiveis: 7, setNumeroDeNiveis: vi.fn(), niveisTexto: '', setNiveisTexto: vi.fn(),
    areaDasCurvas: 'LOTE', setAreaDasCurvas: vi.fn(),
    gerar: vi.fn(async () => {}), gerando: false, erro: null, versoes: [VERSAO], selecionada: VERSAO, selecionar: vi.fn(),
    apagarVersao: vi.fn(async () => {}), exportar: vi.fn(), carregando: false, persistenciaIndisponivel: false,
  };
}

const RESULTADO_OK: ResultadoDoExecutivo = {
  verificacoes: [
    { grupo: 'RESPONSAVEL', item: 'Responsável técnico com registro e ART/RRT', norma: 'Lei 6.496/77', exigido: 'nome, registro, número e data', obtido: 'Ana — CREA 5069 · ART 2802', atende: true },
    { grupo: 'SONDAGEM', item: 'Número de furos de sondagem', norma: 'NBR 8036', exigido: '≥ 3 para 360 m²', obtido: '3', atende: true },
  ],
  muros: [],
  podeEmitir: true,
  pendencias: [],
};

const EMITIDO: BlueprintProjetoExecutivoRow = {
  id: 'pe1', study_id: 's1', organization_id: 'o1', status: 'EMITIDO',
  responsavel: { ...RESPONSAVEL_VAZIO, nome: 'Ana Souza', registro: '5069123456', artNumero: '28027230240012345', artData: '2026-09-12' },
  sondagem: SONDAGEM_VAZIA, topografia_id: 'v1', topografia_versao: 1, topografia_hash: 'abcdef012345', hash_da_base: 'base-1',
  verificacoes: RESULTADO_OK.verificacoes, memorial: '# Memorial', emitido_em: '2026-09-12T15:00:00Z', created_by: null, created_at: '2026-09-12T15:00:00Z', updated_at: '2026-09-12T15:00:00Z',
};

function executivo(extra: Partial<ExecutivoNoPainel> = {}): ExecutivoNoPainel {
  return {
    responsavel: RESPONSAVEL_VAZIO, onResponsavel: vi.fn(), sondagem: SONDAGEM_VAZIA, onSondagem: vi.fn(),
    resultado: RESULTADO_OK, emitidos: [], emissaoValida: null, hashDaBaseAtual: 'base-1',
    onEmitir: vi.fn(), emitindo: false, erro: null, onBaixarMemorial: vi.fn(), persistenciaIndisponivel: false,
    ...extra,
  };
}

describe('PainelTopografia · fase 17 (projeto executivo com ART)', () => {
  it('campos do responsável e da sondagem chamam os callbacks; a lista de verificações aparece por grupo', () => {
    const e = executivo();
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia={false} executivo={e} />);
    expect(screen.getByTestId('projeto-executivo').textContent).toMatch(/Projeto executivo \(ART\)/);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana Souza' } });
    expect(e.onResponsavel).toHaveBeenCalledWith({ nome: 'Ana Souza' });
    fireEvent.change(screen.getByLabelText('Número da ART'), { target: { value: '28027230240012345' } });
    expect(e.onResponsavel).toHaveBeenCalledWith({ artNumero: '28027230240012345' });
    fireEvent.change(screen.getByLabelText('Conselho'), { target: { value: 'CAU' } });
    expect(e.onResponsavel).toHaveBeenCalledWith({ conselho: 'CAU' });
    fireEvent.change(screen.getByLabelText('Furos de sondagem'), { target: { value: '3' } });
    expect(e.onSondagem).toHaveBeenCalledWith({ furos: 3 });
    fireEvent.change(screen.getByLabelText("Nível d'água"), { target: { value: 'ENCONTRADO' } });
    expect(e.onSondagem).toHaveBeenCalledWith({ nivelDagua: { informado: true, encontrado: true, profundidadeM: 0 } });
    const lista = screen.getByTestId('executivo-verificacoes');
    expect(lista.textContent).toMatch(/Responsável técnico/);
    expect(lista.textContent).toMatch(/Sondagem e água/);
    expect(lista.textContent).toMatch(/✓\s*Número de furos de sondagem \(NBR 8036\) — exigido ≥ 3 para 360 m²; obtido 3/);
  });

  it('o botão emite só com tudo atendido; com pendência fica desabilitado e diz quantas', () => {
    const e = executivo();
    const { rerender } = render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia={false} executivo={e} />);
    const botao = screen.getByRole('button', { name: /Emitir projeto executivo \(ART\)/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(false);
    fireEvent.click(botao);
    expect(e.onEmitir).toHaveBeenCalledTimes(1);
    const pendente = executivo({ resultado: { ...RESULTADO_OK, podeEmitir: false, pendencias: ['Número de furos de sondagem: exigido ≥ 3, obtido 1'], verificacoes: [{ ...RESULTADO_OK.verificacoes[1], obtido: '1', atende: false }] } });
    rerender(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia={false} executivo={pendente} />);
    expect((screen.getByRole('button', { name: /Emitir projeto executivo/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/1 verificação\(ões\) pendente\(s\)/)).toBeTruthy();
    expect(screen.getByTestId('executivo-verificacoes').textContent).toMatch(/✗\s*Número de furos/);
  });

  it('com a emissão válida: a faixa "Emitido", o aviso da versão vira a ART, e o histórico baixa o memorial', () => {
    const emissao = { artNumero: '28027230240012345', responsavel: 'Ana Souza', conselho: 'CREA' as const, registro: '5069123456', emitidoEm: '2026-09-12T15:00:00Z' };
    const e = executivo({ emissaoValida: emissao, emitidos: [EMITIDO] });
    const t = hook();
    render(<PainelTopografia topografia={t} temLoteFechado temGeorreferencia={false} executivo={e} />);
    expect(screen.getByTestId('executivo-emitido').textContent).toMatch(/Emitido — ART nº 28027230240012345 · Ana Souza \(CREA 5069123456\) · 12\/09\/2026/);
    expect(screen.queryByRole('button', { name: /Emitir projeto executivo/ })).toBeNull();
    expect(screen.getByTestId('topografia-resultado').textContent).toMatch(/Projeto executivo — ART nº 28027230240012345/);
    expect(screen.getByTestId('topografia-resultado').textContent).not.toMatch(/pré-dimensionamento com hipóteses declaradas/);
    // O SVG sai com a emissão.
    fireEvent.click(screen.getByRole('button', { name: 'SVG' }));
    expect((t.exportar as ReturnType<typeof vi.fn>).mock.calls[0][1].executivo).toEqual(emissao);
    const historico = screen.getByTestId('executivo-emitidos');
    expect(historico.textContent).toMatch(/vale para a base atual/);
    fireEvent.click(screen.getByRole('button', { name: 'Memorial (PDF)' }));
    expect(e.onBaixarMemorial).toHaveBeenCalledWith(EMITIDO);
  });

  it('emissão antiga com a base mudada: o formulário volta e o histórico avisa', () => {
    const e = executivo({ emitidos: [EMITIDO], hashDaBaseAtual: 'base-2' });
    render(<PainelTopografia topografia={hook()} temLoteFechado temGeorreferencia={false} executivo={e} />);
    expect(screen.queryByTestId('executivo-emitido')).toBeNull();
    expect(screen.getByRole('button', { name: /Emitir projeto executivo/ })).toBeTruthy();
    expect(screen.getByTestId('executivo-emitidos').textContent).toMatch(/a base mudou desde a emissão/);
  });
});
