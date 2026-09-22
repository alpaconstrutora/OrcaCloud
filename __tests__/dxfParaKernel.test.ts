/**
 * DXF → paredes do kernel, contra arquivos REAIS.
 *
 * ─── O QUE SÓ ARQUIVO DE VERDADE PROVA ──────────────────────────────────────
 *
 * A geometria do pareamento já é testada em `blueprintVetor`. O que só um
 * arquivo real responde é se o desenho que a empresa de fato usa cabe no
 * caminho — e a resposta desmentiu o cabeçalho do próprio arquivo.
 *
 * Roda contra o projeto arquitetônico aprovado na prefeitura (8,3 MB) e contra
 * o nosso próprio export. Sem eles, PULA declarando o motivo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, novoUid, pontasSoltasDoNivel, type Command } from '../utils/blueprintKernel';
import {
  aberturasDoDxf,
  paredesDeEixos,
  paredesDoDxf,
  prepararDxf,
  tirarDuplicadas,
  type ParedeDoDxf,
} from '../utils/dxfParaKernel';

const REAL =
  process.env.DXF_REAL ??
  'C:/D/ALPA/0 - PROJETOS/1 - PROJETOS/1 - PROJETO ARQUITETÔNICO/APROVADO/EMITIDO/projeto_de_Altair_Prefeitura_e_retificado_para_plotar - 20-02-17 - Cópia.dxf';
const NOSSO = process.env.DXF_NOSSO ?? 'C:/Users/altai/Downloads/planta-08082026-v4.dxf';
const TEM = existsSync(REAL) && existsSync(NOSSO);

let real: ReturnType<typeof prepararDxf>;
let nosso: ReturnType<typeof prepararDxf>;

describe.skipIf(!TEM)('DXF real · a escala', () => {
  beforeAll(() => {
    real = prepararDxf(readFileSync(REAL, 'utf8'));
    nosso = prepararDxf(readFileSync(NOSSO, 'utf8'));
  }, 120_000);

  it('⚠️ O ARQUIVO REAL MENTE NO $INSUNITS, e a medição o desmente', () => {
    // Ele declara 4 (milímetro) e está em METRO. Acreditar no campo daria uma
    // casa de 13 centímetros, com a forma perfeita — o defeito preferido deste
    // módulo. É o caso mais importante deste arquivo.
    expect(real.mmPorUnidadeDeclarado).toBe(1);
    expect(real.escalas[0].rotulo).toBe('metro');
    expect(real.escalas[0].mmPorUnidade).toBe(1000);
  });

  it('e a medição não é por pouco: metro ganha por duas ordens de grandeza', () => {
    // Empate apertado significaria heurística frágil. 1484 contra 3 é um
    // resultado que não vira pelo ruído de outro arquivo.
    const [melhor, segunda] = real.escalas;
    expect(melhor.paredesPlausiveis).toBeGreaterThan(1000);
    expect(melhor.paredesPlausiveis).toBeGreaterThan(segunda.paredesPlausiveis * 3);
    const milimetro = real.escalas.find((e) => e.rotulo === 'milímetro')!;
    expect(milimetro.paredesPlausiveis).toBeLessThan(10);
  });

  it('no NOSSO export a medição dá milímetro — que é o que ele escreve', () => {
    expect(nosso.escalas[0].rotulo).toBe('milímetro');
  });
});

describe.skipIf(!TEM)('DXF real · as paredes', () => {
  let paredes: ParedeDoDxf[];

  beforeAll(() => {
    real = real ?? prepararDxf(readFileSync(REAL, 'utf8'));
    paredes = paredesDoDxf(
      real.segmentos.filter((s) => s.camada === 'PAREDE'),
      1000,
    );
  }, 120_000);

  it('a camada PAREDE existe e é grande — o desenhista separa parede', () => {
    const camada = real.porCamada.find((c) => c.camada === 'PAREDE')!;
    expect(camada.segmentos).toBeGreaterThan(2000);
  });

  it('AS ESPESSURAS SÃO DE PAREDE DE VERDADE', () => {
    // ⚠️ É a prova de que o pareamento e a escala estão certos ao mesmo tempo,
    // e ela não é um cálculo meu: 10, 15, 20, 30 e 40 cm são as espessuras que
    // se constrói no Brasil. Escala errada ou pareamento errado não produzem
    // essa distribuição por acaso.
    const conta = new Map<number, number>();
    for (const p of paredes) conta.set(p.espessuraMm, (conta.get(p.espessuraMm) ?? 0) + 1);
    const mais = [...conta.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(mais[0]).toBe(150);
    expect(mais[1]).toBeGreaterThan(200);
    // E nenhuma fora da faixa plausível — o filtro é o que impede cota e
    // hachura de virarem parede.
    for (const p of paredes) {
      expect(p.espessuraMm).toBeGreaterThanOrEqual(50);
      expect(p.espessuraMm).toBeLessThanOrEqual(500);
    }
  });

  it('quantidade e comprimento têm ordem de grandeza de planta', () => {
    expect(paredes.length).toBeGreaterThan(400);
    const comp = paredes.map((p) => p.comprimentoMm).sort((a, b) => a - b);
    expect(comp[comp.length - 1]).toBeGreaterThan(10_000);
    expect(comp[comp.length - 1]).toBeLessThan(100_000);
  });

  it('nenhuma parede sai degenerada depois da mitragem', () => {
    // Uma só derrubaria a importação inteira com `DEGENERATE_WALL` — "ou tudo,
    // ou nada" viraria "nada" por causa de um traço.
    for (const p of paredes) expect(p.a.x !== p.b.x || p.a.y !== p.b.y).toBe(true);
  });
});

describe.skipIf(!TEM)('DXF real · esquadrias (P2.33)', () => {
  it('os arcos da camada PORTAS viram portas e os traços de JANELAS viram janelas — nas paredes da camada PAREDE, em metro', () => {
    real = real ?? prepararDxf(readFileSync(REAL, 'utf8'));
    // O leitor agora LÊ os arcos: 38 na camada PORTAS, um por folha de porta.
    const portasNaCamada = real.porCamada.find((c) => c.camada === 'PORTAS')!;
    expect(portasNaCamada.arcos).toBeGreaterThanOrEqual(30);
    expect(real.recusas.some((r) => r.tipo === 'ARC' || r.tipo === 'CIRCLE')).toBe(false);

    const paredes = tirarDuplicadas(paredesDoDxf(real.segmentos.filter((s) => s.camada === 'PAREDE'), 1000)).paredes;
    const { paredes: comAberturas, resumo } = aberturasDoDxf(paredes, real, 1000, 'PAREDE', 2800);
    // Medido em 21/09/2026: 34 portas (dos 35 arcos de folha em PORTAS — os outros 3 têm 39°, 0° e raio 243 mm),
    // 38 janelas, 89 vãos livres; 558 trechos viram 386 paredes. Os arcos "sem parede" são os 32 do SELO
    // (carimbo da prancha) e uns poucos do layout. Pisos, não igualdades: o arquivo é o mesmo, o algoritmo pode melhorar.
    expect(resumo.portas).toBeGreaterThanOrEqual(30);
    expect(resumo.janelas).toBeGreaterThanOrEqual(30);
    expect(resumo.arcosSemParede).toBeLessThanOrEqual(45);
    expect(comAberturas.length).toBeLessThan(paredes.length);
    // Toda porta do arquivo tem 0,80 m (menos uma de 0,757): é a folha padrão do projeto, e é o que sai.
    const larguras = comAberturas.flatMap((p) => p.aberturas.filter((ab) => ab.kind === 'door').map((ab) => ab.widthMm));
    expect(larguras.filter((w) => w >= 750 && w <= 850).length).toBeGreaterThanOrEqual(larguras.length - 3);
    // A parede do corredor: portas de 0,80 em sequência — a cara do print que motivou a fase.
    const corredor = comAberturas.filter((p) => p.aberturas.filter((ab) => ab.kind === 'door').length >= 5);
    expect(corredor.length).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it('P2.34 — fresta, sobreposição, encosto e canto: as pontas soltas caem de 328 para menos de 250 e os ambientes sobem (medido pelo kernel)', () => {
    // Régua medida em 22/09/2026 no arquivo real: P2.33 deixava 328 pontas soltas (metade das pontas!) e 106
    // ambientes; com a P2.34, 239 pontas soltas e 123 ambientes — e os que fecham têm área de cômodo (57, 52, 45 m²).
    // Pisos, não igualdades.
    real = real ?? prepararDxf(readFileSync(REAL, 'utf8'));
    const paredes = tirarDuplicadas(paredesDoDxf(real.segmentos.filter((s) => s.camada === 'PAREDE'), 1000)).paredes;
    const { paredes: com, resumo } = aberturasDoDxf(paredes, real, 1000, 'PAREDE', 2800);
    expect(resumo.encostadas).toBeGreaterThanOrEqual(30);
    expect(resumo.cantosFechados).toBeGreaterThanOrEqual(5);
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = m.levels[0].id;
    const minX = Math.min(...com.flatMap((p) => [p.a.x, p.b.x]));
    const minY = Math.min(...com.flatMap((p) => [p.a.y, p.b.y]));
    const lote: Command[] = [];
    for (const p of com) {
      const uid = novoUid();
      const L = Math.round(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y));
      lote.push({ type: 'AddWall', levelId, a: { x: p.a.x - minX, y: p.a.y - minY }, b: { x: p.b.x - minX, y: p.b.y - minY }, thicknessMm: p.espessuraMm, heightMm: 2800, uid });
      for (const ab of p.aberturas) if (ab.offsetMm >= 0 && ab.offsetMm + ab.widthMm <= L) lote.push({ type: 'AddOpening', wallId: '', wallUid: uid, kind: ab.kind, offsetMm: ab.offsetMm, widthMm: ab.widthMm, heightMm: ab.heightMm, sillMm: ab.sillMm, hingeAtStart: ab.hingeAtStart, swingReversed: ab.swingReversed });
    }
    m = applyBatch(m, lote).model;
    const soltas = pontasSoltasDoNivel(m, m.levels[0]);
    expect(soltas.length).toBeLessThan(250);
    expect(m.spaces.length).toBeGreaterThan(110);
    const areas = m.spaces.map((s) => s.areaMm2 / 1e6).sort((a, b) => b - a);
    expect(areas[0]).toBeGreaterThan(40);
    expect(areas[0]).toBeLessThan(80);
  }, 180_000);
});

describe.skipIf(!TEM)('DXF · a camada de EIXO é o caminho exato', () => {
  it('o nosso export tem PLANTA-EIXOS, e cada traço é uma parede', () => {
    // Onde existe camada de eixo não há o que derivar: o traço JÁ é o eixo.
    // Pareá-lo seria trocar dado exato por estimativa.
    nosso = nosso ?? prepararDxf(readFileSync(NOSSO, 'utf8'));
    const eixos = nosso.segmentos.filter((s) => s.camada === 'PLANTA-EIXOS');
    expect(eixos.length).toBeGreaterThan(0);

    const paredes = paredesDeEixos(eixos, 1, 150);
    expect(paredes).toHaveLength(eixos.length);
    expect(paredes.every((p) => p.espessuraMm === 150)).toBe(true);
    // E o comprimento é o do traço, sem derivação nenhuma.
    const e = eixos[0];
    expect(paredes[0].comprimentoMm).toBe(
      Math.round(Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y)),
    );
  });

  it('o pareamento acha MENOS paredes que a camada de eixo — e é esperado', () => {
    // O par de faces só existe onde as duas foram desenhadas e se acompanham;
    // num desenho pequeno, trechos ficam sem contraparte. Onde há eixo, usa-se
    // o eixo — é para isso que a tela oferece os dois caminhos.
    nosso = nosso ?? prepararDxf(readFileSync(NOSSO, 'utf8'));
    const porFace = paredesDoDxf(
      nosso.segmentos.filter((s) => s.camada === 'PLANTA-PAREDES'),
      1,
    );
    const porEixo = paredesDeEixos(
      nosso.segmentos.filter((s) => s.camada === 'PLANTA-EIXOS'),
      1,
      150,
    );
    expect(porFace.length).toBeLessThanOrEqual(porEixo.length);
    expect(porFace.every((p) => p.espessuraMm === 150)).toBe(true);
  });
});
