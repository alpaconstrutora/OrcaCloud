/**
 * CASA PELO EMPREENDIMENTO (25/10/2026): os passos do "Construir pelo Empreendimento" — lote pela ficha, zona,
 * unidade e gerar — e o lote retangular que sai da ficha. Plano: docs/planos/2026-10-25-planta-construir-pelo-empreendimento.md.
 */
import { describe, expect, it } from 'vitest';
import { loteDaFichaParaLancar, passosDaCasaPeloEmpreendimento, type EntradaDosPassos } from '../utils/blueprintCasaPeloEmpreendimento';
import type { DadosDoEmpreendimentoParaPlanta } from '../utils/blueprintDadosDoEmpreendimento';
import { applyBatch, applyCommand, emptyModel } from '../utils/blueprintKernel';
import { azimuteDaDirecaoExato, comandosDoLote } from '../utils/blueprintLoteDigitado';
import { motivoParaNaoGerar } from '../utils/blueprintCasaAutomatica';

const LOTE: NonNullable<DadosDoEmpreendimentoParaPlanta['lote']> = {
  frenteMm: 12000,
  fundosMm: null,
  profundidadeMm: 30000,
  profundidadePelaAreaMm: 30000,
  areaM2: 360,
  origem: 'Garden',
  frenteVoltadaPara: null,
};

const base: EntradaDosPassos = {
  temPavimento: true,
  pavimentoComParedes: false,
  temLote: false,
  loteDaFicha: LOTE,
  motivoSemLoteNaFicha: null,
  zonaAplicada: null,
  zonasDoEmpreendimento: 1,
  unidades: [{ id: 'u1', rotulo: 'Casa · 01' }],
  unidadeId: null,
  motivoParaNaoGerar: 'Desenhe o lote (as divisas do terreno) neste pavimento — a casa se implanta dentro dele.',
};

const passo = (e: EntradaDosPassos, id: string) => passosDaCasaPeloEmpreendimento(e).passos.find((x) => x.passo === id)!;
const estados = (e: EntradaDosPassos) => Object.fromEntries(passosDaCasaPeloEmpreendimento(e).passos.map((p) => [p.passo, p.estado]));

describe('passosDaCasaPeloEmpreendimento', () => {
  it('tudo na ficha, uma zona e uma unidade: os quatro passos são feitos pelo botão', () => {
    const r = passosDaCasaPeloEmpreendimento(base);
    expect(estados(base)).toEqual({ LOTE: 'FAZER', LOCAL: 'AVISO', ZONA: 'FAZER', UNIDADE: 'FAZER', GERAR: 'FAZER' });
    expect(r.motivoDoBotao).toBeNull();
    expect(r.parada).toBeNull();
    // A orientação não está na ficha — o texto do passo diz para conferir.
    expect(r.passos[0].texto).toMatch(/12,00 × 30,00 m/);
    expect(r.passos[0].texto).toMatch(/orientação/);
  });

  it('o que já está feito aparece feito e o botão só gera', () => {
    const e: EntradaDosPassos = { ...base, temLote: true, zonaAplicada: 'ZR-2', unidadeId: 'u1', motivoParaNaoGerar: null };
    expect(estados(e)).toEqual({ LOTE: 'FEITO', LOCAL: 'AVISO', ZONA: 'FEITO', UNIDADE: 'FEITO', GERAR: 'FAZER' });
    expect(passo(e, 'ZONA').texto).toMatch(/ZR-2/);
  });

  it('profundidade da ficha que não fecha a área: o lote PERGUNTA, e o botão para nele', () => {
    const e: EntradaDosPassos = { ...base, loteDaFicha: { ...LOTE, profundidadeMm: 71000, profundidadePelaAreaMm: 63030 } };
    const r = passosDaCasaPeloEmpreendimento(e);
    expect(estados(e).LOTE).toBe('PERGUNTAR');
    expect(r.parada).toBe('LOTE');
    expect(r.motivoDoBotao).toBeNull(); // o botão segue ligado: ele leva à pergunta
    expect(r.passos[0].texto).toMatch(/71,00 m.*63,03 m/);
    // 1 cm de diferença é a mesma profundidade (a régua do painel do lote).
    expect(estados({ ...base, loteDaFicha: { ...LOTE, profundidadeMm: 30000, profundidadePelaAreaMm: 30008 } }).LOTE).toBe('FAZER');
  });

  it('ficha sem frente ou profundidade: FALTA, e o botão desliga com o motivo da ficha', () => {
    const e: EntradaDosPassos = { ...base, loteDaFicha: null, motivoSemLoteNaFicha: 'A ficha não tem a testada/frente — preencha em Torres & Unidades › Terreno.' };
    const r = passosDaCasaPeloEmpreendimento(e);
    expect(estados(e).LOTE).toBe('FALTA');
    expect(r.motivoDoBotao).toMatch(/testada/);
  });

  it('várias zonas: PERGUNTA (não chuta); nenhuma: só avisa, a casa sai sem os índices da lei', () => {
    expect(estados({ ...base, zonasDoEmpreendimento: 3 }).ZONA).toBe('PERGUNTAR');
    const sem = passosDaCasaPeloEmpreendimento({ ...base, zonasDoEmpreendimento: 0 });
    expect(sem.passos.find((x) => x.passo === 'ZONA')!.estado).toBe('AVISO');
    expect(sem.motivoDoBotao).toBeNull();
    // Carregando: o botão espera.
    expect(passosDaCasaPeloEmpreendimento({ ...base, zonasDoEmpreendimento: null }).motivoDoBotao).toMatch(/zonas/i);
  });

  it('várias unidades: PERGUNTA; nenhuma: o programa da tela vale, com aviso', () => {
    const varias = passosDaCasaPeloEmpreendimento({ ...base, unidades: [{ id: 'u1', rotulo: 'A' }, { id: 'u2', rotulo: 'B' }] });
    expect(varias.passos.find((x) => x.passo === 'UNIDADE')!.estado).toBe('PERGUNTAR');
    expect(varias.parada).toBe('UNIDADE');
    const nenhuma = passosDaCasaPeloEmpreendimento({ ...base, unidades: [] });
    expect(nenhuma.passos.find((x) => x.passo === 'UNIDADE')!.estado).toBe('AVISO');
    expect(nenhuma.parada).toBeNull();
  });

  it('a primeira pergunta é a parada — as de depois esperam', () => {
    const r = passosDaCasaPeloEmpreendimento({ ...base, zonasDoEmpreendimento: 2, unidades: [{ id: 'u1', rotulo: 'A' }, { id: 'u2', rotulo: 'B' }] });
    expect(r.parada).toBe('ZONA');
  });

  it('pavimento com paredes ou sem pavimento: FALTA no gerar, com o motivo da casa', () => {
    const paredes = passosDaCasaPeloEmpreendimento({ ...base, pavimentoComParedes: true, motivoParaNaoGerar: 'O pavimento já tem paredes — a casa automática nasce num pavimento vazio.' });
    expect(paredes.passos.find((x) => x.passo === 'GERAR')!.estado).toBe('FALTA');
    expect(paredes.motivoDoBotao).toMatch(/paredes/);
    expect(passosDaCasaPeloEmpreendimento({ ...base, temPavimento: false }).motivoDoBotao).toMatch(/pavimento/);
  });

  it('com o lote já desenhado, o motivo da casa (ex.: sem FRENTE) desliga o botão', () => {
    const r = passosDaCasaPeloEmpreendimento({ ...base, temLote: true, motivoParaNaoGerar: 'Marque a divisa da FRENTE do lote' });
    expect(r.passos.find((x) => x.passo === 'GERAR')!.estado).toBe('FALTA');
    expect(r.motivoDoBotao).toMatch(/FRENTE/);
  });
});

describe('orientação e coordenadas da ficha (26/10/2026)', () => {
  it('com o azimute na ficha, o passo do lote diz para onde a frente está voltada (sem pedir conferência)', () => {
    const t = passo({ ...base, loteDaFicha: { ...LOTE, frenteVoltadaPara: 90 } }, 'LOTE').texto;
    expect(t).toMatch(/Frente voltada para o Leste \(90°\)/);
    expect(t).not.toMatch(/não tem a orientação/);
  });

  it('coordenadas na ficha e desenho sem georreferência: o botão georreferencia; já georreferenciado: não sobrescreve', () => {
    expect(passo({ ...base, coordenadasDaFicha: { latitude: -19.9, longitude: -43.9 } }, 'LOCAL').estado).toBe('FAZER');
    expect(passo({ ...base, coordenadasDaFicha: { latitude: -19.9, longitude: -43.9 }, temGeorreferencia: true }, 'LOCAL').estado).toBe('FEITO');
    // Sem coordenadas: só aviso, o botão segue ligado.
    const sem = passosDaCasaPeloEmpreendimento(base);
    expect(sem.passos.find((x) => x.passo === 'LOCAL')!.estado).toBe('AVISO');
    expect(sem.motivoDoBotao).toBeNull();
  });

  it.each([0, 90, 180, 225])('o lote lançado tem a FRENTE voltada para o azimute da ficha (%i°)', (az) => {
    const l = loteDaFichaParaLancar({ ...LOTE, frenteVoltadaPara: az }, 0);
    expect(l.problema).toBeNull();
    const i = l.lados.findIndex((x) => x.papel === 'FRENTE');
    const a = l.anel[i];
    const b = l.anel[(i + 1) % l.anel.length];
    // A normal para FORA do lote numa aresta do anel (o anel do lote digitado é horário: a de fora fica à esquerda).
    const centro = l.anel.reduce((s, p) => ({ x: s.x + p.x / l.anel.length, y: s.y + p.y / l.anel.length }), { x: 0, y: 0 });
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const fora = { x: meio.x - centro.x, y: meio.y - centro.y };
    expect(azimuteDaDirecaoExato(fora, 0)).toBeCloseTo(az % 360, 0);
  });
});

describe('loteDaFichaParaLancar', () => {
  it('retângulo da ficha, fechado e pronto para lançar, com a frente marcada', () => {
    const l = loteDaFichaParaLancar(LOTE, 0);
    expect(l.problema).toBeNull();
    expect(l.areaMm2 / 1e6).toBeCloseTo(360, 3);
    expect(l.lados.some((x) => x.papel === 'FRENTE')).toBe(true);
  });

  it('trapézio quando os fundos diferem; profundidade só pela área = laterais calculadas', () => {
    const l = loteDaFichaParaLancar({ ...LOTE, fundosMm: 10000, profundidadeMm: null, profundidadePelaAreaMm: 32730 }, 0);
    expect(l.problema).toBeNull();
    expect(l.areaMm2 / 1e6).toBeCloseTo(((12 + 10) / 2) * 32.73, 1);
  });

  it('lançado no desenho (o que o botão faz), a casa deixa de ter motivo para não gerar — a FRENTE vem junto', () => {
    const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
    const levelId = m.levels[0].id;
    expect(motivoParaNaoGerar(m, levelId)).toMatch(/Desenhe o lote/);
    const depois = applyBatch(m, comandosDoLote(m, levelId, loteDaFichaParaLancar(LOTE, 0), { medidasDaEscritura: true })).model;
    expect(motivoParaNaoGerar(depois, levelId)).toBeNull();
  });

  it('profundidade ambígua não é lançada', () => {
    expect(loteDaFichaParaLancar({ ...LOTE, profundidadeMm: 71000, profundidadePelaAreaMm: 63030 }, 0).problema).toMatch(/profundidade/i);
  });
});
