/**
 * CLIMATIZAÇÃO E10.1 (07/10/2026): o IFC da climatização — exportar com as
 * classes certas (o joelho do DUTO como IfcDuctFitting com bolsa retangular; a
 * curva da LINHA não sai: o cobre é curvado), o par líquido/sucção como dois
 * sólidos com o envelope do isolamento, o Pset_OpuraClimatizacao — e IMPORTAR
 * de volta pelo web-ifc (molde do incêndio E9.3): a ida e volta preserva tipo,
 * posição, cota, capacidade, vazão, os diâmetros, o isolamento, a seção do duto
 * e o SISTEMA (evaporadora → condensadora), em IFC4 e em IFC4X3.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { gerarIfc, parDaLinha, type OpcoesIfc } from '../utils/blueprintIfc';
import { comandosDaClimatizacao, religarSistemasImportados, tipoDoPontoDeClimatizacaoIfc, traduzirClimatizacao } from '../utils/ifcParaKernel';

/**
 * Um pavimento com: split (condensadora 12.000 + evaporadora 12.000 ligada a ela), a linha
 * Ø6/10 isol. 9 em L (com uma curva), o dreno, um duto 400×250 isol. 25 em L (um joelho de
 * duto), um difusor de 300 m³/h, uma condensadora VRF e um derivador; e, para NÃO entrar,
 * um tubo de água, um de esgoto e a reserva de lugar antiga (componente CONDENSADORA).
 */
function casa(): BlueprintModel {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m0.levels[0].id;
  let m = applyCommand(m0, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'Condensadora 12k', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(0, 0), cotaMm: 300, capacidadeBtuH: 12000 } as Command).model;
  const cd = m.terminais![0].id;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'VRF', tipoHidraulico: 'CONDENSADORA_VRF', at: point(20000, 0), cotaMm: 600, capacidadeBtuH: 48000 } as Command).model;
  const vrf = m.terminais![1].id;
  const tr = (disciplina: string, a: [number, number], b: [number, number], ca: number, cb: number, bitola: number, extra: Record<string, unknown> = {}): Command =>
    ({ type: 'AddTrecho', levelId: t, disciplina, a: point(...a), b: point(...b), cotaAMm: ca, cotaBMm: cb, bitolaMm: bitola, ...extra }) as Command;
  return applyBatch(m, [
    { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'Hi-wall 12k', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(3000, 0), cotaMm: 2200, capacidadeBtuH: 12000, condensadoraId: cd } as Command,
    { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', tipoHidraulico: 'DIFUSOR', at: point(8000, 6000), cotaMm: 2600, vazaoM3h: 300 } as Command,
    { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'Derivador', tipoHidraulico: 'DERIVADOR_VRF', at: point(22000, 3000), cotaMm: 2500, condensadoraId: vrf } as Command,
    tr('FRIGORIGENA', [0, 1000], [5000, 1000], 2500, 2500, 6, { bitolaSuccaoMm: 10, isolamentoMm: 9 }),
    tr('FRIGORIGENA', [5000, 1000], [5000, 3000], 2500, 2500, 6, { bitolaSuccaoMm: 10, isolamentoMm: 9 }),
    tr('DRENO_AC', [0, 2000], [3000, 2000], 2200, 2150, 25),
    tr('MECANICA', [0, 4000], [6000, 4000], 2600, 2600, 400, { alturaDutoMm: 250, isolamentoMm: 25 }),
    tr('MECANICA', [6000, 4000], [6000, 7000], 2600, 2600, 400, { alturaDutoMm: 250, isolamentoMm: 25 }),
    tr('AGUA_FRIA', [0, 9000], [3000, 9000], 2200, 2200, 25),
    tr('ESGOTO', [0, 10000], [3000, 10000], 400, 370, 100),
    { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(15000, 9000) } as Command,
  ]).model;
}
const opcoes = (extra: Partial<OpcoesIfc> = {}): OpcoesIfc => ({ titulo: 'x', revisao: 1, hash: 'a'.repeat(64), data: new Date('2026-10-07T12:00:00Z'), ...extra });

async function lerDeVolta(m: BlueprintModel, extra: Partial<OpcoesIfc> = {}) {
  const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
  usarCaminhoDoWasm('');
  const api = await obterApi();
  const { lerClimatizacaoParametrica, lerIncendioParametrico } = await import('../services/ifcParametricoService');
  const id = api.OpenModel(new TextEncoder().encode(gerarIfc(m, opcoes(extra))));
  try {
    return { clima: await lerClimatizacaoParametrica(id), incendio: await lerIncendioParametrico(id) };
  } finally {
    api.CloseModel(id);
  }
}

describe('climatização E10.1 · exportar', () => {
  it('o joelho do DUTO sai IfcDuctFitting com bolsa retangular; a curva da LINHA não sai; o derivador é o único IfcPipeFitting', () => {
    const ifc = gerarIfc(casa(), opcoes());
    const fittings = ifc.match(/= ?IFCDUCTFITTING\([^\n]*/g) ?? [];
    // O STEP codifica ° e × (\X2\…\X0\): o que se confere é o joelho .BEND. e a medida 400 e 250 no nome.
    expect(fittings.some((l) => /Joelho 90/.test(l) && /400.*250/.test(l) && /\.BEND\./.test(l))).toBe(true);
    const tubos = ifc.match(/= ?IFCPIPEFITTING\([^\n]*/g) ?? [];
    expect(tubos).toHaveLength(1);
    expect(tubos[0]).toMatch(/'DERIVADOR_VRF'/);
    // A bolsa retangular: 1,1 × (400 × 250).
    expect(ifc).toMatch(/IFCRECTANGLEPROFILEDEF\(\.AREA\.,\$,#\d+,440\.,275\.\)/);
  });

  it('o envelope do isolamento: o duto 400×250 isol. 25 sai 450×300; o par da linha são dois círculos lado a lado, simétricos', () => {
    const ifc = gerarIfc(casa(), opcoes());
    expect(ifc).toMatch(/IFCRECTANGLEPROFILEDEF\(\.AREA\.,\$,#\d+,450\.,300\.\)/);
    expect(parDaLinha(6, 10, 9)).toEqual({ raios: [12, 14], deslocamentos: [-19, 19] });
    expect(ifc).toMatch(/IFCCIRCLEPROFILEDEF\(\.AREA\.,\$,#\d+,12\.\)/);
    expect(ifc).toMatch(/IFCCIRCLEPROFILEDEF\(\.AREA\.,\$,#\d+,14\.\)/);
  });

  it('o Pset_OpuraClimatizacao: declarado (capacidade, vazão, a condensadora, sucção, isolamento, altura), derivado (o número) e — com as premissas — o calculado', () => {
    const m = casa();
    const ifc = gerarIfc(m, opcoes());
    for (const k of ["'CapacidadeBtuH_Declarada',$,IFCINTEGER(12000)", "'VazaoM3h_Declarada',$,IFCREAL(300.)", "'Condensadora_Declarada',$,IFCLABEL('CD-1')", "'Numero_Derivado',$,IFCLABEL('EV-1')", "'BitolaSuccaoMm_Declarada',$,IFCINTEGER(10)", "'IsolamentoMm_Declarado',$,IFCINTEGER(25)", "'AlturaDutoMm_Declarada',$,IFCINTEGER(250)"]) expect(ifc).toContain(k);
    // Sem as premissas, nenhum calculado (o texto de cobertura do arquivo cita o sufixo — por isso a propriedade, não o sufixo).
    expect(ifc).not.toMatch(/'(CargaDoAmbienteBtuH|Atende|VazaoM3h)_Calculada'/);
    const evap = m.terminais!.find((t) => t.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    const comCalc = gerarIfc(m, opcoes({ resultadosDeClimatizacao: new Map([[evap.id, { cargaDoAmbienteBtuH: 9876.4, atende: true }]]) }));
    expect(comCalc).toContain("'CargaDoAmbienteBtuH_Calculada',$,IFCINTEGER(9876)");
    expect(comCalc).toContain("'Atende_Calculada',$,IFCBOOLEAN(.T.)");
  });
});

describe('climatização E10.1 · os atributos chegam no CAMPO CERTO (web-ifc — o árbitro destas classes, sem IFC de MEP ao alcance)', () => {
  for (const esquema of ['IFC4', 'IFC4X3'] as const) {
    it(`${esquema}: Name, ObjectType e PredefinedType de cada classe da climatização`, async () => {
      const mod = (await import('web-ifc')) as unknown as Record<string, unknown> & { default?: Record<string, unknown> };
      const tipos = (mod.IfcAPI ? mod : mod.default) as Record<string, number>;
      const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
      usarCaminhoDoWasm('');
      const api = (await obterApi()) as unknown as Record<string, (...a: unknown[]) => unknown>;
      const id = (api.OpenModel as (d: Uint8Array) => number)(new TextEncoder().encode(gerarIfc(casa(), opcoes({ esquema }))));
      try {
        const v = (x: unknown) => (x as { value?: unknown } | undefined)?.value;
        const ler = (tipo: string) => {
          const ids = (api.GetLineIDsWithType as (m: number, t: number) => { size(): number; get(i: number): number })(id, tipos[tipo]);
          return Array.from({ length: ids.size() }, (_, i) => (api.GetLine as (m: number, e: number) => Record<string, unknown>)(id, ids.get(i)));
        };
        const resumo = (tipo: string) => ler(tipo).map((x) => `${v(x.ObjectType) ?? '$'}|${v(x.PredefinedType)}`).sort();
        expect(resumo('IFCDUCTFITTING')).toEqual(['$|BEND']);
        expect(resumo('IFCPIPEFITTING')).toEqual(['DERIVADOR_VRF|JUNCTION']);
        expect(resumo('IFCAIRTERMINAL')).toEqual(['DIFUSOR|DIFFUSER']);
        // A reserva de lugar antiga (componente CONDENSADORA) também é IfcUnitaryEquipment — o ObjectType a separa.
        expect(resumo('IFCUNITARYEQUIPMENT')).toEqual(['CONDENSADORA_SPLIT|SPLITSYSTEM', 'CONDENSADORA_VRF|AIRCONDITIONINGUNIT', 'CONDENSADORA|SPLITSYSTEM', 'EVAPORADORA_HI_WALL|SPLITSYSTEM']);
        expect(ler('IFCDUCTSEGMENT').map((x) => v(x.PredefinedType))).toEqual(['RIGIDSEGMENT', 'RIGIDSEGMENT']);
        expect(ler('IFCDUCTFITTING').every((x) => String(v(x.Name)).startsWith('Joelho 90'))).toBe(true);
        // Os sistemas da climatização, cada um com o seu PredefinedType.
        const sistemas = ler('IFCDISTRIBUTIONSYSTEM').map((x) => String(v(x.PredefinedType)));
        for (const s of ['AIRCONDITIONING', 'REFRIGERATION', 'DRAINAGE']) expect(sistemas).toContain(s);
      } finally {
        (api.CloseModel as (m: number) => void)(id);
      }
    });
  }
});

describe('climatização E10.1 · importar de volta (web-ifc)', () => {
  for (const esquema of ['IFC4', 'IFC4X3'] as const) {
    it(`⚠️ PRONTO QUANDO (${esquema}): as MESMAS peças e tubos voltam — tipo, posição, cota, capacidade, vazão, diâmetros, isolamento e seção; água, esgoto e incêndio de fora`, async () => {
      const m = casa();
      const { clima, incendio } = await lerDeVolta(m, { esquema });
      const r = traduzirClimatizacao(clima);
      // A única recusa é a reserva de lugar antiga — dita como tal.
      expect(r.recusas.map((x) => x.motivo)).toEqual(['reserva de lugar (componente antigo), não peça da rede de climatização']);
      const pecas = m.terminais!;
      expect(r.pontos).toHaveLength(pecas.length);
      for (const t of pecas) {
        const p = r.pontos.find((x) => x.at.x === t.at.x && x.at.y === t.at.y)!;
        expect(p, t.tipoHidraulico!).toBeTruthy();
        expect(p.tipoHidraulico).toBe(t.tipoHidraulico);
        expect(p.cotaAbsMm).toBe(t.cotaMm);
        expect(p.disciplina).toBe(t.disciplina);
        expect(p.capacidadeBtuH ?? null).toBe(t.capacidadeBtuH ?? null);
        expect(p.vazaoM3h ?? null).toBe(t.vazaoM3h ?? null);
      }
      // 2 trechos de linha, 1 de dreno, 2 de duto — sem água nem esgoto.
      expect(r.tubos.map((x) => x.disciplina).sort()).toEqual(['DRENO_AC', 'FRIGORIGENA', 'FRIGORIGENA', 'MECANICA', 'MECANICA']);
      for (const x of r.tubos.filter((y) => y.disciplina === 'FRIGORIGENA')) expect(x).toMatchObject({ bitolaMm: 6, bitolaSuccaoMm: 10, isolamentoMm: 9, cotaAAbsMm: 2500, cotaBAbsMm: 2500 });
      for (const x of r.tubos.filter((y) => y.disciplina === 'MECANICA')) expect(x).toMatchObject({ bitolaMm: 400, alturaDutoMm: 250, isolamentoMm: 25 });
      // O par volta ao EIXO do trecho (o meio dos dois sólidos), com o ruído de 1 mm da malha.
      const l1 = r.tubos.find((y) => y.disciplina === 'FRIGORIGENA' && Math.abs(y.a.y - 1000) <= 1 && Math.abs(y.b.y - 1000) <= 1)!;
      expect(l1).toBeTruthy();
      expect(Math.min(Math.hypot(l1.a.x - 0, l1.a.y - 1000), Math.hypot(l1.b.x - 0, l1.b.y - 1000))).toBeLessThanOrEqual(1);
      expect(r.tubos.find((y) => y.disciplina === 'DRENO_AC')).toMatchObject({ bitolaMm: 25, cotaAAbsMm: 2200, cotaBAbsMm: 2150 });
      // O incêndio não lê nada da climatização.
      expect(incendio.pontos).toHaveLength(0);
      expect(incendio.eletrodutos).toHaveLength(0);
    });
  }

  it('os comandos põem tudo nas disciplinas certas e RELIGAM o sistema no mesmo lote (a evaporadora aponta para a condensadora nova)', async () => {
    const r = traduzirClimatizacao((await lerDeVolta(casa())).clima);
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const destino = () => ({ levelId: base.levels[0].id, elevationMm: 0 });
    const { comandos, pecas } = comandosDaClimatizacao(r.pontos, r.tubos, destino);
    const { comandos: final, avisos } = religarSistemasImportados(base, comandos, pecas, (mm, c) => applyBatch(mm, [...c]).model);
    expect(avisos).toEqual([]);
    const alvo = applyBatch(base, final).model;
    const evap = alvo.terminais!.find((t) => t.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    const cond = alvo.terminais!.find((t) => t.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    expect(evap.condensadoraId).toBe(cond.id);
    expect(alvo.terminais!.find((t) => t.tipoHidraulico === 'DERIVADOR_VRF')!.condensadoraId).toBe(alvo.terminais!.find((t) => t.tipoHidraulico === 'CONDENSADORA_VRF')!.id);
    expect(evap.capacidadeBtuH).toBe(12000);
    expect(alvo.terminais!.find((t) => t.tipoHidraulico === 'DIFUSOR')!.vazaoM3h).toBe(300);
    expect(alvo.trechos!.filter((t) => t.disciplina === 'MECANICA').every((t) => t.alturaDutoMm === 250)).toBe(true);
    // A condensadora fora do que foi importado: aviso, e a evaporadora entra sem sistema.
    const semCond = pecas.filter((p) => p.tipoHidraulico !== 'CONDENSADORA_SPLIT');
    const parcial = comandosDaClimatizacao(semCond, [], destino);
    expect(religarSistemasImportados(base, parcial.comandos, parcial.pecas, (mm, c) => applyBatch(mm, [...c]).model).avisos.join(' ')).toMatch(/a condensadora CD-1 não veio/);
  });

  it('arquivo de OUTRO programa: o tipo pela classe e o enum — e o que a norma não distingue fica recusado, não adivinhado', () => {
    expect(tipoDoPontoDeClimatizacaoIfc('IFCAIRTERMINAL', 'DIFFUSER', null)).toBe('DIFUSOR');
    expect(tipoDoPontoDeClimatizacaoIfc('IFCAIRTERMINAL', 'GRILLE', null)).toBe('GRELHA_INSUFLAMENTO');
    expect(tipoDoPontoDeClimatizacaoIfc('IFCFAN', 'CENTRIFUGALFORWARDCURVED', null)).toBe('EXAUSTOR_AR');
    expect(tipoDoPontoDeClimatizacaoIfc('IFCUNITARYEQUIPMENT', 'SPLITSYSTEM', null)).toBeNull();
    expect(tipoDoPontoDeClimatizacaoIfc('IFCUNITARYEQUIPMENT', 'SPLITSYSTEM', 'EVAPORADORA_CASSETE')).toBe('EVAPORADORA_CASSETE');
  });
});
