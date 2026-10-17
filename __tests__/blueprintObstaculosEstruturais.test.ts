/**
 * E5.5 — O TRAÇADO DESVIA DA ESTRUTURA (29/09/2026): a rota pelas paredes
 * contorna o pilar quando há outro caminho, a coluna e a descida escorregam
 * para fora dele, o barrilete desce para baixo da viga do teto; o que não dá
 * para evitar vira marca e item da conferência.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, pointInPolygon, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { PENALIDADE_DO_PILAR_MM, anelDoPilar, custoComPilares, desvioDoPilar, foraDaViga, foraDoPilar, fracaoDentro, fundoDaVigaMaisBaixaMm, pegadasDePilares, vigaSobreParede } from '../utils/blueprintObstaculosEstruturais';
import { arvorePelasParedes } from '../utils/blueprintRotaPelasParedes';
import { planejarAgua } from '../utils/blueprintAguaAutomatica';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';
import { verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { HIPOTESES_HIDRO_PADRAO } from '../utils/blueprintMemorialHidro';
import { sobrado } from './fixtures/sobradoHidro';

const pilar = (levelId: string, x: number, y: number): Command => ({ type: 'AddStructural', levelId, kind: 'PILAR', pontos: [{ x, y }], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, baseMm: 0 }) as Command;
const viga = (levelId: string, baseMm: number): Command => ({ type: 'AddStructural', levelId, kind: 'VIGA', pontos: [{ x: 0, y: 3000 }, { x: 4500, y: 3000 }], larguraMm: 150, alturaMm: 400, baseMm }) as Command;
const quadrado: Point[] = [point(-100, -100), point(100, -100), point(100, 100), point(-100, 100)];
const agua = (m: BlueprintModel) => (m.trechos ?? []).filter((t) => t.disciplina === 'AGUA_FRIA');
const dentro = (pegadas: Point[][], p: { x: number; y: number }) => pegadas.some((g) => pointInPolygon(g, p as Point));

describe('E5.5 — as peças', () => {
  it('fração dentro e custo: o segmento que entra no pilar paga a penalidade fixa', () => {
    expect(fracaoDentro({ x: -1000, y: 0 }, { x: 1000, y: 0 }, [quadrado])).toBeCloseTo(0.1, 6);
    expect(custoComPilares({ x: -1000, y: 0 }, { x: 1000, y: 0 }, [quadrado])).toBe(2000 + PENALIDADE_DO_PILAR_MM);
    expect(custoComPilares({ x: 200, y: 0 }, { x: 1000, y: 0 }, [quadrado])).toBe(800);
  });

  it('o ponto dentro do pilar escorrega pelo eixo da parede até 5 cm além da face; o de fora não se move', () => {
    const w = { a: point(0, -3000), b: point(0, 3000) };
    // A face está em ±100 (a borda conta como dentro): o primeiro ponto fora, mais 50.
    const acima = foraDoPilar({ x: 0, y: 30 }, w, [quadrado]);
    const abaixo = foraDoPilar({ x: 0, y: -30 }, w, [quadrado]);
    expect(acima.x).toBe(0);
    expect(acima.y).toBeGreaterThanOrEqual(150);
    expect(acima.y).toBeLessThanOrEqual(151);
    expect(abaixo.y).toBeLessThanOrEqual(-150);
    expect(abaixo.y).toBeGreaterThanOrEqual(-151);
    expect(foraDoPilar({ x: 0, y: 500 }, w, [quadrado])).toEqual({ x: 0, y: 500 });
  });

  it('a rota pelas paredes contorna o pilar do meio da parede quando o desvio custa menos que a penalidade', () => {
    // Quadrado 4 × 3 m; raiz em (4000, 0), alvo em (0, 0); pilar em (2000, 0).
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    for (const [ax, ay, bx, by] of [[0, 0, 4000, 0], [4000, 0, 4000, 3000], [4000, 3000, 0, 3000], [0, 3000, 0, 0]]) {
      m = applyCommand(m, { type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }).model;
    }
    const base = { paredes: m.walls, raiz: { x: 4000, y: 0 }, pendentes: [{ x: 0, y: 0 }], raioDeEncaixeMm: 100 };
    const reta = arvorePelasParedes(base);
    expect(reta.arestas.every((a) => a.de.y === 0 && a.para.y === 0)).toBe(true);
    const obstaculos = [quadrado.map((p) => point(p.x + 2000, p.y))];
    const desvio = arvorePelasParedes({ ...base, obstaculos });
    expect(desvio.arestas.some((a) => a.de.y === 3000 || a.para.y === 3000)).toBe(true);
    expect(desvio.arestas.every((a) => fracaoDentro(a.de, a.para, obstaculos) === 0)).toBe(true);
  });

  it('a viga de teto: o fundo da mais baixa; a verga no meio da parede não conta', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    expect(fundoDaVigaMaisBaixaMm(m, l, 2800)).toBeNull();
    m = applyCommand(m, viga(l, 1000)).model;
    expect(fundoDaVigaMaisBaixaMm(m, l, 2800)).toBeNull();
    m = applyCommand(applyCommand(m, viga(l, 2450)).model, viga(l, 2400)).model;
    expect(fundoDaVigaMaisBaixaMm(m, l, 2800)).toBe(2400);
  });
});

describe('E5.5 — no sobrado', () => {
  it('sem estrutura: nada muda — nenhuma marca de estrutura, a conferência atende', () => {
    const m = sobrado(true);
    expect(marcasDeVerificacao(m).filter((x) => x.tipo === 'ATRAVESSA_PILAR' || x.tipo === 'CRUZA_VIGA')).toEqual([]);
    const r = verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, { nome: 'Ana', titulo: 'Eng', conselho: 'CREA', registro: '1', artNumero: '2', artData: '2026-09-29' });
    expect(r.verificacoes.find((v) => v.item === 'Nenhum tubo atravessa pilar')).toMatchObject({ atende: true, obtido: 'nenhum' });
  });

  it('pilar no meio da parede do barrilete: o barrilete dá a volta pelas outras paredes e nenhum tubo entra nele', () => {
    const m = sobrado(true, { estrutura: (n) => [pilar(n[1], 3200, 0)] });
    const sup = m.levels[1].id;
    const barrilete = agua(m).filter((t) => t.levelId === sup && t.cotaAMm === 2800 && t.cotaBMm === 2800);
    expect(barrilete.some((t) => t.a.y === 3000 || t.b.y === 3000)).toBe(true);
    expect(marcasDeVerificacao(m).filter((x) => x.tipo === 'ATRAVESSA_PILAR')).toEqual([]);
  });

  it('pilar sobre a coluna: a prumada escorrega pela parede para fora dele, nos dois pavimentos', () => {
    const m = sobrado(true, { estrutura: (n) => n.map((l) => pilar(l, 0, 800)) });
    const pegadas = m.levels.flatMap((l) => pegadasDePilares(m, l.id));
    const verticais = agua(m).filter((t) => t.a.x === t.b.x && t.a.y === t.b.y && Math.abs(t.cotaAMm - t.cotaBMm) > 1000);
    expect(verticais.length).toBeGreaterThan(0);
    expect(verticais.every((t) => !dentro(pegadas, t.a))).toBe(true);
    // O que sobra é só o toco até o vaso — o ponto está DENTRO do pilar, e a marca diz.
    const marcas = marcasDeVerificacao(m).filter((x) => x.tipo === 'ATRAVESSA_PILAR');
    expect(marcas).toHaveLength(2);
    expect(marcas.every((x) => x.severidade === 'ERRO' && x.disciplina === 'AGUA_FRIA')).toBe(true);
    const r = verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, { nome: 'Ana', titulo: 'Eng', conselho: 'CREA', registro: '1', artNumero: '2', artData: '2026-09-29' });
    expect(r.verificacoes.find((v) => v.item === 'Nenhum tubo atravessa pilar')).toMatchObject({ atende: false, obtido: '2 trecho(s) dentro de pilar' });
  });

  it('viga no teto do pavimento da caixa: o barrilete corre 10 cm abaixo dela, com aviso', () => {
    const m = sobrado(true, { estrutura: (n) => [viga(n[1], 2400)] });
    const sup = m.levels[1].id;
    const horizontais = agua(m).filter((t) => t.levelId === sup && t.cotaAMm === t.cotaBMm && t.cotaAMm > 2200);
    expect(horizontais.length).toBeGreaterThan(0);
    expect(horizontais.every((t) => t.cotaAMm === 2300)).toBe(true);
    const cx = m.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO')!;
    expect(planejarAgua(m, cx).avisos).toContain('barrilete a 2,30 m do piso — 10 cm abaixo da viga mais baixa do teto');
    expect(marcasDeVerificacao(m).filter((x) => x.tipo === 'CRUZA_VIGA')).toEqual([]);
  });

  it('tubo desenhado cruzando a viga: marca de AVISO (furo a aprovar), não pendência', () => {
    const m0 = sobrado(true, { estrutura: (n) => [viga(n[1], 2400)] });
    const sup = m0.levels[1].id;
    const m = applyCommand(m0, { type: 'AddTrecho', levelId: sup, disciplina: 'AGUA_FRIA', a: point(1000, 2000), b: point(1000, 4000), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 25 }).model;
    const marcas = marcasDeVerificacao(m).filter((x) => x.tipo === 'CRUZA_VIGA');
    expect(marcas).toHaveLength(1);
    expect(marcas[0]).toMatchObject({ severidade: 'AVISO', texto: 'cruza viga — furo a aprovar' });
  });
});

describe('F8b — compatibilização (casa automática, 15/10/2026)', () => {
  const sala = () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    for (const [ax, ay, bx, by] of [[0, 0, 4000, 0], [4000, 0, 4000, 3000], [4000, 3000, 0, 3000], [0, 3000, 0, 0]]) {
      m = applyCommand(m, { type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }).model;
    }
    return m;
  };
  const noCanto = (x: number, y: number) => quadrado.map((p) => point(p.x + x, p.y + y));

  it('o anel: a pegada crescida do afastamento, ao mm', () => {
    expect(anelDoPilar(quadrado, 40)).toEqual([{ x: -140, y: -140 }, { x: 140, y: -140 }, { x: 140, y: 140 }, { x: -140, y: 140 }]);
  });

  it('pilar em TODO canto: só a penalidade atravessa um; com o anel, a rota contorna e continua ligada', () => {
    const m = sala();
    const obstaculos = [noCanto(0, 0), noCanto(4000, 0), noCanto(4000, 3000), noCanto(0, 3000)];
    const base = { paredes: m.walls, raiz: { x: 4000, y: 1500 }, pendentes: [{ x: 2000, y: 3000 }], raioDeEncaixeMm: 100, obstaculos };
    const so = arvorePelasParedes(base);
    expect(so.arestas.some((a) => fracaoDentro(a.de, a.para, obstaculos) > 0)).toBe(true);
    const anel = arvorePelasParedes({ ...base, contornoDoPilarMm: 40 });
    expect(anel.arestas.length).toBeGreaterThan(0);
    expect(anel.arestas.every((a) => fracaoDentro(a.de, a.para, obstaculos) === 0)).toBe(true);
    // Ligada: cada ponta é ponta de outra aresta, salvo a raiz e o alvo.
    const pontas = anel.arestas.flatMap((a) => [a.de, a.para]).map((p) => `${p.x},${p.y}`);
    const soltas = [...new Set(pontas)].filter((k) => pontas.filter((x) => x === k).length === 1);
    expect(soltas.sort()).toEqual(['2000,3000', '4000,1500']);
  });

  it('com o anel, a volta POR DENTRO das paredes ainda ganha quando é curta (o anel tira o tubo da parede)', () => {
    const m = sala();
    const obstaculos = [noCanto(2000, 0)];
    const r = arvorePelasParedes({ paredes: m.walls, raiz: { x: 4000, y: 0 }, pendentes: [{ x: 0, y: 0 }], raioDeEncaixeMm: 100, obstaculos, contornoDoPilarMm: 40 });
    expect(r.arestas.some((a) => a.de.y === 3000 || a.para.y === 3000)).toBe(true);
    expect(r.arestas.every((a) => fracaoDentro(a.de, a.para, obstaculos) === 0)).toBe(true);
  });

  it('a prumada sob a viga desce rente à face dela, do lado do cômodo; bloqueado, do outro', () => {
    const m = applyCommand(applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model, viga('lvl_0001', 2400)).model;
    const vigas = m.structures.filter((x) => x.kind === 'VIGA');
    expect(foraDaViga({ x: 2000, y: 3000 }, vigas, { x: 2000, y: 2000 }, [])).toEqual({ x: 2000, y: 2895 });
    expect(foraDaViga({ x: 2000, y: 3000 }, vigas, { x: 2000, y: 2000 }, [noCanto(2000, 2895)])).toEqual({ x: 2000, y: 3105 });
    expect(foraDaViga({ x: 2000, y: 2000 }, vigas, { x: 0, y: 0 }, [])).toEqual({ x: 2000, y: 2000 });
  });

  it("caixa d'água acima do teto, com laje: o barrilete corre SOBRE a laje, com aviso", () => {
    const laje = (levelId: string): Command => ({ type: 'AddStructural', levelId, kind: 'LAJE', pontos: [{ x: -500, y: -500 }, { x: 5000, y: -500 }, { x: 5000, y: 3500 }, { x: -500, y: 3500 }], alturaMm: 100, baseMm: 2800 }) as Command;
    const m = sobrado(true, { cotaDaCaixaMm: 3300, estrutura: (n) => [laje(n[1]), viga(n[1], 2400)] });
    const sup = m.levels[1].id;
    expect(agua(m).some((t) => t.levelId === sup && t.cotaAMm === 3050 && t.cotaBMm === 3050)).toBe(true);
    expect(agua(m).some((t) => t.levelId === sup && t.cotaAMm === t.cotaBMm && t.cotaAMm === 2800)).toBe(false);
    const cx = m.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO')!;
    expect(planejarAgua(m, cx).avisos).toContain('barrilete sobre a laje, a 3,05 m do piso — as colunas descem pela laje');
  });

  it('viga descendo até perto do ramal: o barrilete corre ENTRE o ramal e ela, e não no teto dentro dela', () => {
    const m = sobrado(true, { estrutura: (n) => [viga(n[1], 2280)] });
    const sup = m.levels[1].id;
    const horizontais = agua(m).filter((t) => t.levelId === sup && t.cotaAMm === t.cotaBMm && t.cotaAMm > 2200);
    expect(horizontais.length).toBeGreaterThan(0);
    expect(horizontais.every((t) => t.cotaAMm === 2240)).toBe(true);
    const cx = m.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO')!;
    expect(planejarAgua(m, cx).avisos).toContain('barrilete a 2,24 m do piso — entre o ramal e a viga mais baixa do teto, que desce até perto dele');
    expect(marcasDeVerificacao(m).filter((x) => x.tipo === 'CRUZA_VIGA')).toEqual([]);
  });
});

describe('F12c — a viga no caminho de quem anda pelas paredes', () => {
  it('soSobreParede: a viga de transição solta no cômodo não baixa o barrilete; a da parede, sim', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddWall', levelId: l, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddStructural', levelId: l, kind: 'VIGA', pontos: [point(0, 0), point(6000, 0)], larguraMm: 150, alturaMm: 400, baseMm: 2400 },
      // a de transição, no meio do cômodo (sem parede embaixo), mais funda
      { type: 'AddStructural', levelId: l, kind: 'VIGA', pontos: [point(0, 3000), point(6000, 3000)], larguraMm: 150, alturaMm: 600, baseMm: 2200 },
    ]).model;
    expect(fundoDaVigaMaisBaixaMm(m, l, 2800)).toBe(2200);
    expect(fundoDaVigaMaisBaixaMm(m, l, 2800, { soSobreParede: true })).toBe(2400);
    const [sobre, solta] = m.structures!.filter((x) => x.kind === 'VIGA');
    const paredes = m.walls.filter((w) => w.levelId === l);
    expect(vigaSobreParede(sobre, paredes)).toBe(true);
    expect(vigaSobreParede(solta, paredes)).toBe(false);
  });
});

describe('desvioDoPilar — mais de um pilar no caminho (F24 da casa automática, 17/10/2026)', () => {
  const quadrado = (cx: number, cy: number, meio = 150): Point[] => [point(cx - meio, cy - meio), point(cx + meio, cy - meio), point(cx + meio, cy + meio), point(cx - meio, cy + meio)];

  it('a diagonal que atravessa DOIS pilares contorna os dois — o caminho inteiro livre', () => {
    // Um pilar logo depois da saída e outro logo antes da chegada, deslocados: nenhum canto único serve aos dois.
    const pilares = [quadrado(2000, 1000), quadrado(8000, 4000)];
    const a = { x: 0, y: 0 };
    const b = { x: 10000, y: 5000 };
    expect(fracaoDentro(a, b, pilares)).toBeGreaterThan(0);
    const desvio = desvioDoPilar(a, b, pilares);
    expect(desvio).not.toBeNull();
    expect(desvio!.length).toBeGreaterThanOrEqual(2);
    const pts = [a, ...desvio!, b];
    for (let i = 1; i < pts.length; i++) expect(fracaoDentro(pts[i - 1], pts[i], pilares)).toBe(0);
  });

  it('um pilar só: como antes, um canto basta', () => {
    const desvio = desvioDoPilar({ x: 0, y: 0 }, { x: 4000, y: 0 }, [quadrado(2000, 0)]);
    expect(desvio).toHaveLength(1);
  });
});
