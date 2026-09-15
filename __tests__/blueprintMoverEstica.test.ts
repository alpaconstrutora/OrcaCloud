/**
 * MOVER UMA PAREDE CONECTADA ESTICA A VIZINHA (14/09/2026).
 *
 * Pedido: *"Ao mover uma parede conectada ela está sendo desconectada, isso
 * não deve ser o comportamento padrão. A parede deve permanecer conectada a
 * outra parede ao mover uma a outra estica (stretch)."*
 *
 * A regra anterior projetava o delta no eixo da vizinha. Servia ao caso
 * perpendicular exato e a mais nada: um delta com componente ao longo da
 * parede movida (arraste com orto solto, ou corrigido pelo encaixe), ou uma
 * vizinha fora do esquadro, deixava a ponta da vizinha FORA da reta nova da
 * parede — e o canto abria. A regra agora é a do CAD: a junta é a INTERSEÇÃO
 * da reta da vizinha com a reta nova da parede movida; a vizinha estica ou
 * encurta até lá, e a parede movida, quando a junta era na ponta dela, tem a
 * ponta levada ao canto (o "trim/extend" do Revit).
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  pontasDeslocadas,
  reservaDeAberturas,
  wallLength,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';

function nivel() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, levelId: m.levels[0].id };
}
const parede = (levelId: string, ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
});
/** Sala 4000 × 3000: sul (0,0)→(4000,0), leste, norte, oeste. */
function sala() {
  const { m, levelId } = nivel();
  const built = applyBatch(m, [
    parede(levelId, 0, 0, 4000, 0),
    parede(levelId, 4000, 0, 4000, 3000),
    parede(levelId, 4000, 3000, 0, 3000),
    parede(levelId, 0, 3000, 0, 0),
  ]).model;
  const [sul, leste, norte, oeste] = built.walls;
  return { m: built, levelId, sul, leste, norte, oeste };
}
const mover = (m: BlueprintModel, ids: string[], dx: number, dy: number) =>
  applyCommand(m, { type: 'TranslateEntities', wallIds: ids, boundaryIds: [], delta: point(dx, dy), manterJuncoes: true }).model;
const w = (m: BlueprintModel, id: string) => m.walls.find((x) => x.id === id)!;

describe('mover parede conectada estica a vizinha — o canto é a interseção das retas', () => {
  it('perpendicular exato continua igual: sul sobe 1000, leste e oeste encurtam, ambiente fecha', () => {
    const { m, sul, leste, oeste } = sala();
    const d = mover(m, [sul.id], 0, 1000);
    expect(w(d, leste.id).a).toEqual({ x: 4000, y: 1000 });
    expect(w(d, oeste.id).b).toEqual({ x: 0, y: 1000 });
    expect(d.spaces).toHaveLength(1);
    expect(d.spaces[0].areaMm2).toBe(4000 * 2000);
  });

  it('⚠️ delta com componente paralela (arraste fora do esquadro): o canto NÃO abre — a vizinha vai até a reta nova', () => {
    // O defeito relatado: (300, -1000) — 1 m para fora e 30 cm de deriva no
    // eixo da sul. A regra antiga levava a ponta da leste a (4000, -1000),
    // que está na reta nova da sul, mas a sul rígida ia de 300 a 4300 e a
    // oeste ficava para trás em (0, -1000), fora da sul — canto aberto.
    const { m, sul, leste, oeste } = sala();
    const conta = pontasDeslocadas(m.walls, [sul.id], point(300, -1000), true);
    expect(conta.soltas).toEqual([]);
    const d = mover(m, [sul.id], 300, -1000);
    expect(w(d, leste.id).a).toEqual({ x: 4000, y: -1000 });
    expect(w(d, oeste.id).b).toEqual({ x: 0, y: -1000 });
    // A sul foi levada aos DOIS cantos: a deriva de 300 mm ao longo dela mesma
    // é absorvida pelas juntas (é o que "conectada" quer dizer).
    expect(w(d, sul.id).a).toEqual({ x: 0, y: -1000 });
    expect(w(d, sul.id).b).toEqual({ x: 4000, y: -1000 });
    expect(d.spaces).toHaveLength(1);
    expect(d.spaces[0].areaMm2).toBe(4000 * 4000);
  });

  it('vizinha FORA DO ESQUADRO (45°) acompanha até a reta nova, sem virar solta', () => {
    // Sul (0,0)→(4000,0); diagonal (4000,0)→(6000,2000). Subir a sul 500 mm:
    // a diagonal tem de terminar em y = 500 sobre a própria reta → (4500, 500).
    // A projeção do delta no eixo dela dava (4250, 250): fora da sul nova.
    const { m, levelId } = nivel();
    const built = applyBatch(m, [parede(levelId, 0, 0, 4000, 0), parede(levelId, 4000, 0, 6000, 2000)]).model;
    const [sul, diag] = built.walls;
    const conta = pontasDeslocadas(built.walls, [sul.id], point(0, 500), true);
    expect(conta.soltas).toEqual([]);
    const d = mover(built, [sul.id], 0, 500);
    expect(w(d, diag.id).a).toEqual({ x: 4500, y: 500 });
    expect(w(d, diag.id).b).toEqual({ x: 6000, y: 2000 });
    // A sul, cuja ponta b hospedava a junta, é estendida até o canto.
    expect(w(d, sul.id).b).toEqual({ x: 4500, y: 500 });
    expect(w(d, sul.id).a).toEqual({ x: 0, y: 500 });
  });

  it('deslize PARALELO com as duas pontas em canto: as juntas seguram — a parede não sai do lugar', () => {
    // No CAD, mover ao longo do próprio eixo uma parede presa nos dois cantos
    // não a faz avançar: as pontas são levadas de volta aos cantos.
    const { m, sul, leste, oeste } = sala();
    const d = mover(m, [sul.id], 500, 0);
    expect(w(d, sul.id).a).toEqual({ x: 0, y: 0 });
    expect(w(d, sul.id).b).toEqual({ x: 4000, y: 0 });
    expect(w(d, leste.id).a).toEqual({ x: 4000, y: 0 });
    expect(w(d, oeste.id).b).toEqual({ x: 0, y: 0 });
    expect(d.spaces).toHaveLength(1);
  });

  it('junção em T (pé no CORPO) desliza no corpo; se o corpo sai de baixo dele, é solta — não se inventa canto', () => {
    const { m, levelId, sul } = sala();
    const comT = applyCommand(m, parede(levelId, 2000, 0, 2000, 3000)).model;
    const divisoria = comT.walls[comT.walls.length - 1];
    // Sobe: o pé acompanha, vertical.
    const d = mover(comT, [sul.id], 0, -1000);
    expect(w(d, divisoria.id).a).toEqual({ x: 2000, y: -1000 });
    expect(d.spaces).toHaveLength(2);
    // Desliza 300 mm: o pé fica no mesmo corpo, nada solta; a sul NÃO ganha
    // stub — os cantos com leste e oeste a seguram no lugar.
    const c2 = pontasDeslocadas(comT.walls, [sul.id], point(300, 0), true);
    expect(c2.soltas).toEqual([]);
    // Parede solta (sem cantos) com um T no meio, deslizando 3000: o corpo sai
    // de baixo do pé → solta, reportada.
    const { m: m2, levelId: l2 } = nivel();
    const solto = applyBatch(m2, [parede(l2, 0, 0, 4000, 0), parede(l2, 2000, 0, 2000, 3000)]).model;
    const c3 = pontasDeslocadas(solto.walls, [solto.walls[0].id], point(3000, 0), true);
    expect(c3.soltas).toEqual([{ id: solto.walls[1].id, end: 'a' }]);
  });

  it('a abertura da parede movida fica no MESMO lugar do mundo quando a ponta `a` é estendida ou aparada', () => {
    // Porta a 500 mm de `a` na sul. Mover (300, -1000): a sul rígida iria de
    // 300 a 4300; o canto a leva de volta a 0 — `a` recua 300, e o offset da
    // porta sobe 300 para ela não andar.
    const { m, sul } = sala();
    const comPorta = applyCommand(m, { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 }).model;
    const d = mover(comPorta, [sul.id], 300, -1000);
    const porta = d.openings[0];
    expect(porta.offsetMm).toBe(800);
    expect(wallLength(w(d, sul.id))).toBe(4000);
    // E no sentido contrário (deriva -300): `a` avança 300, offset desce para 200.
    const d2 = mover(comPorta, [sul.id], -300, -1000);
    expect(d2.openings[0].offsetMm).toBe(200);
  });

  it('se aparar a ponta expulsaria a abertura, a parede fica rígida naquela ponta e a vizinha morre no corpo do stub — ainda encostada', () => {
    // Porta colada em `a` (offset 0). Deriva de -300: a sul rígida vai de -300
    // a 3700; o canto com a oeste está em (0, -1000), o que exigiria aparar
    // 300 mm de `a` → offset -300. Em vez de lançar, `a` fica em -300 (um stub
    // de 300 mm) e a oeste termina em (0, -1000), sobre o corpo da sul.
    const { m, sul, oeste } = sala();
    const comPorta = applyCommand(m, { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 0, widthMm: 900, heightMm: 2100, sillMm: 0 }).model;
    const conta = pontasDeslocadas(comPorta.walls, [sul.id], point(-300, -1000), true, reservaDeAberturas(comPorta));
    expect(conta.soltas).toEqual([]);
    expect(() => mover(comPorta, [sul.id], -300, -1000)).not.toThrow();
    const d = mover(comPorta, [sul.id], -300, -1000);
    expect(w(d, sul.id).a).toEqual({ x: -300, y: -1000 });
    expect(d.openings[0].offsetMm).toBe(0);
    expect(w(d, oeste.id).b).toEqual({ x: 0, y: -1000 });
    // O anel continua fechado: T sobre o stub.
    expect(d.spaces).toHaveLength(1);
    // A ponta `b` (rígida em 3700) é ESTENDIDA até o canto com a leste, em 4000.
    expect(w(d, sul.id).b).toEqual({ x: 4000, y: -1000 });
  });

  it('a prévia (`pontasDeslocadas`) e o comando dão a MESMA geometria', () => {
    const { m, sul } = sala();
    const conta = pontasDeslocadas(m.walls, [sul.id], point(300, -1000), true);
    const d = mover(m, [sul.id], 300, -1000);
    for (const [id, destino] of conta.destinos) {
      expect(w(d, id).a).toEqual(destino.a);
      expect(w(d, id).b).toEqual(destino.b);
    }
  });
});
