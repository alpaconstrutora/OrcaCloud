/**
 * ESTUDO DE MASSA, fase M6b (03/10/2026): a planta interna de cada unidade
 * pelo gerador da E6.2, no quadro do bloco. Paredes internas, portas internas,
 * janelas só na fachada, cada cômodo na unidade; as cópias vivas levam tudo;
 * a mesma lista aplicada de uma vez dá o mesmo modelo; não refaz o que já tem.
 * Unidades IGUAIS (mesma tipologia, medidas e fachada a menos de espelho) viram
 * um Grupo da E2.3: editar a origem propaga, editar a cópia é recusado.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, transformarPontoDoGrupo, uidDaCopia, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoSemente, type Produto } from '../utils/blueprintProduto';
import { direcaoDaRua, dividirPavimento, montarPavimentoTipo, ordinalDoTipo, quadroDoBloco } from '../utils/blueprintPavimentoTipoDaMassa';
import { instanciaDaUnidadeIgual, plantasDasUnidades, programaDaTipologia, unidadeTemPlanta, type RetLocal } from '../utils/blueprintPlantaDaUnidade';

type Papel = 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';
const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');

/** Lote 40 × 60 (rua ao sul), Torre A 30 × 16 × 10 pav, pavimento tipo montado. `girar` roda tudo; `x0`/`x1` alargam a torre. */
function comTipo(produto: Produto, girar = 0, x0 = 5000, x1 = 35000) {
  const a = (girar * Math.PI) / 180;
  const g = (p: Point) => point(Math.round(p.x * Math.cos(a) - p.y * Math.sin(a)), Math.round(p.x * Math.sin(a) + p.y * Math.cos(a)));
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: Papel): Command => ({ type: 'AddBoundary', levelId: t, a: g({ x: ax, y: ay }), b: g({ x: bx, y: by }), kind: 'TERRENO', papel });
  m = applyBatch(m, [
    d(0, 0, 40000, 0, 'FRENTE'), d(40000, 0, 40000, 60000, 'LATERAL_DIREITA'), d(40000, 60000, 0, 60000, 'FUNDOS'), d(0, 60000, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: t, nome: 'Torre A', pontos: [g({ x: x0, y: 20000 }), g({ x: x1, y: 20000 }), g({ x: x1, y: 36000 }), g({ x: x0, y: 36000 })], pavimentos: 10 },
  ]).model;
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const pb = distribuirProduto(m, massa, produto).blocos[0];
  const b = m.blocos![0];
  const ord = ordinalDoTipo(m, b);
  const piso = pb.pisos.find((p) => p.ordinal === ord)!;
  const r = dividirPavimento({ bloco: b, produto, porTipologia: piso.porTipologia, nucleoM2: pb.nucleo.m2, elevadores: pb.nucleo.elevadores, ordinalDoTipo: ord, rotacaoNorteDeg: null, direcaoDaRua: direcaoDaRua(m) });
  if (!r.ok) throw new Error(r.motivo);
  const mont = montarPavimentoTipo(m, b, r.divisao);
  return { antes: m, model: mont.model, tipo: mont.tipoLevelId, bloco: b };
}

const etiquetasNoTipo = (m: BlueprintModel, tipo: string, numero: string) => {
  const u = (m.unidades ?? []).find((x) => x.numero === numero)!;
  return m.labels.filter((l) => l.levelId === tipo && u.etiquetaUids.includes(l.uid));
};

describe('programa da tipologia', () => {
  it('2 dorm., 3 dorm. com suíte, 1 dorm., studio; comercial não tem programa', () => {
    const q = (p: ReturnType<typeof programaDaTipologia>, uso: string) => p!.itens.filter((i) => i.uso === uso).reduce((s, i) => s + i.quantidade, 0);
    const dois = programaDaTipologia({ uso: 'RESIDENCIAL', dormitorios: 2, nome: '2 dorm.' });
    expect([q(dois, 'DORMITORIO'), q(dois, 'SUITE')]).toEqual([2, 0]);
    const tres = programaDaTipologia({ uso: 'RESIDENCIAL', dormitorios: 3, nome: '3 dorm.' });
    expect([q(tres, 'DORMITORIO'), q(tres, 'SUITE')]).toEqual([2, 1]);
    const quatro = programaDaTipologia({ uso: 'RESIDENCIAL', dormitorios: 4, nome: '4 suítes' });
    expect([q(quatro, 'DORMITORIO'), q(quatro, 'SUITE')]).toEqual([3, 1]);
    expect(q(programaDaTipologia({ uso: 'RESIDENCIAL', dormitorios: 1, nome: '1 dorm.' }), 'DORMITORIO')).toBe(1);
    expect(q(programaDaTipologia({ uso: 'RESIDENCIAL', dormitorios: 0, nome: 'Studio' }), 'DORMITORIO')).toBe(0);
    expect(programaDaTipologia({ uso: 'COMERCIAL', dormitorios: 0, nome: 'Sala' })).toBeNull();
  });
});

describe('planta interna das unidades', () => {
  const C = comTipo(MEDIO);
  const pl = plantasDasUnidades(C.model, C.bloco, MEDIO);

  it('cada unidade ganha os cômodos do programa, todos dentro da unidade (E2.2)', () => {
    expect(pl.unidades.length).toBeGreaterThanOrEqual(5);
    for (const u of pl.unidades) {
      const esperado = u.tipologia.startsWith('3') ? 11 : 8;
      expect(u.ambientes).toHaveLength(esperado);
      expect(etiquetasNoTipo(pl.model, C.tipo, u.numero)).toHaveLength(esperado);
      expect(unidadeTemPlanta(pl.model, u.numero, C.tipo)).toBe(true);
      expect(u.origem === 'gerada' || /^instância da/.test(u.origem)).toBe(true);
    }
    expect(pl.geracoes).toBeGreaterThan(0);
  });

  it('paredes só internas (o contorno continua com 4), janelas SÓ na fachada, e as cópias vivas levam tudo', () => {
    const q = quadroDoBloco(C.bloco)!;
    const local = (p: Point) => ({ a: (p.x - q.o.x) * q.u.x + (p.y - q.o.y) * q.u.y, b: (p.x - q.o.x) * q.v.x + (p.y - q.o.y) * q.v.y });
    const noPerimetro = (w: { a: Point; b: Point }) => {
      const [pa, pb] = [local(w.a), local(w.b)];
      const borda = (x: number, alvo: number) => Math.abs(x - alvo) < 5;
      return (borda(pa.b, 0) && borda(pb.b, 0)) || (borda(pa.b, q.D) && borda(pb.b, q.D)) || (borda(pa.a, 0) && borda(pb.a, 0)) || (borda(pa.a, q.W) && borda(pb.a, q.W));
    };
    const paredesTipo = pl.model.walls.filter((w) => w.levelId === C.tipo);
    expect(paredesTipo.filter(noPerimetro)).toHaveLength(4);
    expect(paredesTipo.length).toBeGreaterThan(C.model.walls.filter((w) => w.levelId === C.tipo).length);
    const janelas = pl.model.openings.filter((o) => o.kind === 'window' && paredesTipo.some((w) => w.id === o.wallId));
    expect(janelas.length).toBeGreaterThan(0);
    for (const j of janelas) expect(noPerimetro(paredesTipo.find((w) => w.id === j.wallId)!)).toBe(true);
    for (const copia of pl.model.levels.filter((l) => l.tipoDeId === C.tipo)) expect(pl.model.walls.filter((w) => w.levelId === copia.id)).toHaveLength(paredesTipo.length);
  });

  it('a lista aplicada DE UMA VEZ dá o mesmo modelo; rodar de novo não refaz (e diz)', () => {
    const deUmaVez = applyBatch(C.model, pl.comandos).model;
    expect(deUmaVez.walls.length).toBe(pl.model.walls.length);
    expect(deUmaVez.openings.length).toBe(pl.model.openings.length);
    expect((deUmaVez.unidades ?? []).map((u) => [u.numero, u.etiquetaUids.length])).toEqual((pl.model.unidades ?? []).map((u) => [u.numero, u.etiquetaUids.length]));
    const denovo = plantasDasUnidades(pl.model, C.bloco, MEDIO);
    expect(denovo.comandos).toHaveLength(0);
    expect(denovo.avisos.join(' ')).toMatch(/já tem planta interna/);
  });

  it('o que não cabe no zoneamento do gerador é DITO: cômodo que pede luz e ficou sem fachada', () => {
    const semFachada = pl.unidades.flatMap((u) => u.semFachada);
    if (semFachada.length) expect(pl.avisos.join(' ')).toMatch(/pedem luz ficaram sem fachada/);
    // A escolha da orientação mantém a maioria dos cômodos com luz na fachada.
    const pedem = pl.unidades.reduce((s, u) => s + u.ambientes.length, 0);
    expect(semFachada.length).toBeLessThan(pedem / 4);
  });

  it('sem pavimento tipo, pede para montar; unidade comercial fica aberta', () => {
    expect(plantasDasUnidades(C.antes, C.bloco, MEDIO).avisos.join(' ')).toMatch(/Monte o pavimento tipo/);
    // As mesmas unidades, lidas com um produto em que as tipologias são COMERCIAIS: ficam abertas.
    const comercial: Produto = { ...MEDIO, tipologias: MEDIO.tipologias.map((t) => ({ ...t, uso: 'COMERCIAL' as const })) };
    const r = plantasDasUnidades(C.model, C.bloco, comercial);
    expect(r.comandos).toHaveLength(0);
    expect(r.unidades.length).toBeGreaterThan(0);
    expect(r.unidades.every((u) => u.origem === 'unidade comercial: fica aberta')).toBe(true);
  });

  it('o estudo girado 30°: as mesmas unidades com os mesmos cômodos (gera no quadro do bloco)', () => {
    const g = comTipo(MEDIO, 30);
    const pg = plantasDasUnidades(g.model, g.bloco, MEDIO);
    expect(pg.unidades.map((u) => [u.numero, u.ambientes.length])).toEqual(pl.unidades.map((u) => [u.numero, u.ambientes.length]));
  });
}, 120_000);

describe('unidades iguais viram GRUPO (E2.3): editar a origem propaga às iguais', () => {
  // Torre de 38 m com uma tipologia só: 4 unidades de cada lado — os cantos espelhados e as do meio repetidas.
  const SO_2Q: Produto = { ...MEDIO, tipologias: [{ ...MEDIO.tipologias[0], proporcaoPct: 100 }] };
  const C = comTipo(SO_2Q, 0, 1000, 39000);
  const pl = plantasDasUnidades(C.model, C.bloco, SO_2Q);
  const nomes = (m: BlueprintModel, numero: string) => etiquetasNoTipo(m, C.tipo, numero).map((l) => l.name).sort();

  it('um grupo por classe: canto espelhado no canto oposto, meio repetido no meio; a planta gerada UMA vez por classe', () => {
    expect(pl.grupos.map((g) => [g.origem, g.iguais.map((i) => `${i.numero} ${i.repeticao}`)])).toEqual([
      ['101', ['107 espelhada']],
      ['102', ['108 espelhada']],
      ['103', ['105 repetida']],
      ['104', ['106 repetida']],
    ]);
    expect(pl.unidades.find((u) => u.numero === '107')!.origem).toBe('instância da 101 (espelhada)');
    expect(pl.unidades.find((u) => u.numero === '105')!.origem).toBe('instância da 103 (repetida)');
    // 4 origens × 3 frentes × 2 sementes: as iguais não geram de novo.
    expect(pl.geracoes).toBe(24);
    const grupos = pl.model.grupos ?? [];
    expect(grupos).toHaveLength(4);
    expect(grupos.map((g) => g.instancias[0].espelho)).toEqual(['X', 'X', 'NENHUM', 'NENHUM']);
  });

  it('cada igual É a unidade da M6a (mesmo número) com os mesmos cômodos da origem, todos fechados', () => {
    for (const g of pl.grupos) {
      for (const i of g.iguais) {
        expect(nomes(pl.model, i.numero)).toEqual(nomes(pl.model, g.origem));
        for (const l of etiquetasNoTipo(pl.model, C.tipo, i.numero)) expect(pl.model.spaces.some((s) => s.levelId === C.tipo && s.labelUid === l.uid)).toBe(true);
      }
    }
    expect((pl.model.unidades ?? []).map((u) => u.numero)).toEqual((C.model.unidades ?? []).map((u) => u.numero));
    // As cópias vivas (E2.1) levam também as paredes copiadas pelo grupo.
    const paredesTipo = pl.model.walls.filter((w) => w.levelId === C.tipo).length;
    for (const copia of pl.model.levels.filter((l) => l.tipoDeId === C.tipo)) expect(pl.model.walls.filter((w) => w.levelId === copia.id)).toHaveLength(paredesTipo);
    // A lista de uma vez dá o mesmo modelo (é o que o editor faz com `runBatch`).
    const deUmaVez = applyBatch(C.model, pl.comandos).model;
    expect([deUmaVez.walls.length, deUmaVez.openings.length, deUmaVez.labels.length, (deUmaVez.grupos ?? []).length]).toEqual([pl.model.walls.length, pl.model.openings.length, pl.model.labels.length, 4]);
  });

  it('editar a ORIGEM propaga (espessura, porta, nome do cômodo); editar a CÓPIA é recusado', () => {
    const g = pl.model.grupos!.find((x) => x.nome.endsWith('(101)'))!;
    const inst = g.instancias[0];
    const w0 = pl.model.walls.find((w) => w.uid === g.origem.walls[0])!;
    let m = applyBatch(pl.model, [{ type: 'SetThickness', wallId: w0.id, thicknessMm: 200 }]).model;
    const copia = m.walls.find((w) => w.uid === uidDaCopia(inst.uid, w0.uid))!;
    expect(copia.thicknessMm).toBe(200);
    expect(() => applyBatch(m, [{ type: 'SetThickness', wallId: copia.id, thicknessMm: 100 }])).toThrow(/instância do grupo/);
    // Uma porta interna da origem sai: a da 107 também.
    const idsDaOrigem = new Set(g.origem.walls.map((u) => m.walls.find((w) => w.uid === u)!.id));
    const porta = m.openings.find((o) => o.kind === 'door' && idsDaOrigem.has(o.wallId))!;
    const portaCopia = uidDaCopia(inst.uid, porta.uid);
    expect(m.openings.some((o) => o.uid === portaCopia)).toBe(true);
    m = applyBatch(m, [{ type: 'DeleteOpening', openingId: porta.id }]).model;
    expect(m.openings.some((o) => o.uid === portaCopia)).toBe(false);
    // Renomear um cômodo da origem renomeia o da igual.
    const sala = etiquetasNoTipo(m, C.tipo, '101').find((l) => /Sala/.test(l.name))!;
    const espaco = m.spaces.find((s) => s.labelUid === sala.uid)!;
    m = applyBatch(m, [{ type: 'NameSpace', spaceId: espaco.id, name: 'Living' }]).model;
    expect(m.labels.find((l) => l.uid === uidDaCopia(inst.uid, sala.uid))!.name).toBe('Living');
  });

  it('a JANELA da fachada não é do grupo (a fachada é uma parede só): cada igual tem as suas, espelhadas', () => {
    expect(pl.unidades.find((u) => u.numero === '107')!.janelas).toBe(pl.unidades.find((u) => u.numero === '101')!.janelas);
  });

  it('sem agrupar (o caminho de volta): as mesmas plantas, como cópia do desenho', () => {
    const sem = plantasDasUnidades(C.model, C.bloco, SO_2Q, 1, { agrupar: false });
    expect(sem.grupos).toHaveLength(0);
    expect(sem.model.grupos ?? []).toHaveLength(0);
    expect(sem.unidades.find((u) => u.numero === '107')!.origem).toBe('a mesma planta da 101 (espelhada)');
    for (const u of sem.unidades) expect(nomes(sem.model, u.numero)).toEqual(nomes(pl.model, u.numero));
  });

  it('bloco GIRADO 30°: só repetição (espelho no eixo do mundo não serve) — os cantos ficam com planta própria', () => {
    const g = comTipo(SO_2Q, 30, 1000, 39000);
    const pg = plantasDasUnidades(g.model, g.bloco, SO_2Q);
    expect(pg.grupos.map((x) => [x.origem, x.iguais.map((i) => i.numero)])).toEqual([['103', ['105']], ['104', ['106']]]);
    expect(pg.avisos.join(' ')).not.toMatch(/não fechou/);
    for (const u of pg.unidades) expect(etiquetasNoTipo(pg.model, g.tipo, u.numero)).toHaveLength(8);
  });

  it('girado 90°: o espelho ao longo do bloco é no eixo Y do desenho', () => {
    const g = comTipo(SO_2Q, 90, 1000, 39000);
    const pg = plantasDasUnidades(g.model, g.bloco, SO_2Q);
    expect((pg.model.grupos ?? []).map((x) => x.instancias[0].espelho)).toEqual(['Y', 'Y', 'NENHUM', 'NENHUM']);
  });
}, 180_000);

describe('a instância que leva uma unidade na igual', () => {
  // Quadro alinhado e quadro girado 30°: os cantos da origem, lidos com a repetição, caem nos cantos da igual.
  const alinhado = { o: point(1000, 20000), u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, W: 38000, D: 16000 };
  const c = Math.cos(Math.PI / 6);
  const sn = Math.sin(Math.PI / 6);
  const girado = { o: point(-5670, 19821), u: { x: c, y: sn }, v: { x: -sn, y: c }, W: 38000, D: 16000 };
  const rO: RetLocal = { a0: 0, a1: 9500, b0: 0, b1: 7250 };
  const rT: RetLocal = { a0: 19000, a1: 28500, b0: 8750, b1: 16000 };
  const casos = [
    { espelhaA: false, espelhaB: false },
    { espelhaA: true, espelhaB: true },
    { espelhaA: true, espelhaB: false },
    { espelhaA: false, espelhaB: true },
  ];
  it.each(casos)('repetição %o', (rep) => {
    for (const q of [alinhado, girado]) {
      const inst = instanciaDaUnidadeIgual(q, rO, rT, rep);
      if (q === girado && rep.espelhaA !== rep.espelhaB) {
        expect(inst).toBeNull();
        continue;
      }
      expect(inst).not.toBeNull();
      const W = rO.a1 - rO.a0;
      const D = rO.b1 - rO.b0;
      const mundo = (a: number, b: number) => ({ x: q.o.x + q.u.x * a + q.v.x * b, y: q.o.y + q.u.y * a + q.v.y * b });
      for (const [x, y] of [[0, 0], [W, 0], [0, D], [W, D], [1234, 567]]) {
        const naOrigem = mundo(rO.a0 + x, rO.b0 + y);
        const esperado = mundo(rT.a0 + (rep.espelhaA ? W - x : x), rT.b0 + (rep.espelhaB ? D - y : y));
        const obtido = transformarPontoDoGrupo({ pivo: inst!.pivo }, inst!, naOrigem);
        expect(Math.hypot(obtido.x - esperado.x, obtido.y - esperado.y)).toBeLessThan(2);
      }
    }
  });
});
