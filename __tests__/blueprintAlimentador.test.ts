/**
 * E4.3 — ENTRADA DE ÁGUA E ALIMENTADOR PREDIAL (29/09/2026): do hidrômetro à
 * torneira de boia, pelas paredes, subindo os pavimentos; DN pelo consumo
 * diário em 24 h; a pressão que chega à boia; e fora da rede de distribuição.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, pegadaEmPlanta, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_ALIMENTACAO_PADRAO, ROTULO_DO_ALIMENTADOR, cotaEnterradaAcimaDasRedes, planejarAlimentador, rotaPelasParedesAte, trechosDoAlimentador } from '../utils/blueprintAlimentador';
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


describe('F17 da casa automática: o alimentador sobe pela FACHADA ("sobe pela fachada", 16/10/2026)', () => {
  // A sala 4 × 3 m do F8c (com baldrame); o hidrômetro fora, na frente (y < 0); a caixa perto do fundo.
  const sala = () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    const lados = [[0, 0, 4000, 0], [4000, 0, 4000, 3000], [4000, 3000, 0, 3000], [0, 3000, 0, 0]];
    m = applyBatch(m, lados.map(([ax, ay, bx, by]): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }))).model;
    return applyBatch(m, lados.map(([ax, ay, bx, by]) => ({ type: 'AddStructural', levelId: l, kind: 'VIGA_FUNDACAO', pontos: [{ x: ax, y: ay }, { x: bx, y: by }], larguraMm: 150, alturaMm: 500, baseMm: -500 }) as Command)).model;
  };
  const rota = (m: BlueprintModel, subida?: 'FACHADA' | 'SOB_A_CAIXA') =>
    rotaPelasParedesAte(m, { levelId: m.levels[0].id, at: { x: 1000, y: -2000 }, cotaMm: 600 }, -300, { levelId: m.levels[0].id, at: { x: 3000, y: 2700 }, cotaMm: 3900 }, subida ? { subida } : {})!;

  it('enterrado só por FORA da casa (até a parede da frente); sobe nela até a cota da boia e vai à caixa por cima', () => {
    const r = rota(sala(), 'FACHADA');
    const enterrados = r.filter((t) => t.ca === -300 && t.cb === -300);
    expect(enterrados.length).toBeGreaterThan(0);
    // Nada enterrado sob o piso: todo pedaço a −0,30 m fica do lado de fora da face da frente (y ≤ −75).
    for (const t of enterrados) expect(Math.max(t.a.y, t.b.y), JSON.stringify(t)).toBeLessThanOrEqual(-75);
    // A subida (o vertical que chega à cota da boia) fica na parede da frente (y = 0).
    const sobe = r.find((t) => t.a.x === t.b.x && t.a.y === t.b.y && t.cb === 3900)!;
    expect(Math.abs(sobe.a.y), JSON.stringify(sobe)).toBeLessThanOrEqual(200);
    // Contínuo, e termina na boia.
    for (let i = 1; i < r.length; i++) expect([r[i].a, r[i].ca]).toEqual([r[i - 1].b, r[i - 1].cb]);
    expect(r[r.length - 1].b).toEqual({ x: 3000, y: 2700 });
  });

  it('sem a premissa (a ferramenta do editor), como antes: a subida sob a caixa, com o percurso enterrado por baixo da casa', () => {
    const r = rota(sala());
    expect(r.some((t) => t.ca === -300 && t.cb === -300 && Math.max(t.a.y, t.b.y) > 1000)).toBe(true);
  });
});

describe('F18 da casa automática: o alimentador enterrado por CIMA do esgoto e do pluvial que cruza (NBR 5626)', () => {
  const comCruzamento = (cotaDoEsgoto: number) => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    const trecho = (disciplina: 'AGUA_FRIA' | 'ESGOTO', a: [number, number], b: [number, number], cota: number, bitolaMm: number, rotulo?: string): Command =>
      ({ type: 'AddTrecho', levelId: l, disciplina, a: point(...a), b: point(...b), cotaAMm: cota, cotaBMm: cota, bitolaMm, ...(rotulo ? { rotulo } : {}) }) as Command;
    m = applyBatch(m, [trecho('AGUA_FRIA', [0, 0], [0, 3000], -300, 25, ROTULO_DO_ALIMENTADOR), trecho('ESGOTO', [-1000, 1500], [1000, 1500], cotaDoEsgoto, 100)]).model;
    return m;
  };

  it('esgoto a −0,40 m: por cima — a cota dele + os dois raios + o afastamento, para cima, de 10 em 10', () => {
    expect(cotaEnterradaAcimaDasRedes(comCruzamento(-400), HIPOTESES_ALIMENTACAO_PADRAO)).toEqual({ cotaMm: -280, cruzamentos: 1, sob: false });
  });

  it('esgoto raso (−0,20 m): por cima sairia acima do recobrimento — passa POR BAIXO, dito', () => {
    expect(cotaEnterradaAcimaDasRedes(comCruzamento(-200), HIPOTESES_ALIMENTACAO_PADRAO)).toEqual({ cotaMm: -320, cruzamentos: 1, sob: true });
  });

  it('sem cruzamento, a cota da premissa', () => {
    expect(cotaEnterradaAcimaDasRedes(comCruzamento(-400).trechos ? { ...comCruzamento(-400), trechos: comCruzamento(-400).trechos!.filter((t) => t.disciplina !== 'ESGOTO') } : comCruzamento(-400), HIPOTESES_ALIMENTACAO_PADRAO)).toEqual({ cotaMm: -300, cruzamentos: 0, sob: false });
  });
});
