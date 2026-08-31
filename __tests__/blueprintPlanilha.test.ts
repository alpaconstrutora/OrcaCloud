/**
 * O quantitativo como planilha.
 *
 * O risco desta saída não é "não exportar" — é exportar de um jeito que não
 * SOMA. Planilha de quantitativo existe para alguém filtrar por tipo e arrastar
 * a fórmula; se o número chega como texto, ou se uma aba vazia sugere que a
 * planta não tem aquilo, o arquivo engana em vez de informar. É isso que aqui
 * se trava.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  computeQuantities,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { COBERTURA_PLANILHA, abasDoQuantitativo } from '../utils/blueprintPlanilha';

const T = 150;
const H = 2800;
const CTX = {
  titulo: 'Casa térrea',
  revisao: 3,
  hash: 'abc123',
  kernelVersion: 'blueprint-kernel-ts-0.9.0',
};

function comTerreo(): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

/** Sala 4×3 fechada, sem estrutura. */
function soAmbiente(): BlueprintModel {
  const { model, levelId } = comTerreo();
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });
  return applyBatch(model, [
    w(0, 0, 4000, 0),
    w(4000, 0, 4000, 3000),
    w(4000, 3000, 0, 3000),
    w(0, 3000, 0, 0),
  ]).model;
}

/** Só um pilar — planta de fôrmas, sem cômodo fechado. */
function soEstrutura(): BlueprintModel {
  const { model, levelId } = comTerreo();
  return applyBatch(model, [
    {
      type: 'AddStructural',
      levelId,
      kind: 'PILAR',
      pontos: [point(1000, 1000)],
      larguraMm: 200,
      profundidadeMm: 400,
      alturaMm: H,
      rotulo: 'P1',
    },
  ] as Command[]).model;
}

const abasDe = (m: BlueprintModel) => abasDoQuantitativo(computeQuantities(m), CTX);
const nomes = (m: BlueprintModel) => abasDe(m).map((a) => a.nome);
const aba = (m: BlueprintModel, nome: string) => abasDe(m).find((a) => a.nome === nome);

describe('planilha · A TRAVA: número é número, não texto', () => {
  it('toda medida das abas de dados é célula NUMÉRICA', () => {
    const model = applyBatch(soAmbiente(), [
      {
        type: 'AddStructural',
        levelId: soAmbiente().levels[0].id,
        kind: 'PILAR',
        pontos: [point(2000, 1500)],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: H,
        rotulo: 'P1',
      },
    ] as Command[]).model;

    for (const nome of ['Ambientes', 'Paredes', 'Estrutura']) {
      const a = aba(model, nome);
      if (!a) continue;
      const cabecalho = a.linhas[0] as string[];
      for (const linha of a.linhas.slice(1)) {
        linha.forEach((celula, i) => {
          const col = cabecalho[i] ?? '';
          // Colunas de medida trazem a unidade entre parênteses no cabeçalho.
          if (!/\(m[²³]?\)/.test(col)) return;
          expect(
            typeof celula,
            `${nome} › "${col}" veio como ${typeof celula}; planilha com número em texto não soma`,
          ).toBe('number');
        });
      }
    }
  });

  it('os totais também são numéricos, e trazem a unidade em coluna própria', () => {
    const totais = aba(soAmbiente(), 'Totais')!;
    expect(totais.linhas[0]).toEqual(['Medida', 'Valor', 'Unidade']);
    const piso = totais.linhas.find((l) => l[0] === 'Área de piso')!;
    expect(typeof piso[1]).toBe('number');
    expect(piso[2]).toBe('m²');
  });
});

describe('planilha · aba vazia não é neutra', () => {
  it('planta SEM estrutura não ganha aba "Estrutura"', () => {
    // Uma aba vazia lê-se como "esta planta não tem estrutura orçável", quando
    // o correto é "ninguém desenhou estrutura". A ausência diz o mesmo sem
    // fingir que houve conferência.
    expect(nomes(soAmbiente())).not.toContain('Estrutura');
    expect(nomes(soAmbiente())).toContain('Ambientes');
  });

  it('planta de FÔRMAS (só pilar, sem cômodo) tem Estrutura e não tem Ambientes', () => {
    // É o caso que já tinha derrubado a aba Quantitativos na tela: sem cômodo
    // fechado, o módulo dizia "nenhum ambiente" e escondia o concreto.
    const n = nomes(soEstrutura());
    expect(n).toContain('Estrutura');
    expect(n).not.toContain('Ambientes');

    const totais = aba(soEstrutura(), 'Totais')!.linhas;
    const concreto = totais.find((l) => l[0] === 'Concreto — pilares')!;
    expect(concreto[1]).toBeCloseTo(0.224, 3);
  });

  it('a Cobertura existe SEMPRE, e é a primeira aba', () => {
    for (const m of [soAmbiente(), soEstrutura()]) {
      expect(abasDe(m)[0].nome).toBe('Cobertura');
    }
  });
});

describe('planilha · a cobertura diz o que falta', () => {
  it('declara que NÃO há armadura nem preço', () => {
    const texto = COBERTURA_PLANILHA.join(' ');
    // Os dois que alguém assume que existem: aço, porque a aba se chama
    // "Estrutura"; e preço, porque a planilha parece um orçamento.
    expect(texto).toMatch(/N[ÃA]O CONT[ÉE]M ARMADURA/i);
    expect(texto).toMatch(/N[ÃA]O CONT[ÉE]M pre[çc]o/i);
  });

  it('a capa carrega versão, hash e política — é o que liga a planilha ao desenho', () => {
    const capa = abasDe(soAmbiente())[0].linhas.map((l) => l.join(' '));
    expect(capa.some((l) => l.includes('abc123'))).toBe(true);
    expect(capa.some((l) => l.includes('quant-1.3.0'))).toBe(true);
    expect(capa.some((l) => l.includes('blueprint-kernel-ts-0.9.0'))).toBe(true);
  });
});

describe('planilha · conteúdo por peça', () => {
  it('a linha da estrutura usa o RÓTULO da prancha e carrega a fórmula', () => {
    const est = aba(soEstrutura(), 'Estrutura')!;
    expect(est.linhas[0]).toContain('Rótulo');
    const linha = est.linhas[1];
    expect(linha[0]).toBe('P1');
    expect(linha[1]).toBe('Pilar');
    // RF-121: número de quantitativo que não diz de onde veio não se confere.
    expect(String(linha[6])).toMatch(/largura × profundidade × altura/);
  });

  it('sem rótulo, a linha cai no id — nunca em célula vazia', () => {
    const { model, levelId } = comTerreo();
    const m = applyBatch(model, [
      {
        type: 'AddStructural',
        levelId,
        kind: 'LAJE',
        pontos: [point(0, 0), point(4000, 0), point(4000, 3000), point(0, 3000)],
        alturaMm: 120,
      },
    ] as Command[]).model;

    const linha = aba(m, 'Estrutura')!.linhas[1];
    expect(linha[0]).toBe('str_0001');
    expect(linha[1]).toBe('Laje');
  });

  it('o nome da abertura sai pela fonte única, não por ternário local', () => {
    const { model, levelId } = comTerreo();
    const comPorta = applyBatch(model, [
      { type: 'AddWall', levelId, a: point(0, 0), b: point(4000, 0), thicknessMm: T, heightMm: H },
      {
        type: 'AddOpening',
        wallId: 'wal_0001',
        kind: 'sliding',
        offsetMm: 500,
        widthMm: 900,
        heightMm: 2100,
        sillMm: 0,
      },
    ] as Command[]).model;

    expect(aba(comPorta, 'Aberturas')!.linhas[1][1]).toBe('Porta de correr');
  });
});
