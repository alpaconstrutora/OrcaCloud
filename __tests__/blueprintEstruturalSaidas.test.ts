/**
 * A estrutura nas TRÊS saídas: elevação, DXF e IFC.
 *
 * O grupo Estrutural nasceu em 30/08/2026 só na planta baixa, no 3D e no
 * quantitativo. Este arquivo cobre o que veio depois — e cobre um risco
 * específico de cada saída, não "passou/não passou":
 *
 *   ELEVAÇÃO — a fundação vive ABAIXO da linha do solo. O erro fácil é o
 *              enquadramento não descer até ela e a estaca sumir da vista.
 *   DXF      — o consumidor MEDE o arquivo. Seção redonda tem de sair `CIRCLE`,
 *              não o quadrado envolvente (27% de área a mais).
 *   IFC      — quem federa filtra POR CLASSE. Um saco de proxies não responde
 *              "me dê todos os pilares", e `IfcPile` tem um atributo a mais que
 *              as outras — errar isso gera arquivo que abre em uns leitores e
 *              falha em outros.
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
import { projetarElevacao } from '../utils/blueprintElevation';
import { bboxVisivel } from '../components/blueprint/ElevationCanvas';
import { CAMADAS, gerarDxf } from '../utils/blueprintDxf';
import { COBERTURA_IFC, gerarIfc } from '../utils/blueprintIfc';

const T = 150;
const H = 2800;

function comTerreo(): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

/** Uma caixa 6×4 com um pilar, uma viga, uma laje e a fundação embaixo. */
function comEstrutura(): BlueprintModel {
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
    w(0, 0, 6000, 0),
    w(6000, 0, 6000, 4000),
    w(6000, 4000, 0, 4000),
    w(0, 4000, 0, 0),
    {
      type: 'AddStructural',
      levelId,
      kind: 'PILAR',
      pontos: [point(3000, 2000)],
      larguraMm: 200,
      profundidadeMm: 400,
      alturaMm: H,
      rotulo: 'P1',
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'VIGA',
      pontos: [point(0, 2000), point(6000, 2000)],
      larguraMm: 150,
      alturaMm: 500,
      baseMm: H - 500,
      rotulo: 'V1',
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'LAJE',
      pontos: [point(0, 0), point(6000, 0), point(6000, 4000), point(0, 4000)],
      alturaMm: 120,
      baseMm: H,
      rotulo: 'L1',
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'ESTACA',
      pontos: [point(3000, 2000)],
      larguraMm: 300,
      alturaMm: 8000,
      baseMm: -9100,
      circular: true,
      rotulo: 'E1',
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'BLOCO_COROAMENTO',
      pontos: [point(3000, 2000)],
      larguraMm: 800,
      profundidadeMm: 800,
      alturaMm: 600,
      baseMm: -1100,
      rotulo: 'B1',
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'VIGA_FUNDACAO',
      pontos: [point(0, 0), point(6000, 0)],
      larguraMm: 200,
      alturaMm: 400,
      baseMm: -900,
      rotulo: 'VF1',
    },
  ] as Command[]).model;
}

// ── Elevação ────────────────────────────────────────────────────────────────

describe('elevação · estrutura', () => {
  it('as seis peças são projetadas, com a cota somada à elevação do nível', () => {
    const proj = projetarElevacao(comEstrutura(), { direcao: 'FRENTE' });
    expect(proj.estruturas).toHaveLength(6);

    const laje = proj.estruturas.find((e) => e.kind === 'LAJE')!;
    expect(laje.vMin).toBe(H);
    expect(laje.vMax).toBe(H + 120);
    expect(laje.enterrada).toBe(false);

    const viga = proj.estruturas.find((e) => e.kind === 'VIGA')!;
    expect(viga.vMin).toBe(H - 500);
    expect(viga.vMax).toBe(H);
  });

  it('a FUNDAÇÃO é marcada como enterrada — é o que o renderer traceja', () => {
    const proj = projetarElevacao(comEstrutura(), { direcao: 'FRENTE' });
    const enterradas = proj.estruturas.filter((e) => e.enterrada).map((e) => e.kind).sort();
    expect(enterradas).toEqual(['BLOCO_COROAMENTO', 'ESTACA', 'VIGA_FUNDACAO']);
    // Pilar, viga e laje estão acima do piso e NÃO são tracejados.
    expect(proj.estruturas.filter((e) => !e.enterrada)).toHaveLength(3);
  });

  it('A ARMADILHA: o bbox desce até a fundação, mas a LINHA DO SOLO não', () => {
    const proj = projetarElevacao(comEstrutura(), { direcao: 'FRENTE' });

    // A estaca vai a −9100 mm. Sem isto no bbox, ela seria desenhada fora do
    // quadro que a tela enquadra — a peça some e nada explica.
    expect(proj.bbox.vMin).toBe(-9100);

    // E o solo continua no piso. Igualar os dois puxaria a linha do terreno
    // para o fundo da estaca, 9 m abaixo do que a obra tem.
    expect(proj.linhaDoSolo.v).toBe(0);
    expect(proj.linhaDoSolo.v).toBeGreaterThan(proj.bbox.vMin);
  });

  it('planta SEM estrutura mantém o bbox no solo — nada mudou para quem não usa', () => {
    const { model, levelId } = comTerreo();
    const semEstrutura = applyBatch(model, [
      {
        type: 'AddWall',
        levelId,
        a: point(0, 0),
        b: point(6000, 0),
        thicknessMm: T,
        heightMm: H,
      },
    ]).model;

    const proj = projetarElevacao(semEstrutura, { direcao: 'FRENTE' });
    expect(proj.estruturas).toEqual([]);
    expect(proj.bbox.vMin).toBe(0);
    expect(proj.bbox.vMin).toBe(proj.linhaDoSolo.v);
  });

  it('a peça vista de TOPO é marcada degenerada, como a parede', () => {
    // Uma viga apontando para o observador tem largura ~0 na fachada.
    const { model, levelId } = comTerreo();
    const m = applyBatch(model, [
      {
        type: 'AddStructural',
        levelId,
        kind: 'VIGA',
        // Na vista FRENTE (olhando em +Y), uma viga ao longo de Y some.
        pontos: [point(1000, 0), point(1000, 4000)],
        larguraMm: 1,
        alturaMm: 500,
      },
    ] as Command[]).model;

    const proj = projetarElevacao(m, { direcao: 'FRENTE' });
    expect(proj.estruturas[0].degenerada).toBe(true);
  });
});

describe('elevação · o ENQUADRAMENTO segue o que está desenhado', () => {
  // Achado olhando a tela em 31/08/2026: com o toggle "Estrutura" desligado, o
  // quadro continuava dimensionado para a estaca escondida — a fachada encolhia
  // para o alto e a cota anunciava 12,02 m medindo até uma peça apagada.
  it('com estrutura VISÍVEL, a caixa desce até a fundação', () => {
    const proj = projetarElevacao(comEstrutura(), { direcao: 'FRENTE' });
    const bb = bboxVisivel(proj, true);
    expect(bb.vMin).toBe(-9100);
    expect(bb.vMax).toBe(H + 120); // topo da laje
  });

  it('com estrutura OCULTA, a caixa volta ao solo e ao topo das paredes', () => {
    const proj = projetarElevacao(comEstrutura(), { direcao: 'FRENTE' });
    const bb = bboxVisivel(proj, false);
    expect(bb.vMin).toBe(0);
    expect(bb.vMax).toBe(H);
    // 2,80 m — o pé-direito de verdade, e não os 12,02 m até a ponta da estaca.
    expect((bb.vMax - bb.vMin) / 1000).toBeCloseTo(2.8, 3);
  });

  it('sem estrutura no desenho, ligar ou desligar dá na mesma', () => {
    const { model, levelId } = comTerreo();
    const m = applyBatch(model, [
      { type: 'AddWall', levelId, a: point(0, 0), b: point(6000, 0), thicknessMm: T, heightMm: H },
    ]).model;
    const proj = projetarElevacao(m, { direcao: 'FRENTE' });
    expect(bboxVisivel(proj, true)).toEqual(bboxVisivel(proj, false));
  });
});

// ── DXF ─────────────────────────────────────────────────────────────────────

describe('DXF · estrutura', () => {
  const dxfDe = (m: BlueprintModel, elev = false) =>
    gerarDxf(m, {
      titulo: 'Estudo',
      revisao: 1,
      hash: 'h',
      elevacoes: elev ? [projetarElevacao(m, { direcao: 'FRENTE' })] : undefined,
    });

  it('separa ESTRUTURA de FUNDAÇÃO em camadas próprias', () => {
    const dxf = dxfDe(comEstrutura());
    expect(dxf).toContain(CAMADAS.ESTRUTURA);
    expect(dxf).toContain(CAMADAS.FUNDACAO);

    // Três peças acima do piso e três abaixo. Conta as ocorrências em POLYLINE
    // /CIRCLE, que é onde a camada aparece na entidade — não no TABLE.
    const emCamada = (c: string) =>
      [...dxf.matchAll(new RegExp(`8\\n${c}\\n`, 'g'))].length;
    // Cada polilinha declara a camada no POLYLINE e em cada VERTEX + SEQEND,
    // então o número absoluto não é o que interessa: interessa que as DUAS
    // camadas tenham geometria.
    expect(emCamada(CAMADAS.ESTRUTURA)).toBeGreaterThan(0);
    expect(emCamada(CAMADAS.FUNDACAO)).toBeGreaterThan(0);
  });

  it('A ARMADILHA: seção redonda sai como CIRCLE, não como quadrado', () => {
    const dxf = dxfDe(comEstrutura());
    // Quem recebe o DXF MEDE. Um quadrado de 300 no lugar de um círculo de
    // ⌀300 dá 27% de área a mais, e nada no arquivo denuncia.
    expect(dxf).toContain('CIRCLE');
    const raios = [...dxf.matchAll(/CIRCLE\n8\n[^\n]+\n10\n[^\n]+\n20\n[^\n]+\n30\n[^\n]+\n40\n([\d.]+)/g)];
    expect(raios).toHaveLength(1);
    expect(Number(raios[0][1])).toBeCloseTo(150, 3);
  });

  it('o rótulo leva a SEÇÃO junto — o DXF não guarda altura nem cota', () => {
    const dxf = dxfDe(comEstrutura());
    expect(dxf).toContain('P1 20x40');
    expect(dxf).toContain('E1 D30');
    expect(dxf).toContain('L1 e=12');
  });

  it('a elevação ganha a camada ELEVACAO-ESTRUTURA', () => {
    const dxf = dxfDe(comEstrutura(), true);
    expect(dxf).toContain(CAMADAS.ELEV_ESTRUTURA);
  });

  it('planta sem estrutura não ganha nenhuma entidade nova', () => {
    const { model, levelId } = comTerreo();
    const m = applyBatch(model, [
      { type: 'AddWall', levelId, a: point(0, 0), b: point(6000, 0), thicknessMm: T, heightMm: H },
    ]).model;
    const dxf = dxfDe(m);
    expect(dxf).not.toContain('CIRCLE');
    // As camadas seguem DECLARADAS no TABLE (é o contrato de camadas estáveis),
    // mas sem geometria nenhuma nelas.
    expect([...dxf.matchAll(new RegExp(`8\\n${CAMADAS.FUNDACAO}\\n`, 'g'))]).toHaveLength(0);
  });
});

// ── IFC ─────────────────────────────────────────────────────────────────────

describe('IFC · estrutura', () => {
  const ifcDe = (m: BlueprintModel) =>
    gerarIfc(m, {
      titulo: 'Estudo',
      revisao: 1,
      hash: 'hash-fixo',
      data: new Date('2026-08-30T12:00:00Z'),
    });

  it('A ARMADILHA: cada tipo sai na CLASSE IFC dele, não como proxy', () => {
    const ifc = ifcDe(comEstrutura());
    // Quem federa filtra por classe: "me dê todos os pilares". Um modelo de
    // IfcBuildingElementProxy não responde a essa pergunta.
    expect(ifc).toContain('IFCCOLUMN(');
    expect(ifc).toContain('IFCBEAM(');
    expect(ifc).toContain('IFCSLAB(');
    expect(ifc).toContain('IFCPILE(');
    expect(ifc).toContain('IFCFOOTING(');
    expect(ifc).not.toContain('IFCBUILDINGELEMENTPROXY');
  });

  it('IfcPile leva o atributo A MAIS que as outras classes', () => {
    const ifc = ifcDe(comEstrutura());
    // IfcPile = (…, PredefinedType, ConstructionType) — 10 atributos.
    // Emitir 9 gera arquivo que abre em uns leitores e falha em outros, que é
    // o pior modo de erro: parece funcionar.
    const pile = ifc.match(/IFCPILE\(([^;]*)\);/)!;
    expect(pile[1]).toMatch(/\.BORED\.,\$\s*$/);

    // A coluna, ao lado, termina no PredefinedType e mais nada.
    const col = ifc.match(/IFCCOLUMN\(([^;]*)\);/)!;
    expect(col[1]).toMatch(/\.COLUMN\.$/);
  });

  it('bloco e baldrame são IfcFooting com PredefinedType diferente', () => {
    const ifc = ifcDe(comEstrutura());
    expect(ifc).toContain('.PILE_CAP.');
    expect(ifc).toContain('.FOOTING_BEAM.');
  });

  it('a estaca redonda vira IFCCIRCLEPROFILEDEF com o raio certo', () => {
    const ifc = ifcDe(comEstrutura());
    const m = ifc.match(/IFCCIRCLEPROFILEDEF\(\.AREA\.,\$,\$,([\d.]+)\)/);
    expect(m, 'a estaca circular tem de sair como círculo').not.toBeNull();
    expect(Number(m![1])).toBeCloseTo(150, 3);
  });

  it('a COTA entra no placement — é o que põe a fundação abaixo do piso', () => {
    const ifc = ifcDe(comEstrutura());
    // A estaca nasce em baseMm = −9100, relativo ao piso do pavimento.
    expect(ifc).toContain('IFCCARTESIANPOINT((3000.,2000.,-9100.))');
  });

  it('o rótulo da prancha vai para o Tag — é por ele que se casa com o projeto', () => {
    const ifc = ifcDe(comEstrutura());
    expect(ifc).toMatch(/IFCCOLUMN\([^;]*'P1'[^;]*\)/);
  });

  it('a COBERTURA declara o que entrou E que não há armadura', () => {
    const ifc = ifcDe(comEstrutura());
    // A condição do RF-127: o que o arquivo não contém é indistinguível do que
    // não existe. Aço é justamente o que alguém esperaria de "estrutura".
    expect(COBERTURA_IFC.join(' ')).toMatch(/N[ÃA]O CONT[ÉE]M ARMADURA/i);
    expect(ifc).toMatch(/N[ÃA]O CONT[ÉE]M ARMADURA/i);
    expect(ifc).toContain('IfcColumn');
  });

  it('modelo sem estrutura continua sem nenhuma dessas entidades', () => {
    const { model, levelId } = comTerreo();
    const m = applyBatch(model, [
      { type: 'AddWall', levelId, a: point(0, 0), b: point(6000, 0), thicknessMm: T, heightMm: H },
    ]).model;
    const ifc = ifcDe(m);
    expect(ifc).not.toContain('IFCCOLUMN(');
    expect(ifc).not.toContain('IFCPILE(');
    expect(ifc).toContain('IFCWALL(');
  });
});
