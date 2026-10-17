/**
 * Casa automática F2 (14/10/2026): implantação pela lei (`implantacaoDaCasa`) e o gerador E6.2
 * avaliando as regras com o lote e a zona reais. Plano: `docs/planos/2026-10-14-casa-automatica.md`.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { medirTerreno, type Recuos } from '../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA, type ContextoDaMassa, type ZonaDaMassa } from '../utils/blueprintMassa';
import { anelDoL, implantacaoDaCasa, paraLocal, paraMundo, quadroDaFrente, resumoDaImplantacao } from '../utils/blueprintCasaAutomatica';
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

/**
 * F24 (decisão do usuário, 17/10/2026: "Automático"): a vaga descoberta (2,5 × 5 m) não cabe no recuo de frente de 3 m —
 * a casa recua quando a profundidade deixa sem perder área; senão a vaga vai numa faixa ao lado da casa.
 */
describe('implantacaoDaCasa — vagas descobertas no recuo curto (F24)', () => {
  const retangular = (w: number, d: number): BlueprintModel => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const dd = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
    return applyBatch(base, [dd(point(0, 0), point(w, 0), 'FRENTE'), dd(point(w, 0), point(w, d), 'LATERAL_DIREITA'), dd(point(w, d), point(0, d), 'FUNDOS'), dd(point(0, d), point(0, 0), 'LATERAL_ESQUERDA')]).model;
  };
  const descobertas = { vagas: 2, garagemCoberta: false };
  // o programa sem garagem (as vagas descobertas não pedem ambiente)
  const semGaragem = programaDaCasa({ ...PROGRAMA_CURTO_PADRAO, garagemCoberta: false }).programa;
  const implantarDescoberta = (m: BlueprintModel, hip = {}) => {
    const r = implantacaoDaCasa(contexto(m), semGaragem, descobertas, hip);
    if (!r.ok) throw new Error(r.motivo);
    return r.implantacao;
  };

  it('lote 12 × 30: a casa recua até as vagas caberem na frente dela — sem perder área', () => {
    const i = implantarDescoberta(retangular(12000, 30000));
    expect(i.vagasDescobertas?.onde).toBe('RECUO_DE_FRENTE');
    const c = i.vagasDescobertas!.caixa;
    expect(c.y1 - c.y0).toBeGreaterThanOrEqual(5000);
    expect(Math.floor((c.x1 - c.x0) / 2500) * Math.floor((c.y1 - c.y0) / 5000)).toBeGreaterThanOrEqual(2);
    expect(i.retanguloLocal.y0).toBe(5100); // 5 m de vaga + meia parede, na malha
    expect(i.limitante).toBe('PROGRAMA');
    expect(i.avisos.some((a) => /^Vagas descobertas: .*a casa recua 2,10 m/.test(a))).toBe(true);
    // na garagem coberta, nada muda
    const r = implantacaoDaCasa(contexto(retangular(12000, 30000)), semGaragem, { vagas: 2, garagemCoberta: true });
    expect(r.ok && r.implantacao.vagasDescobertas).toBeNull();
    expect(r.ok && r.implantacao.retanguloLocal.y0).toBe(3000);
  });

  it('"ao lado" (hipótese): a faixa de 2,5 m na lateral direita, da rua para dentro, livre da casa — que aprofunda', () => {
    const i = implantarDescoberta(retangular(12000, 30000), { vagaDescoberta: 'AO_LADO' });
    expect(i.vagasDescobertas?.onde).toBe('AO_LADO');
    const c = i.vagasDescobertas!.caixa;
    expect(c).toEqual({ x0: 9500, x1: 12000, y0: 0, y1: 10000 });
    expect(i.retanguloLocal.x1 + 100).toBeLessThanOrEqual(c.x0);
    expect(i.retanguloLocal.y0).toBe(3000);
    expect(i.medidas.projecaoM2).toBeGreaterThanOrEqual(i.medidas.projecaoPedidaM2 - 0.5);
  });

  it('lote raso 20 × 14 (Automático): recuar perderia área — as vagas vão ao lado e a casa mantém o programa', () => {
    const i = implantarDescoberta(retangular(20000, 14000));
    expect(i.vagasDescobertas?.onde).toBe('AO_LADO');
    expect(i.limitante).toBe('PROGRAMA');
    expect(i.retanguloLocal.x1 + 100).toBeLessThanOrEqual(i.vagasDescobertas!.caixa.x0);
    // só recuar: perde, e diz
    const recuada = implantarDescoberta(retangular(20000, 14000), { vagaDescoberta: 'RECUAR' });
    expect(recuada.limitante).toBe('VAGAS');
    expect(recuada.medidas.projecaoM2).toBeLessThan(i.medidas.projecaoM2);
    expect(recuada.avisos.some((a) => /as vagas descobertas permitem/.test(a))).toBe(true);
  });
});

/**
 * F24 (decisão do usuário, 17/10/2026: "só quando o retângulo não comporta"): a implantação em L — o retângulo da frente
 * (mais raso) e um anexo colado atrás dele, no que o envelope tem atrás.
 */
describe('implantacaoDaCasa — a casa em L (F24)', () => {
  const porAnel = (v: [number, number, Papel][]): BlueprintModel => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    return applyBatch(base, v.map(([x, y, papel], i): Command => ({ type: 'AddBoundary', levelId, a: point(x, y), b: point(v[(i + 1) % v.length][0], v[(i + 1) % v.length][1]), kind: 'TERRENO', papel }))).model;
  };
  // 20 m de frente nos primeiros 15 m; 10 m (à esquerda) nos 15 m de trás.
  const loteEmL = () => porAnel([[0, 0, 'FRENTE'], [20000, 0, 'LATERAL_DIREITA'], [20000, 15000, 'LATERAL_DIREITA'], [10000, 15000, 'LATERAL_DIREITA'], [10000, 30000, 'FUNDOS'], [0, 30000, 'LATERAL_ESQUERDA']]);
  // 12 m de frente abrindo para 20 m nos fundos.
  const trapezio = () => porAnel([[0, 0, 'FRENTE'], [12000, 0, 'LATERAL_DIREITA'], [20000, 30000, 'FUNDOS'], [0, 30000, 'LATERAL_ESQUERDA']]);
  const grande = programaDaCasa({ ...PROGRAMA_CURTO_PADRAO, dormitorios: 4, suites: 1, banheiros: 3, vagas: 2, padrao: 'R1-A' });
  const implantarGrande = (m: BlueprintModel, hip = {}) => {
    const r = implantacaoDaCasa(contexto(m), grande.programa, grande.curto, hip);
    if (!r.ok) throw new Error(r.motivo);
    return r.implantacao;
  };

  it('lote em L: o retângulo fica nos recuos (184 m²); em L, a frente inteira e um anexo atrás alcançam o programa', () => {
    const ret = implantarGrande(loteEmL(), { forma: 'RETANGULO' });
    expect(ret.limitante).toBe('ENVELOPE');
    expect(ret.contornoLocal).toBeNull();
    const l = implantarGrande(loteEmL(), { forma: 'L' });
    expect(l.contornoLocal).not.toBeNull();
    expect(l.medidas.projecaoM2).toBeGreaterThanOrEqual(l.medidas.projecaoPedidaM2 - 0.5);
    expect(l.medidas.projecaoM2).toBeGreaterThan(ret.medidas.projecaoM2 + 30);
    expect(l.limitante).toBe('PROGRAMA');
    // o da frente na largura do envelope; o anexo atrás, dentro do braço de 10 m (recuos de 1,5 m)
    expect(l.retanguloLocal).toEqual({ x0: 1500, y0: 3000, x1: 18500, y1: 13500 });
    const xs = l.contornoLocal!.map((p) => p.x);
    const ys = l.contornoLocal!.map((p) => p.y);
    expect(Math.max(...ys)).toBeGreaterThan(13500);
    expect(Math.max(...l.contornoLocal!.filter((p) => p.y > 13500).map((p) => p.x))).toBeLessThanOrEqual(8500);
    expect(Math.min(...xs)).toBe(1500);
    expect(l.avisos.some((a) => /^Casa em L: /.test(a))).toBe(true);
    // no retângulo que comporta, a forma L não muda nada
    const cabe = implantacaoDaCasa(contexto(loteEmL()), programa, curto, { forma: 'L' });
    expect(cabe.ok && cabe.implantacao.contornoLocal).toBeNull();
  });

  it('trapézio: o L fica mais raso e o degrau entre os dois é de 0 ou ≥ 3 m (sem faixa estreita ao lado)', () => {
    const ret = implantarGrande(trapezio(), { forma: 'RETANGULO' });
    const l = implantarGrande(trapezio(), { forma: 'L' });
    expect(l.contornoLocal).not.toBeNull();
    const fundo = (i: typeof l) => Math.max(...(i.contornoLocal ?? [{ x: 0, y: i.retanguloLocal.y1 }]).map((p) => p.y));
    expect(fundo(l)).toBeLessThan(fundo(ret) - 1000);
    const r1 = l.retanguloLocal;
    const atras = l.contornoLocal!.filter((p) => p.y > r1.y1);
    const x0 = Math.min(...atras.map((p) => p.x));
    const x1 = Math.max(...atras.map((p) => p.x));
    for (const degrau of [x1 - r1.x1, r1.x0 - x0]) expect(degrau === 0 || degrau >= 3000).toBe(true);
  });

  it('anelDoL: a união do retângulo com o anexo colado atrás, sem vértice repetido nem colinear', () => {
    expect(anelDoL({ x0: 0, y0: 0, x1: 10000, y1: 5000 }, { x0: 0, y0: 5000, x1: 4000, y1: 9000 })).toEqual([
      { x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 5000 }, { x: 4000, y: 5000 }, { x: 4000, y: 9000 }, { x: 0, y: 9000 },
    ]);
    // o anexo mais largo que a frente, para a direita: um degrau de cada lado do encontro
    expect(anelDoL({ x0: 0, y0: 0, x1: 6000, y1: 5000 }, { x0: 0, y0: 5000, x1: 9000, y1: 9000 })).toEqual([
      { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 5000 }, { x: 9000, y: 5000 }, { x: 9000, y: 9000 }, { x: 0, y: 9000 },
    ]);
  });
});
