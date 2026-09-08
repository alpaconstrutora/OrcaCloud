/**
 * O NOSSO leitor contra o NOSSO escritor — paredes e vãos, ida e volta.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
 *
 * Ele nasceu de um defeito medido em 07/09/2026, e o jeito como ele apareceu é
 * a lição: um receptor de terceiro (Revit) abriu o nosso IFC de prova e mostrou
 * TELHADO e ESCADA, mas nenhuma parede e nenhuma porta. Eu conferi a estrutura
 * do arquivo — entidades presentes, contidas no pavimento, atributos na ordem
 * do schema, placement do vão relativo ao da parede — e estava tudo certo.
 * Teoria não decidiu nada.
 *
 * O que decidiu foi apontar o NOSSO importador de IFC (Etapa 4) para o NOSSO
 * export. Ele leu ZERO paredes, e recusou as quatro com uma frase só:
 *
 *     "a parede não tem eixo no arquivo, e deduzi-lo do corpo seria estimar"
 *
 * As nossas paredes saíam com `Body` e mais nada. Nos dois modelos reais que o
 * importador lê bem, o `Axis` está em 191 de 191 paredes: é por ele que um
 * receptor reconstrói uma PAREDE — com comprimento, sentido e junções — em vez
 * de um sólido genérico.
 *
 * ⚠️ Enquanto os dois lados são nossos, um erro simétrico passaria despercebido
 * (escrever errado e ler errado do mesmo jeito). Por isso este arquivo não se
 * contenta em contar: ele confere o eixo lido contra as COORDENADAS DE ENTRADA
 * do desenho, que são a terceira fonte, independente das outras duas.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';
import type { LeituraParametrica } from '../services/ifcParametricoService';
import { traduzirParedes, traduzirVaos } from '../utils/ifcParaKernel';

const H = 2800;
const T = 200;

/** Uma sala retangular de 10 × 6 m, o mesmo desenho do arquivo de prova. */
function sala(): { model: BlueprintModel; fachada: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const nivel = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: nivel,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });
  const model = applyBatch(base, [
    p(0, 0, 10000, 0),
    p(10000, 0, 10000, 6000),
    p(10000, 6000, 0, 6000),
    p(0, 6000, 0, 0),
  ]).model;
  return { model, fachada: model.walls.find((w) => w.a.y === 0 && w.b.y === 0)!.id };
}

const OPC = {
  titulo: 'ida e volta',
  revisao: 1,
  hash: 'r'.repeat(64),
  data: new Date('2026-09-07T12:00:00Z'),
};

let motivo = '';
let leitura: LeituraParametrica | null = null;
let comVao: LeituraParametrica | null = null;

/**
 * Abre um texto STEP no `web-ifc` e devolve a leitura paramétrica.
 *
 * O motor WASM pode não inicializar (interop do Vitest, caminho com `Ç`). Se
 * não inicializar, os casos saem como `skip` com o motivo — nunca verdes por
 * omissão.
 */
async function ler(step: string): Promise<LeituraParametrica> {
  const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
  const { lerPecasParametricas } = await import('../services/ifcParametricoService');
  usarCaminhoDoWasm('');
  const api = await obterApi();
  const id = (api as unknown as { OpenModel: (d: Uint8Array) => number }).OpenModel(
    new TextEncoder().encode(step),
  );
  return lerPecasParametricas(id);
}

try {
  const s = sala();
  leitura = await ler(gerarIfc(s.model, OPC));
  comVao = await ler(
    gerarIfc(
      applyCommand(s.model, {
        type: 'AddOpening',
        wallId: s.fachada,
        kind: 'door',
        offsetMm: 2000,
        widthMm: 900,
        heightMm: 2100,
        sillMm: 0,
      }).model,
      OPC,
    ),
  );
} catch (e) {
  motivo = `web-ifc não inicializou: ${(e as Error).message}`;
}

describe.skipIf(motivo !== '')(`o nosso IFC lido pelo nosso importador${motivo}`, () => {
  it('⚠️ as 4 paredes voltam — e antes do eixo voltavam ZERO', () => {
    // MEDIDO em 07/09/2026, antes da correção:
    //   paredesLidas=0 recusas=["a parede não tem eixo no arquivo, …"]
    // O export levava só `Body`. Este caso é o que impede a regressão.
    expect(leitura!.paredes).toHaveLength(4);

    const traduzidas = traduzirParedes(leitura!.paredes, leitura!.fatorParaMm);
    expect(traduzidas.paredes).toHaveLength(4);
    expect(traduzidas.recusas).toEqual([]);
  });

  it('o eixo lido bate com as COORDENADAS QUE DESENHEI, não só com o que escrevi', () => {
    // A terceira fonte: o retângulo de entrada é 10.000 × 6.000 mm, com cantos
    // em (0,0) e (10.000,6.000). Se o eixo saísse do CORPO em vez do eixo, as
    // paredes chegariam mais LONGAS — pelo tanto que cada uma cresce para
    // fechar o canto (meia espessura de cada lado, 200 mm no total).
    const { paredes } = traduzirParedes(leitura!.paredes, leitura!.fatorParaMm);
    const xs = paredes.flatMap((p) => [p.a.x, p.b.x]);
    const ys = paredes.flatMap((p) => [p.a.y, p.b.y]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10000, 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6000, 0);

    // E cada parede tem o comprimento do EIXO: 10.000 ou 6.000, nunca 10.200.
    for (const p of paredes) {
      const comp = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
      expect([10000, 6000].some((esperado) => Math.abs(comp - esperado) < 1)).toBe(true);
    }
  });

  it('a espessura e a altura sobrevivem à ida e volta', () => {
    const { paredes } = traduzirParedes(leitura!.paredes, leitura!.fatorParaMm);
    for (const p of paredes) {
      expect(p.espessuraMm).toBeCloseTo(T, 0);
      expect(p.alturaMm).toBeCloseTo(H, 0);
    }
  });

  it('o vão da porta volta ancorado na parede certa', () => {
    const { paredes } = traduzirParedes(comVao!.paredes, comVao!.fatorParaMm);
    const vaos = traduzirVaos(comVao!.vaos, paredes, comVao!.fatorParaMm);
    expect(vaos.vaos).toHaveLength(1);
    const [vao] = vaos.vaos;
    expect(vao.kind).toBe('door');
    expect(vao.widthMm).toBeCloseTo(900, 0);
    expect(vao.heightMm).toBeCloseTo(2100, 0);
    // ⚠️ O `offsetMm` é o que erra em silêncio: ele sai de PROJETAR o sólido do
    // vão no eixo da parede, e um sinal trocado põe a porta no outro extremo
    // com o desenho fechando do mesmo jeito. Desenhei em 2.000; tem de voltar
    // 2.000, e não 7.100 (= 10.000 − 2.000 − 900).
    expect(vao.offsetMm).toBeCloseTo(2000, 0);
    expect(vao.sillMm).toBeCloseTo(0, 0);
    // E na parede que eu escolhi: a fachada, o único eixo com y = 0.
    const hospedeira = paredes.find((p) => p.expressID === vao.paredeExpressID)!;
    expect(hospedeira.a.y).toBeCloseTo(0, 0);
    expect(hospedeira.b.y).toBeCloseTo(0, 0);
  });
});
