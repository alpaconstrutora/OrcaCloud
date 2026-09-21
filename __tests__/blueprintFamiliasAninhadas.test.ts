/**
 * FAMÍLIAS ANINHADAS (21/09/2026, backlog P2 — P2.18, kernel 0.52.0): o
 * CONJUNTO é um componente-pai; os filhos são componentes comuns com `paiUid`.
 * Inserir, mover, girar e apagar o pai arrasta os filhos; o filho segue
 * editável sozinho; canônico ida e volta pelo índice do pai.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, canonicalPayload, CATALOGO_DE_COMPONENTES, CONJUNTOS_DE_COMPONENTES, ehConjunto, emptyModel, extensaoDoConjunto, filhosDoConjunto, KERNEL_VERSION, modelFromCanonicalPayload, paiDoComponente, parseCanonicalPayload, point, TIPOS_DE_COMPONENTE } from '../utils/blueprintKernel';

function base() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, lvl: m.levels[0].id };
}

describe('famílias aninhadas (P2.18)', () => {
  it('catálogo: quatro conjuntos, filhos do catálogo, caixa envolvente coerente', () => {
    const conjuntos = TIPOS_DE_COMPONENTE.filter(ehConjunto);
    expect(conjuntos).toEqual(['CONJUNTO_BANHEIRO', 'CONJUNTO_JANTAR', 'CONJUNTO_DORMITORIO', 'CONJUNTO_COZINHA']);
    for (const t of conjuntos) {
      expect(CATALOGO_DE_COMPONENTES[t].simbolo).toBe('CONJUNTO');
      const filhos = CONJUNTOS_DE_COMPONENTES[t]!;
      expect(filhos.length).toBeGreaterThanOrEqual(3);
      for (const f of filhos) expect(ehConjunto(f.tipoId)).toBe(false);
      const ext = extensaoDoConjunto(t);
      expect(ext.larguraMm).toBeGreaterThan(1000);
      expect(ext.profundidadeMm).toBeGreaterThan(400);
    }
    expect(CONJUNTOS_DE_COMPONENTES.CONJUNTO_JANTAR!.filter((f) => f.tipoId === 'CADEIRA')).toHaveLength(4);
  });

  it('AddConjunto: pai + filhos com paiUid dentro da caixa do pai; mover/girar/apagar o pai leva os filhos; apagar um filho tira só ele; filho solto quando o pai some', () => {
    const { m, lvl } = base();
    let r = applyCommand(m, { type: 'AddConjunto', levelId: lvl, tipoId: 'CONJUNTO_JANTAR', at: point(5000, 4000) }).model;
    const pai = r.componentes!.find((c) => c.tipoId === 'CONJUNTO_JANTAR')!;
    const filhos = filhosDoConjunto(r, pai);
    expect(filhos).toHaveLength(5);
    expect(filhos.map((f) => f.tipoId).sort()).toEqual(['CADEIRA', 'CADEIRA', 'CADEIRA', 'CADEIRA', 'MESA_JANTAR']);
    expect(paiDoComponente(r, filhos[0])).toBe(pai);
    // Cada filho cabe na caixa do pai (centro em `at`).
    for (const f of filhos) {
      expect(Math.abs(f.at.x - pai.at.x) + (f.rotacaoGraus % 180 === 0 ? f.larguraMm : f.profundidadeMm) / 2).toBeLessThanOrEqual(pai.larguraMm / 2 + 1);
      expect(Math.abs(f.at.y - pai.at.y) + (f.rotacaoGraus % 180 === 0 ? f.profundidadeMm : f.larguraMm) / 2).toBeLessThanOrEqual(pai.profundidadeMm / 2 + 1);
    }
    const mesa = filhos.find((f) => f.tipoId === 'MESA_JANTAR')!;
    expect(mesa.at).toEqual(point(5000, 4000));
    // Mover o pai: todos andam o mesmo vetor.
    r = applyCommand(r, { type: 'MoveComponente', componenteId: pai.id, to: point(6000, 4500) }).model;
    expect(r.componentes!.find((c) => c.id === mesa.id)!.at).toEqual(point(6000, 4500));
    expect(filhosDoConjunto(r, pai).every((f) => Math.abs(f.at.x - 6000) <= 400 && Math.abs(f.at.y - 4500) <= 750)).toBe(true);
    // Girar o pai 90°: a cadeira que estava ao norte (+y) vai para oeste (−x); os giros somam.
    const cadeiraNorte = filhosDoConjunto(r, pai).find((f) => f.tipoId === 'CADEIRA' && f.at.y > 4500 && f.at.x < 6000)!;
    r = applyCommand(r, { type: 'SetComponenteProps', componenteId: pai.id, rotacaoGraus: 90 }).model;
    const girada = r.componentes!.find((c) => c.id === cadeiraNorte.id)!;
    expect(girada.at).toEqual(point(6000 - (cadeiraNorte.at.y - 4500), 4500 + (cadeiraNorte.at.x - 6000)));
    expect(girada.rotacaoGraus).toBe((cadeiraNorte.rotacaoGraus + 90) % 360);
    expect(r.componentes!.find((c) => c.id === pai.id)!.rotacaoGraus).toBe(90);
    // Translação em lote do pai (setas/arraste): filhos vão junto uma vez só, mesmo se um filho também estiver na seleção.
    const t = applyCommand(r, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], componenteIds: [pai.id, mesa.id], delta: point(100, 0), manterJuncoes: false }).model;
    expect(t.componentes!.find((c) => c.id === mesa.id)!.at.x).toBe(6100);
    expect(t.componentes!.find((c) => c.id === pai.id)!.at.x).toBe(6100);
    // Apagar um filho tira só ele; apagar o pai apaga o resto.
    const semUmaCadeira = applyCommand(r, { type: 'DeleteComponente', componenteId: girada.id }).model;
    expect(semUmaCadeira.componentes).toHaveLength(5);
    const semConjunto = applyCommand(semUmaCadeira, { type: 'DeleteComponente', componenteId: pai.id }).model;
    expect(semConjunto.componentes).toHaveLength(0);
    // Invariantes: filho apontando para um não-conjunto é recusado; conjunto dentro de conjunto também.
    const solto = applyCommand(r, { type: 'AddComponente', levelId: lvl, tipoId: 'SOFA', at: point(0, 0) }).model;
    const sofa = solto.componentes!.find((c) => c.tipoId === 'SOFA')!;
    const quebrado = { ...solto, componentes: solto.componentes!.map((c) => (c.id === mesa.id ? { ...c, paiUid: sofa.uid } : c)) };
    expect(() => applyCommand(quebrado, { type: 'AddLevel', name: 'x', elevationMm: 9000, defaultHeightMm: 2800 })).toThrow(/BAD_COMPONENT|não é um conjunto/);
    expect(() => applyCommand(r, { type: 'AddConjunto', levelId: lvl, tipoId: 'SOFA', at: point(0, 0) })).toThrow(/não é um conjunto/);
  });

  it('canônico: o pai por índice; ida e volta preserva os vínculos; componente solto não ganha chave', () => {
    const { m, lvl } = base();
    let r = applyCommand(m, { type: 'AddConjunto', levelId: lvl, tipoId: 'CONJUNTO_BANHEIRO', at: point(2000, 1500), rotacaoGraus: 90 }).model;
    r = applyCommand(r, { type: 'AddComponente', levelId: lvl, tipoId: 'SOFA', at: point(9000, 9000) }).model;
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.57.0');
    const payload = parseCanonicalPayload(canonicalPayload(r));
    const comPai = payload.componentes!.filter((c) => c.pai !== undefined);
    expect(comPai).toHaveLength(3);
    const idxPai = comPai[0].pai!;
    expect(payload.componentes![idxPai].tipoId).toBe('CONJUNTO_BANHEIRO');
    expect(payload.componentes!.find((c) => c.tipoId === 'SOFA')!.pai).toBeUndefined();
    expect(payload.componentes!.find((c) => c.tipoId === 'CONJUNTO_BANHEIRO')!.pai).toBeUndefined();
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(canonicalPayload(r));
    const paiVolta = volta.componentes!.find((c) => c.tipoId === 'CONJUNTO_BANHEIRO')!;
    expect(filhosDoConjunto(volta, paiVolta)).toHaveLength(3);
    // Os filhos giraram com o pai (90°): o box, que estava à direita (+x), foi para cima (+y).
    const box = filhosDoConjunto(r, r.componentes!.find((c) => c.tipoId === 'CONJUNTO_BANHEIRO')!).find((f) => f.tipoId === 'BOX')!;
    expect(box.at.y).toBeGreaterThan(1500);
    expect(box.rotacaoGraus).toBe(90);
  });
});
