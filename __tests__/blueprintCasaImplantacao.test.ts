/**
 * Casa automática F2 (14/10/2026): implantação pela lei (`implantacaoDaCasa`) e o gerador E6.2
 * avaliando as regras com o lote e a zona reais. Plano: `docs/planos/2026-10-14-casa-automatica.md`.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { medirTerreno, type Recuos } from '../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA, type ContextoDaMassa, type ZonaDaMassa } from '../utils/blueprintMassa';
import { implantacaoDaCasa, paraLocal, paraMundo, quadroDaFrente, resumoDaImplantacao } from '../utils/blueprintCasaAutomatica';
import { PROGRAMA_CURTO_PADRAO, programaDaCasa } from '../utils/blueprintPrograma';
import { gerar } from '../utils/blueprintGerador';
import { loteParaRegras } from '../utils/blueprintRegras';

type Papel = 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';

/** Lote 12 × 30 m com a frente ao sul (y = 0), girado de `graus` em torno da origem. */
function lote(graus = 0, frenteAoNorte = false): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const c = Math.cos((graus * Math.PI) / 180);
  const s = Math.sin((graus * Math.PI) / 180);
  const g = (x: number, y: number): Point => (graus === 0 ? point(x, y) : point(Math.round(x * c - y * s), Math.round(x * s + y * c)));
  const d = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
  const [sul, norte]: Papel[] = frenteAoNorte ? ['FUNDOS', 'FRENTE'] : ['FRENTE', 'FUNDOS'];
  const [leste, oeste]: Papel[] = frenteAoNorte ? ['LATERAL_ESQUERDA', 'LATERAL_DIREITA'] : ['LATERAL_DIREITA', 'LATERAL_ESQUERDA'];
  return applyBatch(base, [
    d(g(0, 0), g(12000, 0), sul),
    d(g(12000, 0), g(12000, 30000), leste),
    d(g(12000, 30000), g(0, 30000), norte),
    d(g(0, 30000), g(0, 0), oeste),
  ]).model;
}

const RECUOS: Recuos = { FRENTE: 3000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
const ZONA: ZonaDaMassa = { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 1.2, taxaPermeabilidadeMinPct: 20, gabaritoPavimentos: 2 };

function contexto(m: BlueprintModel, zona: Partial<ZonaDaMassa> = {}): ContextoDaMassa {
  return { terreno: medirTerreno(m.boundaries), limites: m.boundaries, recuosBase: RECUOS, zona: { ...ZONA, ...zona } };
}

const { programa, curto } = programaDaCasa(PROGRAMA_CURTO_PADRAO);

function implantar(m: BlueprintModel, zona: Partial<ZonaDaMassa> = {}, hip = {}) {
  const r = implantacaoDaCasa(contexto(m, zona), programa, curto, hip);
  if (!r.ok) throw new Error(r.motivo);
  return r.implantacao;
}

describe('implantacaoDaCasa — o retângulo da casa pela lei', () => {
  it('lote 12 × 30, TO 60 %: cabe o programa; encosta no recuo de frente e na lateral esquerda', () => {
    const i = implantar(lote());
    expect(i.limitante).toBe('PROGRAMA');
    expect(i.alinhadaAoDesenho).toBe(true);
    expect(i.direcaoDaFrente).toEqual({ x: 0, y: -1 });
    const r = i.retanguloLocal;
    // envelope: x 1,5–10,5 m, y 3–27 m
    expect(r.x0).toBe(1500);
    expect(r.y0).toBe(3000);
    expect(r.x1).toBeLessThanOrEqual(10500);
    expect(r.y1).toBeLessThanOrEqual(27000);
    for (const v of [r.x0, r.y0, r.x1, r.y1]) expect(v % 50).toBe(0);
    expect(i.medidas.toPct).toBeLessThanOrEqual(60 * 0.95);
    expect(i.medidas.projecaoM2).toBeLessThanOrEqual(i.medidas.projecaoPedidaM2 + 0.01);
    expect(i.medidas.projecaoM2).toBeGreaterThan(i.medidas.projecaoPedidaM2 * 0.97);
    expect(i.medidas.permeabilidadePct).toBeGreaterThanOrEqual(20);
    expect(i.avisos).toEqual([]);
    expect(resumoDaImplantacao(i)).toMatch(/limitada pelo programa/);
  });

  it('TO apertada (30 %): limitada pela TO com folga, e DIZ que as áreas serão reduzidas', () => {
    const i = implantar(lote(), { taxaOcupacaoMaxPct: 30 });
    expect(i.limitante).toBe('TO');
    expect(i.medidas.projecaoM2).toBeLessThanOrEqual(360 * 0.3 * 0.95 + 0.01);
    expect(i.medidas.projecaoM2).toBeGreaterThan(360 * 0.3 * 0.95 - 3);
    expect(i.avisos.join(' ')).toMatch(/taxa de ocupação permite/);
  });

  it('permeabilidade apertada (50 %): o impermeável (casa + pavimentação) respeita o mínimo', () => {
    const i = implantar(lote(), { taxaPermeabilidadeMinPct: 50 });
    expect(i.limitante).toBe('PERMEABILIDADE');
    expect(i.medidas.permeabilidadePct).toBeGreaterThanOrEqual(50);
  });

  it('vagas descobertas entram no impermeável', () => {
    const coberta = implantacaoDaCasa(contexto(lote(), { taxaPermeabilidadeMinPct: 50 }), programa, { vagas: 2, garagemCoberta: true });
    const descoberta = implantacaoDaCasa(contexto(lote(), { taxaPermeabilidadeMinPct: 50 }), programa, { vagas: 2, garagemCoberta: false });
    if (!coberta.ok || !descoberta.ok) throw new Error('implantação');
    expect(descoberta.implantacao.medidas.projecaoM2).toBeLessThan(coberta.implantacao.medidas.projecaoM2 - 20);
  });

  it('zona sem índices: só o envelope e o programa limitam — e o que faltou é dito', () => {
    const i = implantar(lote(), { taxaOcupacaoMaxPct: null, coeficienteMax: null, taxaPermeabilidadeMinPct: null, gabaritoPavimentos: null });
    expect(['PROGRAMA', 'ENVELOPE']).toContain(i.limitante);
    expect(i.avisos.join(' ')).toMatch(/Sem dado da zona/);
  });

  it('sem FRENTE marcada ou sem lote: recusa com o motivo', () => {
    const semFrente = lote();
    const semPapel = { ...semFrente, boundaries: semFrente.boundaries.map((b) => ({ ...b, papel: b.papel === 'FRENTE' ? null : b.papel })) };
    const r1 = implantacaoDaCasa(contexto(semPapel), programa, curto);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.motivo).toMatch(/FRENTE/);
    const r2 = implantacaoDaCasa({ ...contexto(lote()), terreno: null }, programa, curto);
    expect(r2.ok).toBe(false);
  });

  it('encostar à DIREITA (de quem olha da rua): com a frente ao sul, é o lado leste', () => {
    const i = implantar(lote(), {}, { encostarNaDivisa: 'DIREITA' });
    expect(i.retanguloLocal.x1).toBe(10500);
    expect(Math.max(...i.anelNoMundo.map((p) => p.x))).toBe(10500);
  });

  it('frente ao NORTE: a casa encosta no recuo de cima e a rua fica em +y', () => {
    const i = implantar(lote(0, true));
    expect(i.direcaoDaFrente).toEqual({ x: 0, y: 1 });
    expect(i.alinhadaAoDesenho).toBe(true);
    expect(Math.max(...i.anelNoMundo.map((p) => p.y))).toBe(27000);
  });

  it('lote GIRADO 30°: mesma casa no quadro da frente; o anel do mundo vem girado', () => {
    const reto = implantar(lote());
    const girado = implantar(lote(30));
    expect(girado.alinhadaAoDesenho).toBe(false);
    const dim = (i: typeof reto) => [i.retanguloLocal.x1 - i.retanguloLocal.x0, i.retanguloLocal.y1 - i.retanguloLocal.y0];
    const [w0, d0] = dim(reto);
    const [w1, d1] = dim(girado);
    expect(Math.abs(w1 - w0)).toBeLessThanOrEqual(250);
    expect(Math.abs(d1 - d0)).toBeLessThanOrEqual(500);
    // o anel do mundo, de volta ao quadro, é o retângulo local
    const q = girado.quadro;
    const volta = girado.anelNoMundo.map((p) => paraLocal(q, p));
    expect(volta[0].x).toBeCloseTo(girado.retanguloLocal.x0, 6);
    expect(volta[2].y).toBeCloseTo(girado.retanguloLocal.y1, 6);
    expect(paraMundo(q, paraLocal(q, point(1234, 5678))).x).toBeCloseTo(1234, 6);
  });

  it('quadro da frente: exato quando a frente cai num eixo', () => {
    const m = lote();
    const q = quadroDaFrente(m.boundaries, medirTerreno(m.boundaries)!.anel)!;
    expect(q).toEqual({ ex: { x: 1, y: 0 }, ey: { x: 0, y: 1 } });
  });
});

describe('gerador E6.2 com o lote e a zona (F2)', () => {
  const m = lote();
  const i = implantar(m);
  const loteDasRegras = loteParaRegras(medirTerreno(m.boundaries), m.boundaries);
  const zonaDasRegras = { taxaOcupacaoMax: 60, coeficienteMax: 1.2, gabaritoPavimentos: 2, taxaPermeabilidadeMin: 20 };
  const entrada = { programa, envelope: i.anelNoMundo, direcaoDaFrente: i.direcaoDaFrente, rotacaoNorteDeg: null, latitudeGraus: -19.9 };

  it('dentro do retângulo da implantação: TO desenhada ≤ zona e sem-lote-to CONFORME', () => {
    const r = gerar({ ...entrada, contextoDeRegras: { lote: loteDasRegras, zona: zonaDasRegras } }, 1, { automaticos: false });
    expect(r.resumo.areaConstruidaM2).toBeLessThanOrEqual(360 * 0.6);
    expect(r.resumo.areaConstruidaM2).toBeCloseTo(i.medidas.projecaoM2, 0);
    const to = r.regras.find((x) => x.regraId === 'sem-lote-to');
    const ca = r.regras.find((x) => x.regraId === 'sem-lote-ca');
    const testada = r.regras.find((x) => x.regraId === 'sem-lote-testada');
    expect(to?.estado).toBe('CONFORME');
    expect(ca?.estado).toBe('CONFORME');
    expect(testada?.estado).toBe('NAO_AVALIADA'); // a zona fictícia não tem testada mínima
    // o programa coube sem cair abaixo da área mínima de ninguém
    expect(r.avisos.filter((a) => /abaixo da área mínima/.test(a))).toEqual([]);
  });

  it('o retângulo da implantação não estoura a área do programa (o E6.2 preenche o que recebe)', () => {
    const r = gerar(entrada, 1, { automaticos: false });
    const pedido = programa.itens.reduce((s, it) => s + it.areaIdealM2 * it.quantidade, 0);
    expect(r.resumo.areaUtilM2).toBeGreaterThan(pedido * 0.9);
    expect(r.resumo.areaUtilM2).toBeLessThan(pedido * 1.2);
  });

  it('sem contexto: como antes — nenhuma regra de lote sai conforme nem violada', () => {
    const r = gerar(entrada, 1, { automaticos: false });
    const doLote = r.regras.filter((x) => x.regra.escopo === 'LOTE');
    expect(doLote.filter((x) => x.estado !== 'NAO_AVALIADA')).toEqual([]);
  });

  it('a TO violada aparece: retângulo que ocupa o envelope inteiro', () => {
    const envelopeInteiro = [point(1500, 3000), point(10500, 3000), point(10500, 27000), point(1500, 27000)];
    const r = gerar({ ...entrada, envelope: envelopeInteiro, contextoDeRegras: { lote: loteDasRegras, zona: { ...zonaDasRegras, taxaOcupacaoMax: 30 } } }, 1, { automaticos: false });
    expect(r.regras.find((x) => x.regraId === 'sem-lote-to')?.estado).toBe('VIOLADA');
  });
});
