/**
 * IFC de coordenação com IDENTIDADE, ABERTURAS, PROPRIEDADES e QUANTIDADES
 * (04/09/2026 — Etapa 1 do roadmap BIM).
 *
 * O que este arquivo trava, em ordem de importância:
 *
 *  1. o `GlobalId` de um elemento vem do `uid` e É O MESMO em duas revisões —
 *     é o que Revit/Solibri/BIMcollab precisam para rastrear "esta parede";
 *  2. porta e janela saem como IfcDoor/IfcWindow com IfcOpeningElement +
 *     IfcRelVoidsElement + IfcRelFillsElement; vão livre sai só como vão;
 *  3. CONTAGEM DE ATRIBUTOS de cada entidade nova bate com o schema IFC4 —
 *     errar isto abre num leitor e falha noutro;
 *  4. o vão fica no lugar certo no sistema local da parede (com o avanço de
 *     canto), e o corpo da parede continua SÓLIDO;
 *  5. `OperationType` segue a convenção do canvas (as 8 combinações);
 *  6. Pset só com o que se sabe (nunca vazio) e Qto com os números do
 *     `computeQuantities`, nas unidades certas (mm / m² / m³).
 */

import { describe, expect, it } from 'vitest';
import {
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  computeQuantities,
  emptyModel,
  point,
  wallLength,
  type BlueprintModel,
  type Command,
  type Opening,
} from '../utils/blueprintKernel';
import {
  COBERTURA_IFC,
  FOLGA_VAO_MM,
  gerarIfc,
  ifcGuidDeUid,
  operacaoIfcDaAbertura,
} from '../utils/blueprintIfc';

const H = 2800;
const T = 150;
const OPC = {
  titulo: 'Casa',
  revisao: 1,
  hash: 'a'.repeat(64),
  data: new Date('2026-09-04T12:00:00Z'),
  studyId: '11111111-2222-4333-8444-555555555555',
};

function comNivel() {
  const r = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H });
  return { model: r.model, levelId: r.model.levels[0].id };
}

function parede(levelId: string, ax: number, ay: number, bx: number, by: number): Command {
  return { type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: T, heightMm: H };
}

/** Sala 4×3 com uma DIVISÓRIA interna: paredes externas, uma interna, dois ambientes. */
function casa(): BlueprintModel {
  const { model, levelId } = comNivel();
  return applyBatch(model, [
    parede(levelId, 0, 0, 4000, 0),
    parede(levelId, 4000, 0, 4000, 3000),
    parede(levelId, 4000, 3000, 0, 3000),
    parede(levelId, 0, 3000, 0, 0),
    parede(levelId, 2000, 0, 2000, 3000),
  ]).model;
}

function abertura(wallId: string, kind: Opening['kind'], extra: Partial<Command & { type: 'AddOpening' }> = {}): Command {
  return {
    type: 'AddOpening',
    wallId,
    kind,
    offsetMm: 1000,
    widthMm: 800,
    heightMm: kind === 'window' ? 1200 : 2100,
    sillMm: kind === 'window' ? 900 : 0,
    ...extra,
  } as Command;
}

/** Linhas de dados do STEP: `[id, entidade, argumentos de topo]`. */
function entidades(ifc: string): { id: string; tipo: string; args: string[] }[] {
  const dados = ifc.split('DATA;\n')[1].split('\nENDSEC;')[0].split('\n');
  return dados.map((linha) => {
    const m = /^(#\d+)= ([A-Z0-9]+)\((.*)\);$/.exec(linha)!;
    return { id: m[1], tipo: m[2], args: argsDeTopo(m[3]) };
  });
}

/** Divide por vírgulas de NÍVEL ZERO — parênteses e aspas escondem as internas. */
function argsDeTopo(texto: string): string[] {
  const saida: string[] = [];
  let atual = '';
  let prof = 0;
  let emAspas = false;
  for (const ch of texto) {
    if (ch === "'") emAspas = !emAspas;
    if (!emAspas) {
      if (ch === '(') prof++;
      if (ch === ')') prof--;
      if (ch === ',' && prof === 0) {
        saida.push(atual);
        atual = '';
        continue;
      }
    }
    atual += ch;
  }
  saida.push(atual);
  return saida;
}

const dosTipo = (ifc: string, tipo: string) => entidades(ifc).filter((e) => e.tipo === tipo);

describe('IFC · identidade', () => {
  it('ifcGuidDeUid é a compressão padrão: 22 chars, 1º em 0–3, determinística', () => {
    const g = ifcGuidDeUid('89b784bd-c5b2-4f62-9194-a1c051daa280');
    expect(g).toHaveLength(22);
    expect(g).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(ifcGuidDeUid('89b784bd-c5b2-4f62-9194-a1c051daa280')).toBe(g);
    expect(ifcGuidDeUid('00000000-0000-0000-0000-000000000000')).toBe('0'.repeat(22));
    expect(ifcGuidDeUid('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(`3${'$'.repeat(21)}`);
  });

  it('o GlobalId da parede É o uid comprimido, e o Tag é o rótulo curto', () => {
    const m = casa();
    const ifc = gerarIfc(m, OPC);
    const paredes = dosTipo(ifc, 'IFCWALL');
    expect(paredes).toHaveLength(5);
    const guids = paredes.map((p) => p.args[0].replace(/'/g, ''));
    expect(new Set(guids)).toEqual(new Set(m.walls.map((w) => ifcGuidDeUid(w.uid))));
    expect(paredes[0].args[7]).toMatch(/^'P-[0-9A-F]{4}'$/);
  });

  it('A PROVA: a mesma parede tem o MESMO GlobalId em duas revisões', () => {
    const r1 = casa();
    const divisoria = r1.walls.find((w) => w.a.x === 2000 && w.b.x === 2000)!;
    const r2 = applyCommand(r1, {
      type: 'TranslateEntities',
      wallIds: [divisoria.id],
      boundaryIds: [],
      structuralIds: [],
      delta: point(500, 0),
      manterJuncoes: false,
    }).model;

    const ifc1 = gerarIfc(r1, { ...OPC, revisao: 1, hash: 'a'.repeat(64) });
    const ifc2 = gerarIfc(r2, { ...OPC, revisao: 2, hash: 'b'.repeat(64) });
    const g1 = new Set(dosTipo(ifc1, 'IFCWALL').map((p) => p.args[0]));
    const g2 = new Set(dosTipo(ifc2, 'IFCWALL').map((p) => p.args[0]));
    expect(g2).toEqual(g1);
    // E projeto/terreno/edifício/pavimento também não mudam (studyId + uid do nível).
    for (const tipo of ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY']) {
      expect(dosTipo(ifc2, tipo)[0].args[0], tipo).toBe(dosTipo(ifc1, tipo)[0].args[0]);
    }
    // Sem studyId, o projeto cai no hash e muda — comportamento antigo, declarado.
    const semEstudo = { ...OPC, studyId: undefined };
    expect(dosTipo(gerarIfc(r1, { ...semEstudo, hash: 'a'.repeat(64) }), 'IFCPROJECT')[0].args[0]).not.toBe(
      dosTipo(gerarIfc(r2, { ...semEstudo, hash: 'b'.repeat(64) }), 'IFCPROJECT')[0].args[0],
    );
  });

  it('reexportar a mesma versão continua dando o mesmo arquivo', () => {
    const m = casa();
    expect(gerarIfc(m, OPC)).toBe(gerarIfc(m, OPC));
  });
});

describe('IFC · aberturas', () => {
  it('porta: 1 IfcOpeningElement + 1 IfcRelVoidsElement + 1 IfcDoor + 1 IfcRelFillsElement', () => {
    const base = casa();
    const m = applyCommand(base, abertura(base.walls[0].id, 'door')).model;
    const ifc = gerarIfc(m, OPC);
    expect(dosTipo(ifc, 'IFCOPENINGELEMENT')).toHaveLength(1);
    expect(dosTipo(ifc, 'IFCRELVOIDSELEMENT')).toHaveLength(1);
    expect(dosTipo(ifc, 'IFCDOOR')).toHaveLength(1);
    expect(dosTipo(ifc, 'IFCRELFILLSELEMENT')).toHaveLength(1);
    expect(dosTipo(ifc, 'IFCWINDOW')).toHaveLength(0);

    // O vão liga a PAREDE certa, e o preenchimento liga o vão à porta.
    const parede = dosTipo(ifc, 'IFCWALL').find((p) => p.args[0] === `'${ifcGuidDeUid(m.walls[0].uid)}'`)!;
    const vao = dosTipo(ifc, 'IFCOPENINGELEMENT')[0];
    const porta = dosTipo(ifc, 'IFCDOOR')[0];
    expect(dosTipo(ifc, 'IFCRELVOIDSELEMENT')[0].args.slice(4)).toEqual([parede.id, vao.id]);
    expect(dosTipo(ifc, 'IFCRELFILLSELEMENT')[0].args.slice(4)).toEqual([vao.id, porta.id]);

    // A porta é produto do pavimento; o vão NÃO.
    const contidos = dosTipo(ifc, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')[0].args[4];
    expect(contidos).toContain(porta.id);
    expect(contidos).not.toContain(vao.id);
  });

  it('janela vira IfcWindow; vão livre vira SÓ o vão', () => {
    const base = casa();
    const m = applyBatch(base, [
      abertura(base.walls[0].id, 'window'),
      abertura(base.walls[1].id, 'passage'),
    ]).model;
    const ifc = gerarIfc(m, OPC);
    expect(dosTipo(ifc, 'IFCOPENINGELEMENT')).toHaveLength(2);
    expect(dosTipo(ifc, 'IFCRELVOIDSELEMENT')).toHaveLength(2);
    expect(dosTipo(ifc, 'IFCWINDOW')).toHaveLength(1);
    expect(dosTipo(ifc, 'IFCDOOR')).toHaveLength(0);
    expect(dosTipo(ifc, 'IFCRELFILLSELEMENT')).toHaveLength(1);
  });

  it('CONTAGEM DE ATRIBUTOS do IFC4 em toda entidade nova', () => {
    const base = casa();
    const m = applyBatch(base, [
      abertura(base.walls[0].id, 'door'),
      abertura(base.walls[2].id, 'window'),
    ]).model;
    const ifc = gerarIfc(m, OPC);
    const esperado: Record<string, number> = {
      IFCOPENINGELEMENT: 9,
      IFCDOOR: 13,
      IFCWINDOW: 13,
      IFCRELVOIDSELEMENT: 6,
      IFCRELFILLSELEMENT: 6,
      IFCPROPERTYSET: 5,
      IFCPROPERTYSINGLEVALUE: 4,
      IFCRELDEFINESBYPROPERTIES: 6,
      IFCELEMENTQUANTITY: 6,
      IFCQUANTITYLENGTH: 5,
      IFCQUANTITYAREA: 5,
      IFCQUANTITYVOLUME: 5,
      IFCWALL: 9,
      IFCSPACE: 11,
      IFCBUILDINGSTOREY: 10,
    };
    for (const [tipo, quantos] of Object.entries(esperado)) {
      const lista = dosTipo(ifc, tipo);
      expect(lista.length, `há ${tipo}`).toBeGreaterThan(0);
      for (const e of lista) expect(e.args, `${tipo} ${e.id}`).toHaveLength(quantos);
    }
    // PredefinedType/OperationType/PartitioningType nas posições do schema.
    expect(dosTipo(ifc, 'IFCOPENINGELEMENT')[0].args[8]).toBe('.OPENING.');
    expect(dosTipo(ifc, 'IFCDOOR')[0].args[10]).toBe('.DOOR.');
    expect(dosTipo(ifc, 'IFCDOOR')[0].args[11]).toMatch(/^\.SINGLE_SWING_(LEFT|RIGHT)\.$/);
    expect(dosTipo(ifc, 'IFCWINDOW')[0].args[10]).toBe('.WINDOW.');
    expect(dosTipo(ifc, 'IFCWINDOW')[0].args[11]).toBe('.NOTDEFINED.');
    // OverallHeight/OverallWidth em mm.
    expect(dosTipo(ifc, 'IFCDOOR')[0].args.slice(8, 10)).toEqual(['2100.', '800.']);
    expect(dosTipo(ifc, 'IFCWINDOW')[0].args.slice(8, 10)).toEqual(['1200.', '800.']);
  });

  it('o vão fica no lugar certo no sistema LOCAL da parede, com o avanço de canto', () => {
    // Parede solta de 4 m: sem avanço, centro em x=0, ponta `a` em −2000.
    // Porta em offset 1000, largura 800 → centro do vão em −2000+1000+400 = −600.
    const { model, levelId } = comNivel();
    const solta = applyCommand(model, parede(levelId, 0, 0, 4000, 0)).model;
    const comPorta = applyCommand(solta, abertura(solta.walls[0].id, 'door')).model;
    expect(gerarIfc(comPorta, OPC)).toContain('IFCCARTESIANPOINT((-600.,0.,0.))');

    // Na casa, a parede de baixo tem canto nas duas pontas: o corpo avança 75 mm
    // de cada lado (comp = 4150, de −2075 a +2075), mas a ponta `a` continua em
    // −2075 + 75 = −2000 — o avanço é do CORPO, não do eixo. O vão fica no MESMO
    // −600, e é isso que se quer provar: o canto não empurra a porta.
    const base = casa();
    const m = applyCommand(base, abertura(base.walls[0].id, 'window')).model;
    const ifc = gerarIfc(m, OPC);
    expect(ifc).toContain('IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4150.,150.)');
    expect(ifc).toContain('IFCCARTESIANPOINT((-600.,0.,900.))');

    // O vão atravessa a parede com folga; a folha tem a espessura da parede.
    expect(ifc).toContain(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,800.,${T + 2 * FOLGA_VAO_MM}.)`);
    expect(ifc).toContain(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,800.,${T}.)`);
  });

  it('o corpo da parede continua SÓLIDO — o vão é relação, não booleano', () => {
    const base = casa();
    const m = applyCommand(base, abertura(base.walls[0].id, 'door')).model;
    const ifc = gerarIfc(m, OPC);
    // (`IFCBOOLEAN(.T.)` é tipo de VALOR de propriedade — o que não pode haver é
    // resultado booleano de GEOMETRIA.)
    expect(ifc).not.toContain('IFCBOOLEANCLIPPINGRESULT');
    expect(ifc).not.toContain('IFCBOOLEANRESULT');
    // O perfil da parede de baixo é o trecho inteiro estendido (4150), intacto.
    expect(ifc).toContain('IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4150.,150.)');
  });

  it('OperationType: as 8 combinações seguem a convenção do canvas', () => {
    const o = (kind: Opening['kind'], hingeAtStart: boolean, swingReversed: boolean): Opening => ({
      id: 'opn_0001',
      uid: '00000000-0000-4000-8000-000000000001',
      wallId: 'wal_0001',
      kind,
      offsetMm: 0,
      widthMm: 800,
      heightMm: 2100,
      sillMm: 0,
      hingeAtStart,
      swingReversed,
      embutida: false,
    });
    // Porta de abrir: LEFT quando dobradiça e lado de abertura "combinam"
    // (mesmo XOR do arco no canvas).
    expect(operacaoIfcDaAbertura(o('door', true, false))).toBe('.SINGLE_SWING_LEFT.');
    expect(operacaoIfcDaAbertura(o('door', true, true))).toBe('.SINGLE_SWING_RIGHT.');
    expect(operacaoIfcDaAbertura(o('door', false, false))).toBe('.SINGLE_SWING_RIGHT.');
    expect(operacaoIfcDaAbertura(o('door', false, true))).toBe('.SINGLE_SWING_LEFT.');
    // Porta de correr: só a ponta para onde recolhe importa.
    expect(operacaoIfcDaAbertura(o('sliding', true, false))).toBe('.SLIDING_TO_LEFT.');
    expect(operacaoIfcDaAbertura(o('sliding', true, true))).toBe('.SLIDING_TO_LEFT.');
    expect(operacaoIfcDaAbertura(o('sliding', false, false))).toBe('.SLIDING_TO_RIGHT.');
    expect(operacaoIfcDaAbertura(o('sliding', false, true))).toBe('.SLIDING_TO_RIGHT.');
  });

  it('porta com swingReversed gira o placement da folha em 180° (+Y = lado que abre)', () => {
    const { model, levelId } = comNivel();
    const solta = applyCommand(model, parede(levelId, 0, 0, 4000, 0)).model;
    const normal = applyCommand(solta, abertura(solta.walls[0].id, 'door')).model;
    const invertida = applyCommand(normal, { type: 'FlipOpening', openingId: normal.openings[0].id, axis: 'swing' }).model;
    expect(gerarIfc(normal, OPC)).not.toContain('IFCDIRECTION((-1.,0.,0.))');
    expect(gerarIfc(invertida, OPC)).toContain('IFCDIRECTION((-1.,0.,0.))');
  });
});

describe('IFC · propriedades', () => {
  it('Pset_WallCommon.IsExternal: externa .T., divisória .F., parede solta OMITIDA', () => {
    const base = casa();
    const ifc = gerarIfc(base, OPC);
    const props = dosTipo(ifc, 'IFCPROPERTYSINGLEVALUE').filter((p) => p.args[0] === "'IsExternal'");
    // 4 externas + 1 divisória (+ 2 ambientes com IsExternal=false do Pset_SpaceCommon).
    const valores = props.map((p) => p.args[2]);
    expect(valores.filter((v) => v === 'IFCBOOLEAN(.T.)')).toHaveLength(4);
    expect(valores.filter((v) => v === 'IFCBOOLEAN(.F.)')).toHaveLength(1 + 2);

    // Parede solta: nada a afirmar → Pset_WallCommon não sai para ela.
    const { model, levelId } = comNivel();
    const solta = applyCommand(model, parede(levelId, 0, 0, 4000, 0)).model;
    const ifcSolta = gerarIfc(solta, OPC);
    expect(dosTipo(ifcSolta, 'IFCPROPERTYSET').map((p) => p.args[2])).not.toContain("'Pset_WallCommon'");
    // Mas Pset_OpuraPlanta sai sempre.
    expect(dosTipo(ifcSolta, 'IFCPROPERTYSET').map((p) => p.args[2])).toContain("'Pset_OpuraPlanta'");
  });

  it('LoadBearing só quando há composição; camada ESTRUTURAL → .T.', () => {
    const base = casa();
    const w = base.walls[0];
    const comCamadas = applyCommand(base, {
      type: 'SetWallLayers',
      wallId: w.id,
      camadas: [
        { espessuraMm: 25, itemCode: 'REB-1', descricao: 'Reboco', funcao: 'REVESTIMENTO' },
        { espessuraMm: 100, itemCode: 'CONC-1', descricao: 'Concreto', funcao: 'ESTRUTURAL' },
        { espessuraMm: 25, itemCode: 'REB-1', descricao: 'Reboco', funcao: 'REVESTIMENTO' },
      ],
    }).model;
    const ifc = gerarIfc(comCamadas, OPC);
    const lb = dosTipo(ifc, 'IFCPROPERTYSINGLEVALUE').filter((p) => p.args[0] === "'LoadBearing'");
    expect(lb).toHaveLength(1);
    expect(lb[0].args[2]).toBe('IFCBOOLEAN(.T.)');
    // ItemCode no Pset_OpuraPlanta: códigos distintos, sem repetir.
    const item = dosTipo(ifc, 'IFCPROPERTYSINGLEVALUE').find((p) => p.args[0] === "'ItemCode'")!;
    expect(item.args[2]).toBe("IFCLABEL('REB-1;CONC-1')");
    // E o ITEM 3 da cobertura antiga ("não contém materiais") saiu de cena.
    expect(ifc).toContain('IFCMATERIALLAYERSETUSAGE');
    expect(COBERTURA_IFC.join(' ')).not.toMatch(/NÃO CONTÉM materiais/);
  });

  it('Pset_OpuraPlanta carrega a procedência, e nenhum Pset sai vazio', () => {
    const m = casa();
    const ifc = gerarIfc(m, OPC);
    const nomes = dosTipo(ifc, 'IFCPROPERTYSINGLEVALUE').map((p) => p.args[0]);
    for (const n of ["'ElementUid'", "'ElementLabel'", "'StudyId'", "'SnapshotHash'", "'SnapshotRevision'", "'KernelVersion'", "'QuantitiesVersion'"]) {
      expect(nomes, n).toContain(n);
    }
    const uidProp = dosTipo(ifc, 'IFCPROPERTYSINGLEVALUE').find((p) => p.args[0] === "'ElementUid'")!;
    expect(m.walls.map((w) => `IFCIDENTIFIER('${w.uid}')`)).toContain(uidProp.args[2]);
    expect(dosTipo(ifc, 'IFCPROPERTYSINGLEVALUE').find((p) => p.args[0] === "'SnapshotRevision'")!.args[2]).toBe('IFCINTEGER(1)');
    expect(dosTipo(ifc, 'IFCPROPERTYSINGLEVALUE').find((p) => p.args[0] === "'QuantitiesVersion'")!.args[2]).toBe(
      `IFCLABEL('${POLITICA_PADRAO.version}')`,
    );
    for (const pset of dosTipo(ifc, 'IFCPROPERTYSET')) {
      expect(pset.args[4], `Pset vazio: ${pset.id}`).not.toBe('()');
    }
  });
});

describe('IFC · quantidades', () => {
  it('Qto_WallBaseQuantities: Length em mm igual ao kernel; áreas e volume iguais ao computeQuantities', () => {
    const m = casa();
    const ifc = gerarIfc(m, OPC);
    const q = computeQuantities(m, POLITICA_PADRAO);
    const w = m.walls[0];
    const qw = q.paredes.find((p) => p.wallId === w.id)!;

    expect(ifc).toContain(`IFCQUANTITYLENGTH('Length',$,$,${wallLength(w)}.,$)`);
    expect(ifc).toContain(`IFCQUANTITYLENGTH('Width',$,$,${T}.,$)`);
    expect(ifc).toContain(`IFCQUANTITYLENGTH('Height',$,$,${H}.,$)`);
    const fmt = (v: number) => (Number.isInteger(v) ? `${v}.` : v.toFixed(6));
    expect(ifc).toContain(`IFCQUANTITYAREA('NetSideArea',$,$,${fmt(qw.areaFaceLiquidaM2)},$)`);
    expect(ifc).toContain(`IFCQUANTITYVOLUME('NetVolume',$,$,${fmt(qw.volumeM3)},$)`);
    expect(dosTipo(ifc, 'IFCELEMENTQUANTITY').filter((e) => e.args[2] === "'Qto_WallBaseQuantities'")).toHaveLength(5);
  });

  it('Qto_SpaceBaseQuantities: GrossFloorArea é o EIXO, NetFloorArea é o PISO', () => {
    const m = casa();
    const ifc = gerarIfc(m, OPC);
    const q = computeQuantities(m, POLITICA_PADRAO);
    const fmt = (v: number) => (Number.isInteger(v) ? `${v}.` : v.toFixed(6));
    for (const amb of q.ambientes) {
      expect(ifc).toContain(`IFCQUANTITYAREA('GrossFloorArea',$,$,${fmt(amb.areaEixoM2)},$)`);
      expect(ifc).toContain(`IFCQUANTITYAREA('NetFloorArea',$,$,${fmt(amb.areaPisoM2)},'`);
      expect(amb.areaPisoM2).toBeLessThan(amb.areaEixoM2);
    }
  });

  it('porta e janela levam Qto com Width/Height em mm e Area em m²', () => {
    const base = casa();
    const m = applyBatch(base, [abertura(base.walls[0].id, 'door'), abertura(base.walls[2].id, 'window')]).model;
    const ifc = gerarIfc(m, OPC);
    expect(dosTipo(ifc, 'IFCELEMENTQUANTITY').map((e) => e.args[2])).toEqual(
      expect.arrayContaining(["'Qto_DoorBaseQuantities'", "'Qto_WindowBaseQuantities'"]),
    );
    expect(ifc).toContain("IFCQUANTITYAREA('Area',$,$,1.680000,$)"); // 0,8 × 2,1
    expect(ifc).toContain("IFCQUANTITYAREA('Area',$,$,0.960000,$)"); // 0,8 × 1,2
  });

  it('estrutura: Qto na classe certa, com GrossVolume ≥ NetVolume e a fórmula do kernel', () => {
    const { model, levelId } = comNivel();
    const m = applyBatch(model, [
      { type: 'AddStructural', levelId, kind: 'PILAR', pontos: [point(1000, 1000)], larguraMm: 200, profundidadeMm: 400, alturaMm: 2800, rotulo: 'P1' },
      { type: 'AddStructural', levelId, kind: 'VIGA', pontos: [point(0, 0), point(4000, 0)], larguraMm: 150, alturaMm: 400, baseMm: 2400 },
      { type: 'AddStructural', levelId, kind: 'LAJE', pontos: [point(0, 0), point(4000, 0), point(4000, 3000), point(0, 3000)], alturaMm: 120, baseMm: 2800 },
    ] as Command[]).model;
    const ifc = gerarIfc(m, OPC);
    const nomes = dosTipo(ifc, 'IFCELEMENTQUANTITY').map((e) => e.args[2]);
    expect(nomes).toEqual(expect.arrayContaining(["'Qto_ColumnBaseQuantities'", "'Qto_BeamBaseQuantities'", "'Qto_SlabBaseQuantities'"]));
    // Pilar 0,2×0,4×2,8 = 0,224 m³; viga 4×0,15×0,4 = 0,24 m³; laje 12×0,12 = 1,44 m³.
    expect(ifc).toContain("IFCQUANTITYVOLUME('NetVolume',$,$,0.224000,'");
    expect(ifc).toContain("IFCQUANTITYVOLUME('NetVolume',$,$,0.240000,'");
    expect(ifc).toContain("IFCQUANTITYVOLUME('NetVolume',$,$,1.440000,'");
    expect(ifc).toContain("IFCQUANTITYLENGTH('Depth',$,$,120.,$)");
    // Pset_ColumnCommon.LoadBearing = .T.
    expect(dosTipo(ifc, 'IFCPROPERTYSET').map((p) => p.args[2])).toContain("'Pset_ColumnCommon'");
  });
});

describe('IFC · o arquivo continua bem formado', () => {
  it('toda linha de dados é uma entidade com id próprio', () => {
    const base = casa();
    const m = applyBatch(base, [abertura(base.walls[0].id, 'door'), abertura(base.walls[2].id, 'window')]).model;
    const ifc = gerarIfc(m, OPC);
    const ids = new Set<string>();
    for (const linha of ifc.split('DATA;\n')[1].split('\nENDSEC;')[0].split('\n')) {
      expect(linha).toMatch(/^#\d+= IFC[A-Z0-9]+\(.*\);$/);
      const id = linha.split('=')[0];
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    // Toda referência `#n` aponta para uma entidade que existe.
    for (const ref of ifc.matchAll(/#(\d+)(?![\d=])/g)) {
      expect(ids.has(`#${ref[1]}`), `referência solta #${ref[1]}`).toBe(true);
    }
  });
});
