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

/**
 * As INSTALAÇÕES lidas de volta pelo `web-ifc` (08/09/2026).
 *
 * ⚠️ ESTE É O ÁRBITRO DELAS, e por um motivo declarado: o portão de contagem de
 * atributos compara com dois modelos IFC4 reais, e NENHUM dos arquivos IFC que
 * temos — os dois de referência e os três projetos da empresa — contém
 * `IfcFlowSegment`, `IfcFlowTerminal`, `IfcDistributionSystem`,
 * `IfcRelAssignsToGroup` ou `IfcCircleProfileDef` em MEP. Para essas cinco não
 * há par no mundo real ao alcance.
 *
 * O `web-ifc` traz o schema IFC4 compilado: se a contagem estiver errada, os
 * atributos escorregam de casa e `Name` volta onde deveria estar `Description`.
 * Por isso os casos abaixo não contam entidades — eles conferem que cada valor
 * chegou NO CAMPO CERTO.
 */
describe.skipIf(motivo !== '')(`instalações no IFC${motivo}`, () => {
  const comRede = () => {
    const { model, fachada } = { ...sala() };
    void fachada;
    const nivel = model.levels[0].id;
    let m = applyCommand(model, {
      type: 'AddTerminal',
      levelId: nivel,
      disciplina: 'ELETRICA',
      tipo: 'Tomada baixa',
      at: point(2000, 500),
      cotaMm: 300,
    }).model;
    m = applyCommand(m, {
      type: 'AddTrecho',
      levelId: nivel,
      disciplina: 'ELETRICA',
      a: point(2000, 500),
      b: point(2000, 500),
      cotaAMm: 300,
      cotaBMm: 2500,
      bitolaMm: 25,
      rotulo: 'C1',
    }).model;
    return applyCommand(m, {
      type: 'AddTrecho',
      levelId: nivel,
      disciplina: 'ESGOTO',
      a: point(0, 1000),
      b: point(6000, 1000),
      cotaAMm: -100,
      cotaBMm: -220,
      bitolaMm: 100,
    }).model;
  };

  it('⚠️ os atributos chegam NO CAMPO CERTO — a contagem está certa', async () => {
    const tipos = (await import('web-ifc')) as unknown as Record<string, number>;
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    usarCaminhoDoWasm('');
    const api = (await obterApi()) as unknown as Record<string, (...a: unknown[]) => unknown>;
    const id = (api.OpenModel as (d: Uint8Array) => number)(
      new TextEncoder().encode(gerarIfc(comRede(), OPC)),
    );
    const ler = (tipo: number) => {
      const ids = (api.GetLineIDsWithType as (m: number, t: number) => { size(): number; get(i: number): number })(id, tipo);
      return Array.from({ length: ids.size() }, (_, i) =>
        (api.GetLine as (m: number, e: number) => Record<string, unknown>)(id, ids.get(i)),
      );
    };

    const trechos = ler(tipos.IFCFLOWSEGMENT);
    expect(trechos).toHaveLength(2);
    const c1 = trechos.find((t) => (t.Name as { value?: string })?.value === 'C1');
    // Se a contagem estivesse errada, `C1` teria caído em `Description` ou em
    // `ObjectType`, e este `find` não acharia nada.
    expect(c1).toBeDefined();
    expect(String((c1!.Tag as { value?: string })?.value)).toMatch(/^I-/);
    expect(c1!.ObjectPlacement).toBeTruthy();
    expect(c1!.Representation).toBeTruthy();

    const terminais = ler(tipos.IFCFLOWTERMINAL);
    expect(terminais).toHaveLength(1);
    expect((terminais[0].Name as { value?: string })?.value).toBe('Tomada baixa');
    expect(String((terminais[0].Tag as { value?: string })?.value)).toMatch(/^O-/);

    // Um sistema por disciplina PRESENTE — duas aqui, e nunca uma vazia.
    const sistemas = ler(tipos.IFCDISTRIBUTIONSYSTEM);
    expect(sistemas.map((x) => (x.Name as { value?: string })?.value).sort()).toEqual([
      'ELETRICA',
      'ESGOTO',
    ]);
    expect(
      sistemas.map((x) => String((x.PredefinedType as { value?: string })?.value)).sort(),
    ).toEqual(['ELECTRICAL', 'SEWAGE']);
  });

  it('⚠️ o QUADRO e o CIRCUITO chegam nos campos certos', async () => {
    // Estas duas também não têm par no mundo real: o árbitro é o schema IFC4
    // compilado no `web-ifc`. Com a contagem errada, os atributos escorregam de
    // casa e `Name` volta onde deveria estar `Description`.
    const tipos = (await import('web-ifc')) as unknown as Record<string, number>;
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    usarCaminhoDoWasm('');
    const api = (await obterApi()) as unknown as Record<string, (...a: unknown[]) => unknown>;

    const base = sala().model;
    const nivel = base.levels[0].id;
    let m = applyCommand(base, {
      type: 'AddQuadro',
      levelId: nivel,
      nome: 'QDC Principal',
      at: point(300, 300),
    }).model;
    m = applyCommand(m, {
      type: 'AddCircuito',
      quadroId: m.quadros[0].id,
      nome: 'C1 — Tomadas',
      disjuntorA: 20,
      secaoMm2: 2.5,
    }).model;
    m = applyCommand(m, {
      type: 'AddTerminal',
      levelId: nivel,
      disciplina: 'ELETRICA',
      tipo: 'Tomada baixa',
      at: point(2000, 500),
      cotaMm: 300,
    }).model;
    m = applyCommand(m, {
      type: 'SetTerminalProps',
      terminalId: m.terminais[0].id,
      circuitoId: m.circuitos[0].id,
      potenciaW: 600,
    }).model;

    const id = (api.OpenModel as (d: Uint8Array) => number)(
      new TextEncoder().encode(gerarIfc(m, OPC)),
    );
    const ler = (tipo: number) => {
      const ids = (api.GetLineIDsWithType as (mm: number, t: number) => { size(): number; get(i: number): number })(id, tipo);
      return Array.from({ length: ids.size() }, (_, i) =>
        (api.GetLine as (mm: number, e: number) => Record<string, unknown>)(id, ids.get(i)),
      );
    };

    // ⚠️ `IFCFLOWCONTROLLER`, e não `IFCDISTRIBUTIONBOARD`: este último só
    // existe a partir do IFC4 ADD2, e o `web-ifc` acha a linha e falha ao
    // desserializá-la. Foi medido — ver o comentário de `emitirQuadro`.
    const quadros = ler(tipos.IFCFLOWCONTROLLER);
    expect(quadros).toHaveLength(1);
    expect((quadros[0].Name as { value?: string })?.value).toBe('QDC Principal');
    expect(String((quadros[0].Tag as { value?: string })?.value)).toMatch(/^Q-/);
    expect(quadros[0].ObjectPlacement).toBeTruthy();

    const circuitos = ler(tipos.IFCDISTRIBUTIONCIRCUIT);
    expect(circuitos).toHaveLength(1);
    expect((circuitos[0].Name as { value?: string })?.value).toBe('C1 — Tomadas');
    expect(String((circuitos[0].PredefinedType as { value?: string })?.value)).toBe('ELECTRICAL');
  });

  it('⚠️ a PRUMADA tem 2,20 m de ALTURA no sólido, e não comprimento zero', async () => {
    // A prova geométrica: se o eixo local não fosse a direção do trecho, a
    // prumada sairia como um disco — e o receptor mostraria nada onde há um
    // cano subindo pela parede.
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    usarCaminhoDoWasm('');
    const api = (await obterApi()) as unknown as Record<string, (...a: unknown[]) => unknown>;
    const id = (api.OpenModel as (d: Uint8Array) => number)(
      new TextEncoder().encode(gerarIfc(comRede(), OPC)),
    );
    const tipos = (await import('web-ifc')) as unknown as Record<string, number>;
    const idsTrecho = new Set<number>();
    const lista = (api.GetLineIDsWithType as (m: number, t: number) => { size(): number; get(i: number): number })(id, tipos.IFCFLOWSEGMENT);
    for (let i = 0; i < lista.size(); i++) idsTrecho.add(lista.get(i));

    let alturaMaxima = 0;
    (api.StreamAllMeshes as (m: number, cb: (x: unknown) => void) => void)(id, (bruto) => {
      const malha = bruto as {
        expressID: number;
        geometries: {
          size(): number;
          get(i: number): { geometryExpressID: number; flatTransformation: number[] };
        };
      };
      if (!idsTrecho.has(malha.expressID)) return;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let g = 0; g < malha.geometries.size(); g++) {
        const ref = malha.geometries.get(g);
        const geo = (api.GetGeometry as (m: number, e: number) => Record<string, unknown>)(
          id,
          ref.geometryExpressID,
        );
        const v = (api.GetVertexArray as (p: number, s: number) => Float32Array)(
          (geo.GetVertexData as () => number)(),
          (geo.GetVertexDataSize as () => number)(),
        );
        // ⚠️ TRANSFORMADOS PARA O MUNDO. Os vértices crus estão no sistema
        // LOCAL da geometria, onde a extrusão do cilindro vai no Z local —
        // ler o Y ali mede o DIÂMETRO, não a altura vencida. Foi o que eu
        // medi na primeira tentativa: 98,98, que é o cano de 100 mm.
        const m = ref.flatTransformation;
        for (let k = 0; k < v.length; k += 6) {
          const y = m[1] * v[k] + m[5] * v[k + 1] + m[9] * v[k + 2] + m[13];
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      alturaMaxima = Math.max(alturaMaxima, maxY - minY);
    });
    // A prumada vence 2.500 − 300 = 2.200 mm, e a `flatTransformation` já traz
    // a conversão da unidade do arquivo para metro: 2,2.
    //
    // ⚠️ Se o eixo local não fosse a direção do trecho, isto daria o DIÂMETRO
    // do cano. Foi o que a primeira versão deste caso mediu, lendo o vértice
    // cru: 98,98 — o cano de esgoto de 100 mm, deitado, no sistema local dele.
    expect(alturaMaxima).toBeGreaterThan(2.15);
    expect(alturaMaxima).toBeLessThan(2.25);
  });
});

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

  it('⚠️ ACENTO sobrevive — antes o receptor TRUNCAVA a string no primeiro byte', () => {
    // MEDIDO em 07/09/2026 num receptor de terceiro: a porta `Porta 900×2100`
    // chegou lá como `Porta 90`. String de STEP é ASCII, e nós escrevíamos os
    // bytes UTF-8 crus; ele engasgou no primeiro byte não-ASCII e descartou o
    // resto, sem erro nenhum. O nome do pavimento é o caso mais barato de
    // provar: 'Térreo' tem acento no segundo caractere, então truncar dá 'T'.
    expect(leitura!.pavimentos).toHaveLength(1);
    expect(leitura!.pavimentos[0].nome).toBe('Térreo');

    // E o texto sai ESCAPADO no arquivo, não cru: `é` é U+00E9.
    const step = gerarIfc(sala().model, OPC);
    expect(step).toContain("'T\\X2\\00E9\\X0\\rreo'");
    expect(step).not.toContain("'Térreo'");
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
