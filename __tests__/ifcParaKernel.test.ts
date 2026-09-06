/**
 * IFC → kernel: a tradução, e a prova de que o kernel ACEITA o que ela produz.
 *
 * ─── O QUE ESTE ARQUIVO EXISTE PARA PEGAR ───────────────────────────────────
 *
 * Três conversões que erram caladas, e uma que erra alto:
 *
 *   1. UNIDADE — arquivo em centímetro, mundo do parser em metro, kernel em
 *      milímetro. Misturar duas dá um prédio 100× menor NO LUGAR CERTO.
 *   2. EIXO — o mundo do `web-ifc` é Y para cima; o kernel tem plano e cota
 *      separados. O sinal de Z é o que espelha a planta.
 *   3. VIGA × PILAR — na viga a extrusão é o comprimento; no pilar, a altura.
 *   4. E o kernel, que RECUSA o que não fecha — é a quarta, e essa grita.
 *
 * A parte que roda sem arquivo trava a tradução com uma peça montada à mão. A
 * parte que precisa do modelo real do usuário só roda com `IFC_REAL` apontando
 * para ele (o arquivo é do cliente e não entra no repositório).
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { traduzirPecas } from '../utils/ifcParaKernel';
import type { PecaParametrica } from '../services/ifcParametricoService';

/**
 * A matriz do pilar P1 do modelo real, copiada do parser.
 *
 * Coluna-maior. Escala 0,01 — o arquivo está em CENTÍMETRO e o mundo do
 * `web-ifc` é METRO, e é a matriz que carrega essa conversão. O X local vai
 * para −Z do mundo; o Y local, para −X; o Z local (a extrusão), para +Y.
 */
const MATRIZ_P1 = [0, 0, -0.01, 0, -0.01, 0, 0, 0, 0, 0.01, 0, 0, 9.2, 1.7, -19.9, 1];

function pilar(over: Partial<PecaParametrica> = {}): PecaParametrica {
  return {
    expressID: 1,
    classe: 'IFCCOLUMN',
    nome: 'P1',
    globalId: 'g1',
    perfil: { forma: 'RETANGULO', xDim: 20, yDim: 40 },
    profundidade: 340,
    matriz: MATRIZ_P1,
    pavimento: 100,
    ...over,
  };
}

describe('ifc → kernel · a unidade', () => {
  it('20 × 40 × 340 CENTÍMETROS vira 200 × 400 × 3400 MILÍMETROS', () => {
    // O número que prova a cadeia inteira: a matriz converte cm→m (×0,01) e a
    // tradução converte m→mm (×1000). Um fator manual em qualquer ponto daria
    // 20×40 ou 2000×4000, e as duas coisas "parecem" um pilar.
    const { pecas, recusas } = traduzirPecas([pilar()]);
    expect(recusas).toEqual([]);
    expect(pecas).toHaveLength(1);
    const p = pecas[0];
    expect(p.kind).toBe('PILAR');
    expect(p.larguraMm).toBe(200);
    expect(p.profundidadeMm).toBe(400);
    expect(p.alturaMm).toBe(3400);
  });

  it('a cota é ABSOLUTA e vem da matriz, não do pavimento', () => {
    // A translação Y da matriz é 1,7 m → 1700 mm. Quem importa é que desconta
    // a cota do pavimento escolhido.
    expect(traduzirPecas([pilar()]).pecas[0].cotaBaseMm).toBe(1700);
  });

  it('o plano vem de (X, −Z): o sinal de Z é o que espelha a planta', () => {
    // Translação (9,2 · 1,7 · −19,9) m → plano (9200, 19900) mm.
    const p = traduzirPecas([pilar()]).pecas[0];
    expect(p.pontos[0]).toEqual({ x: 9200, y: 19900 });
  });
});

describe('ifc → kernel · o que é altura e o que é comprimento', () => {
  it('a VIGA usa a extrusão como comprimento, e o perfil como seção', () => {
    // A mesma matriz girada para deitar a extrusão: o Z local passa a apontar
    // para +X do mundo. 340 cm de extrusão viram 3400 mm de VÃO, não de altura.
    const deitada = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1].map((v) => v * 0.01);
    deitada[15] = 1;
    const { pecas } = traduzirPecas([
      pilar({ classe: 'IFCBEAM', nome: 'VB1', matriz: deitada }),
    ]);
    expect(pecas).toHaveLength(1);
    const v = pecas[0];
    expect(v.kind).toBe('VIGA');
    expect(v.pontos).toHaveLength(2);
    // As duas pontas separadas pelo comprimento da extrusão: 340 cm = 3400 mm.
    expect(Math.hypot(v.pontos[1].x - v.pontos[0].x, v.pontos[1].y - v.pontos[0].y)).toBeCloseTo(3400, 0);
    // E a seção continua sendo 20×40 cm.
    expect([v.larguraMm, v.alturaMm].sort((a, b) => a - b)).toEqual([200, 400]);
  });

  it('a estaca circular vira PONTO circular, com o diâmetro', () => {
    const { pecas } = traduzirPecas([
      pilar({ classe: 'IFCPILE', nome: 'E1', perfil: { forma: 'CIRCULO', raio: 12.5 } }),
    ]);
    expect(pecas[0].kind).toBe('ESTACA');
    expect(pecas[0].circular).toBe(true);
    // Raio 12,5 cm → diâmetro 25 cm → 250 mm.
    expect(pecas[0].larguraMm).toBe(250);
    // Seção redonda não tem giro que se veja.
    expect(pecas[0].rotacaoDeg).toBe(0);
  });
});

describe('ifc → kernel · o que é RECUSADO', () => {
  it('um pilar com extrusão inclinada é recusado, não endireitado', () => {
    // A classe diz "pilar"; a geometria diz outra coisa. Endireitar produziria
    // uma peça que ninguém desenhou, no lugar errado.
    const inclinada = [...MATRIZ_P1];
    inclinada[8] = 0.007;
    inclinada[9] = 0.007;
    inclinada[10] = 0;
    const { pecas, recusas } = traduzirPecas([pilar({ matriz: inclinada })]);
    expect(pecas).toHaveLength(0);
    expect(recusas[0].motivo).toContain('inclinada');
  });

  it('extrusão de comprimento zero é recusada', () => {
    const { recusas } = traduzirPecas([pilar({ profundidade: 0 })]);
    expect(recusas[0].motivo).toContain('comprimento zero');
  });

  it('classe sem equivalente no kernel é recusada com o nome dela', () => {
    const { recusas } = traduzirPecas([pilar({ classe: 'IFCRAILING' })]);
    expect(recusas[0].motivo).toContain('IFCRAILING');
  });
});

describe('ifc → kernel · o KERNEL aceita o que a tradução produz', () => {
  it('as peças traduzidas entram num applyBatch e sobrevivem aos invariantes', () => {
    // A prova que fecha a cadeia: não basta a tradução devolver números, o
    // kernel tem de aceitá-los. `assertModelInvariants` roda a cada comando.
    const base = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Fundação',
      elevationMm: 0,
      defaultHeightMm: 3000,
    }).model;
    const levelId = base.levels[0].id;

    const { pecas } = traduzirPecas([
      pilar(),
      pilar({ expressID: 2, classe: 'IFCPILE', nome: 'E1', perfil: { forma: 'CIRCULO', raio: 12.5 } }),
    ]);

    const comandos: Command[] = pecas.map((p) => ({
      type: 'AddStructural',
      levelId,
      kind: p.kind,
      pontos: p.pontos,
      larguraMm: Math.max(1, p.larguraMm),
      profundidadeMm: Math.max(1, p.profundidadeMm),
      alturaMm: Math.max(1, p.alturaMm),
      baseMm: p.cotaBaseMm,
      circular: p.circular,
      rotacaoDeg: p.rotacaoDeg,
      rotulo: p.nome,
    }));

    const r = applyBatch(base, comandos);
    expect(r.model.structures).toHaveLength(2);
    expect(r.model.structures[0].larguraMm).toBe(200);
    expect(r.model.structures[1].circular).toBe(true);
  });

  it('UM LOTE: se uma peça é inválida, NENHUMA entra', () => {
    // `applyBatch` aplica sobre cópia e propaga a exceção. Meia importação de
    // 393 peças seria pior que nenhuma.
    const base = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 3000,
    }).model;
    const levelId = base.levels[0].id;
    const bom: Command = {
      type: 'AddStructural',
      levelId,
      kind: 'PILAR',
      pontos: [{ x: 0, y: 0 }],
      larguraMm: 200,
      profundidadeMm: 400,
      alturaMm: 3000,
      baseMm: 0,
    };
    const ruim: Command = { ...bom, alturaMm: 0 };

    expect(() => applyBatch(base, [bom, ruim])).toThrow();
    // O modelo de entrada continua intacto — é o que "ou tudo, ou nada" quer
    // dizer para quem chama.
    expect(base.structures).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O modelo REAL do usuário. Só roda com `IFC_REAL` apontando para o arquivo.
// ─────────────────────────────────────────────────────────────────────────────

const REAL = process.env.IFC_REAL ?? '';

describe.skipIf(!(REAL && existsSync(REAL)))('ifc → kernel · o modelo real de obra', () => {
  it('traduz 393 peças e recusa 55, e o kernel aceita todas', async () => {
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    const { lerPecasParametricas } = await import('../services/ifcParametricoService');
    usarCaminhoDoWasm('');
    const api = await obterApi();
    const bytes = readFileSync(REAL);
    const id = api.OpenModel(new Uint8Array(bytes));

    const leitura = await lerPecasParametricas(id);
    const traduzido = traduzirPecas(leitura.pecas);

    expect(leitura.pecas).toHaveLength(393);
    expect(leitura.recusas).toHaveLength(55);
    expect(traduzido.pecas).toHaveLength(393);
    expect(traduzido.recusas).toHaveLength(0);

    const porKind: Record<string, number> = {};
    for (const p of traduzido.pecas) porKind[p.kind] = (porKind[p.kind] ?? 0) + 1;
    expect(porKind).toEqual({ PILAR: 104, VIGA: 200, ESTACA: 85, LAJE: 4 });

    // O P1, conferido contra o arquivo: XDim=20 YDim=40 depth=340, em cm.
    const p1 = traduzido.pecas.find((p) => p.nome === 'P1');
    expect(p1).toBeDefined();
    expect([p1!.larguraMm, p1!.profundidadeMm].sort((a, b) => a - b)).toEqual([200, 400]);
    expect(p1!.alturaMm).toBe(3400);

    // E o kernel aceita o lote inteiro.
    const base = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Único',
      elevationMm: 0,
      defaultHeightMm: 3000,
    }).model;
    const levelId = base.levels[0].id;
    const comandos: Command[] = traduzido.pecas.map((p) => ({
      type: 'AddStructural',
      levelId,
      kind: p.kind,
      pontos: p.pontos,
      larguraMm: Math.max(1, p.larguraMm),
      profundidadeMm: Math.max(1, p.profundidadeMm),
      alturaMm: Math.max(1, p.alturaMm),
      baseMm: p.cotaBaseMm,
      circular: p.circular,
      rotacaoDeg: p.rotacaoDeg,
      rotulo: p.nome,
    }));
    const r: { model: BlueprintModel } = applyBatch(base, comandos);
    expect(r.model.structures).toHaveLength(393);

    api.CloseModel(id);
  }, 180000);
});
