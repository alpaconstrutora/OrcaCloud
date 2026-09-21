/**
 * IMPORTAR DO SKETCHUP (COLLADA → paredes) (21/09/2026, backlog P2): o leitor
 * XML leve; o COLLADA exportado pela própria Planta volta como as mesmas
 * paredes (ida e volta, terceira fonte = o modelo de origem); polylist com
 * vários inputs, Y_UP, transformações por nó e componentes (library_nodes);
 * o que é recusado (viga baixa, pilar, painel sem par) é contado.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { gerarCollada } from '../utils/blueprintCollada';
import { OPCOES_PADRAO, pavimentosDasParedes, prepararCollada, trianguloesDoCollada } from '../utils/colladaParaKernel';
import { encostarNasFaces } from '../utils/ifcEncostarParedes';
import { lerXml } from '../utils/xmlLeve';

function casa() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, e = 150): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 2800 });
  let m = applyBatch(nivel.model, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0), w(3000, 0, 3000, 4000, 100)]).model;
  const frente = m.walls.find((x) => x.a.y === 0 && x.b.y === 0 && x.thicknessMm === 150)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: frente.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
  m = applyCommand(m, { type: 'AddOpening', wallId: frente.id, kind: 'window', offsetMm: 4000, widthMm: 1200, heightMm: 1200, sillMm: 1000 } as Command).model;
  m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(1500, 2000)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, baseMm: 0 } as Command).model;
  m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(0, 2000), point(6000, 2000)], larguraMm: 150, profundidadeMm: 0, alturaMm: 400, baseMm: 2400 } as Command).model;
  m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'LAJE', pontos: [point(0, 0), point(6000, 0), point(6000, 4000), point(0, 4000)], larguraMm: 0, profundidadeMm: 0, alturaMm: 120, baseMm: 2800 } as Command).model;
  return { m, t };
}

describe('xmlLeve', () => {
  it('lê árvore, atributos, entidades, CDATA, comentários e recusa desbalanceado', () => {
    const el = lerXml('<?xml version="1.0"?><!-- c --><a x="1" y=\'&amp;\'><b>t&lt;1</b><c/><![CDATA[<raw>]]></a>');
    expect(el.nome).toBe('a');
    expect(el.atributos).toEqual({ x: '1', y: '&' });
    expect(el.filhos.map((f) => f.nome)).toEqual(['b', 'c']);
    expect(el.filhos[0].texto).toBe('t<1');
    expect(el.texto).toBe('<raw>');
    expect(() => lerXml('<a><b></a>')).toThrow(/fechamento de <a>/);
  });
});

describe('COLLADA → paredes', () => {
  it('ida e volta: o .dae da própria Planta volta como as 5 paredes, com espessura, altura e comprimento; pilar, viga, laje e esquadrias ficam de fora', () => {
    const { m } = casa();
    const dae = gerarCollada(m, { titulo: 'Casa', revisao: 1, hash: 'h' });
    const r = prepararCollada(dae);
    expect(r.resumo.upAxis).toBe('Z_UP');
    expect(r.resumo.unidadeM).toBe(1);
    expect(r.resumo.instancias).toBe(5 + 2 + 3); // paredes, esquadrias, estrutura
    expect(r.paredes).toHaveLength(5);
    const porEspessura = (e: number) => r.paredes.filter((p) => p.espessuraMm === e);
    expect(porEspessura(150)).toHaveLength(4);
    expect(porEspessura(100)).toHaveLength(1);
    for (const p of r.paredes) {
      expect(p.alturaMm).toBe(2800);
      expect(p.baseMm).toBe(0);
    }
    // A parede da frente (com porta e janela) volta INTEIRA: as fatias emendam.
    const frente = r.paredes.find((p) => p.a.y === 0 && p.b.y === 0 && p.espessuraMm === 150)!;
    expect(frente.comprimentoMm).toBeGreaterThanOrEqual(6000);
    expect(frente.comprimentoMm).toBeLessThanOrEqual(6150);
    // ABERTURAS (P2.29): a porta 900×2100 (offset 1000) e a janela 1200×1200 peitoril 1000 (offset 4000) voltam — a ±50 mm (colunas de 50).
    expect(frente.aberturas).toHaveLength(2);
    const porta = frente.aberturas.find((ab) => ab.kind === 'door')!;
    const janela = frente.aberturas.find((ab) => ab.kind === 'window')!;
    // A parede pode ter voltado com a ponta `a` em 6000 (sentido invertido): o offset é medido desde `a`.
    const desdeA = (offset: number, largura: number) => (frente.a.x > frente.b.x ? frente.comprimentoMm - offset - largura : offset);
    expect(Math.abs(desdeA(porta.offsetMm, porta.widthMm) - 1000)).toBeLessThanOrEqual(75);
    expect(Math.abs(porta.widthMm - 900)).toBeLessThanOrEqual(50);
    expect(Math.abs(porta.heightMm - 2100)).toBeLessThanOrEqual(50);
    expect(porta.sillMm).toBe(0);
    expect(Math.abs(desdeA(janela.offsetMm, janela.widthMm) - 4000)).toBeLessThanOrEqual(75);
    expect(Math.abs(janela.widthMm - 1200)).toBeLessThanOrEqual(50);
    expect(Math.abs(janela.heightMm - 1200)).toBeLessThanOrEqual(50);
    expect(Math.abs(janela.sillMm - 1000)).toBeLessThanOrEqual(50);
    expect(r.paredes.filter((p) => p !== frente).every((p) => p.aberturas.length === 0)).toBe(true);
    expect(r.resumo.aberturas).toEqual({ portas: 1, janelas: 1, vaos: 0 });
    // A interna (100 mm) vai de face a face das externas (3925 mm); encostar leva ao eixo.
    const interna = porEspessura(100)[0];
    expect(interna.comprimentoMm).toBeGreaterThanOrEqual(3800);
    // O exportador não apara as paredes no encontro, então as faces já vão de eixo a eixo: encostar não tem o que fazer aqui (no SketchUp real, tem).
    const enc = encostarNasFaces(r.paredes.map((p) => ({ ...p })));
    expect(enc.paredes).toHaveLength(5);
    // Recusados, contados: a viga (400 mm de altura) é baixa; o pilar (300×300) é curto; as esquadrias e a laje não pareiam.
    expect(r.resumo.paresRecusados.baixos).toBeGreaterThanOrEqual(1);
    expect(r.resumo.paresRecusados.curtos).toBeGreaterThanOrEqual(1);
    expect(r.resumo.planosSemPar).toBeGreaterThan(0);
    expect(pavimentosDasParedes(r.paredes)).toEqual([expect.objectContaining({ elevationMm: 0, alturaMm: 2800 })]);
    expect(r.avisos).toEqual([]);
  });

  it('ABERTURAS (P2.29): vão de piso a teto vira passage; vão menor que o mínimo é ignorado; grupos com nome de móvel/instalação ficam fora', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    let m = applyBatch(nivel.model, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
    const frente = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
    m = applyCommand(m, { type: 'AddOpening', wallId: frente.id, kind: 'passage', offsetMm: 1000, widthMm: 1200, heightMm: 2800, sillMm: 0 } as Command).model;
    m = applyCommand(m, { type: 'AddOpening', wallId: frente.id, kind: 'window', offsetMm: 4000, widthMm: 200, heightMm: 200, sillMm: 1500 } as Command).model;
    // Um armário alto (2 m, 600 de fundo, 2 m de largura) e uma tomada: sem o filtro por nome, o armário viraria "parede" de 600 mm.
    m = applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'ARMARIO', familia: 'ARMARIO', at: point(3000, 2000), larguraMm: 2000, profundidadeMm: 600, alturaMm: 2000, rotacaoGraus: 0 } as Command).model;
    const dae = gerarCollada(m, { titulo: 'Casa', revisao: 1, hash: 'h' }).replace('name="Parede ', 'name="Parede ');
    // Simula o nome que a P2.31 dará ao mobiliário: um nó "Mobiliário …" com uma caixa 2000×600×2000.
    const caixa = `<geometry id="mov" name="Mobiliário armário"><mesh><source id="mov-pos"><float_array id="mov-pos-a" count="24">2 -1.7 0 4 -1.7 0 4 -2.3 0 2 -2.3 0 2 -1.7 2 4 -1.7 2 4 -2.3 2 2 -2.3 2</float_array><technique_common><accessor source="#mov-pos-a" count="8" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="mov-vtx"><input semantic="POSITION" source="#mov-pos"/></vertices><triangles count="12"><input semantic="VERTEX" source="#mov-vtx" offset="0"/><p>0 1 5 0 5 4 1 2 6 1 6 5 2 3 7 2 7 6 3 0 4 3 4 7 4 5 6 4 6 7 0 3 2 0 2 1</p></triangles></mesh></geometry>`;
    const comMovel = dae.replace('</library_geometries>', caixa + '</library_geometries>').replace('<node id="pav-', '<node id="no-mov" name="Mobiliário armário"><instance_geometry url="#mov"/></node><node id="pav-');
    const semFiltro = prepararCollada(comMovel, { ...OPCOES_PADRAO, ignorarNos: null });
    const comFiltro = prepararCollada(comMovel);
    // Com o filtro, os dois armários saem (o nó colado à mão + o que a P2.31 exporta do componente: 12 + 12 triângulos) e sobram as 4 paredes; sem ele, o armário vira uma parede a mais.
    expect(comFiltro.resumo.triangulosIgnoradosPorNome).toBe(24);
    expect(comFiltro.paredes).toHaveLength(4);
    expect(semFiltro.paredes.length).toBeGreaterThan(4);
    // O vão de 1200 de piso a teto é passage; a janelinha de 200 (< 300) é ignorada.
    const f = comFiltro.paredes.find((p) => p.a.y === 0 && p.b.y === 0)!;
    expect(f.aberturas).toHaveLength(1);
    expect(f.aberturas[0].kind).toBe('passage');
    expect(Math.abs(f.aberturas[0].widthMm - 1200)).toBeLessThanOrEqual(50);
    expect(comFiltro.resumo.aberturas).toEqual({ portas: 0, janelas: 0, vaos: 1 });
  });

  it('polylist com NORMAL de offset 1, Y_UP, unidade em cm, translate/rotate no nó e componente via library_nodes', () => {
    // Uma parede 400 cm × 10 cm × 280 cm (Y para cima), como caixa de 6 faces em polylist (quads).
    const L = 400, E = 10, H = 280;
    const v = [0, 0, 0, L, 0, 0, L, H, 0, 0, H, 0, 0, 0, -E, L, 0, -E, L, H, -E, 0, H, -E];
    const quads = [0, 1, 2, 3, 4, 7, 6, 5, 0, 4, 5, 1, 3, 2, 6, 7, 1, 5, 6, 2, 0, 3, 7, 4];
    const p = quads.map((i) => `${i} 0`).join(' ');
    const dae = `<?xml version="1.0"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit name="centimeter" meter="0.01"/><up_axis>Y_UP</up_axis></asset>
  <library_geometries><geometry id="g1"><mesh>
    <source id="g1-pos"><float_array id="g1-pos-a" count="24">${v.join(' ')}</float_array></source>
    <source id="g1-nrm"><float_array id="g1-nrm-a" count="3">0 0 1</float_array></source>
    <vertices id="g1-vtx"><input semantic="POSITION" source="#g1-pos"/></vertices>
    <polylist count="6" material="m"><input semantic="VERTEX" source="#g1-vtx" offset="0"/><input semantic="NORMAL" source="#g1-nrm" offset="1"/><vcount>4 4 4 4 4 4</vcount><p>${p}</p></polylist>
  </mesh></geometry></library_geometries>
  <library_nodes><node id="comp" name="Parede tipo"><instance_geometry url="#g1"/></node></library_nodes>
  <library_visual_scenes><visual_scene id="cena">
    <node name="A"><translate>100 0 -200</translate><instance_node url="#comp"/></node>
    <node name="B"><translate>100 0 -200</translate><rotate>0 1 0 90</rotate><instance_node url="#comp"/></node>
  </visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#cena"/></scene>
</COLLADA>`;
    const t = trianguloesDoCollada(dae);
    expect(t.resumo).toMatchObject({ unidadeM: 0.01, upAxis: 'Y_UP', geometrias: 1, instancias: 2, triangulos: 24 });
    const r = prepararCollada(dae);
    expect(r.paredes).toHaveLength(2);
    const a = r.paredes.find((p) => p.origem === 'A')!;
    const b = r.paredes.find((p) => p.origem === 'B')!;
    // A: em Y_UP, translate (100, 0, -200) cm → kernel x = 1000 mm, y = -2000 mm; eixo ao longo de x, 4000 mm, 100 mm de espessura, 2800 de altura.
    expect(a).toMatchObject({ espessuraMm: 100, alturaMm: 2800, baseMm: 0, comprimentoMm: 4000 });
    expect(Math.min(a.a.x, a.b.x)).toBe(1000);
    expect(Math.max(a.a.x, a.b.x)).toBe(5000);
    expect(a.a.y).toBe(-2000 - 50);
    // B: girada 90° em torno de Y → eixo ao longo do kernel y.
    expect(b).toMatchObject({ espessuraMm: 100, alturaMm: 2800, comprimentoMm: 4000 });
    expect(b.a.x).toBe(b.b.x);
    expect(r.avisos).toEqual(['Eixo vertical Y (padrão do COLLADA): convertido para Z para cima.']);
  });

  it('recusa o que não é COLLADA e avisa cena vazia', () => {
    expect(() => prepararCollada('<html></html>')).toThrow(/não é <COLLADA>/);
    const r = prepararCollada('<COLLADA><asset><up_axis>Z_UP</up_axis></asset><library_geometries/></COLLADA>');
    expect(r.paredes).toEqual([]);
    expect(r.avisos.some((a) => /Sem <visual_scene>/.test(a))).toBe(true);
  });
});
