/**
 * F9 do plano `2026-10-11-planta-recursos-video-synaps.md` — BIBLIOTECA DE COMPONENTES
 * ARRASTÁVEL: a busca, o ponto do soltar (tela → mm, Y espelhado), a miniatura, os
 * símbolos por tipo e o mobiliário na planta técnica do PDF.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { ITENS_DA_BIBLIOTECA, familiasDaBiblioteca, filtrarBiblioteca, miniaturaDoComponente, pontoDoSoltar, tipoDoArraste } from '../utils/blueprintBiblioteca';
import { tracosDoComponente } from '../utils/blueprintHumanizada';
import { DesenhistaDeProva, PAPEIS, desenharPlanta, enquadrar } from '../utils/blueprintExport';

describe('biblioteca — a busca e as famílias', () => {
  it('sem busca, o catálogo inteiro na ordem dele', () => {
    expect(filtrarBiblioteca('', null)).toHaveLength(ITENS_DA_BIBLIOTECA.length);
  });

  it('sem acento nem caixa, todas as palavras: "sofa" acha o Sofá; "cama casal" só a cama de casal', () => {
    expect(filtrarBiblioteca('sofa', null).map((i) => i.tipoId)).toEqual(['SOFA']);
    expect(filtrarBiblioteca('CAMA casal', null).map((i) => i.tipoId)).toEqual(['CAMA_CASAL']);
    expect(filtrarBiblioteca('xyz', null)).toEqual([]);
  });

  it('a família filtra; "Conjuntos" traz só os conjuntos; família vazia não vira filtro', () => {
    expect(filtrarBiblioteca('', 'LOUCA').every((i) => i.familia === 'LOUCA')).toBe(true);
    expect(filtrarBiblioteca('', 'CONJUNTOS').map((i) => i.tipoId)).toEqual(['CONJUNTO_BANHEIRO', 'CONJUNTO_JANTAR', 'CONJUNTO_DORMITORIO', 'CONJUNTO_COZINHA']);
    expect(familiasDaBiblioteca().every((f) => f.quantidade > 0)).toBe(true);
  });

  it('o arraste só aceita tipo do catálogo', () => {
    expect(tipoDoArraste('SOFA')).toBe('SOFA');
    expect(tipoDoArraste('rm -rf')).toBeNull();
    expect(tipoDoArraste(null)).toBeNull();
  });
});

describe('biblioteca — o ponto do soltar (tela → mm)', () => {
  const vista = { escala: 0.05, dx: 100, dy: 500 };
  const caixa = { left: 10, top: 20 };

  it('desfaz a vista: o pixel de (1000, 2000) mm volta a (1000, 2000)', () => {
    // paraTela: x·0,05 + 100 = 150; −y·0,05 + 500 = 400 → cliente (160, 420).
    expect(pontoDoSoltar({ clientX: 160, clientY: 420 }, caixa, vista)).toEqual({ x: 1000, y: 2000 });
  });

  it('Y ESPELHADO: soltar mais abaixo na tela dá y MENOR no modelo; arredonda a 10 mm', () => {
    const alto = pontoDoSoltar({ clientX: 160, clientY: 420 }, caixa, vista);
    const baixo = pontoDoSoltar({ clientX: 160, clientY: 470 }, caixa, vista);
    expect(baixo.y).toBe(alto.y - 1000);
    const p = pontoDoSoltar({ clientX: 160.3, clientY: 420.2 }, caixa, vista);
    expect(p.x % 10).toBe(0);
    expect(p.y % 10).toBe(0);
  });
});

describe('biblioteca — a miniatura e os símbolos por tipo', () => {
  it('a miniatura cabe no quadrado com margem e guarda a proporção (sofá mais largo que fundo)', () => {
    const m = miniaturaDoComponente('SOFA', 56, 4);
    const pts = [...m.contornos.flat(), ...m.tracos.flat()];
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(x).toBeLessThanOrEqual(52 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(y).toBeLessThanOrEqual(52 + 1e-6);
    }
    const xs = m.contornos[0].map((p) => p[0]);
    const ys = m.contornos[0].map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...ys) - Math.min(...ys));
  });

  it('o conjunto mostra um contorno por filho', () => {
    expect(miniaturaDoComponente('CONJUNTO_JANTAR').contornos).toHaveLength(5);
  });

  it('símbolos por tipo: o sofá ganha os assentos e difere da poltrona; o fogão segue com as 4 bocas; tudo dentro da peça', () => {
    expect(tracosDoComponente('SOFA').length).toBeGreaterThan(tracosDoComponente('POLTRONA').length);
    expect(tracosDoComponente('FOGAO').filter((t) => t.tipo === 'circulo')).toHaveLength(4);
    expect(tracosDoComponente('RACK')).not.toEqual(tracosDoComponente('CRIADO'));
    for (const it of ITENS_DA_BIBLIOTECA) {
      for (const t of tracosDoComponente(it.tipoId)) {
        const pts = t.tipo === 'linha' ? [t.a, t.b] : t.tipo === 'poli' ? t.pontos : [t.c];
        for (const [x, y] of pts) {
          expect(x, it.tipoId).toBeGreaterThanOrEqual(0);
          expect(x, it.tipoId).toBeLessThanOrEqual(1);
          expect(y, it.tipoId).toBeGreaterThanOrEqual(0);
          expect(y, it.tipoId).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('biblioteca — mobiliário na planta técnica do PDF', () => {
  function casa(): BlueprintModel {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyCommand(m, { type: 'AddWall', levelId: t, a: point(0, 0), b: point(5000, 0), thicknessMm: 150, heightMm: 2800 }).model;
    m = applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(2500, 1500), rotacaoGraus: 0 } as Command).model;
    return applyCommand(m, { type: 'AddConjunto', levelId: t, tipoId: 'CONJUNTO_JANTAR', at: point(2500, 4000) } as Command).model;
  }
  const linhas = (m: BlueprintModel, extra: Record<string, unknown>) => {
    const d = new DesenhistaDeProva();
    const op = { denominador: 50, papel: PAPEIS[0], titulo: 't', revisao: 1, hash: 'h', data: new Date('2026-10-11T12:00:00Z'), ...extra } as Parameters<typeof desenharPlanta>[2];
    desenharPlanta(d, m, op, enquadrar(m, 50, PAPEIS[0], true));
    return d.chamadas.filter((c) => c.tipo === 'linha' && (c.args[4] as { cor: string }).cor === '#555555').length;
  };

  it('desligado (o padrão): a técnica sai sem móveis, como sempre', () => {
    expect(linhas(casa(), {})).toBe(0);
  });

  it('ligado: contorno + símbolo de cada peça — o sofá e os 5 filhos do conjunto (o pai, agrupamento, não)', () => {
    const m = casa();
    const n = linhas(m, { mobiliario: true });
    const pecas = (m.componentes ?? []).filter((c) => !c.tipoId.startsWith('CONJUNTO_'));
    expect(pecas).toHaveLength(6);
    expect(n).toBeGreaterThanOrEqual(pecas.length * 4);
    expect(linhas(m, { mobiliario: true, humanizada: true })).toBe(0);
  });
});
