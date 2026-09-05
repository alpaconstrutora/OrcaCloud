/**
 * TIPO DE ESQUADRIA — `Opening.esquadria`, a assinatura e o comando.
 *
 * As perguntas do molde, com a segunda sendo a que separa esta das famílias
 * novas: aqui não nasce família, nasce um CAMPO numa família antiga, e a guarda
 * do acervo é ainda mais direta.
 *
 *   1. a assinatura agrupa o que é a mesma porta e separa o que não é;
 *   2. **abertura sem tipo tem o payload de sempre** — byte a byte;   ← a guarda
 *   3. o comando copia, não referencia; `null` remove;
 *   4. a cópia (pavimento, colar) leva o tipo junto, sem compartilhar objeto;
 *   5. os invariantes recusam tipo sem nome e tipo em vão livre.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  assinaturaDaEsquadria,
  canonicalPayload,
  cloneModel,
  emptyModel,
  modelFromCanonicalPayload,
  nomeDaEsquadria,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  type BlueprintModel,
  type Esquadria,
} from '../utils/blueprintKernel';


const P1: Esquadria = { nome: 'P1', itemCode: '90843', descricao: 'Porta de madeira semi-oca 80×210' };
const P2: Esquadria = { nome: 'P2', itemCode: '90844', descricao: 'Porta de madeira semi-oca 90×210' };

function paredeComPorta(esquadria?: Esquadria): { model: BlueprintModel; openingId: string } {
  const a = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  const levelId = a.model.levels[0].id;
  const b = applyCommand(a.model, {
    type: 'AddWall',
    levelId,
    a: point(0, 0),
    b: point(6000, 0),
    thicknessMm: 150,
    heightMm: 2800,
  });
  const c = applyCommand(b.model, {
    type: 'AddOpening',
    wallId: b.model.walls[0].id,
    kind: 'door',
    offsetMm: 1000,
    widthMm: 800,
    heightMm: 2100,
    sillMm: 0,
    ...(esquadria ? { esquadria } : {}),
  });
  return { model: c.model, openingId: c.model.openings[0].id };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('esquadria · 1. a ASSINATURA', () => {
  it('duas portas iguais com o mesmo tipo têm a mesma assinatura', () => {
    const o = { kind: 'door' as const, widthMm: 800, heightMm: 2100, esquadria: P1 };
    expect(assinaturaDaEsquadria(o)).toBe(assinaturaDaEsquadria({ ...o, esquadria: { ...P1 } }));
    expect(assinaturaDaEsquadria(o)).toBe('door|800|2100|P1|90843');
  });

  it('a DESCRIÇÃO fica fora: recadastrar o item com outra grafia não separa o grupo', () => {
    const o = { kind: 'door' as const, widthMm: 800, heightMm: 2100, esquadria: P1 };
    const outraGrafia = { ...o, esquadria: { ...P1, descricao: 'PORTA MADEIRA SEMI OCA' } };
    expect(assinaturaDaEsquadria(o)).toBe(assinaturaDaEsquadria(outraGrafia));
  });

  it('medida, kind, nome ou item diferentes separam', () => {
    const base = { kind: 'door' as const, widthMm: 800, heightMm: 2100, esquadria: P1 };
    expect(assinaturaDaEsquadria({ ...base, widthMm: 900 })).not.toBe(assinaturaDaEsquadria(base));
    expect(assinaturaDaEsquadria({ ...base, kind: 'sliding' })).not.toBe(assinaturaDaEsquadria(base));
    expect(assinaturaDaEsquadria({ ...base, esquadria: P2 })).not.toBe(assinaturaDaEsquadria(base));
    expect(assinaturaDaEsquadria({ ...base, esquadria: { ...P1, itemCode: '1' } })).not.toBe(
      assinaturaDaEsquadria(base),
    );
  });

  it('duas portas SEM tipo, iguais, também formam um grupo — é assim que o Revit pensa', () => {
    const o = { kind: 'door' as const, widthMm: 800, heightMm: 2100 };
    expect(assinaturaDaEsquadria(o)).toBe(assinaturaDaEsquadria({ ...o }));
    expect(assinaturaDaEsquadria(o)).toBe('door|800|2100||');
  });

  it('o nome é o do tipo, ou "Porta 80×210" quando não há', () => {
    expect(nomeDaEsquadria({ kind: 'door', widthMm: 800, heightMm: 2100, embutida: false, esquadria: P1 })).toBe('P1');
    expect(nomeDaEsquadria({ kind: 'door', widthMm: 800, heightMm: 2100, embutida: false })).toBe('Porta 800×2100');
    expect(nomeDaEsquadria({ kind: 'sliding', widthMm: 1200, heightMm: 2100, embutida: true })).toBe(
      'Porta de correr embutida 1200×2100',
    );
  });
});

describe('esquadria · 2. a guarda do acervo', () => {
  it('abertura SEM tipo não ganha a chave `esquadria` na geometria', () => {
    // A trava que protege o hash de toda porta publicada: emitir
    // `esquadria: undefined` mudaria a forma canônica de cada uma.
    const { model } = paredeComPorta();
    expect(payloadDoHash(model)).not.toContain('esquadria');
  });

  it('com tipo, a chave aparece — e o round-trip devolve a mesma coisa', () => {
    const { model } = paredeComPorta(P1);
    const payload = canonicalPayload(model);
    expect(payload).toContain('"esquadria":{"descricao":"Porta de madeira semi-oca 80×210","itemCode":"90843","nome":"P1"}');

    const devolta = modelFromCanonicalPayload(parseCanonicalPayload(payload));
    expect(devolta.openings[0].esquadria).toEqual(P1);
    expect(payloadDoHash(devolta)).toBe(payloadDoHash(model));
  });

  it('o tipo entra no HASH: a mesma porta com tipo e sem tipo são desenhos diferentes', () => {
    // É conteúdo — muda o que se compra —, e por isso a versão subiu.
    const sem = paredeComPorta().model;
    const com = paredeComPorta(P1).model;
    expect(payloadDoHash(sem)).not.toBe(payloadDoHash(com));
  });
});

describe('esquadria · 3. o comando', () => {
  it('SetOpeningEsquadria copia o objeto — editar o molde depois não muda a porta', () => {
    const { model, openingId } = paredeComPorta();
    const molde = { ...P1 };
    const depois = applyCommand(model, { type: 'SetOpeningEsquadria', openingId, esquadria: molde }).model;
    molde.nome = 'MUDEI';
    expect(depois.openings[0].esquadria?.nome).toBe('P1');
  });

  it('`null` remove o tipo, e a chave some do payload', () => {
    const { model, openingId } = paredeComPorta(P1);
    const depois = applyCommand(model, { type: 'SetOpeningEsquadria', openingId, esquadria: null }).model;
    expect(depois.openings[0].esquadria).toBeUndefined();
    expect(payloadDoHash(depois)).not.toContain('esquadria');
    // E volta a ser byte a byte o desenho sem tipo.
    expect(payloadDoHash(depois)).toBe(payloadDoHash(paredeComPorta().model));
  });

  it('nome e item chegam sem espaços em volta', () => {
    const { model, openingId } = paredeComPorta();
    const depois = applyCommand(model, {
      type: 'SetOpeningEsquadria',
      openingId,
      esquadria: { nome: '  P1 ', itemCode: ' 90843 ', descricao: 'x' },
    }).model;
    expect(depois.openings[0].esquadria).toEqual({ nome: 'P1', itemCode: '90843', descricao: 'x' });
  });

  it('desfazer o comando não vaza o tipo para o estado anterior (cópia profunda no clone)', () => {
    const { model, openingId } = paredeComPorta(P1);
    const clone = cloneModel(model);
    clone.openings[0].esquadria!.nome = 'ALTERADO';
    expect(model.openings[0].esquadria?.nome).toBe('P1');
    void openingId;
  });
});

describe('esquadria · 4. a cópia leva o tipo', () => {
  it('duplicar o pavimento copia a esquadria sem compartilhar o objeto', () => {
    const { model } = paredeComPorta(P1);
    const dup = applyCommand(model, {
      type: 'DuplicateLevel',
      levelId: model.levels[0].id,
      novoNome: 'Pavimento 1',
      elevationMm: 2920,
    }).model;
    expect(dup.openings).toHaveLength(2);
    expect(dup.openings[1].esquadria).toEqual(P1);
    expect(dup.openings[1].esquadria).not.toBe(dup.openings[0].esquadria);
    expect(dup.openings[1].uid).not.toBe(dup.openings[0].uid);
  });
});

describe('esquadria · 5. os invariantes', () => {
  const esperaCodigo = (fn: () => unknown, codigo: string) => {
    try {
      fn();
    } catch (e) {
      expect((e as { code?: string }).code).toBe(codigo);
      return;
    }
    throw new Error(`esperava ${codigo}, e nada foi lançado`);
  };

  it('recusa tipo sem nome', () => {
    const { model, openingId } = paredeComPorta();
    esperaCodigo(
      () =>
        applyCommand(model, {
          type: 'SetOpeningEsquadria',
          openingId,
          esquadria: { nome: '   ', itemCode: '1', descricao: '' },
        }),
      'BAD_ESQUADRIA',
    );
  });

  it('recusa esquadria em VÃO LIVRE — não há caixilho a comprar', () => {
    const { model, openingId } = paredeComPorta(P1);
    esperaCodigo(
      () => applyCommand(model, { type: 'SetOpeningKind', openingId, kind: 'passage' }),
      'BAD_ESQUADRIA',
    );
  });

  it('item vazio é legítimo: tipo nomeado antes de escolher o item', () => {
    const { model, openingId } = paredeComPorta();
    const depois = applyBatch(model, [
      { type: 'SetOpeningEsquadria', openingId, esquadria: { nome: 'P1', itemCode: '', descricao: '' } },
    ]).model;
    expect(depois.openings[0].esquadria?.itemCode).toBe('');
  });
});
