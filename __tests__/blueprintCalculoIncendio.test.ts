/**
 * INCÊNDIO E2.3 (30/09/2026): o desenho vira a rede do solver — carga
 * necessária na bomba, hidrantes mais desfavoráveis, simultaneidade, ponto de
 * equilíbrio, papel do trecho e DN automático.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import {
  HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP,
  ajustarDnDeIncendio,
  calcularCenario,
  calculoDeIncendio,
  cargaNecessaria,
  hipotesesHidraulicasDaColuna,
  redeDeIncendio,
} from '../utils/blueprintCalculoIncendio';

const tubo = (l: string, ax: number, ay: number, ca: number, bx: number, by: number, cb: number, dn = 65): Command =>
  ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, ay), b: point(bx, by), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
const peca = (l: string, tipo: string, x: number, y: number, cota: number): Command =>
  ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo }) as Command;

/**
 * Bomba em (0,0) a 0,30 m; sobe a 2,60; corre em x até 10 m (H-perto desce
 * em 5 m) e até 30 m (H-longe desce lá). `anel`: um segundo caminho de 0 a 30 m
 * por y = 5 m.
 */
function galpao(opts: { anel?: boolean; dn?: number; semBomba?: boolean } = {}): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const dn = opts.dn ?? 65;
  const cmds: Command[] = [
    ...(opts.semBomba ? [] : [peca(l, 'BOMBA_INCENDIO', 0, 0, 300)]),
    tubo(l, 0, 0, 300, 0, 0, 2600, dn),
    tubo(l, 0, 0, 2600, 5000, 0, 2600, dn),
    tubo(l, 5000, 0, 2600, 30000, 0, 2600, dn),
    tubo(l, 5000, 0, 2600, 5000, 0, 1300, dn),
    tubo(l, 30000, 0, 2600, 30000, 0, 1300, dn),
    peca(l, 'HIDRANTE_SIMPLES', 5000, 0, 1300),
    peca(l, 'HIDRANTE_SIMPLES', 30000, 0, 1300),
  ];
  if (opts.anel) cmds.push(tubo(l, 0, 0, 2600, 0, 5000, 2600, dn), tubo(l, 0, 5000, 2600, 30000, 5000, 2600, dn), tubo(l, 30000, 5000, 2600, 30000, 0, 2600, dn));
  return applyBatch(m, cmds).model;
}
const hidrante = (m: BlueprintModel, x: number) => m.terminais!.find((t) => t.tipoHidraulico === 'HIDRANTE_SIMPLES' && t.at.x === x)!.id;

describe('E2.3 · a rede do desenho', () => {
  it('a bomba é a fonte; os hidrantes encostam em nós da rede; o joelho soma comprimento equivalente', () => {
    const r = redeDeIncendio(galpao());
    expect(r.fonte?.tipoHidraulico).toBe('BOMBA_INCENDIO');
    expect(r.consumidores.size).toBe(2);
    expect(r.tubos.reduce((a, x) => a + x.leqM, 0)).toBeGreaterThan(0);
  });

  it('sem bomba: o motivo diz o que fazer', () => {
    const c = calculoDeIncendio(galpao({ semBomba: true }), HIP);
    expect(c.motivo).toMatch(/sem bomba de incêndio/);
    expect(c.cargaNecessariaM).toBeNull();
  });
});

describe('E2.3 · carga necessária e equilíbrio', () => {
  it('⚠️ um hidrante: na carga necessária ele dá EXATAMENTE a vazão mínima (bisseção)', () => {
    const m = galpao();
    const r = cargaNecessaria(m, HIP, [hidrante(m, 30000)])!;
    const t = r.cenario.terminais[0];
    expect(t.vazaoLmin).toBeCloseTo(HIP.vazaoMinimaHidranteLmin, 0);
    expect(t.vazaoLmin).toBeGreaterThanOrEqual(HIP.vazaoMinimaHidranteLmin * (1 - 1e-6));
    // Pressão no esguicho = a mínima (o bocal foi feito para isso).
    expect(t.pressaoNoBicoKpa).toBeCloseTo(HIP.pressaoMinimaHidranteKpa, -1);
    // A válvula tem mais pressão que o esguicho: a mangueira perde.
    expect(t.pressaoNoKpa).toBeGreaterThan(t.pressaoNoBicoKpa);
  });

  it('o mais LONGE é o mais desfavorável; com os dois abertos, o de perto recebe mais (ponto de equilíbrio)', () => {
    const m = galpao();
    const c = calculoDeIncendio(m, HIP);
    expect(c.desfavoraveis[0].terminalId).toBe(hidrante(m, 30000));
    expect(c.abertos).toHaveLength(2);
    const longe = c.cenario!.terminais.find((t) => t.terminalId === hidrante(m, 30000))!;
    const perto = c.cenario!.terminais.find((t) => t.terminalId === hidrante(m, 5000))!;
    expect(longe.vazaoLmin).toBeCloseTo(HIP.vazaoMinimaHidranteLmin, 0);
    expect(perto.vazaoLmin).toBeGreaterThan(longe.vazaoLmin);
    expect(c.cenario!.vazaoNaFonteLmin).toBeCloseTo(longe.vazaoLmin + perto.vazaoLmin, 6);
  });

  it('simultaneidade 1: só o mais desfavorável abre, e a carga é menor', () => {
    const m = galpao();
    const dois = calculoDeIncendio(m, HIP).cargaNecessariaM!;
    const um = calculoDeIncendio(m, { ...HIP, hidrantesSimultaneos: 1 });
    expect(um.abertos).toEqual([hidrante(m, 30000)]);
    expect(um.cargaNecessariaM!).toBeLessThan(dois);
  });

  it('⚠️ o ANEL ajuda: um segundo caminho até o hidrante longe baixa a carga necessária', () => {
    const semAnel = calculoDeIncendio(galpao({ dn: 50 }), HIP).cargaNecessariaM!;
    const comAnel = calculoDeIncendio(galpao({ dn: 50, anel: true }), HIP).cargaNecessariaM!;
    expect(comAnel).toBeLessThan(semAnel);
  });

  it('a fórmula muda o número, não a física: as três dão cargas próximas', () => {
    const m = galpao();
    const cargas = (['HAZEN_WILLIAMS', 'UNIVERSAL', 'FAIR_WHIPPLE_HSIAO'] as const).map((f) => calculoDeIncendio(m, { ...HIP, formula: f }).cargaNecessariaM!);
    const media = cargas.reduce((a, b) => a + b, 0) / 3;
    for (const c of cargas) expect(Math.abs(c - media) / media).toBeLessThan(0.15);
  });

  it('a pressão estática nos hidrantes com a carga de projeto sai para a verificação da máxima', () => {
    const m = galpao();
    const c = calculoDeIncendio(m, HIP);
    // A bomba a 0,30 m e o hidrante a 1,30 m: estática = (carga − 1 m) · 9,807.
    expect(c.estaticaKpa.get(hidrante(m, 5000))!).toBeCloseTo((c.cargaNecessariaM! - 1) * 9.80665, 6);
  });
});

describe('E2.3 · papel do trecho e DN automático', () => {
  it('vertical = coluna; o tubo que só leva a um hidrante = sub-ramal; o que leva aos dois = geral; o do anel fora da árvore = anel', () => {
    const m = galpao({ anel: true });
    const c = calculoDeIncendio(m, HIP);
    const papel = (ax: number, ay: number, bx: number, by: number) =>
      c.papel.get(m.trechos!.find((t) => t.a.x === ax && t.a.y === ay && t.b.x === bx && t.b.y === by && t.cotaAMm === 2600 && t.cotaBMm === 2600)!.id);
    expect(c.papel.get(m.trechos!.find((t) => t.a.x === 0 && t.b.x === 0 && t.cotaAMm === 300)!.id)).toBe('COLUNA');
    expect(new Set([...c.papel.values()]).has('ANEL')).toBe(true);
    expect(papel(0, 0, 5000, 0)).not.toBe('ANEL');
  });

  it('DN 25 estoura a velocidade: o ajuste sobe os DN até passar, num lote só', () => {
    const m = galpao({ dn: 32 });
    const antes = calculoDeIncendio(m, HIP).cenario!;
    expect(antes.trechos.some((t) => t.velocidadeMs > HIP.velocidadeMaxMs)).toBe(true);
    const aj = ajustarDnDeIncendio(m, HIP);
    expect(aj.alterados).toBeGreaterThan(0);
    const depois = calculoDeIncendio(applyBatch(m, aj.comandos).model, HIP).cenario!;
    expect(depois.trechos.every((t) => t.velocidadeMs <= HIP.velocidadeMaxMs + 1e-9)).toBe(true);
  });

  it('premissas gravadas: tipo errado volta ao padrão, simultaneidade inteira ≥ 1', () => {
    expect(hipotesesHidraulicasDaColuna(null)).toEqual(HIP);
    const h = hipotesesHidraulicasDaColuna({ formula: 'X', hidrantesSimultaneos: 2.7, vazaoMinimaHidranteLmin: -1, pressaoMaximaKpa: 800 });
    expect(h.formula).toBe('HAZEN_WILLIAMS');
    expect(h.hidrantesSimultaneos).toBe(3);
    expect(h.vazaoMinimaHidranteLmin).toBe(HIP.vazaoMinimaHidranteLmin);
    expect(h.pressaoMaximaKpa).toBe(800);
  });

  it('cenário sem terminais abertos não atende nada (carga necessária nula)', () => {
    const m = galpao();
    expect(cargaNecessaria(m, HIP, [])).toBeNull();
    expect(calcularCenario(m, HIP, [], 30).convergiu).toBe(true);
  });
});
