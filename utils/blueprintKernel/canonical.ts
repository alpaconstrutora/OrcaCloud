/**
 * Serialização canônica e hash do snapshot (PRD §9.2, §15.3).
 *
 * O critério de saída do Spike A é "igualdade bit a bit do payload canônico entre
 * navegador e servidor". Isso exige duas garantias:
 *
 *  1. ORDEM TOTAL. Nada é escrito na ordem em que está no array; tudo é ordenado por
 *     chave explícita antes. Chaves de objeto também são emitidas em ordem fixa —
 *     `JSON.stringify` preserva ordem de inserção, que difere entre caminhos de
 *     código que constroem o mesmo objeto de formas diferentes.
 *
 *  2. SHA-256 PRÓPRIO. Web Crypto (`crypto.subtle`) é assíncrono e não existe em
 *     todo runtime; `node:crypto` não existe no navegador. Uma implementação pura
 *     de ~50 linhas é idêntica nos dois lados POR CONSTRUÇÃO, o que é exatamente o
 *     que o spike precisa provar. Não é código de segurança — é código de
 *     identidade de conteúdo.
 */

import {
  type BlueprintModel,
  type BoundaryKind,
  type BoundaryPapel,
  emptyModel,
  nextId,
} from './model';
import { recomputeSpaces } from './arrangement';
import { type AlinhamentoParede } from './geom';
import { KERNEL_VERSION, DEFAULT_TOLERANCE_MM } from './units';

// ─────────────────────────────────────────────────────────────────────────────
// SHA-256 puro
// ─────────────────────────────────────────────────────────────────────────────

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** SHA-256 sobre uma string UTF-8. Devolve hex minúsculo de 64 caracteres. */
export function sha256(message: string): string {
  const bytes: number[] = [];
  for (const char of message) {
    const cp = char.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }

  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // Comprimento em 64 bits big-endian. Acima de 2^32 bits não ocorre aqui.
  for (let i = 7; i >= 0; i--) bytes.push((i < 4 ? bitLength / 2 ** (8 * i) : 0) & 0xff);

  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const w = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] =
        ((bytes[offset + i * 4] << 24) |
          (bytes[offset + i * 4 + 1] << 16) |
          (bytes[offset + i * 4 + 2] << 8) |
          bytes[offset + i * 4 + 3]) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload canônico
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emite JSON com chaves em ordem alfabética recursivamente.
 *
 * Sem isso, `{a:1,b:2}` e `{b:2,a:1}` — semanticamente idênticos — geram strings
 * diferentes e hashes diferentes.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * Projeta o modelo na forma canônica: só o que define a geometria, ordenado.
 *
 * `seq` fica de fora de propósito. Ele é estado do alocador de IDs, não conteúdo:
 * dois modelos com a mesma geometria construída por caminhos diferentes têm
 * contadores diferentes e mesmo assim são o mesmo desenho.
 */
export function canonicalPayload(model: BlueprintModel): string {
  // Níveis em ordem canônica, e o índice de cada um. Igual às paredes: o payload
  // referencia POSIÇÃO, não identificador.
  const levels = [...model.levels].sort(
    (a, b) => a.elevationMm - b.elevationMm || a.name.localeCompare(b.name),
  );
  const levelIndex = new Map(levels.map((l, i) => [l.id, i]));

  // Ordem geométrica, não ordem de criação: duas sessões que desenham as mesmas
  // paredes em ordens diferentes precisam produzir o mesmo payload.
  const walls = [...model.walls].sort(
    (x, y) =>
      (levelIndex.get(x.levelId) ?? 0) - (levelIndex.get(y.levelId) ?? 0) ||
      x.a.x - y.a.x ||
      x.a.y - y.a.y ||
      x.b.x - y.b.x ||
      x.b.y - y.b.y ||
      x.thicknessMm - y.thicknessMm,
  );
  const wallIndex = new Map(walls.map((w, i) => [w.id, i]));

  const payload = {
    kernel: KERNEL_VERSION,
    toleranceMm: DEFAULT_TOLERANCE_MM,
    // Área do lote na escritura. Chave de topo porque é do LOTE, não de um lado —
    // e conteúdo, não parâmetro de tela: mudá-la muda o que o desenho afirma e
    // tem que mudar o hash, pelo mesmo motivo que `labels` entra aqui.
    //
    // ⚠️ `undefined` quando não informada, e não `null` — `stableStringify` filtra
    // undefined, então a chave SOME do payload. É diferente da convenção usada
    // dentro de `boundaries` (que emite `papel: null` explícito) e a diferença é
    // deliberada: aqui a chave entraria em TODO payload do acervo, inclusive nos
    // desenhos que não têm lote nenhum, mudando a forma canônica de plantas que
    // não têm nada a ver com terreno. Sem lote informado, o payload continua
    // exatamente o que era. Na volta, ausente e `null` são a mesma coisa.
    areaEscrituraMm2: model.areaEscrituraMm2 ?? undefined,
    levels: levels.map((l) => ({
      name: l.name,
      elevationMm: l.elevationMm,
      defaultHeightMm: l.defaultHeightMm,
    })),
    walls: walls.map((w) => ({
      level: levelIndex.get(w.levelId) ?? 0,
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      thicknessMm: w.thicknessMm,
      heightMm: w.heightMm,
      // ⚠️ `undefined` no alinhamento `EIXO`, e não `'EIXO'` explícito —
      // `stableStringify` filtra undefined, então a chave SOME. É a mesma
      // decisão de `areaEscrituraMm2` e pela mesma razão: emitir a chave em toda
      // parede mudaria a forma canônica de TODO desenho do acervo, inclusive os
      // que nunca souberam o que é traçar pela face. Na volta, ausente e
      // `'EIXO'` são a mesma coisa.
      //
      // É conteúdo, não parâmetro de tela: ele muda o que uma troca de espessura
      // FAZ com o desenho, então tem de entrar no hash — mesmo motivo de
      // `labels`.
      alinhamento: w.alinhamento && w.alinhamento !== 'EIXO' ? w.alinhamento : undefined,
    })),
    // `wall` é o ÍNDICE da parede hospedeira na lista acima, nunca o `wallId`.
    //
    // Guardar o id aqui furava o canônico por dois lados: o payload passava a
    // conter um identificador volátil (`wal_0001`), e esse id apontava para uma
    // parede que o próprio payload não identifica — impossível reconstruir o
    // modelo a partir dele. Duas plantas idênticas desenhadas em ordem diferente
    // produziam hashes diferentes assim que tivessem uma porta.
    openings: [...model.openings]
      .sort(
        (x, y) =>
          (wallIndex.get(x.wallId) ?? 0) - (wallIndex.get(y.wallId) ?? 0) ||
          x.offsetMm - y.offsetMm,
      )
      .map((o) => ({
        wall: wallIndex.get(o.wallId) ?? 0,
        kind: o.kind,
        offsetMm: o.offsetMm,
        widthMm: o.widthMm,
        heightMm: o.heightMm,
        sillMm: o.sillMm,
        hingeAtStart: o.hingeAtStart,
        swingReversed: o.swingReversed,
        // SÓ em abertura de correr. Emitir sempre daria chave nova a todo
        // desenho que não tem porta de correr, e o hash de todos eles mudaria
        // por um campo que não os descreve — o mesmo cuidado que a área de
        // escritura teve em 0.6.0.
        embutida: o.kind === 'sliding' ? o.embutida : undefined,
      })),
    boundaries: [...model.boundaries]
      .sort(
        (x, y) =>
          (levelIndex.get(x.levelId) ?? 0) - (levelIndex.get(y.levelId) ?? 0) ||
          x.a.x - y.a.x ||
          x.a.y - y.a.y ||
          x.b.x - y.b.x ||
          x.b.y - y.b.y,
      )
      .map((b) => ({
        level: levelIndex.get(b.levelId) ?? 0,
        kind: b.kind,
        papel: b.papel ?? null,
        // A escritura é ATRIBUTO, não critério de ordem: a ordenação acima
        // continua por nível e coordenada. Ordenar por confrontante faria dois
        // desenhos idênticos com o mesmo lote produzirem payloads diferentes
        // porque alguém digitou o nome da rua com outra grafia.
        medidaEscrituraMm: b.medidaEscrituraMm ?? null,
        confrontante: b.confrontante ?? null,
        a: { x: b.a.x, y: b.a.y },
        b: { x: b.b.x, y: b.b.y },
      })),
    // Etiquetas de ambiente. Entram no canônico porque são CONTEÚDO: renomear um
    // ambiente muda o desenho de forma observável e tem que mudar o hash — senão
    // publicar depois de renomear seria idempotente e o nome nunca chegaria ao
    // snapshot. Ordenadas por posição, como todo o resto.
    labels: [...(model.labels ?? [])]
      .sort(
        (x, y) =>
          (levelIndex.get(x.levelId) ?? 0) - (levelIndex.get(y.levelId) ?? 0) ||
          x.at.x - y.at.x ||
          x.at.y - y.at.y ||
          (x.name < y.name ? -1 : x.name > y.name ? 1 : 0),
      )
      .map((l) => ({
        level: levelIndex.get(l.levelId) ?? 0,
        at: { x: l.at.x, y: l.at.y },
        name: l.name,
      })),
    spaces: [...model.spaces]
      .sort(
        (x, y) =>
          (levelIndex.get(x.levelId) ?? 0) - (levelIndex.get(y.levelId) ?? 0) ||
          x.areaMm2 - y.areaMm2 ||
          x.ring[0].x - y.ring[0].x ||
          x.ring[0].y - y.ring[0].y,
      )
      .map((s) => ({
        level: levelIndex.get(s.levelId) ?? 0,
        ring: s.ring.map((p) => ({ x: p.x, y: p.y })),
        holes: s.holes.map((h) => h.map((p) => ({ x: p.x, y: p.y }))),
        areaMm2: s.areaMm2,
        perimeterMm: s.perimeterMm,
      })),
  };

  return stableStringify(payload);
}

export function snapshotHash(model: BlueprintModel): string {
  return sha256(canonicalPayload(model));
}

/** Forma tipada do payload canônico. É o contrato de persistência do snapshot. */
export interface CanonicalPayload {
  kernel: string;
  toleranceMm: number;
  /** Ausente em payload gravado sob kernel < 0.6.0. */
  areaEscrituraMm2?: number | null;
  levels: { name: string; elevationMm: number; defaultHeightMm: number }[];
  walls: {
    level: number;
    a: { x: number; y: number };
    b: { x: number; y: number };
    thicknessMm: number;
    heightMm: number;
    /**
     * Ausente em payload sob kernel < 0.8.0, e ausente também no alinhamento
     * `'EIXO'` — que é o que uma parede sem o campo sempre significou.
     */
    alinhamento?: AlinhamentoParede;
  }[];
  openings: {
    wall: number;
    kind: 'door' | 'window' | 'passage' | 'sliding';
    offsetMm: number;
    widthMm: number;
    heightMm: number;
    sillMm: number;
    /** Ausentes em payload gravado sob kernel < 0.4.0. */
    hingeAtStart?: boolean;
    swingReversed?: boolean;
    /** Só em `kind: 'sliding'`, e ausente em payload sob kernel < 0.7.0. */
    embutida?: boolean;
  }[];
  boundaries: {
    level: number;
    /** Ausentes em payload gravado sob kernel < 0.5.0. */
    kind?: BoundaryKind;
    papel?: BoundaryPapel | null;
    /** Ausentes em payload gravado sob kernel < 0.6.0. */
    medidaEscrituraMm?: number | null;
    confrontante?: string | null;
    a: { x: number; y: number };
    b: { x: number; y: number };
  }[];
  labels: { level: number; at: { x: number; y: number }; name: string }[];
  spaces: {
    level: number;
    ring: { x: number; y: number }[];
    holes: { x: number; y: number }[][];
    areaMm2: number;
    perimeterMm: number;
  }[];
}

export function parseCanonicalPayload(json: string): CanonicalPayload {
  return JSON.parse(json) as CanonicalPayload;
}

/**
 * Reconstrói um modelo editável a partir do payload canônico.
 *
 * É o que fecha o ciclo da persistência: um snapshot é guardado como payload
 * canônico (imutável, com hash), e voltar a editá-lo exige devolver objetos com
 * identidade. Os IDs são REATRIBUÍDOS pelo contador determinístico na ordem
 * canônica — como a ordem é função só da geometria, o modelo reconstruído
 * re-serializa para exatamente o mesmo payload e o mesmo hash.
 *
 * É por isso que o payload pode se dar ao luxo de não guardar ID nenhum.
 */
export function modelFromCanonicalPayload(payload: CanonicalPayload): BlueprintModel {
  const model = emptyModel();
  model.areaEscrituraMm2 = payload.areaEscrituraMm2 ?? null;

  const levelIds = payload.levels.map((l) => {
    const id = nextId(model, 'lvl');
    model.levels.push({
      id,
      name: l.name,
      elevationMm: l.elevationMm,
      defaultHeightMm: l.defaultHeightMm,
    });
    return id;
  });

  const wallIds = payload.walls.map((w) => {
    const id = nextId(model, 'wal');
    model.walls.push({
      id,
      levelId: levelIds[w.level],
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      thicknessMm: w.thicknessMm,
      heightMm: w.heightMm,
      // Ausente = `'EIXO'`, e `'EIXO'` não volta ao modelo como campo: assim o
      // modelo relido de um payload antigo é IDÊNTICO ao que o gravou, e o
      // round-trip continua fechando byte a byte.
      ...(w.alinhamento && w.alinhamento !== 'EIXO' ? { alinhamento: w.alinhamento } : {}),
    });
    return id;
  });

  for (const o of payload.openings) {
    model.openings.push({
      id: nextId(model, 'opn'),
      wallId: wallIds[o.wall],
      kind: o.kind,
      offsetMm: o.offsetMm,
      widthMm: o.widthMm,
      heightMm: o.heightMm,
      sillMm: o.sillMm,
      // `?? true`/`?? false`: payload gravado sob kernel < 0.4.0 não tem os
      // campos. São os mesmos valores que `AddOpening` já usava como padrão
      // antes deles existirem — reabrir um snapshot antigo não pode fazer as
      // portas dele "virarem" sozinhas.
      hingeAtStart: o.hingeAtStart ?? true,
      swingReversed: o.swingReversed ?? false,
      embutida: o.embutida ?? false,
    });
  }

  for (const b of payload.boundaries) {
    model.boundaries.push({
      id: nextId(model, 'bnd'),
      levelId: levelIds[b.level],
      a: { x: b.a.x, y: b.a.y },
      b: { x: b.b.x, y: b.b.y },
      // Payload de antes do terreno existir não tem `kind`. `DIVISA` é o que
      // aquele desenho significava: um limite solto, que divide ambiente e não
      // participa de anel de lote nenhum. Ler como TERRENO inventaria um lote
      // que ninguém desenhou, com área e recuos saindo do nada.
      kind: b.kind ?? 'DIVISA',
      papel: b.papel ?? null,
      // Payload de antes da escritura existir não tem os campos. `null` é
      // "ninguém informou" — e é o que impede o quadro de acusar divergência
      // contra uma medida que nunca foi digitada.
      medidaEscrituraMm: b.medidaEscrituraMm ?? null,
      confrontante: b.confrontante ?? null,
    });
  }

  // `?? []` porque payload gravado antes das etiquetas existirem não tem o campo.
  // Snapshot é imutável: os antigos vão continuar sem ele para sempre, e quebrar
  // ao reabrir uma versão publicada seria perder o acervo por uma vírgula.
  for (const l of payload.labels ?? []) {
    model.labels.push({
      id: nextId(model, 'lbl'),
      levelId: levelIds[l.level],
      at: { x: l.at.x, y: l.at.y },
      name: l.name,
    });
  }

  // `spaces` é derivado: recalculado pelo arranjo planar, nunca lido do payload.
  // O payload guarda os ambientes para consulta e auditoria do snapshot, não para
  // realimentar o kernel — se voltassem por aqui, uma divergência entre o gravado e
  // o recalculável passaria despercebida.
  return recomputeSpaces(model);
}
