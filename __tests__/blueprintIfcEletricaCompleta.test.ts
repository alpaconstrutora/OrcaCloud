/**
 * IFC ELÉTRICO COMPLETO (E7.1 do roadmap elétrico, 29/09/2026) — sem bump.
 *
 * O que entrou: `Pset_OpuraEletrica` do circuito com ligação, fase, curva, DR,
 * IB e condutores (declarado × calculado × derivado, pelo sufixo); o do quadro
 * (tipo, DPS, Icn, demanda); `IfcCableSegment` por tipo e seção de condutor do
 * circuito, com o comprimento do quantitativo; o eletroduto como membro do
 * circuito; `Pset_ElectricalDeviceCommon` nos pontos (tensão declarada, terra
 * da tomada); e a opção de ESQUEMA — IFC4X3 põe o quadro como
 * `IfcDistributionBoard`, a classe exata, que o IFC4 não tem.
 *
 * O árbitro de "abre no visualizador" é o `web-ifc` pelo MESMO serviço do
 * visualizador do app (`services/ifcViewerService`): toda linha do arquivo tem
 * de ser lida, nos dois esquemas.
 */
import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO, agruparPorCondutor, applyBatch, applyCommand, computeQuantities, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { escaparParaStep, gerarIfc } from '../utils/blueprintIfc';
import { ROTULO_DO_CONDUTOR } from '../utils/blueprintKernel';

/** Sala 6 × 4; QDC trifásico com DPS e Icn; C1 (TUG, fase R, curva C, DR) e C2 (luz) com eletroduto. */
function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(base, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600, ligacao: 'FFF', tensaoV: 220, icnKa: 6 }).model;
  const q = m.quadros[0].id;
  m = applyCommand(m, { type: 'SetQuadroProps', quadroId: q, dps: { classe: 'II', inKa: 20, upKv: 1.5 } } as Command).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C1', ligacao: 'FN', tensaoV: 127, fase: 'R', curva: 'C', disjuntorA: 20, secaoMm2: 2.5 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C2', ligacao: 'FN', tensaoV: 127, fase: 'S' }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  m = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 25, idnMa: 30, polos: 2, circuitoIds: [c1] } as Command).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(3000, 75), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: c1 }).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: point(3000, 2000), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO', potenciaW: 100 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[1].id, circuitoId: c2 }).model;
  const tr = (a: [number, number, number], b: [number, number, number], ids: string[]): Command => ({ type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(a[0], a[1]), b: point(b[0], b[1]), cotaAMm: a[2], cotaBMm: b[2], bitolaMm: 25, circuitoIds: ids } as Command);
  m = applyBatch(m, [
    tr([75, 1000, 1600], [75, 1000, 2800], [c1, c2]),
    tr([75, 1000, 2800], [3000, 2000, 2800], [c1, c2]),
    tr([3000, 2000, 2800], [3000, 75, 2800], [c1]),
    tr([3000, 75, 2800], [3000, 75, 300], [c1]),
  ]).model;
  return m;
}

const OPC = { titulo: 'Casa', revisao: 1, hash: 'e'.repeat(64), data: new Date('2026-09-29T12:00:00Z') };
const linhas = (ifc: string) => ifc.split('DATA;\n')[1].split('\nENDSEC;')[0].split('\n');
/** As propriedades (nome → valor bruto) do Pset `nome` ligado ao produto `produto`. */
function pset(ifc: string, produto: string, nome: string): Map<string, string> {
  const ls = linhas(ifc);
  const porId = new Map(ls.map((l) => [l.split('=')[0], l]));
  for (const l of ls) {
    const m = /IFCRELDEFINESBYPROPERTIES\([^,]*,[^,]*,\$,\$,\((#\d+)\),(#\d+)\)/.exec(l);
    if (!m || m[1] !== produto) continue;
    const ps = porId.get(m[2]) ?? '';
    if (!ps.includes(`IFCPROPERTYSET(`) || !ps.includes(`'${nome}'`)) continue;
    const refs = /\(((?:#\d+,?)+)\)\);$/.exec(ps)?.[1].split(',') ?? [];
    return new Map(refs.map((r) => {
      const prop = porId.get(r) ?? '';
      const mm = /IFCPROPERTYSINGLEVALUE\('([^']+)',\$,(.*),\$\);$/.exec(prop);
      return [mm?.[1] ?? '', mm?.[2] ?? ''];
    }));
  }
  return new Map();
}
const idDe = (ifc: string, padrao: RegExp) => linhas(ifc).find((l) => padrao.test(l))?.split('=')[0] ?? '';

describe('IFC elétrico completo — o conteúdo', () => {
  it('⚠️ o circuito diz ligação, fase, curva, DR, IB e condutores — declarado, calculado e derivado pelo sufixo', () => {
    const ifc = gerarIfc(casa(), OPC);
    const c1 = idDe(ifc, /IFCDISTRIBUTIONCIRCUIT\([^,]*,[^,]*,'C1'/);
    const p = pset(ifc, c1, 'Pset_OpuraEletrica');
    expect(p.get('Ligacao_Declarada')).toBe("IFCLABEL('FN')");
    expect(p.get('Fase_Declarada')).toBe("IFCLABEL('R')");
    expect(p.get('Curva_Declarada')).toBe("IFCLABEL('C')");
    expect(p.get('DR')).toMatch(/^IFCLABEL\('.*25 A.*30 mA/);
    expect(p.get('IB_A_Calculada')).toBe('IFCREAL(4.700000)'); // 600 VA / 127 V, a uma casa
    expect(p.get('Condutores_Derivados')).toBe(`IFCLABEL('${escaparParaStep('F+N+T 2,5 mm²')}')`);
    expect(p.get('DisjuntorA_Declarado')).toBe('IFCINTEGER(20)');
  });

  it('o quadro diz tipo, ligação, DPS, Icn e a demanda calculada', () => {
    const ifc = gerarIfc(casa(), OPC);
    const q = idDe(ifc, /IFCFLOWCONTROLLER\([^,]*,[^,]*,'QDC'/);
    const p = pset(ifc, q, 'Pset_OpuraEletrica');
    expect(p.get('TipoDeQuadro')).toBe("IFCLABEL('QD')");
    expect(p.get('Ligacao_Declarada')).toBe("IFCLABEL('FFF')");
    expect(p.get('TensaoV_Declarada')).toBe('IFCINTEGER(220)');
    expect(p.get('DPS_Declarado')).toMatch(/^IFCLABEL\('DPS classe II/);
    expect(p.get('Icn_kA_Declarada')).toBe('IFCREAL(6.)');
    expect(p.get('DemandaVA_Calculada')).toBe('IFCREAL(700.)');
  });

  it('⚠️ um IfcCableSegment por tipo e seção de condutor do circuito, com o comprimento do QUANTITATIVO', () => {
    const m = casa();
    const ifc = gerarIfc(m, OPC);
    const cabos = linhas(ifc).filter((l) => l.includes('IFCCABLESEGMENT('));
    const quant = computeQuantities(m, POLITICA_PADRAO);
    let esperados = 0;
    for (const c of m.circuitos) {
      const grupos = agruparPorCondutor(quant.trechos.map((t) => ({ ...t, condutoresPorSecao: t.condutoresPorSecao.filter((x) => x.circuitoId === c.id) }))).filter((g) => g.comprimentoM > 0);
      esperados += grupos.length;
      for (const g of grupos) {
        const sec = g.secaoMm2 != null ? `${String(g.secaoMm2).replace('.', ',')} mm²` : 'sem seção';
        const nome = escaparParaStep(`${c.nome} · ${ROTULO_DO_CONDUTOR[g.tipo]} ${sec}`);
        const linha = cabos.find((l) => l.includes(`'${nome}'`))!;
        expect(linha, `${c.nome} ${g.tipo}`).toBeTruthy();
        expect(linha).toMatch(/\.CONDUCTORSEGMENT\.\);$/);
        // A quantidade: Length em mm = comprimento do quantitativo × 1000.
        const id = linha.split('=')[0];
        const rel = linhas(ifc).find((l) => l.includes('IFCRELDEFINESBYPROPERTIES(') && l.includes(`(${id})`) && linhas(ifc).find((x) => x.startsWith(l.split(',').pop()!.replace(');', '') + '='))?.includes('Qto_CableSegmentBaseQuantities'))!;
        const qto = linhas(ifc).find((x) => x.startsWith(rel.split(',').pop()!.replace(');', '') + '='))!;
        const qtd = linhas(ifc).find((x) => x.startsWith(/\(\((#\d+)\)\)\);$/.exec(qto)?.[1] ?? /\((#\d+)\)\);$/.exec(qto)![1]))!;
        expect(Number(/IFCQUANTITYLENGTH\('Length',\$,\$,([\d.E+-]+),/.exec(qtd)![1])).toBeCloseTo(g.comprimentoM * 1000, 3);
      }
    }
    expect(esperados).toBeGreaterThan(0);
    expect(cabos).toHaveLength(esperados);
  });

  it('o eletroduto é MEMBRO do circuito que passa por ele', () => {
    const ifc = gerarIfc(casa(), OPC);
    const c1 = idDe(ifc, /IFCDISTRIBUTIONCIRCUIT\([^,]*,[^,]*,'C1'/);
    const eletrodutos = linhas(ifc).filter((l) => l.includes('IFCCABLECARRIERSEGMENT(')).map((l) => l.split('=')[0]);
    expect(eletrodutos).toHaveLength(4);
    const grupos = linhas(ifc).filter((l) => l.includes('IFCRELASSIGNSTOGROUP(') && l.endsWith(`,$,${c1});`));
    const membros = grupos.flatMap((l) => /\(((?:#\d+,?)+)\),\$,#\d+\);$/.exec(l)![1].split(','));
    for (const e of eletrodutos) expect(membros).toContain(e); // os quatro levam C1
  });

  it('Pset_ElectricalDeviceCommon: a tensão DECLARADA do circuito e a terra da tomada; VOLT declarado só com elétrica', () => {
    const ifc = gerarIfc(casa(), OPC);
    const tomada = idDe(ifc, /IFCOUTLET\(/);
    const p = pset(ifc, tomada, 'Pset_ElectricalDeviceCommon');
    expect(p.get('RatedVoltage')).toBe('IFCELECTRICVOLTAGEMEASURE(127.)');
    expect(p.get('HasProtectiveEarth')).toBe('IFCBOOLEAN(.T.)');
    const luz = idDe(ifc, /IFCLIGHTFIXTURE\(/);
    expect(pset(ifc, luz, 'Pset_ElectricalDeviceCommon').has('HasProtectiveEarth')).toBe(false);
    expect(ifc).toContain("IFCSIUNIT(*,.ELECTRICVOLTAGEUNIT.,$,.VOLT.)");
    // Sem elétrica: nem a unidade (o arquivo de quem não tem elétrica não muda).
    const semEletrica = gerarIfc(applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model, OPC);
    expect(semEletrica).not.toContain('ELECTRICVOLTAGEUNIT');
  });

  it('esquema: IFC4 por padrão (quadro IfcFlowController); IFC4X3 declara o esquema e põe o quadro como IfcDistributionBoard', () => {
    const m = casa();
    const ifc4 = gerarIfc(m, OPC);
    expect(ifc4).toContain("FILE_SCHEMA(('IFC4'))");
    expect(ifc4).toContain('IFCFLOWCONTROLLER(');
    expect(ifc4).not.toContain('IFCDISTRIBUTIONBOARD(');
    const x3 = gerarIfc(m, { ...OPC, esquema: 'IFC4X3' });
    expect(x3).toContain("FILE_SCHEMA(('IFC4X3'))");
    expect(x3).not.toContain('IFCFLOWCONTROLLER(');
    expect(linhas(x3).find((l) => l.includes('IFCDISTRIBUTIONBOARD('))).toMatch(/'QDC',\$,\$,#\d+,#\d+,'Q-[^']+',\.DISTRIBUTIONBOARD\.\);$/);
    // Tirando o esquema e a classe do quadro, o resto é igual linha a linha.
    const norm = (s: string) => s.replace("'IFC4X3'", "'IFC4'").replace(/IFCDISTRIBUTIONBOARD\((.*),\$,(#\d+),(#\d+),('Q-[^']+'),\.DISTRIBUTIONBOARD\.\);/, 'IFCFLOWCONTROLLER($1,$,$2,$3,$4);');
    expect(norm(x3)).toBe(ifc4);
  });
});

describe('IFC elétrico completo — no visualizador (web-ifc pelo ifcViewerService)', () => {
  async function abrir(ifc: string) {
    const tipos = (await import('web-ifc')) as unknown as Record<string, number>;
    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    usarCaminhoDoWasm('');
    const api = (await obterApi()) as unknown as Record<string, (...a: unknown[]) => unknown>;
    const id = (api.OpenModel as (d: Uint8Array) => number)(new TextEncoder().encode(ifc));
    const ler = (tipo: number) => {
      const ids = (api.GetLineIDsWithType as (mm: number, t: number) => { size(): number; get(i: number): number })(id, tipo);
      return Array.from({ length: ids.size() }, (_, i) => (api.GetLine as (mm: number, e: number) => Record<string, unknown>)(id, ids.get(i)));
    };
    /** Lê TODA linha do arquivo; devolve as que falharam. */
    const falhas = () => {
      const todas = (api.GetAllLines as (mm: number) => { size(): number; get(i: number): number })(id);
      const ruins: string[] = [];
      for (let i = 0; i < todas.size(); i++) {
        try {
          (api.GetLine as (mm: number, e: number) => unknown)(id, todas.get(i));
        } catch (e) {
          ruins.push(`#${todas.get(i)}: ${String(e).slice(0, 60)}`);
        }
      }
      return { lidas: todas.size(), ruins };
    };
    const schema = (api.GetModelSchema as (mm: number) => string)(id);
    return { tipos, ler, falhas, schema, fechar: () => (api.CloseModel as (mm: number) => void)(id) };
  }

  it('⚠️ PRONTO QUANDO: IFC4 — toda linha do arquivo é lida; cabos e circuito chegam nos campos certos', async () => {
    const a = await abrir(gerarIfc(casa(), OPC));
    expect(a.schema).toBe('IFC4');
    const { lidas, ruins } = a.falhas();
    expect(lidas).toBeGreaterThan(200);
    expect(ruins).toEqual([]);
    const cabos = a.ler(a.tipos.IFCCABLESEGMENT);
    expect(cabos.length).toBeGreaterThan(0);
    for (const c of cabos) {
      expect(String((c.Name as { value?: string }).value)).toMatch(/^C[12] · /);
      expect(String((c.PredefinedType as { value?: string }).value)).toBe('CONDUCTORSEGMENT');
    }
    expect(a.ler(a.tipos.IFCFLOWCONTROLLER)).toHaveLength(1);
    a.fechar();
  });

  it('⚠️ PRONTO QUANDO: IFC4X3 — o visualizador lê o esquema, TODAS as linhas, e o quadro como IfcDistributionBoard', async () => {
    const a = await abrir(gerarIfc(casa(), { ...OPC, esquema: 'IFC4X3' }));
    expect(a.schema).toBe('IFC4X3');
    const { ruins } = a.falhas();
    expect(ruins).toEqual([]);
    const quadros = a.ler(a.tipos.IFCDISTRIBUTIONBOARD);
    expect(quadros).toHaveLength(1);
    expect((quadros[0].Name as { value?: string }).value).toBe('QDC');
    expect(String((quadros[0].PredefinedType as { value?: string }).value)).toBe('DISTRIBUTIONBOARD');
    expect(a.ler(a.tipos.IFCWALL)).toHaveLength(4);
    a.fechar();
  });
});
