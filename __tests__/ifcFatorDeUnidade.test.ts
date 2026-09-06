/**
 * O fator de unidade do arquivo IFC — e o casamento de pavimentos que depende
 * dele.
 *
 * ─── O DEFEITO QUE ISTO FECHA ───────────────────────────────────────────────
 *
 * A tela deduzia o fator comparando a cota declarada do pavimento com o TOPO
 * das peças dele. Topo inclui a ALTURA da peça, então a razão nunca dá a
 * escala. Medido no modelo real (arquivo em CENTÍMETRO, fator 10), as razões
 * foram 15,00 · 15,90 · 13,17 · 11,87 — nenhuma dentro de 15% de 1, 10 ou 1000.
 * A conta caía no fallback `1`: um pavimento a 3,40 m virava 0,34 m, e todos os
 * pavimentos altos passavam a apontar para o térreo.
 *
 * Era exatamente o "393 peças entram um andar fora, em silêncio" que a tela de
 * importação existe para impedir — e ninguém teria visto, porque a cota
 * convertida não aparecia em lugar nenhum.
 *
 * Agora o fator sai da MATRIZ, que é a mesma fonte que a geometria usa.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { medirFatorParaMm, type PecaParametrica } from '../services/ifcParametricoService';

/** Uma peça com a matriz na escala pedida (arquivo → metro). */
const comEscala = (escala: number): PecaParametrica => ({
  expressID: 1,
  classe: 'IFCCOLUMN',
  nome: 'P1',
  globalId: 'g',
  perfil: { forma: 'RETANGULO', xDim: 20, yDim: 40 },
  profundidade: 340,
  // Coluna-maior, sem rotação: a norma da 1ª coluna é a escala.
  matriz: [escala, 0, 0, 0, 0, escala, 0, 0, 0, 0, escala, 0, 0, 0, 0, 1],
  pavimento: null,
});

describe('fator de unidade · medido na matriz', () => {
  it('centímetro → 10 mm por unidade', () => {
    expect(medirFatorParaMm([comEscala(0.01)])).toBe(10);
  });

  it('metro → 1000, milímetro → 1', () => {
    expect(medirFatorParaMm([comEscala(1)])).toBe(1000);
    expect(medirFatorParaMm([comEscala(0.001)])).toBe(1);
  });

  it('a matriz ROTACIONADA não muda a escala — é a norma, não o elemento [0]', () => {
    // 30° em torno de Z, escala 0,01: nenhum termo isolado vale 0,01.
    const c = Math.cos(Math.PI / 6) * 0.01;
    const s = Math.sin(Math.PI / 6) * 0.01;
    const p = comEscala(0.01);
    p.matriz = [c, s, 0, 0, -s, c, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 1];
    expect(medirFatorParaMm([p])).toBeCloseTo(10, 9);
  });

  it('uma peça torta NÃO arrasta o arquivo — é a mediana', () => {
    const pecas = [comEscala(0.01), comEscala(0.01), comEscala(0.01), comEscala(7)];
    expect(medirFatorParaMm(pecas)).toBe(10);
  });

  it('sem peça, ninguém adivinha', () => {
    expect(medirFatorParaMm([])).toBeNull();
  });

  it('escala zero ou inválida é descartada, não vira fator', () => {
    expect(medirFatorParaMm([comEscala(0)])).toBeNull();
    const nan = comEscala(0.01);
    nan.matriz = [NaN, 0, 0, 0, 0, NaN, 0, 0, 0, 0, NaN, 0, 0, 0, 0, 1];
    expect(medirFatorParaMm([nan])).toBeNull();
  });

  it('A HEURÍSTICA ANTIGA erraria: topo/elevação não é a escala', () => {
    // Pavimento a 340 (cm) com peças de 3,4 m de altura nascendo nele.
    // topo = 3400 + 3400 = 6800 mm; 6800/340 = 20, e não 10.
    const elevacao = 340;
    const topoMm = 3400 + 3400;
    expect(topoMm / elevacao).toBe(20);
    // Nenhum candidato de unidade passa perto de 20 — daí o fallback 1.
    for (const f of [1, 10, 1000]) expect(Math.abs(20 - f) / f).toBeGreaterThan(0.15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
const REAL = process.env.IFC_REAL ?? '';

describe.skipIf(!(REAL && existsSync(REAL)))('fator de unidade · o modelo real', () => {
  it('mede 10 mm por unidade e converte as cinco cotas', async () => {
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    const { lerPecasParametricas } = await import('../services/ifcParametricoService');
    usarCaminhoDoWasm('');
    const api = await obterApi();
    const id = api.OpenModel(new Uint8Array(readFileSync(REAL)));
    try {
      const leitura = await lerPecasParametricas(id);
      // O arquivo declara IfcSIUnit · Prefix=CENTI · Name=METRE, e as 393
      // matrizes trazem escala 0,010000 — as duas fontes concordam.
      expect(leitura.fatorParaMm).toBe(10);

      const cotas = Object.fromEntries(
        leitura.pavimentos.map((p) => [p.nome, p.elevacaoMm]),
      );
      expect(cotas).toEqual({
        'Fundação': 0,
        'Térreo': 3400,
        'Superior': 7800,
        'Caixa de Água': 9300,
        'Torre do Sino': 12450,
      });
      // Com o fallback antigo (fator 1) estas cotas seriam 0, 340, 780, 930 e
      // 1245 mm — quatro pavimentos dentro de 1,25 m do térreo.
    } finally {
      api.CloseModel(id);
    }
  }, 120000);
});
