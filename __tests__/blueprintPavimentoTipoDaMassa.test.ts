/**
 * ESTUDO DE MASSA, fase M6a (02/10/2026): da massa ao pavimento tipo (§19,
 * §20). O bloco + o produto distribuído → esquema (corredor central ou
 * lateral), núcleo, unidades numeradas com canto e orientação; a montagem no
 * kernel (paredes, portas, núcleo, escada, Unidade por apartamento, cópias
 * vivas dos andares) — e a mesma lista aplicada de uma vez dá o mesmo modelo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, computeQuantities, emptyModel, point, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { quantitativosPorPavimento } from '../utils/blueprintQuantitativosPorPavimento';
import { gerarIfc } from '../utils/blueprintIfc';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../utils/blueprintProduto';
import { direcaoDaRua, dividirPavimento, montarPavimentoTipo, ordinalDoTipo, pavimentoTipoMontado, quadroDoBloco, uidDoPavimentoTipo, type DivisaoDoPavimento } from '../utils/blueprintPavimentoTipoDaMassa';

type Papel = 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';
const PRODUTO = produtoSemente('RESIDENCIAL_MEDIO');

/** Lote 40 × 60 m com a rua ao SUL (y = 0) e um bloco; `girar` roda tudo em torno da origem. */
function estudo(bloco: Point[], pavimentos: number, girar = 0): BlueprintModel {
  const a = (girar * Math.PI) / 180;
  const g = (p: Point) => point(Math.round(p.x * Math.cos(a) - p.y * Math.sin(a)), Math.round(p.x * Math.sin(a) + p.y * Math.cos(a)));
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: Papel): Command => ({ type: 'AddBoundary', levelId: t, a: g({ x: ax, y: ay }), b: g({ x: bx, y: by }), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 40000, 0, 'FRENTE'), d(40000, 0, 40000, 60000, 'LATERAL_DIREITA'), d(40000, 60000, 0, 60000, 'FUNDOS'), d(0, 60000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  return applyBatch(m, [{ type: 'AddBloco', levelId: t, nome: 'Torre A', pontos: bloco.map(g), pavimentos }]).model;
}
const ret = (x0: number, y0: number, x1: number, y1: number): Point[] => [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];

/** O que o editor passa: a distribuição do produto (M2) no pavimento tipo do bloco. */
function dividir(m: BlueprintModel, rotacaoNorteDeg: number | null = null) {
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const dist = distribuirProduto(m, massa, PRODUTO);
  const b = m.blocos![0];
  const pb = dist.blocos[0];
  const ord = ordinalDoTipo(m, b);
  const piso = pb.pisos.find((p) => p.ordinal === ord)!;
  return dividirPavimento({ bloco: b, produto: PRODUTO, porTipologia: piso.porTipologia, nucleoM2: pb.nucleo.m2, elevadores: pb.nucleo.elevadores, ordinalDoTipo: ord, rotacaoNorteDeg, direcaoDaRua: direcaoDaRua(m) });
}

describe('pavimento tipo da massa — divisão', () => {
  const M = estudo(ret(5000, 20000, 35000, 36000), 10); // 30 × 16 m, 10 pav
  const r = dividir(M);
  const d = (r as { ok: true; divisao: DivisaoDoPavimento }).divisao;

  it('30 × 16 m: corredor central, núcleo no lado A, unidades numeradas na ordem do envio, com canto', () => {
    expect(r.ok).toBe(true);
    expect(d.esquema).toBe('CORREDOR_CENTRAL');
    expect(d.ordinalDoTipo).toBe(2);
    expect(d.unidades.map((u) => u.posicao)).toEqual(d.unidades.map((_, i) => i + 1));
    expect(d.unidades[0].numero).toBe('101');
    expect(new Set(d.unidades.map((u) => u.numero)).size).toBe(d.unidades.length);
    // As tipologias na ordem do produto (2 dorm. primeiro), como o envio ao Empreendimento numera.
    const ordem = d.unidades.map((u) => u.tipologiaId);
    expect([...ordem].sort((a, b) => PRODUTO.tipologias.findIndex((t) => t.id === a) - PRODUTO.tipologias.findIndex((t) => t.id === b))).toEqual(ordem);
    expect(d.unidades.some((u) => u.lado === 'A') && d.unidades.some((u) => u.lado === 'B')).toBe(true);
    expect(d.unidades.filter((u) => u.canto).length).toBe(4);
    expect(d.nucleo).not.toBeNull();
    expect(d.elevadores).toBe(2); // 10 pavimentos
    // Cada lado preenche o comprimento inteiro (unidades + núcleo).
    for (const lado of ['A', 'B'] as const) {
      const fatias = d.unidades.filter((u) => u.lado === lado).map((u) => u.local);
      const total = fatias.reduce((s, f) => s + (f.a1 - f.a0), 0) + (lado === 'A' && d.nucleo ? d.nucleo.a1 - d.nucleo.a0 : 0);
      expect(Math.round(total)).toBe(30000);
    }
  });

  it('orientação: com a rua ao sul, o lado A olha para o SUL e para a FRENTE; o lado B, NORTE e FUNDOS', () => {
    for (const u of d.unidades) {
      if (u.lado === 'A') expect([u.orientacao, u.solCardinal, u.posicaoNoLote]).toEqual(['S', 'SUL', 'FRENTE']);
      else expect([u.orientacao, u.solCardinal, u.posicaoNoLote]).toEqual(['N', 'NORTE', 'FUNDOS']);
    }
    // Norte do desenho girado 90°: o "sul" do desenho vira leste.
    const girado = dividir(M, 90) as { ok: true; divisao: DivisaoDoPavimento };
    expect(girado.divisao.unidades.find((u) => u.lado === 'A')!.solCardinal).not.toBe('SUL');
  });

  it('12 m de profundidade: corredor lateral, unidades de um lado só; bloco não retangular é recusado com o motivo', () => {
    const lat = dividir(estudo(ret(5000, 20000, 35000, 32000), 6)) as { ok: true; divisao: DivisaoDoPavimento };
    expect(lat.divisao.esquema).toBe('CORREDOR_LATERAL');
    expect(lat.divisao.unidades.every((u) => u.lado === 'A')).toBe(true);
    const emL = estudo([point(5000, 20000), point(35000, 20000), point(35000, 32000), point(17000, 32000), point(17000, 50000), point(5000, 50000)], 6);
    const r2 = dividir(emL);
    expect(r2.ok).toBe(false);
    expect((r2 as { ok: false; motivo: string }).motivo).toMatch(/não é um retângulo/);
    expect(quadroDoBloco({ pontos: ret(0, 0, 10000, 20000) })).toMatchObject({ W: 20000, D: 10000 });
  });

  it('o mesmo estudo girado 30°: as mesmas unidades (a divisão segue o bloco, não o desenho)', () => {
    const g = dividir(estudo(ret(5000, 20000, 35000, 36000), 10, 30)) as { ok: true; divisao: DivisaoDoPavimento };
    expect(g.divisao.esquema).toBe(d.esquema);
    expect(g.divisao.unidades.map((u) => [u.numero, u.tipologiaId, u.lado, u.canto])).toEqual(d.unidades.map((u) => [u.numero, u.tipologiaId, u.lado, u.canto]));
  });
});

describe('pavimento tipo da massa — montagem no kernel', () => {
  const M = estudo(ret(5000, 20000, 35000, 36000), 10);
  const d = (dividir(M) as { ok: true; divisao: DivisaoDoPavimento }).divisao;
  const mont = montarPavimentoTipo(M, M.blocos![0], d);

  it('pavimento tipo na cota do 2º pavimento + 8 cópias vivas; cada unidade vira Unidade com o número e a etiqueta', () => {
    const tipo = mont.model.levels.find((l) => l.id === mont.tipoLevelId)!;
    expect(tipo.elevationMm).toBe(3000);
    expect(mont.copias).toBe(8);
    expect(mont.model.levels.filter((l) => l.tipoDeId === tipo.id)).toHaveLength(8);
    const unidades = mont.model.unidades ?? [];
    expect(unidades.map((u) => u.numero)).toEqual(d.unidades.map((u) => u.numero));
    for (const u of unidades) expect(u.etiquetaUids).toHaveLength(1);
    expect(unidades[0].tipologia).toBe(d.unidades[0].tipologiaNome);
    expect(mont.avisos.filter((a) => /não fechou|não achei|estreita/.test(a))).toEqual([]);
  });

  it('portas de cada unidade e do núcleo no corredor; elevadores, shaft e escada no núcleo; áreas desenhadas coerentes', () => {
    const portas = mont.model.openings.filter((o) => o.kind === 'door' && mont.model.walls.find((w) => w.id === o.wallId)?.levelId === mont.tipoLevelId);
    expect(portas).toHaveLength(d.unidades.length + 1);
    const nucleos = (mont.model.nucleos ?? []).filter((n) => n.levelId === mont.tipoLevelId);
    expect(nucleos.filter((n) => n.tipo === 'ELEVADOR')).toHaveLength(2);
    expect(nucleos.filter((n) => n.tipo === 'SHAFT')).toHaveLength(1);
    expect((mont.model.stairs ?? []).filter((s) => s.levelId === mont.tipoLevelId)).toHaveLength(1);
    for (const a of mont.areasDesenhadas) {
      const u = d.unidades.find((x) => x.numero === a.numero)!;
      expect(a.areaM2).toBeGreaterThan(u.areaM2 * 0.85);
      expect(a.areaM2).toBeLessThanOrEqual(u.areaM2);
    }
    expect(mont.eficienciaDesenhadaPct!).toBeGreaterThan(55);
    expect(mont.eficienciaDesenhadaPct!).toBeLessThan(90);
    expect(mont.avisos.join(' ')).toMatch(/térreo\) ficou para o projetista/);
  });

  it('a lista de comandos aplicada DE UMA VEZ no modelo de origem dá o mesmo resultado (o editor aplica assim)', () => {
    const deUmaVez = applyBatch(M, mont.comandos).model;
    expect(deUmaVez.levels.map((l) => [l.id, l.name, l.tipoDeId ?? null])).toEqual(mont.model.levels.map((l) => [l.id, l.name, l.tipoDeId ?? null]));
    expect((deUmaVez.unidades ?? []).map((u) => [u.id, u.numero, u.etiquetaUids.length])).toEqual((mont.model.unidades ?? []).map((u) => [u.id, u.numero, u.etiquetaUids.length]));
    expect(deUmaVez.openings.length).toBe(mont.model.openings.length);
    expect(deUmaVez.walls.length).toBe(mont.model.walls.length);
  });

  it('daí o quantitativo e o IFC fluem pelo que existe: cada cópia viva conta no seu andar; o IFC leva os 10 pavimentos', () => {
    const porPavimento = quantitativosPorPavimento(mont.model, computeQuantities(mont.model));
    const doTipo = porPavimento.filter((p) => p.levelId === mont.tipoLevelId || mont.model.levels.find((l) => l.id === p.levelId)?.tipoDeId === mont.tipoLevelId);
    expect(doTipo).toHaveLength(9);
    const paredesDoTipo = mont.model.walls.filter((w) => w.levelId === mont.tipoLevelId).length;
    // Cada andar repetido tem a MESMA alvenaria, portas e ambientes do tipo.
    const ref = doTipo.find((p) => p.levelId === mont.tipoLevelId)!;
    expect(ref.areaParedeDuasFacesM2).toBeGreaterThan(0);
    expect(ref.portas).toBe(d.unidades.length + 1);
    for (const p of doTipo) expect([p.areaParedeDuasFacesM2, p.portas, p.ambientes]).toEqual([ref.areaParedeDuasFacesM2, ref.portas, ref.ambientes]);
    const ifc = gerarIfc(mont.model, { titulo: 'Estudo de massa — prova', revisao: 1, hash: 'teste' });
    expect((ifc.match(/IFCBUILDINGSTOREY\(/g) ?? []).length).toBe(10);
    expect((ifc.match(/IFCWALL(?:STANDARDCASE)?\(/g) ?? []).length).toBeGreaterThanOrEqual(paredesDoTipo * 9);
    expect((ifc.match(/IFCSPACE\(/g) ?? []).length).toBeGreaterThanOrEqual(d.unidades.length);
  });

  it('montar duas vezes é recusado: o pavimento tipo do bloco tem identidade (achado da prova no app real)', () => {
    const b = M.blocos![0];
    expect(pavimentoTipoMontado(M, b)).toBeNull();
    expect(pavimentoTipoMontado(mont.model, b)!.uid).toBe(uidDoPavimentoTipo(b));
    expect(() => montarPavimentoTipo(mont.model, b, d)).toThrow(/já está montado/);
    // As cópias também têm identidade estável (mesmo GUID no IFC da revisão seguinte).
    const copias = mont.model.levels.filter((l) => l.tipoDeId === mont.tipoLevelId).map((l) => l.uid);
    expect(new Set(copias).size).toBe(8);
    expect(montarPavimentoTipo(M, b, d).model.levels.filter((l) => l.tipoDeId).map((l) => l.uid)).toEqual(copias);
  });

  it('número que já existe no estudo não é recriado (e diz)', () => {
    const comUma = applyBatch(M, [{ type: 'AddUnidade', numero: d.unidades[0].numero }]).model;
    const m2 = montarPavimentoTipo(comUma, comUma.blocos![0], d);
    expect((m2.model.unidades ?? []).filter((u) => u.numero === d.unidades[0].numero)).toHaveLength(1);
    expect(m2.avisos.join(' ')).toMatch(/já existiam/);
  });
});
