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
import { HIPOTESES_PLUVIAIS_PADRAO, INTENSIDADE_POR_CIDADE } from '../../utils/blueprintPluvial';

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
  const r = render(<TelaCasaAutomatica {...props} />);
  return Object.assign(props, { rerender: (extra2: Partial<React.ComponentProps<typeof TelaCasaAutomatica>>) => r.rerender(<TelaCasaAutomatica {...props} {...extra2} />) });
}

/** Abre uma aba pelo rótulo (o contador vem colado: "Relatório3"). */
const aba = (rotulo: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${rotulo}`) }));
const nomesDasAbas = () => screen.getAllByRole('tab').map((t) => t.textContent);

describe('TelaCasaAutomatica (F10)', () => {
  it('abas (22/10/2026): sem prévia só Programa e Hipóteses; com ela, Resultado e Relatório (o contador fica vermelho com verificação em falta); Furos e Terraplenagem só quando há', () => {
    tela();
    expect(nomesDasAbas()).toEqual(['Programa', 'Hipóteses']);
    expect(screen.getByTestId('programa-da-casa')).toBeTruthy();
    expect(screen.queryByTestId('hipoteses-da-casa')).toBeNull();
    aba('Hipóteses');
    expect(screen.getByTestId('hipoteses-da-casa')).toBeTruthy();
    expect(screen.queryByTestId('programa-da-casa')).toBeNull();
    cleanup();
    // Com a prévia, a tela abre no resultado.
    tela({ casa: casa({ plano }) });
    expect(nomesDasAbas()).toEqual(['Programa', 'Hipóteses', 'Resultado', 'Relatório3']);
    expect(screen.getByTestId('previa-da-casa')).toBeTruthy();
    const contador = within(screen.getByRole('tab', { name: /^Relatório/ })).getByText('3');
    expect(contador.className).toContain('text-red-600');
    expect(contador.getAttribute('title')).toBe('3 item(ns), 1 verificação(ões) em falta');
    cleanup();
    tela({ casa: casa({ plano: { ...plano, pendencias: plano.pendencias.filter((x) => x.grupo !== 'VERIFICACAO') } as PlanoDaCasa }) });
    expect(within(screen.getByRole('tab', { name: /^Relatório/ })).getByText('2').className).not.toContain('text-red-600');
  });

  it('abas: Gerar, Criar alternativa e Lançar ficam na barra, em qualquer aba; com a prévia, Lançar é o único azul e Gerar vira "Gerar de novo"', () => {
    tela({ casa: casa({ plano }) });
    for (const nome of ['Programa', 'Hipóteses', 'Resultado', 'Relatório']) {
      aba(nome);
      expect(screen.getByTestId('gerar-casa').textContent).toContain('Gerar de novo');
      expect(screen.getByTestId('lancar-casa')).toBeTruthy();
      expect(screen.getByTestId('criar-alternativa-casa')).toBeTruthy();
    }
    expect(screen.getByTestId('lancar-casa').className).toContain('bg-blue-600');
    expect(screen.getByTestId('gerar-casa').className).not.toContain('bg-blue-600');
    cleanup();
    tela();
    expect(screen.getByTestId('gerar-casa').className).toContain('bg-blue-600');
  });

  it('abas: ao terminar de gerar, vai para o Resultado — mas quem está lendo o Relatório continua nele', () => {
    const t = tela({ casa: casa({ rodando: true, progresso: { indice: 3, total: 24, rotulo: 'Pilares' } }) });
    aba('Hipóteses');
    // O progresso aparece em qualquer aba, abaixo da barra.
    expect(screen.getByTestId('progresso-casa').textContent).toBe('Etapa 3 de 24: Pilares');
    t.rerender({ casa: casa({ plano }) });
    expect(screen.getByTestId('previa-da-casa')).toBeTruthy();
    expect(screen.queryByTestId('hipoteses-da-casa')).toBeNull();
    // Gerar de novo a partir do Relatório: ao terminar, o Relatório continua aberto.
    aba('Relatório');
    t.rerender({ casa: casa({ plano, rodando: true }) });
    t.rerender({ casa: casa({ plano }) });
    expect(screen.getByTestId('pendencias-da-casa')).toBeTruthy();
  });

  it('F28: a chuva de projeto na tela — sem cidade nem intensidade, diz que acima de 100 m² o pluvial não roda; a cidade e a intensidade mexem nas hipóteses do estudo', () => {
    const props = tela({ chuva: { ...HIPOTESES_PLUVIAIS_PADRAO, cidade: null, intensidadeMmH: null }, onChuva: vi.fn() });
    aba('Hipóteses');
    expect(screen.getByTestId('chuva-da-casa').textContent).toMatch(/acima disso o pluvial não roda/);
    const cidade = Object.keys(INTENSIDADE_POR_CIDADE)[0];
    fireEvent.change(screen.getByTestId('chuva-cidade'), { target: { value: cidade } });
    expect(props.onChuva).toHaveBeenCalledWith(expect.objectContaining({ cidade }));
    cleanup();
    tela({ chuva: { ...HIPOTESES_PLUVIAIS_PADRAO, intensidadeMmH: 150 }, onChuva: vi.fn() });
    aba('Hipóteses');
    expect(screen.getByTestId('chuva-da-casa').textContent).toMatch(/150 mm\/h, informada no estudo/);
    cleanup();
    // Sem as hipóteses pluviais (a tela fora do editor), a seção não aparece.
    tela();
    aba('Hipóteses');
    expect(screen.getByTestId('hipoteses-da-casa')).toBeTruthy();
    expect(screen.queryByTestId('chuva-da-casa')).toBeNull();
  });

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
    // A premissa que faltou, à vista em uma linha (a lista mora no Relatório).
    expect(screen.getByTestId('casa-parou').textContent).toContain('Faltam 1 premissa(s): 1 etapa(s) não rodaram.');
    expect(screen.getByTestId('casa-parou').textContent).not.toContain('informe a cidade');
    // O relatório na aba dele: as faltas abertas; os outros grupos recolhidos até o clique.
    aba('Relatório');
    const rel = screen.getByTestId('pendencias-da-casa');
    expect(rel.textContent).toContain('3 trecho(s) passando por porta ou janela');
    expect(rel.textContent).not.toContain('confira o padrão da concessionária');
    fireEvent.click(within(rel).getByRole('button', { name: /CONFERIR NA NORMA/ }));
    expect(rel.textContent).toContain('confira o padrão da concessionária');
    // "Ver no relatório" abre o Relatório no grupo das premissas.
    aba('Resultado');
    fireEvent.click(screen.getByTestId('ver-premissas-faltando'));
    expect(screen.getByTestId('pendencias-da-casa').textContent).toContain('informe a cidade');
    expect(screen.getByTestId('pendencias-da-casa').textContent).not.toContain('3 trecho(s) passando por porta ou janela');
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
    aba('Hipóteses');
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
    // Na térrea escolhida, as hipóteses do sobrado somem; no Automático (o padrão, F22) e no sobrado, aparecem.
    tela({ onPremissas, premissas: { ...PREMISSAS_DA_CASA_PADRAO, pavimentos: 1 } });
    aba('Hipóteses');
    expect(screen.getByTestId('hipoteses-da-casa')).toBeTruthy();
    expect(screen.queryByLabelText('Laje entre os pavimentos (cm)')).toBeNull();
    aba('Programa');
    fireEvent.change(screen.getByLabelText('Pavimentos'), { target: { value: '2' } });
    expect(onPremissas).toHaveBeenLastCalledWith(expect.objectContaining({ pavimentos: 2 }));
    fireEvent.change(screen.getByLabelText('Pavimentos'), { target: { value: 'AUTOMATICO' } });
    expect(onPremissas).toHaveBeenLastCalledWith(expect.objectContaining({ pavimentos: 'AUTOMATICO' }));
    cleanup();
    tela({});
    aba('Hipóteses');
    expect(screen.getByLabelText('Laje entre os pavimentos (cm)')).toBeTruthy();
    cleanup();

    const doSobrado = { ...plano, sobrado: { nivelSuperiorId: 'lvl_0002', nucleo: { lado: 'DIREITA' }, escada: { degraus: 17, espelhoMm: 171, pisoMm: 306, blondelMm: 647 }, portas: { terreo: 'Sala', superior: 'Circulação' } } } as unknown as PlanoDaCasa;
    tela({ premissas: { ...PREMISSAS_DA_CASA_PADRAO, pavimentos: 2 }, casa: casa({ plano: doSobrado }) });
    expect(screen.getByTestId('sobrado-da-casa').textContent).toMatch(/17 degraus de 171 × 306 mm/);
    expect(screen.getByTestId('lancar-casa').textContent).toBe('Lançar os dois pavimentos');
    aba('Hipóteses');
    expect((screen.getByLabelText('Laje entre os pavimentos (cm)') as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('Shaft das instalações (cm)') as HTMLInputElement).value).toBe('40');
  });

  it('F27-D4: 3 pavimentos — o seletor grava 3; o resumo diz as duas escadas e o terraço; o botão, os três pavimentos', () => {
    const onPremissas = vi.fn();
    tela({ onPremissas, premissas: { ...PREMISSAS_DA_CASA_PADRAO, pavimentos: 1 } });
    fireEvent.change(screen.getByLabelText('Pavimentos'), { target: { value: '3' } });
    expect(onPremissas).toHaveBeenLastCalledWith(expect.objectContaining({ pavimentos: 3 }));
    cleanup();
    const deTres = {
      ...plano,
      sobrado: { nivelSuperiorId: 'lvl_0002', nucleo: { lado: 'DIREITA' }, escada: { degraus: 17, espelhoMm: 171, pisoMm: 306, blondelMm: 647 }, portas: { terreo: 'Sala', superior: 'Circulação' }, segundo: { nivelId: 'lvl_0003', retangulo: { x0: 0, y0: 0, x1: 5400, y1: 6000 }, porta: 'Circulação', terracoM2: 64.08 } },
    } as unknown as PlanoDaCasa;
    tela({ premissas: { ...PREMISSAS_DA_CASA_PADRAO, pavimentos: 3 }, casa: casa({ plano: deTres }) });
    expect(screen.getByTestId('sobrado-da-casa').textContent).toMatch(/duas escadas em U.*terraço de 64,1 m²/s);
    expect(screen.getByTestId('lancar-casa').textContent).toBe('Lançar os três pavimentos');
    aba('Programa');
    expect((screen.getByLabelText('Pavimentos') as HTMLSelectElement).value).toBe('3');
  });

  it('F14b: o forro — ligado mostra o pé-direito livre de cada uso e o piso; desligar muda a premissa e esconde os campos', () => {
    const onPremissas = vi.fn();
    tela({ onPremissas });
    aba('Hipóteses');
    expect((screen.getByTestId('forro-da-casa') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Pé-direito livre: sala, dormitório, cozinha (m)') as HTMLInputElement).value).toBe('2.5');
    expect((screen.getByLabelText('Pé-direito livre: banheiro, serviço, circulação (m)') as HTMLInputElement).value).toBe('2.3');
    expect((screen.getByLabelText('Piso acabado (cm)') as HTMLInputElement).value).toBe('5');
    fireEvent.click(screen.getByTestId('forro-da-casa'));
    expect(onPremissas).toHaveBeenLastCalledWith(expect.objectContaining({ forro: expect.objectContaining({ lancar: false }) }));
    cleanup();
    tela({ premissas: { ...PREMISSAS_DA_CASA_PADRAO, forro: { ...PREMISSAS_DA_CASA_PADRAO.forro, lancar: false } } });
    aba('Hipóteses');
    expect(screen.getByTestId('forro-da-casa')).toBeTruthy();
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
    expect(screen.queryByTestId('furos-da-casa')).toBeNull();
    expect(nomesDasAbas()).toContain('Furos3');
    aba('Furos');
    const sec = screen.getByTestId('furos-da-casa');
    expect(sec.textContent).toContain('Furos previstos para o calculista');
    expect(sec.textContent).toContain('3 furo(s)');
    expect(sec.textContent).toContain('1 dispensam a verificação');
    expect(sec.textContent).toContain('1 a verificar com o calculista');
    expect(sec.textContent).toContain('dispensa a verificação');
    expect(sec.textContent).toContain('verificar com o calculista');
    expect(sec.textContent).toContain('a 26 cm do apoio (pede 80 cm)');
    expect(sec.textContent).toContain('passagem na laje');
    expect(sec.textContent).toContain('Térreo');
    expect(sec.textContent).toContain('5,2');
    // Sem furos, nem a aba nem a seção.
    cleanup();
    tela({ casa: casa({ plano }) });
    expect(screen.queryByRole('tab', { name: /^Furos/ })).toBeNull();
    expect(screen.queryByTestId('furos-da-casa')).toBeNull();
  });
  it('F25: o platô no terreno inclinado — a cota, os volumes, os muros e a entrada; e os campos das premissas', () => {
    const terraplenagem = {
      cotaDoPlatoM: 100.942, elevacaoDoTerreoMm: 1092, platoNoMundo: [], areaPlatoM2: 211.6, corteM3: 59.1, aterroM3: 61.2, botaForaM3: 0, emprestimoM3: 11.2,
      alturaMaxCorteM: 0.7, alturaMaxAterroM: 0.96, areaTaludeM2: 47, bordas: [], murosComprimentoM: 38.1, murosAreaDeFaceM2: 18.3,
      entrada: { tipo: 'ESCADA', desnivelMm: 1092, comprimentoMm: 1960, degraus: 7, espelhoMm: 156, cabe: true }, parametros: {},
    };
    tela({ casa: casa({ plano: { ...plano, resumo: { ...plano.resumo, terraplenagem } } as unknown as PlanoDaCasa }) });
    aba('Terraplenagem');
    const sec = screen.getByTestId('terraplenagem-do-plano');
    expect(sec.textContent).toContain('Platô a 100,942 m');
    expect(sec.textContent).toContain('corte 59,1 m³');
    expect(sec.textContent).toContain('empréstimo 11,2 m³');
    expect(sec.textContent).toContain('muros de arrimo 38,1 m');
    expect(sec.textContent).toContain('escada de 7 degrau(s) de 156 mm');
    // as premissas: ligada mostra os campos; desligada, esconde
    aba('Hipóteses');
    expect(screen.getByLabelText('Talude até (m de altura; acima, muro)')).toBeTruthy();
    cleanup();
    tela({ casa: casa({ plano }), premissas: { ...PREMISSAS_DA_CASA_PADRAO, terraplenagem: { ...PREMISSAS_DA_CASA_PADRAO.terraplenagem, lancar: false } } });
    expect(screen.queryByRole('tab', { name: /^Terraplenagem/ })).toBeNull();
    expect(screen.queryByTestId('terraplenagem-do-plano')).toBeNull();
    aba('Hipóteses');
    expect(screen.getByTestId('terraplenagem-da-casa')).toBeTruthy();
    expect(screen.queryByLabelText('Talude até (m de altura; acima, muro)')).toBeNull();
  });
});
