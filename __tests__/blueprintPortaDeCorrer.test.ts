import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  canonicalPayload,
  computeQuantities,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  nomeDoTipoDeAbertura,
  snapshotHash,
  type BlueprintModel,
  type Command,
  type Point,
} from '../utils/blueprintKernel';

/**
 * Porta de correr — as duas formas.
 *
 * Nasceu de um caso real: a prancha do usuário tem portas de correr, e o app
 * só tinha porta de abrir, janela e vão livre. As duas saídas disponíveis
 * estavam erradas de formas opostas — vão livre some do quantitativo de
 * esquadrias (correr TEM folha, trilho e puxador), e porta de abrir desenha um
 * arco de giro que não existe.
 */
function comParede(): BlueprintModel {
  let m = emptyModel();
  m.levels.push({ id: 'n1', name: 'Térreo', elevationMm: 0 });
  m = applyCommand(m, {
    type: 'AddWall',
    levelId: 'n1',
    a: { x: 0, y: 0 } as Point,
    b: { x: 5000, y: 0 } as Point,
    thicknessMm: 150,
    heightMm: 2800,
  }).model;
  return m;
}

const abrir = (m: BlueprintModel, extra: Partial<Command & { kind: string }> = {}) =>
  applyCommand(m, {
    type: 'AddOpening',
    wallId: m.walls[0].id,
    kind: 'sliding',
    offsetMm: 1000,
    widthMm: 900,
    heightMm: 2100,
    sillMm: 0,
    ...extra,
  } as Command).model;

describe('porta de correr · modelo', () => {
  it('nasce correndo POR FORA — a forma comum', () => {
    // Bolso exige parede preparada. O padrão não pode inventar uma parede oca
    // que ninguém construiu.
    const m = abrir(comParede());
    expect(m.openings[0].kind).toBe('sliding');
    expect(m.openings[0].embutida).toBe(false);
  });

  it('aceita embutida quando pedida', () => {
    const m = abrir(comParede(), { embutida: true } as any);
    expect(m.openings[0].embutida).toBe(true);
  });

  it('tem nome próprio para cada forma', () => {
    expect(nomeDoTipoDeAbertura('sliding')).toBe('Porta de correr');
    expect(nomeDoTipoDeAbertura('sliding', true)).toBe('Porta de correr embutida');
    expect(nomeDoTipoDeAbertura('door')).toBe('Porta');
  });
});

describe('porta de correr · orçamento', () => {
  it('CONTA como esquadria — é o erro que o vão livre cometia', () => {
    const q = computeQuantities(abrir(comParede()));
    const ab = q.aberturas.find((o) => o.tipo === 'sliding');
    expect(ab).toBeDefined();
    // Vão livre é o único tipo sem esquadria; correr não é vão livre.
    expect(q.totais.vaosLivres).toBe(0);
  });

  it('é contada À PARTE da porta de abrir', () => {
    // Somar as duas devolveria um número que não serve para comprar nada:
    // preço, trilho e detalhe são outros.
    let m = abrir(comParede());
    m = applyCommand(m, {
      type: 'AddOpening',
      wallId: m.walls[0].id,
      kind: 'door',
      offsetMm: 3000,
      widthMm: 800,
      heightMm: 2100,
      sillMm: 0,
    }).model;
    const q = computeQuantities(m);
    expect(q.totais.portasDeCorrer).toBe(1);
    expect(q.totais.portas).toBe(1);
  });

  it('desconta área de parede, como toda abertura', () => {
    const sem = computeQuantities(comParede());
    const com = computeQuantities(abrir(comParede()));
    expect(com.totais.areaParedeDuasFacesM2).toBeLessThan(sem.totais.areaParedeDuasFacesM2);
    expect(com.totais.areaAberturasM2).toBeGreaterThan(0);
  });
});

describe('porta de correr · payload canônico', () => {
  it('grava e relê as duas formas', () => {
    for (const embutida of [false, true]) {
      const m = abrir(comParede(), { embutida } as any);
      const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
      expect(volta.openings[0].kind).toBe('sliding');
      expect(volta.openings[0].embutida).toBe(embutida);
    }
  });

  it('NÃO acrescenta chave em abertura que não é de correr', () => {
    // O cuidado que a área de escritura teve em 0.6.0: campo que não descreve
    // o objeto não entra no payload dele, senão o hash de todo desenho antigo
    // muda por um dado que não é dele.
    let m = comParede();
    m = applyCommand(m, {
      type: 'AddOpening',
      wallId: m.walls[0].id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 800,
      heightMm: 2100,
      sillMm: 0,
    }).model;
    expect(canonicalPayload(m)).not.toContain('embutida');
  });

  it('embutida e por fora têm hashes DIFERENTES', () => {
    // Se não tivessem, publicar depois de trocar a forma seria idempotente e a
    // mudança nunca chegaria ao snapshot.
    const a = snapshotHash(abrir(comParede(), { embutida: false } as any));
    const b = snapshotHash(abrir(comParede(), { embutida: true } as any));
    expect(a).not.toBe(b);
  });
});
