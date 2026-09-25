/**
 * HVAC mínimo (20/09/2026, E11.1, kernel 0.47.0): disciplina `MECANICA` no
 * kernel; shaft com disciplina; reservas de espaço de equipamento (família
 * CLIMATIZACAO) com cota e folga; canônico ida e volta; invariantes; clash da
 * reserva com estrutura, parede e componente; IFC como equipamento.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  assertModelInvariants,
  canonicalPayload,
  CATALOGO_DE_COMPONENTES,
  conflitosArquitetonicos,
  conflitosDeReserva,
  contornoComFolga,
  DISCIPLINAS,
  emptyModel,
  FAMILIAS_DE_COMPONENTE,
  KERNEL_VERSION,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  snapshotHash,
  type Command,
} from '../utils/blueprintKernel';
import { COR_DA_DISCIPLINA, ROTULO_DA_DISCIPLINA } from '../utils/blueprintRede';
import { gerarIfc } from '../utils/blueprintIfc';

function terreo() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}

describe('HVAC mínimo (E11.1) · kernel', () => {
  it('kernel 0.47.0: MECANICA é disciplina; o shaft leva a disciplina (só ele) e ela vai e volta pelo canônico; o shaft geral não ganha chave', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.58.0');
    expect(DISCIPLINAS).toContain('MECANICA');
    expect(ROTULO_DA_DISCIPLINA.MECANICA).toBe('Mecânica');
    expect(COR_DA_DISCIPLINA.MECANICA).toMatch(/^#/);
    const { m, t } = terreo();
    const ring = [point(0, 0), point(800, 0), point(800, 600), point(0, 600)];
    const geral = applyCommand(m, { type: 'AddNucleo', levelId: t, tipo: 'SHAFT', ring }).model;
    expect(canonicalPayload(geral)).not.toMatch(/"disciplina":"MECANICA"/);
    const mecanico = applyCommand(m, { type: 'AddNucleo', levelId: t, tipo: 'SHAFT', ring, disciplina: 'MECANICA' }).model;
    expect(mecanico.nucleos![0].disciplina).toBe('MECANICA');
    expect(snapshotHash(mecanico)).not.toBe(snapshotHash(geral));
    const payload = canonicalPayload(mecanico);
    expect(payload).toMatch(/"disciplina":"MECANICA"/);
    const relido = modelFromCanonicalPayload(parseCanonicalPayload(payload));
    expect(relido.nucleos![0].disciplina).toBe('MECANICA');
    expect(snapshotHash(relido)).toBe(snapshotHash(mecanico));
    // Trocar e limpar pelo comando; elevador não tem disciplina.
    const n = mecanico.nucleos![0].id;
    expect(applyCommand(mecanico, { type: 'SetNucleoProps', nucleoId: n, disciplina: null }).model.nucleos![0].disciplina).toBeUndefined();
    expect(snapshotHash(applyCommand(mecanico, { type: 'SetNucleoProps', nucleoId: n, disciplina: null }).model)).toBe(snapshotHash(geral));
    expect(applyCommand(mecanico, { type: 'SetNucleoProps', nucleoId: n, tipo: 'ELEVADOR' }).model.nucleos![0].disciplina).toBeUndefined();
    expect(() => applyCommand(geral, { type: 'SetNucleoProps', nucleoId: geral.nucleos![0].id, tipo: 'ELEVADOR', disciplina: 'MECANICA' })).toThrow(/só existe no shaft/);
    // Elevador com disciplina no payload é recusado pela invariante.
    const elevador = applyCommand(m, { type: 'AddNucleo', levelId: t, tipo: 'ELEVADOR', ring, disciplina: 'MECANICA' }).model;
    expect(elevador.nucleos![0].disciplina).toBeUndefined();
  });

  it('reservas de climatização: família, folga e cota da ficha; cotaMm vai e volta e só aparece quando > 0; invariante recusa cota negativa', () => {
    expect(FAMILIAS_DE_COMPONENTE).toContain('CLIMATIZACAO');
    expect(CATALOGO_DE_COMPONENTES.CONDENSADORA).toMatchObject({ familia: 'CLIMATIZACAO', folgaMm: 300 });
    expect(CATALOGO_DE_COMPONENTES.EVAPORADORA.cotaMm).toBe(2200);
    expect(CATALOGO_DE_COMPONENTES.CASA_DE_MAQUINAS.simbolo).toBe('RESERVA');
    const { m, t } = terreo();
    const com = applyBatch(m, [
      { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(1000, 1000) },
      { type: 'AddComponente', levelId: t, tipoId: 'EVAPORADORA', at: point(3000, 1000) },
      { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(5000, 1000) },
    ]).model;
    const [cond, evap, sofa] = com.componentes!;
    expect(cond.familia).toBe('CLIMATIZACAO');
    expect(cond.cotaMm).toBeUndefined();
    expect(evap.cotaMm).toBe(2200);
    expect(sofa.cotaMm).toBeUndefined();
    const payload = canonicalPayload(com);
    expect((payload.match(/"cotaMm":2200/g) ?? []).length).toBe(1);
    expect((payload.match(/"cotaMm"/g) ?? []).length).toBe(1);
    const relido = modelFromCanonicalPayload(parseCanonicalPayload(payload));
    expect(relido.componentes!.find((c) => c.tipoId === 'EVAPORADORA')!.cotaMm).toBe(2200);
    expect(snapshotHash(relido)).toBe(snapshotHash(com));
    // Mexer na cota; zerar apaga a chave; trocar o tipo traz a cota da ficha.
    const alto = applyCommand(com, { type: 'SetComponenteProps', componenteId: cond.id, cotaMm: 500 }).model;
    expect(alto.componentes![0].cotaMm).toBe(500);
    expect(applyCommand(alto, { type: 'SetComponenteProps', componenteId: cond.id, cotaMm: 0 }).model.componentes![0].cotaMm).toBeUndefined();
    expect(applyCommand(com, { type: 'SetComponenteProps', componenteId: sofa.id, tipoId: 'EXAUSTOR' }).model.componentes![2].cotaMm).toBe(2300);
    expect(applyCommand(com, { type: 'SetComponenteProps', componenteId: evap.id, tipoId: 'CADEIRA' }).model.componentes![1].cotaMm).toBeUndefined();
    expect(() => applyCommand(com, { type: 'SetComponenteProps', componenteId: cond.id, cotaMm: -10 }).model).not.toThrow(); // ≤ 0 = piso
    const quebrado = structuredClone(com);
    quebrado.componentes![0].cotaMm = -1;
    expect(() => assertModelInvariants(quebrado)).toThrow(/BAD_COMPONENT|cotaMm/);
    // A folga cresce a caixa dos dois lados.
    expect(contornoComFolga(cond, 300)).toHaveLength(4);
    const xs = contornoComFolga(cond, 300).map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(850 + 600);
  });
});

describe('HVAC mínimo (E11.1) · clash da reserva', () => {
  function cena() {
    const { m, t } = terreo();
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    const com = applyBatch(m, [
      w(0, 0, 8000, 0), w(8000, 0, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 0),
      // Condensadora encostada na parede sul (borda a 165 + 75) — normal.
      { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(2000, 240) },
      // Outra condensadora com um pilar dentro.
      { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(6000, 3000) },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(6000, 3000)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, baseMm: 0 } as Command,
      // Viga por CIMA da segunda condensadora (2,40 m acima do topo dela) — não é conflito.
      { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(5000, 3000), point(7000, 3000)], larguraMm: 150, alturaMm: 400, baseMm: 2400 } as Command,
      // Um armário a 100 mm da segunda condensadora, a oeste (dentro da folga de 300).
      { type: 'AddComponente', levelId: t, tipoId: 'ARMARIO', at: point(6000 - 425 - 100 - 900, 3000) },
      // Uma evaporadora no alto (2,20 m) sobre um sofá no piso — alturas não cruzam, sem conflito.
      { type: 'AddComponente', levelId: t, tipoId: 'EVAPORADORA', at: point(3000, 4000) },
      { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(3000, 4000) },
      // Casa de máquinas atravessada pela parede leste (longe do armário e da parede norte: a folga dela é 600).
      { type: 'AddComponente', levelId: t, tipoId: 'CASA_DE_MAQUINAS', at: point(8000, 4800) },
    ]).model;
    return com;
  }

  it('pilar dentro da caixa, parede atravessando e peça dentro da folga acusam; viga acima, peça em outra altura e encosto na parede não', () => {
    const m = cena();
    const c = conflitosDeReserva(m);
    const classes = c.map((x) => x.classe).sort();
    expect(classes).toEqual(['RESERVA_X_COMPONENTE', 'RESERVA_X_ESTRUTURA', 'RESERVA_X_PAREDE']);
    const cond2 = m.componentes!.find((x) => x.tipoId === 'CONDENSADORA' && x.at.x === 6000)!;
    const pilar = m.structures.find((s) => s.kind === 'PILAR')!;
    const armario = m.componentes!.find((x) => x.tipoId === 'ARMARIO')!;
    const cm = m.componentes!.find((x) => x.tipoId === 'CASA_DE_MAQUINAS')!;
    expect(c.find((x) => x.classe === 'RESERVA_X_ESTRUTURA')).toMatchObject({ pecaId: cond2.id, outroId: pilar.id, outroFamilia: 'structural', familia: 'componente', medidaMm: 200 });
    expect(c.find((x) => x.classe === 'RESERVA_X_COMPONENTE')).toMatchObject({ pecaId: cond2.id, outroId: armario.id, outroFamilia: 'componente' });
    expect(c.find((x) => x.classe === 'RESERVA_X_PAREDE')).toMatchObject({ pecaId: cm.id, outroFamilia: 'wall' });
    // Entram na lista geral, ordenados e sem duplicar.
    const todos = conflitosArquitetonicos(m);
    expect(todos.filter((x) => x.classe.startsWith('RESERVA_X_'))).toHaveLength(3);
    // Sem climatização, nada: sofá em cima de sofá é a vida.
    const soMoveis = applyBatch(terreo().m, [
      { type: 'AddComponente', levelId: terreo().t, tipoId: 'SOFA', at: point(1000, 1000) },
    ]).model;
    expect(conflitosDeReserva(soMoveis)).toEqual([]);
  });

  it('IFC: condensadora/evaporadora viram IfcUnitaryEquipment (.SPLITSYSTEM.), exaustor IfcFan, casa de máquinas IfcBuildingElementProxy .PROVISIONFORSPACE.; a base na cota', () => {
    const { m, t } = terreo();
    const com = applyBatch(m, [
      { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(1000, 1000) },
      { type: 'AddComponente', levelId: t, tipoId: 'EVAPORADORA', at: point(3000, 1000) },
      { type: 'AddComponente', levelId: t, tipoId: 'EXAUSTOR', at: point(5000, 1000) },
      { type: 'AddComponente', levelId: t, tipoId: 'CASA_DE_MAQUINAS', at: point(7000, 3000) },
      { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(2000, 4000) },
    ]).model;
    const ifc = gerarIfc(com, { titulo: 'HVAC', revisao: 1, hash: 'a'.repeat(64), data: new Date('2026-09-20T12:00:00Z') });
    expect((ifc.match(/IFCUNITARYEQUIPMENT\(/g) ?? []).length).toBe(2);
    expect(ifc).toMatch(/IFCUNITARYEQUIPMENT\([^\n]*\.SPLITSYSTEM\.\)/);
    expect(ifc).toMatch(/IFCFAN\([^\n]*\.PROPELLORAXIAL\.\)/);
    expect(ifc).toMatch(/IFCBUILDINGELEMENTPROXY\([^\n]*'CASA_DE_MAQUINAS'[^\n]*\.PROVISIONFORSPACE\.\)/);
    expect((ifc.match(/IFCFURNITURE\(/g) ?? []).length).toBe(1);
    expect(ifc).toMatch(/IFCCARTESIANPOINT\(\(3000\.,1000\.,2200\.\)\)/);
  });
});
