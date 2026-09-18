/**
 * Duplicar · Espelhar · Isolar — os gestos do acesso rápido (17/09/2026) — e o
 * comando `MirrorEntities` do kernel que o espelhar usa. Girar · Alinhar ·
 * Matriz (18/09/2026, roadmap E0.1) e o `RotateEntities` do girar.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import { applyBatch } from '../utils/blueprintKernel';
import {
  caixaDaSelecao,
  comandoDeDuplicacao,
  comandoDeEspelhamento,
  comandoDeRotacao,
  comandosDeAlinhamento,
  comandosDeMatriz,
  familiasDaSelecao,
  idsParaIsolar,
} from '../utils/blueprintSelecao';

/** Uma parede de 6 m no eixo X com uma porta, um pilar girado e uma tomada. */
function cena() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  let r = applyCommand(m, { type: 'AddWall', levelId, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 });
  m = r.model;
  const wallId = r.diff.created[0];
  r = applyCommand(m, { type: 'AddOpening', wallId, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 });
  m = r.model;
  const doorId = r.diff.created[0];
  r = applyCommand(m, {
    type: 'AddStructural', levelId, kind: 'PILAR', pontos: [point(1000, 2000)],
    larguraMm: 400, profundidadeMm: 200, alturaMm: 2800, rotacaoDeg: 30,
  });
  m = r.model;
  const pilarId = r.diff.created[0];
  r = applyCommand(m, {
    type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', at: point(3000, 1000), cotaMm: 300,
    tipoEletrico: 'TUG', potenciaW: 100,
  });
  m = r.model;
  const tugId = r.diff.created[0];
  return { m, levelId, wallId, doorId, pilarId, tugId };
}

const parede = (m: BlueprintModel, id: string) => m.walls.find((w) => w.id === id)!;

describe('familiasDaSelecao', () => {
  it('separa por família e deixa de fora a porta cuja parede está selecionada', () => {
    const { m, wallId, doorId, pilarId, tugId } = cena();
    const f = familiasDaSelecao(m, [wallId, doorId, pilarId, tugId, 'inexistente']);
    expect(f.wallIds).toEqual([wallId]);
    expect(f.openingIds).toEqual([]); // vai com a parede
    expect(f.structuralIds).toEqual([pilarId]);
    expect(f.terminalIds).toEqual([tugId]);
    expect(familiasDaSelecao(m, [doorId]).openingIds).toEqual([doorId]); // avulsa
  });
});

describe('duplicar', () => {
  it('cópia cai um passo para a direita e para baixo, e nasce selecionável', () => {
    const { m, levelId, wallId, pilarId } = cena();
    const r = comandoDeDuplicacao(m, [wallId, pilarId], levelId, 500);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comando).toMatchObject({ type: 'DuplicateEntities', delta: { x: 500, y: -500 } });
    const depois = applyCommand(m, r.comando);
    expect(depois.diff.created.length).toBeGreaterThanOrEqual(2);
    expect(depois.model.walls).toHaveLength(2);
    expect(depois.model.structures).toHaveLength(2);
    // A porta da parede copiada foi junto (DuplicateEntities leva as da parede).
    expect(depois.model.openings).toHaveLength(2);
  });

  it('porta avulsa duplica NA MESMA PAREDE, depois do vão; sem espaço, avisa', () => {
    const { m, levelId, doorId, wallId } = cena();
    const r = comandoDeDuplicacao(m, [doorId], levelId, 200);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comando).toMatchObject({
      type: 'DuplicateEntities',
      openings: [{ openingId: doorId, wallId, offsetMm: 1000 + 900 + 200 }],
    });
    const depois = applyCommand(m, r.comando).model;
    expect(depois.openings).toHaveLength(2);

    // Parede curta: a segunda porta não cabe.
    let curta = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const lv = curta.levels[0].id;
    let x = applyCommand(curta, { type: 'AddWall', levelId: lv, a: point(0, 0), b: point(2000, 0), thicknessMm: 150, heightMm: 2800 });
    curta = x.model;
    x = applyCommand(curta, { type: 'AddOpening', wallId: x.diff.created[0], kind: 'door', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 });
    const naoCabe = comandoDeDuplicacao(x.model, [x.diff.created[0]], lv, 200);
    expect(naoCabe.ok).toBe(false);
    if (!naoCabe.ok) expect(naoCabe.aviso).toMatch(/não cabe/);
  });

  it('seleção vazia ou só de tomada não duplica, e diz por quê', () => {
    const { m, levelId, tugId } = cena();
    expect(comandoDeDuplicacao(m, [], levelId, 500).ok).toBe(false);
    const r = comandoDeDuplicacao(m, [tugId], levelId, 500);
    expect(r.ok).toBe(false);
  });
});

describe('espelhar (MirrorEntities)', () => {
  it('a peça sozinha vira NO LUGAR: o pilar mantém o centro e nega o giro', () => {
    const { m, pilarId } = cena();
    const r = comandoDeEspelhamento(m, [pilarId], 'VERTICAL');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const depois = applyCommand(m, r.comando).model;
    const p = depois.structures.find((s) => s.id === pilarId)!;
    expect(p.pontos[0]).toEqual({ x: 1000, y: 2000 });
    expect(p.rotacaoDeg).toBe(330);
  });

  it('o conjunto vira como bloco em torno do centro da caixa; a porta acompanha e inverte o lado de abrir', () => {
    const { m, wallId, doorId, pilarId, tugId } = cena();
    const f = familiasDaSelecao(m, [wallId, pilarId, tugId]);
    const caixa = caixaDaSelecao(m, f)!;
    // Parede 0..6000 em x; o pilar (contorno girado) e a tomada estão dentro.
    expect(caixa.minX).toBe(0);
    expect(caixa.maxX).toBe(6000);

    const r = comandoDeEspelhamento(m, [wallId, pilarId, tugId], 'VERTICAL');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comando).toMatchObject({ type: 'MirrorEntities', eixo: 'VERTICAL', em: 3000 });
    const depois = applyCommand(m, r.comando).model;

    const w = parede(depois, wallId);
    expect(w.a).toEqual({ x: 6000, y: 0 });
    expect(w.b).toEqual({ x: 0, y: 0 });
    const porta = depois.openings.find((o) => o.id === doorId)!;
    // offset medido de `a`, que agora está em x=6000: a porta fica em 6000−1000.
    expect(porta.offsetMm).toBe(1000);
    expect(porta.swingReversed).toBe(true);
    expect(depois.structures.find((s) => s.id === pilarId)!.pontos[0]).toEqual({ x: 5000, y: 2000 });
    expect(depois.terminais!.find((t) => t.id === tugId)!.at).toEqual({ x: 3000, y: 1000 });

    // O original não foi tocado (applyCommand trabalha em cópia).
    expect(parede(m, wallId).a).toEqual({ x: 0, y: 0 });
  });

  it('HORIZONTAL reflete em y; centro em meio milímetro continua dando inteiro', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const lv = m.levels[0].id;
    // Duas paredes: y de 0 a 1001 → centro 500,5.
    let r = applyCommand(m, { type: 'AddWall', levelId: lv, a: point(0, 0), b: point(3000, 0), thicknessMm: 150, heightMm: 2800 });
    m = r.model;
    const w1 = r.diff.created[0];
    r = applyCommand(m, { type: 'AddWall', levelId: lv, a: point(0, 1001), b: point(3000, 1001), thicknessMm: 150, heightMm: 2800 });
    m = r.model;
    const w2 = r.diff.created[0];
    const e = comandoDeEspelhamento(m, [w1, w2], 'HORIZONTAL');
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.comando).toMatchObject({ em: 500.5 });
    const depois = applyCommand(m, e.comando).model;
    expect(parede(depois, w1).a.y).toBe(1001);
    expect(parede(depois, w2).a.y).toBe(0);
  });

  it('só porta avulsa: nada para espelhar, com aviso', () => {
    const { m, doorId } = cena();
    const r = comandoDeEspelhamento(m, [doorId], 'VERTICAL');
    expect(r.ok).toBe(false);
  });

  it('o kernel recusa o comando vazio', () => {
    const { m } = cena();
    expect(() =>
      applyCommand(m, { type: 'MirrorEntities', wallIds: [], boundaryIds: [], structuralIds: [], eixo: 'VERTICAL', em: 0 }),
    ).toThrow(/espelhar/i);
  });
});

describe('isolar', () => {
  it('esconde tudo do pavimento menos a seleção — e a porta da parede selecionada fica', () => {
    const { m, levelId, wallId, doorId, pilarId, tugId } = cena();
    const ocultar = idsParaIsolar(m, levelId, [wallId]);
    expect(ocultar).not.toContain(wallId);
    expect(ocultar).not.toContain(doorId);
    expect(ocultar).toContain(pilarId);
    expect(ocultar).toContain(tugId);
    // Isolando o pilar, a porta some junto com a parede.
    expect(idsParaIsolar(m, levelId, [pilarId])).toEqual(expect.arrayContaining([wallId, doorId, tugId]));
  });
});

describe('girar (RotateEntities)', () => {
  it('90° é EXATO: a parede de 6 m vira vertical em torno do centro da caixa, a porta mantém o offset e o lado de abrir', () => {
    const { m, wallId, doorId } = cena();
    const r = comandoDeRotacao(m, [wallId], 90);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comando).toMatchObject({ type: 'RotateEntities', anguloGraus: 90, centro: { x: 3000, y: 0 } });
    const depois = applyCommand(m, r.comando).model;
    const w = parede(depois, wallId);
    // (0,0) → (3000, −3000); (6000,0) → (3000, 3000).
    expect(w.a).toEqual({ x: 3000, y: -3000 });
    expect(w.b).toEqual({ x: 3000, y: 3000 });
    const porta = depois.openings.find((o) => o.id === doorId)!;
    expect(porta.offsetMm).toBe(1000);
    expect(porta.swingReversed).toBe(m.openings.find((o) => o.id === doorId)!.swingReversed);
  });

  it('o pilar sozinho gira NO LUGAR e soma o giro; a tomada ganha rotação; −90 normaliza para 270', () => {
    const { m, pilarId, tugId } = cena();
    const r = comandoDeRotacao(m, [pilarId], -90);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const depois = applyCommand(m, r.comando).model;
    const p = depois.structures.find((s) => s.id === pilarId)!;
    expect(p.pontos[0]).toEqual({ x: 1000, y: 2000 });
    expect(p.rotacaoDeg).toBe((30 + 270) % 360);
    const r2 = comandoDeRotacao(m, [tugId], 180);
    if (!r2.ok) throw new Error(r2.aviso);
    const t = applyCommand(m, r2.comando).model.terminais!.find((x) => x.id === tugId)!;
    expect(t.at).toEqual({ x: 3000, y: 1000 });
    expect(t.rotacaoGraus).toBe(180);
  });

  it('ângulo fora dos múltiplos de 90 arredonda ao milímetro sem abrir a junção, e a porta continua cabendo', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const lv = m.levels[0].id;
    let r = applyCommand(m, { type: 'AddWall', levelId: lv, a: point(0, 0), b: point(3333, 0), thicknessMm: 150, heightMm: 2800 });
    m = r.model;
    const w1 = r.diff.created[0];
    r = applyCommand(m, { type: 'AddWall', levelId: lv, a: point(3333, 0), b: point(3333, 2222), thicknessMm: 150, heightMm: 2800 });
    m = r.model;
    const w2 = r.diff.created[0];
    // Porta encostada na ponta b: se o giro encurtar a parede em 1 mm, ela tem de recuar.
    m = applyCommand(m, { type: 'AddOpening', wallId: w1, kind: 'door', offsetMm: 3333 - 800, widthMm: 800, heightMm: 2100, sillMm: 0 }).model;
    const g = comandoDeRotacao(m, [w1, w2], 37);
    if (!g.ok) throw new Error(g.aviso);
    const depois = applyCommand(m, g.comando).model;
    const a = parede(depois, w1);
    const b = parede(depois, w2);
    expect(a.b).toEqual(b.a); // o vértice compartilhado continua um só
    expect(Number.isInteger(a.a.x) && Number.isInteger(a.a.y)).toBe(true);
    const comp = Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y);
    expect(Math.abs(comp - 3333)).toBeLessThanOrEqual(1);
    const porta = depois.openings[0];
    expect(porta.offsetMm + porta.widthMm).toBeLessThanOrEqual(comp);
  });

  it('0° não gera comando; só porta avulsa não gira; o kernel recusa vazio e ângulo fracionário', () => {
    const { m, wallId, doorId } = cena();
    expect(comandoDeRotacao(m, [wallId], 360).ok).toBe(false);
    expect(comandoDeRotacao(m, [doorId], 90).ok).toBe(false);
    expect(() =>
      applyCommand(m, { type: 'RotateEntities', wallIds: [], boundaryIds: [], structuralIds: [], anguloGraus: 90, centro: point(0, 0) }),
    ).toThrow(/girar/i);
    expect(() =>
      applyCommand(m, { type: 'RotateEntities', wallIds: [wallId], boundaryIds: [], structuralIds: [], anguloGraus: 45.5, centro: point(0, 0) }),
    ).toThrow(/inteiro/);
  });
});

describe('alinhar', () => {
  /** Referência em y=0; uma parede paralela em y=300 (torta 1 mm em 6 m, ainda paralela), uma perpendicular, um pilar. */
  function cenaDeAlinhar() {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const lv = m.levels[0].id;
    const add = (a: ReturnType<typeof point>, b: ReturnType<typeof point>) => {
      const r = applyCommand(m, { type: 'AddWall', levelId: lv, a, b, thicknessMm: 150, heightMm: 2800 });
      m = r.model;
      return r.diff.created[0];
    };
    const ref = add(point(0, 0), point(6000, 0));
    const paralela = add(point(8000, 300), point(14000, 301));
    const perpendicular = add(point(20000, 0), point(20000, 3000));
    const r = applyCommand(m, {
      type: 'AddStructural', levelId: lv, kind: 'PILAR', pontos: [point(4000, 700)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, rotacaoDeg: 0,
    });
    m = r.model;
    const pilar = r.diff.created[0];
    return { m, lv, ref, paralela, perpendicular, pilar };
  }

  it('a paralela e o pilar caem na reta da referência; a perpendicular fica, com aviso', () => {
    const { m, ref, paralela, perpendicular, pilar } = cenaDeAlinhar();
    const r = comandosDeAlinhamento(m, [paralela, perpendicular, pilar, ref], ref);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.aviso).toMatch(/1 peça\(s\) não paralela/);
    // Dois deslocamentos distintos (−300/−301 arredonda o meio para −300... e −700) → 2 comandos.
    expect(r.comandos).toHaveLength(2);
    const depois = applyBatch(m, r.comandos).model;
    const p = parede(depois, paralela);
    expect(Math.abs(p.a.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.b.y)).toBeLessThanOrEqual(1);
    expect(p.a.x).toBe(8000); // andou só na perpendicular
    expect(depois.structures.find((s) => s.id === pilar)!.pontos[0]).toEqual({ x: 4000, y: 0 });
    expect(parede(depois, perpendicular).a).toEqual({ x: 20000, y: 0 });
    expect(parede(depois, ref).a).toEqual({ x: 0, y: 0 }); // a referência não anda
  });

  it('tudo já alinhado → sem comando; referência inválida → aviso', () => {
    const { m, ref, perpendicular, pilar } = cenaDeAlinhar();
    const primeira = comandosDeAlinhamento(m, [pilar, ref], ref);
    if (!primeira.ok) throw new Error(primeira.aviso);
    const ja = applyBatch(m, primeira.comandos).model;
    expect(comandosDeAlinhamento(ja, [pilar, ref], ref)).toMatchObject({ ok: false, aviso: /já está alinhado/ });
    expect(comandosDeAlinhamento(m, [perpendicular, ref], pilar)).toMatchObject({ ok: false, aviso: /parede ou divisa/ });
  });
});

describe('matriz', () => {
  it('N−1 cópias a k·passo, num lote só; instalações ficam de fora com aviso', () => {
    const { m, levelId, wallId, pilarId, tugId } = cena();
    const r = comandosDeMatriz(m, [wallId, pilarId, tugId], levelId, { quantidade: 4, passoXMm: 0, passoYMm: 3500 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comandos).toHaveLength(3);
    expect(r.comandos[2]).toMatchObject({ type: 'DuplicateEntities', delta: { x: 0, y: 10500 } });
    expect(r.aviso).toMatch(/1 peça/);
    const depois = applyBatch(m, r.comandos).model;
    expect(depois.walls).toHaveLength(4);
    expect(depois.structures).toHaveLength(4);
    expect(depois.openings).toHaveLength(4); // a porta veio com cada parede
    expect(depois.walls.map((w) => w.a.y).sort((a, b) => a - b)).toEqual([0, 3500, 7000, 10500]);
  });

  it('recusa quantidade < 2, passo zero e seleção sem geometria copiável', () => {
    const { m, levelId, wallId, tugId } = cena();
    expect(comandosDeMatriz(m, [wallId], levelId, { quantidade: 1, passoXMm: 500, passoYMm: 0 }).ok).toBe(false);
    expect(comandosDeMatriz(m, [wallId], levelId, { quantidade: 3, passoXMm: 0, passoYMm: 0 }).ok).toBe(false);
    expect(comandosDeMatriz(m, [tugId], levelId, { quantidade: 3, passoXMm: 500, passoYMm: 0 }).ok).toBe(false);
  });
});
