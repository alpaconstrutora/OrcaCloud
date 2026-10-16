// @vitest-environment jsdom
/**
 * F10 da casa automática (15/10/2026): a tela — o programa e as hipóteses do estudo, gerar desligado dizendo por
 * quê, o progresso por etapa, o resumo (área, índices, custo pelo CUB), as etapas, o relatório por grupo e as duas
 * saídas (lançar com a trava; criar alternativa).
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TelaCasaAutomatica from '../../components/blueprint/TelaCasaAutomatica';
import { emptyModel } from '../../utils/blueprintKernel';
import { PREMISSAS_DA_CASA_PADRAO } from '../../utils/blueprintPremissasDaCasa';
import type { EstadoDaCasaAutomatica } from '../../hooks/useCasaAutomatica';
import type { PlanoDaCasa } from '../../utils/blueprintCasaAutomatica';

const plano = {
  levelId: 'lvl_0001',
  comandos: [{ type: 'AddLevel', name: 'x', elevationMm: 0, defaultHeightMm: 2800 }],
  criados: ['lvl_0002'],
  etapas: [
    { id: 'ARQUITETURA', rotulo: 'Arquitetura (gerador E6.2)', situacao: 'LANCOU', comandos: 3, nota: '15 paredes' },
    { id: 'PLUVIAL', rotulo: 'Águas pluviais (calhas, condutores, saída)', situacao: 'NAO_RODOU', comandos: 0, nota: 'sem intensidade de chuva' },
    { id: 'CLIMATIZACAO', rotulo: 'Climatização', situacao: 'NAO_EXIGIDA', comandos: 0, nota: 'desligada nas hipóteses da casa' },
  ],
  pendencias: [
    { grupo: 'VERIFICACAO', texto: 'Rede de água fria: 3 trecho(s) passando por porta ou janela' },
    { grupo: 'PREMISSA', texto: 'Águas pluviais: informe a cidade ou a intensidade de chuva' },
    { grupo: 'CONFERIR', texto: 'Entrada de energia: confira o padrão da concessionária' },
  ],
  resultado: emptyModel(),
  programa: { itens: [], relacoes: [] },
  implantacao: { medidas: { toPct: 43.6, toMaxPct: 60, coeficiente: 0.44, coeficienteMax: 1.2, permeabilidadePct: 38.1, permeabilidadeMinPct: 20 } },
  semente: 2,
  escolha: 'semente 2 de 8: nenhum problema grave',
  decisoes: [],
  resumo: {
    areaConstruidaM2: 100,
    ambientesPedidos: 11,
    ambientesAtendidos: 11,
    regrasVioladas: 0,
    eletrica: { circuitos: 30, entrada: { categoria: 'T2', ligacao: 'FFF', demandaKva: 17.7 } },
    climatizacao: { equipamentos: 4 },
  },
} as unknown as PlanoDaCasa;

const casa = (extra: Partial<EstadoDaCasaAutomatica> = {}): EstadoDaCasaAutomatica => ({ rodando: false, plano: null, erro: null, progresso: null, gerar: vi.fn(), cancelar: vi.fn(), limpar: vi.fn(), ...extra });

function tela(extra: Partial<React.ComponentProps<typeof TelaCasaAutomatica>> = {}) {
  const props: React.ComponentProps<typeof TelaCasaAutomatica> = {
    casa: casa(),
    premissas: PREMISSAS_DA_CASA_PADRAO,
    onPremissas: vi.fn(),
    persistenciaIndisponivel: false,
    motivoParaNaoGerar: null,
    onGerar: vi.fn(),
    prova: { ok: true },
    onLancar: vi.fn(async () => {}),
    onCriarAlternativa: vi.fn(async () => {}),
    lancado: null,
    cub: { valorM2: 2000, estimado: false, referencia: 'MG · 09/2026' },
    unidades: [],
    onUnidade: vi.fn(),
    ...extra,
  };
  render(<TelaCasaAutomatica {...props} />);
  return props;
}

describe('TelaCasaAutomatica (F10)', () => {
  it('sem prévia: gerar chama o motor; não há o que lançar ainda', () => {
    const p = tela();
    fireEvent.click(screen.getByTestId('gerar-casa'));
    expect(p.onGerar).toHaveBeenCalled();
    expect(screen.queryByTestId('lancar-casa')).toBeNull();
  });

  it('sem o que gerar: o botão desligado DIZ o motivo (no title e na tela)', () => {
    tela({ motivoParaNaoGerar: 'Marque a divisa da FRENTE do lote.' });
    const b = screen.getByTestId('gerar-casa') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('Marque a divisa da FRENTE do lote.');
    expect(screen.getByTestId('motivo-gerar-casa').textContent).toBe('Marque a divisa da FRENTE do lote.');
  });

  it('gerando: parar no lugar de gerar, e a etapa em curso', () => {
    const c = casa({ rodando: true, progresso: { indice: 7, total: 22, rotulo: 'Vigas' } });
    tela({ casa: c });
    expect(screen.getByTestId('progresso-casa').textContent).toBe('Etapa 7 de 22: Vigas');
    fireEvent.click(screen.getByTestId('parar-casa'));
    expect(c.cancelar).toHaveBeenCalled();
  });

  it('com a prévia: o resumo (área, índices, custo pelo CUB), as etapas com o motivo e o relatório por grupo', () => {
    tela({ casa: casa({ plano }) });
    const resumo = screen.getByTestId('resumo-da-casa');
    expect(resumo.textContent).toContain('100,00 m²');
    expect(resumo.textContent).toContain('11 de 11');
    expect(resumo.textContent).toContain('43,6 %');
    expect(screen.getByTestId('custo-da-casa').textContent).toMatch(/200\.000/);
    const etapas = within(screen.getByTestId('etapas-da-casa')).getAllByRole('listitem');
    expect(etapas.map((li) => li.textContent)).toEqual([
      'Arquitetura (gerador E6.2)lança · 315 paredes',
      'Águas pluviais (calhas, condutores, saída)não rodousem intensidade de chuva',
      'Climatizaçãodesligadadesligada nas hipóteses da casa',
    ]);
    // A premissa que faltou, em destaque.
    expect(screen.getByTestId('casa-parou').textContent).toContain('informe a cidade');
    // As faltas abertas; os outros grupos recolhidos até o clique.
    const rel = screen.getByTestId('pendencias-da-casa');
    expect(rel.textContent).toContain('3 trecho(s) passando por porta ou janela');
    expect(rel.textContent).not.toContain('confira o padrão da concessionária');
    fireEvent.click(within(rel).getByRole('button', { name: /CONFERIR NA NORMA/ }));
    expect(rel.textContent).toContain('confira o padrão da concessionária');
  });

  it('lançar: desligado com o motivo da trava; ligado, chama o lançamento; criar alternativa também', async () => {
    tela({ casa: casa({ plano }), prova: { ok: false, motivo: 'O desenho mudou depois da prévia — gere de novo.' } });
    const lancar = screen.getByTestId('lancar-casa') as HTMLButtonElement;
    expect(lancar.disabled).toBe(true);
    expect(lancar.title).toBe('O desenho mudou depois da prévia — gere de novo.');
    expect(screen.getAllByText('O desenho mudou depois da prévia — gere de novo.').length).toBeGreaterThan(0);
  });

  it('lançar e criar alternativa chamam as saídas', async () => {
    const p = tela({ casa: casa({ plano }) });
    fireEvent.click(screen.getByTestId('lancar-casa'));
    await waitFor(() => expect(p.onLancar).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('criar-alternativa-casa'));
    await waitFor(() => expect(p.onCriarAlternativa).toHaveBeenCalled());
  });

  it('o número é livre enquanto se digita: o "5" de "5500" não vira 2000; sai do campo, volta para a faixa', () => {
    const p = tela();
    const chuveiro = screen.getByLabelText('Chuveiro elétrico (W)') as HTMLInputElement;
    fireEvent.change(chuveiro, { target: { value: '5' } });
    expect(p.onPremissas).not.toHaveBeenCalled();
    expect(chuveiro.value).toBe('5');
    fireEvent.change(chuveiro, { target: { value: '6500' } });
    expect(p.onPremissas).toHaveBeenLastCalledWith(expect.objectContaining({ eletrica: expect.objectContaining({ chuveiroEletricoVA: 6500 }) }));
    fireEvent.change(chuveiro, { target: { value: '50' } });
    fireEvent.blur(chuveiro);
    expect(p.onPremissas).toHaveBeenLastCalledWith(expect.objectContaining({ eletrica: expect.objectContaining({ chuveiroEletricoVA: 2000 }) }));
  });

  it('o programa e as disciplinas mexem nas premissas; a unidade do Empreendimento preenche o programa', () => {
    const p = tela({ unidades: [{ id: 'u1', rotulo: 'Torre A · Casa 01 (3Q)' }] });
    fireEvent.change(screen.getByLabelText('Padrão (CUB)'), { target: { value: 'R1-A' } });
    expect(p.onPremissas).toHaveBeenLastCalledWith(expect.objectContaining({ curto: expect.objectContaining({ padrao: 'R1-A' }) }));
    fireEvent.click(screen.getByLabelText('Climatização'));
    expect(p.onPremissas).toHaveBeenLastCalledWith(expect.objectContaining({ disciplinas: expect.objectContaining({ climatizacao: false }) }));
    fireEvent.change(screen.getByLabelText('Unidade do Empreendimento desta casa'), { target: { value: 'u1' } });
    expect(p.onUnidade).toHaveBeenCalledWith('u1');
  });

  it('F15: a unidade vinculada aparece escolhida; "nenhuma" desfaz; vínculo com unidade que sumiu é dito', () => {
    const p = tela({ unidades: [{ id: 'u1', rotulo: 'Torre A · Casa 01 (3Q)' }], premissas: { ...PREMISSAS_DA_CASA_PADRAO, unidadeId: 'u1' } });
    const sel = screen.getByLabelText('Unidade do Empreendimento desta casa') as HTMLSelectElement;
    expect(sel.value).toBe('u1');
    fireEvent.change(sel, { target: { value: '' } });
    expect(p.onUnidade).toHaveBeenLastCalledWith(null);
  });

  it('F15: sem unidades carregadas mas com vínculo gravado, o seletor aparece e diz que a unidade não foi encontrada', () => {
    tela({ unidades: [], premissas: { ...PREMISSAS_DA_CASA_PADRAO, unidadeId: 'sumiu' } });
    const sel = screen.getByLabelText('Unidade do Empreendimento desta casa') as HTMLSelectElement;
    expect(sel.value).toBe('sumiu');
    expect(screen.getByText('Unidade não encontrada no Empreendimento')).toBeTruthy();
  });

  it('F12d: sobrado — o seletor de pavimentos muda a premissa; as hipóteses do sobrado aparecem; o resumo e o botão dizem os dois pavimentos', () => {
    const onPremissas = vi.fn();
    tela({ onPremissas });
    expect(screen.queryByLabelText('Laje entre os pavimentos (cm)')).toBeNull();
    fireEvent.change(screen.getByLabelText('Pavimentos'), { target: { value: '2' } });
    expect(onPremissas).toHaveBeenLastCalledWith(expect.objectContaining({ pavimentos: 2 }));
    cleanup();

    const doSobrado = { ...plano, sobrado: { nivelSuperiorId: 'lvl_0002', nucleo: { lado: 'DIREITA' }, escada: { degraus: 17, espelhoMm: 171, pisoMm: 306, blondelMm: 647 }, portas: { terreo: 'Sala', superior: 'Circulação' } } } as unknown as PlanoDaCasa;
    tela({ premissas: { ...PREMISSAS_DA_CASA_PADRAO, pavimentos: 2 }, casa: casa({ plano: doSobrado }) });
    expect((screen.getByLabelText('Laje entre os pavimentos (cm)') as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('Shaft das instalações (cm)') as HTMLInputElement).value).toBe('40');
    expect(screen.getByTestId('sobrado-da-casa').textContent).toMatch(/17 degraus de 171 × 306 mm/);
    expect(screen.getByTestId('lancar-casa').textContent).toBe('Lançar os dois pavimentos');
  });

  it('F14b: o forro — ligado mostra o pé-direito livre de cada uso e o piso; desligar muda a premissa e esconde os campos', () => {
    const onPremissas = vi.fn();
    tela({ onPremissas });
    expect((screen.getByTestId('forro-da-casa') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Pé-direito livre: sala, dormitório, cozinha (m)') as HTMLInputElement).value).toBe('2.5');
    expect((screen.getByLabelText('Pé-direito livre: banheiro, serviço, circulação (m)') as HTMLInputElement).value).toBe('2.3');
    expect((screen.getByLabelText('Piso acabado (cm)') as HTMLInputElement).value).toBe('5');
    fireEvent.click(screen.getByTestId('forro-da-casa'));
    expect(onPremissas).toHaveBeenLastCalledWith(expect.objectContaining({ forro: expect.objectContaining({ lancar: false }) }));
    cleanup();
    tela({ premissas: { ...PREMISSAS_DA_CASA_PADRAO, forro: { ...PREMISSAS_DA_CASA_PADRAO.forro, lancar: false } } });
    expect(screen.queryByLabelText('Piso acabado (cm)')).toBeNull();
  });

  it('F14c: os furos previstos — a contagem pelos critérios e a tabela para o calculista (peça, rede, Ø, cota, apoio, situação)', () => {
    const resultado = { ...emptyModel(), levels: [{ ...emptyModel().levels[0], id: 'lvl_0001', name: 'Térreo' }] };
    const furo = (extra: Record<string, unknown>) => ({
      pecaId: 's1', peca: 'V3', tipoDaPeca: 'VIGA', levelId: 'lvl_0001', trechoId: 't1', disciplina: 'AGUA_FRIA', direcao: 'HORIZONTAL',
      diametroMm: 52, ponto: { x: 0, y: 0 }, cotaMm: 2598, aoLongoMm: 1850, distanciaAoApoioMm: 1200, dispensa: true, motivos: [], ...extra,
    });
    const lista = [
      furo({}),
      furo({ trechoId: 't2', disciplina: 'ELETRICA', aoLongoMm: 300, distanciaAoApoioMm: 260, dispensa: false, motivos: ['a 26 cm do apoio (pede 80 cm)'] }),
      furo({ pecaId: 's2', peca: 'L4rc', tipoDaPeca: 'LAJE', trechoId: 't3', disciplina: 'ESGOTO', direcao: 'VERTICAL', aoLongoMm: null, distanciaAoApoioMm: null, dispensa: null }),
    ];
    const comFuros = { ...plano, resultado, resumo: { ...plano.resumo, furos: { emViga: 2, dispensa: 1, verificar: 1, emBaldrame: 0, emLaje: 1, lista } } } as unknown as PlanoDaCasa;
    tela({ casa: casa({ plano: comFuros }) });
    const sec = screen.getByTestId('furos-da-casa');
    expect(sec.textContent).toContain('Furos previstos para o calculista (3)');
    expect(sec.textContent).toContain('1 dispensam a verificação');
    expect(sec.textContent).toContain('1 a verificar com o calculista');
    expect(sec.textContent).toContain('dispensa a verificação');
    expect(sec.textContent).toContain('verificar com o calculista');
    expect(sec.textContent).toContain('a 26 cm do apoio (pede 80 cm)');
    expect(sec.textContent).toContain('passagem na laje');
    expect(sec.textContent).toContain('Térreo');
    expect(sec.textContent).toContain('5,2');
    // Sem furos, a seção não aparece.
    cleanup();
    tela({ casa: casa({ plano }) });
    expect(screen.queryByTestId('furos-da-casa')).toBeNull();
  });
});
