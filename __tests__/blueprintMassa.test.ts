/**
 * ESTUDO DE MASSA, fase M1 (01/10/2026): a família `Bloco` no kernel 0.90.0 e o
 * motor `utils/blueprintMassa.ts`.
 *
 * O lote de prova é o exemplo do PRÓPRIO pedido: 1.200 m² (30 × 40 m), TO 60 %,
 * CA 3,0, gabarito de 8 pavimentos — "implantação máxima 720 m², área
 * computável máxima 3.600 m²".
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  KernelError,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  snapshotHash,
  type BlueprintModel,
  type Command,
  type Point,
} from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, type Recuos } from '../utils/blueprintTerreno';
import {
  aproveitamentoDoEstudo,
  areaDaUniaoMm2,
  envelopeLegal,
  medirMassa,
  proximoNomeDeBloco,
  rotuloDoBloco,
  ZONA_DA_MASSA_VAZIA,
  type ContextoDaMassa,
  type ZonaDaMassa,
} from '../utils/blueprintMassa';

const RECUOS: Recuos = { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
const ZONA: ZonaDaMassa = { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 3, gabaritoPavimentos: 8 };

const ret = (x0: number, y0: number, x1: number, y1: number): Point[] => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];

/** Lote 30 × 40 m (frente em y = 0), um pavimento de referência no 0. */
function lote(): { m: BlueprintModel; nivel: string } {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const nivel = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: nivel, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 30000, 0, 'FRENTE'), d(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), d(30000, 40000, 0, 40000, 'FUNDOS'), d(0, 40000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  return { m, nivel };
}

function contexto(m: BlueprintModel, zona: ZonaDaMassa = ZONA, recuos: Recuos = RECUOS): ContextoDaMassa {
  return { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: recuos, zona };
}

describe('kernel 0.90.0 · bloco de massa', () => {
  it('AddBloco com padrões; Set/Move/Translate/Delete; recusa o que está fora da faixa', () => {
    const { m: m0, nivel } = lote();
    let m = applyCommand(m0, { type: 'AddBloco', levelId: nivel, nome: '  Torre A  ', pontos: ret(3000, 6000, 27000, 36000) }).model;
    const b = m.blocos![0];
    expect(b).toMatchObject({ id: 'blc_0001', nome: 'Torre A', cotaBaseMm: 0, pavimentos: 1, peDireitoMm: 3000, uso: 'RESIDENCIAL' });
    expect(b.uid).toMatch(/^[0-9a-f-]{36}$/);

    m = applyCommand(m, { type: 'SetBlocoProps', blocoId: b.id, pavimentos: 10, peDireitoMm: 2880, uso: 'MISTO', cotaBaseMm: 1500 }).model;
    expect(m.blocos![0]).toMatchObject({ pavimentos: 10, peDireitoMm: 2880, uso: 'MISTO', cotaBaseMm: 1500 });

    expect(() => applyCommand(m, { type: 'SetBlocoProps', blocoId: b.id, pavimentos: 0 })).toThrow(/entre 1 e 200/);
    expect(() => applyCommand(m, { type: 'SetBlocoProps', blocoId: b.id, pavimentos: 201 })).toThrow(KernelError);
    expect(() => applyCommand(m, { type: 'SetBlocoProps', blocoId: b.id, pavimentos: 2.5 })).toThrow(KernelError);
    expect(() => applyCommand(m, { type: 'SetBlocoProps', blocoId: b.id, peDireitoMm: 1500 })).toThrow(/entre 2 e 15 m/);
    expect(() => applyCommand(m, { type: 'SetBlocoProps', blocoId: b.id, nome: '   ' })).toThrow(/nome/);
    expect(() => applyCommand(m, { type: 'SetBlocoProps', blocoId: b.id, uso: 'HOTEL' as never })).toThrow(/Uso de bloco desconhecido/);
    expect(() => applyCommand(m, { type: 'AddBloco', levelId: nivel, nome: 'X', pontos: [point(0, 0), point(1000, 0)] })).toThrow(/3 vértices/);

    m = applyCommand(m, { type: 'MoveBlocoVertex', blocoId: b.id, index: 2, to: { x: 27000.4, y: 37000 } }).model;
    expect(m.blocos![0].pontos[2]).toEqual({ x: 27000, y: 37000 });
    expect(() => applyCommand(m, { type: 'MoveBlocoVertex', blocoId: b.id, index: 9, to: point(0, 0) })).toThrow(/Vértice 9/);

    m = applyCommand(m, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], blocoIds: [b.id], delta: point(1000, -500), manterJuncoes: false }).model;
    expect(m.blocos![0].pontos[0]).toEqual({ x: 4000, y: 5500 });
    expect(m.boundaries[0].a).toEqual({ x: 0, y: 0 }); // só o bloco andou

    m = applyCommand(m, { type: 'DeleteBloco', blocoId: b.id }).model;
    expect(m.blocos).toEqual([]);
    expect(() => applyCommand(m, { type: 'DeleteBloco', blocoId: b.id })).toThrow(/inexistente/);
  });

  it('remover o pavimento de referência leva o bloco junto', () => {
    const { m: m0, nivel } = lote();
    let m = applyBatch(m0, [
      { type: 'AddLevel', name: 'Outro', elevationMm: 3000, defaultHeightMm: 3000 },
      { type: 'AddBloco', levelId: nivel, nome: 'A', pontos: ret(3000, 6000, 27000, 36000) },
    ]).model;
    const outro = m.levels.find((l) => l.name === 'Outro')!.id;
    m = applyCommand(m, { type: 'AddBloco', levelId: outro, nome: 'B', pontos: ret(3000, 6000, 10000, 10000) }).model;
    const r = applyCommand(m, { type: 'RemoveLevel', levelId: nivel });
    expect(r.model.blocos!.map((b) => b.nome)).toEqual(['B']);
    expect(r.diff.deleted).toContain('blc_0001');
  });

  it('payload canônico: sem bloco não ganha chave; ida e volta preserva bloco, uid e hash', () => {
    const { m: m0, nivel } = lote();
    expect(parseCanonicalPayload(canonicalPayload(m0)).blocos).toBeUndefined();
    expect(parseCanonicalPayload(canonicalPayload(m0)).identity?.blocos).toBeUndefined();

    const m = applyBatch(m0, [
      { type: 'AddBloco', levelId: nivel, nome: 'Torre', pontos: ret(7500, 13500, 22500, 28500), cotaBaseMm: 9000, pavimentos: 7, uso: 'RESIDENCIAL' },
      { type: 'AddBloco', levelId: nivel, nome: 'Podium', pontos: ret(3000, 6000, 27000, 36000), pavimentos: 3, peDireitoMm: 3000, uso: 'COMERCIAL' },
    ]).model;
    const payload = parseCanonicalPayload(canonicalPayload(m));
    // Ordem canônica pela cota: o podium (0) antes da torre (9 m), qualquer que seja a ordem do desenho.
    expect(payload.blocos!.map((b) => b.nome)).toEqual(['Podium', 'Torre']);
    const volta = modelFromCanonicalPayload(payload);
    expect(volta.blocos!.map((b) => [b.nome, b.cotaBaseMm, b.pavimentos, b.peDireitoMm, b.uso])).toEqual([
      ['Podium', 0, 3, 3000, 'COMERCIAL'],
      ['Torre', 9000, 7, 3000, 'RESIDENCIAL'],
    ]);
    const uidTorre = m.blocos!.find((b) => b.nome === 'Torre')!.uid;
    expect(volta.blocos!.find((b) => b.nome === 'Torre')!.uid).toBe(uidTorre);
    expect(snapshotHash(volta)).toBe(snapshotHash(m));
    // Mudar o número de pavimentos muda o hash: é conteúdo.
    const mais = applyCommand(m, { type: 'SetBlocoProps', blocoId: m.blocos![0].id, pavimentos: 8 }).model;
    expect(snapshotHash(mais)).not.toBe(snapshotHash(m));
  });
});

describe('área da união', () => {
  it('soma o que não se cruza, desconta o que se sobrepõe, aceita L e losango', () => {
    expect(areaDaUniaoMm2([])).toBe(0);
    expect(areaDaUniaoMm2([ret(0, 0, 10000, 10000)])).toBe(100e6);
    expect(areaDaUniaoMm2([ret(0, 0, 10000, 10000), ret(20000, 0, 30000, 10000)])).toBeCloseTo(200e6, -2);
    expect(areaDaUniaoMm2([ret(0, 0, 10000, 10000), ret(5000, 5000, 15000, 15000)])).toBeCloseTo(175e6, -2);
    // Um dentro do outro: conta o de fora.
    expect(areaDaUniaoMm2([ret(0, 0, 10000, 10000), ret(2000, 2000, 4000, 4000)])).toBeCloseTo(100e6, -2);
    // Losango inscrito no quadrado: o quadrado.
    const losango = [point(5000, 0), point(10000, 5000), point(5000, 10000), point(0, 5000)];
    expect(areaDaUniaoMm2([ret(0, 0, 10000, 10000), losango])).toBeCloseTo(100e6, -2);
    // Losango centrado num canto do quadrado: 100 + 50 − 12,5 = 137,5 m².
    const losango2 = [point(10000, 5000), point(15000, 10000), point(10000, 15000), point(5000, 10000)];
    expect(areaDaUniaoMm2([ret(0, 0, 10000, 10000), losango2])).toBeCloseTo(137.5e6, -2);
    // L (côncavo) sobre um retângulo que ocupa o "vazio" do L: o quadrado inteiro.
    const L = [point(0, 0), point(10000, 0), point(10000, 4000), point(4000, 4000), point(4000, 10000), point(0, 10000)];
    expect(areaDaUniaoMm2([L, ret(4000, 4000, 10000, 10000)])).toBeCloseTo(100e6, -2);
  });
});

describe('envelope legal (§4 do pedido)', () => {
  it('1.200 m², TO 60 %, CA 3, gabarito 8 → 720 m², 3.600 m², 5 pavimentos possíveis', () => {
    const { m } = lote();
    const e = envelopeLegal(contexto(m));
    expect(e.loteM2).toBe(1200);
    expect(e.implantacaoMaxM2).toBe(720);
    expect(e.envelopeTerreoM2).toBe(27 * 32); // recuos 5/3/1,5/1,5
    expect(e.implantacaoEfetivaM2).toBe(720);
    expect(e.potencialM2).toBe(3600);
    expect(e.pavimentosPossiveis).toBe(5); // 3.600 ÷ 720 = 5 < gabarito 8
    expect(e.alturaMaxM).toBe(24); // 8 × 3,00 m de referência
    expect(e.faltam).toEqual([]);
    // Sem lote e sem zona: diz o que falta, não inventa.
    const vazio = envelopeLegal({ terreno: null, limites: [], recuosBase: RECUOS, zona: ZONA_DA_MASSA_VAZIA });
    expect(vazio).toMatchObject({ loteM2: null, implantacaoMaxM2: null, potencialM2: null, pavimentosPossiveis: null });
    expect(vazio.faltam).toHaveLength(4);
  });
});

describe('medir a massa', () => {
  it('torre única 24 × 30 × 10 pav: TO 60 % atende, CA 6,0 excede, 2 pavimentos acima do gabarito, cabe no envelope', () => {
    const { m: m0, nivel } = lote();
    const m = applyCommand(m0, { type: 'AddBloco', levelId: nivel, nome: 'Torre', pontos: ret(3000, 6000, 27000, 36000), pavimentos: 10 }).model;
    const r = medirMassa(m, contexto(m));
    expect(r.areaOcupadaM2).toBe(720);
    expect(r.to).toMatchObject({ usado: 60, limite: 60, estado: 'ATENDE' });
    expect(r.areaConstruidaM2).toBe(7200);
    expect(r.ca).toMatchObject({ usado: 6, limite: 3, estado: 'EXCEDE' });
    expect(r.aproveitamentoDoPotencialPct).toBe(200);
    expect(r.gabaritoPavimentos).toMatchObject({ usado: 10, limite: 8, estado: 'EXCEDE' });
    expect(r.gabaritoAltura).toMatchObject({ usado: 30, estado: 'SEM_LIMITE' });
    expect(r.alturaMaxM).toBe(30);
    const t = r.blocos[0];
    expect(t.pisosAcimaDoGabarito).toBe(2);
    expect(t.pisos[8].motivoDoGabarito).toBe('9º pavimento > gabarito de 8');
    expect(t.pisosForaDoEnvelope).toBe(0);
    expect(r.permeabilidade.estado).toBe('SEM_DADO');
    expect(r.avisos.join(' ')).toMatch(/2 pavimento\(s\) acima do gabarito/);
  });

  it('podium + torre: a torre conta o gabarito a partir do 4º pavimento e a TO não soma duas vezes', () => {
    const { m: m0, nivel } = lote();
    const m = applyBatch(m0, [
      { type: 'AddBloco', levelId: nivel, nome: 'Podium', pontos: ret(3000, 6000, 27000, 36000), pavimentos: 3, uso: 'COMERCIAL' },
      { type: 'AddBloco', levelId: nivel, nome: 'Torre', pontos: ret(7500, 13500, 22500, 28500), cotaBaseMm: 9000, pavimentos: 7 },
    ]).model;
    const r = medirMassa(m, contexto(m));
    const [podium, torre] = r.blocos;
    expect(torre.apoiadoEm).toBe(podium.blocoId);
    expect(torre.pisos.map((p) => p.ordinal)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(torre.pisosAcimaDoGabarito).toBe(2);
    expect(r.areaOcupadaM2).toBe(720);
    expect(r.areaConstruidaM2).toBe(720 * 3 + 225 * 7);
    expect(r.ca.usado).toBe(Math.round(((720 * 3 + 225 * 7) / 1200) * 100) / 100);
    expect(r.avisos.some((a) => /mesmo espaço/.test(a))).toBe(false);
    expect(rotuloDoBloco(m.blocos![1])).toBe('Torre · 7 pav · 21,00 m · sobre 9,00 m');
  });

  it('dois blocos no mesmo espaço são acusados — a área contaria duas vezes', () => {
    const { m: m0, nivel } = lote();
    const m = applyBatch(m0, [
      { type: 'AddBloco', levelId: nivel, nome: 'A', pontos: ret(3000, 6000, 15000, 20000), pavimentos: 4 },
      { type: 'AddBloco', levelId: nivel, nome: 'B', pontos: ret(10000, 6000, 25000, 20000), pavimentos: 4 },
    ]).model;
    const r = medirMassa(m, contexto(m));
    expect(r.areaOcupadaM2).toBe(22 * 14);
    expect(r.avisos.find((a) => /mesmo espaço/.test(a))).toMatch(/"A" e "B" ocupam o mesmo espaço em 70,00 m²/);
  });

  it('subsolo de garagem: fora da TO, do CA e do gabarito; confere só o lote', () => {
    const { m: m0, nivel } = lote();
    let m = applyCommand(m0, { type: 'AddBloco', levelId: nivel, nome: 'Subsolo', pontos: ret(1000, 1000, 29000, 39000), cotaBaseMm: -6000, pavimentos: 2, uso: 'GARAGEM' }).model;
    let r = medirMassa(m, contexto(m));
    const s = r.blocos[0];
    expect(s.pavimentosNoSubsolo).toBe(2);
    expect(s.pisos.every((p) => p.ordinal === null && p.cabe === true)).toBe(true);
    expect(s.areaComputavelM2).toBe(0);
    expect(r.areaOcupadaM2).toBe(0);
    expect(r.to.usado).toBe(0);
    expect(r.gabaritoPavimentos.estado).toBe('SEM_DADO');
    // Passando da divisa: não cabe no lote.
    m = applyCommand(m, { type: 'MoveBlocoVertex', blocoId: s.blocoId, index: 2, to: point(31000, 39000) }).model;
    r = medirMassa(m, contexto(m));
    expect(r.blocos[0].pisosForaDoEnvelope).toBe(2);
  });

  it('afastamento progressivo: os pavimentos altos deixam de caber; o recuo efetivo é o maior', () => {
    const { m: m0, nivel } = lote();
    const m = applyCommand(m0, { type: 'AddBloco', levelId: nivel, nome: 'Torre', pontos: ret(3000, 6000, 27000, 36000), pavimentos: 10 }).model;
    // Laterais a 3 m do lote; (h − 6)/4 acima de 6 m passa de 3 m quando o topo passa de 18 m.
    const zona: ZonaDaMassa = { ...ZONA, afastamentoProgressivo: { aPartirDeM: 6, formula: '(h - 6) / 4' } };
    const r = medirMassa(m, contexto(m, zona));
    const t = r.blocos[0];
    expect(t.pisos.filter((p) => p.cabe === false).map((p) => p.indice)).toEqual([7, 8, 9, 10]);
    expect(t.pisos[9].afastamentoMm).toBe(6000);
    expect(t.pisos[0].afastamentoMm).toBeNull();
    expect(t.pisos[6].areaForaMm2).toBeGreaterThan(0);
  });

  it('sem terreno: os indicadores dizem por quê, nada vira zero', () => {
    const m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const m2 = applyCommand(m, { type: 'AddBloco', levelId: m.levels[0].id, nome: 'A', pontos: ret(0, 0, 10000, 10000), pavimentos: 3 }).model;
    const r = medirMassa(m2, { terreno: null, limites: [], recuosBase: RECUOS, zona: ZONA });
    expect(r.to).toMatchObject({ usado: null, estado: 'SEM_DADO' });
    expect(r.to.motivo).toMatch(/feche as divisas/);
    expect(r.ca.estado).toBe('SEM_DADO');
    expect(r.blocos[0].pisos[0].cabe).toBeNull();
    expect(r.areaConstruidaM2).toBe(300);
    expect(proximoNomeDeBloco(m2)).toBe('Bloco 1');
  });
});

describe('aproveitamento do estudo (TO e CA de todos os pavimentos + massa)', () => {
  it('soma pavimentos desenhados e blocos; a projeção é a união', () => {
    const { m: m0, nivel } = lote();
    const w = (lv: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: lv, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 });
    let m = applyCommand(m0, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 }).model;
    const n1 = m.levels.find((l) => l.name === '1º')!.id;
    // Casa 10 × 10 m de eixo no térreo e no 1º.
    for (const lv of [nivel, n1]) m = applyBatch(m, [w(lv, 5000, 6000, 15000, 6000), w(lv, 15000, 6000, 15000, 16000), w(lv, 15000, 16000, 5000, 16000), w(lv, 5000, 16000, 5000, 6000)]).model;
    // Bloco 10 × 10 × 2 pav ao lado, encostado (x 15–25).
    m = applyCommand(m, { type: 'AddBloco', levelId: nivel, nome: 'Anexo', pontos: ret(15000, 6000, 25000, 16000), pavimentos: 2 }).model;
    const terreno = medirTerreno(divisasDoLote(m.boundaries));
    const massa = medirMassa(m, contexto(m));
    const a = aproveitamentoDoEstudo(m, terreno, massa)!;
    expect(a.pavimentosDesenhados).toBe(2);
    expect(a.blocos).toBe(1);
    expect(a.areaProjetadaM2).toBeCloseTo(200, 1);
    expect(a.areaConstruidaM2).toBeCloseTo(400, 1);
    expect(a.taxaOcupacao).toBeCloseTo(200 / 1200, 4);
    expect(a.coeficienteAproveitamento).toBeCloseTo(400 / 1200, 4);
    expect(aproveitamentoDoEstudo(m, null, massa)).toBeNull();
  });
});

