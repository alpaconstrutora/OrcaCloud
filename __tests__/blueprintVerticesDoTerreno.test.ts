/**
 * VÉRTICES NOMEADOS DO TERRENO (A1) — o kernel.
 *
 * O que se trava: a ÂNCORA é o ponto, com tolerância; nomear duas vezes o
 * mesmo ponto edita em vez de duplicar; o canônico só ganha a chave quando há
 * vértice; e o nome sobrevive à ida e volta.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  snapshotHash,
  TOLERANCIA_DO_VERTICE_MM,
  type BlueprintModel,
} from '../utils/blueprintKernel';

function base(): BlueprintModel {
  return applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
}

describe('SetVerticeDoTerreno', () => {
  it('cria pelo ponto e edita quando o ponto já tem nome', () => {
    const m = base();
    const um = applyCommand(m, { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'P1' }).model;
    expect(um.verticesDoTerreno).toHaveLength(1);
    expect(um.verticesDoTerreno[0].nome).toBe('P1');

    // A 3 mm do ponto (dentro da tolerância de 5): é o MESMO vértice.
    const dois = applyCommand(um, { type: 'SetVerticeDoTerreno', ponto: { x: 3, y: 0 }, nome: 'M-0001', tipo: 'M', sigmaMm: 50 }).model;
    expect(dois.verticesDoTerreno).toHaveLength(1);
    expect(dois.verticesDoTerreno[0]).toMatchObject({ nome: 'M-0001', tipo: 'M', sigmaMm: 50 });
    // E o uid não mudou: é edição, não troca.
    expect(dois.verticesDoTerreno[0].uid).toBe(um.verticesDoTerreno[0].uid);

    // Além da tolerância: outro vértice.
    const tres = applyCommand(dois, { type: 'SetVerticeDoTerreno', ponto: { x: TOLERANCIA_DO_VERTICE_MM + 1, y: 0 }, nome: 'P2' }).model;
    expect(tres.verticesDoTerreno).toHaveLength(2);
  });

  it('recusa nome vazio e tipo desconhecido', () => {
    const m = base();
    expect(() => applyCommand(m, { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: '   ' })).toThrow(/nome/);
    expect(() =>
      applyCommand(m, { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'P1', tipo: 'X' as unknown as 'M' }),
    ).toThrow(/tipo/i);
  });

  it('remove pelo ponto, e ignora ponto sem vértice', () => {
    const m = applyCommand(base(), { type: 'SetVerticeDoTerreno', ponto: { x: 100, y: 200 }, nome: 'P1' }).model;
    const sem = applyCommand(m, { type: 'RemoverVerticeDoTerreno', ponto: { x: 102, y: 200 } }).model;
    expect(sem.verticesDoTerreno).toHaveLength(0);
    const nada = applyCommand(m, { type: 'RemoverVerticeDoTerreno', ponto: { x: 9000, y: 9000 } }).model;
    expect(nada.verticesDoTerreno).toHaveLength(1);
  });
});

describe('NomearVerticesDoTerreno', () => {
  const ANEL = [
    { x: 0, y: 0 },
    { x: 12000, y: 0 },
    { x: 12000, y: 30000 },
    { x: 0, y: 30000 },
  ];

  it('nomeia P1…Pn na ordem dos pontos, num comando só', () => {
    const m = applyCommand(base(), { type: 'NomearVerticesDoTerreno', pontos: ANEL }).model;
    expect(m.verticesDoTerreno.map((v) => v.nome)).toEqual(['P1', 'P2', 'P3', 'P4']);
  });

  it('prefixo e início são configuráveis, e renomear não duplica', () => {
    const um = applyCommand(base(), { type: 'NomearVerticesDoTerreno', pontos: ANEL }).model;
    const dois = applyCommand(um, { type: 'NomearVerticesDoTerreno', pontos: ANEL, prefixo: 'M-', inicio: 10 }).model;
    expect(dois.verticesDoTerreno).toHaveLength(4);
    expect(dois.verticesDoTerreno.map((v) => v.nome)).toEqual(['M-10', 'M-11', 'M-12', 'M-13']);
  });
});

describe('canônico', () => {
  it('sem vértice não há chave; com vértice, ida e volta preserva nome, tipo e sigma', () => {
    const vazio = parseCanonicalPayload(canonicalPayload(base()));
    expect(vazio.verticesDoTerreno).toBeUndefined();

    const m = applyBatch(base(), [
      { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'M-0002', tipo: 'M', sigmaMm: 30, metodo: 'GNSS RTK' },
      { type: 'SetVerticeDoTerreno', ponto: { x: 12000, y: 0 }, nome: 'P1' },
    ]).model;
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.verticesDoTerreno).toHaveLength(2);
    const marco = volta.verticesDoTerreno.find((v) => v.nome === 'M-0002');
    expect(marco).toMatchObject({ tipo: 'M', sigmaMm: 30, metodo: 'GNSS RTK', ponto: { x: 0, y: 0 } });
    const simples = volta.verticesDoTerreno.find((v) => v.nome === 'P1');
    expect(simples?.tipo).toBeUndefined();
    expect(simples?.sigmaMm).toBeUndefined();
  });

  it('o hash muda ao nomear um vértice — nome é conteúdo, não decoração', () => {
    const sem = base();
    const com = applyCommand(sem, { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'P1' }).model;
    expect(snapshotHash(com)).not.toBe(snapshotHash(sem));
    const renomeado = applyCommand(com, { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'P9' }).model;
    expect(snapshotHash(renomeado)).not.toBe(snapshotHash(com));
  });

  it('o uid fica na seção de IDENTIDADE, fora da geometria — e fora do hash', () => {
    const m = applyCommand(base(), { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'P1' }).model;
    const payload = parseCanonicalPayload(canonicalPayload(m)) as unknown as {
      verticesDoTerreno?: Record<string, unknown>[];
      identity?: { verticesDoTerreno?: (string | null)[] };
    };
    // A geometria do vértice não carrega uid: é o que faz duas sessões que
    // nomeiam o mesmo ponto produzirem o mesmo hash.
    expect(payload.verticesDoTerreno?.[0]).not.toHaveProperty('uid');
    // O uid viaja na identidade, como nas outras famílias.
    expect(payload.identity?.verticesDoTerreno).toEqual([m.verticesDoTerreno[0].uid]);
    // Trocar o uid não muda o hash.
    const outroUid = { ...m, verticesDoTerreno: [{ ...m.verticesDoTerreno[0], uid: '00000000-0000-4000-8000-000000000000' }] } as BlueprintModel;
    expect(snapshotHash(outroUid)).toBe(snapshotHash(m));
  });
});
