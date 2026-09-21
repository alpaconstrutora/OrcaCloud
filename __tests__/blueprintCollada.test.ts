/**
 * SKETCHUP — COLLADA (.dae) (21/09/2026, backlog P2 — "SKP"): a parede vira
 * prisma com o vão aberto (volume confere), triângulos com normal para fora,
 * anel côncavo triangulado certo, estrutura e telhado entram, XML em metros
 * e Z para cima com um nó por pavimento, cobertura no cabeçalho e ao lado.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { caixaGirada, cilindroEntre, COBERTURA_COLLADA, fatiasDaParede, gerarCollada, malhasDoModelo, prisma, triangularAnel } from '../utils/blueprintCollada';
import { prepararCollada } from '../utils/colladaParaKernel';
import { segmentosDoEletroduto } from '../utils/blueprintRede';
import { artefatosDoFormato } from '../services/blueprintGedService';
import { PAPEIS } from '../utils/blueprintExport';

/** Volume assinado pela divergência: positivo quando os triângulos olham para fora. */
function volume(posicoes: number[], triangulos: number[]): number {
  let v = 0;
  for (let i = 0; i < triangulos.length; i += 3) {
    const [a, b, c] = [triangulos[i], triangulos[i + 1], triangulos[i + 2]].map((k) => [posicoes[3 * k], posicoes[3 * k + 1], posicoes[3 * k + 2]]);
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

function casa() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(nivel.model, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
  const frente = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: frente.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
  m = applyCommand(m, { type: 'AddOpening', wallId: frente.id, kind: 'window', offsetMm: 2500, widthMm: 1200, heightMm: 1200, sillMm: 1000 } as Command).model;
  return { m, t, frente };
}

describe('SKP · COLLADA', () => {
  it('fatia a parede em torno dos vãos: peitoril, verga e trechos cheios', () => {
    const fatias = fatiasDaParede(4000, 2800, [
      { offsetMm: 1000, widthMm: 900, sillMm: 0, heightMm: 2100 },
      { offsetMm: 2500, widthMm: 1200, sillMm: 1000, heightMm: 1200 },
    ]);
    expect(fatias).toEqual([
      { t0: 0, t1: 1000, z0: 0, z1: 2800 },
      { t0: 1000, t1: 1900, z0: 2100, z1: 2800 }, // verga da porta (sem peitoril)
      { t0: 1900, t1: 2500, z0: 0, z1: 2800 },
      { t0: 2500, t1: 3700, z0: 0, z1: 1000 }, // peitoril da janela
      { t0: 2500, t1: 3700, z0: 2200, z1: 2800 }, // verga da janela
      { t0: 3700, t1: 4000, z0: 0, z1: 2800 },
    ]);
  });

  it('prisma e anel côncavo: normais para fora (volume positivo) e área da triangulação = área do polígono', () => {
    const caixa = prisma([point(0, 0), point(2000, 0), point(2000, 1000), point(0, 1000)], 0, 3000);
    expect(volume(caixa.posicoes, caixa.triangulos)).toBeCloseTo(2 * 1 * 3, 6);
    // O mesmo anel no sentido oposto dá o mesmo sólido.
    const invertida = prisma([point(0, 1000), point(2000, 1000), point(2000, 0), point(0, 0)], 0, 3000);
    expect(volume(invertida.posicoes, invertida.triangulos)).toBeCloseTo(6, 6);
    // Um L (côncavo): 6 vértices → 4 triângulos, área 3 + 1 = 4 m² → prisma de 1 m = 4 m³.
    const L = [point(0, 0), point(3000, 0), point(3000, 1000), point(1000, 1000), point(1000, 2000), point(0, 2000)];
    expect(triangularAnel(L)).toHaveLength(12);
    const pl = prisma(L, 0, 1000);
    expect(volume(pl.posicoes, pl.triangulos)).toBeCloseTo(4, 6);
  });

  it('a parede com porta e janela perde exatamente o volume dos vãos; esquadrias, estrutura e telhado entram', () => {
    const { m, t, frente } = casa();
    const { malhas, resumo } = malhasDoModelo(m);
    const parede = malhas.find((x) => x.id === `parede-${frente.uid}`)!;
    // 4,00 × 0,15 × 2,80 − porta 0,9×0,15×2,1 − janela 1,2×0,15×1,2 = 1,68 − 0,2835 − 0,216 = 1,1805 m³
    expect(volume(parede.posicoes, parede.triangulos)).toBeCloseTo(1.1805, 4);
    expect(resumo).toMatchObject({ paredes: 4, esquadrias: 2, estruturas: 0, aguas: 0 });
    expect(malhas.find((x) => x.nome.startsWith('Porta'))?.material).toBe('mat-porta');
    expect(malhas.find((x) => x.nome.startsWith('Janela'))?.material).toBe('mat-vidro');

    let m2 = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(2000, 1500)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, baseMm: 0, circular: true, rotacaoDeg: 0 } as Command).model;
    m2 = applyCommand(m2, { type: 'AddStructural', levelId: t, kind: 'LAJE', pontos: [point(0, 0), point(4000, 0), point(4000, 3000), point(0, 3000)], larguraMm: 0, profundidadeMm: 0, alturaMm: 120, baseMm: 2800, circular: false, rotacaoDeg: 0 } as Command).model;
    m2 = applyCommand(m2, { type: 'AddAgua', levelId: t, pontos: [point(-500, -500), point(4500, -500), point(4500, 3500), point(-500, 3500)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2920, espessuraMm: 150 } as Command).model;
    const r2 = malhasDoModelo(m2);
    expect(r2.resumo).toMatchObject({ estruturas: 2, aguas: 1 });
    const pilar = r2.malhas.find((x) => x.nome.startsWith('Pilar'))!;
    // Cilindro ⌀0,30 × 2,80 facetado em 24: ≈ π·0,15²·2,8 = 0,198 m³ (um pouco menos pelas facetas).
    expect(volume(pilar.posicoes, pilar.triangulos)).toBeGreaterThan(0.19);
    expect(volume(pilar.posicoes, pilar.triangulos)).toBeLessThan(0.198);
    const laje = r2.malhas.find((x) => x.nome.startsWith('Laje'))!;
    expect(volume(laje.posicoes, laje.triangulos)).toBeCloseTo(4 * 3 * 0.12, 6);
    // A laje nasce na cota base (2,80 m): todo Z ≥ 2,8.
    expect(Math.min(...laje.posicoes.filter((_, i) => i % 3 === 2))).toBeCloseTo(2.8, 6);
    const agua = r2.malhas.find((x) => x.nome.startsWith('Água'))!;
    // 5×4 m em planta, 150 mm de placa pela normal: volume ≈ área real × espessura = 20·√(1+0,09)·0,15 ≈ 3,13 m³.
    expect(volume(agua.posicoes, agua.triangulos)).toBeCloseTo(20 * Math.sqrt(1.09) * 0.15, 1);
    // Sobe: o beiral (y=-500) fica na base e o fundo (y=3500) 1,2 m acima.
    const zs = agua.posicoes.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(1.2);
  });

  it('P2.31 — instalações e mobiliário: cilindros pela bitola (eletroduto em L), caixas na cota, armário por família, conjunto só pelas peças; grupos na cena; opção desliga; o importador ignora pelo nome', () => {
    const { m, t } = casa();
    let m2 = m;
    // Eletroduto de (500,500,cota 300) a (2500,500,cota 300): o 3D anda em "L" (sobe ao teto, corre, desce) → mais de um cilindro.
    m2 = applyCommand(m2, { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(500, 500), b: point(2500, 500), cotaAMm: 300, cotaBMm: 300, bitolaMm: 25 } as Command).model;
    // Tubo de água fria reto de 2 m, DN 25 → um cilindro de volume ≈ π·0,0125²·2.
    m2 = applyCommand(m2, { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(500, 1500), b: point(2500, 1500), cotaAMm: 1100, cotaBMm: 1100, bitolaMm: 25 } as Command).model;
    // Tomada (caixa 100³ centrada na cota 300 → z de 0,25 a 0,35) e quadro.
    m2 = applyCommand(m2, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Tomada', at: point(1000, 150), cotaMm: 300 } as Command).model;
    m2 = applyCommand(m2, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(3000, 150), cotaMm: 1500 } as Command).model;
    // Armário 600 × 600 × 2000 na cota 0 (0,72 m³) e um conjunto (o pai não vai; as peças vão).
    m2 = applyCommand(m2, { type: 'AddComponente', levelId: t, tipoId: 'ARMARIO', familia: 'ARMARIO', at: point(2000, 2000), larguraMm: 600, profundidadeMm: 600, alturaMm: 2000, rotacaoGraus: 30 } as Command).model;
    const antesDoConjunto = (m2.componentes ?? []).length;
    m2 = applyCommand(m2, { type: 'AddConjunto', levelId: t, tipoId: 'CONJUNTO_JANTAR', at: point(1500, 2000), rotacaoGraus: 0 } as Command).model;
    const pecasDoConjunto = (m2.componentes ?? []).length - antesDoConjunto - 1;

    const { malhas, resumo } = malhasDoModelo(m2);
    expect(resumo).toMatchObject({ trechos: 2, terminais: 1, quadros: 1, componentes: 1 + pecasDoConjunto });
    const eletroduto = malhas.find((x) => x.nome.startsWith('Trecho ELETRICA'))!;
    const agua = malhas.find((x) => x.nome.startsWith('Trecho AGUA_FRIA'))!;
    // Eletroduto: um cilindro por segmento do "L" que o 3D usa (2 tampas de 12 + 24 laterais = 48 triângulos cada).
    const segmentos = segmentosDoEletroduto(m2.trechos!.find((x) => x.disciplina === 'ELETRICA')!, 2800).length;
    expect(eletroduto.triangulos.length / 3).toBe(segmentos * 48);
    expect(agua.triangulos.length / 3).toBe(48);
    // Raio = max(bitola/2, 15 mm) = 15 mm; 12 facetas dão ~2 % a menos que o círculo.
    expect(volume(agua.posicoes, agua.triangulos)).toBeCloseTo(Math.PI * 0.015 * 0.015 * 2 * 0.977, 4);
    expect(agua.material).toBe('mat-agua-fria');
    expect(eletroduto.material).toBe('mat-eletrica');
    const tomada = malhas.find((x) => x.nome.startsWith('Ponto Tomada'))!;
    const zs = tomada.posicoes.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(0.25, 6);
    expect(Math.max(...zs)).toBeCloseTo(0.35, 6);
    expect(volume(tomada.posicoes, tomada.triangulos)).toBeCloseTo(0.001, 6);
    expect(malhas.find((x) => x.nome.startsWith('Quadro QDC'))?.material).toBe('mat-eletrica');
    const armario = malhas.find((x) => x.nome.startsWith('Mobiliário ARMARIO'))!;
    expect(volume(armario.posicoes, armario.triangulos)).toBeCloseTo(0.72, 2); // girado 30°, cantos ao mm
    expect(armario.material).toBe('mat-armario');
    expect(armario.grupo).toBe('Mobiliário');
    expect(malhas.some((x) => x.nome.includes('CONJUNTO_JANTAR'))).toBe(false);
    // Cena por grupo; materiais novos; a opção desliga.
    const xml = gerarCollada(m2, { titulo: 'Casa', revisao: 1, hash: 'h' });
    expect(xml).toMatch(/<node id="grp-[^"]*" name="Instalações">/);
    expect(xml).toMatch(/<node id="grp-[^"]*" name="Mobiliário">/);
    expect(xml).toMatch(/<node id="grp-[^"]*" name="Arquitetura">/);
    expect(xml).toContain('<material id="mat-agua-fria"');
    const so = gerarCollada(m2, { titulo: 'Casa', revisao: 1, hash: 'h', incluir: { instalacoes: false, mobiliario: false } });
    expect(so).not.toMatch(/<node id="grp-[^"]*" name="Instalações">/);
    expect(so).not.toMatch(/<node id="grp-[^"]*" name="Mobiliário">/);
    expect(so).toContain('0 trecho(s), 0 ponto(s), 0 quadro(s), 0 componente(s)');
    // Ida e volta pelo importador (P2.26/P2.29): com o padrão `ignorarNos`, o .dae com instalações e mobiliário devolve as mesmas 4 paredes — o armário de 2 m não vira parede.
    const r = prepararCollada(xml);
    expect(r.paredes).toHaveLength(4);
    expect(r.resumo.triangulosIgnoradosPorNome).toBeGreaterThan(0);
  });

  it('P2.31 — geradores: cilindro entre pontos e caixa girada com normais para fora', () => {
    const c = cilindroEntre([0, 0, 0], [0, 0, 1000], 50, 24);
    expect(volume(c.posicoes, c.triangulos)).toBeGreaterThan(Math.PI * 0.05 * 0.05 * 1 * 0.98);
    expect(volume(c.posicoes, c.triangulos)).toBeLessThan(Math.PI * 0.05 * 0.05 * 1);
    const inclinado = cilindroEntre([0, 0, 0], [1000, 1000, 1000], 50, 24);
    expect(volume(inclinado.posicoes, inclinado.triangulos)).toBeGreaterThan(Math.PI * 0.05 * 0.05 * Math.sqrt(3) * 0.98);
    const caixa = caixaGirada(point(1000, 1000), 600, 400, 45, 100, 900);
    expect(volume(caixa.posicoes, caixa.triangulos)).toBeCloseTo(0.6 * 0.4 * 0.8, 2); // cantos arredondados ao mm
    expect(cilindroEntre([0, 0, 0], [0, 0, 0], 50).triangulos).toEqual([]);
  });

  it('XML: metros, Z para cima, materiais, um nó por pavimento com as peças, cobertura no cabeçalho; determinístico', () => {
    const { m } = casa();
    const o = { titulo: 'Casa & Cia', revisao: 3, hash: 'abc123', kernelVersion: 'blueprint-kernel-ts-x' };
    const xml = gerarCollada(m, o);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">')).toBe(true);
    expect(xml).toContain('<unit name="meter" meter="1"/>');
    expect(xml).toContain('<up_axis>Z_UP</up_axis>');
    expect(xml).toContain('Casa &amp; Cia — rev. 3 — hash abc123');
    expect(xml).toContain('<node id="pav-');
    expect(xml).toContain('name="Térreo"');
    expect((xml.match(/<geometry /g) ?? []).length).toBe(6); // 4 paredes + porta + janela
    expect((xml.match(/<material /g) ?? []).length).toBe(16);
    expect(xml).toContain('4 parede(s), 2 esquadria(s), 0 peça(s) estrutural(is), 0 água(s), 0 trecho(s), 0 ponto(s), 0 quadro(s), 0 componente(s)');
    for (const linha of COBERTURA_COLLADA) expect(xml).toContain(linha.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    expect(gerarCollada(m, o)).toBe(xml);
    expect(xml).not.toContain('NaN');
  });

  it('o serviço monta .dae + cobertura, e o GED aceita o formato', () => {
    const { m } = casa();
    const artefatos = artefatosDoFormato('dae', m, { titulo: 'Casa', revisao: 1, hash: 'h', denominador: 50, papel: PAPEIS.find((p) => p.id === 'A3')!, data: new Date('2026-09-21T12:00:00Z') } as never);
    expect(artefatos[0].tipo).toBe('dae');
    expect(artefatos[0].nome.endsWith('.dae')).toBe(true);
    expect(artefatos[0].blob.size).toBeGreaterThan(0);
    expect(artefatos[1].tipo).toBe('cobertura');
  });
});
