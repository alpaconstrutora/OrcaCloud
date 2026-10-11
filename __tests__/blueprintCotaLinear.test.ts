/**
 * F5 do plano `2026-10-11-planta-recursos-video-synaps.md` — COTA LINEAR (simples e contínua), kernel 0.95.0.
 *
 * Os números são DERIVADOS dos pontos (como o ângulo da cota angular): estes testes
 * afirmam a regra (`trechosDaCotaLinear`), o desenho que tela/PDF/DXF compartilham
 * (`cotaLinearDesenhada`) e a invariante do kernel.
 */
import { describe, expect, it } from 'vitest';
import { KernelError, applyCommand, emptyModel, point, trechosDaCotaLinear, type Anotacao, type Point } from '../utils/blueprintKernel';
import { cotaLinearDesenhada, distanciaAAnotacao } from '../utils/blueprintAnotacoes';
import { DesenhistaDeProva, PAPEIS, desenharPlanta, enquadrar } from '../utils/blueprintExport';
import { gerarDxf } from '../utils/blueprintDxf';

const cota = (...pts: [number, number][]): Pick<Anotacao, 'tipo' | 'pontos' | 'alturaMm'> => ({
  tipo: 'COTA_LINEAR',
  pontos: pts.map(([x, y]) => ({ x, y }) as Point),
  alturaMm: 250,
});

describe('cota linear — os números (F5)', () => {
  it('simples: dois pontos medidos + a colocação → um trecho com a distância entre eles', () => {
    const t = trechosDaCotaLinear(cota([0, 0], [3500, 0], [1000, 800]))!;
    expect(t.trechosMm).toEqual([3500]);
    expect(t.totalMm).toBe(3500);
    expect(t.afastamentoMm).toBe(800); // a linha passa 0,80 m acima
  });

  it('contínua: os trechos somam o total, e a direção é do 1º ao último medido', () => {
    const t = trechosDaCotaLinear(cota([0, 0], [1200, 0], [2100, 0], [5000, 0], [0, -600]))!;
    expect(t.trechosMm).toEqual([1200, 900, 2900]);
    expect(t.trechosMm.reduce((s, x) => s + x, 0)).toBe(t.totalMm);
    expect(t.totalMm).toBe(5000);
    expect(t.afastamentoMm).toBe(-600); // abaixo
  });

  it('pontos clicados fora de ordem não viram trecho negativo nem sobreposto', () => {
    const t = trechosDaCotaLinear(cota([0, 0], [3000, 0], [1000, 0], [5000, 0], [0, 500]))!;
    expect(t.trechosMm).toEqual([1000, 2000, 2000]);
    expect(t.trechosMm.every((x) => x > 0)).toBe(true);
  });

  it('alinhada: numa parede inclinada mede o comprimento DELA, não o dx', () => {
    const t = trechosDaCotaLinear(cota([0, 0], [3000, 4000], [-1000, 1000]))!;
    expect(t.totalMm).toBe(5000);
  });

  it('ponto medido fora da reta conta pela PROJEÇÃO na direção da cota', () => {
    // O do meio está 300 mm acima da reta: mede-se a posição ao longo dela.
    const t = trechosDaCotaLinear(cota([0, 0], [2000, 300], [4000, 0], [0, 900]))!;
    expect(t.trechosMm).toEqual([2000, 2000]);
  });

  it('fora da cota linear ou degenerada → null', () => {
    expect(trechosDaCotaLinear({ tipo: 'LINHA', pontos: [point(0, 0), point(1, 1), point(2, 2)] })).toBeNull();
    expect(trechosDaCotaLinear(cota([5, 5], [5, 5], [0, 100]))).toBeNull();
  });
});

describe('cota linear — o desenho compartilhado (F5)', () => {
  it('simples: rótulo no formato das cotas automáticas, sobre o trecho, do lado da colocação', () => {
    const c = cotaLinearDesenhada(cota([0, 0], [3500, 0], [0, 800]))!;
    expect(c.textos).toHaveLength(1);
    expect(c.textos[0].texto).toBe('3,50');
    expect(c.textos[0].p.x).toBe(1750);
    expect(c.textos[0].p.y).toBeGreaterThan(800); // acima da linha, que está a 800
    // 1 linha de cota + 2 chamadas + 2 traços oblíquos.
    expect(c.segmentos).toHaveLength(5);
  });

  it('contínua: um rótulo por trecho e mais o TOTAL, numa segunda linha mais afastada', () => {
    const c = cotaLinearDesenhada(cota([0, 0], [1200, 0], [2100, 0], [5000, 0], [0, -600]))!;
    expect(c.textos.map((t) => t.texto)).toEqual(['1,20', '0,90', '2,90', '5,00']);
    const yTrechos = c.textos[0].p.y;
    const yTotal = c.textos[3].p.y;
    expect(yTotal).toBeLessThan(yTrechos); // abaixo, porque a cota está abaixo
  });

  it('o texto nunca sai de cabeça para baixo, para qualquer sentido do clique', () => {
    for (const [a, b] of [[[0, 0], [3000, 0]], [[3000, 0], [0, 0]], [[0, 0], [0, 3000]], [[0, 3000], [0, 0]]] as [number, number][][]) {
      const c = cotaLinearDesenhada(cota(a as [number, number], b as [number, number], [700, 700]))!;
      for (const t of c.textos) expect(Math.abs(t.anguloRad)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
  });

  it('seleciona-se pelo desenho: um clique sobre a linha de cota acha a anotação', () => {
    const a = { ...cota([0, 0], [3500, 0], [0, 800]), id: 'a', uid: 'u', vista: { tipo: 'PLANTA', levelId: 'l' }, texto: null, traco: 'CONTINUO', hachura: null, rotacaoGraus: 0, cor: null } as Anotacao;
    expect(distanciaAAnotacao(a, point(1700, 800))).toBe(0);
    expect(distanciaAAnotacao(a, point(1700, 3000))).toBeGreaterThan(1000);
  });
});

describe('cota linear — o kernel (F5)', () => {
  const base = () => applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;

  it('grava com 2 medidos + colocação; recusa menos pontos', () => {
    const m = base();
    const vista = { tipo: 'PLANTA' as const, levelId: m.levels[0].id };
    const r = applyCommand(m, { type: 'AddAnotacao', vista, tipo: 'COTA_LINEAR', pontos: [point(0, 0), point(3500, 0), point(0, 800)] }).model;
    expect(r.anotacoes?.[0].tipo).toBe('COTA_LINEAR');
    expect(() => applyCommand(m, { type: 'AddAnotacao', vista, tipo: 'COTA_LINEAR', pontos: [point(0, 0), point(3500, 0)] })).toThrow(KernelError);
  });

  it('recusa o primeiro e o último ponto medidos no mesmo lugar (sem direção)', () => {
    const m = base();
    const vista = { tipo: 'PLANTA' as const, levelId: m.levels[0].id };
    expect(() =>
      applyCommand(m, { type: 'AddAnotacao', vista, tipo: 'COTA_LINEAR', pontos: [point(0, 0), point(1000, 0), point(0, 0), point(0, 800)] }),
    ).toThrow(/mesmo lugar/);
  });
});

describe('cota linear — as saídas (F5)', () => {
  // Uma parede só (o desenho precisa de algo para enquadrar) e a cota VERTICAL ao lado dela.
  function comCota() {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = m.levels[0].id;
    m = applyCommand(m, { type: 'AddWall', levelId, a: point(0, 0), b: point(0, 4000), thicknessMm: 150, heightMm: 2800 }).model;
    m = applyCommand(m, { type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId }, tipo: 'COTA_LINEAR', pontos: [point(0, 0), point(0, 1500), point(0, 4000), point(-800, 0)] }).model;
    return m;
  }

  it('PDF: os números centrados e GIRADOS com a linha (cota vertical → 90°)', () => {
    const m = comCota();
    const d = new DesenhistaDeProva();
    const op = { denominador: 100, papel: PAPEIS[0], titulo: 't', revisao: 1, hash: 'h', data: new Date('2026-10-11T12:00:00Z') } as Parameters<typeof desenharPlanta>[2];
    desenharPlanta(d, m, op, enquadrar(m, 100, PAPEIS[0], true));
    const textos = d.chamadas.filter((c) => c.tipo === 'texto' && ['1,50', '2,50', '4,00'].includes(c.args[2] as string));
    expect(textos.map((c) => c.args[2]).sort()).toEqual(['1,50', '2,50', '4,00']);
    for (const c of textos) expect(c.args[5]).toEqual({ anguloGraus: 90, centralizar: true });
  });

  it('DXF: linhas e textos em PLANTA-COTAS; o texto da cota vertical leva rotação 90; o texto comum continua sem rotação', () => {
    const dxf = gerarDxf(comCota(), { titulo: 't', revisao: 1, hash: 'h' });
    const blocos = dxf.split('\n0\n');
    const textosDaCota = blocos.filter((b) => b.startsWith('TEXT') && /\n8\nPLANTA-COTAS\n/.test(b) && /\n1\n(1,50|2,50|4,00)\n/.test(b));
    expect(textosDaCota).toHaveLength(3);
    for (const b of textosDaCota) {
      expect(b).toMatch(/\n50\n90(\.0+)?\n/);
      expect(b).toMatch(/\n72\n1\n/);
    }
    // Entidade TEXT de outra origem não ganhou rotação nem alinhamento (saída antiga intacta).
    const outros = blocos.filter((b) => b.startsWith('TEXT') && !/\n8\nPLANTA-COTAS\n/.test(b));
    for (const b of outros) {
      expect(b).not.toMatch(/\n50\n/);
      expect(b).not.toMatch(/\n72\n/);
    }
    expect(blocos.filter((b) => b.startsWith('LINE') && /\n8\nPLANTA-COTAS\n/.test(b)).length).toBeGreaterThanOrEqual(5);
  });
});
