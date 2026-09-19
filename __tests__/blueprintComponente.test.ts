/**
 * Componente (19/09/2026, E7.1): comandos com medidas do catálogo, troca de
 * tipo puxa a ficha, mover confirma o sugerido, invariantes, canônico ida e
 * volta (chave só quando há componente; identidade M), ligação derivada ao
 * ponto hidráulico, aceite do mobiliário automático (idempotente) e IFC
 * (IfcFurniture / IfcSanitaryTerminal).
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  CATALOGO_DE_COMPONENTES,
  contornoDoComponente,
  emptyModel,
  KERNEL_VERSION,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  pontoHidraulicoDoComponente,
  rotuloCurto,
  snapshotHash,
  type Command,
} from '../utils/blueprintKernel';
import { comandosDeMobiliario, mobiliarNivel } from '../utils/blueprintMobiliario';
import { gerarIfc } from '../utils/blueprintIfc';

function nivel() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}

describe('componente (E7.1)', () => {
  it('comandos: medidas do catálogo, família derivada, troca de tipo puxa a ficha, mover confirma, apagar; invariantes recusam tipo/giro/medida inválidos', () => {
    const { m, t } = nivel();
    let r = applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'CAMA_CASAL', at: point(2000, 3000), sugerido: true });
    const c = r.model.componentes[0];
    expect(c).toMatchObject({ tipoId: 'CAMA_CASAL', familia: 'MOBILIARIO', larguraMm: 1400, profundidadeMm: 1900, alturaMm: 500, rotacaoGraus: 0, sugerido: true, rotulo: null });
    expect(rotuloCurto(c.uid, 'componente')).toMatch(/^M-/);
    expect(contornoDoComponente(c)).toEqual([point(1300, 2050), point(2700, 2050), point(2700, 3950), point(1300, 3950)]);
    // Trocar para VASO sem medidas: puxa as do vaso e a família LOUCA.
    r = applyCommand(r.model, { type: 'SetComponenteProps', componenteId: c.id, tipoId: 'VASO' });
    expect(r.model.componentes[0]).toMatchObject({ tipoId: 'VASO', familia: 'LOUCA', larguraMm: 400, profundidadeMm: 650, alturaMm: 400 });
    // Medidas e giro explícitos; rótulo cortado em 40.
    r = applyCommand(r.model, { type: 'SetComponenteProps', componenteId: c.id, larguraMm: 450, rotacaoGraus: 450, rotulo: 'x'.repeat(50) });
    expect(r.model.componentes[0]).toMatchObject({ larguraMm: 450, rotacaoGraus: 90 });
    expect(r.model.componentes[0].rotulo).toHaveLength(40);
    // Mover confirma o sugerido.
    r = applyCommand(r.model, { type: 'MoveComponente', componenteId: c.id, to: point(2500, 3000) });
    expect(r.model.componentes[0].at).toEqual(point(2500, 3000));
    expect(r.model.componentes[0].sugerido).toBeUndefined();
    // Apagar.
    r = applyCommand(r.model, { type: 'DeleteComponente', componenteId: c.id });
    expect(r.model.componentes).toEqual([]);
    // Recusas.
    expect(() => applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'PISCINA' as never, at: point(0, 0) })).toThrow(/Tipo de componente desconhecido/);
    expect(() => applyCommand(m, { type: 'AddComponente', levelId: 'lvl_x', tipoId: 'SOFA', at: point(0, 0) })).toThrow();
    expect(() => applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(0, 0), larguraMm: 0 })).toThrow();
    // RemoveLevel leva os componentes do pavimento.
    const comDois = applyBatch(m, [
      { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 2800 },
      { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(1000, 1000) },
    ]).model;
    const semTerreo = applyCommand(comDois, { type: 'RemoveLevel', levelId: t }).model;
    expect(semTerreo.componentes).toEqual([]);
  });

  it('canônico: a chave só existe com componente; ida e volta preserva tudo e a identidade; a versão é ≥ 0.42.0', () => {
    expect(KERNEL_VERSION).toMatch(/^blueprint-kernel-ts-0\.(4[2-9]|[5-9][0-9])\.\d+$/); // ≥ 0.42.0 — o componente entrou nela; bumps posteriores não a invalidam
    const { m, t } = nivel();
    const sem = JSON.parse(canonicalPayload(m));
    expect(sem.componentes).toBeUndefined();
    expect(sem.identity.componentes).toEqual([]);
    const com = applyBatch(m, [
      { type: 'AddComponente', levelId: t, tipoId: 'BANCADA', at: point(3000, 1000), rotacaoGraus: 90, rotulo: 'Bancada da ilha' },
      { type: 'AddComponente', levelId: t, tipoId: 'CAMA_CASAL', at: point(1000, 1000), sugerido: true },
    ]).model;
    const payload = JSON.parse(canonicalPayload(com));
    // Ordenado por pavimento, x, y: a cama (x 1000) antes da bancada (x 3000).
    expect(payload.componentes.map((c: { tipoId: string }) => c.tipoId)).toEqual(['CAMA_CASAL', 'BANCADA']);
    expect(payload.componentes[1]).toMatchObject({ level: 0, at: { x: 3000, y: 1000 }, larguraMm: 1800, profundidadeMm: 600, alturaMm: 900, rotacaoGraus: 90, tipoId: 'BANCADA', familia: 'BANCADA', rotulo: 'Bancada da ilha' });
    expect(payload.componentes[0].sugerido).toBe(true);
    expect(payload.componentes[1].sugerido).toBeUndefined();
    expect(payload.identity.componentes).toHaveLength(2);
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(com)));
    expect(snapshotHash(volta)).toBe(snapshotHash(com));
    expect(volta.componentes.map((c) => c.uid).sort()).toEqual(com.componentes.map((c) => c.uid).sort());
    expect(volta.componentes.find((c) => c.tipoId === 'CAMA_CASAL')?.sugerido).toBe(true);
  });

  it('a louça liga-se ao ponto hidráulico do mesmo lugar (derivado); o mobiliário automático vira componentes sugeridos, sem duplicar; o IFC emite IfcFurniture e IfcSanitaryTerminal', () => {
    const { m, t } = nivel();
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    let model = applyBatch(m, [w(0, 0, 3500, 0), w(3500, 0, 3500, 4000), w(3500, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
    const sul = model.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
    model = applyBatch(model, [
      { type: 'NameSpace', spaceId: model.spaces[0].id, name: 'Dormitório 1' },
      { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 200, widthMm: 800, heightMm: 2100, sillMm: 0 },
      { type: 'AddComponente', levelId: t, tipoId: 'VASO', at: point(3000, 3500) },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Vaso', tipoHidraulico: 'VASO_SANITARIO', at: point(3000, 3800), cotaMm: 300 },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Lavatório', tipoHidraulico: 'LAVATORIO', at: point(3000, 3600), cotaMm: 600 },
    ]).model;
    const vaso = model.componentes[0];
    const ligado = pontoHidraulicoDoComponente(model, vaso)!;
    expect(ligado.tipoHidraulico).toBe('VASO_SANITARIO'); // o do tipo certo, não o lavatório mais perto
    expect(pontoHidraulicoDoComponente(applyCommand(model, { type: 'MoveComponente', componenteId: vaso.id, to: point(500, 500) }).model, { ...vaso, at: point(500, 500) })).toBeNull();
    // Mobiliário automático (E6.3) → componentes sugeridos, girados quando encostam em O/L; aceitar de novo não duplica.
    const lista = mobiliarNivel(model, t);
    const cmds = comandosDeMobiliario(lista, t, model);
    expect(cmds.length).toBe(3); // cama, armário, criado
    expect(cmds.every((c) => c.type === 'AddComponente' && c.sugerido)).toBe(true);
    const cama = cmds.find((c) => c.type === 'AddComponente' && c.tipoId === 'CAMA_CASAL') as Extract<Command, { type: 'AddComponente' }>;
    expect([0, 90]).toContain(cama.rotacaoGraus);
    const comMobiliario = applyBatch(model, cmds).model;
    expect(comMobiliario.componentes).toHaveLength(4);
    expect(comandosDeMobiliario(mobiliarNivel(comMobiliario, t), t, comMobiliario)).toEqual([]);
    // IFC: louça e mobiliário com as entidades certas.
    const texto = gerarIfc(comMobiliario, { titulo: 'Teste', revisao: 1, hash: 'hash-fixo', data: new Date('2026-09-19T12:00:00Z') });
    // (o nome acentuado sai escapado em STEP; casa-se pelo ObjectType = tipoId)
    expect(texto).toMatch(/IFCSANITARYTERMINAL\(.*,'VASO',.*\.TOILETPAN\.\);/);
    expect(texto).toMatch(/IFCFURNITURE\(.*'Cama de casal',\$,'CAMA_CASAL',.*\.BED\.\);/);
    expect(texto).toMatch(/IFCFURNITURE\(.*,'ARMARIO',.*\.SHELF\.\);/);
    expect(texto).toMatch(/Pset_OpuraComponente/);
    expect(CATALOGO_DE_COMPONENTES.BOX.ligaAoPonto).toBe('CHUVEIRO');
  });
});
