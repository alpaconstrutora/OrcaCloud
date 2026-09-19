/**
 * Grupos com origem (19/09/2026, E2.3): instanciar espelhado/girado/deslocado,
 * editar a origem propaga, editar a cópia é recusado, desagrupar, canônico,
 * repetir unidade (grupo + unidade nova, parede da divisa vira geminada).
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  snapshotHash,
  transformarPontoDoGrupo,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { comandoDeAgrupar, grupoDaSelecao, numeroSugerido, planoDeRepeticaoDaUnidade } from '../utils/blueprintGrupos';
import { quadroDeUnidades } from '../utils/blueprintUnidades';

/** Um apartamento 6 × 4 m (eixo) com porta na frente e um pilar no canto, etiquetado e como unidade 101. */
function apartamento(): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
  const frente = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  m = applyBatch(m, [
    { type: 'AddOpening', wallId: frente.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(500, 500)], larguraMm: 200, profundidadeMm: 300, alturaMm: 2800, rotulo: 'P1', rotacaoDeg: 0 },
    { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' },
  ]).model;
  m = applyCommand(m, { type: 'AddUnidade', numero: '101', tipologia: '2 dorm.', labelIds: [m.labels[0].id] }).model;
  return { m, t };
}

describe('transformação', () => {
  it('espelho, giro e translação em torno do pivô, inteiros', () => {
    const g = { pivo: { x: 100, y: 100 } };
    expect(transformarPontoDoGrupo(g, { translacao: { x: 0, y: 0 }, rotacaoGraus: 0, espelho: 'X' }, { x: 150, y: 130 })).toEqual({ x: 50, y: 130 });
    expect(transformarPontoDoGrupo(g, { translacao: { x: 0, y: 0 }, rotacaoGraus: 90, espelho: 'NENHUM' }, { x: 150, y: 100 })).toEqual({ x: 100, y: 150 });
    expect(transformarPontoDoGrupo(g, { translacao: { x: 10, y: -20 }, rotacaoGraus: 180, espelho: 'Y' }, { x: 150, y: 130 })).toEqual({ x: 60, y: 110 });
  });
});

describe('kernel: grupo', () => {
  it('AddGrupo + instância espelhada materializa paredes, porta (lado trocado), pilar e etiqueta; editar a origem propaga; a cópia é recusada', () => {
    const { m } = apartamento();
    const r = applyCommand(m, {
      type: 'AddGrupo',
      nome: 'Apto tipo',
      wallIds: m.walls.map((w) => w.id),
      structuralIds: [m.structures[0].id],
      labelIds: [m.labels[0].id],
      pivo: point(6000, 0),
    });
    let x = r.model;
    expect(x.grupos).toHaveLength(1);
    expect(x.walls).toHaveLength(4);
    x = applyCommand(x, { type: 'AddInstanciaDeGrupo', grupoId: x.grupos[0].id, espelho: 'X' }).model;
    expect(x.walls).toHaveLength(8);
    expect(x.openings).toHaveLength(2);
    expect(x.structures).toHaveLength(2);
    expect(x.labels).toHaveLength(2);
    // A cópia ocupa x ∈ [6000, 12000]; a porta copiada tem o lado trocado e o mesmo offset.
    const copias = x.walls.filter((w) => !m.walls.some((o) => o.uid === w.uid));
    expect(Math.min(...copias.flatMap((w) => [w.a.x, w.b.x]))).toBe(6000);
    expect(Math.max(...copias.flatMap((w) => [w.a.x, w.b.x]))).toBe(12000);
    const portaCopia = x.openings.find((o) => !m.openings.some((p) => p.uid === o.uid))!;
    expect(portaCopia.swingReversed).toBe(!m.openings[0].swingReversed);
    expect(portaCopia.offsetMm).toBe(1000);
    const pilarCopia = x.structures.find((s) => !m.structures.some((p) => p.uid === s.uid))!;
    expect(pilarCopia.pontos[0]).toEqual({ x: 11500, y: 500 });
    // Ambientes: dois, ambos "Sala" (a etiqueta copiada).
    expect(x.spaces.map((s) => s.name).sort()).toEqual(['Sala', 'Sala']);
    // Idempotência: um comando neutro não muda o hash.
    const neutro = applyCommand(x, { type: 'SetGrupoProps', grupoId: x.grupos[0].id, nome: 'Apto tipo' }).model;
    expect(snapshotHash(neutro)).toBe(snapshotHash(x));
    // Editar a origem propaga com o MESMO id na cópia.
    const idPilarCopia = pilarCopia.id;
    const y = applyCommand(x, { type: 'SetStructuralProps', structuralId: m.structures[0].id, larguraMm: 400 }).model;
    expect(y.structures.find((s) => s.id === idPilarCopia)!.larguraMm).toBe(400);
    expect(y.structures).toHaveLength(2);
    // Editar a cópia é recusado.
    expect(() => applyCommand(y, { type: 'SetStructuralProps', structuralId: idPilarCopia, larguraMm: 500 })).toThrow(/instância do grupo "Apto tipo"/);
    expect(() => applyCommand(y, { type: 'SetThickness', wallId: copias[0].id, thicknessMm: 200 })).toThrow(/GROUP_INSTANCE|instância do grupo/);
    expect(() => applyCommand(y, { type: 'DeleteOpening', openingId: portaCopia.id })).toThrow(/instância do grupo/);
    // Apagar a porta da origem apaga a cópia.
    const z = applyCommand(y, { type: 'DeleteOpening', openingId: m.openings[0].id }).model;
    expect(z.openings).toHaveLength(0);
    // Instância exatamente sobre a origem é recusada; sem corrente (agrupar uma cópia).
    expect(() => applyCommand(z, { type: 'AddInstanciaDeGrupo', grupoId: z.grupos[0].id })).toThrow(/cairia exatamente sobre a origem/);
    expect(() => applyCommand(z, { type: 'AddGrupo', nome: 'Corrente', wallIds: [copias[0].id] })).toThrow(/cópia de instância/);
  });

  it('remover instância apaga as cópias; desagrupar deixa as cópias livres; DeleteGrupo sem manter apaga tudo; apagar peça da origem a tira do grupo', () => {
    const { m } = apartamento();
    let x = applyCommand(m, { type: 'AddGrupo', nome: 'G', wallIds: m.walls.map((w) => w.id), structuralIds: [m.structures[0].id], instancias: [{ translacao: point(8000, 0) }, { translacao: point(16000, 0) }] }).model;
    expect(x.walls).toHaveLength(12);
    expect(x.structures).toHaveLength(3);
    const g = x.grupos[0];
    x = applyCommand(x, { type: 'DeleteInstanciaDeGrupo', grupoId: g.id, instanciaUid: g.instancias[1].uid }).model;
    expect(x.walls).toHaveLength(8);
    expect(x.structures).toHaveLength(2);
    // Desagrupar: as cópias ficam e agora se editam.
    const livre = applyCommand(x, { type: 'DeleteGrupo', grupoId: g.id, manterInstancias: true }).model;
    expect(livre.grupos).toHaveLength(0);
    expect(livre.walls).toHaveLength(8);
    const copia = livre.walls.find((w) => w.a.x >= 8000)!;
    expect(applyCommand(livre, { type: 'SetThickness', wallId: copia.id, thicknessMm: 200 }).model.walls.find((w) => w.id === copia.id)!.thicknessMm).toBe(200);
    // Excluir com instâncias.
    const nada = applyCommand(x, { type: 'DeleteGrupo', grupoId: g.id, manterInstancias: false }).model;
    expect(nada.walls).toHaveLength(4);
    expect(nada.structures).toHaveLength(1);
    // Apagar o pilar da origem: sai do grupo, a cópia dele some, as paredes seguem.
    const semPilar = applyCommand(x, { type: 'DeleteStructural', structuralId: m.structures[0].id }).model;
    expect(semPilar.grupos[0].origem.structures).toEqual([]);
    expect(semPilar.structures).toHaveLength(0);
    expect(semPilar.walls).toHaveLength(8);
  });

  it('canônico: `grupos` com origem por índice e instâncias; ida e volta byte a byte; as cópias voltam com os mesmos uids', () => {
    const { m } = apartamento();
    const x = applyCommand(m, { type: 'AddGrupo', nome: 'G', wallIds: m.walls.map((w) => w.id), labelIds: [m.labels[0].id], instancias: [{ espelho: 'X', rotacaoGraus: 90, translacao: point(100, 200) }] }).model;
    const json = canonicalPayload(x);
    const payload = parseCanonicalPayload(json);
    expect(payload.grupos).toHaveLength(1);
    expect(payload.grupos![0].origem.walls).toHaveLength(4);
    expect(payload.grupos![0].instancias[0]).toEqual({ level: 0, translacao: { x: 100, y: 200 }, rotacaoGraus: 90, espelho: 'X' });
    expect(parseCanonicalPayload(canonicalPayload(m)).grupos).toBeUndefined();
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(json);
    expect(volta.grupos[0].instancias[0].uid).toBe(x.grupos[0].instancias[0].uid);
    // Um comando neutro depois da volta reconcilia as cópias existentes (mesmo hash, mesma contagem).
    const depois = applyCommand(volta, { type: 'SetGrupoProps', grupoId: volta.grupos[0].id, nome: 'G' }).model;
    expect(depois.walls).toHaveLength(8);
    expect(snapshotHash(depois)).toBe(snapshotHash(volta));
  });
});

describe('repetir unidade', () => {
  it('espelhada à direita: um comando cria grupo + instância + unidade 102; a parede da divisa fica fora e vira geminada', () => {
    const { m } = apartamento();
    const u = m.unidades[0];
    const plano = planoDeRepeticaoDaUnidade(m, u.id, 'ESPELHO_DIREITA');
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.aviso).toMatch(/geminada/);
    const cmd = plano.comando as Extract<Command, { type: 'AddGrupo' }>;
    expect(cmd.wallIds).toHaveLength(3); // a parede x = 6000 fica fora
    expect(cmd.structuralIds).toHaveLength(1);
    expect(cmd.labelIds).toHaveLength(1);
    expect(cmd.instancias![0].unidade).toEqual({ numero: '102', tipologia: '2 dorm.', pcd: false });
    const x = applyCommand(m, cmd).model;
    expect(x.walls).toHaveLength(7);
    expect(x.unidades.map((v) => v.numero).sort()).toEqual(['101', '102']);
    const q = quadroDeUnidades(x);
    const u102 = q.unidades.find((v) => v.numero === '102')!;
    expect(u102.ambientes).toHaveLength(1);
    expect(u102.ambientes[0].name).toBe('Sala');
    // Área igual à do original; a parede x = 6000 é geminada entre as duas.
    expect(u102.areaPrivativaMm2).toBe(q.unidades.find((v) => v.numero === '101')!.areaPrivativaMm2);
    expect(q.paredesGeminadas.size).toBe(1);
    expect(u102.fracaoIdeal).toBeCloseTo(0.5, 9);
    // Segunda repetição a partir da 101 é recusada (já é origem); sugestões de número.
    expect(planoDeRepeticaoDaUnidade(x, u.id, 'ESPELHO_ESQUERDA')).toMatchObject({ ok: false, aviso: expect.stringMatching(/já são origem/) });
    expect(numeroSugerido(x, '101')).toBe('103');
    expect(numeroSugerido(x, 'Casa 3')).toBe('Casa 3 B');
    expect(grupoDaSelecao(x, [m.walls[0].id])?.nome).toBe('Unidade 101');
    // Deslocada sem deslocamento é recusada; agrupar seleção vazia idem.
    expect(planoDeRepeticaoDaUnidade(m, u.id, 'DESLOCADA')).toMatchObject({ ok: false });
    expect(comandoDeAgrupar(m, [], 'x')).toMatchObject({ ok: false });
    expect(comandoDeAgrupar(m, [m.openings[0].id], '')).toMatchObject({ ok: true, comando: { type: 'AddGrupo', nome: 'Grupo 1', wallIds: [m.walls[0].id] } });
  });
});
