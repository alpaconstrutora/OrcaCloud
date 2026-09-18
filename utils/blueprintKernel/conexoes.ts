/**
 * CONEXÕES DERIVADAS dos encontros de trechos (18/09/2026, F2 da hidráulica:
 * *"conexões… derivadas + lançamento manual"*).
 *
 * Joelho, tê, luva e redução não são entidades do modelo: são CONSEQUÊNCIA de
 * como os trechos se encontram, e por isso saem daqui como derivação pura —
 * quem desenha dois tubos em L já desenhou o joelho. Contá-las é o que faz o
 * quantitativo hidráulico fechar com a lista de compra.
 *
 * A REGRA, por nó (mesmo pavimento, mesmo ponto, mesma cota, MESMA disciplina —
 * água e esgoto que se cruzam não se ligam):
 *   - 1 trecho: nada. Se não há terminal ali, é PONTA ABERTA (aviso, não peça).
 *   - 2 trechos colineares (≥ 170°): LUVA se a bitola é a mesma, REDUÇÃO se muda;
 *     salvo terminal no nó (registro, aparelho) — a peça é a própria ligação.
 *   - 2 trechos a ~90° (±10°): JOELHO_90; a ~45° ou ~135° (±10°): JOELHO_45;
 *     outro ângulo: JOELHO_90 com aviso "ângulo fora de 45/90".
 *   - 3 trechos: TÊ (com `paraMm` quando as bitolas diferem — tê de redução).
 *   - 4 trechos: CRUZETA, com aviso (é rara e cara; vale conferir).
 *   - Terminal `CONEXAO_*` MANUAL no nó suprime a derivada: o usuário forçou a peça.
 *
 * O ângulo é em TRÊS dimensões: prumada + horizontal é um joelho de 90°, e o
 * esgoto com caimento de 2 % continua colinear com o trecho seguinte.
 *
 * A LAJE é o encontro: a cota 0 de um pavimento é o teto do pavimento
 * imediatamente abaixo (mesma chave de `blueprintEletrodutos`), então a prumada
 * que atravessa a laje encontra o ramal do andar de baixo num nó só.
 *
 * Determinístico: nós e trechos são ordenados antes de decidir — a mesma
 * planta com os trechos em outra ordem dá a mesma lista.
 */
import type { BlueprintModel, DisciplinaDeRede, Level, ObjectId, Terminal, Trecho } from './model';
import type { Point } from './geom';

export type TipoDeConexao = 'JOELHO_90' | 'JOELHO_45' | 'TE' | 'CRUZETA' | 'LUVA' | 'REDUCAO';

export const ROTULO_DA_CONEXAO: Record<TipoDeConexao, string> = {
  JOELHO_90: 'Joelho 90°',
  JOELHO_45: 'Joelho 45°',
  TE: 'Tê',
  CRUZETA: 'Cruzeta',
  LUVA: 'Luva',
  REDUCAO: 'Redução',
};

/** O tipo manual (`CONEXAO_TE`) → o tipo de conexão contado. */
export function tipoDeConexaoManual(tipoHidraulico: string | null | undefined): TipoDeConexao | null {
  switch (tipoHidraulico) {
    case 'CONEXAO_JOELHO_90':
      return 'JOELHO_90';
    case 'CONEXAO_JOELHO_45':
      return 'JOELHO_45';
    case 'CONEXAO_TE':
      return 'TE';
    case 'CONEXAO_LUVA':
      return 'LUVA';
    case 'CONEXAO_REDUCAO':
      return 'REDUCAO';
    default:
      return null;
  }
}

export interface ConexaoDerivada {
  levelId: ObjectId;
  no: Point;
  cotaMm: number;
  disciplina: DisciplinaDeRede;
  tipo: TipoDeConexao;
  /** A maior bitola do nó, em mm. */
  bitolaMm: number;
  /** Na redução (ou tê de redução): a menor bitola do nó. */
  paraMm?: number;
  trechoIds: ObjectId[];
  /** `MANUAL` quando um terminal `CONEXAO_*` está no nó; `DERIVADA` no resto. */
  origem: 'DERIVADA' | 'MANUAL';
  aviso?: string;
}

export interface PontaAberta {
  levelId: ObjectId;
  no: Point;
  cotaMm: number;
  disciplina: DisciplinaDeRede;
  trechoId: ObjectId;
}

export interface ConexoesDoModelo {
  conexoes: ConexaoDerivada[];
  pontasAbertas: PontaAberta[];
}

const HIDRAULICAS: readonly DisciplinaDeRede[] = ['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO'];

type Chave = string;

/** A chave do nó, com a laje como encontro entre pavimentos. */
function fazerChave(niveis: readonly Level[]) {
  const ordenados = [...niveis].sort((a, b) => a.elevationMm - b.elevationMm);
  const abaixoDe = new Map<ObjectId, Level | null>();
  ordenados.forEach((l, i) => abaixoDe.set(l.id, i > 0 ? ordenados[i - 1] : null));
  return (levelId: ObjectId, disciplina: DisciplinaDeRede, x: number, y: number, cota: number): { chave: Chave; levelId: ObjectId; cotaMm: number } => {
    // Cota ≤ 0 com pavimento embaixo é o mesmo lugar visto de baixo (o esgoto
    // sob o piso do andar corre no teto do térreo) — mesma regra de
    // `blueprintGrafoDeRede.fazerChave`.
    if (cota <= 0) {
      const abaixo = abaixoDe.get(levelId);
      if (abaixo) return { chave: `${disciplina}|${abaixo.id}|${x},${y}|${abaixo.defaultHeightMm + cota}`, levelId: abaixo.id, cotaMm: abaixo.defaultHeightMm + cota };
    }
    return { chave: `${disciplina}|${levelId}|${x},${y}|${cota}`, levelId, cotaMm: cota };
  };
}

interface Incidencia {
  trecho: Trecho;
  /** Vetor unitário SAINDO do nó, em 3D (mm). */
  u: [number, number, number];
}

function unitario(de: Point & { cota: number }, para: Point & { cota: number }): [number, number, number] | null {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  const dz = para.cota - de.cota;
  const n = Math.hypot(dx, dy, dz);
  return n === 0 ? null : [dx / n, dy / n, dz / n];
}

/** Ângulo entre os dois vetores, em graus (0–180). */
function anguloGraus(a: [number, number, number], b: [number, number, number]): number {
  const cos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function conexoesDerivadas(model: BlueprintModel): ConexoesDoModelo {
  const chave = fazerChave(model.levels);
  const nos = new Map<Chave, { levelId: ObjectId; no: Point; cotaMm: number; disciplina: DisciplinaDeRede; incidencias: Incidencia[] }>();

  const trechos = [...(model.trechos ?? [])]
    .filter((t) => HIDRAULICAS.includes(t.disciplina))
    .sort((x, y) => x.id.localeCompare(y.id));
  for (const t of trechos) {
    const pontas: [Point & { cota: number }, Point & { cota: number }][] = [
      [{ ...t.a, cota: t.cotaAMm }, { ...t.b, cota: t.cotaBMm }],
      [{ ...t.b, cota: t.cotaBMm }, { ...t.a, cota: t.cotaAMm }],
    ];
    for (const [de, para] of pontas) {
      const u = unitario(de, para);
      if (!u) continue;
      const k = chave(t.levelId, t.disciplina, de.x, de.y, de.cota);
      const no = nos.get(k.chave) ?? { levelId: k.levelId, no: { x: de.x, y: de.y }, cotaMm: k.cotaMm, disciplina: t.disciplina, incidencias: [] };
      no.incidencias.push({ trecho: t, u });
      nos.set(k.chave, no);
    }
  }

  // Terminais por nó — o aparelho/registro que encerra o trecho, e a conexão manual.
  const terminaisPorChave = new Map<Chave, Terminal[]>();
  for (const term of model.terminais ?? []) {
    if (!HIDRAULICAS.includes(term.disciplina)) continue;
    const k = chave(term.levelId, term.disciplina, term.at.x, term.at.y, term.cotaMm).chave;
    const lista = terminaisPorChave.get(k) ?? [];
    lista.push(term);
    terminaisPorChave.set(k, lista);
  }

  const conexoes: ConexaoDerivada[] = [];
  const pontasAbertas: PontaAberta[] = [];
  const chavesOrdenadas = [...nos.keys()].sort();
  for (const k of chavesOrdenadas) {
    const no = nos.get(k)!;
    const terminais = terminaisPorChave.get(k) ?? [];
    const manual = terminais.map((t) => tipoDeConexaoManual(t.tipoHidraulico)).find((x): x is TipoDeConexao => !!x) ?? null;
    const temPeca = terminais.some((t) => !tipoDeConexaoManual(t.tipoHidraulico));
    const inc = no.incidencias;
    const trechoIds = [...new Set(inc.map((i) => i.trecho.id))].sort();
    const bitolas = inc.map((i) => i.trecho.bitolaMm);
    const maior = Math.max(...bitolas);
    const menor = Math.min(...bitolas);
    const base = { levelId: no.levelId, no: no.no, cotaMm: no.cotaMm, disciplina: no.disciplina, trechoIds, bitolaMm: maior };

    if (manual) {
      conexoes.push({ ...base, tipo: manual, origem: 'MANUAL', ...(menor !== maior ? { paraMm: menor } : {}) });
      continue;
    }
    if (inc.length === 1) {
      if (!temPeca) pontasAbertas.push({ levelId: no.levelId, no: no.no, cotaMm: no.cotaMm, disciplina: no.disciplina, trechoId: inc[0].trecho.id });
      continue;
    }
    if (inc.length === 2) {
      const ang = anguloGraus(inc[0].u, inc[1].u);
      if (ang >= 170) {
        // Colinear: emenda. Com peça no nó (registro no meio da linha) não há emenda a contar.
        if (temPeca) continue;
        if (maior === menor) conexoes.push({ ...base, tipo: 'LUVA', origem: 'DERIVADA' });
        else conexoes.push({ ...base, tipo: 'REDUCAO', origem: 'DERIVADA', paraMm: menor });
        continue;
      }
      const perto = (alvo: number) => Math.abs(ang - alvo) <= 10;
      if (perto(90)) conexoes.push({ ...base, tipo: 'JOELHO_90', origem: 'DERIVADA', ...(menor !== maior ? { paraMm: menor } : {}) });
      else if (perto(45) || perto(135)) conexoes.push({ ...base, tipo: 'JOELHO_45', origem: 'DERIVADA', ...(menor !== maior ? { paraMm: menor } : {}) });
      else conexoes.push({ ...base, tipo: 'JOELHO_90', origem: 'DERIVADA', aviso: `ângulo de ${Math.round(ang)}° — fora de 45/90`, ...(menor !== maior ? { paraMm: menor } : {}) });
      continue;
    }
    if (inc.length === 3) {
      conexoes.push({ ...base, tipo: 'TE', origem: 'DERIVADA', ...(menor !== maior ? { paraMm: menor } : {}) });
      continue;
    }
    conexoes.push({ ...base, tipo: 'CRUZETA', origem: 'DERIVADA', aviso: `${inc.length} trechos no mesmo nó`, ...(menor !== maior ? { paraMm: menor } : {}) });
  }

  // Conexão MANUAL fora de qualquer nó (no MEIO de um trecho — a luva forçada
  // numa emenda que o desenho não tem, a redução que o projetista sabe que vai
  // ali) também conta: o usuário afirmou a peça. A bitola é a do trecho em que
  // ela está; sem trecho nenhum embaixo, fica o aviso.
  const sobreOTrecho = (t: Terminal): Trecho | null => {
    for (const tr of trechos) {
      if (tr.disciplina !== t.disciplina || tr.levelId !== t.levelId) continue;
      const dx = tr.b.x - tr.a.x;
      const dy = tr.b.y - tr.a.y;
      const c2 = dx * dx + dy * dy;
      const u = c2 === 0 ? 0 : Math.max(0, Math.min(1, ((t.at.x - tr.a.x) * dx + (t.at.y - tr.a.y) * dy) / c2));
      const px = tr.a.x + u * dx;
      const py = tr.a.y + u * dy;
      if (Math.hypot(t.at.x - px, t.at.y - py) <= 1.5) return tr;
    }
    return null;
  };
  for (const [k, terminais] of terminaisPorChave) {
    if (nos.has(k)) continue;
    for (const t of terminais) {
      const tipo = tipoDeConexaoManual(t.tipoHidraulico);
      if (!tipo) continue;
      const tr = sobreOTrecho(t);
      conexoes.push({
        levelId: t.levelId,
        no: { x: t.at.x, y: t.at.y },
        cotaMm: t.cotaMm,
        disciplina: t.disciplina,
        tipo,
        bitolaMm: tr?.bitolaMm ?? 0,
        trechoIds: tr ? [tr.id] : [],
        origem: 'MANUAL',
        ...(tr ? {} : { aviso: 'conexão sem trecho no ponto' }),
      });
    }
  }

  return { conexoes, pontasAbertas };
}
