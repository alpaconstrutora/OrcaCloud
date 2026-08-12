/**
 * Comandos, diff e histórico (PRD §12.3).
 *
 * ADR-01: o renderer não é o modelo. Todo gesto vira comando; todo comando é
 * validado pelo kernel e produz um diff. Nada muda o modelo por atribuição direta.
 *
 * IDEMPOTÊNCIA: repetir o mesmo `commandId` não duplica efeito. É o que permite ao
 * cliente reenviar um lote depois de uma queda de rede sem criar parede fantasma.
 */

import { KernelError } from './units';
import {
  type BlueprintModel,
  type ObjectId,
  type Opening,
  type Wall,
  assertModelInvariants,
  cloneModel,
  findWall,
  nextId,
  wallLength,
} from './model';
import { type Point, areCollinear, interiorPoint, pointInPolygon, pointsEqual } from './geom';
import { recomputeSpaces } from './arrangement';
import { snapshotHash } from './canonical';

export type Command =
  | { type: 'AddLevel'; name: string; elevationMm: number; defaultHeightMm: number }
  | {
      type: 'AddWall';
      levelId: ObjectId;
      a: Point;
      b: Point;
      thicknessMm: number;
      heightMm: number;
    }
  | {
      type: 'AddOpening';
      wallId: ObjectId;
      kind: 'door' | 'window';
      offsetMm: number;
      widthMm: number;
      heightMm: number;
      sillMm: number;
    }
  | { type: 'AddBoundary'; levelId: ObjectId; a: Point; b: Point }
  | { type: 'SetThickness'; wallId: ObjectId; thicknessMm: number }
  | { type: 'MoveVertex'; wallId: ObjectId; end: 'a' | 'b'; to: Point }
  | { type: 'SplitWall'; wallId: ObjectId; at: Point }
  | { type: 'MergeWalls'; firstId: ObjectId; secondId: ObjectId }
  | { type: 'DeleteWall'; wallId: ObjectId }
  | { type: 'DeleteOpening'; openingId: ObjectId }
  /** Nome vazio remove a etiqueta. */
  | { type: 'NameSpace'; spaceId: ObjectId; name: string };

export interface Diff {
  created: ObjectId[];
  updated: ObjectId[];
  deleted: ObjectId[];
  /** split/merge: quem veio de quem. Preserva linhagem quando o ID muda. */
  ancestry: Record<ObjectId, ObjectId[]>;
}

export interface CommandResult {
  model: BlueprintModel;
  diff: Diff;
  hash: string;
}

function emptyDiff(): Diff {
  return { created: [], updated: [], deleted: [], ancestry: {} };
}

/**
 * Aplica um comando sobre uma CÓPIA do modelo.
 *
 * Copiar antes de validar é o que garante que um comando rejeitado não deixa o
 * modelo pela metade: ou o diff inteiro entra, ou nada muda.
 */
export function applyCommand(model: BlueprintModel, command: Command): CommandResult {
  const next = cloneModel(model);
  const diff = emptyDiff();

  switch (command.type) {
    case 'AddLevel': {
      const id = nextId(next, 'lvl');
      next.levels.push({
        id,
        name: command.name,
        elevationMm: command.elevationMm,
        defaultHeightMm: command.defaultHeightMm,
      });
      diff.created.push(id);
      break;
    }

    case 'AddWall': {
      if (pointsEqual(command.a, command.b)) {
        throw new KernelError('DEGENERATE_WALL', 'Parede de comprimento zero');
      }
      const id = nextId(next, 'wal');
      next.walls.push({
        id,
        levelId: command.levelId,
        a: { ...command.a },
        b: { ...command.b },
        thicknessMm: command.thicknessMm,
        heightMm: command.heightMm,
      });
      diff.created.push(id);
      break;
    }

    case 'AddOpening': {
      const wall = findWall(next, command.wallId);
      const limit = wallLength(wall);
      if (command.offsetMm < 0 || command.offsetMm + command.widthMm > limit) {
        throw new KernelError(
          'OPENING_OUT_OF_BOUNDS',
          `Abertura ${command.offsetMm}+${command.widthMm} não cabe em ${limit} mm`,
        );
      }
      const id = nextId(next, 'opn');
      next.openings.push({
        id,
        wallId: command.wallId,
        kind: command.kind,
        offsetMm: command.offsetMm,
        widthMm: command.widthMm,
        heightMm: command.heightMm,
        sillMm: command.sillMm,
      });
      diff.created.push(id);
      break;
    }

    case 'AddBoundary': {
      const id = nextId(next, 'bnd');
      next.boundaries.push({
        id,
        levelId: command.levelId,
        a: { ...command.a },
        b: { ...command.b },
      });
      diff.created.push(id);
      break;
    }

    case 'SetThickness': {
      const wall = findWall(next, command.wallId);
      wall.thicknessMm = command.thicknessMm;
      diff.updated.push(wall.id);
      break;
    }

    case 'MoveVertex': {
      const wall = findWall(next, command.wallId);
      const other = command.end === 'a' ? wall.b : wall.a;
      if (pointsEqual(command.to, other)) {
        throw new KernelError('DEGENERATE_WALL', 'Mover o vértice colapsaria a parede');
      }
      wall[command.end] = { ...command.to };
      diff.updated.push(wall.id);

      // §9.1: mexer na parede hospedeira pode invalidar a abertura. Erro explícito
      // é melhor que silenciosamente deixar a abertura pendurada fora da parede.
      const newLimit = wallLength(wall);
      for (const opening of next.openings.filter((o) => o.wallId === wall.id)) {
        if (opening.offsetMm + opening.widthMm > newLimit) {
          throw new KernelError(
            'OPENING_OUT_OF_BOUNDS',
            `Encurtar ${wall.id} deixaria a abertura ${opening.id} fora da parede`,
          );
        }
      }
      break;
    }

    case 'SplitWall': {
      const wall = findWall(next, command.wallId);
      if (!areCollinear(wall.a, wall.b, command.at)) {
        throw new KernelError('SPLIT_OFF_AXIS', 'Ponto de divisão fora do eixo da parede');
      }
      if (pointsEqual(command.at, wall.a) || pointsEqual(command.at, wall.b)) {
        throw new KernelError('SPLIT_AT_ENDPOINT', 'Divisão coincide com uma ponta');
      }

      const firstId = nextId(next, 'wal');
      const secondId = nextId(next, 'wal');
      const first: Wall = { ...wall, id: firstId, a: { ...wall.a }, b: { ...command.at } };
      const second: Wall = { ...wall, id: secondId, a: { ...command.at }, b: { ...wall.b } };

      next.walls = next.walls.filter((w) => w.id !== wall.id);
      next.walls.push(first, second);

      // Cada abertura vai para o fragmento que a contém, com offset recalculado.
      const cutAt = Math.round(
        Math.sqrt((command.at.x - wall.a.x) ** 2 + (command.at.y - wall.a.y) ** 2),
      );
      const rehosted: Opening[] = [];
      for (const opening of next.openings) {
        if (opening.wallId !== wall.id) {
          rehosted.push(opening);
          continue;
        }
        if (opening.offsetMm + opening.widthMm <= cutAt) {
          rehosted.push({ ...opening, wallId: firstId });
        } else if (opening.offsetMm >= cutAt) {
          rehosted.push({ ...opening, wallId: secondId, offsetMm: opening.offsetMm - cutAt });
        } else {
          throw new KernelError(
            'SPLIT_THROUGH_OPENING',
            `A divisão atravessa a abertura ${opening.id}`,
          );
        }
      }
      next.openings = rehosted;

      diff.deleted.push(wall.id);
      diff.created.push(firstId, secondId);
      diff.ancestry[firstId] = [wall.id];
      diff.ancestry[secondId] = [wall.id];
      break;
    }

    case 'MergeWalls': {
      const first = findWall(next, command.firstId);
      const second = findWall(next, command.secondId);

      if (first.levelId !== second.levelId) {
        throw new KernelError('MERGE_CROSS_LEVEL', 'Paredes em níveis diferentes');
      }
      if (first.thicknessMm !== second.thicknessMm) {
        throw new KernelError('MERGE_THICKNESS_MISMATCH', 'Espessuras diferentes');
      }
      if (!areCollinear(first.a, first.b, second.a) || !areCollinear(first.a, first.b, second.b)) {
        throw new KernelError('MERGE_NOT_COLLINEAR', 'Paredes não são colineares');
      }

      // Encontrar a ponta compartilhada e montar o eixo resultante.
      let start: Point | null = null;
      let end: Point | null = null;
      if (pointsEqual(first.b, second.a)) {
        start = first.a;
        end = second.b;
      } else if (pointsEqual(first.a, second.b)) {
        start = second.a;
        end = first.b;
      } else if (pointsEqual(first.a, second.a)) {
        start = first.b;
        end = second.b;
      } else if (pointsEqual(first.b, second.b)) {
        start = first.a;
        end = second.a;
      }
      if (!start || !end) {
        throw new KernelError('MERGE_NOT_ADJACENT', 'Paredes não compartilham uma ponta');
      }

      const mergedId = nextId(next, 'wal');
      next.walls = next.walls.filter((w) => w.id !== first.id && w.id !== second.id);
      next.walls.push({
        id: mergedId,
        levelId: first.levelId,
        a: { ...start },
        b: { ...end },
        thicknessMm: first.thicknessMm,
        heightMm: first.heightMm,
      });

      // Reancorar aberturas medindo o offset a partir da nova origem.
      const firstLen = wallLength(first);
      next.openings = next.openings.map((o) => {
        if (o.wallId !== first.id && o.wallId !== second.id) return o;
        const fromFirst = o.wallId === first.id;
        const flipped = fromFirst ? !pointsEqual(start!, first.a) : !pointsEqual(start!, second.a);
        const base = fromFirst ? 0 : firstLen;
        const own = flipped
          ? (fromFirst ? firstLen : wallLength(second)) - o.offsetMm - o.widthMm
          : o.offsetMm;
        return { ...o, wallId: mergedId, offsetMm: base + own };
      });

      diff.deleted.push(first.id, second.id);
      diff.created.push(mergedId);
      diff.ancestry[mergedId] = [first.id, second.id];
      break;
    }

    case 'DeleteOpening': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      next.openings = next.openings.filter((o) => o.id !== opening.id);
      diff.deleted.push(opening.id);
      break;
    }

    case 'DeleteWall': {
      const wall = findWall(next, command.wallId);
      next.walls = next.walls.filter((w) => w.id !== wall.id);
      const orphans = next.openings.filter((o) => o.wallId === wall.id);
      next.openings = next.openings.filter((o) => o.wallId !== wall.id);
      diff.deleted.push(wall.id, ...orphans.map((o) => o.id));
      break;
    }

    case 'NameSpace': {
      const space = next.spaces.find((s) => s.id === command.spaceId);
      if (!space) {
        throw new KernelError('SPACE_NOT_FOUND', `Ambiente inexistente: ${command.spaceId}`);
      }

      // O nome é ancorado num PONTO dentro do ambiente, não no id dele. Ambiente
      // é derivado: mover uma parede recria todos com ids novos, e um nome
      // guardado por id não sobreviveria a nenhuma edição.
      const ancora = interiorPoint(space.ring, space.holes);

      // Renomear o mesmo ambiente substitui a etiqueta, não empilha outra.
      const existente = next.labels.find(
        (l) =>
          l.levelId === space.levelId &&
          pointInPolygon(space.ring, l.at) &&
          !space.holes.some((h) => pointInPolygon(h, l.at)),
      );

      const nome = command.name.trim();

      if (!nome) {
        if (existente) {
          next.labels = next.labels.filter((l) => l.id !== existente.id);
          diff.deleted.push(existente.id);
        }
        break;
      }

      if (existente) {
        next.labels = next.labels.map((l) =>
          l.id === existente.id ? { ...l, name: nome } : l,
        );
        diff.updated.push(existente.id);
      } else {
        const id = nextId(next, 'lbl');
        next.labels.push({ id, levelId: space.levelId, at: ancora, name: nome });
        diff.created.push(id);
      }
      break;
    }

    default: {
      const exhaustive: never = command;
      throw new KernelError('UNKNOWN_COMMAND', `Comando desconhecido: ${JSON.stringify(exhaustive)}`);
    }
  }

  recomputeSpaces(next);
  assertModelInvariants(next);

  return { model: next, diff, hash: snapshotHash(next) };
}

/**
 * Histórico com undo/redo.
 *
 * Guarda estados inteiros, não comandos inversos. Para um spike isso é o certo:
 * comando inverso exige uma prova de que cada operação é reversível, e é
 * exatamente essa prova que o caso 23 quer testar sem circularidade.
 */
export class ModelHistory {
  private readonly states: BlueprintModel[] = [];
  private cursor = -1;
  private readonly applied = new Map<string, string>();

  constructor(initial: BlueprintModel) {
    this.states.push(cloneModel(initial));
    this.cursor = 0;
  }

  get current(): BlueprintModel {
    return this.states[this.cursor];
  }

  get hash(): string {
    return snapshotHash(this.current);
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.states.length - 1;
  }

  /**
   * Aplica um comando. `commandId` repetido devolve o hash já conhecido sem
   * reaplicar — idempotência do PRD §12.3.
   */
  apply(command: Command, commandId?: string): CommandResult {
    if (commandId && this.applied.has(commandId)) {
      return { model: this.current, diff: emptyDiff(), hash: this.applied.get(commandId)! };
    }

    const result = applyCommand(this.current, command);

    // Um novo comando descarta o ramo de redo.
    this.states.splice(this.cursor + 1);
    this.states.push(result.model);
    this.cursor = this.states.length - 1;

    if (commandId) this.applied.set(commandId, result.hash);
    return result;
  }

  /**
   * Aplica vários comandos como UM passo do histórico.
   *
   * Existe porque um gesto do usuário pode precisar de mais de um comando para
   * deixar o modelo coerente: desenhar um trecho encadeado pela face cria a
   * parede nova E corrige a ponta da anterior para o canto mitrado. Aplicados
   * separadamente, um "desfazer" desfaria só metade do gesto e deixaria o canto
   * pela metade — estado que o usuário nunca pediu e não sabe nomear.
   *
   * Aborta inteiro no primeiro erro (`applyBatch`), então o histórico nunca
   * recebe um lote parcial.
   */
  applyMany(commands: Command[]): CommandResult {
    const result = applyBatch(this.current, commands);

    this.states.splice(this.cursor + 1);
    this.states.push(result.model);
    this.cursor = this.states.length - 1;
    return result;
  }

  undo(): BlueprintModel {
    if (!this.canUndo) throw new KernelError('NOTHING_TO_UNDO', 'Nada a desfazer');
    this.cursor -= 1;
    return this.current;
  }

  redo(): BlueprintModel {
    if (!this.canRedo) throw new KernelError('NOTHING_TO_REDO', 'Nada a refazer');
    this.cursor += 1;
    return this.current;
  }
}

/** Aplica um lote na ordem dada, abortando inteiro no primeiro erro. */
export function applyBatch(model: BlueprintModel, commands: Command[]): CommandResult {
  let current = model;
  const merged = emptyDiff();

  for (const command of commands) {
    const result = applyCommand(current, command);
    current = result.model;
    merged.created.push(...result.diff.created);
    merged.updated.push(...result.diff.updated);
    merged.deleted.push(...result.diff.deleted);
    Object.assign(merged.ancestry, result.diff.ancestry);
  }

  return { model: current, diff: merged, hash: snapshotHash(current) };
}
