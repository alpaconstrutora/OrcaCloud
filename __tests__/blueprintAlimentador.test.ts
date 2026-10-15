/**
 * E4.3 — ENTRADA DE ÁGUA E ALIMENTADOR PREDIAL (29/09/2026): do hidrômetro à
 * torneira de boia, pelas paredes, subindo os pavimentos; DN pelo consumo
 * diário em 24 h; a pressão que chega à boia; e fora da rede de distribuição.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, pegadaEmPlanta, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_ALIMENTACAO_PADRAO, ROTULO_DO_ALIMENTADOR, planejarAlimentador, rotaPelasParedesAte, trechosDoAlimentador } from '../utils/blueprintAlimentador';
import { fracaoDentro } from '../utils/blueprintObstaculosEstruturais';
import { HIPOTESES_RESERVATORIO_PADRAO } from '../utils/blueprintReservacao';
import { pressoesDoModelo } from '../utils/blueprintPressaoDaRede';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';
import { hipotesesHidroDaColuna } from '../hooks/useBlueprintHidro';
import { sobrado } from './fixtures/sobradoHidro';

const planejar = (m: BlueprintModel, hip = HIPOTESES_ALIMENTACAO_PADRAO) => planejarAlimentador(m, hip, HIPOTESES_RESERVATORIO_PADRAO, 3);
const chave = (levelId: string, p: { x: number; y: number }, c: number) => `${levelId}|${p.x},${p.y}|${c}`;

describe('E4.3 — sem o que ligar', () => {
  it('sem hidrômetro e sem frente do lote: pede a frente; sem caixa: diz que falta', () => {
    const m = sobrado(true, { cotaDaCaixaMm: 4500 });
    // Desde 13/10/2026 o hidrômetro nasce na frente (blueprintHidroAncorasAguaPluvial.test.ts); o sobrado não tem divisas.
    expect(planejar(m).motivo).toMatch(/^Marque a divisa da frente do lote/);
    const semCaixa = applyCommand({ ...m, terminais: m.terminais!.filter((t) => t.tipoHidraulico !== 'RESERVATORIO') }, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'AGUA_FRIA', tipo: 'H', at: point(6000, 1500), cotaMm: 600, tipoHidraulico: 'HIDROMETRO' }).model;
    expect(planejar(semCaixa).motivo).toMatch(/Não há caixa d'água/);
  });
});

describe('E4.3 — a rota e o dimensionamento', () => {
  const m = sobrado(true, { cotaDaCaixaMm: 4500, alimentador: true });
  const trechos = trechosDoAlimentador(m);

  it('um caminho contínuo, do hidrômetro (descendo à cota enterrada) à torneira de boia no superior', () => {
    expect(trechos.length).toBeGreaterThan(3);
    expect(trechos.every((t) => t.rotulo === ROTULO_DO_ALIMENTADOR && t.sugerido && t.bitolaMm === 25)).toBe(true);
    const h = m.terminais!.find((t) => t.tipoHidraulico === 'HIDROMETRO')!;
    expect(trechos[0]).toMatchObject({ a: h.at, cotaAMm: 600, b: h.at, cotaBMm: -300 });
    const boia = m.terminais!.find((t) => t.tipoHidraulico === 'TORNEIRA_BOIA')!;
    const ultimo = trechos[trechos.length - 1];
    expect(ultimo.levelId).toBe(boia.levelId);
    expect(ultimo.b).toEqual(boia.at);
    expect(ultimo.cotaBMm).toBe(boia.cotaMm);
    // Contínuo: cada trecho começa onde o anterior acabou (a laje é o encontro entre pavimentos).
    for (let i = 1; i < trechos.length; i++) {
      const [p, q] = [trechos[i - 1], trechos[i]];
      if (p.levelId === q.levelId) expect(chave(q.levelId, q.a, q.cotaAMm)).toBe(chave(p.levelId, p.b, p.cotaBMm));
      else expect([q.a, q.cotaAMm]).toEqual([p.b, 0]);
    }
  });

  it('DN pelo consumo em 24 h (800 L → 0,009 L/s): o mínimo, 25; e a pressão que chega à boia atende', () => {
    const p = planejar(sobrado(true, { cotaDaCaixaMm: 4500, alimentador: true }));
    expect(p.vazaoLs).toBeCloseTo(800 / 86400, 6);
    expect(p.dnMm).toBe(25);
    // Desnível do cavalete (0,60) à boia (2,90 + 4,50 + 0,80 − 0,10): 7,5 m.
    expect(p.desnivelM).toBeCloseTo(7.5, 2);
    expect(p.pressaoNaBoiaKpa).toBeCloseTo(100 - 7.5 * 9.80665 - p.perdaDistribuidaKpa - p.perdaLocalizadaKpa - p.perdaNoHidrometroKpa, 6);
    expect(p.atende).toBe(true);
  });

  it('rede pública fraca: não chega à caixa superior — o aviso manda usar inferior com recalque', () => {
    const p = planejar(m, { ...HIPOTESES_ALIMENTACAO_PADRAO, pressaoDaRedePublicaKpa: 50 });
    expect(p.atende).toBe(false);
    expect(p.avisos).toContain('A rede pública não sobe até a caixa superior com a pressão mínima na boia: use reservatório INFERIOR com recalque.');
  });

  it('com reservatório INFERIOR, o destino é ele', () => {
    const t = m.levels[0].id;
    const comInferior = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Cisterna', at: point(3500, 1500), cotaMm: 0, tipoHidraulico: 'RESERVATORIO', papelReservatorio: 'INFERIOR' }).model;
    const p = planejar(comInferior);
    expect(p.destinoInferior).toBe(true);
    expect(p.destinoId).toBe(comInferior.terminais![comInferior.terminais!.length - 1].id);
  });

  it('relançar apaga os sugeridos e refaz; confirmado, não relança por cima', () => {
    const p = planejar(m);
    expect(p.apagados).toBe(trechos.length);
    expect(p.comandos.filter((c) => c.type === 'DeleteTrecho')).toHaveLength(trechos.length);
    const confirmado = applyBatch(m, trechos.map((x): Command => ({ type: 'SetTrechoProps', trechoId: x.id, sugerido: false }))).model;
    const q = planejar(confirmado);
    expect(q.comandos).toEqual([]);
    expect(q.avisos.some((a) => /já tem \d+ trecho\(s\) confirmado/.test(a))).toBe(true);
  });

  it('o alimentador não é rede de distribuição, e não deixa ponta aberta', () => {
    const ids = new Set(trechos.map((t) => t.id));
    expect(pressoesDoModelo(m).flatMap((r) => r.trechos).some((t) => ids.has(t.trechoId))).toBe(false);
    expect(marcasDeVerificacao(m).filter((x) => x.tipo === 'PONTA_ABERTA')).toEqual([]);
  });
});

describe('E4.3 — premissas do estudo', () => {
  it('a coluna sem `alimentacao` completa com o padrão', () => {
    expect(hipotesesHidroDaColuna({}).alimentacao).toEqual(HIPOTESES_ALIMENTACAO_PADRAO);
    expect(hipotesesHidroDaColuna({ alimentacao: { pressaoDaRedePublicaKpa: 150 } }).alimentacao.pressaoDaRedePublicaKpa).toBe(150);
  });
});

describe('F8c — o alimentador enterrado fora do baldrame (15/10/2026)', () => {
  // Sala 4 × 3 m com o baldrame (−0,50 a 0) sob cada parede; o hidrômetro fora, na frente; a chegada perto da
  // parede do fundo.
  const sala = (comBaldrame: boolean) => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    const lados = [[0, 0, 4000, 0], [4000, 0, 4000, 3000], [4000, 3000, 0, 3000], [0, 3000, 0, 0]];
    m = applyBatch(m, lados.map(([ax, ay, bx, by]): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }))).model;
    if (comBaldrame) m = applyBatch(m, lados.map(([ax, ay, bx, by]) => ({ type: 'AddStructural', levelId: l, kind: 'VIGA_FUNDACAO', pontos: [{ x: ax, y: ay }, { x: bx, y: by }], larguraMm: 150, alturaMm: 500, baseMm: -500 }) as Command)).model;
    return m;
  };
  const rota = (m: BlueprintModel) => rotaPelasParedesAte(m, { levelId: m.levels[0].id, at: { x: 1000, y: -2000 }, cotaMm: 600 }, -300, { levelId: m.levels[0].id, at: { x: 3000, y: 2700 }, cotaMm: 2500 })!;
  const baldrames = (m: BlueprintModel) => m.structures.filter((x) => x.kind === 'VIGA_FUNDACAO').map((x) => pegadaEmPlanta(x));

  it('sem baldrame, segue pelas paredes como antes; com baldrame, nenhum pedaço enterrado corre dentro dele (só o atravessa)', () => {
    const pelasParedes = rota(sala(false)).filter((t) => t.ca === -300 && t.cb === -300);
    expect(pelasParedes.some((t) => t.a.y === 0 && t.b.y === 0)).toBe(true);
    const m = sala(true);
    const enterrados = rota(m).filter((t) => t.ca === -300 && t.cb === -300 && (t.a.x !== t.b.x || t.a.y !== t.b.y));
    expect(enterrados.length).toBeGreaterThan(0);
    for (const t of enterrados) expect(fracaoDentro(t.a, t.b, baldrames(m)) * Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y)).toBeLessThanOrEqual(200);
  });

  it('o pé da subida fica ao lado do baldrame: sobe até 10 cm acima dele e entra na parede; a rota é um caminho só', () => {
    const r = rota(sala(true));
    const sobe = r.find((t) => t.a.x === t.b.x && t.a.y === t.b.y && t.ca === -300 && t.cb === 100);
    expect(sobe).toBeDefined();
    expect(baldrames(sala(true)).some((g) => fracaoDentro(sobe!.a, { x: sobe!.a.x + 1, y: sobe!.a.y }, [g]) > 0)).toBe(false);
    const entra = r.find((t) => t.ca === 100 && t.cb === 100);
    expect(entra?.b).toEqual({ x: 3000, y: 3000 });
    // Cada pedaço começa onde o anterior termina.
    for (let i = 1; i < r.length; i++) expect([r[i].a, r[i].ca]).toEqual([r[i - 1].b, r[i - 1].cb]);
  });
});

