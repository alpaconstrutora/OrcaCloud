/**
 * F16 do plano `2026-10-11-planta-recursos-video-synaps.md` — SÍMBOLOS 2D DO MOBILIÁRIO COM QUALIDADE DE PRANCHA:
 * em mm da peça (não deformam ao esticar), com penas, curvas e nível de detalhe; a mesa só com o tampo; as
 * cadeiras do Conjunto de jantar de frente para a mesa; o PDF técnico com as penas e o detalhe por escala.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, CATALOGO_DE_COMPONENTES, CONJUNTOS_DE_COMPONENTES, emptyModel, point, TIPOS_DE_COMPONENTE, type Command } from '../utils/blueprintKernel';
import { linhasDoMobiliario, PENA_MM, recortarFora, tesselar, tracosDoMobiliario } from '../utils/blueprintSimbolosMobiliario';
import { simboloNoMundo } from '../utils/blueprintHumanizada';
import { DesenhistaDeProva, PAPEIS, desenharPlanta, enquadrar } from '../utils/blueprintExport';

const ficha = (t: (typeof TIPOS_DE_COMPONENTE)[number]) => CATALOGO_DE_COMPONENTES[t];

describe('símbolos do mobiliário — todos os tipos', () => {
  it('todo tipo (fora o conjunto) desenha DENTRO da caixa, sem NaN, com ao menos uma linha de contorno; o conjunto não desenha nada', () => {
    for (const tipo of TIPOS_DE_COMPONENTE) {
      const f = ficha(tipo);
      for (const detalhe of [true, false]) {
        const ls = linhasDoMobiliario(tipo, f.larguraMm, f.profundidadeMm, { detalhe });
        if (f.simbolo === 'CONJUNTO') {
          expect(ls, tipo).toEqual([]);
          continue;
        }
        expect(ls.some((l) => l.pena === 'contorno'), tipo).toBe(true);
        for (const l of ls) {
          expect(l.pts.length, tipo).toBeGreaterThanOrEqual(2);
          for (const [x, y] of l.pts) {
            expect(Number.isFinite(x) && Number.isFinite(y), tipo).toBe(true);
            expect(x, tipo).toBeGreaterThanOrEqual(0);
            expect(x, tipo).toBeLessThanOrEqual(f.larguraMm);
            expect(y, tipo).toBeGreaterThanOrEqual(0);
            expect(y, tipo).toBeLessThanOrEqual(f.profundidadeMm);
          }
        }
      }
    }
  });

  it('o detalhe fino é opcional: sem ele há MENOS linhas (e nenhuma de textura que seja só detalhe)', () => {
    for (const tipo of ['CAMA_CASAL', 'SOFA', 'FOGAO', 'VASO', 'BANCADA', 'ARMARIO'] as const) {
      const f = ficha(tipo);
      const com = linhasDoMobiliario(tipo, f.larguraMm, f.profundidadeMm, { detalhe: true }).length;
      const sem = linhasDoMobiliario(tipo, f.larguraMm, f.profundidadeMm, { detalhe: false }).length;
      expect(sem, tipo).toBeLessThan(com);
    }
  });

  it('as três penas existem e seguem a hierarquia do desenho técnico', () => {
    expect(PENA_MM.contorno).toBeGreaterThan(PENA_MM.detalhe);
    expect(PENA_MM.detalhe).toBeGreaterThan(PENA_MM.textura);
    const penas = new Set(linhasDoMobiliario('CAMA_CASAL', 1400, 1900, { detalhe: true }).map((l) => l.pena));
    expect([...penas].sort()).toEqual(['contorno', 'detalhe', 'textura']);
  });

  it('em mm, não em fração: esticar o sofá NÃO deforma o canto (raio igual) e acrescenta almofada', () => {
    const raio = (L: number) => {
      const t = tracosDoMobiliario('SOFA', L, 900).tracos[0];
      return t.tipo === 'ret' ? t.r : NaN;
    };
    expect(raio(2000)).toBe(raio(3000));
    const almofadas = (L: number) => tracosDoMobiliario('SOFA', L, 900).tracos.filter((t) => t.tipo === 'ret' && t.pena === 'detalhe').length;
    expect(almofadas(800)).toBe(1);
    expect(almofadas(1300)).toBe(2);
    expect(almofadas(2000)).toBe(3);
    // A cama de solteiro tem um travesseiro; a de casal, dois.
    const travesseiros = (L: number) => tracosDoMobiliario('CAMA_CASAL', L, 1900).tracos.filter((t) => t.tipo === 'ret' && t.pena === 'detalhe').length;
    expect(travesseiros(900)).toBe(1);
    expect(travesseiros(1400)).toBe(2);
  });

  it('a mesa de jantar é só o TAMPO na medida real — as cadeiras são peças (o Conjunto de jantar as traz)', () => {
    const ls = linhasDoMobiliario('MESA_JANTAR', 1400, 900, { detalhe: false });
    expect(ls).toHaveLength(1);
    const xs = ls[0].pts.map((p) => p[0]);
    const ys = ls[0].pts.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1400, 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(900, 0);
  });

  it('vaso: a bacia some sob a caixa acoplada (recorte), e a caixa continua inteira', () => {
    const ls = linhasDoMobiliario('VASO', 400, 650, { detalhe: false });
    const caixaY0 = 650 - Math.min(180, 650 * 0.28);
    const bacia = ls.filter((l) => l.pena === 'contorno' && l.pts.some((p) => p[1] < caixaY0 - 50));
    for (const l of bacia) for (const [, y] of l.pts) expect(y).toBeLessThanOrEqual(caixaY0 + 1);
    expect(ls.some((l) => l.pena === 'contorno' && l.pts.every((p) => p[1] >= caixaY0 - 1))).toBe(true);
  });

  it('geometria: canto arredondado fecha; recortar tira o trecho de dentro', () => {
    const anel = tesselar({ tipo: 'ret', x0: 0, y0: 0, x1: 100, y1: 50, r: 10, pena: 'contorno' });
    expect(anel[0][0]).toBeCloseTo(anel[anel.length - 1][0], 6);
    expect(anel[0][1]).toBeCloseTo(anel[anel.length - 1][1], 6);
    const partes = recortarFora([[0, 5], [100, 5]], { x0: 40, y0: 0, x1: 60, y1: 10 });
    expect(partes).toHaveLength(2);
    // precisão de 1/24 do segmento (≈ 4 mm em 100 mm) — basta para desenho
    expect(Math.abs(partes[0][partes[0].length - 1][0] - 40)).toBeLessThanOrEqual(100 / 24);
    expect(Math.abs(partes[1][0][0] - 60)).toBeLessThanOrEqual(100 / 24);
  });
});

describe('conjunto de jantar — as cadeiras de frente para a mesa', () => {
  it('a cadeira ao norte gira 0 e a ao sul gira 180: o ENCOSTO (fundo local) fica do lado de fora', () => {
    const filhos = CONJUNTOS_DE_COMPONENTES.CONJUNTO_JANTAR!.filter((f) => f.tipoId === 'CADEIRA');
    expect(filhos).toHaveLength(4);
    for (const f of filhos) {
      // O fundo local (+y) da cadeira, no mundo: (0, +1) girado.
      const g = (f.rotacaoGraus * Math.PI) / 180;
      const fundoY = Math.cos(g);
      // O encosto aponta para LONGE da mesa (mesmo sinal da posição).
      expect(Math.sign(Math.round(fundoY)), `${f.dxMm},${f.dyMm}`).toBe(Math.sign(f.dyMm));
    }
  });

  it('no mundo: o encosto da cadeira colocada ao norte da mesa fica mais ao norte que o assento', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'CADEIRA', at: point(0, 700), rotacaoGraus: 0 } as Command).model;
    const s = simboloNoMundo(m.componentes![0], { detalhe: false });
    const encosto = s.linhas.filter((l) => l.pena === 'contorno').flatMap((l) => l.pts);
    const assento = s.linhas.filter((l) => l.pena === 'detalhe').flatMap((l) => l.pts);
    const media = (ps: { y: number }[]) => ps.reduce((a, p) => a + p.y, 0) / ps.length;
    expect(media(encosto)).toBeGreaterThan(media(assento));
  });
});

describe('PDF técnico com Mobiliário — penas e detalhe pela escala', () => {
  function comCama() {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    for (const [a, b] of [[point(0, 0), point(4000, 0)], [point(4000, 0), point(4000, 3000)], [point(4000, 3000), point(0, 3000)], [point(0, 3000), point(0, 0)]] as const) {
      m = applyCommand(m, { type: 'AddWall', levelId: t, a, b, thicknessMm: 150, heightMm: 2800 }).model;
    }
    return applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'CAMA_CASAL', at: point(2000, 1500), rotacaoGraus: 0 } as Command).model;
  }
  const traçosDaPena = (d: DesenhistaDeProva, mm: number) =>
    d.chamadas.filter((c) => c.tipo === 'linha' && (c.args[4] as { cor: string; espessuraMm: number }).cor === '#1f2937' && Math.abs((c.args[4] as { espessuraMm: number }).espessuraMm - mm) < 1e-9).length;

  it('1:50 leva as três penas; 1:100 perde a textura (o detalhe fino) e mantém contorno e detalhe', () => {
    const m = comCama();
    const desenhar = (denominador: number) => {
      const d = new DesenhistaDeProva();
      const op = { denominador, papel: PAPEIS[0], titulo: 't', revisao: 1, hash: 'h', data: new Date('2026-10-12T12:00:00Z'), mobiliario: true } as Parameters<typeof desenharPlanta>[2];
      desenharPlanta(d, m, op, enquadrar(m, denominador, PAPEIS[0], true));
      return d;
    };
    const d50 = desenhar(50);
    const d100 = desenhar(100);
    expect(traçosDaPena(d50, PENA_MM.contorno)).toBeGreaterThan(0);
    expect(traçosDaPena(d50, PENA_MM.textura)).toBeGreaterThan(0);
    expect(traçosDaPena(d100, PENA_MM.contorno)).toBeGreaterThan(0);
    expect(traçosDaPena(d100, PENA_MM.detalhe)).toBeGreaterThan(0);
    expect(traçosDaPena(d100, PENA_MM.textura)).toBe(0);
  });
});
