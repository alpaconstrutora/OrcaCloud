/**
 * E10.3 do roadmap de climatização (08/10/2026): o EDITOR no 3D — a parte pura.
 * A seleção por modificador (a mesma regra do 2D), o arraste do 3D virando
 * deslocamento no modelo (sinal e eixos), a caixa de corte (o que os planos
 * deixam ver), o comando de mover (um passo de Ctrl+Z) e as bolsas do 3D da
 * tela iguais às do IFC (duto retangular; a curva da linha não é peça).
 */
import { describe, expect, it } from 'vitest';
import { ModelHistory, applyBatch, applyCommand, conexaoViraPeca, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { caixaInicial, deltaDoMundoParaModelo, deltaVerticalMm, dentroDaCaixa, limitarCaixa, planosDaCaixaDeCorte, selecaoDoClique } from '../utils/blueprint3dSelecao';
import { comandoDeMover, comandosDeElevar, pontoDaAlca } from '../utils/blueprintSelecao';
import { pecasDasConexoes3D } from '../utils/blueprintIsometrico';
import { cilindroDoTrecho } from '../utils/blueprintRede';

function nivel() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}

describe('E10.3 · seleção no 3D', () => {
  it('sem modificador a seleção vira a peça; com Shift, Ctrl ou ⌘ acumula — e o segundo clique tira', () => {
    expect(selecaoDoClique(['a', 'b'], 'c', {})).toEqual(['c']);
    expect(selecaoDoClique(['a'], 'b', { shiftKey: true })).toEqual(['a', 'b']);
    expect(selecaoDoClique(new Set(['a', 'b']), 'a', { ctrlKey: true })).toEqual(['b']);
    expect(selecaoDoClique([], 'a', { metaKey: true })).toEqual(['a']);
  });
});

describe('E10.3 · o arraste do 3D no modelo', () => {
  it('X do 3D é o x da planta, Z do 3D é o y (sem troca de sinal); a altura é ignorada; arredonda ao passo', () => {
    expect(deltaDoMundoParaModelo([0.5, 3, -1.234])).toEqual({ x: 500, y: -1230 });
    expect(deltaDoMundoParaModelo([0.0049, 0, 0])).toEqual({ x: 0, y: 0 });
    expect(deltaDoMundoParaModelo([1.2345, 0, 0], 1)).toEqual({ x: 1235, y: 0 });
  });

  it('⚠️ o sinal confere com o desenho: o trecho que vai a +y no modelo vai a +Z no 3D', () => {
    const { m, t } = nivel();
    const comTrecho = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(0, 0), b: point(0, 1000), cotaAMm: 0, cotaBMm: 0, bitolaMm: 25 } as Command).model;
    const c = cilindroDoTrecho(comTrecho.trechos![0], 0);
    expect(c.eixo).toEqual([0, 0, 1]);
    expect(deltaDoMundoParaModelo([c.eixo[0], c.eixo[1], c.eixo[2]], 1)).toEqual({ x: 0, y: 1000 });
  });
});

describe('E10.3 · a caixa de corte', () => {
  const caixa = { min: [0, 0, 0] as [number, number, number], max: [10, 3, 8] as [number, number, number] };
  it('os seis planos deixam ver SÓ o miolo da caixa', () => {
    expect(planosDaCaixaDeCorte(caixa)).toHaveLength(6);
    expect(dentroDaCaixa(caixa, [5, 1.5, 4])).toBe(true);
    expect(dentroDaCaixa(caixa, [0, 0, 0])).toBe(true);
    expect(dentroDaCaixa(caixa, [-0.1, 1, 1])).toBe(false);
    expect(dentroDaCaixa(caixa, [5, 3.1, 4])).toBe(false);
    expect(dentroDaCaixa(caixa, [5, 1, 8.5])).toBe(false);
  });
  it('a caixa inicial é o enquadramento com folga; o min nunca passa do max', () => {
    expect(caixaInicial({ centro: [5, 1.5, 4], raio: [5, 1.5, 4] }, 0.5)).toEqual({ min: [-0.5, -0.5, -0.5], max: [10.5, 3.5, 8.5] });
    expect(limitarCaixa({ min: [9, 0, 0], max: [5, 3, 8] }, 0.05).min[0]).toBeCloseTo(4.95, 9);
  });
});

describe('E10.3 · mover no 3D = um TranslateEntities = um Ctrl+Z', () => {
  it('⚠️ parede, terminal e componente se movem no mesmo comando; o desfazer devolve o desenho', () => {
    const { m, t } = nivel();
    const base = applyBatch(m, [
      { type: 'AddWall', levelId: t, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(2000, 3000), cotaMm: 2200 } as Command,
      { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(6000, 0) } as Command,
    ]).model;
    const ids = [base.walls[0].id, base.terminais![0].id, base.componentes![0].id];
    const cmd = comandoDeMover(base, ids, { x: 500, y: -200 }, false)!;
    expect(cmd).toMatchObject({ type: 'TranslateEntities', wallIds: [ids[0]], terminalIds: [ids[1]], componenteIds: [ids[2]] });
    const h = new ModelHistory(base);
    h.apply(cmd);
    expect(h.current.walls[0].a).toEqual({ x: 500, y: -200 });
    expect(h.current.terminais![0].at).toEqual({ x: 2500, y: 2800 });
    expect(h.current.componentes![0].at).toEqual({ x: 6500, y: -200 });
    h.undo();
    expect(h.current.walls[0].a).toEqual({ x: 0, y: 0 });
    expect(h.current.terminais![0].at).toEqual({ x: 2000, y: 3000 });
    expect(h.current.componentes![0].at).toEqual({ x: 6000, y: 0 });
  });
  it('a alça fica no centro em planta da seleção, a meio pé-direito do pavimento (metro, Y para cima)', () => {
    const { m, t } = nivel();
    const base = applyBatch(m, [
      { type: 'AddWall', levelId: t, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 } as Command,
      { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(4000, 2000) } as Command,
    ]).model;
    const p = pontoDaAlca(base, [base.walls[0].id, base.componentes![0].id])!;
    expect(p[1]).toBeCloseTo(1.4, 9);
    expect(p[0]).toBeGreaterThan(1.5);
    expect(p[2]).toBeGreaterThan(0.5);
    expect(pontoDaAlca(base, [])).toBeNull();
  });

  it('deslocamento zero ou seleção sem nada móvel: nenhum comando', () => {
    const { m, t } = nivel();
    const base = applyCommand(m, { type: 'AddWall', levelId: t, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 } as Command).model;
    expect(comandoDeMover(base, [base.walls[0].id], { x: 0, y: 0 }, false)).toBeNull();
    expect(comandoDeMover(base, ['nao-existe'], { x: 100, y: 0 }, false)).toBeNull();
  });
});

describe('E10.3 · as bolsas do 3D da tela = as do IFC', () => {
  it('o joelho do duto 400×250: duas bolsas RETANGULARES 440×275, 250 mm, com a base do duto; sem esfera no nó', () => {
    const { m, t } = nivel();
    const duto = (a: [number, number], b: [number, number]): Command => ({ type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(...a), b: point(...b), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 400, alturaDutoMm: 250 }) as Command;
    const mm = applyBatch(m, [duto([0, 0], [3000, 0]), duto([3000, 0], [3000, 3000])]).model;
    const [p] = pecasDasConexoes3D(mm);
    expect(p.tipo).toBe('JOELHO_90');
    expect(p.corpo).toBeNull();
    expect(p.bolsas).toHaveLength(2);
    for (const b of p.bolsas) {
      expect(b.retangular!.larguraM).toBeCloseTo(0.44, 9);
      expect(b.retangular!.alturaM).toBeCloseTo(0.275, 9);
      expect(b.comprimentoM).toBeCloseTo(0.25, 9);
      expect(b.retangular!.base.y).toEqual(b.eixo);
    }
    // A base da bolsa é a mesma do duto daquele lado (giram igual).
    const doDuto = cilindroDoTrecho(mm.trechos![0], 0).retangular!.base;
    const bolsa = p.bolsas.find((b) => Math.abs(b.eixo[0]) > 0.99)!;
    expect(Math.abs(bolsa.retangular!.base.z[1])).toBeCloseTo(Math.abs(doDuto.z[1]), 9);
  });

  it('a curva da linha frigorígena não é peça (o mesmo predicado do IFC); o tê dela continua', () => {
    const { m, t } = nivel();
    const linha = (a: [number, number], b: [number, number]): Command => ({ type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(...a), b: point(...b), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, bitolaSuccaoMm: 10 }) as Command;
    const curva = applyBatch(m, [linha([0, 0], [3000, 0]), linha([3000, 0], [3000, 3000])]).model;
    expect(pecasDasConexoes3D(curva)).toEqual([]);
    expect(conexaoViraPeca({ disciplina: 'FRIGORIGENA', tipo: 'JOELHO_90' })).toBe(false);
    expect(conexaoViraPeca({ disciplina: 'FRIGORIGENA', tipo: 'TE' })).toBe(true);
    const te = applyBatch(m, [linha([0, 0], [3000, 0]), linha([3000, 0], [6000, 0]), linha([3000, 0], [3000, 3000])]).model;
    expect(pecasDasConexoes3D(te).map((x) => x.tipo)).toEqual(['TE']);
  });
});

describe('pendência da E10.3 (10/10/2026) · subir e descer pela seta verde', () => {
  it('o Y do arraste vira mm de cota, ao passo de 10 mm; X e Z não entram', () => {
    expect(deltaVerticalMm([3, 0.5, -2])).toBe(500);
    expect(deltaVerticalMm([0, -0.1234, 0])).toBe(-120);
    expect(deltaVerticalMm([0, 0.004, 0])).toBe(0);
  });

  it('ponto, trecho (as duas pontas), quadro e componente sobem juntos num lote; um Ctrl+Z desce tudo', () => {
    const { m, t } = nivel();
    const base = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(2000, 3000), cotaMm: 2200 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(0, 0), b: point(3000, 0), cotaAMm: 2600, cotaBMm: 2500, bitolaMm: 400, alturaDutoMm: 250 } as Command,
      { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(6000, 0) } as Command,
    ]).model;
    const ids = [base.terminais![0].id, base.trechos![0].id, base.componentes![0].id];
    const r = comandosDeElevar(base, ids, 300);
    if (!r.ok) throw new Error(r.aviso);
    expect(r.aviso).toBeNull();
    const h = new ModelHistory(base);
    h.applyMany(r.comandos);
    expect(h.current.terminais![0].cotaMm).toBe(2500);
    expect([h.current.trechos![0].cotaAMm, h.current.trechos![0].cotaBMm]).toEqual([2900, 2800]);
    expect(h.current.componentes![0].cotaMm).toBe((base.componentes![0].cotaMm ?? 0) + 300);
    h.undo();
    expect(h.current.terminais![0].cotaMm).toBe(2200);
    expect(h.current.trechos![0].cotaAMm).toBe(2600);
  });

  it('o componente para no piso; parede não tem cota própria; o trecho ligado fora da seleção é dito', () => {
    const { m, t } = nivel();
    const base = applyBatch(m, [
      { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(6000, 0) } as Command,
      { type: 'AddWall', levelId: t, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(0, 2000), b: point(3000, 2000), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 400, alturaDutoMm: 250 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(3000, 2000), b: point(3000, 5000), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 400, alturaDutoMm: 250 } as Command,
    ]).model;
    const sofa = base.componentes![0].id;
    const desce = comandosDeElevar(base, [sofa, base.walls[0].id], -500);
    if (!desce.ok) throw new Error(desce.aviso);
    expect(desce.aviso).toMatch(/1 peça\(s\) sem cota própria/);
    expect(desce.aviso).toMatch(/parou\(aram\) no piso/);
    expect(applyBatch(base, desce.comandos).model.componentes![0].cotaMm ?? 0).toBe(0);

    expect(comandosDeElevar(base, [base.walls[0].id], 300)).toMatchObject({ ok: false, aviso: /Nada da seleção tem cota própria/ });
    const umTrecho = comandosDeElevar(base, [base.trechos![0].id], 200);
    expect(umTrecho).toMatchObject({ ok: true, aviso: /1 trecho\(s\) ligado\(s\) fora da seleção/ });
    expect(comandosDeElevar(base, base.trechos!.map((x) => x.id), 200)).toMatchObject({ ok: true, aviso: null });
  });
});

