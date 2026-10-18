/**
 * F11 da casa automática (15/10/2026) — AS SAÍDAS: a casa gerada (`plano.resultado`) alimenta, sem nenhuma adaptação,
 * o que o app já produz de qualquer planta: o quantitativo e as medidas do orçamento (concreto, aço, formas, tubos,
 * eletroduto, condutor, quadro, DR, DPS, splits, telhado), a planilha, o DXF, o IFC e a prancha em PDF. Se uma saída
 * não enxerga uma disciplina da casa, é aqui que aparece.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { applyBatch, applyCommand, computeQuantities, emptyModel, point, POLITICA_PADRAO, type BlueprintModel, type Command, type Quantitativos } from '../utils/blueprintKernel';
import { medirTerreno } from '../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { planejarCasa } from '../utils/blueprintCasaAutomatica';
import { PROGRAMA_CURTO_PADRAO } from '../utils/blueprintPrograma';
import { HIPOTESES_HIDRO_PADRAO } from '../utils/blueprintMemorialHidro';
import { modelosDoCatalogo } from '../utils/blueprintSelecaoClimatizacao';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../utils/blueprintClimatizacao';
import { resumoDasMedidas } from '../utils/blueprintBudget';
import { armaduraDoModelo, hipotesesDeArmaduraDaColuna, type ArmaduraQuantificada } from '../utils/blueprintArmadura';
import { abasDoQuantitativo } from '../utils/blueprintPlanilha';
import { gerarDxf } from '../utils/blueprintDxf';
import { gerarIfc } from '../utils/blueprintIfc';
import { montarPdf } from '../services/blueprintExportService';
import { PAPEIS } from '../utils/blueprintExport';

// A casa inteira é gerada UMA vez (~1 s) e todas as saídas leem dela.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let casa: BlueprintModel;
let levelId: string;
let q: Quantitativos;
let armadura: ArmaduraQuantificada;

beforeAll(() => {
  const b = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  levelId = b.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: string): Command => ({ type: 'AddBoundary', levelId, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel }) as Command;
  const lote = applyBatch(b, [d(0, 0, 12000, 0, 'FRENTE'), d(12000, 0, 12000, 30000, 'LATERAL_DIREITA'), d(12000, 30000, 0, 30000, 'FUNDOS'), d(0, 30000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  const plano = planejarCasa(lote, {
    levelId,
    ctx: { terreno: medirTerreno(lote.boundaries), limites: lote.boundaries, recuosBase: { FRENTE: 3000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 }, zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60 } },
    curto: PROGRAMA_CURTO_PADRAO,
    rotacaoNorteDeg: null,
    latitudeGraus: -19.9,
    hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } },
    modelosDeClimatizacao: modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades }))),
    climatizacao: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
  });
  casa = plano.resultado;
  q = computeQuantities(casa, POLITICA_PADRAO);
  armadura = armaduraDoModelo(casa, q, hipotesesDeArmaduraDaColuna({}));
});

describe('a casa automática nas saídas do app (F11)', () => {
  it('o orçamento: cada medida que a casa produz sai com quantidade (o de-para do orçamento lê daqui)', () => {
    const medida = new Map(resumoDasMedidas(q, { armadura }).map((x) => [x.medidaId, x.quantidade]));
    const devemSair = [
      // arquitetura
      'AREA_CONSTRUIDA', 'AREA_PISO', 'VOLUME_ALVENARIA', 'AREA_PAREDE_DUAS_FACES', 'CONTAGEM_PORTAS', 'CONTAGEM_JANELAS', 'AREA_ESQUADRIAS',
      // estrutura: concreto, forma e aço
      'VOLUME_CONCRETO_PILAR', 'VOLUME_CONCRETO_VIGA', 'VOLUME_CONCRETO_LAJE', 'VOLUME_CONCRETO_FUNDACAO',
      'AREA_FORMA_PILAR', 'AREA_FORMA_VIGA', 'AREA_FORMA_LAJE', 'COMPRIMENTO_ESTACA', 'PESO_ACO_TOTAL',
      // cobertura
      'AREA_TELHADO', 'COMPRIMENTO_CALHA',
      // hidráulica
      'COMPRIMENTO_TUBO_AGUA_FRIA', 'COMPRIMENTO_TUBO_AGUA_QUENTE', 'COMPRIMENTO_TUBO_ESGOTO', 'COMPRIMENTO_TUBO_PLUVIAL', 'CONTAGEM_PONTOS_HIDRAULICOS', 'CONTAGEM_CONEXOES',
      // elétrica
      'COMPRIMENTO_ELETRODUTO', 'COMPRIMENTO_CONDUTOR', 'CONTAGEM_PONTOS_ELETRICOS', 'CONTAGEM_QUADROS', 'CONTAGEM_DISJUNTORES', 'CONTAGEM_DR', 'CONTAGEM_DPS',
      // climatização
      'COMPRIMENTO_TUBO_FRIGORIGENA', 'COMPRIMENTO_TUBO_DRENO_AC', 'CONTAGEM_EQUIPAMENTOS_CLIMATIZACAO',
    ];
    const vazias = devemSair.filter((id) => !((medida.get(id) ?? 0) > 0));
    expect(vazias).toEqual([]);
    expect(medida.get('CONTAGEM_QUADROS')).toBe(1);
    expect(medida.get('CONTAGEM_DPS')).toBe(1);
  });

  it('a planilha do quantitativo: as abas de estrutura, armadura e instalações com linhas', () => {
    const abas = abasDoQuantitativo(q, { titulo: 'Casa automática', revisao: 1, hash: 'h', kernelVersion: 'teste' } as Parameters<typeof abasDoQuantitativo>[1], armadura);
    const linhas = (nome: string) => {
      const a = abas.find((x) => x.nome === nome) as unknown as { linhas?: unknown[]; rows?: unknown[] } | undefined;
      return (a?.linhas ?? a?.rows ?? []).length;
    };
    for (const nome of ['Totais', 'Ambientes', 'Paredes', 'Aberturas', 'Estrutura', 'Armadura', 'Instalações', 'Telhado']) expect(linhas(nome), nome).toBeGreaterThan(0);
  });

  it('o DXF: camadas e entidades de todas as disciplinas, sem exceção', () => {
    const dxf = gerarDxf(casa, { titulo: 'Casa automática', revisao: 1, hash: 'h' });
    const ent: Record<string, number> = {};
    const ls = dxf.split(/\r?\n/);
    for (let i = 0; i + 1 < ls.length; i++) if (ls[i].trim() === '0') ent[ls[i + 1].trim()] = (ent[ls[i + 1].trim()] ?? 0) + 1;
    expect(ent.EOF).toBe(1);
    expect(ent.LAYER).toBeGreaterThan(20);
    expect(ent.POLYLINE).toBeGreaterThan(50);
    expect(ent.TEXT).toBeGreaterThan(50);
  });

  it('o IFC: cada classe da casa — arquitetura, estrutura, cobertura, água, esgoto, elétrica e climatização', () => {
    const ifc = gerarIfc(casa, { titulo: 'Casa automática', revisao: 1, hash: 'a'.repeat(64), data: new Date('2026-10-15T12:00:00Z'), studyId: 'casa-0001' } as Parameters<typeof gerarIfc>[1]);
    const tipos: Record<string, number> = {};
    for (const m of ifc.matchAll(/^#\d+\s*=\s*(IFC[A-Z0-9]+)\(/gm)) tipos[m[1]] = (tipos[m[1]] ?? 0) + 1;
    const devemSair = [
      'IFCWALL', 'IFCDOOR', 'IFCWINDOW', 'IFCSPACE', 'IFCROOF',
      'IFCCOLUMN', 'IFCBEAM', 'IFCSLAB', 'IFCFOOTING', 'IFCPILE',
      'IFCPIPESEGMENT', 'IFCPIPEFITTING', 'IFCSANITARYTERMINAL', 'IFCTANK',
      'IFCCABLECARRIERSEGMENT', 'IFCCABLESEGMENT', 'IFCOUTLET', 'IFCLIGHTFIXTURE', 'IFCSWITCHINGDEVICE', 'IFCDISTRIBUTIONCIRCUIT',
      'IFCUNITARYEQUIPMENT',
    ];
    expect(devemSair.filter((t) => !(tipos[t] > 0))).toEqual([]);
    // F26: o muro sai como IfcWall também (a alvenaria, ou a mureta do misto) — as paredes mais os muros que têm alvenaria.
    expect(tipos.IFCWALL).toBe(casa.walls.length + (casa.muros ?? []).filter((m) => m.tipo !== 'GRADE').length);
    expect((casa.muros ?? []).length).toBeGreaterThan(0);
    expect(tipos.IFCCOLUMN).toBe(casa.structures.filter((s) => s.kind === 'PILAR').length);
  });

  it('a prancha em PDF (A3, 1:100)', async () => {
    const [pdf] = montarPdf(casa, { levelId, denominador: 100, papel: PAPEIS[1], titulo: 'Casa automática', revisao: 1, hash: 'h' } as Parameters<typeof montarPdf>[1]);
    const bytes = new Uint8Array(await pdf.blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(50_000);
  });
});
