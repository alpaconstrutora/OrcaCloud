/**
 * F3 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — O ELETRODUTO DO LAÇO.
 *
 * O laço de alarme (E7.4) era só uma RELAÇÃO (`centralAlarmeId`): o quantitativo
 * não contava tubo nenhum e o 3D não mostrava caminho. Aqui o laço ganha corpo:
 * eletrodutos da disciplina ELÉTRICA (rótulo "Laço de alarme"), da central a
 * cada dispositivo, em cadeia pelo mais perto — e, nos outros pavimentos, a
 * partir da PRUMADA na posição da central (um trecho vertical por pavimento).
 *
 * O eletroduto nasce `sugerido` e com o caminho em "L" (sobe na parede, corre na
 * laje — `segmentosDoEletroduto`), como todo eletroduto. Idempotente: o
 * dispositivo que já tem eletroduto do laço chegando nele não ganha outro.
 */
import type { BlueprintModel, Command, ObjectId, Point, Terminal } from './blueprintKernel';
import { TIPOS_DO_LACO_DE_ALARME } from './blueprintKernel';

export const ROTULO_DO_LACO = 'Laço de alarme';
/** O eletroduto do laço, mm (CONFERIR com o projeto elétrico). */
export const BITOLA_DO_LACO_MM = 20;

const chegaEm = (model: BlueprintModel, p: Point, levelId: ObjectId) =>
  (model.trechos ?? []).some((t) => t.disciplina === 'ELETRICA' && t.rotulo === ROTULO_DO_LACO && t.levelId === levelId && [t.a, t.b].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1));

export function proporEletrodutoDoLaco(model: BlueprintModel): Command[] {
  const ts = model.terminais ?? [];
  const lote: Command[] = [];
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  for (const central of ts.filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'CENTRAL_ALARME')) {
    const doLaco = ts.filter((t) => t.centralAlarmeId === central.id && TIPOS_DO_LACO_DE_ALARME.includes(t.tipoHidraulico ?? ''));
    const ic = niveis.findIndex((l) => l.id === central.levelId);
    const porNivel = new Map<ObjectId, Terminal[]>();
    for (const t of doLaco) porNivel.set(t.levelId, [...(porNivel.get(t.levelId) ?? []), t]);
    const trecho = (levelId: ObjectId, a: Point, ca: number, b: Point, cb: number): Command =>
      ({ type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cotaAMm: ca, cotaBMm: cb, bitolaMm: BITOLA_DO_LACO_MM, rotulo: ROTULO_DO_LACO, sugerido: true }) as Command;
    // A PRUMADA na posição da central, até o pavimento mais alto (e o mais baixo) com dispositivo:
    // no da central, da cota dela até o teto (sobe) e/ou do piso até ela (desce); nos de passagem, o
    // pavimento inteiro; no último de cada lado ela chega pela laje (sem trecho vertical ali).
    const indices = [...porNivel.keys()].map((id) => niveis.findIndex((l) => l.id === id)).filter((i) => i >= 0);
    const [i0, i1] = [Math.min(ic, ...indices), Math.max(ic, ...indices)];
    const verticais: [ObjectId, number, number][] = [];
    if (ic < i1) verticais.push([central.levelId, central.cotaMm, niveis[ic].defaultHeightMm]);
    if (ic > i0) verticais.push([central.levelId, 0, central.cotaMm]);
    for (let i = i0 + 1; i < i1; i++) if (i !== ic) verticais.push([niveis[i].id, 0, niveis[i].defaultHeightMm]);
    for (const [levelId, de, ate] of verticais) {
      if (ate - de < 1) continue;
      const jaTem = (model.trechos ?? []).some((t) => t.rotulo === ROTULO_DO_LACO && t.levelId === levelId && t.a.x === central.at.x && t.a.y === central.at.y && t.b.x === central.at.x && t.b.y === central.at.y && Math.min(t.cotaAMm, t.cotaBMm) === de);
      if (!jaTem) lote.push(trecho(levelId, central.at, de, central.at, ate));
    }
    // Em cada pavimento: a cadeia pelo mais perto, a partir da central (ou do pé da prumada).
    for (const [levelId, lista] of porNivel) {
      const i = niveis.findIndex((l) => l.id === levelId);
      // Do ponto da central, ou do pé (acima dela) / do topo (abaixo dela) da prumada.
      let atual: { p: Point; cota: number } = { p: central.at, cota: i === ic ? central.cotaMm : i > ic ? 0 : niveis[i].defaultHeightMm };
      const faltam = lista.filter((t) => !chegaEm(model, t.at, levelId));
      const restantes = [...faltam];
      while (restantes.length) {
        restantes.sort((a, b) => Math.hypot(a.at.x - atual.p.x, a.at.y - atual.p.y) - Math.hypot(b.at.x - atual.p.x, b.at.y - atual.p.y));
        const prox = restantes.shift()!;
        if (Math.hypot(prox.at.x - atual.p.x, prox.at.y - atual.p.y) >= 1 || Math.abs(prox.cotaMm - atual.cota) >= 1) lote.push(trecho(levelId, atual.p, atual.cota, prox.at, prox.cotaMm));
        atual = { p: prox.at, cota: prox.cotaMm };
      }
    }
  }
  return lote;
}
