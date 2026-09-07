/**
 * As paredes do IFC viradas comandos do kernel.
 *
 * ─── O QUE ESTES CASOS PROTEGEM ─────────────────────────────────────────────
 *
 * Três contas, todas capazes de errar em silêncio: a unidade (prédio 100×
 * menor no lugar certo), o eixo verdadeiro (meia espessura fora, todas para o
 * mesmo lado — o desenho fecha com os ambientes errados) e a orientação do
 * plano (planta espelhada, que só aparece quando a porta está do lado errado).
 *
 * O caso da orientação é o mais difícil de ver e o mais fácil de provar: as
 * paredes e os pilares do MESMO arquivo têm de cair um sobre o outro.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  caixaDasParedes,
  caixaDasPecas,
  traduzirParedes,
  traduzirPecas,
  type ParedeTraduzida,
  type PecaTraduzida,
} from '../utils/ifcParaKernel';

const PASTA = process.env.IFC_AMOSTRAS ?? 'C:/D/ORÇACLOUD/bim-spike/samples';
const CASA = join(PASTA, 'AC20-FZK-Haus.ifc');
const PREDIO = join(PASTA, 'DigitalHub.ifc');
const TEM = existsSync(CASA) && existsSync(PREDIO);

const paredes: Record<string, ParedeTraduzida[]> = {};
const recusadas: Record<string, number> = {};
const pecas: Record<string, PecaTraduzida[]> = {};

describe.skipIf(!TEM)('ifc → kernel · paredes', () => {
  beforeAll(async () => {
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    const { lerPecasParametricas } = await import('../services/ifcParametricoService');
    usarCaminhoDoWasm('');
    const api = await obterApi();
    for (const [chave, caminho] of [
      ['casa', CASA],
      ['predio', PREDIO],
    ] as const) {
      const id = api.OpenModel(new Uint8Array(readFileSync(caminho)));
      const leitura = await lerPecasParametricas(id);
      const t = traduzirParedes(leitura.paredes, leitura.fatorParaMm);
      paredes[chave] = t.paredes;
      recusadas[chave] = t.recusas.length;
      pecas[chave] = traduzirPecas(leitura.pecas).pecas;
      api.CloseModel(id);
    }
  }, 180_000);

  it('traduz todas, sem recusar nenhuma', () => {
    expect(paredes.casa).toHaveLength(13);
    expect(paredes.predio).toHaveLength(178);
    expect(recusadas.casa).toBe(0);
    expect(recusadas.predio).toBe(0);
  });

  it('a unidade sai certa: parede de casa tem metros, não centenas de metros', () => {
    // Os dois arquivos estão em metro. Errar o fator daria 12 mm ou 12 km, e o
    // desenho pareceria certo enquanto ninguém cotasse nada.
    const comp = paredes.casa
      .map((p) => Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y))
      .sort((a, b) => a - b);
    expect(comp[0]).toBeCloseTo(3800, 0);
    expect(comp[comp.length - 1]).toBeCloseTo(12000, 0);
    expect(paredes.casa.every((p) => p.espessuraMm === 240 || p.espessuraMm === 300)).toBe(true);
  });

  it('A PLANTA NÃO SAI ESPELHADA — paredes e estrutura do mesmo arquivo se sobrepõem', () => {
    // ⚠️ O caso que nenhum outro alcança. A estrutura passa por uma conversão
    // (mundo do web-ifc, Y para cima) e a parede por outra (coordenadas do
    // próprio arquivo). Se as duas discordassem no sinal de y, os pilares
    // cairiam espelhados em relação às paredes — e cada peça, isolada, estaria
    // com a medida certa.
    const p = caixaDasParedes(paredes.predio)!;
    const e = caixaDasPecas(pecas.predio)!;
    const sobrepoe = (a: number, b: number, c: number, d: number) =>
      Math.min(b, d) - Math.max(a, c);
    expect(sobrepoe(p.minX, p.maxX, e.minX, e.maxX)).toBeGreaterThan(0);
    expect(sobrepoe(p.minY, p.maxY, e.minY, e.maxY)).toBeGreaterThan(0);
    // E não é sobreposição de raspão: os centros ficam perto, na escala do
    // prédio. Espelhado, o centro em y saltaria para o simétrico.
    const largura = Math.max(p.maxX - p.minX, p.maxY - p.minY);
    expect(Math.abs((p.minY + p.maxY) / 2 - (e.minY + e.maxY) / 2)).toBeLessThan(largura / 2);
  });

  it('o traçado pela FACE é corrigido, e vira memória em `alinhamento`', () => {
    // Na casa o arquivo desenha pela face: o eixo do kernel tem de sair meia
    // espessura fora da linha do arquivo, e `alinhamento` guarda de que lado.
    expect(paredes.casa.every((p) => p.alinhamento !== 'EIXO')).toBe(true);
    expect(paredes.casa.some((p) => p.alinhamento === 'DIREITA')).toBe(true);
    expect(paredes.casa.some((p) => p.alinhamento === 'ESQUERDA')).toBe(true);
    // No prédio o arquivo desenha pelo eixo, e nada é deslocado.
    expect(paredes.predio.every((p) => p.alinhamento === 'EIXO')).toBe(true);
  });

  it('as camadas somam EXATAMENTE a espessura', () => {
    // O kernel deriva `thicknessMm` da soma. Arredondar cada camada por conta
    // própria faria a parede engordar ou emagrecer sem que nada o dissesse.
    for (const chave of ['casa', 'predio'] as const) {
      for (const p of paredes[chave]) {
        if (p.camadas.length === 0) continue;
        expect(p.camadas.reduce((s, c) => s + c.espessuraMm, 0), p.nome).toBe(p.espessuraMm);
        for (const c of p.camadas) expect(c.espessuraMm).toBeGreaterThan(0);
      }
    }
  });

  it('toda parede leva a identidade do arquivo', () => {
    for (const chave of ['casa', 'predio'] as const) {
      expect(paredes[chave].every((p) => p.uid !== null)).toBe(true);
    }
    // E são distintas: uid repetido faria a segunda parede ser recusada pelo
    // kernel, e a importação inteira falharia.
    const todos = [...paredes.casa, ...paredes.predio].map((p) => p.uid);
    expect(new Set(todos).size).toBe(todos.length);
  });

  it('a parede RECORTADA chega com altura desconhecida, não com zero', () => {
    // `null` diz "vem do pé-direito do nível"; zero seria uma parede sem altura,
    // que o kernel aceitaria como degenerada ou recusaria por engano.
    const semAltura = [...paredes.casa, ...paredes.predio].filter((p) => p.alturaMm === null);
    expect(semAltura).toHaveLength(13);
    for (const p of [...paredes.casa, ...paredes.predio]) {
      if (p.alturaMm !== null) expect(p.alturaMm).toBeGreaterThan(0);
    }
  });

  it('sem escala medida, RECUSA — não entra com o tamanho errado', () => {
    const r = traduzirParedes(
      [
        {
          expressID: 1,
          globalId: '2XPyKWY018sA1ygZKgQPtU',
          nome: 'P',
          eixo: [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
          ],
          base: 0,
          camadas: [{ espessura: 0.2, material: 'x' }],
          espessuraTotal: 0.2,
          deslocamentoDoCentro: 0,
          sentidoDasCamadas: 1,
          alturaExtrusao: 2.8,
          pavimento: null,
        },
      ],
      null,
    );
    expect(r.paredes).toHaveLength(0);
    expect(r.recusas[0].motivo).toMatch(/escala/);
  });
});
