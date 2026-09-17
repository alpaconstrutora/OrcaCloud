/**
 * GESTOS SOBRE A SELEÇÃO — duplicar, espelhar, isolar (17/09/2026: os botões
 * do acesso rápido, *"implemente todos"*).
 *
 * Regra pura, sem React: o editor só entrega `model` + `selectedIds` e recebe
 * o comando (ou o aviso) de volta. A partição por família é a mesma para os
 * três gestos, e mora aqui para não nascer três vezes com três diferenças.
 *
 * ⚠️ Medições NÃO entram: são de outra camada e de outra gravação (ver
 * `useBlueprintMedicoes`), e nenhum destes gestos as toca.
 */
import type { BlueprintModel, Command, ObjectId, Point } from './blueprintKernel';
import { contornoEmPlanta } from './blueprintKernel';

/** A seleção separada por família — o formato que os comandos de lote pedem. */
export interface FamiliasDaSelecao {
  wallIds: ObjectId[];
  /** Só as aberturas cuja parede NÃO está na seleção (as outras vão com ela). */
  openingIds: ObjectId[];
  boundaryIds: ObjectId[];
  structuralIds: ObjectId[];
  aguaIds: ObjectId[];
  trechoIds: ObjectId[];
  terminalIds: ObjectId[];
  quadroIds: ObjectId[];
}

export function familiasDaSelecao(model: BlueprintModel, selectedIds: readonly string[]): FamiliasDaSelecao {
  const sel = new Set(selectedIds);
  const wallIds = model.walls.filter((w) => sel.has(w.id)).map((w) => w.id);
  const paredes = new Set(wallIds);
  return {
    wallIds,
    openingIds: model.openings.filter((o) => sel.has(o.id) && !paredes.has(o.wallId)).map((o) => o.id),
    boundaryIds: model.boundaries.filter((b) => sel.has(b.id)).map((b) => b.id),
    structuralIds: model.structures.filter((s) => sel.has(s.id)).map((s) => s.id),
    aguaIds: (model.roofs ?? []).filter((r) => sel.has(r.id)).map((r) => r.id),
    trechoIds: (model.trechos ?? []).filter((t) => sel.has(t.id)).map((t) => t.id),
    terminalIds: (model.terminais ?? []).filter((t) => sel.has(t.id)).map((t) => t.id),
    quadroIds: (model.quadros ?? []).filter((q) => sel.has(q.id)).map((q) => q.id),
  };
}

/** Quantas peças de kernel a partição alcança (abertura avulsa inclusive). */
export function tamanhoDasFamilias(f: FamiliasDaSelecao): number {
  return (
    f.wallIds.length +
    f.openingIds.length +
    f.boundaryIds.length +
    f.structuralIds.length +
    f.aguaIds.length +
    f.trechoIds.length +
    f.terminalIds.length +
    f.quadroIds.length
  );
}

/**
 * A caixa envolvente do que está selecionado, em mm — `null` quando nada tem
 * geometria no plano (seleção só de aberturas avulsas, por exemplo).
 */
export function caixaDaSelecao(
  model: BlueprintModel,
  f: FamiliasDaSelecao,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const marcar = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  const ids = (lista: ObjectId[]) => new Set(lista);
  const w = ids(f.wallIds);
  for (const x of model.walls) if (w.has(x.id)) (marcar(x.a), marcar(x.b));
  const b = ids(f.boundaryIds);
  for (const x of model.boundaries) if (b.has(x.id)) (marcar(x.a), marcar(x.b));
  const s = ids(f.structuralIds);
  // A estrutura entra pela SEÇÃO (contorno), não pelo eixo: espelhar um pilar
  // em torno do próprio centro tem de deixá-lo no lugar, e o centro da caixa
  // dos eixos de uma viga não é o centro da peça com a largura.
  for (const x of model.structures) if (s.has(x.id)) contornoEmPlanta(x).forEach(marcar);
  const a = ids(f.aguaIds);
  for (const x of model.roofs ?? []) if (a.has(x.id)) x.pontos.forEach(marcar);
  const t = ids(f.trechoIds);
  for (const x of model.trechos ?? []) if (t.has(x.id)) (marcar(x.a), marcar(x.b));
  const te = ids(f.terminalIds);
  for (const x of model.terminais ?? []) if (te.has(x.id)) marcar(x.at);
  const q = ids(f.quadroIds);
  for (const x of model.quadros ?? []) if (q.has(x.id)) marcar(x.at);
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export type Resultado = { ok: true; comando: Command; aviso: string | null } | { ok: false; aviso: string };

/**
 * DUPLICAR (Ctrl+D): a cópia cai ao lado, deslocada de `passoMm` em x e −y
 * (para a direita e para baixo na tela) — sem depender de onde está o cursor,
 * que é a diferença para Ctrl+V. Aberturas avulsas são copiadas NA MESMA
 * PAREDE, logo depois do vão original; a que não couber fica de fora, com aviso.
 *
 * Águas e instalações ficam de fora porque `DuplicateEntities` não as copia
 * (só paredes, limites, estruturas e aberturas) — o aviso diz o que não foi.
 */
export function comandoDeDuplicacao(
  model: BlueprintModel,
  selectedIds: readonly string[],
  levelId: ObjectId,
  passoMm: number,
): Resultado {
  const f = familiasDaSelecao(model, selectedIds);
  const passo = Math.max(1, Math.round(passoMm));
  const openings: { openingId: ObjectId; wallId: ObjectId; offsetMm: number }[] = [];
  let deFora = 0;
  for (const id of f.openingIds) {
    const o = model.openings.find((x) => x.id === id);
    const w = o && model.walls.find((x) => x.id === o.wallId);
    if (!o || !w) continue;
    const comprimento = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const offset = o.offsetMm + o.widthMm + passo;
    if (offset + o.widthMm > comprimento) {
      deFora++;
      continue;
    }
    openings.push({ openingId: o.id, wallId: w.id, offsetMm: Math.round(offset) });
  }
  if (f.wallIds.length === 0 && f.boundaryIds.length === 0 && f.structuralIds.length === 0 && openings.length === 0) {
    return {
      ok: false,
      aviso:
        deFora > 0
          ? 'A abertura não cabe duplicada na mesma parede.'
          : 'Nada que se possa duplicar está selecionado (paredes, esquadrias, estruturas ou divisas).',
    };
  }
  const ignorados = f.aguaIds.length + f.trechoIds.length + f.terminalIds.length + f.quadroIds.length;
  const avisos: string[] = [];
  if (deFora > 0) avisos.push(`${deFora} abertura(s) não coube(ram) na mesma parede e ficou(aram) de fora.`);
  if (ignorados > 0) avisos.push(`${ignorados} peça(s) de telhado/instalações não entram na duplicação.`);
  return {
    ok: true,
    comando: {
      type: 'DuplicateEntities',
      levelId,
      wallIds: f.wallIds,
      boundaryIds: f.boundaryIds,
      structuralIds: f.structuralIds,
      openings,
      delta: { x: passo, y: -passo },
    },
    aviso: avisos.length > 0 ? avisos.join(' ') : null,
  };
}

/**
 * ESPELHAR a seleção em torno do CENTRO da própria caixa: `'VERTICAL'` troca
 * esquerda ↔ direita (reta x = centro), `'HORIZONTAL'` troca frente ↔ fundos
 * (reta y = centro). A peça sozinha vira no lugar; o conjunto vira como um
 * bloco. Abertura avulsa não tem reflexão própria — ela acompanha a parede, e
 * sem a parede na seleção nada acontece com ela.
 */
export function comandoDeEspelhamento(
  model: BlueprintModel,
  selectedIds: readonly string[],
  eixo: 'VERTICAL' | 'HORIZONTAL',
): Resultado {
  const f = familiasDaSelecao(model, selectedIds);
  const caixa = caixaDaSelecao(model, f);
  if (!caixa) {
    return { ok: false, aviso: 'Nada que se possa espelhar está selecionado (esquadria sozinha acompanha a parede).' };
  }
  const em = eixo === 'VERTICAL' ? (caixa.minX + caixa.maxX) / 2 : (caixa.minY + caixa.maxY) / 2;
  return {
    ok: true,
    comando: {
      type: 'MirrorEntities',
      wallIds: f.wallIds,
      boundaryIds: f.boundaryIds,
      structuralIds: f.structuralIds,
      aguaIds: f.aguaIds,
      trechoIds: f.trechoIds,
      terminalIds: f.terminalIds,
      quadroIds: f.quadroIds,
      eixo,
      em,
    },
    aviso: f.openingIds.length > 0 ? 'A esquadria selecionada sem a parede não foi espelhada.' : null,
  };
}

/**
 * ISOLAR: os ids do pavimento que devem ficar OCULTOS para só a seleção
 * aparecer. As aberturas das paredes selecionadas continuam visíveis (a porta
 * é parte da parede); as demais somem com o resto.
 */
export function idsParaIsolar(
  model: BlueprintModel,
  levelId: ObjectId | null,
  selectedIds: readonly string[],
): string[] {
  const sel = new Set(selectedIds);
  const noNivel = <T extends { levelId: ObjectId }>(xs: readonly T[]) =>
    xs.filter((x) => !levelId || x.levelId === levelId);
  const paredesSel = new Set(model.walls.filter((w) => sel.has(w.id)).map((w) => w.id));
  const ocultar: string[] = [];
  for (const w of noNivel(model.walls)) if (!sel.has(w.id)) ocultar.push(w.id);
  for (const o of model.openings) {
    if (sel.has(o.id) || paredesSel.has(o.wallId)) continue;
    const w = model.walls.find((x) => x.id === o.wallId);
    if (!w || !levelId || w.levelId === levelId) ocultar.push(o.id);
  }
  for (const b of noNivel(model.boundaries)) if (!sel.has(b.id)) ocultar.push(b.id);
  for (const s of noNivel(model.structures)) if (!sel.has(s.id)) ocultar.push(s.id);
  for (const r of noNivel(model.roofs ?? [])) if (!sel.has(r.id)) ocultar.push(r.id);
  for (const e of noNivel(model.stairs ?? [])) if (!sel.has(e.id)) ocultar.push(e.id);
  for (const t of noNivel(model.trechos ?? [])) if (!sel.has(t.id)) ocultar.push(t.id);
  for (const t of noNivel(model.terminais ?? [])) if (!sel.has(t.id)) ocultar.push(t.id);
  for (const q of noNivel(model.quadros ?? [])) if (!sel.has(q.id)) ocultar.push(q.id);
  return ocultar;
}
