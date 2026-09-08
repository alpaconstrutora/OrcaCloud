/**
 * VARIANTES do arquivo de prova, para bissectar por que um receptor de terceiro
 * não mostrou as paredes.
 *
 * ─── O RELATO ───────────────────────────────────────────────────────────────
 *
 * Abrindo o IFC de prova, apareceram TELHADO e ESCADA; não apareceram PAREDES
 * nem PORTAS. E há um padrão no que sumiu: parede e porta são os únicos
 * elementos ligados por `IfcRelVoidsElement` — o vão fura a parede e a porta
 * preenche o vão. Telhado e escada não têm vão nenhum.
 *
 * ⚠️ Conferi a estrutura antes de acusar o vão, e ela está certa: as 4 paredes
 * existem, estão contidas no pavimento, têm `ObjectPlacement` e `Representation`
 * na ordem do schema, o vão tem 9 atributos com `.OPENING.` no fim, a relação
 * tem 6, e o placement do vão é RELATIVO ao da parede. O nosso próprio
 * visualizador (web-ifc) desenha tudo. Ou seja: teoria não decide isto.
 *
 * Então em vez de adivinhar, estas variantes isolam UMA diferença cada:
 *
 *   1. `so-paredes`      — 4 paredes, nada mais. Sem vão nenhum.
 *   2. `paredes-com-vao` — as mesmas paredes + 1 vão, SEM porta preenchendo.
 *   3. `paredes-com-porta` — + a porta no vão.
 *
 * Quem abrir as três responde a pergunta por eliminação: se a 1 aparece e a 2
 * não, o problema é o vão; se a 2 aparece e a 3 não, é o preenchimento.
 *
 * Roda com `IFC_PROVA=1`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';

const LIGADO = process.env.IFC_PROVA === '1';
const DESTINO = process.env.IFC_PROVA_DIR ?? 'C:/tmp/prova-ifc';

const H = 2800;
const T = 200;

function paredes(): { model: BlueprintModel; fachada: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: t,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });
  const model = applyBatch(base, [
    p(0, 0, 10000, 0),
    p(10000, 0, 10000, 6000),
    p(10000, 6000, 0, 6000),
    p(0, 6000, 0, 0),
  ]).model;
  return { model, fachada: model.walls.find((w) => w.a.y === 0 && w.b.y === 0)!.id };
}

const OPC = (titulo: string) => ({
  titulo,
  revisao: 1,
  hash: 'v'.repeat(64),
  data: new Date('2026-09-07T12:00:00Z'),
});

describe.skipIf(!LIGADO)('variantes do arquivo de prova', () => {
  it('escreve as três, cada uma com UMA diferença', () => {
    mkdirSync(DESTINO, { recursive: true });

    // 1. Só paredes. Se ESTA não abrir, o problema não é o vão.
    const so = paredes();
    const a = gerarIfc(so.model, OPC('1 - so paredes'));
    expect(a).toContain('IFCWALL(');
    expect(a).not.toContain('IFCOPENINGELEMENT(');
    writeFileSync(`${DESTINO}/1-so-paredes.ifc`, a, 'utf8');

    // 2. As mesmas paredes com UM vão livre — o vão fura, e nada o preenche.
    const comVao = paredes();
    const b = gerarIfc(
      applyCommand(comVao.model, {
        type: 'AddOpening',
        wallId: comVao.fachada,
        kind: 'passage',
        offsetMm: 2000,
        widthMm: 900,
        heightMm: 2100,
        sillMm: 0,
      }).model,
      OPC('2 - paredes com vao'),
    );
    expect(b).toContain('IFCOPENINGELEMENT(');
    expect(b).not.toContain('IFCDOOR(');
    writeFileSync(`${DESTINO}/2-paredes-com-vao.ifc`, b, 'utf8');

    // 3. O mesmo vão, agora com PORTA preenchendo.
    const comPorta = paredes();
    const c = gerarIfc(
      applyCommand(comPorta.model, {
        type: 'AddOpening',
        wallId: comPorta.fachada,
        kind: 'door',
        offsetMm: 2000,
        widthMm: 900,
        heightMm: 2100,
        sillMm: 0,
      }).model,
      OPC('3 - paredes com porta'),
    );
    expect(c).toContain('IFCDOOR(');
    expect(c).toContain('IFCRELFILLSELEMENT(');
    writeFileSync(`${DESTINO}/3-paredes-com-porta.ifc`, c, 'utf8');

    console.log(`variantes em ${DESTINO}: 1-so-paredes · 2-paredes-com-vao · 3-paredes-com-porta`);
  });
});
