/**
 * F7 do plano `2026-10-11-planta-recursos-video-synaps.md` — A REGIÃO HACHURADA COMO FORMA DE
 * DESENHO (kernel 0.97.0): material (F6), fundo opaco, tracejado próprio, plano de FUNDO e ordem.
 */
import { describe, expect, it } from 'vitest';
import {
  KernelError,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type Anotacao,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import { anotacoesNaOrdem, cantosDoRetangulo, linhasDaRegiao, ordemAoMover, tracejadoMm } from '../utils/blueprintAnotacoes';
import { DesenhistaDeProva, PAPEIS, desenharPlanta, enquadrar } from '../utils/blueprintExport';

const QUADRADO = [point(1000, 1000), point(3000, 1000), point(3000, 2500), point(1000, 2500)];

function base(): { m: BlueprintModel; levelId: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, levelId: m.levels[0].id };
}
const vista = (levelId: string) => ({ tipo: 'PLANTA' as const, levelId });

describe('região hachurada — o kernel 0.97.0 (F7)', () => {
  it('grava material, fundo, tracejado, plano e ordem, e eles sobrevivem à ida e volta do canônico', () => {
    const { m, levelId } = base();
    const r = applyCommand(m, {
      type: 'AddAnotacao',
      vista: vista(levelId),
      tipo: 'HACHURA',
      pontos: QUADRADO,
      material: { padrao: 'TABUA', escalaPct: 150, rotacaoGraus: 45 },
      fundo: '#ffffff',
      traco: 'TRACEJADO',
      tracejadoMm: [200, 80],
      plano: 'FUNDO',
      ordem: -2,
    }).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(r))).anotacoes![0];
    expect(volta.material).toEqual({ padrao: 'TABUA', escalaPct: 150, rotacaoGraus: 45 });
    expect(volta.fundo).toBe('#ffffff');
    expect(volta.tracejadoMm).toEqual([200, 80]);
    expect(volta.plano).toBe('FUNDO');
    expect(volta.ordem).toBe(-2);
  });

  it('anotação SEM os campos novos sai no canônico sem as chaves — desenho antigo só muda pela versão', () => {
    const { m, levelId } = base();
    const r = applyCommand(m, { type: 'AddAnotacao', vista: vista(levelId), tipo: 'HACHURA', pontos: QUADRADO }).model;
    const txt = canonicalPayload(r);
    for (const chave of ['material', 'fundo', 'tracejadoMm', '"plano"', '"ordem"']) expect(txt, chave).not.toContain(chave);
  });

  it('SetAnotacaoProps com null REMOVE a chave (volta à forma de antes)', () => {
    const { m, levelId } = base();
    let r = applyCommand(m, { type: 'AddAnotacao', vista: vista(levelId), tipo: 'HACHURA', pontos: QUADRADO, fundo: '#ffffff', plano: 'FUNDO', ordem: 3 }).model;
    const id = r.anotacoes![0].id;
    r = applyCommand(r, { type: 'SetAnotacaoProps', anotacaoId: id, fundo: null, plano: null, ordem: null }).model;
    const a = r.anotacoes![0];
    expect('fundo' in a || 'plano' in a || 'ordem' in a).toBe(false);
  });

  it('material, fundo e plano só na região hachurada; cor, tracejado e ordem validados', () => {
    const { m, levelId } = base();
    const v = vista(levelId);
    const ruins = [
      { tipo: 'LINHA' as const, pontos: [point(0, 0), point(1000, 0)], fundo: '#ffffff' },
      { tipo: 'TEXTO' as const, pontos: [point(0, 0)], plano: 'FUNDO' as const },
      { tipo: 'HACHURA' as const, pontos: QUADRADO, fundo: 'branco' },
      { tipo: 'HACHURA' as const, pontos: QUADRADO, tracejadoMm: [0, 80] as [number, number] },
      { tipo: 'HACHURA' as const, pontos: QUADRADO, ordem: 1.5 },
      { tipo: 'HACHURA' as const, pontos: QUADRADO, material: { padrao: 'TIJOLO' as const, escalaPct: 5, rotacaoGraus: 0 } },
    ];
    for (const r of ruins) expect(() => applyCommand(m, { type: 'AddAnotacao', vista: v, ...r }), JSON.stringify(r)).toThrow(KernelError);
  });
});

describe('região hachurada — a geometria e a ordem (F7)', () => {
  const ant = (id: string, over: Partial<Anotacao> = {}): Anotacao =>
    ({ id, uid: id, vista: { tipo: 'PLANTA', levelId: 'l' }, tipo: 'HACHURA', pontos: QUADRADO, texto: null, alturaMm: 250, traco: 'CONTINUO', hachura: 'DIAGONAL', rotacaoGraus: 0, cor: null, ...over }) as Anotacao;

  it('separa FRENTE e FUNDO e ordena por `ordem`, estável', () => {
    const lista = [ant('a'), ant('b', { ordem: -1 }), ant('c', { plano: 'FUNDO', ordem: 2 }), ant('d', { plano: 'FUNDO', ordem: -5 }), ant('e')];
    expect(anotacoesNaOrdem(lista, 'FRENTE').map((x) => x.id)).toEqual(['b', 'a', 'e']);
    expect(anotacoesNaOrdem(lista, 'FUNDO').map((x) => x.id)).toEqual(['d', 'c']);
  });

  it('Trazer para frente / Enviar para trás: acima de todas da frente; abaixo de todas do fundo; só a hachura vai ao fundo', () => {
    const lista = [ant('a', { ordem: 4 }), ant('b'), ant('c', { plano: 'FUNDO', ordem: -3 })];
    expect(ordemAoMover(lista, lista[1], 'FRENTE')).toEqual({ plano: null, ordem: 5 });
    expect(ordemAoMover(lista, lista[0], 'FRENTE')).toBeNull(); // já está por cima
    expect(ordemAoMover(lista, lista[1], 'TRAS')).toEqual({ plano: 'FUNDO', ordem: -4 });
    expect(ordemAoMover(lista, ant('t', { tipo: 'TEXTO', pontos: [point(0, 0)] }), 'TRAS')).toBeNull();
  });

  it('retângulo pelos cantos opostos: 4 vértices; sem largura ou altura, nada', () => {
    expect(cantosDoRetangulo(point(0, 0), point(2000, 1000))).toEqual([point(0, 0), point(2000, 0), point(2000, 1000), point(0, 1000)]);
    expect(cantosDoRetangulo(point(0, 0), point(2000, 0))).toBeNull();
  });

  it('com material, as linhas são as do padrão da F6; sem, as do padrão simples', () => {
    const simples = linhasDaRegiao(ant('s'));
    const tabua = linhasDaRegiao(ant('m', { material: { padrao: 'TABUA', escalaPct: 100, rotacaoGraus: 0 } }));
    expect(simples.length).toBeGreaterThan(0);
    expect(tabua.length).toBeGreaterThan(0);
    expect(tabua).not.toEqual(simples);
  });

  it('tracejado próprio só vale no TRACEJADO', () => {
    expect(tracejadoMm('TRACEJADO', 250, [200, 80])).toEqual([200, 80]);
    expect(tracejadoMm('PONTILHADO', 250, [200, 80])).not.toEqual([200, 80]);
    expect(tracejadoMm('TRACEJADO', 250)).toEqual([250, 125]);
  });
});

describe('região hachurada — o PDF (F7)', () => {
  it('a do plano de FUNDO sai ANTES das paredes; a da FRENTE, depois — o tapete não cobre a parede', () => {
    const { m: m0, levelId } = base();
    let m = applyCommand(m0, { type: 'AddWall', levelId, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 }).model;
    m = applyCommand(m, { type: 'AddAnotacao', vista: vista(levelId), tipo: 'HACHURA', pontos: QUADRADO, fundo: '#123456', plano: 'FUNDO' }).model;
    m = applyCommand(m, { type: 'AddAnotacao', vista: vista(levelId), tipo: 'HACHURA', pontos: QUADRADO, fundo: '#654321' }).model;
    const d = new DesenhistaDeProva();
    const op = { denominador: 50, papel: PAPEIS[0], titulo: 't', revisao: 1, hash: 'h', data: new Date('2026-10-11T12:00:00Z') } as Parameters<typeof desenharPlanta>[2];
    desenharPlanta(d, m, op, enquadrar(m, 50, PAPEIS[0], true));
    const iFundo = d.chamadas.findIndex((c) => c.tipo === 'poligono' && c.args[1] === '#123456');
    const iFrente = d.chamadas.findIndex((c) => c.tipo === 'poligono' && c.args[1] === '#654321');
    // A silhueta da parede: a linha preta grossa (espessura da parede no papel = 150/50 = 3 mm).
    const iParede = d.chamadas.findIndex((c) => c.tipo === 'linha' && (c.args[4] as { espessuraMm: number; cor: string }).cor === '#000000' && (c.args[4] as { espessuraMm: number }).espessuraMm >= 2.9);
    expect(iFundo).toBeGreaterThanOrEqual(0);
    expect(iParede).toBeGreaterThanOrEqual(0);
    expect(iFrente).toBeGreaterThanOrEqual(0);
    expect(iFundo).toBeLessThan(iParede);
    expect(iFrente).toBeGreaterThan(iParede);
  });
});
