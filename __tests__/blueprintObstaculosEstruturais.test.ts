/**
 * E5.5 — O TRAÇADO DESVIA DA ESTRUTURA (29/09/2026): a rota pelas paredes
 * contorna o pilar quando há outro caminho, a coluna e a descida escorregam
 * para fora dele, o barrilete desce para baixo da viga do teto; o que não dá
 * para evitar vira marca e item da conferência.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, pointInPolygon, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { PENALIDADE_DO_PILAR_MM, custoComPilares, foraDoPilar, fracaoDentro, fundoDaVigaMaisBaixaMm, pegadasDePilares } from '../utils/blueprintObstaculosEstruturais';
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
