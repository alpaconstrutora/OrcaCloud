/**
 * E5.4 — VENTILAÇÃO DO ESGOTO (29/09/2026): desconector ventilado ao alcance
 * da tabela (medido pelo tubo), a ventilação primária pelo TQ prolongado, a
 * coluna com o DN da tabela e 30 cm acima da cobertura; e o lançamento.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, point, type BlueprintModel } from '../utils/blueprintKernel';
import {
  ACIMA_DA_COBERTURA_MM,
  coberturaNoPontoMm,
  distanciaMaximaAoVentiladorM,
  dnDaColunaDeVentilacao,
  planejarVentilacao,
  TIPO_DA_VALVULA_DE_ADMISSAO_DE_AR,
  verificarVentilacao,
} from '../utils/blueprintVentilacao';
import { esgotoTrechoATrecho, HIPOTESES_ESGOTO_PADRAO } from '../utils/blueprintEsgotoAutomatico';
import { sobrado } from './fixtures/sobradoHidro';

describe('E5.4 — as tabelas', () => {
  it('distância máxima do desconector ao ventilador pelo DN do ramal de descarga', () => {
    expect([40, 50, 75, 100].map(distanciaMaximaAoVentiladorM)).toEqual([1.0, 1.2, 1.8, 2.4]);
  });

  it('DN da coluna pelo DN do tubo, UHC e comprimento; nunca abaixo de 50 com bacia', () => {
    expect(dnDaColunaDeVentilacao(100, 10, 3, true)).toBe(50);
    expect(dnDaColunaDeVentilacao(100, 10, 12, true)).toBe(75);
    expect(dnDaColunaDeVentilacao(100, 200, 60, true)).toBe(100);
    expect(dnDaColunaDeVentilacao(50, 1, 5, false)).toBe(40);
    expect(dnDaColunaDeVentilacao(50, 1, 30, false)).toBe(50);
  });
});

describe('E5.4 — a cobertura', () => {
  it('sem telhado: o topo do último pavimento; com uma água sobre o ponto, a altura dela ali', () => {
    const m = sobrado(true);
    expect(coberturaNoPontoMm(m, { x: 1000, y: 1000 })).toBe(2900 + 2800);
    const sup = m.levels[1].id;
    const comTelhado = applyCommand(m, {
      type: 'AddAgua', levelId: sup, pontos: [point(0, 0), point(4500, 0), point(4500, 3000), point(0, 3000)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100,
    } as never).model;
    // A 1 m do beiral (y = 0): 2,90 + 2,80 + 0,30 + 0,10.
    expect(coberturaNoPontoMm(comTelhado, { x: 1000, y: 1000 })).toBe(2900 + 2800 + 300 + 100);
  });
});

describe('E5.4 — a verificação', () => {
  it('sobrado: os vasos ventilados pelo TQ (ventilação primária); as sifonadas longe demais; a coluna do TQ abaixo da cobertura', () => {
    const v = verificarVentilacao(sobrado(true));
    const vasos = v.desconectores.filter((d) => d.sigla === 'VS');
    expect(vasos.every((d) => d.ventilado && d.distanciaM! < 0.3)).toBe(true);
    const sifonadas = v.desconectores.filter((d) => d.sigla === 'CS');
    expect(sifonadas.every((d) => !d.ventilado && d.distanciaM! > d.maximaM)).toBe(true);
    expect(v.colunas).toHaveLength(1);
    expect(v.colunas[0]).toMatchObject({ dnAtualMm: 50, dnNecessarioMm: 50, coberturaMm: 5700, acimaDaCobertura: false });
  });

  it('casa térrea sem nenhuma ventilação: nenhum desconector ventilado (distância nula)', () => {
    const v = verificarVentilacao(sobrado(false));
    expect(v.desconectores.map((d) => [d.sigla, d.distanciaM, d.ventilado])).toEqual([
      ['VS', null, false],
      ['CS', null, false],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).reverse());
  });
});

describe('E5.4 — o lançamento', () => {
  const lancar = (m: BlueprintModel) => applyBatch(m, planejarVentilacao(m).comandos).model;

  it('sobrado: estende a coluna do TQ a 30 cm acima da cobertura e sobe UMA coluna nas sifonadas empilhadas; depois, tudo em ordem', () => {
    const m = sobrado(true);
    const p = planejarVentilacao(m);
    // 15/10/2026: a coluna sobe na PAREDE (não no ponto da peça); a sifonada de cima, empilhada, liga o ramal dela no
    // pé da mesma coluna — antes ficava ventilada por coincidência (a coluna passava no ponto dela).
    expect(p.resumo).toEqual(['1 coluna(s) nova(s)', '1 ramal(is) ligado(s) ao pé de uma coluna que já sobe ali', '1 estendida(s) até 30 cm acima da cobertura']);
    const depois = lancar(m);
    const v = verificarVentilacao(depois);
    expect(v.desconectores.every((d) => d.ventilado)).toBe(true);
    expect(v.colunas.every((c) => c.acimaDaCobertura && c.topoMm === c.coberturaMm + ACIMA_DA_COBERTURA_MM && c.dnAtualMm >= c.dnNecessarioMm)).toBe(true);
    expect(planejarVentilacao(depois).comandos).toEqual([]);
  });

  it('a ventilação não entra no fluxo do esgoto: o cálculo do esgoto é o mesmo antes e depois', () => {
    const m = sobrado(true);
    const tira = (x: ReturnType<typeof esgotoTrechoATrecho>) => x.map((c) => [c.trechoId, c.uhc, c.papel, c.contrafluxo]);
    expect(tira(esgotoTrechoATrecho(lancar(m)))).toEqual(tira(esgotoTrechoATrecho(m)));
  });

  it('a coluna nova sobe NA PAREDE: sai do nó sob a peça, corre sob o piso em aclive de 1 % e sobe rente à parede', () => {
    const m = sobrado(false);
    const p = planejarVentilacao(m);
    const vent = p.comandos.filter((c): c is Extract<typeof c, { type: 'AddTrecho' }> => c.type === 'AddTrecho');
    const verticais = vent.filter((c) => c.a.x === c.b.x && c.a.y === c.b.y);
    const pernas = vent.filter((c) => c.a.x !== c.b.x || c.a.y !== c.b.y);
    expect(pernas.length).toBeGreaterThan(0);
    for (const c of pernas) {
      const L = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
      expect(c.cotaBMm - c.cotaAMm).toBeGreaterThanOrEqual(Math.ceil(L * 0.01));
    }
    const rente = (q: { x: number; y: number }) =>
      m.walls.some((w) => {
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        const t = ((q.x - w.a.x) * (w.b.x - w.a.x) + (q.y - w.a.y) * (w.b.y - w.a.y)) / L;
        return t >= -1 && t <= L + 1 && Math.abs((q.x - w.a.x) * (w.b.y - w.a.y) - (q.y - w.a.y) * (w.b.x - w.a.x)) / L <= w.thicknessMm / 2 + 60;
      });
    for (const c of verticais) expect(rente(c.a)).toBe(true);
    const depois = applyBatch(m, p.comandos).model;
    expect(verificarVentilacao(depois).desconectores.every((d) => d.ventilado)).toBe(true);
  });

  it('F14a: a coluna não encosta em tubo de outra rede — com uma água bem onde ela subiria, escorrega pela parede', () => {
    const m = sobrado(false);
    const antes = planejarVentilacao(m).comandos.filter((c): c is Extract<typeof c, { type: 'AddTrecho' }> => c.type === 'AddTrecho' && c.a.x === c.b.x && c.a.y === c.b.y);
    expect(antes.length).toBeGreaterThan(0);
    const alvo = antes[0].a;
    // um tubo de água fria vertical exatamente onde a primeira coluna subiria
    const t = m.levels[0].id;
    const comAgua = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: { ...alvo }, b: { ...alvo }, cotaAMm: 300, cotaBMm: 2200, bitolaMm: 25 } as never).model;
    const depois = planejarVentilacao(comAgua).comandos.filter((c): c is Extract<typeof c, { type: 'AddTrecho' }> => c.type === 'AddTrecho' && c.a.x === c.b.x && c.a.y === c.b.y);
    for (const c of depois) expect(Math.hypot(c.a.x - alvo.x, c.a.y - alvo.y)).toBeGreaterThanOrEqual(25 + 12.5 + 20);
    expect(verificarVentilacao(applyBatch(comAgua, planejarVentilacao(comAgua).comandos).model).desconectores.every((d) => d.ventilado)).toBe(true);
  });

  it('F27 item 5 ("válvula de admissão de ar"): a peça do térreo sem parede em cima até o telhado é ventilada por VAA — a coluna fica no térreo', () => {
    // O sobrado sem as paredes do superior (como o térreo sob o terraço da casa de 3): nenhuma parede comum até o telhado.
    const m0 = sobrado(true);
    const [t, sup] = [...m0.levels].sort((a, b) => a.elevationMm - b.elevationMm).map((l) => l.id);
    const m = { ...m0, walls: m0.walls.filter((w) => w.levelId !== sup) };
    const p = planejarVentilacao(m);
    const valvulas = p.comandos.filter((c): c is Extract<typeof c, { type: 'AddTerminal' }> => c.type === 'AddTerminal' && c.tipo === TIPO_DA_VALVULA_DE_ADMISSAO_DE_AR);
    expect(valvulas.length).toBeGreaterThan(0);
    expect(valvulas.every((v) => v.levelId === t)).toBe(true);
    // Nenhuma coluna de ventilação do térreo atravessa o superior na posição de uma válvula.
    const novos = p.comandos.filter((c): c is Extract<typeof c, { type: 'AddTrecho' }> => c.type === 'AddTrecho');
    for (const v of valvulas) expect(novos.some((c) => c.levelId === sup && c.a.x === v.at.x && c.a.y === v.at.y)).toBe(false);
    expect(p.avisos.some((a) => /válvula de admissão de ar/.test(a))).toBe(true);
    // E a verificação dá o térreo por ventilado, sem pedir a coluna acima da cobertura.
    const v = verificarVentilacao(applyBatch(m, p.comandos).model);
    expect(v.desconectores.filter((d) => d.levelId === t).every((d) => d.ventilado)).toBe(true);
    for (const c of v.colunas.filter((c) => valvulas.some((x) => x.at.x === c.x && x.at.y === c.y))) expect(c.acimaDaCobertura).toBe(true);
  });

  it('ventilacaoAteAParedeMm 0: a coluna sobe na posição da peça, como antes', () => {
    const m = sobrado(false);
    const p = planejarVentilacao(m, { ...HIPOTESES_ESGOTO_PADRAO, ventilacaoAteAParedeMm: 0 });
    const vent = p.comandos.filter((c): c is Extract<typeof c, { type: 'AddTrecho' }> => c.type === 'AddTrecho');
    expect(vent.every((c) => c.a.x === c.b.x && c.a.y === c.b.y)).toBe(true);
    const sifonada = m.terminais!.find((t) => t.tipoHidraulico === 'CAIXA_SIFONADA')!;
    expect(vent.some((c) => c.a.x === sifonada.at.x && c.a.y === sifonada.at.y)).toBe(true);
  });

  it('casa térrea: uma coluna no vaso (DN 50) e outra na sifonada (DN 40), cada uma até a cobertura', () => {
    const depois = lancar(sobrado(false));
    const v = verificarVentilacao(depois);
    expect(v.colunas.map((c) => c.dnAtualMm).sort()).toEqual([40, 50]);
    expect(v.desconectores.every((d) => d.ventilado)).toBe(true);
  });
});
