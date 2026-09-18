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
  KERNEL_VERSION,
  POLITICA_PADRAO,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { COBERTURA_PLANILHA, abasDoQuantitativo } from '../utils/blueprintPlanilha';
import { HIPOTESES_ARMADURA_PADRAO, armaduraDoModelo } from '../utils/blueprintArmadura';

const T = 150;
const H = 2800;
const CTX = {
  titulo: 'Casa térrea',
  revisao: 3,
  hash: 'abc123',
  kernelVersion: KERNEL_VERSION,
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
  it('declara que a armadura é ESQUEMÁTICA (não detalhamento) e que NÃO há preço', () => {
    const texto = COBERTURA_PLANILHA.join(' ');
    // Aço entrou em 16/09/2026 como pré-quantitativo: a cobertura tem de dizer
    // o que ele é e o que não é; preço continua fora.
    expect(texto).toMatch(/ARMADURA ESQUEM[ÁA]TICA/i);
    expect(texto).toMatch(/n[ãa]o detalhamento/i);
    expect(texto).toMatch(/N[ÃA]O CONT[ÉE]M pre[çc]o/i);
  });

  it('aba "Armadura" (16/09/2026): uma linha por peça, kg numérico, origem e esquema; sem a armadura não há aba nem linhas de aço', () => {
    const m = soEstrutura();
    const quant = computeQuantities(m);
    const armadura = armaduraDoModelo(m, quant, HIPOTESES_ARMADURA_PADRAO);
    const abas = abasDoQuantitativo(quant, CTX, armadura);
    const arm = abas.find((a) => a.nome === 'Armadura')!;
    expect(arm).toBeTruthy();
    expect(arm.linhas[0]).toContain('Aço (kg)');
    const linha = arm.linhas[1];
    expect(linha[0]).toBe('P1');
    expect(linha[1]).toBe('Pilar');
    expect(linha[2]).toBe('20 × 40 cm'); // seção (17/09/2026)
    expect(typeof linha[4]).toBe('number');
    expect(linha[4]).toBeCloseTo(armadura.pecas[0].kg, 1);
    expect(typeof linha[8]).toBe('number'); // barras (m)
    expect(typeof linha[9]).toBe('number'); // estribos (m)
    expect(linha[8]).toBeCloseTo(armadura.pecas[0].comprimentoLongitudinalM, 1);
    expect(['esquema mínimo', 'taxa de referência']).toContain(linha[10]);
    expect(String(linha[11])).toMatch(/Ø 12,5/);
    const totais = abas.find((a) => a.nome === 'Totais')!;
    expect(totais.linhas.some((l) => l[0] === 'Aço — pilares' && typeof l[1] === 'number')).toBe(true);
    // Sem armadura: comportamento de antes.
    const sem = abasDoQuantitativo(quant, CTX);
    expect(sem.find((a) => a.nome === 'Armadura')).toBeUndefined();
    expect(sem.find((a) => a.nome === 'Totais')!.linhas.some((l) => l[0] === 'Aço — pilares')).toBe(false);
  });

  it('abas "Instalações" e "Pontos e conexões" (18/09/2026): tubo por trecho com caimento, pontos por classificação e conexões deduzidas; a Cobertura as declara', () => {
    const base = soAmbiente();
    const t = base.levels[0].id;
    const model = applyBatch(base, [
      { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(0, 0), b: point(3000, 0), cotaAMm: -150, cotaBMm: -210, bitolaMm: 100 },
      { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(3000, 0), b: point(3000, 2000), cotaAMm: -210, cotaBMm: -250, bitolaMm: 100 },
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Vaso', at: point(0, 0), cotaMm: -150, tipoHidraulico: 'VASO_SANITARIO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'CI', at: point(3000, 2000), cotaMm: -250, tipoHidraulico: 'CAIXA_INSPECAO' },
    ] as Command[]).model;
    const inst = aba(model, 'Instalações')!;
    expect(inst).toBeTruthy();
    expect(inst.linhas[0]).toEqual(['Trecho', 'Disciplina', 'DN (mm)', 'Item', 'Em planta (m)', 'Real (m)', 'Desnível (m)', 'Caimento (%)', 'Fórmula']);
    expect(inst.linhas).toHaveLength(3);
    const primeira = inst.linhas[1];
    expect(primeira[1]).toBe('Esgoto');
    expect(primeira[2]).toBe(100);
    expect(primeira[4]).toBe(3);
    expect(primeira[7]).toBe(2); // 60 mm em 3 m
    const pc = aba(model, 'Pontos e conexões')!;
    expect(pc).toBeTruthy();
    const texto = pc.linhas.map((l) => l.join(' | ')).join(String.fromCharCode(10));
    expect(texto).toMatch(/Vaso sanitário \| Esgoto \|  \| 1/);
    expect(texto).toMatch(/Joelho 90° \| Esgoto \| 100/);
    // Totais: o tubo por DN e o ponto entram.
    const totais = aba(model, 'Totais')!;
    const linhasTotais = totais.linhas.map((l) => l.join(' | ')).join(String.fromCharCode(10));
    expect(linhasTotais).toMatch(/Esgoto DN 100 \| \d/);
    expect(linhasTotais).toMatch(/Vaso sanitário · Esgoto \| 1 \| un/);
    expect(COBERTURA_PLANILHA.some((c) => /INSTALAÇÕES/.test(c) && /DEDUZIDAS/.test(c))).toBe(true);
    // Sem rede não há aba.
    expect(aba(soAmbiente(), 'Instalações')).toBeUndefined();
  });

  it('a capa carrega versão, hash e política — é o que liga a planilha ao desenho', () => {
    // ⚠️ AS VERSÕES VÊM DAS CONSTANTES, não copiadas à mão.
    //
    // Este caso fixava 'quant-1.3.0' e 'blueprint-kernel-ts-0.9.0' como texto,
    // e foi assim que a `main` ficou vermelha em 31/08/2026: outro PR subiu a
    // política para 1.4.0, os dois passaram SOZINHOS e falharam JUNTOS, porque
    // o CI de cada um rodou contra uma base que não tinha o outro.
    //
    // O pin de versão tem UM dono — `blueprintQuantities.test.ts`, que existe
    // para isso. Uma segunda cópia dele não protege nada e é mais um lugar para
    // esquecer. O que este caso deve afirmar é o ENCANAMENTO: que a capa carrega
    // o que lhe foi entregue.
    const capa = abasDe(soAmbiente())[0].linhas.map((l) => l.join(' '));
    expect(capa.some((l) => l.includes(CTX.hash))).toBe(true);
    expect(capa.some((l) => l.includes(POLITICA_PADRAO.version))).toBe(true);
    expect(capa.some((l) => l.includes(CTX.kernelVersion))).toBe(true);
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
