/**
 * TELHADO nas SAÍDAS — DXF, IFC, planilha, de-para do orçamento, diff e PDF da
 * elevação (Fase 4 do plano do telhado).
 *
 * O número que atravessa todas elas é o mesmo: a água de 6 × 4 m a 30% tem
 * 24,00 m² em planta e 25,056736 m² de telha. Cada saída tem de dizer os dois,
 * e nenhuma pode dar só o menor.
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
import { gerarDxf } from '../utils/blueprintDxf';
import { COBERTURA_IFC, gerarIfc } from '../utils/blueprintIfc';
import { abasDoQuantitativo, COBERTURA_PLANILHA } from '../utils/blueprintPlanilha';
import {
  MEDIDA_POR_ID,
  gerarLancamentos,
  type MapeamentoOrcamento,
} from '../utils/blueprintBudget';
import { diffSnapshots } from '../utils/blueprintDiff';
import { projetarElevacao } from '../utils/blueprintElevation';
import {
  DesenhistaDeProva,
  PAPEIS,
  desenharElevacao,
  enquadrarElevacao,
} from '../utils/blueprintExport';
import type { SinapiItem } from '../types/budget';
import { SinapiType } from '../types/budget';

const H = 2800;
const RETANGULO = [point(0, 0), point(6000, 0), point(6000, 4000), point(0, 4000)];

function comNivel(): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H });
  return { model: r.model, levelId: r.model.levels[0].id };
}

const parede = (levelId: string, ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: H,
});

/** Casa 6 × 4 com UMA água de 30% apoiada no topo da parede (2,80 m). */
function casaComAgua(pontos = RETANGULO, beiralIndex = 0): BlueprintModel {
  const { model, levelId } = comNivel();
  return applyBatch(model, [
    parede(levelId, 0, 0, 6000, 0),
    parede(levelId, 6000, 0, 6000, 4000),
    parede(levelId, 6000, 4000, 0, 4000),
    parede(levelId, 0, 4000, 0, 0),
    { type: 'AddAgua', levelId, pontos, inclinacaoPct: 30, baseMm: H, beiralIndex },
  ] as Command[]).model;
}

const OPC = {
  titulo: 'Casa',
  revisao: 1,
  hash: 'a'.repeat(64),
  data: new Date('2026-09-04T12:00:00Z'),
  studyId: '11111111-2222-4333-8444-555555555555',
};

/** Linhas de dados do STEP: `[id, entidade, argumentos de topo]`. */
function entidades(ifc: string): { id: string; tipo: string; args: string[] }[] {
  return ifc
    .split('DATA;\n')[1]
    .split('\nENDSEC;')[0]
    .split('\n')
    .map((linha) => {
      const m = /^(#\d+)= ([A-Z0-9]+)\((.*)\);$/.exec(linha)!;
      return { id: m[1], tipo: m[2], args: argsDeTopo(m[3]) };
    });
}
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

// ─────────────────────────────────────────────────────────────────────────────

describe('telhado · DXF', () => {
  it('a água sai em PLANTA-TELHADO com o rótulo da inclinação e a seta', () => {
    const dxf = gerarDxf(casaComAgua(), { titulo: 'x', revisao: 1, hash: 'h' });
    expect(dxf).toContain('PLANTA-TELHADO');
    expect(dxf).toContain('TELHADO 30%');
    // A camada está DECLARADA na tabela, não só usada.
    expect(dxf).toMatch(/LAYER[\s\S]*PLANTA-TELHADO/);
  });

  it('na elevação, o telhado é um polígono em ELEVACAO-TELHADO', () => {
    const m = casaComAgua();
    const dxf = gerarDxf(m, {
      titulo: 'x',
      revisao: 1,
      hash: 'h',
      elevacoes: [projetarElevacao(m, { direcao: 'FRENTE' })],
    });
    expect(dxf).toContain('ELEVACAO-TELHADO');
  });

  it('planta sem telhado não ganha entidade nenhuma nas camadas novas', () => {
    const { model, levelId } = comNivel();
    const so = applyCommand(model, parede(levelId, 0, 0, 6000, 0)).model;
    const dxf = gerarDxf(so, { titulo: 'x', revisao: 1, hash: 'h' });
    // Declarada na tabela (todas são), mas sem POLYLINE nela.
    expect(dxf).not.toMatch(/POLYLINE\s+8\s+PLANTA-TELHADO/);
    expect(dxf).not.toContain('TELHADO 30%');
  });
});

describe('telhado · IFC', () => {
  it('IfcRoof por pavimento agregando uma IfcSlab .ROOF. por água — 9 atributos cada', () => {
    const ifc = gerarIfc(casaComAgua(), OPC);
    const roofs = dosTipo(ifc, 'IFCROOF');
    const slabs = dosTipo(ifc, 'IFCSLAB');
    expect(roofs).toHaveLength(1);
    expect(slabs).toHaveLength(1);
    expect(roofs[0].args).toHaveLength(9);
    expect(slabs[0].args).toHaveLength(9);
    expect(slabs[0].args[8]).toBe('.ROOF.');
    // Uma água só, inclinada: SHED. Duas ou mais: NOTDEFINED — não se adivinha.
    expect(roofs[0].args[8]).toBe('.SHED_ROOF.');

    // O roof está no PAVIMENTO; a slab está no ROOF — e não nos dois.
    const contido = dosTipo(ifc, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')[0].args[4];
    expect(contido).toContain(roofs[0].id);
    expect(contido).not.toContain(slabs[0].id);
    const agregado = dosTipo(ifc, 'IFCRELAGGREGATES').find((r) => r.args[4] === roofs[0].id)!;
    expect(agregado.args[5]).toContain(slabs[0].id);
  });

  it('Pset_RoofCommon traz AS DUAS áreas; Pset_SlabCommon traz o PitchAngle em radiano', () => {
    const ifc = gerarIfc(casaComAgua(), OPC);
    // 24,00 projetados; 24 × √1,09 = 25,056736 reais; atan(0,3) = 0,291457 rad.
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('ProjectedArea',$,IFCAREAMEASURE(24.),$)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('TotalArea',$,IFCAREAMEASURE(25.056736),$)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('PitchAngle',$,IFCPLANEANGLEMEASURE(0.291457),$)");
    expect(dosTipo(ifc, 'IFCPROPERTYSET').map((p) => p.args[2])).toEqual(
      expect.arrayContaining(["'Pset_RoofCommon'", "'Pset_SlabCommon'"]),
    );
    // Qto: a área da laje inclinada é a REAL, com a fórmula junto.
    expect(ifc).toContain("IFCQUANTITYAREA('GrossArea',$,$,25.056736,'");
    expect(ifc).toContain("IFCQUANTITYLENGTH('Depth',$,$,120.,$)");
  });

  it('o sólido é extrudado ao longo da NORMAL do plano, e o anel horário dá a MESMA normal', () => {
    // Beiral em y = 0, subindo em +y a 30%: normal = (0, −0,3, 1)/√1,09.
    const antiHorario = gerarIfc(casaComAgua(), OPC);
    expect(antiHorario).toContain('IFCDIRECTION((0.,-0.287348,0.957826))');

    // O MESMO retângulo no sentido horário, com o beiral no mesmo lado (índice 3).
    const horario = gerarIfc(
      casaComAgua([point(0, 0), point(0, 4000), point(6000, 4000), point(6000, 0)], 3),
      OPC,
    );
    expect(horario).toContain('IFCDIRECTION((0.,-0.287348,0.957826))');
    // E as áreas batem — é a prova de que o perfil não saiu espelhado/degenerado.
    expect(horario).toContain("IFCPROPERTYSINGLEVALUE('TotalArea',$,IFCAREAMEASURE(25.056736),$)");
  });

  it('a cobertura diz que TEM telhado, e o que continua de fora', () => {
    const texto = COBERTURA_IFC.join(' ');
    expect(texto).toMatch(/CONTÉM telhado: um IfcRoof/);
    expect(texto).toMatch(/NÃO CONTÉM escada, forro/);
    expect(texto).not.toMatch(/NÃO CONTÉM telhado/);
  });

  it('planta sem telhado não tem IfcRoof', () => {
    const { model, levelId } = comNivel();
    const so = applyCommand(model, parede(levelId, 0, 0, 6000, 0)).model;
    expect(gerarIfc(so, OPC)).not.toContain('IFCROOF(');
  });
});

describe('telhado · planilha', () => {
  const ctx = { titulo: 'Casa', revisao: 1, hash: 'h', kernelVersion: 'k' };

  it('ganha a aba Telhado e as DUAS áreas nos totais', () => {
    const abas = abasDoQuantitativo(computeQuantities(casaComAgua()), ctx);
    const telhado = abas.find((a) => a.nome === 'Telhado')!;
    expect(telhado).toBeTruthy();
    expect(telhado.linhas).toHaveLength(2);
    expect(telhado.linhas[1][0]).toBe('Água 1');
    expect(telhado.linhas[1][3]).toBe(25.06);
    expect(telhado.linhas[1][4]).toBe(24);

    const totais = abas.find((a) => a.nome === 'Totais')!;
    const linha = totais.linhas.find((l) => l[0] === 'Área de telhado (real, inclinada)')!;
    expect(linha[1]).toBe(25.06);
    expect(totais.linhas.find((l) => l[0] === 'Área de telhado (projetada em planta)')![1]).toBe(24);
    expect(COBERTURA_PLANILHA.join(' ')).toMatch(/SUPERFÍCIE INCLINADA/);
  });

  it('sem telhado, sem aba — aba só existe se tiver linha', () => {
    const { model, levelId } = comNivel();
    const so = applyCommand(model, parede(levelId, 0, 0, 6000, 0)).model;
    const abas = abasDoQuantitativo(computeQuantities(so), ctx);
    expect(abas.find((a) => a.nome === 'Telhado')).toBeUndefined();
  });
});

describe('telhado · de-para do orçamento', () => {
  const CTX = { studyId: 'estudo-1', studyName: 'Casa', snapshotId: 's', snapshotHash: 'h'.repeat(16), revision: 1 };
  const item = (unit: string): SinapiItem => ({
    code: '94210',
    description: 'Telha cerâmica',
    unit,
    price: 100,
    type: SinapiType.COMPOSITION,
    category: 'Material',
  });
  const mapa = (medida: string): MapeamentoOrcamento => ({
    id: 'm1',
    organization_id: 'org',
    medida,
    item_code: '94210',
    phase: 'Cobertura',
    budget_group: 'Telhado',
    agrupamento: 'TOTAL',
    filtro_ambiente: [],
    active: true,
  });

  it('as duas medidas existem, em m², no escopo TELHADO', () => {
    expect(MEDIDA_POR_ID.get('AREA_TELHADO')?.dimensao).toBe('M2');
    expect(MEDIDA_POR_ID.get('AREA_TELHADO')?.escopo).toBe('TELHADO');
    expect(MEDIDA_POR_ID.get('AREA_TELHADO_PROJETADA')?.dimensao).toBe('M2');
  });

  it('AREA_TELHADO manda a área REAL para a telha — e a projetada, só se pedida', () => {
    const q = computeQuantities(casaComAgua());
    const real = gerarLancamentos(q, [{ mapeamento: mapa('AREA_TELHADO'), item: item('M2') }], CTX);
    expect(real.divergencias).toHaveLength(0);
    expect(real.entries).toHaveLength(1);
    expect(real.entries[0].quantity).toBeCloseTo(25.0567356, 4);

    const projetada = gerarLancamentos(
      q,
      [{ mapeamento: mapa('AREA_TELHADO_PROJETADA'), item: item('M2') }],
      CTX,
    );
    expect(projetada.entries[0].quantity).toBeCloseTo(24, 6);
  });

  it('A TRAVA DE UNIDADE vale para o telhado: item por metro é recusado', () => {
    const q = computeQuantities(casaComAgua());
    const r = gerarLancamentos(q, [{ mapeamento: mapa('AREA_TELHADO'), item: item('M') }], CTX);
    expect(r.entries).toHaveLength(0);
    expect(r.divergencias).toHaveLength(1);
  });
});

describe('telhado · diff', () => {
  it('adicionar, inclinar e mover a água viram frases próprias', () => {
    const { model, levelId } = comNivel();
    const antes = applyCommand(model, parede(levelId, 0, 0, 6000, 0)).model;
    const comAgua = applyCommand(antes, {
      type: 'AddAgua', levelId, pontos: RETANGULO, inclinacaoPct: 30, baseMm: H,
    }).model;

    const d1 = diffSnapshots(antes, comAgua);
    expect(d1.alteracoes.filter((a) => a.tipo === 'TELHADO_ADICIONADO')).toHaveLength(1);
    expect(d1.alteracoes[0].descricao).toContain('25,06 m²');
    expect(d1.alteracoes[0].descricao).toContain('(30%)');

    const inclinada = applyCommand(comAgua, {
      type: 'SetAguaProps', aguaId: comAgua.roofs[0].id, inclinacaoPct: 40,
    }).model;
    const d2 = diffSnapshots(comAgua, inclinada);
    expect(d2.alteracoes).toHaveLength(1);
    expect(d2.alteracoes[0].tipo).toBe('TELHADO_INCLINACAO');
    expect(d2.alteracoes[0].descricao).toContain('30% → 40%');

    const movida = applyCommand(comAgua, {
      type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [],
      aguaIds: [comAgua.roofs[0].id], delta: point(500, 0), manterJuncoes: false,
    }).model;
    const d3 = diffSnapshots(comAgua, movida);
    expect(d3.alteracoes.map((a) => a.tipo)).toEqual(['TELHADO_MOVIDO']);

    expect(diffSnapshots(comAgua, movida).alteracoes.filter((a) => a.tipo === 'TELHADO_REMOVIDO')).toHaveLength(0);
    expect(diffSnapshots(comAgua, antes).alteracoes.map((a) => a.tipo)).toEqual(['TELHADO_REMOVIDO']);
  });
});

describe('telhado · PDF da elevação', () => {
  it('a água entra como polígono de preenchimento, além das paredes', () => {
    const m = casaComAgua();
    const proj = projetarElevacao(m, { direcao: 'FRENTE' });
    const enq = enquadrarElevacao(proj, 100, PAPEIS[0]);
    const d = new DesenhistaDeProva();
    desenharElevacao(d, proj, { denominador: 100, papel: PAPEIS[0], titulo: 'Casa', revisao: 1, hash: 'h' }, enq);
    // 4 paredes + 1 água.
    const poligonos = d.chamadas.filter((c) => c.tipo === 'poligono');
    expect(poligonos).toHaveLength(5);
  });
});
