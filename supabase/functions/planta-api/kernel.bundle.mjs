// GERADO por scripts/build-planta-api-kernel.mjs — não editar. Reexporta o kernel da Planta Inteligente para a Edge Function planta-api.

// utils/blueprintKernel/units.ts
var KERNEL_VERSION = "blueprint-kernel-ts-0.57.0";
var DEFAULT_TOLERANCE_MM = 5;
var MAX_COORD_MM = 1e6;
var KernelError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "KernelError";
  }
};
function roundToMm(value) {
  if (!Number.isFinite(value)) {
    throw new KernelError("NON_FINITE", `Coordenada n\xE3o finita: ${value}`);
  }
  return (value < 0 ? -Math.round(-value) : Math.round(value)) + 0;
}
function isIntegerMm(value) {
  return Number.isInteger(value) && Math.abs(value) <= MAX_COORD_MM;
}
function assertIntegerMm(value, field) {
  if (!isIntegerMm(value)) {
    throw new KernelError(
      "NOT_INTEGER_MM",
      `${field} deve ser mil\xEDmetro inteiro dentro de \xB1${MAX_COORD_MM}; recebido ${value}`
    );
  }
  return value + 0;
}

// utils/blueprintKernel/geom.ts
function point(x, y) {
  return { x: assertIntegerMm(x, "x"), y: assertIntegerMm(y, "y") };
}
function pointsEqual(p, q) {
  return p.x === q.x && p.y === q.y;
}
function pointKey(p) {
  return `${p.x},${p.y}`;
}
function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function orientation(a, b, c) {
  const v = cross(a, b, c);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}
function areCollinear(a, b, c) {
  return cross(a, b, c) === 0;
}
function distanceSq(p, q) {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return dx * dx + dy * dy;
}
function isBetween(a, b, c) {
  return Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
}
function isInteriorCut(a, b, c) {
  if (pointsEqual(a, c) || pointsEqual(b, c)) return false;
  return isBetween(a, b, c);
}
function isDegenerate(s2) {
  return pointsEqual(s2.a, s2.b);
}
function intersectSegments(s2, t) {
  if (isDegenerate(s2) || isDegenerate(t)) return { kind: "none" };
  const d1 = orientation(s2.a, s2.b, t.a);
  const d2 = orientation(s2.a, s2.b, t.b);
  const d3 = orientation(t.a, t.b, s2.a);
  const d4 = orientation(t.a, t.b, s2.b);
  if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) {
    const horizontal = Math.abs(s2.b.x - s2.a.x) >= Math.abs(s2.b.y - s2.a.y);
    const key = (p) => horizontal ? p.x : p.y;
    const sLo = key(s2.a) <= key(s2.b) ? s2.a : s2.b;
    const sHi = key(s2.a) <= key(s2.b) ? s2.b : s2.a;
    const tLo = key(t.a) <= key(t.b) ? t.a : t.b;
    const tHi = key(t.a) <= key(t.b) ? t.b : t.a;
    const lo = key(sLo) >= key(tLo) ? sLo : tLo;
    const hi = key(sHi) <= key(tHi) ? sHi : tHi;
    if (key(lo) > key(hi)) return { kind: "none" };
    if (pointsEqual(lo, hi)) return { kind: "point", at: lo };
    return { kind: "overlap", overlap: { a: lo, b: hi } };
  }
  const proper = d1 !== d2 && d3 !== d4;
  const touches = d1 === 0 && isBetween(s2.a, s2.b, t.a) || d2 === 0 && isBetween(s2.a, s2.b, t.b) || d3 === 0 && isBetween(t.a, t.b, s2.a) || d4 === 0 && isBetween(t.a, t.b, s2.b);
  if (!proper && !touches) return { kind: "none" };
  if (d1 === 0 && isBetween(s2.a, s2.b, t.a)) return { kind: "point", at: t.a };
  if (d2 === 0 && isBetween(s2.a, s2.b, t.b)) return { kind: "point", at: t.b };
  if (d3 === 0 && isBetween(t.a, t.b, s2.a)) return { kind: "point", at: s2.a };
  if (d4 === 0 && isBetween(t.a, t.b, s2.b)) return { kind: "point", at: s2.b };
  const r1x = s2.b.x - s2.a.x;
  const r1y = s2.b.y - s2.a.y;
  const r2x = t.b.x - t.a.x;
  const r2y = t.b.y - t.a.y;
  const denom = r1x * r2y - r1y * r2x;
  if (denom === 0) return { kind: "none" };
  const num = (t.a.x - s2.a.x) * r2y - (t.a.y - s2.a.y) * r2x;
  const u = num / denom;
  return {
    kind: "point",
    at: { x: roundToMm(s2.a.x + u * r1x), y: roundToMm(s2.a.y + u * r1y) }
  };
}
function signedArea(ring) {
  if (ring.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    twice += p.x * q.y - q.x * p.y;
  }
  return twice / 2;
}
function polygonArea(ring) {
  return Math.abs(signedArea(ring));
}
function polygonPerimeter(ring) {
  if (ring.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    total += Math.sqrt(distanceSq(p, q));
  }
  return roundToMm(total);
}
function isCounterClockwise(ring) {
  return signedArea(ring) > 0;
}
function pointInPolygon(ring, p) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (areCollinear(a, b, p) && isBetween(a, b, p)) return true;
  }
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const straddles = a.y > p.y !== b.y > p.y;
    if (!straddles) continue;
    const xCross = (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x;
    if (p.x < xCross) inside = !inside;
  }
  return inside;
}
function cantosDaParede(a, b, espessuraMm, avancoAMm = 0, avancoBMm = 0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return [];
  const ux = dx / comp;
  const uy = dy / comp;
  const nx = -uy;
  const ny = ux;
  const meia = espessuraMm / 2;
  const pa = { x: a.x - ux * avancoAMm, y: a.y - uy * avancoAMm };
  const pb = { x: b.x + ux * avancoBMm, y: b.y + uy * avancoBMm };
  return [
    point(roundToMm(pa.x + nx * meia), roundToMm(pa.y + ny * meia)),
    point(roundToMm(pb.x + nx * meia), roundToMm(pb.y + ny * meia)),
    point(roundToMm(pb.x - nx * meia), roundToMm(pb.y - ny * meia)),
    point(roundToMm(pa.x - nx * meia), roundToMm(pa.y - ny * meia))
  ];
}
function canonicalizeRing(ring) {
  if (ring.length === 0) return [];
  let start = 0;
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i];
    const best = ring[start];
    if (p.x < best.x || p.x === best.x && p.y < best.y) start = i;
  }
  const rotated = [...ring.slice(start), ...ring.slice(0, start)];
  if (!isCounterClockwise(rotated)) {
    return [rotated[0], ...rotated.slice(1).reverse()];
  }
  return rotated;
}

// utils/blueprintKernel/hash.ts
var K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
function rotr(x, n4) {
  return (x >>> n4 | x << 32 - n4) >>> 0;
}
function sha256(message) {
  const bytes = [];
  for (const char of message) {
    const cp = char.codePointAt(0);
    if (cp < 128) bytes.push(cp);
    else if (cp < 2048) bytes.push(192 | cp >> 6, 128 | cp & 63);
    else if (cp < 65536) bytes.push(224 | cp >> 12, 128 | cp >> 6 & 63, 128 | cp & 63);
    else
      bytes.push(
        240 | cp >> 18,
        128 | cp >> 12 & 63,
        128 | cp >> 6 & 63,
        128 | cp & 63
      );
  }
  const bitLength = bytes.length * 8;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((i < 4 ? bitLength / 2 ** (8 * i) : 0) & 255);
  const h = [
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ];
  const w = new Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[offset + i * 4] << 24 | bytes[offset + i * 4 + 1] << 16 | bytes[offset + i * 4 + 2] << 8 | bytes[offset + i * 4 + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const temp1 = hh + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const temp2 = S0 + maj >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + temp1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = temp1 + temp2 >>> 0;
    }
    h[0] = h[0] + a >>> 0;
    h[1] = h[1] + b >>> 0;
    h[2] = h[2] + c >>> 0;
    h[3] = h[3] + d >>> 0;
    h[4] = h[4] + e >>> 0;
    h[5] = h[5] + f >>> 0;
    h[6] = h[6] + g >>> 0;
    h[7] = h[7] + hh >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([x], [y]) => x < y ? -1 : x > y ? 1 : 0);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

// utils/blueprintKernel/identity.ts
function uidDeterministico(semente) {
  const hex = sha256(semente);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return formatarUuid(bytes, 8);
}
function formatarUuid(b, versao) {
  b[6] = b[6] & 15 | (versao & 15) << 4;
  b[8] = b[8] & 63 | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
var PREFIXO_ROTULO_UID = {
  level: "N",
  wall: "P",
  opening: "V",
  boundary: "L",
  structural: "C",
  /** Água de telhado — T de telhado; `A` colidiria com a leitura de "abertura". */
  roof: "T",
  /** Corte — S de seção; `C` já é o concreto. */
  section: "S",
  /** Eixo da malha — X de eixo; `E` já é a escada. */
  eixo: "X",
  /** Restrição — K (constraint); `R` já é a etiqueta de ambiente. */
  restricao: "K",
  /** Unidade autônoma — U. */
  unidade: "U",
  /** Grupo com origem — G. */
  grupo: "G",
  /** Núcleo vertical (shaft, elevador) — H (hollow). */
  nucleo: "H",
  /** Vaga de garagem — W; `V` já é o vão. */
  vaga: "W",
  /** Componente (mobiliário, louça…) — M de mobiliário. */
  componente: "M",
  /** Guarda-corpo e corrimão — B de balaustrada (G já é o grupo). */
  guardaCorpo: "B",
  /** Anotação — A. */
  anotacao: "A",
  /** Vista dependente — D (recorte nomeado de planta). */
  vistaDependente: "D",
  /** Sub-região do terreno — J (jardim; S é o corte, R a etiqueta). */
  subRegiao: "J",
  /** Trecho de rodapé — F (friso; R já é a etiqueta). */
  rodape: "F",
  /** Etapa de obra — Y (linha do tempo). */
  etapa: "Y",
  stair: "E",
  label: "R",
  /**
   * Trecho de instalação — I de instalação.
   *
   * ⚠️ NÃO `T`: já é o telhado. E não `R`, que já é o rótulo de ambiente. Um
   * prefixo repetido faria dois elementos diferentes se chamarem igual na tela,
   * e o rótulo curto existe justamente para alguém dizer "olha o P-3AF5" em voz
   * alta sem ambiguidade.
   */
  trecho: "I",
  /** Terminal de instalação — o ponto. */
  terminal: "O",
  /** Quadro de distribuição — Q. */
  quadro: "Q",
  /** Circuito — X, porque C é o concreto e S é a seção de corte. */
  circuito: "X"
};
function rotuloCurto(uid, familia) {
  return `${PREFIXO_ROTULO_UID[familia]}-${uid.slice(0, 4).toUpperCase()}`;
}

// utils/blueprintKernel/telhado.ts
var AGUA_INCLINACAO_MAX_PCT = 300;
function planoDaAgua(agua) {
  const n4 = agua.pontos.length;
  const i = agua.beiralIndex;
  const a = agua.pontos[i];
  const b = agua.pontos[(i + 1) % n4];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) {
    throw new KernelError("DEGENERATE_ROOF", "Beiral de comprimento zero");
  }
  const e = { x: dx / comp, y: dy / comp };
  const antiHorario = signedArea(agua.pontos) > 0;
  const normal = antiHorario ? { x: -e.y, y: e.x } : { x: e.y, y: -e.x };
  const tg = agua.inclinacaoPct / 100;
  return {
    origem: a,
    e,
    n: normal,
    eixoX: { x: normal.y, y: -normal.x },
    tg,
    fator: Math.sqrt(1 + tg * tg)
  };
}
function distanciaAoBeiralMm(agua, p) {
  const plano = planoDaAgua(agua);
  return (p.x - plano.origem.x) * plano.n.x + (p.y - plano.origem.y) * plano.n.y;
}
function alturaNaAgua(agua, p) {
  return agua.baseMm + distanciaAoBeiralMm(agua, p) * (agua.inclinacaoPct / 100);
}
function perfilDaAguaNoPlano(agua) {
  const plano = planoDaAgua(agua);
  return agua.pontos.map((p) => {
    const dx = p.x - plano.origem.x;
    const dy = p.y - plano.origem.y;
    return {
      x: dx * plano.eixoX.x + dy * plano.eixoX.y,
      y: (dx * plano.n.x + dy * plano.n.y) * plano.fator
    };
  });
}
function normalDaAgua(agua) {
  const plano = planoDaAgua(agua);
  return {
    x: -plano.tg * plano.n.x / plano.fator,
    y: -plano.tg * plano.n.y / plano.fator,
    z: 1 / plano.fator
  };
}
var MM2 = 1e6;
function medirAgua(agua) {
  const plano = planoDaAgua(agua);
  const areaProjetadaMm2 = polygonArea(agua.pontos);
  const areaProjetadaM2 = areaProjetadaMm2 / MM2;
  const areaRealM2 = areaProjetadaM2 * plano.fator;
  const n4 = agua.pontos.length;
  const a = agua.pontos[agua.beiralIndex];
  const b = agua.pontos[(agua.beiralIndex + 1) % n4];
  const alturas = agua.pontos.map((p) => alturaNaAgua(agua, p));
  return {
    areaProjetadaM2,
    areaRealM2,
    inclinacaoGraus: Math.atan(plano.tg) * 180 / Math.PI,
    comprimentoBeiralM: Math.hypot(b.x - a.x, b.y - a.y) / 1e3,
    alturaMaximaMm: roundToMm(Math.max(...alturas)),
    formula: `\xE1rea real = \xE1rea projetada \xD7 \u221A(1 + (${agua.inclinacaoPct}/100)\xB2) = ${areaProjetadaM2.toFixed(2)} \xD7 ${plano.fator.toFixed(4)}`
  };
}

// utils/blueprintKernel/model.ts
function faseDe(p) {
  return p.fase ?? "NOVO";
}
function assinaturaDasCamadas(camadas) {
  if (!camadas || camadas.length === 0) return "";
  return camadas.map((c) => `${c.espessuraMm}|${c.itemCode}|${c.funcao}`).join(";");
}
function assinaturaDaEsquadria(o) {
  return `${o.kind}|${o.widthMm}|${o.heightMm}|${o.esquadria?.nome ?? ""}|${o.esquadria?.itemCode ?? ""}`;
}
function nomeDaEsquadria(o) {
  const cm = (mm) => (mm / 10).toFixed(Math.round(mm) % 10 === 0 ? 0 : 1).replace(".", ",");
  return o.esquadria?.nome || `${nomeDoTipoDeAbertura(o.kind, o.embutida)} ${cm(o.widthMm)}\xD7${cm(o.heightMm)}`;
}
function nomeDoTipoDeAbertura(kind, embutida = false) {
  if (kind === "door") return "Porta";
  if (kind === "window") return "Janela";
  if (kind === "sliding") return embutida ? "Porta de correr embutida" : "Porta de correr";
  return "V\xE3o livre";
}
function acabamentosDoAmbiente(model, space) {
  if (!space.labelUid) return void 0;
  return (model.labels ?? []).find((l) => l.uid === space.labelUid)?.acabamentos;
}
var FORMA_ESTRUTURAL = {
  PILAR: "PONTO",
  ESTACA: "PONTO",
  BLOCO_COROAMENTO: "PONTO",
  VIGA: "LINHA",
  VIGA_FUNDACAO: "LINHA",
  LAJE: "AREA"
};
function nomeDoTipoEstrutural(kind) {
  if (kind === "PILAR") return "Pilar";
  if (kind === "VIGA") return "Viga";
  if (kind === "LAJE") return "Laje";
  if (kind === "ESTACA") return "Estaca";
  if (kind === "BLOCO_COROAMENTO") return "Bloco de coroamento";
  return "Viga de funda\xE7\xE3o";
}
function contornoEmPlanta(s2) {
  const forma = FORMA_ESTRUTURAL[s2.kind];
  if (forma === "AREA") return s2.pontos.map((p) => ({ ...p }));
  if (forma === "LINHA") return cantosDaParede(s2.pontos[0], s2.pontos[1], s2.larguraMm);
  const c = s2.pontos[0];
  const meiaL = s2.larguraMm / 2;
  const meiaP = (s2.circular ? s2.larguraMm : s2.profundidadeMm) / 2;
  const rad = s2.rotacaoDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sen = Math.sin(rad);
  return [
    { dx: -meiaL, dy: -meiaP },
    { dx: meiaL, dy: -meiaP },
    { dx: meiaL, dy: meiaP },
    { dx: -meiaL, dy: meiaP }
  ].map(({ dx, dy }) => ({
    x: roundToMm(c.x + dx * cos - dy * sen),
    y: roundToMm(c.y + dx * sen + dy * cos)
  }));
}
var CATALOGO_DE_COMPONENTES = {
  CAMA_CASAL: { rotulo: "Cama de casal", familia: "MOBILIARIO", larguraMm: 1400, profundidadeMm: 1900, alturaMm: 500, simbolo: "CAMA" },
  CAMA_SOLTEIRO: { rotulo: "Cama de solteiro", familia: "MOBILIARIO", larguraMm: 900, profundidadeMm: 1900, alturaMm: 500, simbolo: "CAMA" },
  CRIADO: { rotulo: "Criado-mudo", familia: "MOBILIARIO", larguraMm: 500, profundidadeMm: 400, alturaMm: 550, simbolo: "CAIXA" },
  ARMARIO: { rotulo: "Arm\xE1rio", familia: "ARMARIO", larguraMm: 1800, profundidadeMm: 600, alturaMm: 2200, simbolo: "ARMARIO" },
  ESTANTE: { rotulo: "Estante", familia: "ARMARIO", larguraMm: 900, profundidadeMm: 400, alturaMm: 1800, simbolo: "ARMARIO" },
  SOFA: { rotulo: "Sof\xE1", familia: "MOBILIARIO", larguraMm: 2e3, profundidadeMm: 900, alturaMm: 850, simbolo: "SOFA" },
  POLTRONA: { rotulo: "Poltrona", familia: "MOBILIARIO", larguraMm: 800, profundidadeMm: 850, alturaMm: 850, simbolo: "SOFA" },
  MESA_JANTAR: { rotulo: "Mesa de jantar", familia: "MOBILIARIO", larguraMm: 1400, profundidadeMm: 900, alturaMm: 750, simbolo: "MESA" },
  CADEIRA: { rotulo: "Cadeira", familia: "MOBILIARIO", larguraMm: 450, profundidadeMm: 450, alturaMm: 900, simbolo: "CADEIRA" },
  RACK: { rotulo: "Rack/TV", familia: "MOBILIARIO", larguraMm: 1600, profundidadeMm: 450, alturaMm: 600, simbolo: "CAIXA" },
  ESCRIVANINHA: { rotulo: "Escrivaninha", familia: "MOBILIARIO", larguraMm: 1200, profundidadeMm: 600, alturaMm: 750, simbolo: "MESA" },
  BANCADA: { rotulo: "Bancada com pia", familia: "BANCADA", larguraMm: 1800, profundidadeMm: 600, alturaMm: 900, simbolo: "PIA", ligaAoPonto: "PIA_COZINHA" },
  BANCADA_SECA: { rotulo: "Bancada", familia: "BANCADA", larguraMm: 1200, profundidadeMm: 600, alturaMm: 900, simbolo: "CAIXA" },
  GELADEIRA: { rotulo: "Geladeira", familia: "EQUIPAMENTO", larguraMm: 700, profundidadeMm: 700, alturaMm: 1800, simbolo: "GELADEIRA" },
  FOGAO: { rotulo: "Fog\xE3o", familia: "EQUIPAMENTO", larguraMm: 600, profundidadeMm: 600, alturaMm: 900, simbolo: "FOGAO" },
  TANQUE: { rotulo: "Tanque", familia: "LOUCA", larguraMm: 600, profundidadeMm: 600, alturaMm: 900, simbolo: "TANQUE", ligaAoPonto: "TANQUE" },
  MAQUINA: { rotulo: "M\xE1quina de lavar", familia: "EQUIPAMENTO", larguraMm: 600, profundidadeMm: 650, alturaMm: 900, simbolo: "MAQUINA", ligaAoPonto: "MAQUINA_LAVAR" },
  VASO: { rotulo: "Vaso sanit\xE1rio", familia: "LOUCA", larguraMm: 400, profundidadeMm: 650, alturaMm: 400, simbolo: "VASO", ligaAoPonto: "VASO_SANITARIO" },
  LAVATORIO: { rotulo: "Lavat\xF3rio", familia: "LOUCA", larguraMm: 500, profundidadeMm: 450, alturaMm: 850, simbolo: "LAVATORIO", ligaAoPonto: "LAVATORIO" },
  BOX: { rotulo: "Box", familia: "LOUCA", larguraMm: 900, profundidadeMm: 900, alturaMm: 2e3, simbolo: "BOX", ligaAoPonto: "CHUVEIRO" },
  // Climatização (E11.1). Medidas de referência de split residencial 9–24 kBTU
  // e de casa de máquinas mínima; a folga é a de manutenção/insuflamento usual
  // dos manuais de instalação (condensadora ≥ 300 mm nas laterais/atrás).
  CONDENSADORA: { rotulo: "Condensadora (split)", familia: "CLIMATIZACAO", larguraMm: 850, profundidadeMm: 330, alturaMm: 700, simbolo: "CONDENSADORA", folgaMm: 300 },
  EVAPORADORA: { rotulo: "Evaporadora hi-wall", familia: "CLIMATIZACAO", larguraMm: 900, profundidadeMm: 220, alturaMm: 300, simbolo: "EVAPORADORA", cotaMm: 2200, folgaMm: 150 },
  CASA_DE_MAQUINAS: { rotulo: "Casa de m\xE1quinas (reserva)", familia: "CLIMATIZACAO", larguraMm: 2e3, profundidadeMm: 1500, alturaMm: 2500, simbolo: "RESERVA", folgaMm: 600 },
  EXAUSTOR: { rotulo: "Exaustor / ventila\xE7\xE3o", familia: "CLIMATIZACAO", larguraMm: 400, profundidadeMm: 400, alturaMm: 400, simbolo: "EXAUSTOR", cotaMm: 2300, folgaMm: 100 },
  // Conjuntos (P2.18): as medidas são a caixa envolvente dos filhos (recalculada ao inserir).
  CONJUNTO_BANHEIRO: { rotulo: "Conjunto de banheiro (vaso, lavat\xF3rio, box)", familia: "LOUCA", larguraMm: 2400, profundidadeMm: 1500, alturaMm: 2e3, simbolo: "CONJUNTO" },
  CONJUNTO_JANTAR: { rotulo: "Conjunto de jantar (mesa + 4 cadeiras)", familia: "MOBILIARIO", larguraMm: 1900, profundidadeMm: 1900, alturaMm: 900, simbolo: "CONJUNTO" },
  CONJUNTO_DORMITORIO: { rotulo: "Conjunto de dormit\xF3rio (cama + 2 criados)", familia: "MOBILIARIO", larguraMm: 2500, profundidadeMm: 1900, alturaMm: 550, simbolo: "CONJUNTO" },
  CONJUNTO_COZINHA: { rotulo: "Conjunto de cozinha (bancada, fog\xE3o, geladeira)", familia: "EQUIPAMENTO", larguraMm: 3200, profundidadeMm: 700, alturaMm: 1800, simbolo: "CONJUNTO" }
};
var CONJUNTOS_DE_COMPONENTES = {
  CONJUNTO_BANHEIRO: [
    { tipoId: "VASO", dxMm: -900, dyMm: 350, rotacaoGraus: 0 },
    { tipoId: "LAVATORIO", dxMm: -150, dyMm: 450, rotacaoGraus: 0 },
    { tipoId: "BOX", dxMm: 750, dyMm: -300, rotacaoGraus: 0 }
  ],
  CONJUNTO_JANTAR: [
    { tipoId: "MESA_JANTAR", dxMm: 0, dyMm: 0, rotacaoGraus: 0 },
    { tipoId: "CADEIRA", dxMm: -350, dyMm: 700, rotacaoGraus: 180 },
    { tipoId: "CADEIRA", dxMm: 350, dyMm: 700, rotacaoGraus: 180 },
    { tipoId: "CADEIRA", dxMm: -350, dyMm: -700, rotacaoGraus: 0 },
    { tipoId: "CADEIRA", dxMm: 350, dyMm: -700, rotacaoGraus: 0 }
  ],
  CONJUNTO_DORMITORIO: [
    { tipoId: "CAMA_CASAL", dxMm: 0, dyMm: 0, rotacaoGraus: 0 },
    { tipoId: "CRIADO", dxMm: -1e3, dyMm: 750, rotacaoGraus: 0 },
    { tipoId: "CRIADO", dxMm: 1e3, dyMm: 750, rotacaoGraus: 0 }
  ],
  CONJUNTO_COZINHA: [
    { tipoId: "BANCADA", dxMm: -700, dyMm: 0, rotacaoGraus: 0 },
    { tipoId: "FOGAO", dxMm: 500, dyMm: 0, rotacaoGraus: 0 },
    { tipoId: "GELADEIRA", dxMm: 1200, dyMm: 0, rotacaoGraus: 0 }
  ]
};
var ehConjunto = (tipoId) => CONJUNTOS_DE_COMPONENTES[tipoId] !== void 0;
function comprimentoDoGuardaCorpo(g) {
  let s2 = 0;
  for (let i = 1; i < g.pontos.length; i++) s2 += Math.hypot(g.pontos[i].x - g.pontos[i - 1].x, g.pontos[i].y - g.pontos[i - 1].y);
  return s2;
}
var TIPOS_DE_PONTO_HIDRAULICO = [
  "TORNEIRA",
  "TORNEIRA_JARDIM",
  "CHUVEIRO",
  "LAVATORIO",
  "PIA_COZINHA",
  "TANQUE",
  "MAQUINA_LAVAR",
  "VASO_SANITARIO",
  "DUCHA_HIGIENICA",
  "RESERVATORIO",
  "BOMBA",
  "AQUECEDOR",
  "RALO_SECO",
  "RALO_SIFONADO",
  "CAIXA_SIFONADA",
  "CAIXA_INSPECAO",
  "CAIXA_GORDURA",
  "REGISTRO_GAVETA",
  "REGISTRO_PRESSAO",
  "VALVULA_RETENCAO",
  "HIDROMETRO",
  "CONEXAO_JOELHO_90",
  "CONEXAO_JOELHO_45",
  "CONEXAO_TE",
  "CONEXAO_LUVA",
  "CONEXAO_REDUCAO"
];
function emptyModel() {
  return {
    levels: [],
    walls: [],
    openings: [],
    boundaries: [],
    structures: [],
    roofs: [],
    sections: [],
    eixos: [],
    restricoes: [],
    unidades: [],
    grupos: [],
    nucleos: [],
    vagas: [],
    componentes: [],
    guardaCorpos: [],
    anotacoes: [],
    vistasDependentes: [],
    subRegioes: [],
    rodapes: [],
    etapas: [],
    stairs: [],
    trechos: [],
    terminais: [],
    quadros: [],
    circuitos: [],
    labels: [],
    spaces: [],
    areaEscrituraMm2: null,
    georreferencia: null,
    seq: {}
  };
}
function nextId(model, prefix) {
  const n4 = (model.seq[prefix] ?? 0) + 1;
  model.seq[prefix] = n4;
  return `${prefix}_${String(n4).padStart(4, "0")}`;
}
function unidadeDaEtiqueta(model, labelUid) {
  return (model.unidades ?? []).find((u) => u.etiquetaUids.includes(labelUid)) ?? null;
}
function pavimentoMaisAlto(model) {
  let melhor = null;
  for (const l of model.levels) if (!melhor || l.elevationMm > melhor.elevationMm) melhor = l;
  return melhor;
}
function pavimentosDoNucleo(model, n4) {
  const partida = model.levels.find((l) => l.id === n4.levelId);
  if (!partida) return [];
  const chegada = n4.ateLevelId && model.levels.find((l) => l.id === n4.ateLevelId) || pavimentoMaisAlto(model) || partida;
  const topo = Math.max(partida.elevationMm, chegada.elevationMm);
  return model.levels.filter((l) => l.elevationMm >= partida.elevationMm && l.elevationMm <= topo).sort((a, b) => a.elevationMm - b.elevationMm);
}
function wallLength(wall) {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}
function isFreeWallEnd(walls, p, exceptId) {
  let encontros = 0;
  for (const w of walls) {
    if (w.a.x === p.x && w.a.y === p.y) encontros++;
    if (w.b.x === p.x && w.b.y === p.y) encontros++;
  }
  if (encontros > 1) return false;
  for (const o of walls) {
    if (o.id === exceptId) continue;
    const dx = o.b.x - o.a.x;
    const dy = o.b.y - o.a.y;
    const comp2 = dx * dx + dy * dy;
    if (comp2 === 0) continue;
    let t = ((p.x - o.a.x) * dx + (p.y - o.a.y) * dy) / comp2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(o.a.x + t * dx - p.x, o.a.y + t * dy - p.y);
    if (d <= o.thicknessMm / 2) return false;
  }
  return true;
}
var AVANCO_MAX = 4;
function extensaoDeCanto(walls, wall, end) {
  const p = wall[end];
  if (isFreeWallEnd(walls, p, wall.id)) return 0;
  const meia = wall.thicknessMm / 2;
  const vizinhas = walls.filter(
    (o) => o.id !== wall.id && (o.a.x === p.x && o.a.y === p.y || o.b.x === p.x && o.b.y === p.y)
  );
  if (vizinhas.length !== 1) return meia;
  const versor = (w) => {
    const longe = w.a.x === p.x && w.a.y === p.y ? w.b : w.a;
    const dx = longe.x - p.x;
    const dy = longe.y - p.y;
    const comp = Math.hypot(dx, dy);
    return comp === 0 ? null : { x: dx / comp, y: dy / comp };
  };
  const u1 = versor(wall);
  const u2 = versor(vizinhas[0]);
  if (!u1 || !u2) return meia;
  const cos = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
  const tg = Math.tan(Math.acos(cos) / 2);
  if (!Number.isFinite(tg) || tg <= 1e-9) return meia * AVANCO_MAX;
  return Math.min(meia / tg, meia * AVANCO_MAX);
}

// utils/blueprintKernel/exterior.ts
function paredeEhExterna(model, wall, tolerance = DEFAULT_TOLERANCE_MM) {
  const comp = wallLength(wall);
  if (comp <= 0) return null;
  const ux = (wall.b.x - wall.a.x) / comp;
  const uy = (wall.b.y - wall.a.y) / comp;
  const nx = -uy;
  const ny = ux;
  const mx = (wall.a.x + wall.b.x) / 2;
  const my = (wall.a.y + wall.b.y) / 2;
  const d = wall.thicknessMm / 2 + 2 * tolerance + 1;
  const dentro = (p) => model.spaces.some(
    (s2) => s2.levelId === wall.levelId && pointInPolygon(s2.ring, p) && !s2.holes.some((h) => pointInPolygon(h, p))
  );
  const esquerda = dentro({ x: mx + nx * d, y: my + ny * d });
  const direita = dentro({ x: mx - nx * d, y: my - ny * d });
  if (esquerda && direita) return false;
  if (esquerda || direita) return true;
  return null;
}

// utils/blueprintKernel/coberturaExtrusao.ts
var MENSAGEM_DO_ERRO_DE_PERFIL = {
  PERFIL_CURTO: "O perfil precisa de pelo menos dois pontos",
  PERFIL_VOLTA: "O perfil volta sobre si mesmo (s decrescente)",
  PERFIL_INGREME: `Trecho do perfil mais \xEDngreme que ${AGUA_INCLINACAO_MAX_PCT} % \u2014 n\xE3o \xE9 \xE1gua, \xE9 parede`,
  EIXO_DEGENERADO: "O eixo da extrus\xE3o tem comprimento zero",
  PERFIL_SEM_AGUA: "O perfil s\xF3 tem trechos verticais \u2014 nenhuma \xE1gua"
};

// utils/blueprintKernel/sobreposicao.ts
function faixaVertical(x) {
  if ("thicknessMm" in x) return { base: 0, topo: x.heightMm };
  return { base: x.baseMm, topo: x.baseMm + x.alturaMm };
}
function pegadaEmPlanta(x) {
  if ("thicknessMm" in x) return cantosDaParede(x.a, x.b, x.thicknessMm);
  if (x.circular && FORMA_ESTRUTURAL[x.kind] === "PONTO") {
    const c = x.pontos[0];
    const r = x.larguraMm / 2;
    return Array.from({ length: 24 }, (_, i) => {
      const t = i / 24 * Math.PI * 2;
      return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
    });
  }
  return contornoEmPlanta(x);
}
function ehConvexo(anel) {
  if (anel.length < 3) return false;
  let sinal = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const c = anel[(i + 2) % anel.length];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (z === 0) continue;
    const s2 = z > 0 ? 1 : -1;
    if (sinal === 0) sinal = s2;
    else if (s2 !== sinal) return false;
  }
  return sinal !== 0;
}
function recortar(sujeito, faca) {
  const horario = signedArea(faca) < 0;
  let saida = sujeito;
  for (let i = 0; i < faca.length && saida.length > 0; i++) {
    const a = faca[i];
    const b = faca[(i + 1) % faca.length];
    const dentro = (p) => {
      const z = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      return horario ? z <= 0 : z >= 0;
    };
    const corta = (p, q) => {
      const d1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      const d2 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
      const t = d1 / (d1 - d2);
      return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
    };
    const entrada = saida;
    saida = [];
    for (let k = 0; k < entrada.length; k++) {
      const atual = entrada[k];
      const anterior = entrada[(k + entrada.length - 1) % entrada.length];
      if (dentro(atual)) {
        if (!dentro(anterior)) saida.push(corta(anterior, atual));
        saida.push(atual);
      } else if (dentro(anterior)) {
        saida.push(corta(anterior, atual));
      }
    }
  }
  return saida;
}
function recorteComum(um, outro) {
  if (um.length < 3 || outro.length < 3) return [];
  const faca = ehConvexo(outro) ? outro : ehConvexo(um) ? um : null;
  if (!faca) return [];
  const sujeito = faca === outro ? um : outro;
  return recortar(sujeito, faca);
}
function areaComum(um, outro) {
  if (um.length < 3 || outro.length < 3) return 0;
  const faca = ehConvexo(outro) ? outro : ehConvexo(um) ? um : null;
  if (!faca) return 0;
  const sujeito = faca === outro ? um : outro;
  return polygonArea(recortar(sujeito, faca));
}
function sobreposicoesDe(model, id) {
  const alvo = model.walls.find((w) => w.id === id) ?? (model.structures ?? []).find((s2) => s2.id === id) ?? null;
  if (!alvo) return [];
  const nivel = alvo.levelId;
  const candidatos = [
    // Parede só entra como candidata quando o alvo NÃO é parede.
    ..."thicknessMm" in alvo ? [] : model.walls.filter((w) => w.levelId === nivel),
    ...(model.structures ?? []).filter((s2) => s2.levelId === nivel && s2.id !== id)
  ];
  const meu = pegadaEmPlanta(alvo);
  const minha = faixaVertical(alvo);
  const achadas = [];
  for (const outro of candidatos) {
    const dele = faixaVertical(outro);
    const alturaMm = Math.min(minha.topo, dele.topo) - Math.max(minha.base, dele.base);
    if (alturaMm <= 0) continue;
    const areaPlantaMm2 = areaComum(meu, pegadaEmPlanta(outro));
    if (areaPlantaMm2 <= 0) continue;
    achadas.push({
      aId: "thicknessMm" in outro ? outro.id : alvo.id,
      bId: "thicknessMm" in outro ? alvo.id : outro.id,
      areaPlantaMm2,
      alturaMm,
      volumeMm3: areaPlantaMm2 * alturaMm
    });
  }
  return achadas;
}
function sobreposicoesDoModelo(model) {
  const vistas = /* @__PURE__ */ new Set();
  const todas = [];
  for (const s2 of model.structures ?? []) {
    for (const so of sobreposicoesDe(model, s2.id)) {
      const chave = [so.aId, so.bId].sort().join("|");
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      todas.push(so);
    }
  }
  return todas;
}

// utils/blueprintKernel/escada.ts
var BLONDEL_MIN_MM = 630;
var BLONDEL_MAX_MM = 650;
var ESPELHO_MIN_MM = 160;
var ESPELHO_MAX_MM = 180;
var RAMPA_INCLINACAO_MAX_PCT = 8.33;
function nivelDeChegada(model, escada) {
  const partida = model.levels.find((l) => l.id === escada.levelId);
  if (!partida) return null;
  if (escada.ateLevelId) {
    const declarada = model.levels.find((l) => l.id === escada.ateLevelId);
    if (declarada && declarada.elevationMm > partida.elevationMm) return declarada;
  }
  let melhor = null;
  for (const l of model.levels) {
    if (l.elevationMm <= partida.elevationMm) continue;
    if (!melhor || l.elevationMm < melhor.elevationMm) melhor = l;
  }
  return melhor;
}
function desnivelDaEscada(model, escada) {
  const partida = model.levels.find((l) => l.id === escada.levelId);
  if (!partida) return 0;
  const chegada = nivelDeChegada(model, escada);
  return chegada ? chegada.elevationMm - partida.elevationMm : partida.defaultHeightMm;
}
function comprimentoDoPercurso(pontos) {
  let total = 0;
  for (let i = 0; i + 1 < pontos.length; i++) {
    total += Math.hypot(pontos[i + 1].x - pontos[i].x, pontos[i + 1].y - pontos[i].y);
  }
  return total;
}
function noPercurso(pontos, u) {
  let restante = Math.max(0, u);
  for (let i = 0; i + 1 < pontos.length; i++) {
    const dx = pontos[i + 1].x - pontos[i].x;
    const dy = pontos[i + 1].y - pontos[i].y;
    const comp = Math.hypot(dx, dy);
    if (comp === 0) continue;
    const dir = { x: dx / comp, y: dy / comp };
    if (restante <= comp || i + 2 === pontos.length) {
      return { p: { x: pontos[i].x + dir.x * restante, y: pontos[i].y + dir.y * restante }, dir };
    }
    restante -= comp;
  }
  return { p: pontos[0], dir: { x: 1, y: 0 } };
}
function cruzamento(p, u, q, v) {
  const den = u.x * v.y - u.y * v.x;
  if (Math.abs(den) < 0.05) return null;
  const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / den;
  return { x: p.x + t * u.x, y: p.y + t * u.y };
}
function contornoDaEscada(escada) {
  const { esquerda, direita } = bordasDaEscada(escada);
  if (esquerda.length === 0) return [];
  return [...esquerda, ...direita.slice().reverse()];
}
function bordasDaEscada(escada) {
  const pts = escada.pontos;
  const meia = escada.larguraMm / 2;
  const trechos = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const comp = Math.hypot(dx, dy);
    if (comp === 0) continue;
    const dir = { x: dx / comp, y: dy / comp };
    trechos.push({ p: pts[i], dir, n: { x: -dir.y, y: dir.x } });
  }
  if (trechos.length === 0) return { esquerda: [], direita: [] };
  const borda = (lado) => {
    const saida = [];
    const desloca = (p, n4) => ({ x: p.x + n4.x * meia * lado, y: p.y + n4.y * meia * lado });
    saida.push(desloca(trechos[0].p, trechos[0].n));
    for (let i = 0; i + 1 < trechos.length; i++) {
      const a = trechos[i];
      const b = trechos[i + 1];
      const pa = desloca(a.p, a.n);
      const pb = desloca(b.p, b.n);
      saida.push(cruzamento(pa, a.dir, pb, b.dir) ?? pb);
    }
    const ultimo = trechos[trechos.length - 1];
    saida.push(desloca(pts[pts.length - 1], ultimo.n));
    return saida.map((p) => point(roundToMm(p.x), roundToMm(p.y)));
  };
  return { esquerda: borda(1), direita: borda(-1) };
}
function degrausDaEscada(model, escada) {
  if (escada.tipo === "RAMPA") return [];
  const m = medirEscada(model, escada);
  if (m.degraus < 2) return [];
  const meia = escada.larguraMm / 2;
  const saida = [];
  for (let i = 0; i < m.degraus; i++) {
    const u = i * m.pisoMm;
    const { p, dir } = noPercurso(escada.pontos, u);
    const n4 = { x: -dir.y, y: dir.x };
    saida.push({
      indice: i,
      uMm: u,
      cotaMm: (i + 1) * m.espelhoMm,
      a: { x: p.x + n4.x * meia, y: p.y + n4.y * meia },
      b: { x: p.x - n4.x * meia, y: p.y - n4.y * meia }
    });
  }
  return saida;
}
function medirEscada(model, escada) {
  const desnivelMm = desnivelDaEscada(model, escada);
  const comprimentoMm = comprimentoDoPercurso(escada.pontos);
  const contorno = contornoDaEscada(escada);
  const chegada = nivelDeChegada(model, escada);
  const inclinacaoPct = comprimentoMm > 0 ? desnivelMm / comprimentoMm * 100 : 0;
  const comprimentoInclinadoMm = Math.hypot(comprimentoMm, desnivelMm);
  const avisos = [];
  if (escada.tipo === "RAMPA") {
    if (inclinacaoPct > RAMPA_INCLINACAO_MAX_PCT) {
      avisos.push(
        `Inclina\xE7\xE3o de ${inclinacaoPct.toFixed(1).replace(".", ",")}% passa dos ${String(RAMPA_INCLINACAO_MAX_PCT).replace(".", ",")}% que a NBR 9050 admite \u2014 alongue a rampa ou acrescente patamar.`
      );
    }
    return {
      desnivelMm,
      nivelDeChegada: chegada,
      degraus: 0,
      espelhoMm: 0,
      pisoMm: 0,
      comprimentoMm,
      comprimentoInclinadoMm,
      inclinacaoPct,
      blondelMm: 0,
      contorno,
      areaPlantaMm2: contorno.length >= 3 ? Math.round(polygonArea(contorno)) : 0,
      avisos
    };
  }
  const degraus = Math.max(2, Math.round(desnivelMm / escada.alvoEspelhoMm) || 2);
  const espelhoMm = desnivelMm / degraus;
  const pisoMm = comprimentoMm / (degraus - 1);
  const blondelMm = 2 * espelhoMm + pisoMm;
  if (espelhoMm < ESPELHO_MIN_MM || espelhoMm > ESPELHO_MAX_MM) {
    avisos.push(
      `Espelho de ${Math.round(espelhoMm)} mm fora da faixa de ${ESPELHO_MIN_MM} a ${ESPELHO_MAX_MM} mm da NBR 9050.`
    );
  }
  if (blondelMm < BLONDEL_MIN_MM || blondelMm > BLONDEL_MAX_MM) {
    avisos.push(
      `Blondel em ${Math.round(blondelMm)} mm \u2014 a escada fica ${blondelMm < BLONDEL_MIN_MM ? "curta e apressada" : "esticada e cansativa"}. O confort\xE1vel \xE9 de ${BLONDEL_MIN_MM} a ${BLONDEL_MAX_MM} mm (2 \xD7 espelho + piso); ${blondelMm < BLONDEL_MIN_MM ? "alongue" : "encurte"} o percurso.`
    );
  }
  return {
    desnivelMm,
    nivelDeChegada: chegada,
    degraus,
    espelhoMm,
    pisoMm,
    comprimentoMm,
    comprimentoInclinadoMm,
    inclinacaoPct,
    blondelMm,
    contorno,
    areaPlantaMm2: contorno.length >= 3 ? Math.round(polygonArea(contorno)) : 0,
    avisos
  };
}
function furosDaEscada(model) {
  const lajes = (model.structures ?? []).filter((s2) => s2.kind === "LAJE");
  if (lajes.length === 0) return [];
  const cotaDoNivel = (levelId) => model.levels.find((l) => l.id === levelId)?.elevationMm ?? null;
  const saida = [];
  for (const escada of model.stairs ?? []) {
    const partida = cotaDoNivel(escada.levelId);
    if (partida === null) continue;
    const chegada = partida + desnivelDaEscada(model, escada);
    const pegada = contornoDaEscada(escada);
    if (pegada.length < 3) continue;
    for (const laje of lajes) {
      const base = cotaDoNivel(laje.levelId);
      if (base === null) continue;
      const cotaDaLaje = base + laje.baseMm;
      if (cotaDaLaje <= partida || cotaDaLaje > chegada) continue;
      const contorno = recorteComum(pegada, contornoEmPlanta(laje));
      if (contorno.length < 3) continue;
      const areaMm2 = Math.round(polygonArea(contorno));
      if (areaMm2 <= 0) continue;
      saida.push({ escadaId: escada.id, structuralId: laje.id, areaMm2, contorno });
    }
  }
  return saida;
}
function cotaNoPercurso(desnivelMm, comprimentoMm, u) {
  if (comprimentoMm <= 0) return 0;
  return desnivelMm * Math.max(0, Math.min(comprimentoMm, u)) / comprimentoMm;
}
function fatiasDaEscada(model, escada) {
  const m = medirEscada(model, escada);
  if (escada.tipo === "RAMPA") {
    const { esquerda, direita } = bordasDaEscada(escada);
    if (esquerda.length < 2) return [];
    const saida2 = [];
    let u = 0;
    for (let k = 0; k + 1 < escada.pontos.length; k++) {
      const trecho = Math.hypot(
        escada.pontos[k + 1].x - escada.pontos[k].x,
        escada.pontos[k + 1].y - escada.pontos[k].y
      );
      const cotaA = cotaNoPercurso(m.desnivelMm, m.comprimentoMm, u);
      const cotaB = cotaNoPercurso(m.desnivelMm, m.comprimentoMm, u + trecho);
      saida2.push({
        indice: k,
        cantos: [esquerda[k], esquerda[k + 1], direita[k + 1], direita[k]],
        cotasMm: [cotaA, cotaB, cotaB, cotaA]
      });
      u += trecho;
    }
    return saida2;
  }
  const degraus = degrausDaEscada(model, escada);
  const saida = [];
  for (let i = 0; i + 1 < degraus.length; i++) {
    const de = degraus[i];
    const ate = degraus[i + 1];
    saida.push({
      indice: i,
      cantos: [de.a, ate.a, ate.b, de.b],
      cotasMm: [de.cotaMm, de.cotaMm, de.cotaMm, de.cotaMm]
    });
  }
  return saida;
}

// utils/blueprintKernel/arrangement.ts
function snapVertices(raw, tolerance) {
  const sorted = [...raw].sort((p, q) => p.x !== q.x ? p.x - q.x : p.y - q.y);
  const vertices = [];
  const assignment = /* @__PURE__ */ new Map();
  const cells = /* @__PURE__ */ new Map();
  const cellOf = (v) => Math.floor(v / tolerance);
  const cellKey = (cx, cy) => (cx + 25e4) * 500001 + (cy + 25e4);
  const findNear = (p) => {
    const cx = cellOf(p.x);
    const cy = cellOf(p.y);
    let best = -1;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = cells.get(cellKey(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const index of bucket) {
          if (best !== -1 && index >= best) continue;
          if (distanceSq(vertices[index], p) <= tolerance * tolerance) best = index;
        }
      }
    }
    return best;
  };
  for (const p of sorted) {
    const key = pointKey(p);
    if (assignment.has(key)) continue;
    let found = findNear(p);
    if (found === -1) {
      vertices.push({ x: p.x, y: p.y });
      found = vertices.length - 1;
      const k = cellKey(cellOf(p.x), cellOf(p.y));
      const bucket = cells.get(k);
      if (bucket) bucket.push(found);
      else cells.set(k, [found]);
    }
    assignment.set(key, found);
  }
  const indexOf = (p) => {
    const direct = assignment.get(pointKey(p));
    if (direct !== void 0) return direct;
    return findNear(p);
  };
  return { vertices, indexOf };
}
function connectedComponents(vertexCount, edges) {
  const parent = Array.from({ length: vertexCount }, (_, i) => i);
  const find = (x) => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  for (const e of edges) {
    const a = find(e.from);
    const b = find(e.to);
    if (a !== b) parent[a] = b;
  }
  return parent.map((_, i) => find(i));
}
function splitAtIntersections(segments) {
  const n4 = segments.length;
  const cutPoints = segments.map(() => []);
  const boxes = segments.map((s2) => ({
    minX: Math.min(s2.a.x, s2.b.x),
    minY: Math.min(s2.a.y, s2.b.y),
    maxX: Math.max(s2.a.x, s2.b.x),
    maxY: Math.max(s2.a.y, s2.b.y)
  }));
  let extentSum = 0;
  for (const b of boxes) extentSum += Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const cell = Math.max(1, Math.ceil(extentSum / Math.max(1, n4)));
  const buckets = /* @__PURE__ */ new Map();
  const cellKey = (cx, cy) => (cx + 2e6) * 4000003 + (cy + 2e6);
  const candidates = /* @__PURE__ */ new Set();
  for (let i = 0; i < n4; i++) {
    const b = boxes[i];
    const x0 = Math.floor(b.minX / cell);
    const x1 = Math.floor(b.maxX / cell);
    const y0 = Math.floor(b.minY / cell);
    const y1 = Math.floor(b.maxY / cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = cellKey(cx, cy);
        const bucket = buckets.get(k);
        if (bucket) {
          for (const j of bucket) candidates.add(j * n4 + i);
          bucket.push(i);
        } else {
          buckets.set(k, [i]);
        }
      }
    }
  }
  for (const encoded of candidates) {
    const lo = Math.floor(encoded / n4);
    const hi = encoded % n4;
    const blo = boxes[lo];
    const bhi = boxes[hi];
    if (blo.maxX < bhi.minX || bhi.maxX < blo.minX || blo.maxY < bhi.minY || bhi.maxY < blo.minY) {
      continue;
    }
    const hit = intersectSegments(segments[lo], segments[hi]);
    if (hit.kind === "point" && hit.at) {
      if (isInteriorCut(segments[lo].a, segments[lo].b, hit.at)) cutPoints[lo].push(hit.at);
      if (isInteriorCut(segments[hi].a, segments[hi].b, hit.at)) cutPoints[hi].push(hit.at);
    } else if (hit.kind === "overlap" && hit.overlap) {
      for (const end of [hit.overlap.a, hit.overlap.b]) {
        if (isInteriorCut(segments[lo].a, segments[lo].b, end)) cutPoints[lo].push(end);
        if (isInteriorCut(segments[hi].a, segments[hi].b, end)) cutPoints[hi].push(end);
      }
    }
  }
  const out = [];
  for (let i = 0; i < n4; i++) {
    const s2 = segments[i];
    const deduped = [];
    const seen = /* @__PURE__ */ new Set();
    for (const p of cutPoints[i]) {
      const key = pointKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
    }
    const cuts = deduped.sort((p, q) => {
      const d = distanceSq(s2.a, p) - distanceSq(s2.a, q);
      if (d !== 0) return d;
      return p.x !== q.x ? p.x - q.x : p.y - q.y;
    });
    let cursor = s2.a;
    for (const cut of cuts) {
      if (!pointsEqual(cursor, cut)) out.push({ a: cursor, b: cut });
      cursor = cut;
    }
    if (!pointsEqual(cursor, s2.b)) out.push({ a: cursor, b: s2.b });
  }
  return out;
}
function extractFaces(vertices, edges) {
  const halfEdges = [];
  const outgoing = /* @__PURE__ */ new Map();
  const addHalf = (from, to) => {
    const dx = vertices[to].x - vertices[from].x;
    const dy = vertices[to].y - vertices[from].y;
    const index = halfEdges.length;
    halfEdges.push({ from, to, angle: Math.atan2(dy, dx), visited: false });
    const list = outgoing.get(from) ?? [];
    list.push(index);
    outgoing.set(from, list);
  };
  for (const e of edges) {
    addHalf(e.from, e.to);
    addHalf(e.to, e.from);
  }
  for (const [vertex, list] of outgoing) {
    list.sort((x, y) => {
      const d = halfEdges[x].angle - halfEdges[y].angle;
      return d !== 0 ? d : halfEdges[x].to - halfEdges[y].to;
    });
    outgoing.set(vertex, list);
  }
  const faces = [];
  for (let start = 0; start < halfEdges.length; start++) {
    if (halfEdges[start].visited) continue;
    const cycle = [];
    let current = start;
    let guard = 0;
    while (!halfEdges[current].visited) {
      if (guard++ > halfEdges.length * 2) break;
      halfEdges[current].visited = true;
      cycle.push(halfEdges[current].from);
      const arrivedAt = halfEdges[current].to;
      const twin = current % 2 === 0 ? current + 1 : current - 1;
      const fan = outgoing.get(arrivedAt) ?? [];
      const pos = fan.indexOf(twin);
      if (pos === -1) break;
      current = fan[(pos - 1 + fan.length) % fan.length];
    }
    if (cycle.length >= 3) faces.push(cycle);
  }
  return faces;
}
function pontesEstruturais(model, level) {
  const estruturas = (model.structures ?? []).filter((s2) => s2.levelId === level.id);
  if (estruturas.length === 0) return [];
  const paredes = model.walls.filter((w) => w.levelId === level.id);
  if (paredes.length === 0) return [];
  const pontes = [];
  for (const s2 of estruturas) {
    if (FORMA_ESTRUTURAL[s2.kind] !== "PONTO") continue;
    if (!(s2.baseMm <= 0 && s2.baseMm + s2.alturaMm > 0)) continue;
    const pegada = contornoEmPlanta(s2);
    if (pegada.length < 3) continue;
    const centro = s2.pontos[0];
    for (const w of paredes) {
      for (const ponta of [w.a, w.b]) {
        if (!pointInPolygon(pegada, ponta)) continue;
        if (ponta.x === centro.x && ponta.y === centro.y) continue;
        pontes.push({ a: { ...ponta }, b: { ...centro } });
      }
    }
  }
  return pontes;
}
function segmentosDoNivel(model, level) {
  return [
    ...model.walls.filter((w) => w.levelId === level.id).map((w) => ({ a: w.a, b: w.b })),
    ...model.boundaries.filter((b) => b.levelId === level.id && b.kind !== "TERRENO" && b.kind !== "RESTRICAO").map((b) => ({ a: b.a, b: b.b })),
    ...pontesEstruturais(model, level)
  ];
}
function buildArrangement(model, level, tolerance = DEFAULT_TOLERANCE_MM) {
  const rawSegments = segmentosDoNivel(model, level);
  if (rawSegments.length === 0) return { spaces: [], danglingVertices: [] };
  const split = splitAtIntersections(rawSegments);
  const endpoints = split.flatMap((s2) => [s2.a, s2.b]);
  const { vertices, indexOf } = snapVertices(endpoints, tolerance);
  const edgeSet = /* @__PURE__ */ new Map();
  for (const s2 of split) {
    const from = indexOf(s2.a);
    const to = indexOf(s2.b);
    if (from === -1 || to === -1 || from === to) continue;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    edgeSet.set(`${lo}-${hi}`, { from: lo, to: hi });
  }
  const edges = [...edgeSet.values()].sort(
    (x, y) => x.from !== y.from ? x.from - y.from : x.to - y.to
  );
  const degree = /* @__PURE__ */ new Map();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const danglingVertices = [...degree.entries()].filter(([, d]) => d === 1).map(([v]) => vertices[v]).sort((p, q) => p.x !== q.x ? p.x - q.x : p.y - q.y);
  const cycles = extractFaces(vertices, edges);
  const component = connectedComponents(vertices.length, edges);
  const boundedCycles = cycles.filter(
    (cycle) => cycle.length >= 3 && signedArea(cycle.map((i) => vertices[i])) > 0
  );
  const unique = [];
  const uniqueComponent = [];
  const seen = /* @__PURE__ */ new Set();
  for (const cycle of boundedCycles) {
    const ring = canonicalizeRing(cycle.map((i) => vertices[i]));
    const key = ring.map(pointKey).join("|");
    if (seen.has(key)) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (polygonArea(ring) > (maxX - minX) * (maxY - minY) + 1) continue;
    seen.add(key);
    unique.push(ring);
    uniqueComponent.push(component[cycle[0]]);
  }
  const boxes = unique.map((ring) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  });
  const areas = unique.map(polygonArea);
  const holesOf = /* @__PURE__ */ new Map();
  for (let i = 0; i < unique.length; i++) {
    let container = -1;
    for (let j = 0; j < unique.length; j++) {
      if (i === j) continue;
      if (uniqueComponent[i] === uniqueComponent[j]) continue;
      if (areas[j] <= areas[i]) continue;
      if (container !== -1 && areas[j] >= areas[container]) continue;
      const bi = boxes[i];
      const bj = boxes[j];
      if (bi.minX < bj.minX || bi.minY < bj.minY || bi.maxX > bj.maxX || bi.maxY > bj.maxY) {
        continue;
      }
      if (!pointInPolygon(unique[j], unique[i][0])) continue;
      container = j;
    }
    if (container !== -1) {
      const list = holesOf.get(container) ?? [];
      list.push(unique[i]);
      holesOf.set(container, list);
    }
  }
  const spaces = [];
  let ordinal = 0;
  const ordered = unique.map((ring, index) => ({ ring, index })).sort((a, b) => {
    const pa = a.ring[0];
    const pb = b.ring[0];
    return pa.x !== pb.x ? pa.x - pb.x : pa.y - pb.y;
  });
  for (const { ring, index } of ordered) {
    const holes = (holesOf.get(index) ?? []).sort((a, b) => {
      const pa = a[0];
      const pb = b[0];
      return pa.x !== pb.x ? pa.x - pb.x : pa.y - pb.y;
    });
    const grossArea = polygonArea(ring);
    const holeArea = holes.reduce((sum, h) => sum + polygonArea(h), 0);
    ordinal += 1;
    spaces.push({
      id: `spc_${level.id}_${String(ordinal).padStart(4, "0")}`,
      levelId: level.id,
      ring,
      holes,
      areaMm2: grossArea - holeArea,
      perimeterMm: polygonPerimeter(ring)
    });
  }
  return { spaces, danglingVertices };
}
function contornoExternoDoNivel(model, level, tolerance = DEFAULT_TOLERANCE_MM) {
  const rawSegments = segmentosDoNivel(model, level);
  if (rawSegments.length === 0) return [];
  const split = splitAtIntersections(rawSegments);
  const endpoints = split.flatMap((s2) => [s2.a, s2.b]);
  const { vertices, indexOf } = snapVertices(endpoints, tolerance);
  const edgeSet = /* @__PURE__ */ new Map();
  for (const s2 of split) {
    const from = indexOf(s2.a);
    const to = indexOf(s2.b);
    if (from === -1 || to === -1 || from === to) continue;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    edgeSet.set(`${lo}-${hi}`, { from: lo, to: hi });
  }
  const edges = [...edgeSet.values()].sort(
    (x, y) => x.from !== y.from ? x.from - y.from : x.to - y.to
  );
  if (edges.length === 0) return [];
  const cycles = extractFaces(vertices, edges);
  const component = connectedComponents(vertices.length, edges);
  const porComponente = /* @__PURE__ */ new Map();
  for (const cycle of cycles) {
    if (cycle.length < 3) continue;
    const anel = cycle.map((i) => vertices[i]);
    const area = signedArea(anel);
    if (area >= 0) continue;
    const comp = component[cycle[0]];
    const atual = porComponente.get(comp);
    if (!atual || Math.abs(area) > atual.area) {
      porComponente.set(comp, { anel: canonicalizeRing(anel), area: Math.abs(area) });
    }
  }
  return [...porComponente.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.anel);
}
function recomputeSpaces(model, tolerance = DEFAULT_TOLERANCE_MM) {
  const levels = [...model.levels].sort((a, b) => a.id.localeCompare(b.id));
  const spaces = [];
  for (const level of levels) {
    spaces.push(...buildArrangement(model, level, tolerance).spaces);
  }
  model.spaces = spaces;
  aplicarEtiquetas(model);
  return model;
}
function aplicarEtiquetas(model) {
  const labels = [...model.labels ?? []].sort((a, b) => a.id.localeCompare(b.id));
  if (labels.length === 0) return;
  for (const space of model.spaces) {
    for (const label of labels) {
      if (label.levelId !== space.levelId) continue;
      if (!pointInPolygon(space.ring, label.at)) continue;
      if (space.holes.some((h) => pointInPolygon(h, label.at))) continue;
      space.name = label.name;
      space.labelUid = label.uid;
      break;
    }
  }
}

// utils/blueprintKernel/canonical.ts
function cmpStr(x, y) {
  return x < y ? -1 : x > y ? 1 : 0;
}
function ordenar(itens, projetar2, chave) {
  return itens.map((item) => {
    const geom = projetar2(item);
    return { item, geom, serial: stableStringify(geom) };
  }).sort(
    (x, y) => chave(x.item, y.item) || cmpStr(x.serial, y.serial) || cmpStr(x.item.uid ?? "", y.item.uid ?? "")
  );
}
function parametrosCanonicos(p) {
  return p && Object.keys(p).length > 0 ? { ...p } : void 0;
}
function projetar(model) {
  const ordemDosNiveis = ordenar(
    model.levels,
    (l) => ({ name: l.name, elevationMm: l.elevationMm, defaultHeightMm: l.defaultHeightMm }),
    (a, b) => a.elevationMm - b.elevationMm || a.name.localeCompare(b.name)
  );
  const levelIndex = new Map(ordemDosNiveis.map((l, i) => [l.item.id, i]));
  const nivel = (levelId) => levelIndex.get(levelId) ?? 0;
  const levels = ordemDosNiveis.map((l) => ({
    ...l,
    geom: { ...l.geom, tipoDe: l.item.tipoDeId !== void 0 ? nivel(l.item.tipoDeId) : void 0 }
  }));
  const etapas = ordenar(
    model.etapas ?? [],
    (e) => ({ nome: e.nome, ordem: e.ordem }),
    (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)
  );
  const indiceDaEtapa = new Map(etapas.map((e, i) => [e.item.id, i]));
  const etapa = (id) => id != null ? indiceDaEtapa.get(id) : void 0;
  const walls = ordenar(
    model.walls,
    (w) => ({
      level: nivel(w.levelId),
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
      alinhamento: w.alinhamento && w.alinhamento !== "EIXO" ? w.alinhamento : void 0,
      // Mesma disciplina: emitida SÓ quando `true`. É conteúdo — decide quanto
      // de alvenaria o orçamento compra —, então entra no hash; mas `false` e
      // ausente significam o mesmo, e emitir `false` mudaria a forma canônica
      // de todo desenho que nunca teve um pilar embutido.
      cedeSobreposicao: w.cedeSobreposicao ? true : void 0,
      // FASE DE REFORMA (0.46.0): só quando EXISTENTE ou DEMOLIR — NOVO é o padrão e a ausência.
      fase: w.fase && w.fase !== "NOVO" ? w.fase : void 0,
      // ETAPAS (0.57.0): índices em `etapas`, só quando declarados.
      etapa: etapa(w.etapaId),
      demolidaEm: etapa(w.demolidaEmEtapaId),
      // PAREDE CURVA (0.48.0): o círculo da faceta, só quando existe — parede
      // reta não ganha chave. É conteúdo (o canvas desenha o arco e o painel o
      // reconhece), então entra no hash.
      arco: w.arco ? { centro: { x: w.arco.centro.x, y: w.arco.centro.y }, raioMm: w.arco.raioMm } : void 0,
      // CORTINA DE VIDRO e BRISE (0.54.0): só quando existem.
      cortina: w.cortina ? { moduloMm: w.cortina.moduloMm, montanteMm: w.cortina.montanteMm, painel: w.cortina.painel } : void 0,
      brise: w.brise ? { orientacao: w.brise.orientacao, laminaMm: w.brise.laminaMm, passoMm: w.brise.passoMm, afastamentoMm: w.brise.afastamentoMm, lado: w.brise.lado } : void 0,
      parametros: parametrosCanonicos(w.parametros),
      // A COMPOSIÇÃO. Mesma disciplina das três chaves acima: emitida só quando
      // existe, para não acrescentar `camadas` a toda parede homogênea do
      // acervo e mudar a forma canônica de desenhos que não têm composição
      // nenhuma. Ausente = homogênea, que é o que todos eles significavam.
      //
      // Os campos são reescritos um a um, e não por `{ ...c }`, pela razão de
      // sempre no canônico: um spread carregaria para o payload qualquer campo
      // que alguém acrescente ao objeto em memória, e o hash mudaria por um dado
      // que ninguém decidiu persistir.
      //
      // `descricao` ENTRA, apesar de ser cache de rótulo: ela é o que o usuário
      // lê ao reabrir um estudo antigo, e o payload é o único lugar onde ela
      // sobrevive — o kernel não consulta catálogo. O preço é conhecido e
      // aceito: recadastrar o item com outra grafia muda o hash sem a geometria
      // ter mudado. É por isso que ela fica FORA de `assinaturaDasCamadas`, que
      // é quem responde "é a mesma composição?" para unir parede e para o diff.
      camadas: w.camadas?.length ? w.camadas.map((c) => ({
        espessuraMm: c.espessuraMm,
        itemCode: c.itemCode,
        descricao: c.descricao,
        funcao: c.funcao
      })) : void 0
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.a.x - y.a.x || x.a.y - y.a.y || x.b.x - y.b.x || x.b.y - y.b.y || x.thicknessMm - y.thicknessMm || // Desempate pela COMPOSIÇÃO (0.11.0). Sem ele, duas paredes com a mesma
    // geometria e a mesma espessura total mas camadas diferentes (25+140+25
    // contra 190 de concreto) ficavam em ordem indefinida — a do array vinha
    // da ordem de criação —, e o payload saía diferente a cada sessão. O hash
    // mudaria sem a geometria ter mudado, que é exatamente o que a ordenação
    // canônica existe para impedir. (Hoje `ordenar` fecha o resto por
    // serialização, mas este critério continua explícito porque é o que o
    // leitor procura primeiro.)
    assinaturaDasCamadas(x.camadas).localeCompare(assinaturaDasCamadas(y.camadas))
  );
  const wallIndex = new Map(walls.map((w, i) => [w.item.id, i]));
  const parede = (wallId) => wallIndex.get(wallId) ?? 0;
  const openings = ordenar(
    model.openings,
    (o) => ({
      wall: parede(o.wallId),
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
      embutida: o.kind === "sliding" ? o.embutida : void 0,
      fase: o.fase && o.fase !== "NOVO" ? o.fase : void 0,
      etapa: etapa(o.etapaId),
      demolidaEm: etapa(o.demolidaEmEtapaId),
      // O TIPO, só quando declarado — a disciplina de `camadas`: emitir sempre
      // acrescentaria a chave a toda abertura do acervo. Campos reescritos um
      // a um, e `descricao` ENTRA pela razão escrita nas camadas: é o que o
      // usuário lê ao reabrir, e o payload é o único lugar onde ela sobrevive.
      esquadria: o.esquadria ? { nome: o.esquadria.nome, itemCode: o.esquadria.itemCode, descricao: o.esquadria.descricao } : void 0,
      parametros: parametrosCanonicos(o.parametros)
    }),
    (x, y) => parede(x.wallId) - parede(y.wallId) || x.offsetMm - y.offsetMm
  );
  const boundaries = ordenar(
    model.boundaries,
    (b) => ({
      level: nivel(b.levelId),
      kind: b.kind,
      papel: b.papel ?? null,
      // A escritura é ATRIBUTO, não critério de ordem: a ordenação continua por
      // nível e coordenada. Ordenar por confrontante faria dois desenhos
      // idênticos com o mesmo lote produzirem payloads diferentes porque alguém
      // digitou o nome da rua com outra grafia.
      medidaEscrituraMm: b.medidaEscrituraMm ?? null,
      confrontante: b.confrontante ?? null,
      // Restrição (0.41.0): só na RESTRICAO; ausente nas demais — a chave some.
      restricao: b.restricao ? { tipo: b.restricao.tipo, faixaMm: b.restricao.faixaMm } : void 0,
      a: { x: b.a.x, y: b.a.y },
      b: { x: b.b.x, y: b.b.y }
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.a.x - y.a.x || x.a.y - y.a.y || x.b.x - y.b.x || x.b.y - y.b.y
  );
  const structures = ordenar(
    model.structures ?? [],
    (s2) => ({
      level: nivel(s2.levelId),
      kind: s2.kind,
      pontos: s2.pontos.map((p) => ({ x: p.x, y: p.y })),
      larguraMm: s2.larguraMm,
      profundidadeMm: s2.profundidadeMm,
      alturaMm: s2.alturaMm,
      baseMm: s2.baseMm,
      circular: s2.circular,
      rotacaoDeg: s2.rotacaoDeg,
      // `null` explícito, como em `boundaries.papel`: aqui a chave só existe
      // dentro de uma peça estrutural, que por definição é desenho novo — não
      // há acervo para proteger, e `null` deixa a ausência legível no payload
      // em vez de sumir.
      rotulo: s2.rotulo ?? null,
      // Ausente quando `false`, ao contrário do `rotulo` acima: aqui a ausência
      // já é o padrão de toda peça, e a chave só aparece na que recebeu a
      // decisão do usuário.
      cedeSobreposicao: s2.cedeSobreposicao ? true : void 0,
      fase: s2.fase && s2.fase !== "NOVO" ? s2.fase : void 0,
      etapa: etapa(s2.etapaId),
      demolidaEm: etapa(s2.demolidaEmEtapaId),
      parametros: parametrosCanonicos(s2.parametros),
      // Seção T: mesma regra da linha acima, e pela mesma razão. Toda peça do
      // acervo é de seção cheia, então a chave ausente mantém o payload —
      // e o hash — byte a byte como estava.
      secaoT: s2.secaoT ? { mesaAlturaMm: s2.secaoT.mesaAlturaMm, almaLarguraMm: s2.secaoT.almaLarguraMm } : void 0
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.pontos[0].x - y.pontos[0].x || x.pontos[0].y - y.pontos[0].y || cmpStr(x.kind, y.kind)
  );
  const roofs = ordenar(
    model.roofs ?? [],
    (r) => ({
      level: nivel(r.levelId),
      pontos: r.pontos.map((p) => ({ x: p.x, y: p.y })),
      beiralIndex: r.beiralIndex,
      inclinacaoPct: r.inclinacaoPct,
      baseMm: r.baseMm,
      espessuraMm: r.espessuraMm,
      // COBERTURA POR EXTRUSÃO (0.49.0): o eixo, só quando a água nasceu dele.
      extrusao: r.extrusao ? { a: { x: r.extrusao.a.x, y: r.extrusao.a.y }, b: { x: r.extrusao.b.x, y: r.extrusao.b.y } } : void 0,
      parametros: parametrosCanonicos(r.parametros)
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.pontos[0].x - y.pontos[0].x || x.pontos[0].y - y.pontos[0].y
  );
  const sections = ordenar(
    model.sections ?? [],
    (c) => ({
      a: { x: c.a.x, y: c.a.y },
      b: { x: c.b.x, y: c.b.y },
      olharPara: c.olharPara,
      rotulo: c.rotulo
    }),
    // Sem nível: o corte atravessa a edificação inteira. Ordena por posição,
    // como todo o resto.
    (x, y) => x.a.x - y.a.x || x.a.y - y.a.y || x.b.x - y.b.x || x.b.y - y.b.y
  );
  const eixos = ordenar(
    model.eixos ?? [],
    (e) => ({
      nome: e.nome,
      a: { x: e.a.x, y: e.a.y },
      b: { x: e.b.x, y: e.b.y }
    }),
    (x, y) => x.a.x - y.a.x || x.a.y - y.a.y || x.b.x - y.b.x || x.b.y - y.b.y
  );
  const indiceDaParede = new Map(walls.map((w, i) => [w.item.uid, i]));
  const indiceDaEstrutura = new Map(structures.map((s2, i) => [s2.item.uid, i]));
  const indiceDoEixo = new Map(eixos.map((e, i) => [e.item.uid, i]));
  const indiceDe = (familia, uid) => (familia === "wall" ? indiceDaParede : familia === "structural" ? indiceDaEstrutura : indiceDoEixo).get(uid ?? "") ?? -1;
  const restricoes = ordenar(
    (model.restricoes ?? []).filter(
      (r) => indiceDe(r.alvo.familia, r.alvo.uid) >= 0 && (!r.referencia || indiceDe(r.referencia.familia, r.referencia.uid) >= 0)
    ),
    (r) => ({
      tipo: r.tipo,
      alvo: { familia: r.alvo.familia, indice: indiceDe(r.alvo.familia, r.alvo.uid) },
      referencia: r.referencia ? { familia: r.referencia.familia, indice: indiceDe(r.referencia.familia, r.referencia.uid) } : void 0,
      valorMm: r.valorMm
    }),
    (x, y) => cmpStr(x.tipo, y.tipo) || cmpStr(x.alvo.familia, y.alvo.familia) || indiceDe(x.alvo.familia, x.alvo.uid) - indiceDe(y.alvo.familia, y.alvo.uid) || cmpStr(x.referencia?.familia ?? "", y.referencia?.familia ?? "") || (x.referencia ? indiceDe(x.referencia.familia, x.referencia.uid) : -1) - (y.referencia ? indiceDe(y.referencia.familia, y.referencia.uid) : -1) || (x.valorMm ?? -1) - (y.valorMm ?? -1)
  );
  const stairs = ordenar(
    model.stairs ?? [],
    (e) => ({
      level: nivel(e.levelId),
      tipo: e.tipo,
      pontos: e.pontos.map((p) => ({ x: p.x, y: p.y })),
      larguraMm: e.larguraMm,
      alvoEspelhoMm: e.alvoEspelhoMm,
      rotulo: e.rotulo ?? null,
      parametros: parametrosCanonicos(e.parametros),
      // Escada multiandares (0.39.0): chegada por índice; ausente = próximo acima.
      ate: e.ateLevelId && model.levels.some((l) => l.id === e.ateLevelId) ? nivel(e.ateLevelId) : void 0
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.pontos[0].x - y.pontos[0].x || x.pontos[0].y - y.pontos[0].y
  );
  const nucleos = ordenar(
    model.nucleos ?? [],
    (n4) => ({
      level: nivel(n4.levelId),
      ate: n4.ateLevelId && model.levels.some((l) => l.id === n4.ateLevelId) ? nivel(n4.ateLevelId) : void 0,
      tipo: n4.tipo,
      ring: n4.ring.map((p) => ({ x: p.x, y: p.y })),
      rotulo: n4.rotulo ?? null,
      disciplina: n4.disciplina ?? void 0,
      pocoMm: n4.pocoMm ?? void 0,
      casaDeMaquinasMm: n4.casaDeMaquinasMm ?? void 0,
      capacidade: n4.capacidade ?? void 0,
      parametros: parametrosCanonicos(n4.parametros)
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.ring[0].x - y.ring[0].x || x.ring[0].y - y.ring[0].y || cmpStr(x.tipo, y.tipo)
  );
  const vagas = ordenar(
    model.vagas ?? [],
    (v) => ({
      level: nivel(v.levelId),
      at: { x: v.at.x, y: v.at.y },
      larguraMm: v.larguraMm,
      comprimentoMm: v.comprimentoMm,
      rotacaoGraus: v.rotacaoGraus,
      tipo: v.tipo,
      numero: v.numero ?? null,
      sugerida: v.sugerida ? true : void 0,
      parametros: parametrosCanonicos(v.parametros)
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.at.x - y.at.x || x.at.y - y.at.y || cmpStr(x.tipo, y.tipo)
  );
  const componentes = ordenar(
    model.componentes ?? [],
    (c) => ({
      level: nivel(c.levelId),
      at: { x: c.at.x, y: c.at.y },
      larguraMm: c.larguraMm,
      profundidadeMm: c.profundidadeMm,
      alturaMm: c.alturaMm,
      rotacaoGraus: c.rotacaoGraus,
      cotaMm: c.cotaMm ? c.cotaMm : void 0,
      tipoId: c.tipoId,
      familia: c.familia,
      rotulo: c.rotulo ?? null,
      sugerido: c.sugerido ? true : void 0,
      fase: c.fase && c.fase !== "NOVO" ? c.fase : void 0,
      etapa: etapa(c.etapaId),
      demolidaEm: etapa(c.demolidaEmEtapaId),
      parametros: parametrosCanonicos(c.parametros)
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.at.x - y.at.x || x.at.y - y.at.y || cmpStr(x.tipoId, y.tipoId)
  );
  {
    const indiceDeComponente = new Map(componentes.map((c, i) => [c.item.uid, i]));
    for (const c of componentes) {
      const pai = c.item.paiUid !== void 0 ? indiceDeComponente.get(c.item.paiUid) : void 0;
      c.geom.pai = pai;
    }
  }
  const guardaCorpos = ordenar(
    model.guardaCorpos ?? [],
    (g) => ({
      level: nivel(g.levelId),
      pontos: g.pontos.map((p) => ({ x: p.x, y: p.y })),
      alturaMm: g.alturaMm,
      tipo: g.tipo,
      material: g.material,
      itemCode: g.itemCode,
      descricao: g.descricao,
      rotulo: g.rotulo ?? null,
      sugerido: g.sugerido ? true : void 0,
      parametros: parametrosCanonicos(g.parametros)
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.pontos[0].x - y.pontos[0].x || x.pontos[0].y - y.pontos[0].y || cmpStr(x.tipo, y.tipo)
  );
  const subRegioes = ordenar(
    model.subRegioes ?? [],
    (s2) => ({
      level: nivel(s2.levelId),
      material: s2.material,
      pontos: s2.pontos.map((p) => ({ x: p.x, y: p.y })),
      nome: s2.nome ?? null,
      parametros: parametrosCanonicos(s2.parametros)
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.pontos[0].x - y.pontos[0].x || x.pontos[0].y - y.pontos[0].y || cmpStr(x.material, y.material)
  );
  const vistasDependentes = ordenar(
    model.vistasDependentes ?? [],
    (v) => ({
      level: nivel(v.levelId),
      nome: v.nome,
      recorte: { minX: v.recorte.minX, minY: v.recorte.minY, maxX: v.recorte.maxX, maxY: v.recorte.maxY },
      denominador: v.denominador
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.recorte.minX - y.recorte.minX || x.recorte.minY - y.recorte.minY || cmpStr(x.nome, y.nome)
  );
  const indiceDoCorte = new Map(sections.map((c, i) => [c.item.id, i]));
  const anotacoes = ordenar(
    (model.anotacoes ?? []).filter((a) => a.vista.tipo !== "CORTE" || indiceDoCorte.has(a.vista.corteId)),
    (a) => ({
      vista: a.vista.tipo === "PLANTA" ? { tipo: "PLANTA", level: nivel(a.vista.levelId) } : a.vista.tipo === "CORTE" ? { tipo: "CORTE", corte: indiceDoCorte.get(a.vista.corteId) ?? -1 } : { tipo: "ELEVACAO", direcao: a.vista.direcao },
      pontos: a.pontos.map((p) => ({ x: p.x, y: p.y })),
      tipo: a.tipo,
      texto: a.texto ?? null,
      alturaMm: a.alturaMm,
      traco: a.traco,
      hachura: a.hachura ?? null,
      rotacaoGraus: a.rotacaoGraus,
      cor: a.cor ?? null,
      // NUVEM DE REVISÃO (0.50.0): só a nuvem tem; as demais não ganham chave.
      revisao: a.revisao ? { numero: a.revisao.numero, data: a.revisao.data } : void 0,
      parametros: parametrosCanonicos(a.parametros)
    }),
    (x, y) => {
      const kx = x.vista.tipo === "PLANTA" ? `0:${String(nivel(x.vista.levelId)).padStart(4, "0")}` : x.vista.tipo === "CORTE" ? `1:${String(indiceDoCorte.get(x.vista.corteId) ?? 0).padStart(4, "0")}` : `2:${x.vista.direcao}`;
      const ky = y.vista.tipo === "PLANTA" ? `0:${String(nivel(y.vista.levelId)).padStart(4, "0")}` : y.vista.tipo === "CORTE" ? `1:${String(indiceDoCorte.get(y.vista.corteId) ?? 0).padStart(4, "0")}` : `2:${y.vista.direcao}`;
      return cmpStr(kx, ky) || x.pontos[0].x - y.pontos[0].x || x.pontos[0].y - y.pontos[0].y || cmpStr(x.tipo, y.tipo) || cmpStr(x.texto ?? "", y.texto ?? "");
    }
  );
  const quadros = ordenar(
    model.quadros ?? [],
    (q) => ({
      level: nivel(q.levelId),
      nome: q.nome,
      at: { x: q.at.x, y: q.at.y },
      cotaMm: q.cotaMm,
      // ⚠️ `undefined` quando não declarado, e não o PADRÃO: gravar 400 aqui
      // mudaria a forma canônica — e o hash — de todo desenho anterior às
      // medidas, e o acervo inteiro apareceria como alterado sem que ninguém
      // tivesse mexido nele. É a mesma decisão do `circuito` no terminal.
      larguraMm: q.larguraMm ?? void 0,
      alturaMm: q.alturaMm ?? void 0,
      profundidadeMm: q.profundidadeMm ?? void 0,
      rotacaoGraus: q.rotacaoGraus ?? void 0,
      // A alimentação (13/09/2026): omitida quando não declarada.
      ligacao: q.ligacao ?? void 0,
      tensaoV: q.tensaoV ?? void 0,
      alimentadorM: q.alimentadorM ?? void 0,
      parametros: parametrosCanonicos(q.parametros)
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.at.x - y.at.x || x.at.y - y.at.y
  );
  const indiceDoQuadro = new Map(quadros.map((q, i) => [q.item.id, i]));
  const circuitos = ordenar(
    model.circuitos ?? [],
    (c) => ({
      quadro: indiceDoQuadro.get(c.quadroId) ?? 0,
      nome: c.nome,
      tipo: c.tipo ?? null,
      tensaoV: c.tensaoV ?? null,
      disjuntorA: c.disjuntorA ?? null,
      secaoMm2: c.secaoMm2 ?? null,
      // Os três são omitidos quando ausentes — todo circuito anterior a
      // 13/09/2026 está assim, e o hash dele não muda por isto.
      ligacao: c.ligacao ?? void 0,
      protecaoDR: c.protecaoDR ?? void 0,
      fase: c.fase ?? void 0
    }),
    (x, y) => (indiceDoQuadro.get(x.quadroId) ?? 0) - (indiceDoQuadro.get(y.quadroId) ?? 0) || cmpStr(x.nome, y.nome)
  );
  const indiceDoCircuito = new Map(circuitos.map((c, i) => [c.item.id, i]));
  const trechos = ordenar(
    model.trechos ?? [],
    (t) => ({
      level: nivel(t.levelId),
      disciplina: t.disciplina,
      a: { x: t.a.x, y: t.a.y },
      b: { x: t.b.x, y: t.b.y },
      cotaAMm: t.cotaAMm,
      cotaBMm: t.cotaBMm,
      bitolaMm: t.bitolaMm,
      itemCode: t.itemCode ?? null,
      rotulo: t.rotulo ?? null,
      // ⚠️ `undefined` quando não há: emitir a chave em todo trecho mudaria a
      // forma canônica — e o hash — dos desenhos anteriores. Vários circuitos
      // (0.31): índices em ordem crescente, sem repetição.
      circuitos: t.circuitoIds && t.circuitoIds.length > 0 ? [...new Set(t.circuitoIds.map((cid) => indiceDoCircuito.get(cid) ?? 0))].sort((p, q) => p - q) : void 0,
      condutores: t.condutores ?? void 0,
      // `true` ou AUSENTE — nunca `false`, pela razão do `sugerida` do terminal.
      sugerido: t.sugerido ? true : void 0,
      parametros: parametrosCanonicos(t.parametros)
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.a.x - y.a.x || x.a.y - y.a.y || x.cotaAMm - y.cotaAMm
  );
  const terminais = ordenar(
    model.terminais ?? [],
    (t) => ({
      level: nivel(t.levelId),
      disciplina: t.disciplina,
      tipo: t.tipo,
      at: { x: t.at.x, y: t.at.y },
      cotaMm: t.cotaMm,
      itemCode: t.itemCode ?? null,
      rotulo: t.rotulo ?? null,
      // ⚠️ `undefined` quando não há, e não `null`: o `stableStringify` filtra
      // `undefined`, então a CHAVE SOME. Emitir `null` em todo terminal mudaria
      // a forma canônica dos desenhos que nunca souberam o que é circuito — e o
      // hash deles junto. É a mesma decisão de `alinhamento` na parede.
      circuito: t.circuitoId != null ? indiceDoCircuito.get(t.circuitoId) ?? 0 : void 0,
      potenciaW: t.potenciaW ?? void 0,
      tipoEletrico: t.tipoEletrico ?? void 0,
      comando: t.comando ?? void 0,
      // ⚠️ `true` ou AUSENTE — nunca `false`. "Não sugerida" é o estado de todo
      // ponto anterior a 10/09/2026, e emitir `false` neles mudaria o hash do
      // acervo inteiro.
      sugerida: t.sugerida ? true : void 0,
      interruptor: t.interruptor ?? void 0,
      tipoHidraulico: t.tipoHidraulico ?? void 0,
      volumeL: t.volumeL ?? void 0,
      larguraMm: t.larguraMm ?? void 0,
      alturaMm: t.alturaMm ?? void 0,
      profundidadeMm: t.profundidadeMm ?? void 0,
      rotacaoGraus: t.rotacaoGraus ?? void 0,
      parametros: parametrosCanonicos(t.parametros)
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.at.x - y.at.x || x.at.y - y.at.y || x.cotaMm - y.cotaMm
  );
  const labels = ordenar(
    model.labels ?? [],
    (l) => ({
      level: nivel(l.levelId),
      at: { x: l.at.x, y: l.at.y },
      name: l.name,
      // `undefined` quando ausente: a chave some, e o hash dos desenhos que
      // nunca souberam de tipo de ambiente não muda.
      tipoDeAmbiente: l.tipoDeAmbiente ?? void 0,
      // DEPARTAMENTO (0.56.0, P2.22): só quando declarado.
      departamento: l.departamento ?? void 0,
      // ACABAMENTOS (0.43.0): só quando declarados, campo a campo na ordem
      // fixa — o `stableStringify` ordena chaves, mas a forma tem de ser a
      // mesma na ida e na volta.
      acabamentos: l.acabamentos ? {
        piso: l.acabamentos.piso?.map((c) => ({ espessuraMm: c.espessuraMm, itemCode: c.itemCode, descricao: c.descricao, funcao: c.funcao })),
        forro: l.acabamentos.forro ? { camadas: l.acabamentos.forro.camadas.map((c) => ({ espessuraMm: c.espessuraMm, itemCode: c.itemCode, descricao: c.descricao, funcao: c.funcao })), rebaixoMm: l.acabamentos.forro.rebaixoMm } : void 0,
        rodape: l.acabamentos.rodape === void 0 ? void 0 : l.acabamentos.rodape === null ? null : { alturaMm: l.acabamentos.rodape.alturaMm, itemCode: l.acabamentos.rodape.itemCode, descricao: l.acabamentos.rodape.descricao }
      } : void 0
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.at.x - y.at.x || x.at.y - y.at.y || cmpStr(x.name, y.name)
  );
  const spaces = ordenar(
    model.spaces.map((s2) => ({ ...s2, uid: s2.labelUid })),
    (s2) => ({
      level: nivel(s2.levelId),
      ring: s2.ring.map((p) => ({ x: p.x, y: p.y })),
      holes: s2.holes.map((h) => h.map((p) => ({ x: p.x, y: p.y }))),
      areaMm2: s2.areaMm2,
      perimeterMm: s2.perimeterMm
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.areaMm2 - y.areaMm2 || x.ring[0].x - y.ring[0].x || x.ring[0].y - y.ring[0].y
  );
  const indiceDaEtiquetaR = new Map(labels.map((l, i) => [l.item.uid, i]));
  const rodapes = ordenar(
    model.rodapes ?? [],
    (r) => ({
      level: nivel(r.levelId),
      pontos: r.pontos.map((p) => ({ x: p.x, y: p.y })),
      alturaMm: r.alturaMm,
      itemCode: r.itemCode,
      descricao: r.descricao,
      sugerido: r.sugerido ? true : void 0,
      etiqueta: r.spaceUid ? indiceDaEtiquetaR.get(r.spaceUid) : void 0,
      parametros: parametrosCanonicos(r.parametros)
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.pontos[0].x - y.pontos[0].x || x.pontos[0].y - y.pontos[0].y || cmpStr(x.itemCode, y.itemCode)
  );
  const indiceDaEtiqueta = new Map(labels.map((l, i) => [l.item.uid, i]));
  const unidades = ordenar(
    model.unidades ?? [],
    (u) => ({
      numero: u.numero,
      tipologia: u.tipologia ?? void 0,
      pcd: u.pcd,
      etiquetas: u.etiquetaUids.map((uid) => indiceDaEtiqueta.get(uid)).filter((i) => i !== void 0).sort((x, y) => x - y)
    }),
    (x, y) => cmpStr(x.numero, y.numero)
  );
  const indiceDeParede = new Map(walls.map((w, i) => [w.item.uid, i]));
  const indiceDeEstruturaG = new Map(structures.map((s2, i) => [s2.item.uid, i]));
  const indiceDeEtiquetaG = new Map(labels.map((l, i) => [l.item.uid, i]));
  const indices = (uids, m) => uids.map((u) => m.get(u)).filter((i) => i !== void 0).sort((x, y) => x - y);
  const grupos = ordenar(
    (model.grupos ?? []).filter((g) => model.levels.some((l) => l.id === g.levelId)),
    (g) => ({
      nome: g.nome,
      level: nivel(g.levelId),
      pivo: { x: g.pivo.x, y: g.pivo.y },
      origem: { walls: indices(g.origem.walls, indiceDeParede), structures: indices(g.origem.structures, indiceDeEstruturaG), labels: indices(g.origem.labels, indiceDeEtiquetaG) },
      instancias: [...g.instancias].filter((i) => model.levels.some((l) => l.id === i.levelId)).sort((x, y) => nivel(x.levelId) - nivel(y.levelId) || x.translacao.x - y.translacao.x || x.translacao.y - y.translacao.y || x.rotacaoGraus - y.rotacaoGraus || cmpStr(x.espelho, y.espelho)).map((i) => ({ level: nivel(i.levelId), translacao: { x: i.translacao.x, y: i.translacao.y }, rotacaoGraus: i.rotacaoGraus, espelho: i.espelho }))
    }),
    (x, y) => nivel(x.levelId) - nivel(y.levelId) || x.pivo.x - y.pivo.x || x.pivo.y - y.pivo.y || cmpStr(x.nome, y.nome)
  );
  const instanciasOrdenadas = grupos.flatMap(
    (g) => [...g.item.instancias].filter((i) => model.levels.some((l) => l.id === i.levelId)).sort((x, y) => nivel(x.levelId) - nivel(y.levelId) || x.translacao.x - y.translacao.x || x.translacao.y - y.translacao.y || x.rotacaoGraus - y.rotacaoGraus || cmpStr(x.espelho, y.espelho))
  );
  const geometria = {
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
    areaEscrituraMm2: model.areaEscrituraMm2 ?? void 0,
    // Mesma regra, pela mesma razão: sem coordenada informada, o payload de
    // TODO desenho do acervo continua exatamente o que era. E os campos de
    // dentro seguem a regra também — `elevacaoM` ausente não vira `null`, senão
    // dois desenhos iguais teriam formas canônicas diferentes conforme por qual
    // caminho a georreferência foi gravada.
    georreferencia: model.georreferencia ? {
      latitude: model.georreferencia.latitude,
      longitude: model.georreferencia.longitude,
      ...model.georreferencia.elevacaoM === null || model.georreferencia.elevacaoM === void 0 ? {} : { elevacaoM: model.georreferencia.elevacaoM },
      ...model.georreferencia.rotacaoNorteDeg === null || model.georreferencia.rotacaoNorteDeg === void 0 ? {} : { rotacaoNorteDeg: model.georreferencia.rotacaoNorteDeg },
      ...model.georreferencia.projetada ? {
        projetada: {
          lesteM: model.georreferencia.projetada.lesteM,
          norteM: model.georreferencia.projetada.norteM,
          crs: model.georreferencia.projetada.crs
        }
      } : {}
    } : void 0,
    levels: levels.map((l) => l.geom),
    etapas: etapas.length ? etapas.map((e) => e.geom) : void 0,
    walls: walls.map((w) => w.geom),
    openings: openings.map((o) => o.geom),
    boundaries: boundaries.map((b) => b.geom),
    structures: structures.length ? structures.map((s2) => s2.geom) : void 0,
    roofs: roofs.length ? roofs.map((r) => r.geom) : void 0,
    sections: sections.length ? sections.map((c) => c.geom) : void 0,
    eixos: eixos.length ? eixos.map((e) => e.geom) : void 0,
    restricoes: restricoes.length ? restricoes.map((r) => r.geom) : void 0,
    stairs: stairs.length ? stairs.map((e) => e.geom) : void 0,
    nucleos: nucleos.length ? nucleos.map((n4) => n4.geom) : void 0,
    vagas: vagas.length ? vagas.map((v) => v.geom) : void 0,
    componentes: componentes.length ? componentes.map((c) => c.geom) : void 0,
    guardaCorpos: guardaCorpos.length ? guardaCorpos.map((g) => g.geom) : void 0,
    anotacoes: anotacoes.length ? anotacoes.map((a) => a.geom) : void 0,
    vistasDependentes: vistasDependentes.length ? vistasDependentes.map((v) => v.geom) : void 0,
    subRegioes: subRegioes.length ? subRegioes.map((s2) => s2.geom) : void 0,
    rodapes: rodapes.length ? rodapes.map((r) => r.geom) : void 0,
    trechos: trechos.length ? trechos.map((t) => t.geom) : void 0,
    terminais: terminais.length ? terminais.map((t) => t.geom) : void 0,
    quadros: quadros.length ? quadros.map((q) => q.geom) : void 0,
    circuitos: circuitos.length ? circuitos.map((c) => c.geom) : void 0,
    labels: labels.map((l) => l.geom),
    unidades: unidades.length ? unidades.map((u) => u.geom) : void 0,
    grupos: grupos.length ? grupos.map((g) => g.geom) : void 0,
    spaces: spaces.map((s2) => s2.geom)
  };
  const identidade = {
    v: 1,
    levels: levels.map((l) => l.item.uid ?? null),
    etapas: etapas.map((e) => e.item.uid ?? null),
    walls: walls.map((w) => w.item.uid ?? null),
    openings: openings.map((o) => o.item.uid ?? null),
    boundaries: boundaries.map((b) => b.item.uid ?? null),
    structures: structures.map((s2) => s2.item.uid ?? null),
    roofs: roofs.map((r) => r.item.uid ?? null),
    sections: sections.map((c) => c.item.uid ?? null),
    eixos: eixos.map((e) => e.item.uid ?? null),
    restricoes: restricoes.map((r) => r.item.uid ?? null),
    stairs: stairs.map((e) => e.item.uid ?? null),
    nucleos: nucleos.map((n4) => n4.item.uid ?? null),
    vagas: vagas.map((v) => v.item.uid ?? null),
    componentes: componentes.map((c) => c.item.uid ?? null),
    guardaCorpos: guardaCorpos.map((g) => g.item.uid ?? null),
    anotacoes: anotacoes.map((a) => a.item.uid ?? null),
    vistasDependentes: vistasDependentes.map((v) => v.item.uid ?? null),
    subRegioes: subRegioes.map((s2) => s2.item.uid ?? null),
    rodapes: rodapes.map((r) => r.item.uid ?? null),
    trechos: trechos.map((t) => t.item.uid ?? null),
    terminais: terminais.map((t) => t.item.uid ?? null),
    quadros: quadros.map((q) => q.item.uid ?? null),
    circuitos: circuitos.map((c) => c.item.uid ?? null),
    labels: labels.map((l) => l.item.uid ?? null),
    unidades: unidades.map((u) => u.item.uid ?? null),
    grupos: grupos.map((g) => g.item.uid ?? null),
    instanciasDeGrupo: instanciasOrdenadas.map((i) => i.uid ?? null),
    spaces: spaces.map((s2) => s2.item.uid ?? null)
  };
  return { geometria, identidade };
}
function payloadDoHash(model) {
  return stableStringify(projetar(model).geometria);
}
function snapshotHash(model) {
  return sha256(payloadDoHash(model));
}
function hashDePayload(payload) {
  const { identity: _ignorada, ...geometria } = payload;
  return sha256(stableStringify(geometria));
}
function parseCanonicalPayload(json) {
  return JSON.parse(json);
}
function modelFromCanonicalPayload(payload) {
  const model = emptyModel();
  model.areaEscrituraMm2 = payload.areaEscrituraMm2 ?? null;
  model.georreferencia = payload.georreferencia ? {
    latitude: payload.georreferencia.latitude,
    longitude: payload.georreferencia.longitude,
    elevacaoM: payload.georreferencia.elevacaoM ?? null,
    rotacaoNorteDeg: payload.georreferencia.rotacaoNorteDeg ?? null,
    projetada: payload.georreferencia.projetada ? { ...payload.georreferencia.projetada } : null
  } : null;
  let hashGeom = null;
  const uidDe = (familia, i, esperados) => {
    const lista = payload.identity?.[familia];
    const u = Array.isArray(lista) && lista.length === esperados ? lista[i] : null;
    if (typeof u === "string" && u) return u;
    hashGeom ??= hashDePayload(payload);
    return uidDeterministico(`${hashGeom}:${familia}:${i}`);
  };
  const levelIds = payload.levels.map((l, i) => {
    const id = nextId(model, "lvl");
    model.levels.push({
      id,
      uid: uidDe("levels", i, payload.levels.length),
      name: l.name,
      elevationMm: l.elevationMm,
      defaultHeightMm: l.defaultHeightMm
    });
    return id;
  });
  const etapasLidas = payload.etapas ?? [];
  const etapaIds = etapasLidas.map((e, i) => {
    const id = nextId(model, "etp");
    model.etapas.push({ id, uid: uidDe("etapas", i, etapasLidas.length), nome: e.nome, ordem: e.ordem });
    return id;
  });
  const refDeEtapa = (idx) => idx !== void 0 && etapaIds[idx] ? { etapaId: etapaIds[idx] } : {};
  const refDeDemolicao = (idx) => idx !== void 0 && etapaIds[idx] ? { demolidaEmEtapaId: etapaIds[idx] } : {};
  payload.levels.forEach((l, i) => {
    if (l.tipoDe !== void 0 && levelIds[l.tipoDe] && l.tipoDe !== i) model.levels[i].tipoDeId = levelIds[l.tipoDe];
  });
  const wallIds = payload.walls.map((w, i) => {
    const id = nextId(model, "wal");
    model.walls.push({
      id,
      uid: uidDe("walls", i, payload.walls.length),
      levelId: levelIds[w.level],
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      thicknessMm: w.thicknessMm,
      heightMm: w.heightMm,
      // Ausente = `'EIXO'`, e `'EIXO'` não volta ao modelo como campo: assim o
      // modelo relido de um payload antigo é IDÊNTICO ao que o gravou, e o
      // round-trip continua fechando byte a byte.
      ...w.alinhamento && w.alinhamento !== "EIXO" ? { alinhamento: w.alinhamento } : {},
      // Mesma regra do alinhamento: ausente não volta como `false`, volta como
      // nada — é o que mantém o round-trip fechando byte a byte.
      ...w.cedeSobreposicao ? { cedeSobreposicao: true } : {},
      ...w.fase ? { fase: w.fase } : {},
      ...refDeEtapa(w.etapa),
      ...refDeDemolicao(w.demolidaEm),
      ...w.arco ? { arco: { centro: { x: w.arco.centro.x, y: w.arco.centro.y }, raioMm: w.arco.raioMm } } : {},
      ...w.cortina ? { cortina: { moduloMm: w.cortina.moduloMm, montanteMm: w.cortina.montanteMm, painel: w.cortina.painel } } : {},
      ...w.brise ? { brise: { orientacao: w.brise.orientacao, laminaMm: w.brise.laminaMm, passoMm: w.brise.passoMm, afastamentoMm: w.brise.afastamentoMm, lado: w.brise.lado } } : {},
      ...w.parametros && Object.keys(w.parametros).length > 0 ? { parametros: { ...w.parametros } } : {},
      // Idem: ausente (e `[]`, que payload nenhum deveria ter) não volta como
      // lista vazia, volta como nada — parede homogênea, que é o que um payload
      // de antes de 0.11.0 significa.
      ...w.camadas?.length ? {
        camadas: w.camadas.map((c) => ({
          espessuraMm: c.espessuraMm,
          itemCode: c.itemCode,
          descricao: c.descricao,
          funcao: c.funcao
        }))
      } : {}
    });
    return id;
  });
  payload.openings.forEach((o, i) => {
    model.openings.push({
      id: nextId(model, "opn"),
      uid: uidDe("openings", i, payload.openings.length),
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
      ...o.fase ? { fase: o.fase } : {},
      ...refDeEtapa(o.etapa),
      ...refDeDemolicao(o.demolidaEm),
      ...o.esquadria ? { esquadria: { nome: o.esquadria.nome, itemCode: o.esquadria.itemCode, descricao: o.esquadria.descricao } } : {},
      ...o.parametros && Object.keys(o.parametros).length > 0 ? { parametros: { ...o.parametros } } : {}
    });
  });
  payload.boundaries.forEach((b, i) => {
    model.boundaries.push({
      id: nextId(model, "bnd"),
      uid: uidDe("boundaries", i, payload.boundaries.length),
      levelId: levelIds[b.level],
      a: { x: b.a.x, y: b.a.y },
      b: { x: b.b.x, y: b.b.y },
      // Payload de antes do terreno existir não tem `kind`. `DIVISA` é o que
      // aquele desenho significava: um limite solto, que divide ambiente e não
      // participa de anel de lote nenhum. Ler como TERRENO inventaria um lote
      // que ninguém desenhou, com área e recuos saindo do nada.
      kind: b.kind ?? "DIVISA",
      papel: b.papel ?? null,
      // Payload de antes da escritura existir não tem os campos. `null` é
      // "ninguém informou" — e é o que impede o quadro de acusar divergência
      // contra uma medida que nunca foi digitada.
      medidaEscrituraMm: b.medidaEscrituraMm ?? null,
      confrontante: b.confrontante ?? null,
      ...b.restricao ? { restricao: { tipo: b.restricao.tipo, faixaMm: b.restricao.faixaMm } } : {}
    });
  });
  const structures = payload.structures ?? [];
  structures.forEach((s2, i) => {
    model.structures.push({
      id: nextId(model, "str"),
      uid: uidDe("structures", i, structures.length),
      levelId: levelIds[s2.level],
      kind: s2.kind,
      pontos: s2.pontos.map((p) => ({ x: p.x, y: p.y })),
      larguraMm: s2.larguraMm,
      profundidadeMm: s2.profundidadeMm,
      alturaMm: s2.alturaMm,
      baseMm: s2.baseMm,
      circular: s2.circular,
      rotacaoDeg: s2.rotacaoDeg,
      rotulo: s2.rotulo ?? null,
      ...s2.cedeSobreposicao ? { cedeSobreposicao: true } : {},
      ...s2.fase ? { fase: s2.fase } : {},
      ...refDeEtapa(s2.etapa),
      ...refDeDemolicao(s2.demolidaEm),
      ...s2.parametros && Object.keys(s2.parametros).length > 0 ? { parametros: { ...s2.parametros } } : {},
      ...s2.secaoT ? { secaoT: s2.secaoT } : {}
    });
  });
  const roofs = payload.roofs ?? [];
  roofs.forEach((r, i) => {
    model.roofs.push({
      id: nextId(model, "agu"),
      uid: uidDe("roofs", i, roofs.length),
      levelId: levelIds[r.level],
      pontos: r.pontos.map((p) => ({ x: p.x, y: p.y })),
      beiralIndex: r.beiralIndex,
      inclinacaoPct: r.inclinacaoPct,
      baseMm: r.baseMm,
      espessuraMm: r.espessuraMm,
      ...r.extrusao ? { extrusao: { a: { x: r.extrusao.a.x, y: r.extrusao.a.y }, b: { x: r.extrusao.b.x, y: r.extrusao.b.y } } } : {},
      ...r.parametros && Object.keys(r.parametros).length > 0 ? { parametros: { ...r.parametros } } : {}
    });
  });
  const sections = payload.sections ?? [];
  sections.forEach((c, i) => {
    model.sections.push({
      id: nextId(model, "cor"),
      uid: uidDe("sections", i, sections.length),
      a: { x: c.a.x, y: c.a.y },
      b: { x: c.b.x, y: c.b.y },
      olharPara: c.olharPara,
      rotulo: c.rotulo
    });
  });
  const eixos = payload.eixos ?? [];
  eixos.forEach((e, i) => {
    model.eixos.push({
      id: nextId(model, "eix"),
      uid: uidDe("eixos", i, eixos.length),
      nome: e.nome,
      a: { x: e.a.x, y: e.a.y },
      b: { x: e.b.x, y: e.b.y }
    });
  });
  const restricoesLidas = payload.restricoes ?? [];
  const uidPorIndice = (familia, i) => (familia === "wall" ? model.walls[i] : familia === "structural" ? model.structures[i] : model.eixos[i])?.uid ?? null;
  restricoesLidas.forEach((r, i) => {
    const alvoUid = uidPorIndice(r.alvo.familia, r.alvo.indice);
    const refUid = r.referencia ? uidPorIndice(r.referencia.familia, r.referencia.indice) : null;
    if (!alvoUid || r.referencia && !refUid) return;
    model.restricoes.push({
      id: nextId(model, "rst"),
      uid: uidDe("restricoes", i, restricoesLidas.length),
      tipo: r.tipo,
      alvo: { familia: r.alvo.familia, uid: alvoUid },
      ...r.referencia && refUid ? { referencia: { familia: r.referencia.familia, uid: refUid } } : {},
      ...r.valorMm !== void 0 ? { valorMm: r.valorMm } : {}
    });
  });
  const stairs = payload.stairs ?? [];
  stairs.forEach((e, i) => {
    model.stairs.push({
      id: nextId(model, "esc"),
      uid: uidDe("stairs", i, stairs.length),
      levelId: levelIds[e.level],
      tipo: e.tipo,
      pontos: e.pontos.map((p) => ({ x: p.x, y: p.y })),
      larguraMm: e.larguraMm,
      alvoEspelhoMm: e.alvoEspelhoMm,
      rotulo: e.rotulo,
      ...e.parametros && Object.keys(e.parametros).length > 0 ? { parametros: { ...e.parametros } } : {},
      ...e.ate !== void 0 && levelIds[e.ate] ? { ateLevelId: levelIds[e.ate] } : {}
    });
  });
  const vagas = payload.vagas ?? [];
  vagas.forEach((v, i) => {
    model.vagas.push({
      id: nextId(model, "vag"),
      uid: uidDe("vagas", i, vagas.length),
      levelId: levelIds[v.level],
      at: { x: v.at.x, y: v.at.y },
      larguraMm: v.larguraMm,
      comprimentoMm: v.comprimentoMm,
      rotacaoGraus: v.rotacaoGraus,
      tipo: v.tipo,
      numero: v.numero,
      ...v.sugerida ? { sugerida: true } : {},
      ...v.parametros && Object.keys(v.parametros).length > 0 ? { parametros: { ...v.parametros } } : {}
    });
  });
  const componentes = payload.componentes ?? [];
  componentes.forEach((c, i) => {
    model.componentes.push({
      id: nextId(model, "cmp"),
      uid: uidDe("componentes", i, componentes.length),
      levelId: levelIds[c.level],
      at: { x: c.at.x, y: c.at.y },
      larguraMm: c.larguraMm,
      profundidadeMm: c.profundidadeMm,
      alturaMm: c.alturaMm,
      rotacaoGraus: c.rotacaoGraus,
      ...c.cotaMm ? { cotaMm: c.cotaMm } : {},
      tipoId: c.tipoId,
      familia: c.familia,
      rotulo: c.rotulo,
      ...c.sugerido ? { sugerido: true } : {},
      ...c.fase ? { fase: c.fase } : {},
      ...refDeEtapa(c.etapa),
      ...refDeDemolicao(c.demolidaEm),
      ...c.parametros && Object.keys(c.parametros).length > 0 ? { parametros: { ...c.parametros } } : {}
    });
  });
  componentes.forEach((c, i) => {
    if (c.pai === void 0 || c.pai === i) return;
    const pai = model.componentes[c.pai];
    if (pai) model.componentes[i].paiUid = pai.uid;
  });
  const guardaCorpos = payload.guardaCorpos ?? [];
  guardaCorpos.forEach((g, i) => {
    model.guardaCorpos.push({
      id: nextId(model, "grc"),
      uid: uidDe("guardaCorpos", i, guardaCorpos.length),
      levelId: levelIds[g.level],
      pontos: g.pontos.map((p) => ({ x: p.x, y: p.y })),
      alturaMm: g.alturaMm,
      tipo: g.tipo,
      material: g.material,
      itemCode: g.itemCode,
      descricao: g.descricao,
      rotulo: g.rotulo,
      ...g.sugerido ? { sugerido: true } : {},
      ...g.parametros && Object.keys(g.parametros).length > 0 ? { parametros: { ...g.parametros } } : {}
    });
  });
  const subRegioes = payload.subRegioes ?? [];
  subRegioes.forEach((s2, i) => {
    if (!levelIds[s2.level]) return;
    model.subRegioes.push({
      id: nextId(model, "sub"),
      uid: uidDe("subRegioes", i, subRegioes.length),
      levelId: levelIds[s2.level],
      material: s2.material,
      pontos: s2.pontos.map((p) => ({ x: p.x, y: p.y })),
      nome: s2.nome,
      ...s2.parametros && Object.keys(s2.parametros).length > 0 ? { parametros: { ...s2.parametros } } : {}
    });
  });
  const vistasDependentes = payload.vistasDependentes ?? [];
  vistasDependentes.forEach((v, i) => {
    if (!levelIds[v.level]) return;
    model.vistasDependentes.push({
      id: nextId(model, "vdp"),
      uid: uidDe("vistasDependentes", i, vistasDependentes.length),
      levelId: levelIds[v.level],
      nome: v.nome,
      recorte: { minX: v.recorte.minX, minY: v.recorte.minY, maxX: v.recorte.maxX, maxY: v.recorte.maxY },
      denominador: v.denominador
    });
  });
  const anotacoes = payload.anotacoes ?? [];
  anotacoes.forEach((a, i) => {
    let vista = null;
    if (a.vista.tipo === "PLANTA") vista = levelIds[a.vista.level] ? { tipo: "PLANTA", levelId: levelIds[a.vista.level] } : null;
    else if (a.vista.tipo === "CORTE") vista = model.sections[a.vista.corte] ? { tipo: "CORTE", corteId: model.sections[a.vista.corte].id } : null;
    else vista = { tipo: "ELEVACAO", direcao: a.vista.direcao };
    if (!vista) return;
    model.anotacoes.push({
      id: nextId(model, "ant"),
      uid: uidDe("anotacoes", i, anotacoes.length),
      vista,
      tipo: a.tipo,
      pontos: a.pontos.map((p) => ({ x: p.x, y: p.y })),
      texto: a.texto,
      alturaMm: a.alturaMm,
      traco: a.traco,
      hachura: a.hachura,
      rotacaoGraus: a.rotacaoGraus,
      cor: a.cor,
      ...a.revisao ? { revisao: { numero: a.revisao.numero, data: a.revisao.data } } : {},
      ...a.parametros && Object.keys(a.parametros).length > 0 ? { parametros: { ...a.parametros } } : {}
    });
  });
  const nucleos = payload.nucleos ?? [];
  nucleos.forEach((n4, i) => {
    model.nucleos.push({
      id: nextId(model, "nuc"),
      uid: uidDe("nucleos", i, nucleos.length),
      levelId: levelIds[n4.level],
      ...n4.ate !== void 0 && levelIds[n4.ate] ? { ateLevelId: levelIds[n4.ate] } : {},
      tipo: n4.tipo,
      ring: n4.ring.map((p) => ({ x: p.x, y: p.y })),
      rotulo: n4.rotulo,
      ...n4.disciplina ? { disciplina: n4.disciplina } : {},
      ...n4.pocoMm !== void 0 ? { pocoMm: n4.pocoMm } : {},
      ...n4.casaDeMaquinasMm !== void 0 ? { casaDeMaquinasMm: n4.casaDeMaquinasMm } : {},
      ...n4.capacidade !== void 0 ? { capacidade: n4.capacidade } : {},
      ...n4.parametros && Object.keys(n4.parametros).length > 0 ? { parametros: { ...n4.parametros } } : {}
    });
  });
  const quadros = payload.quadros ?? [];
  const idsDeQuadro = [];
  quadros.forEach((q, i) => {
    const id = nextId(model, "qdr");
    idsDeQuadro.push(id);
    model.quadros.push({
      id,
      uid: uidDe("quadros", i, quadros.length),
      levelId: levelIds[q.level],
      nome: q.nome,
      at: { x: q.at.x, y: q.at.y },
      cotaMm: q.cotaMm,
      // `?? null` na volta: ausente e nulo são a mesma coisa — "use o padrão".
      larguraMm: q.larguraMm ?? null,
      alturaMm: q.alturaMm ?? null,
      profundidadeMm: q.profundidadeMm ?? null,
      rotacaoGraus: q.rotacaoGraus ?? null,
      ligacao: q.ligacao ?? null,
      tensaoV: q.tensaoV ?? null,
      alimentadorM: q.alimentadorM ?? null,
      ...q.parametros && Object.keys(q.parametros).length > 0 ? { parametros: { ...q.parametros } } : {}
    });
  });
  const circuitos = payload.circuitos ?? [];
  const idsDeCircuito = [];
  circuitos.forEach((c, i) => {
    const id = nextId(model, "cir");
    idsDeCircuito.push(id);
    model.circuitos.push({
      id,
      uid: uidDe("circuitos", i, circuitos.length),
      quadroId: idsDeQuadro[c.quadro],
      nome: c.nome,
      tipo: c.tipo,
      tensaoV: c.tensaoV,
      disjuntorA: c.disjuntorA,
      secaoMm2: c.secaoMm2,
      ligacao: c.ligacao ?? null,
      protecaoDR: c.protecaoDR ?? null,
      fase: c.fase ?? null
    });
  });
  const trechos = payload.trechos ?? [];
  trechos.forEach((t, i) => {
    model.trechos.push({
      id: nextId(model, "trc"),
      uid: uidDe("trechos", i, trechos.length),
      levelId: levelIds[t.level],
      disciplina: t.disciplina,
      a: { x: t.a.x, y: t.a.y },
      b: { x: t.b.x, y: t.b.y },
      cotaAMm: t.cotaAMm,
      cotaBMm: t.cotaBMm,
      bitolaMm: t.bitolaMm,
      itemCode: t.itemCode,
      rotulo: t.rotulo,
      // `circuitos` (0.31) ou o `circuito` escalar antigo como lista de um.
      circuitoIds: t.circuitos && t.circuitos.length > 0 ? t.circuitos.map((k2) => idsDeCircuito[k2]) : t.circuito != null ? [idsDeCircuito[t.circuito]] : null,
      condutores: t.condutores ?? null,
      sugerido: t.sugerido ? true : null,
      ...t.parametros && Object.keys(t.parametros).length > 0 ? { parametros: { ...t.parametros } } : {}
    });
  });
  const terminais = payload.terminais ?? [];
  terminais.forEach((t, i) => {
    model.terminais.push({
      id: nextId(model, "trm"),
      uid: uidDe("terminais", i, terminais.length),
      levelId: levelIds[t.level],
      disciplina: t.disciplina,
      tipo: t.tipo,
      at: { x: t.at.x, y: t.at.y },
      cotaMm: t.cotaMm,
      itemCode: t.itemCode,
      rotulo: t.rotulo,
      // Ausente e `null` são a mesma coisa na volta — ver a projeção.
      circuitoId: t.circuito != null ? idsDeCircuito[t.circuito] : null,
      potenciaW: t.potenciaW ?? null,
      tipoEletrico: t.tipoEletrico ?? null,
      comando: t.comando ?? null,
      sugerida: t.sugerida ? true : null,
      interruptor: t.interruptor ?? null,
      tipoHidraulico: t.tipoHidraulico ?? null,
      volumeL: t.volumeL ?? null,
      larguraMm: t.larguraMm ?? null,
      alturaMm: t.alturaMm ?? null,
      profundidadeMm: t.profundidadeMm ?? null,
      rotacaoGraus: t.rotacaoGraus ?? null,
      ...t.parametros && Object.keys(t.parametros).length > 0 ? { parametros: { ...t.parametros } } : {}
    });
  });
  const labels = payload.labels ?? [];
  labels.forEach((l, i) => {
    model.labels.push({
      id: nextId(model, "lbl"),
      uid: uidDe("labels", i, labels.length),
      levelId: levelIds[l.level],
      at: { x: l.at.x, y: l.at.y },
      name: l.name,
      tipoDeAmbiente: l.tipoDeAmbiente ?? null,
      ...l.departamento ? { departamento: l.departamento } : {},
      ...l.acabamentos ? {
        acabamentos: {
          ...l.acabamentos.piso ? { piso: l.acabamentos.piso.map((c) => ({ espessuraMm: c.espessuraMm, itemCode: c.itemCode, descricao: c.descricao, funcao: c.funcao })) } : {},
          ...l.acabamentos.forro ? { forro: { camadas: l.acabamentos.forro.camadas.map((c) => ({ espessuraMm: c.espessuraMm, itemCode: c.itemCode, descricao: c.descricao, funcao: c.funcao })), rebaixoMm: l.acabamentos.forro.rebaixoMm } } : {},
          ...l.acabamentos.rodape !== void 0 ? { rodape: l.acabamentos.rodape === null ? null : { alturaMm: l.acabamentos.rodape.alturaMm, itemCode: l.acabamentos.rodape.itemCode, descricao: l.acabamentos.rodape.descricao } } : {}
        }
      } : {}
    });
  });
  const rodapes = payload.rodapes ?? [];
  rodapes.forEach((r, i) => {
    if (!levelIds[r.level]) return;
    const etiqueta = r.etiqueta !== void 0 ? model.labels[r.etiqueta] : void 0;
    model.rodapes.push({
      id: nextId(model, "rod"),
      uid: uidDe("rodapes", i, rodapes.length),
      levelId: levelIds[r.level],
      pontos: r.pontos.map((p) => ({ x: p.x, y: p.y })),
      alturaMm: r.alturaMm,
      itemCode: r.itemCode,
      descricao: r.descricao,
      ...r.sugerido ? { sugerido: true } : {},
      ...etiqueta ? { spaceUid: etiqueta.uid } : {},
      ...r.parametros && Object.keys(r.parametros).length > 0 ? { parametros: { ...r.parametros } } : {}
    });
  });
  const unidadesLidas = payload.unidades ?? [];
  unidadesLidas.forEach((u, i) => {
    model.unidades.push({
      id: nextId(model, "und"),
      uid: uidDe("unidades", i, unidadesLidas.length),
      numero: u.numero,
      tipologia: u.tipologia ?? null,
      pcd: u.pcd,
      etiquetaUids: u.etiquetas.map((k2) => model.labels[k2]?.uid).filter((x) => typeof x === "string")
    });
  });
  const gruposLidos = payload.grupos ?? [];
  let k = 0;
  const totalDeInstancias = gruposLidos.reduce((s2, g) => s2 + g.instancias.length, 0);
  gruposLidos.forEach((g, i) => {
    const uidsDe = (idx, lista) => idx.map((j) => lista[j]?.uid).filter((x) => typeof x === "string");
    model.grupos.push({
      id: nextId(model, "grp"),
      uid: uidDe("grupos", i, gruposLidos.length),
      nome: g.nome,
      levelId: levelIds[g.level],
      pivo: { x: g.pivo.x, y: g.pivo.y },
      origem: { walls: uidsDe(g.origem.walls, model.walls), structures: uidsDe(g.origem.structures, model.structures), labels: uidsDe(g.origem.labels, model.labels) },
      instancias: g.instancias.map((inst) => ({
        uid: uidDe("instanciasDeGrupo", k++, totalDeInstancias),
        levelId: levelIds[inst.level],
        translacao: { x: inst.translacao.x, y: inst.translacao.y },
        rotacaoGraus: inst.rotacaoGraus,
        espelho: inst.espelho
      }))
    });
  });
  return recomputeSpaces(model);
}

// utils/blueprintKernel/secaoT.ts
function secaoTValida(s2) {
  const t = s2.secaoT;
  if (!t) return null;
  if (!(t.mesaAlturaMm > 0) || !(t.almaLarguraMm > 0)) return null;
  if (t.mesaAlturaMm >= s2.alturaMm) return null;
  if (t.almaLarguraMm >= s2.larguraMm) return null;
  return t;
}
function areaDaSecaoT(larguraMm, alturaMm, t) {
  return larguraMm * t.mesaAlturaMm + t.almaLarguraMm * (alturaMm - t.mesaAlturaMm);
}
function perimetroDeFormaDaSecaoT(larguraMm, alturaMm, t) {
  const abas = larguraMm - t.almaLarguraMm;
  return 2 * t.mesaAlturaMm + // os dois lados da mesa
  abas + // as faces de baixo das abas
  2 * (alturaMm - t.mesaAlturaMm) + // os dois lados da alma
  t.almaLarguraMm;
}
function contornoDaSecaoT(larguraMm, alturaMm, t) {
  const meiaL = larguraMm / 2;
  const meiaA = t.almaLarguraMm / 2;
  const base = -alturaMm / 2;
  const topo = alturaMm / 2;
  const sobMesa = topo - t.mesaAlturaMm;
  return [
    { x: -meiaA, y: base },
    { x: meiaA, y: base },
    { x: meiaA, y: sobMesa },
    { x: meiaL, y: sobMesa },
    { x: meiaL, y: topo },
    { x: -meiaL, y: topo },
    { x: -meiaL, y: sobMesa },
    { x: -meiaA, y: sobMesa }
  ];
}

// utils/blueprintKernel/nucleo.ts
function furosDoNucleo(model) {
  const lajes = (model.structures ?? []).filter((s2) => s2.kind === "LAJE");
  if (lajes.length === 0) return [];
  const cotaDoNivel = (levelId) => model.levels.find((l) => l.id === levelId)?.elevationMm ?? null;
  const saida = [];
  for (const n4 of model.nucleos ?? []) {
    const pavimentos = pavimentosDoNucleo(model, n4);
    if (pavimentos.length === 0) continue;
    const partida = pavimentos[0].elevationMm;
    const topoDoUltimo = pavimentos[pavimentos.length - 1];
    const chegada = topoDoUltimo.elevationMm + topoDoUltimo.defaultHeightMm;
    for (const laje of lajes) {
      const base = cotaDoNivel(laje.levelId);
      if (base === null) continue;
      const cotaDaLaje = base + laje.baseMm;
      if (cotaDaLaje <= partida || cotaDaLaje > chegada) continue;
      const contorno = recorteComum(n4.ring, contornoEmPlanta(laje));
      if (contorno.length < 3) continue;
      const areaMm2 = Math.round(Math.abs(polygonArea(contorno)));
      if (areaMm2 <= 0) continue;
      saida.push({ nucleoId: n4.id, structuralId: laje.id, areaMm2, contorno });
    }
  }
  return saida;
}

// utils/blueprintKernel/conexoes.ts
var ROTULO_DA_CONEXAO = {
  JOELHO_90: "Joelho 90\xB0",
  JOELHO_45: "Joelho 45\xB0",
  TE: "T\xEA",
  CRUZETA: "Cruzeta",
  LUVA: "Luva",
  REDUCAO: "Redu\xE7\xE3o"
};
function tipoDeConexaoManual(tipoHidraulico) {
  switch (tipoHidraulico) {
    case "CONEXAO_JOELHO_90":
      return "JOELHO_90";
    case "CONEXAO_JOELHO_45":
      return "JOELHO_45";
    case "CONEXAO_TE":
      return "TE";
    case "CONEXAO_LUVA":
      return "LUVA";
    case "CONEXAO_REDUCAO":
      return "REDUCAO";
    default:
      return null;
  }
}
var HIDRAULICAS = ["AGUA_FRIA", "AGUA_QUENTE", "ESGOTO"];
function fazerChave(niveis) {
  const ordenados = [...niveis].sort((a, b) => a.elevationMm - b.elevationMm);
  const abaixoDe = /* @__PURE__ */ new Map();
  ordenados.forEach((l, i) => abaixoDe.set(l.id, i > 0 ? ordenados[i - 1] : null));
  return (levelId, disciplina, x, y, cota) => {
    if (cota <= 0) {
      const abaixo = abaixoDe.get(levelId);
      if (abaixo) return { chave: `${disciplina}|${abaixo.id}|${x},${y}|${abaixo.defaultHeightMm + cota}`, levelId: abaixo.id, cotaMm: abaixo.defaultHeightMm + cota };
    }
    return { chave: `${disciplina}|${levelId}|${x},${y}|${cota}`, levelId, cotaMm: cota };
  };
}
function unitario(de, para) {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  const dz = para.cota - de.cota;
  const n4 = Math.hypot(dx, dy, dz);
  return n4 === 0 ? null : [dx / n4, dy / n4, dz / n4];
}
function anguloGraus(a, b) {
  const cos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(cos) * 180 / Math.PI;
}
function conexoesDerivadas(model) {
  const chave = fazerChave(model.levels);
  const nos = /* @__PURE__ */ new Map();
  const trechos = [...model.trechos ?? []].filter((t) => HIDRAULICAS.includes(t.disciplina)).sort((x, y) => x.id.localeCompare(y.id));
  for (const t of trechos) {
    const pontas = [
      [{ ...t.a, cota: t.cotaAMm }, { ...t.b, cota: t.cotaBMm }],
      [{ ...t.b, cota: t.cotaBMm }, { ...t.a, cota: t.cotaAMm }]
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
  const terminaisPorChave = /* @__PURE__ */ new Map();
  for (const term of model.terminais ?? []) {
    if (!HIDRAULICAS.includes(term.disciplina)) continue;
    const k = chave(term.levelId, term.disciplina, term.at.x, term.at.y, term.cotaMm).chave;
    const lista = terminaisPorChave.get(k) ?? [];
    lista.push(term);
    terminaisPorChave.set(k, lista);
  }
  const conexoes = [];
  const pontasAbertas = [];
  const chavesOrdenadas = [...nos.keys()].sort();
  for (const k of chavesOrdenadas) {
    const no = nos.get(k);
    const terminais = terminaisPorChave.get(k) ?? [];
    const manual = terminais.map((t) => tipoDeConexaoManual(t.tipoHidraulico)).find((x) => !!x) ?? null;
    const temPeca = terminais.some((t) => !tipoDeConexaoManual(t.tipoHidraulico));
    const inc = no.incidencias;
    const trechoIds = [...new Set(inc.map((i) => i.trecho.id))].sort();
    const bitolas = inc.map((i) => i.trecho.bitolaMm);
    const maior = Math.max(...bitolas);
    const menor = Math.min(...bitolas);
    const base = { levelId: no.levelId, no: no.no, cotaMm: no.cotaMm, disciplina: no.disciplina, trechoIds, bitolaMm: maior };
    if (manual) {
      conexoes.push({ ...base, tipo: manual, origem: "MANUAL", ...menor !== maior ? { paraMm: menor } : {} });
      continue;
    }
    if (inc.length === 1) {
      if (!temPeca) pontasAbertas.push({ levelId: no.levelId, no: no.no, cotaMm: no.cotaMm, disciplina: no.disciplina, trechoId: inc[0].trecho.id });
      continue;
    }
    if (inc.length === 2) {
      const ang = anguloGraus(inc[0].u, inc[1].u);
      if (ang >= 170) {
        if (temPeca) continue;
        if (maior === menor) conexoes.push({ ...base, tipo: "LUVA", origem: "DERIVADA" });
        else conexoes.push({ ...base, tipo: "REDUCAO", origem: "DERIVADA", paraMm: menor });
        continue;
      }
      const perto = (alvo) => Math.abs(ang - alvo) <= 10;
      if (perto(90)) conexoes.push({ ...base, tipo: "JOELHO_90", origem: "DERIVADA", ...menor !== maior ? { paraMm: menor } : {} });
      else if (perto(45) || perto(135)) conexoes.push({ ...base, tipo: "JOELHO_45", origem: "DERIVADA", ...menor !== maior ? { paraMm: menor } : {} });
      else conexoes.push({ ...base, tipo: "JOELHO_90", origem: "DERIVADA", aviso: `\xE2ngulo de ${Math.round(ang)}\xB0 \u2014 fora de 45/90`, ...menor !== maior ? { paraMm: menor } : {} });
      continue;
    }
    if (inc.length === 3) {
      conexoes.push({ ...base, tipo: "TE", origem: "DERIVADA", ...menor !== maior ? { paraMm: menor } : {} });
      continue;
    }
    conexoes.push({ ...base, tipo: "CRUZETA", origem: "DERIVADA", aviso: `${inc.length} trechos no mesmo n\xF3`, ...menor !== maior ? { paraMm: menor } : {} });
  }
  const sobreOTrecho = (t) => {
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
        origem: "MANUAL",
        ...tr ? {} : { aviso: "conex\xE3o sem trecho no ponto" }
      });
    }
  }
  return { conexoes, pontasAbertas };
}

// utils/blueprintKernel/quantities.ts
var POLITICA_PADRAO = {
  version: "quant-1.16.0",
  alturaRodapeMm: 100,
  perdaRevestimento: 0.1,
  casas: 2
};
var MM2_PARA_M2 = 1e6;
var MM3_PARA_M3 = 1e9;
function espessuraDoTrecho(walls, a, b) {
  for (const w of walls) {
    if (!areCollinear(w.a, w.b, a) || !areCollinear(w.a, w.b, b)) continue;
    if (!isBetween(w.a, w.b, a) || !isBetween(w.a, w.b, b)) continue;
    return w.thicknessMm;
  }
  return 0;
}
function areaRecuada(ring, walls, sentido = 1) {
  const n4 = ring.length;
  if (n4 < 3) return { areaMm2: 0, formula: "contorno degenerado" };
  let duasVezes = 0;
  for (let i = 0; i < n4; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n4];
    duasVezes += p.x * q.y - q.x * p.y;
  }
  const areaEixo = Math.abs(duasVezes / 2);
  let termoLinear = 0;
  let termoCanto = 0;
  const espessuras = [];
  for (let i = 0; i < n4; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n4];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const d = espessuraDoTrecho(walls, a, b) / 2 * sentido;
    espessuras.push(d);
    termoLinear += d * L;
  }
  for (let i = 0; i < n4; i++) {
    const p = ring[(i - 1 + n4) % n4];
    const c = ring[i];
    const q = ring[(i + 1) % n4];
    const ux = c.x - p.x;
    const uy = c.y - p.y;
    const vx = q.x - c.x;
    const vy = q.y - c.y;
    const giro = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const d = (espessuras[(i - 1 + n4) % n4] + espessuras[i]) / 2;
    const GIRO_MAXIMO = 160 * Math.PI / 180;
    const giroLimitado = Math.max(-GIRO_MAXIMO, Math.min(GIRO_MAXIMO, giro));
    termoCanto += d * d * Math.tan(giroLimitado / 2);
  }
  return {
    areaMm2: Math.max(0, areaEixo - termoLinear + termoCanto),
    formula: "A_eixo \u2212 \u03A3(espessura/2 \xD7 comprimento) + \u03A3(recuo\xB2 \xD7 tan(giro/2))"
  };
}
function areaConstruidaMm2(model, level) {
  const contornos = contornoExternoDoNivel(model, level);
  const paredes = model.walls.filter((w) => w.levelId === level.id);
  return contornos.reduce(
    (soma, anel) => soma + areaRecuada(anel, paredes, -1).areaMm2,
    0
  );
}
function aberturasDoAmbiente(space, walls, openings) {
  const idsNoContorno = /* @__PURE__ */ new Set();
  const n4 = space.ring.length;
  for (let i = 0; i < n4; i++) {
    const a = space.ring[i];
    const b = space.ring[(i + 1) % n4];
    for (const w of walls) {
      if (!areCollinear(w.a, w.b, a) || !areCollinear(w.a, w.b, b)) continue;
      if (!isBetween(w.a, w.b, a) || !isBetween(w.a, w.b, b)) continue;
      idsNoContorno.add(w.id);
    }
  }
  return openings.filter((o) => idsNoContorno.has(o.wallId));
}
function medirEstrutura(s2) {
  const forma = FORMA_ESTRUTURAL[s2.kind];
  if (forma === "AREA") {
    const area = polygonArea(s2.pontos);
    return {
      comprimentoMm: 0,
      areaPlantaMm2: area,
      volumeMm3: area * s2.alturaMm,
      areaFormaMm2: area,
      formula: "\xE1rea do contorno \xD7 espessura"
    };
  }
  if (forma === "LINHA") {
    const [a, b] = s2.pontos;
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    const t = secaoTValida(s2);
    if (t) {
      return {
        comprimentoMm: comp,
        areaPlantaMm2: comp * s2.larguraMm,
        volumeMm3: comp * areaDaSecaoT(s2.larguraMm, s2.alturaMm, t),
        areaFormaMm2: comp * perimetroDeFormaDaSecaoT(s2.larguraMm, s2.alturaMm, t),
        formula: "comprimento \xD7 \xE1rea da se\xE7\xE3o T (mesa + alma)"
      };
    }
    return {
      comprimentoMm: comp,
      areaPlantaMm2: comp * s2.larguraMm,
      volumeMm3: comp * s2.larguraMm * s2.alturaMm,
      areaFormaMm2: comp * (2 * s2.alturaMm + s2.larguraMm),
      formula: "comprimento do eixo \xD7 base \xD7 altura da se\xE7\xE3o"
    };
  }
  if (s2.circular) {
    const raio = s2.larguraMm / 2;
    const areaSecao2 = Math.PI * raio * raio;
    return {
      comprimentoMm: s2.alturaMm,
      areaPlantaMm2: areaSecao2,
      volumeMm3: areaSecao2 * s2.alturaMm,
      areaFormaMm2: Math.PI * s2.larguraMm * s2.alturaMm,
      formula: "\u03C0 \xD7 (di\xE2metro/2)\xB2 \xD7 altura"
    };
  }
  const areaSecao = s2.larguraMm * s2.profundidadeMm;
  return {
    comprimentoMm: s2.alturaMm,
    areaPlantaMm2: areaSecao,
    volumeMm3: areaSecao * s2.alturaMm,
    areaFormaMm2: 2 * (s2.larguraMm + s2.profundidadeMm) * s2.alturaMm,
    formula: "largura \xD7 profundidade \xD7 altura"
  };
}
function ocupaPiso(s2) {
  if (FORMA_ESTRUTURAL[s2.kind] !== "PONTO") return false;
  return s2.baseMm <= 0 && s2.baseMm + s2.alturaMm > 0;
}
function areaOcupadaNoAmbiente(s2, ring) {
  const cantos = contornoEmPlanta(s2);
  if (cantos.length === 0) return 0;
  if (!cantos.every((c) => pointInPolygon(ring, c))) return 0;
  if (s2.circular) {
    const raio = s2.larguraMm / 2;
    return Math.PI * raio * raio;
  }
  return s2.larguraMm * s2.profundidadeMm;
}
function computeQuantities(model, policy = POLITICA_PADRAO, kernelVersion = "") {
  const disputas = sobreposicoesDoModelo(model);
  const cedeMm3 = /* @__PURE__ */ new Map();
  const sobreposicoes = disputas.map((d) => {
    const parede = model.walls.find((w) => w.id === d.aId) ?? null;
    const peca = (model.structures ?? []).find((s2) => s2.id === d.bId) ?? null;
    const outroA = parede ?? (model.structures ?? []).find((s2) => s2.id === d.aId) ?? null;
    const aCede = (parede ?? outroA)?.cedeSobreposicao === true;
    const bCede = peca?.cedeSobreposicao === true;
    const quemCedeId = aCede && bCede ? d.aId : aCede ? d.aId : bCede ? d.bId : null;
    if (quemCedeId) {
      cedeMm3.set(quemCedeId, (cedeMm3.get(quemCedeId) ?? 0) + d.volumeMm3);
    }
    return {
      aId: d.aId,
      bId: d.bId,
      volumeM3: d.volumeMm3 / MM3_PARA_M3,
      quemCede: !quemCedeId ? "NINGUEM" : quemCedeId === d.aId && parede ? "PAREDE" : "CONCRETO"
    };
  });
  const paredesTodas = model.walls.map((w) => {
    const compMm = wallLength(w);
    const aberturas2 = model.openings.filter((o) => o.wallId === w.id);
    const areaAberturasMm2 = aberturas2.reduce((s2, o) => s2 + o.widthMm * o.heightMm, 0);
    const bruta = compMm * w.heightMm;
    const cedidoMm3 = Math.min(
      cedeMm3.get(w.id) ?? 0,
      (bruta - areaAberturasMm2) * w.thicknessMm
    );
    const cedidoFaceMm2 = w.thicknessMm > 0 ? cedidoMm3 / w.thicknessMm : 0;
    const liquidaMm2 = Math.max(0, bruta - areaAberturasMm2 - cedidoFaceMm2);
    const camadas = (w.camadas ?? []).map((c, i) => ({
      indice: i,
      itemCode: c.itemCode,
      descricao: c.descricao,
      funcao: c.funcao,
      espessuraM: c.espessuraMm / 1e3,
      areaFaceM2: liquidaMm2 / MM2_PARA_M2,
      volumeM3: liquidaMm2 * c.espessuraMm / MM3_PARA_M3,
      formula: cedidoMm3 > 0 ? "(comprimento \xD7 altura \u2212 aberturas \u2212 estrutura) \xD7 espessura da camada" : "(comprimento \xD7 altura \u2212 aberturas) \xD7 espessura da camada"
    }));
    return {
      wallId: w.id,
      fase: faseDe(w),
      uid: w.uid,
      comprimentoM: compMm / 1e3,
      alturaM: w.heightMm / 1e3,
      espessuraM: w.thicknessMm / 1e3,
      areaFaceBrutaM2: bruta / MM2_PARA_M2,
      areaAberturasM2: areaAberturasMm2 / MM2_PARA_M2,
      areaFaceLiquidaM2: liquidaMm2 / MM2_PARA_M2,
      // CORTINA (P2.20): pele de vidro não tem alvenaria.
      volumeM3: w.cortina ? 0 : liquidaMm2 * w.thicknessMm / MM3_PARA_M3,
      volumeCedidoM3: cedidoMm3 / MM3_PARA_M3,
      camadas: w.cortina ? [] : camadas,
      ...w.cortina ? (() => {
        const paineis = Math.max(1, Math.ceil(compMm / w.cortina.moduloMm));
        const montantesM = ((paineis + 1) * w.heightMm + 2 * compMm) / 1e3;
        return { cortina: { painel: w.cortina.painel, areaM2: liquidaMm2 / MM2_PARA_M2, paineis, montantesM: Math.round(montantesM * 100) / 100 } };
      })() : {},
      ...w.brise ? (() => {
        const b = w.brise;
        const laminas = b.orientacao === "HORIZONTAL" ? Math.max(1, Math.floor(w.heightMm / b.passoMm)) : Math.max(1, Math.floor(compMm / b.passoMm));
        const compLaminaMm = b.orientacao === "HORIZONTAL" ? compMm : w.heightMm;
        return { brise: { orientacao: b.orientacao, areaM2: bruta / MM2_PARA_M2, laminas, comprimentoLaminasM: Math.round(laminas * compLaminaMm / 1e3 * 100) / 100 } };
      })() : {}
    };
  });
  const paredes = paredesTodas.filter((q) => q.fase === "NOVO");
  const materiais = /* @__PURE__ */ new Map();
  for (const p of paredes) {
    for (const c of p.camadas) {
      const chave = `${c.itemCode}
${c.funcao}`;
      const atual = materiais.get(chave);
      if (atual) {
        atual.volumeM3 += c.volumeM3;
        atual.areaFaceM2 += c.areaFaceM2;
      } else {
        materiais.set(chave, {
          itemCode: c.itemCode,
          descricao: c.descricao,
          funcao: c.funcao,
          volumeM3: c.volumeM3,
          areaFaceM2: c.areaFaceM2
        });
      }
    }
  }
  const porMaterial = [...materiais.values()].sort(
    (a, b) => a.itemCode.localeCompare(b.itemCode) || a.funcao.localeCompare(b.funcao)
  );
  const aberturasTodas = model.openings.map((o) => ({
    openingId: o.id,
    fase: faseDe(o),
    uid: o.uid,
    tipo: o.kind,
    larguraM: o.widthMm / 1e3,
    alturaM: o.heightMm / 1e3,
    areaM2: o.widthMm * o.heightMm / MM2_PARA_M2,
    nome: nomeDaEsquadria(o),
    assinatura: assinaturaDaEsquadria(o),
    itemCode: o.esquadria?.itemCode ?? "",
    descricao: o.esquadria?.descricao ?? ""
  }));
  const aberturas = aberturasTodas.filter((q) => q.fase === "NOVO");
  const grupos = /* @__PURE__ */ new Map();
  for (const q of aberturas) {
    if (q.tipo === "passage") continue;
    const g = grupos.get(q.assinatura);
    if (g) {
      g.quantidade += 1;
      g.areaM2 += q.areaM2;
      g.openingIds.push(q.openingId);
    } else {
      grupos.set(q.assinatura, {
        assinatura: q.assinatura,
        nome: q.nome,
        tipo: q.tipo,
        larguraM: q.larguraM,
        alturaM: q.alturaM,
        itemCode: q.itemCode,
        descricao: q.descricao,
        quantidade: 1,
        areaM2: q.areaM2,
        openingIds: [q.openingId]
      });
    }
  }
  const porEsquadria = [...grupos.values()].sort(
    (a, b) => a.nome.localeCompare(b.nome) || a.assinatura.localeCompare(b.assinatura)
  );
  const telhados = (model.roofs ?? []).map((r) => {
    const m = medirAgua(r);
    return {
      aguaId: r.id,
      uid: r.uid,
      areaProjetadaM2: m.areaProjetadaM2,
      areaRealM2: m.areaRealM2,
      inclinacaoPct: r.inclinacaoPct,
      inclinacaoGraus: m.inclinacaoGraus,
      comprimentoBeiralM: m.comprimentoBeiralM,
      alturaMaximaM: m.alturaMaximaMm / 1e3,
      formula: m.formula
    };
  });
  const furos = furosDaEscada(model);
  const furoMm2PorLaje = /* @__PURE__ */ new Map();
  const furoMm2PorEscada = /* @__PURE__ */ new Map();
  for (const f of furos) {
    furoMm2PorLaje.set(f.structuralId, (furoMm2PorLaje.get(f.structuralId) ?? 0) + f.areaMm2);
    furoMm2PorEscada.set(f.escadaId, (furoMm2PorEscada.get(f.escadaId) ?? 0) + f.areaMm2);
  }
  for (const f of furosDoNucleo(model)) {
    furoMm2PorLaje.set(f.structuralId, (furoMm2PorLaje.get(f.structuralId) ?? 0) + f.areaMm2);
  }
  const escadas = (model.stairs ?? []).map((e) => {
    const m = medirEscada(model, e);
    return {
      escadaId: e.id,
      uid: e.uid,
      tipo: e.tipo,
      rotulo: e.rotulo ?? "",
      areaPlantaM2: m.areaPlantaMm2 / MM2_PARA_M2,
      larguraM: e.larguraMm / 1e3,
      comprimentoM: m.comprimentoMm / 1e3,
      comprimentoInclinadoM: m.comprimentoInclinadoMm / 1e3,
      desnivelM: m.desnivelMm / 1e3,
      degraus: m.degraus,
      espelhoM: m.espelhoMm / 1e3,
      pisoM: m.pisoMm / 1e3,
      inclinacaoPct: m.inclinacaoPct,
      areaFuroLajeM2: (furoMm2PorEscada.get(e.id) ?? 0) / MM2_PARA_M2,
      formula: e.tipo === "RAMPA" ? `inclina\xE7\xE3o = desn\xEDvel ${m.desnivelMm} / comprimento ${m.comprimentoMm}` : `degraus = round(${m.desnivelMm} / ${e.alvoEspelhoMm}) = ${m.degraus}; espelho = ${m.desnivelMm} / ${m.degraus}`
    };
  });
  const estruturasTodas = (model.structures ?? []).map((s2) => {
    const m = medirEstrutura(s2);
    const cedidoMm3 = Math.min(cedeMm3.get(s2.id) ?? 0, m.volumeMm3);
    return {
      structuralId: s2.id,
      fase: faseDe(s2),
      uid: s2.uid,
      kind: s2.kind,
      rotulo: s2.rotulo ?? "",
      comprimentoM: m.comprimentoMm / 1e3,
      // A LAJE perde o furo da escada — em área e em volume. Derivado a cada
      // leitura: mover a escada corrige o desconto sozinho.
      areaPlantaM2: (m.areaPlantaMm2 - (furoMm2PorLaje.get(s2.id) ?? 0)) / MM2_PARA_M2,
      volumeConcretoM3: (m.volumeMm3 - cedidoMm3 - (furoMm2PorLaje.get(s2.id) ?? 0) * s2.alturaMm) / MM3_PARA_M3,
      // A FÔRMA não muda. Ela é a superfície que se cofra, e o pilar embutido
      // continua precisando de fôrma nas faces que ficam contra a alvenaria —
      // é o que segura o concreto até a cura. Descontar aqui tiraria material
      // que a obra usa de verdade.
      areaFormaM2: m.areaFormaMm2 / MM2_PARA_M2,
      volumeCedidoM3: cedidoMm3 / MM3_PARA_M3,
      formula: cedidoMm3 > 0 ? `${m.formula} \u2212 volume cedido \xE0 alvenaria` : m.formula
    };
  });
  const estruturas = estruturasTodas.filter((q) => q.fase === "NOVO");
  const resumoDaFase = (fase) => {
    const ps = paredesTodas.filter((q) => q.fase === fase);
    const as = aberturasTodas.filter((q) => q.fase === fase);
    const es = estruturasTodas.filter((q) => q.fase === fase);
    return {
      paredes: ps.length,
      areaParedeM2: ps.reduce((soma, q) => soma + q.areaFaceLiquidaM2, 0),
      volumeAlvenariaM3: ps.reduce((soma, q) => soma + q.volumeM3, 0),
      comprimentoParedeM: ps.reduce((soma, q) => soma + q.comprimentoM, 0),
      aberturas: as.length,
      areaAberturasM2: as.reduce((soma, q) => soma + q.areaM2, 0),
      estruturas: es.length,
      volumeConcretoM3: es.reduce((soma, q) => soma + q.volumeConcretoM3, 0)
    };
  };
  const somaEstrutural = (tipos, campo) => estruturas.filter((e) => tipos.includes(e.kind)).reduce((s2, e) => s2 + e[campo], 0);
  const FUNDACAO = ["ESTACA", "BLOCO_COROAMENTO", "VIGA_FUNDACAO"];
  const ambientes = model.spaces.map((s2) => {
    const { areaMm2: pisoMm2, formula } = areaRecuada(s2.ring, model.walls);
    const buracosMm2 = s2.holes.reduce((soma, h) => {
      const { areaMm2 } = areaRecuada(h, model.walls);
      return soma + areaMm2;
    }, 0);
    const estruturaMm2 = (model.structures ?? []).filter((e) => e.levelId === s2.levelId && ocupaPiso(e)).reduce((soma, e) => soma + areaOcupadaNoAmbiente(e, s2.ring), 0);
    const pisoLiquidoMm2 = Math.max(0, pisoMm2 - buracosMm2 - estruturaMm2);
    const interrompemRodape = aberturasDoAmbiente(s2, model.walls, model.openings).filter(
      (o) => o.sillMm === 0
    );
    const vaoPortasMm = interrompemRodape.reduce((soma, o) => soma + o.widthMm, 0);
    const rodapeDerivadoMm = Math.max(0, s2.perimeterMm - vaoPortasMm);
    const acab = acabamentosDoAmbiente(model, s2);
    const rodapeMm = acab?.rodape === null ? 0 : rodapeDerivadoMm;
    const alturaRodapeMm = acab?.rodape ? acab.rodape.alturaMm : policy.alturaRodapeMm;
    const medirCamadas = (camadas) => camadas.map((c, indice) => ({
      indice,
      itemCode: c.itemCode,
      descricao: c.descricao,
      funcao: c.funcao,
      espessuraM: c.espessuraMm / 1e3,
      areaM2: pisoLiquidoMm2 / MM2_PARA_M2,
      volumeM3: pisoLiquidoMm2 * c.espessuraMm / 1e9
    }));
    const nivelDoAmbiente = model.levels.find((l) => l.id === s2.levelId);
    const peDireitoUtilMm = Math.max(0, (nivelDoAmbiente?.defaultHeightMm ?? 0) - (acab?.forro?.rebaixoMm ?? 0));
    return {
      ...acab?.piso ? { piso: { camadas: medirCamadas(acab.piso) } } : {},
      ...acab?.forro ? { forro: { rebaixoM: acab.forro.rebaixoMm / 1e3, camadas: medirCamadas(acab.forro.camadas) } } : {},
      ...acab && acab.rodape !== void 0 ? { rodapeDeclarado: acab.rodape ? { ...acab.rodape } : null } : {},
      spaceId: s2.id,
      uid: s2.labelUid ?? null,
      nome: s2.name,
      areaEixoM2: s2.areaMm2 / MM2_PARA_M2,
      areaPisoM2: pisoLiquidoMm2 / MM2_PARA_M2,
      areaPisoComPerdaM2: pisoLiquidoMm2 * (1 + policy.perdaRevestimento) / MM2_PARA_M2,
      perimetroEixoM: s2.perimeterMm / 1e3,
      comprimentoRodapeM: rodapeMm / 1e3,
      areaRodapeM2: rodapeMm * alturaRodapeMm / MM2_PARA_M2,
      peDireitoM: peDireitoUtilMm / 1e3,
      volumeM3: Math.round(pisoLiquidoMm2 / MM2_PARA_M2 * (peDireitoUtilMm / 1e3) * 100) / 100,
      areaEstruturaM2: estruturaMm2 / MM2_PARA_M2,
      formulaAreaPiso: estruturaMm2 > 0 ? `${formula} \u2212 se\xE7\xE3o dos pilares no ambiente` : formula
    };
  });
  const acabamentos = /* @__PURE__ */ new Map();
  const somarAcabamento = (escopo, itemCode, descricao, funcao, areaM2, volumeM3, comprimentoM) => {
    const chave = `${escopo} ${itemCode} ${funcao ?? ""}`;
    const atual = acabamentos.get(chave);
    if (atual) {
      atual.areaM2 += areaM2;
      atual.volumeM3 += volumeM3;
      atual.comprimentoM += comprimentoM;
      atual.ambientes += 1;
    } else {
      acabamentos.set(chave, { escopo, itemCode, descricao, funcao, areaM2, volumeM3, comprimentoM, ambientes: 1 });
    }
  };
  for (const a of ambientes) {
    for (const c of a.piso?.camadas ?? []) somarAcabamento("PISO", c.itemCode, c.descricao, c.funcao, c.areaM2, c.volumeM3, 0);
    for (const c of a.forro?.camadas ?? []) somarAcabamento("FORRO", c.itemCode, c.descricao, c.funcao, c.areaM2, c.volumeM3, 0);
    if (a.rodapeDeclarado) somarAcabamento("RODAPE", a.rodapeDeclarado.itemCode, a.rodapeDeclarado.descricao, null, a.areaRodapeM2, 0, a.comprimentoRodapeM);
  }
  const ORDEM_ESCOPO = { PISO: 0, FORRO: 1, RODAPE: 2 };
  const porAcabamento = [...acabamentos.values()].sort(
    (a, b) => ORDEM_ESCOPO[a.escopo] - ORDEM_ESCOPO[b.escopo] || a.itemCode.localeCompare(b.itemCode) || (a.funcao ?? "").localeCompare(b.funcao ?? "")
  );
  const guardaCorpos = (model.guardaCorpos ?? []).map((g) => {
    const comprimentoM = comprimentoDoGuardaCorpo(g) / 1e3;
    return {
      guardaCorpoId: g.id,
      uid: g.uid,
      tipo: g.tipo,
      material: g.material,
      itemCode: g.itemCode,
      descricao: g.descricao,
      rotulo: g.rotulo ?? null,
      comprimentoM,
      alturaM: g.alturaMm / 1e3,
      areaM2: comprimentoM * g.alturaMm / 1e3,
      trechos: g.pontos.length - 1,
      sugerido: !!g.sugerido
    };
  });
  const rodapes = (model.rodapes ?? []).map((r) => {
    let compMm = 0;
    for (let i = 1; i < r.pontos.length; i++) compMm += Math.hypot(r.pontos[i].x - r.pontos[i - 1].x, r.pontos[i].y - r.pontos[i - 1].y);
    return { rodapeId: r.id, uid: r.uid, comprimentoM: compMm / 1e3, alturaMm: r.alturaMm, areaM2: compMm * r.alturaMm / MM2_PARA_M2, itemCode: r.itemCode, descricao: r.descricao, sugerido: !!r.sugerido };
  });
  const gruposDeRodape = /* @__PURE__ */ new Map();
  for (const r of rodapes) {
    const chave = `${r.itemCode}|${r.alturaMm}`;
    const atual = gruposDeRodape.get(chave);
    if (atual) {
      atual.comprimentoM += r.comprimentoM;
      atual.areaM2 += r.areaM2;
      atual.trechos += 1;
    } else gruposDeRodape.set(chave, { itemCode: r.itemCode, descricao: r.descricao, alturaMm: r.alturaMm, comprimentoM: r.comprimentoM, areaM2: r.areaM2, trechos: 1 });
  }
  const porRodape = [...gruposDeRodape.values()].sort((a, b) => a.itemCode.localeCompare(b.itemCode) || a.alturaMm - b.alturaMm);
  const gruposDeGuardaCorpo = /* @__PURE__ */ new Map();
  for (const g of guardaCorpos) {
    const chave = `${g.tipo} ${g.material} ${g.itemCode}`;
    const atual = gruposDeGuardaCorpo.get(chave);
    if (atual) {
      atual.comprimentoM += g.comprimentoM;
      atual.areaM2 += g.areaM2;
      atual.pecas += 1;
    } else {
      gruposDeGuardaCorpo.set(chave, { tipo: g.tipo, material: g.material, itemCode: g.itemCode, descricao: g.descricao, comprimentoM: g.comprimentoM, areaM2: g.areaM2, pecas: 1 });
    }
  }
  const porGuardaCorpo = [...gruposDeGuardaCorpo.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.material.localeCompare(b.material) || a.itemCode.localeCompare(b.itemCode));
  const trechos = (model.trechos ?? []).map((t) => {
    const dx = t.b.x - t.a.x;
    const dy = t.b.y - t.a.y;
    const planta = Math.hypot(dx, dy);
    const desnivel = t.cotaBMm - t.cotaAMm;
    const emL = t.disciplina === "ELETRICA";
    const real = emL ? planta + Math.abs(desnivel) : Math.hypot(planta, desnivel);
    return {
      trechoId: t.id,
      uid: t.uid,
      disciplina: t.disciplina,
      rotulo: t.rotulo ?? "",
      bitolaMm: t.bitolaMm,
      itemCode: t.itemCode ?? null,
      comprimentoPlantaM: planta / 1e3,
      comprimentoM: real / 1e3,
      desnivelM: desnivel / 1e3,
      formula: desnivel === 0 ? `${(planta / 1e3).toFixed(3)} m em planta` : planta === 0 ? `${(Math.abs(desnivel) / 1e3).toFixed(3)} m de prumada` : emL ? `${(planta / 1e3).toFixed(3)} m em planta + ${(Math.abs(desnivel) / 1e3).toFixed(3)} m de prumada` : `\u221A(${(planta / 1e3).toFixed(3)}\xB2 + ${(Math.abs(desnivel) / 1e3).toFixed(3)}\xB2) m`
    };
  });
  const porBitolaMapa = /* @__PURE__ */ new Map();
  for (const t of trechos) {
    const chave = `${t.disciplina}
${t.bitolaMm}
${t.itemCode ?? ""}`;
    const atual = porBitolaMapa.get(chave);
    if (atual) {
      atual.comprimentoM += t.comprimentoM;
      atual.trechos += 1;
    } else {
      porBitolaMapa.set(chave, {
        disciplina: t.disciplina,
        bitolaMm: t.bitolaMm,
        itemCode: t.itemCode,
        comprimentoM: t.comprimentoM,
        trechos: 1
      });
    }
  }
  const porBitola = [...porBitolaMapa.values()].sort(
    (x, y) => x.disciplina.localeCompare(y.disciplina) || x.bitolaMm - y.bitolaMm
  );
  const porTerminalMapa = /* @__PURE__ */ new Map();
  for (const t of model.terminais ?? []) {
    const classificacao = t.tipoHidraulico ?? t.tipoEletrico ?? null;
    const chave = `${t.disciplina}
${classificacao ?? t.tipo}
${t.itemCode ?? ""}`;
    const atual = porTerminalMapa.get(chave);
    if (atual) atual.quantidade += 1;
    else {
      porTerminalMapa.set(chave, {
        disciplina: t.disciplina,
        tipo: t.tipo,
        classificacao,
        itemCode: t.itemCode ?? null,
        quantidade: 1
      });
    }
  }
  const { conexoes } = conexoesDerivadas(model);
  const porConexaoMapa = /* @__PURE__ */ new Map();
  for (const c of conexoes) {
    const k = `${c.disciplina}|${c.tipo}|${c.bitolaMm}|${c.paraMm ?? ""}`;
    const atual = porConexaoMapa.get(k) ?? { disciplina: c.disciplina, tipo: c.tipo, bitolaMm: c.bitolaMm, paraMm: c.paraMm ?? null, quantidade: 0, derivadas: 0, manuais: 0 };
    atual.quantidade += 1;
    if (c.origem === "MANUAL") atual.manuais += 1;
    else atual.derivadas += 1;
    porConexaoMapa.set(k, atual);
  }
  const porConexao = [...porConexaoMapa.values()].sort(
    (x, y) => x.disciplina.localeCompare(y.disciplina) || x.tipo.localeCompare(y.tipo) || x.bitolaMm - y.bitolaMm
  );
  const porTerminal = [...porTerminalMapa.values()].sort(
    (x, y) => x.disciplina.localeCompare(y.disciplina) || x.tipo.localeCompare(y.tipo)
  );
  const somaPiso = ambientes.reduce((s2, a) => s2 + a.areaPisoM2, 0);
  const somaFace = paredes.reduce((s2, p) => s2 + p.areaFaceLiquidaM2, 0);
  const somaConstruida = model.levels.reduce(
    (soma, nivel) => soma + areaConstruidaMm2(model, nivel) / MM2_PARA_M2,
    0
  );
  return {
    policy,
    kernelVersion,
    ambientes,
    paredes: paredesTodas,
    aberturas: aberturasTodas,
    estruturas: estruturasTodas,
    telhados,
    escadas,
    guardaCorpos,
    rodapes,
    trechos,
    sobreposicoes,
    conexoes,
    totais: {
      // FASES DE REFORMA (E10.2): o que se DEMOLE e o que FICA, à parte do que se constrói.
      demolicao: resumoDaFase("DEMOLIR"),
      existente: resumoDaFase("EXISTENTE"),
      areaPisoM2: somaPiso,
      areaConstruidaM2: somaConstruida,
      areaPisoComPerdaM2: somaPiso * (1 + policy.perdaRevestimento),
      // Duas faces: é o que se reveste e se pinta dos dois lados.
      areaParedeDuasFacesM2: somaFace * 2,
      volumeAlvenariaM3: paredes.reduce((s2, p) => s2 + p.volumeM3, 0),
      areaCortinaM2: paredes.reduce((s2, p) => s2 + (p.cortina?.areaM2 ?? 0), 0),
      comprimentoMontantesM: paredes.reduce((s2, p) => s2 + (p.cortina?.montantesM ?? 0), 0),
      porCortina: ["VIDRO", "ACM", "POLICARBONATO"].map((painel) => {
        const ps = paredes.filter((p) => p.cortina?.painel === painel);
        return { painel, areaM2: ps.reduce((s2, p) => s2 + p.cortina.areaM2, 0), paineis: ps.reduce((s2, p) => s2 + p.cortina.paineis, 0), montantesM: ps.reduce((s2, p) => s2 + p.cortina.montantesM, 0), paredes: ps.length };
      }).filter((x) => x.paredes > 0),
      areaBriseM2: paredes.reduce((s2, p) => s2 + (p.brise?.areaM2 ?? 0), 0),
      laminasDeBrise: paredes.reduce((s2, p) => s2 + (p.brise?.laminas ?? 0), 0),
      porMaterial,
      porAcabamento,
      comprimentoGuardaCorpoM: guardaCorpos.filter((g) => g.tipo === "GUARDA_CORPO").reduce((s2, g) => s2 + g.comprimentoM, 0),
      comprimentoCorrimaoM: guardaCorpos.filter((g) => g.tipo === "CORRIMAO").reduce((s2, g) => s2 + g.comprimentoM, 0),
      porGuardaCorpo,
      // P2.21: os trechos mandam quando existem; senão, o derivado de sempre.
      comprimentoRodapeM: rodapes.length > 0 ? rodapes.reduce((s2, r) => s2 + r.comprimentoM, 0) : ambientes.reduce((s2, a) => s2 + a.comprimentoRodapeM, 0),
      origemDoRodape: rodapes.length > 0 ? "TRECHOS" : "DERIVADO",
      porRodape,
      portas: aberturas.filter((o) => o.tipo === "door").length,
      janelas: aberturas.filter((o) => o.tipo === "window").length,
      vaosLivres: aberturas.filter((o) => o.tipo === "passage").length,
      // Contada à PARTE de `portas`: correr e abrir têm preço e detalhe
      // diferentes, e somá-las devolveria um número que não serve para
      // comprar nada.
      portasDeCorrer: aberturas.filter((o) => o.tipo === "sliding").length,
      areaAberturasM2: aberturas.reduce((s2, o) => s2 + o.areaM2, 0),
      porEsquadria,
      volumeConcretoPilarM3: somaEstrutural(["PILAR"], "volumeConcretoM3"),
      volumeConcretoVigaM3: somaEstrutural(["VIGA"], "volumeConcretoM3"),
      volumeConcretoLajeM3: somaEstrutural(["LAJE"], "volumeConcretoM3"),
      volumeConcretoFundacaoM3: somaEstrutural(FUNDACAO, "volumeConcretoM3"),
      areaFormaPilarM2: somaEstrutural(["PILAR"], "areaFormaM2"),
      areaFormaVigaM2: somaEstrutural(["VIGA"], "areaFormaM2"),
      areaFormaLajeM2: somaEstrutural(["LAJE"], "areaFormaM2"),
      areaFormaFundacaoM2: somaEstrutural(FUNDACAO, "areaFormaM2"),
      comprimentoEstacasM: somaEstrutural(["ESTACA"], "comprimentoM"),
      comprimentoVigasM: somaEstrutural(["VIGA", "VIGA_FUNDACAO"], "comprimentoM"),
      areaLajeM2: somaEstrutural(["LAJE"], "areaPlantaM2"),
      pilares: estruturas.filter((e) => e.kind === "PILAR").length,
      estacas: estruturas.filter((e) => e.kind === "ESTACA").length,
      blocosCoroamento: estruturas.filter((e) => e.kind === "BLOCO_COROAMENTO").length,
      areaTelhadoM2: telhados.reduce((t, a) => t + a.areaRealM2, 0),
      areaTelhadoProjetadaM2: telhados.reduce((t, a) => t + a.areaProjetadaM2, 0),
      aguas: telhados.length,
      areaEscadasM2: escadas.reduce((t, e) => t + e.areaPlantaM2, 0),
      degraus: escadas.reduce((t, e) => t + e.degraus, 0),
      escadas: escadas.length,
      porBitola,
      porTerminal,
      porConexao,
      comprimentoRedeM: trechos.reduce((soma, t) => soma + t.comprimentoM, 0),
      terminais: (model.terminais ?? []).length
    }
  };
}

// utils/blueprintDistribuicao.ts
var ROTULO_DO_TIPO_DE_AMBIENTE = {
  BANHEIRO: "Banheiro",
  COZINHA_SERVICO: "Cozinha / copa / \xE1rea de servi\xE7o",
  VARANDA: "Varanda",
  SALA_DORMITORIO: "Sala / dormit\xF3rio",
  OUTRO: "Outro (hall, corredor, dep\xF3sito\u2026)"
};

// utils/blueprintRede.ts
var MEDIDAS_PADRAO_QUADRO = {
  larguraMm: 400,
  alturaMm: 300,
  profundidadeMm: 200
};
var MEDIDAS_PADRAO_TERMINAL = {
  larguraMm: 100,
  alturaMm: 100,
  profundidadeMm: 100
};
function medidasDaPeca(peca, padrao) {
  return {
    larguraMm: peca.larguraMm ?? padrao.larguraMm,
    alturaMm: peca.alturaMm ?? padrao.alturaMm,
    profundidadeMm: peca.profundidadeMm ?? padrao.profundidadeMm
  };
}
var medidasDoQuadro = (q) => medidasDaPeca(q, MEDIDAS_PADRAO_QUADRO);
var medidasDoTerminal = (t) => medidasDaPeca(t, MEDIDAS_PADRAO_TERMINAL);
var giroDaPeca = (p) => p.rotacaoGraus ?? 0;
var ROTULO_DA_DISCIPLINA = {
  ELETRICA: "El\xE9trica",
  AGUA_FRIA: "\xC1gua fria",
  AGUA_QUENTE: "\xC1gua quente",
  ESGOTO: "Esgoto",
  MECANICA: "Mec\xE2nica"
};
var ROTULO_DO_PONTO_ELETRICO = {
  ILUMINACAO_TETO: "Luz de teto",
  ILUMINACAO_PAREDE: "Arandela",
  ILUMINACAO_PISO: "Luz de piso/jardim",
  TUG: "TUG \u2014 tomada de uso geral",
  TUE: "TUE \u2014 tomada de uso espec\xEDfico",
  DADOS_TELEFONE: "Telefone",
  DADOS_TV: "Antena de TV",
  DADOS_REDE: "Rede (internet)",
  DADOS_USB: "USB",
  LIGACAO_DIRETA: "Liga\xE7\xE3o direta (chuveiro, aquecedor)",
  INTERRUPTOR: "Interruptor"
};
function segmentosDoEletroduto(t, peDireitoMm) {
  const reto = [{ a: t.a, b: t.b, cotaAMm: t.cotaAMm, cotaBMm: t.cotaBMm }];
  if (t.disciplina !== "ELETRICA") return reto;
  const prumada = t.a.x === t.b.x && t.a.y === t.b.y;
  const horizontal = t.cotaAMm === t.cotaBMm;
  if (prumada || horizontal) return reto;
  const distanciaALaje = (cota) => Math.min(Math.abs(cota), Math.abs(peDireitoMm - cota));
  const horizontalEmA = distanciaALaje(t.cotaAMm) <= distanciaALaje(t.cotaBMm);
  return horizontalEmA ? [
    // Corre na cota de A até o ponto B, e sobe/desce em B.
    { a: t.a, b: t.b, cotaAMm: t.cotaAMm, cotaBMm: t.cotaAMm },
    { a: t.b, b: t.b, cotaAMm: t.cotaAMm, cotaBMm: t.cotaBMm }
  ] : [
    // Sobe/desce em A, e corre na cota de B até o ponto B.
    { a: t.a, b: t.a, cotaAMm: t.cotaAMm, cotaBMm: t.cotaBMm },
    { a: t.a, b: t.b, cotaAMm: t.cotaBMm, cotaBMm: t.cotaBMm }
  ];
}

// utils/blueprintIfc.ts
var COBERTURA_IFC = [
  "CONT\xC9M: pavimentos (IfcBuildingStorey), paredes (IfcWall \u2014 eixo, espessura e altura; com IfcMaterialLayerSetUsage quando a composi\xE7\xE3o em camadas foi declarada; IfcCurtainWall quando marcada como cortina de vidro) e ambientes (IfcSpace \u2014 contorno e \xE1rea).",
  "N\xC3O CONT\xC9M brises (P2.20): ficam no quantitativo e no or\xE7amento, n\xE3o no modelo IFC.",
  "CONT\xC9M portas e janelas: IfcDoor e IfcWindow, cada uma com o pr\xF3prio IfcOpeningElement (IfcRelVoidsElement na parede, IfcRelFillsElement no v\xE3o). V\xE3o livre sai s\xF3 como IfcOpeningElement, sem preenchimento. A folha \xE9 uma caixa simples na espessura da parede.",
  "CONT\xC9M estrutura de concreto: IfcColumn (pilar), IfcBeam (viga), IfcSlab (laje), IfcPile (estaca), IfcFooting (bloco de coroamento e viga de funda\xE7\xE3o).",
  "CONT\xC9M propriedades e quantidades: Pset_*Common s\xF3 com o que o desenho sabe derivar (IsExternal, LoadBearing), Pset_OpuraPlanta com a identidade e a proced\xEAncia de cada elemento, e Qto_*BaseQuantities calculadas pelo mesmo motor da aba Quantitativos.",
  'CUSTO: s\xF3 quando a exporta\xE7\xE3o foi marcada para inclu\xED-lo. Vem como Pset_OpuraPlanta.Cost (IfcMonetaryMeasure, moeda BRL declarada em IfcMonetaryUnit) e s\xF3 nos elementos com custo apurado \u2014 elemento sem linha de or\xE7amento N\xC3O ganha a propriedade, porque "n\xE3o or\xE7ado" e "custa zero" s\xE3o coisas diferentes. Sem a marca\xE7\xE3o, o arquivo n\xE3o menciona dinheiro em lugar nenhum.',
  'PISO e FORRO: saem como IfcCovering (.FLOORING. e .CEILING.) por ambiente, ligados a ele por IfcRelCoversSpaces, com a \xC1REA em Qto_CoveringBaseQuantities. SEM GEOMETRIA, de prop\xF3sito: o desenho sabe a \xE1rea e, sem declara\xE7\xE3o, N\xC3O sabe a espessura \u2014 inventar uma poria volume de argamassa num arquivo de coordena\xE7\xE3o. Quando o ambiente DECLAROU as camadas (piso de baixo para cima, forro de cima para baixo), elas saem como IfcMaterialLayerSet associado ao IfcCovering, a espessura total em Qto_CoveringBaseQuantities.Width e o rebaixo do forro em Pset_OpuraAcabamento; o RODAP\xC9 declarado sai como IfcCovering .SKIRTINGBOARD. com Length (per\xEDmetro menos os v\xE3os que chegam ao piso) e Height, e o material associado. Ambiente que declarou "sem rodap\xE9" n\xE3o emite rodap\xE9. Continua sem s\xF3lido: a \xE1rea e a espessura est\xE3o l\xE1 para quem quiser extrudar, e o arquivo n\xE3o afirma uma laje de acabamento que ningu\xE9m modelou. N\xC3O CONT\xC9M revestimento de parede (CLADDING): dizer quais faces recebem acabamento exigiria uma informa\xE7\xE3o que o desenho n\xE3o tem.',
  "O GlobalId de cada elemento \xE9 EST\xC1VEL entre vers\xF5es publicadas do mesmo estudo: a mesma parede tem o mesmo GUID na revis\xE3o seguinte.",
  "CONT\xC9M telhado: um IfcRoof por pavimento agregando uma IfcSlab .ROOF. por \xE1gua \u2014 s\xF3lido inclinado extrudado ao longo da normal do plano \u2014, com Pset_RoofCommon (ProjectedArea e TotalArea), Pset_SlabCommon.PitchAngle e Qto_Roof/SlabBaseQuantities. A \xE1rea TOTAL \xE9 a da superf\xEDcie inclinada, n\xE3o a proje\xE7\xE3o.",
  "CONT\xC9M escada e rampa: IfcStair e IfcRamp (PredefinedType STRAIGHT_RUN / QUARTER_TURN / HALF_TURN pela contagem de v\xE9rtices do eixo), com um s\xF3lido por degrau (ou por trecho de rampa) \u2014 o perfil lateral extrudado pela largura \u2014, Pset_StairCommon (NumberOfRiser, NumberOfTreads, RiserHeight, TreadLength), Pset_RampCommon.RequiredSlope e Qto_Stair/RampBaseQuantities. O n\xFAmero de degraus \xE9 o DERIVADO do desn\xEDvel, o mesmo do desenho. O furo na laje N\xC3O \xE9 IfcOpeningElement: a laje sai inteira e o desconto fica no Qto.",
  "CONT\xC9M a CLASSIFICA\xC7\xC3O do cat\xE1logo: IfcClassification nomeando a fonte (SINAPI, salvo indica\xE7\xE3o), IfcClassificationReference por c\xF3digo distinto e IfcRelAssociatesClassification ligando os elementos que o carregam. Elemento sem c\xF3digo N\xC3O ganha refer\xEAncia vazia, e a parede com v\xE1rias camadas aparece na refer\xEAncia de CADA c\xF3digo, porque eleger uma camada principal exigiria um crit\xE9rio que ningu\xE9m informou.",
  "GEORREFER\xCANCIA: quando o desenho tem lugar informado, saem IfcSite.RefLatitude/RefLongitude/RefElevation e o norte verdadeiro no contexto geom\xE9trico. IfcMapConversion + IfcProjectedCRS s\xF3 saem quando algu\xE9m informou a coordenada PROJETADA (leste, norte e o c\xF3digo do CRS) \u2014 ela NUNCA \xE9 calculada a partir de latitude e longitude, porque a conta depende do fuso e errar o fuso p\xF5e o modelo a centenas de quil\xF4metros do lugar com a forma perfeita.",
  "PAR\xC2METROS PERSONALIZADOS: a pe\xE7a que os carrega ganha Pset_OpuraPersonalizado com a chave de programa como nome da propriedade (n\xFAmero \u2192 IfcReal, sim/n\xE3o \u2192 IfcBoolean, texto \u2192 IfcLabel). O nome leg\xEDvel e a unidade s\xE3o da defini\xE7\xE3o na organiza\xE7\xE3o e N\xC3O viajam.",
  'APROVA\xC7\xC3O: quando a revis\xE3o foi aprovada no sistema, Pset_OpuraPlanta traz ApprovalStatus, ApprovedBy e ApprovedAt em cada elemento, ao lado do SnapshotHash \u2014 \xE9 o par (o que foi aprovado, quem aprovou) que vale. Revis\xE3o que n\xE3o passou por aprova\xE7\xE3o N\xC3O menciona o assunto: dizer "n\xE3o aprovado" afirmaria que algu\xE9m olhou e recusou.',
  "CONT\xC9M instala\xE7\xF5es: cada trecho sai como IfcFlowSegment \u2014 um cilindro na bitola declarada, ao longo do eixo, com as DUAS COTAS que o desenho tem (\xE9 o que distingue a prumada do trecho horizontal e o esgoto com caimento do sem) \u2014 e cada ponto como IfcFlowTerminal \u2014 e o ponto EL\xC9TRICO CLASSIFICADO sai na entidade que lhe cabe: IfcLightFixture para ilumina\xE7\xE3o (.USERDEFINED. com o ObjectType dizendo se \xE9 teto, arandela ou piso, porque o enum da norma fala de fotometria e o desenho n\xE3o a sabe) e IfcOutlet para tomadas e dados (.POWEROUTLET. para TUG e TUE, .TELEPHONEOUTLET., .AUDIOVISUALOUTLET. e .DATAOUTLET. para telefone, TV e rede). TUG e TUE s\xE3o distin\xE7\xE3o da NBR 5410 e N\xC3O do enum: a diferen\xE7a vive no ObjectType. Ponto sem classifica\xE7\xE3o, e ponto de outra disciplina, seguem como IfcFlowTerminal. Um IfcDistributionSystem por disciplina PRESENTE (el\xE9trica, \xE1gua fria, \xE1gua quente, esgoto) agrupa a rede, e ele atravessa pavimentos: a coluna que desce tr\xEAs andares \xE9 UMA rede. O comprimento em Qto_FlowSegmentBaseQuantities \xE9 o REAL do caminho em L: o eletroduto com desn\xEDvel SOBE pela parede e CORRE pela laje (um IfcFlowSegment com dois s\xF3lidos), e o comprimento \xE9 planta + prumada \u2014 nunca a diagonal, que eletroduto embutido n\xE3o faz. A prumada mede a altura que vence, n\xE3o zero. As MEDIDAS de quadro e de terminal s\xE3o as DECLARADAS no desenho. A pe\xE7a que ningu\xE9m mediu sai no padr\xE3o \u2014 quadro 400 \xD7 300 \xD7 200 mm, terminal 100 mm c\xFAbicos \u2014 e ali a caixa \xE9 MARCA DE LUGAR, n\xE3o forma: o desenho sabe onde a pe\xE7a est\xE1 e n\xE3o sabe o modelo dela. Em nenhum dos dois casos ela vira grandeza: quadro e terminal se contam por unidade. A COTA \xE9 o CENTRO da pe\xE7a, n\xE3o a base, e o quadro N\xC3O tem rota\xE7\xE3o \u2014 a caixa \xE9 girada pelo \xE2ngulo declarado (IfcAxis2Placement3D.RefDirection); sem giro declarado ela sai alinhada aos eixos e o arquivo N\xC3O menciona dire\xE7\xE3o nenhuma. CONT\xC9M o QUADRO de distribui\xE7\xE3o (IfcFlowController, tamb\xE9m como marca de lugar \u2014 IfcDistributionBoard seria o exato, e N\xC3O \xE9 usado porque ele s\xF3 existe a partir do IFC4 ADD2 e este arquivo declara IFC4; IfcFlowController \xE9 o pai dele na taxonomia, e diz menos sem dizer errado) e os CIRCUITOS (IfcDistributionCircuit), com o quadro e os pontos de cada circuito agrupados nele \u2014 \xE9 o que liga o disjuntor ao que ele protege. Tens\xE3o, disjuntor e se\xE7\xE3o saem em Pset_OpuraEletrica com o sufixo Declarado: s\xE3o o que o projetista ESCOLHEU, e N\xC3O resultado de dimensionamento. Um Pset normativo diria o contr\xE1rio. N\xC3O CONT\xC9M conex\xE3o (joelho, t\xEA, luva), registro, nem dimensionamento de qualquer esp\xE9cie: bitola e cota s\xE3o o que algu\xE9m desenhou, e n\xE3o resultado de c\xE1lculo de queda de tens\xE3o nem de perda de carga.",
  "CONT\xC9M guarda-corpos e corrim\xE3os (IfcRailing .GUARDRAIL. / .HANDRAIL.): um s\xF3lido por trecho da polilinha \u2014 50 mm de espessura, na altura declarada, apoiado no piso do pavimento \u2014, Qto_RailingBaseQuantities.Length (comprimento da polilinha) e Pset_OpuraGuardaCorpo (material, altura, item). A espessura \xE9 MARCA DE LUGAR, n\xE3o perfil: o desenho sabe onde a prote\xE7\xE3o est\xE1 e quanto mede, n\xE3o o desenho do gradil.",
  "N\xC3O CONT\xC9M ar-condicionado, g\xE1s nem inc\xEAndio.",
  "N\xC3O CONT\xC9M ARMADURA. Nenhuma barra de a\xE7o, estribo ou cobrimento \u2014 a estrutura aqui \xE9 s\xF3 a forma do concreto.",
  'CONT\xC9M tipos de porta e janela: um IfcDoorType/IfcWindowType por ASSINATURA (kind, largura, altura, nome de projeto e item de cat\xE1logo), com IfcRelDefinesByType ligando as inst\xE2ncias \u2014 inclusive as SEM nome, agrupadas por medida, como o Revit pensa uma fam\xEDlia. O nome do tipo \xE9 o de projeto ("P1"); o item de cat\xE1logo vai em Pset_OpuraPlanta.ItemCode do tipo.',
  // ⚠️ Esta linha dizia também "nem classificação (IfcClassificationReference)",
  // e passou a MENTIR quando a classificação do catálogo entrou (linha acima).
  // A cobertura é requisito do arquivo: uma negativa falsa aqui vale menos que
  // nenhuma cobertura, porque quem lê confia nela para saber o que NÃO procurar.
  "N\xC3O CONT\xC9M tipos de parede (IfcWallType).",
  "Ambientes: o contorno do IfcSpace e a GrossFloorArea s\xE3o pelo EIXO das paredes; a NetFloorArea \xE9 a \xE1rea de PISO (contorno recuado em meia espessura, ~9% menor). O TIPO do ambiente (BANHEIRO, COZINHA_SERVICO, VARANDA, SALA_DORMITORIO, OUTRO \u2014 as classes da NBR 5410) vai no ObjectType do IfcSpace, em Pset_SpaceCommon.Reference e em Pset_OpuraPlanta.SpaceKind/SpaceKindLabel; ambiente sem tipo n\xE3o recebe nenhum dos tr\xEAs.",
  "Geometria por extrus\xE3o simples; canto de parede fechado por avan\xE7o, mas pe\xE7as estruturais se INTERPENETRAM no encontro. O corpo da parede \xE9 s\xF3lido: o v\xE3o vem da rela\xE7\xE3o IfcRelVoidsElement.",
  "Uso pretendido: COORDENA\xC7\xC3O geom\xE9trica e de identidade. As quantidades s\xE3o as do estudo preliminar e n\xE3o substituem projeto executivo."
];
var CLASSE_IFC = {
  PILAR: { entidade: "IFCCOLUMN", tipo: ".COLUMN.", qto: "Qto_ColumnBaseQuantities", superficie: "OuterSurfaceArea", loadBearing: true },
  VIGA: { entidade: "IFCBEAM", tipo: ".BEAM.", qto: "Qto_BeamBaseQuantities", superficie: "OuterSurfaceArea", loadBearing: true },
  LAJE: { entidade: "IFCSLAB", tipo: ".FLOOR.", qto: "Qto_SlabBaseQuantities", superficie: "GrossArea", loadBearing: true },
  // BORED = escavada, que é a estaca comum na obra brasileira de porte médio.
  ESTACA: { entidade: "IFCPILE", tipo: ".BORED.", extra: "$", qto: "Qto_PileBaseQuantities", superficie: "GrossSurfaceArea", loadBearing: false },
  BLOCO_COROAMENTO: { entidade: "IFCFOOTING", tipo: ".PILE_CAP.", qto: "Qto_FootingBaseQuantities", superficie: "OuterSurfaceArea", loadBearing: false },
  VIGA_FUNDACAO: { entidade: "IFCFOOTING", tipo: ".FOOTING_BEAM.", qto: "Qto_FootingBaseQuantities", superficie: "OuterSurfaceArea", loadBearing: false }
};
var PSET_COMMON_ESTRUTURA = {
  PILAR: "Pset_ColumnCommon",
  VIGA: "Pset_BeamCommon",
  LAJE: "Pset_SlabCommon"
};
var FOLGA_VAO_MM = 10;
var B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function ifcGuid(semente) {
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < semente.length; i++) {
    h1 = Math.imul(h1 ^ semente.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + semente.charCodeAt(i) + i, 2246822507) >>> 0;
  }
  let saida = "";
  for (let i = 0; i < 22; i++) {
    const misto = (h1 ^ Math.imul(h2, i + 1)) >>> 0;
    saida += B64[(misto >>> i % 24) % 64];
    h1 = Math.imul(h1 ^ misto + i, 668265263) >>> 0;
  }
  return saida;
}
function ifcGuidDeUid(uid) {
  const hex = uid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`uid fora do formato UUID: ${uid}`);
  }
  let n4 = BigInt(`0x${hex}`);
  const saida = new Array(22);
  for (let i = 21; i >= 1; i--) {
    saida[i] = B64[Number(n4 & 63n)];
    n4 >>= 6n;
  }
  saida[0] = B64[Number(n4 & 3n)];
  return saida.join("");
}
function operacaoIfcDaAbertura(o) {
  if (o.kind === "sliding") return o.hingeAtStart ? ".SLIDING_TO_LEFT." : ".SLIDING_TO_RIGHT.";
  return o.hingeAtStart !== o.swingReversed ? ".SINGLE_SWING_LEFT." : ".SINGLE_SWING_RIGHT.";
}
function s(texto) {
  return `'${escaparParaStep(texto)}'`;
}
function escaparParaStep(texto) {
  let saida = "";
  let dentroDeEscape = false;
  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i);
    if (codigo >= 32 && codigo <= 126) {
      if (dentroDeEscape) {
        saida += "\\X0\\";
        dentroDeEscape = false;
      }
      const caractere = texto[i];
      if (caractere === "'") saida += "''";
      else if (caractere === "\\") saida += "\\\\";
      else saida += caractere;
    } else {
      if (!dentroDeEscape) {
        saida += "\\X2\\";
        dentroDeEscape = true;
      }
      saida += codigo.toString(16).toUpperCase().padStart(4, "0");
    }
  }
  if (dentroDeEscape) saida += "\\X0\\";
  return saida;
}
function grausCompostos(grausDecimais) {
  const sinal = grausDecimais < 0 ? -1 : 1;
  const abs = Math.abs(grausDecimais);
  const grau = Math.floor(abs);
  const minutoDecimal = (abs - grau) * 60;
  const minuto = Math.floor(minutoDecimal);
  const segundoDecimal = (minutoDecimal - minuto) * 60;
  const segundo = Math.floor(segundoDecimal);
  const milionesimos = Math.round((segundoDecimal - segundo) * 1e6);
  return [sinal * grau || 0, sinal * minuto || 0, sinal * segundo || 0, sinal * milionesimos || 0];
}
function n(v) {
  return Number.isInteger(v) ? `${v}.` : v.toFixed(6);
}
function gerarIfc(model, o) {
  const linhas = [];
  let proximo = 1;
  const emitir = (corpo) => {
    const id = `#${proximo++}`;
    linhas.push(`${id}= ${corpo};`);
    return id;
  };
  const guid = (semente) => s(ifcGuid(`${o.hash}:${semente}`));
  const guidDe = (uid, semente) => uid ? s(ifcGuidDeUid(uid)) : guid(semente);
  const guidFilho = (uidPai, papel, semente) => uidPai ? s(ifcGuidDeUid(uidDeterministico(`${uidPai}:${papel}`))) : guid(`${papel}:${semente}`);
  const guidDoEstudo = (papel) => o.studyId ? s(ifcGuidDeUid(uidDeterministico(`${o.studyId}:${papel}`))) : guid(papel);
  const data = o.data ?? /* @__PURE__ */ new Date();
  const kernelVersion = o.kernelVersion ?? KERNEL_VERSION;
  const quant = computeQuantities(model, POLITICA_PADRAO, kernelVersion);
  const qParede = new Map(quant.paredes.map((q) => [q.wallId, q]));
  const qAbertura = new Map(quant.aberturas.map((q) => [q.openingId, q]));
  const qEstrutura = new Map(quant.estruturas.map((q) => [q.structuralId, q]));
  const qAmbiente = new Map(quant.ambientes.map((q) => [q.spaceId, q]));
  const qAgua = new Map(quant.telhados.map((q) => [q.aguaId, q]));
  const qTrecho = new Map(quant.trechos.map((q) => [q.trechoId, q]));
  const porSistema = /* @__PURE__ */ new Map();
  const porQuadro = /* @__PURE__ */ new Map();
  const porCircuito = /* @__PURE__ */ new Map();
  const aberturasEmitidas = [];
  const dirZ = emitir("IFCDIRECTION((0.,0.,1.))");
  const dirX = emitir("IFCDIRECTION((1.,0.,0.))");
  const origem = emitir("IFCCARTESIANPOINT((0.,0.,0.))");
  const eixos = emitir(`IFCAXIS2PLACEMENT3D(${origem},${dirZ},${dirX})`);
  const geo = model.georreferencia ?? null;
  const thetaRad = (geo?.rotacaoNorteDeg ?? 0) * Math.PI / 180;
  const norte = geo && geo.rotacaoNorteDeg != null ? emitir(`IFCDIRECTION((${n(Math.sin(thetaRad))},${n(Math.cos(thetaRad))}))`) : "$";
  const contexto = emitir(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${eixos},${norte})`
  );
  const subContexto = emitir(
    `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${contexto},$,.MODEL_VIEW.,$)`
  );
  const subContextoEixo = emitir(
    `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Axis','Model',*,*,*,*,${contexto},$,.GRAPH_VIEW.,$)`
  );
  const comprimento = emitir("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)");
  const area = emitir("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const volume = emitir("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const angulo = emitir("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const moeda = o.custoPorUid?.size ? emitir("IFCMONETARYUNIT('BRL')") : null;
  const unidades = emitir(
    `IFCUNITASSIGNMENT((${[comprimento, area, volume, angulo, moeda].filter(Boolean).join(",")}))`
  );
  const pessoa = emitir(`IFCPERSON($,${s(o.autor ?? "ORCACLOUD")},$,$,$,$,$,$)`);
  const organizacao = emitir(`IFCORGANIZATION($,${s("ORCACLOUD")},$,$,$)`);
  const pessoaOrg = emitir(`IFCPERSONANDORGANIZATION(${pessoa},${organizacao},$)`);
  const aplicacao = emitir(
    `IFCAPPLICATION(${organizacao},${s("2.0")},${s("OPURA Planta Inteligente")},${s("OPURA-PLANTA")})`
  );
  const historico = emitir(
    `IFCOWNERHISTORY(${pessoaOrg},${aplicacao},$,.ADDED.,$,$,$,${Math.floor(data.getTime() / 1e3)})`
  );
  const origem2d = emitir(`IFCAXIS2PLACEMENT2D(${emitir("IFCCARTESIANPOINT((0.,0.))")},$)`);
  const ctx = {
    emitir,
    guid,
    guidDe,
    guidFilho,
    historico,
    dirZ,
    dirX,
    subContexto,
    subContextoEixo,
    origem2d
  };
  const projeto = emitir(
    `IFCPROJECT(${guidDoEstudo("projeto")},${historico},${s(`${o.titulo} \u2014 vers\xE3o ${o.revisao}`)},${s(COBERTURA_IFC.join(" "))},$,$,$,(${contexto}),${unidades})`
  );
  const local = emitir(`IFCLOCALPLACEMENT($,${eixos})`);
  const refLat = geo ? `(${grausCompostos(geo.latitude).join(",")})` : "$";
  const refLon = geo ? `(${grausCompostos(geo.longitude).join(",")})` : "$";
  const refElev = geo && geo.elevacaoM != null ? n(geo.elevacaoM * 1e3) : "$";
  const terreno = emitir(
    `IFCSITE(${guidDoEstudo("terreno")},${historico},${s("Terreno")},$,$,${local},$,$,.ELEMENT.,${refLat},${refLon},${refElev},$,$)`
  );
  const localEdificio = emitir(`IFCLOCALPLACEMENT(${local},${eixos})`);
  const edificio = emitir(
    `IFCBUILDING(${guidDoEstudo("edificio")},${historico},${s(o.titulo)},$,$,${localEdificio},$,$,.ELEMENT.,$,$,$)`
  );
  emitir(`IFCRELAGGREGATES(${guid("agg-projeto")},${historico},$,$,${projeto},(${terreno}))`);
  emitir(`IFCRELAGGREGATES(${guid("agg-terreno")},${historico},$,$,${terreno},(${edificio}))`);
  const produtosPorCodigo = /* @__PURE__ */ new Map();
  const parametrosPorUid = /* @__PURE__ */ new Map();
  for (const lista of [model.walls, model.openings, model.structures ?? [], model.roofs ?? [], model.stairs ?? [], model.trechos ?? [], model.terminais ?? [], model.quadros ?? []]) {
    for (const x of lista) {
      if (x.uid && x.parametros && Object.keys(x.parametros).length > 0) parametrosPorUid.set(x.uid, { ...x.parametros });
    }
  }
  for (const [uid, calc] of o.parametrosCalculadosPorUid ?? []) {
    parametrosPorUid.set(uid, { ...parametrosPorUid.get(uid) ?? {}, ...calc });
  }
  if (o.chavesPrivadas && o.chavesPrivadas.size > 0) {
    for (const [uid, p] of [...parametrosPorUid]) {
      const filtrado = {};
      for (const k of Object.keys(p)) if (!o.chavesPrivadas.has(k)) filtrado[k] = p[k];
      if (Object.keys(filtrado).length > 0) parametrosPorUid.set(uid, filtrado);
      else parametrosPorUid.delete(uid);
    }
  }
  const psetPersonalizado = (produto, uid) => {
    const p = uid ? parametrosPorUid.get(uid) : void 0;
    if (!p) return;
    const props = Object.keys(p).sort().map((k) => {
      const v = p[k];
      if (typeof v === "number") return [k, { tipo: "IFCREAL", v }];
      if (typeof v === "boolean") return [k, { tipo: "IFCBOOLEAN", v }];
      return [k, { tipo: "IFCLABEL", v: String(v) }];
    });
    emitirPset(ctx, produto, uid, "Pset_OpuraPersonalizado", props);
  };
  const psetOpura = (produto, uid, rotulo, itemCodes = [], extras = []) => {
    const props = [...extras];
    if (uid) props.push(["ElementUid", { tipo: "IFCIDENTIFIER", v: uid }]);
    if (rotulo) props.push(["ElementLabel", { tipo: "IFCLABEL", v: rotulo }]);
    if (o.studyId) props.push(["StudyId", { tipo: "IFCIDENTIFIER", v: o.studyId }]);
    props.push(["SnapshotHash", { tipo: "IFCIDENTIFIER", v: o.hash }]);
    props.push(["SnapshotRevision", { tipo: "IFCINTEGER", v: o.revisao }]);
    props.push(["KernelVersion", { tipo: "IFCLABEL", v: kernelVersion }]);
    props.push(["QuantitiesVersion", { tipo: "IFCLABEL", v: POLITICA_PADRAO.version }]);
    if (o.aprovacao) {
      props.push(["ApprovalStatus", { tipo: "IFCLABEL", v: o.aprovacao.status }]);
      if (o.aprovacao.aprovadoPor) {
        props.push(["ApprovedBy", { tipo: "IFCLABEL", v: o.aprovacao.aprovadoPor }]);
      }
      if (o.aprovacao.aprovadoEm) {
        props.push(["ApprovedAt", { tipo: "IFCLABEL", v: o.aprovacao.aprovadoEm }]);
      }
    }
    const codigos = [...new Set(itemCodes.map((c) => c.trim()).filter(Boolean))];
    if (codigos.length) props.push(["ItemCode", { tipo: "IFCLABEL", v: codigos.join(";") }]);
    for (const codigo of codigos) {
      const lista = produtosPorCodigo.get(codigo);
      if (lista) lista.push(produto);
      else produtosPorCodigo.set(codigo, [produto]);
    }
    if (uid) {
      const custo = o.custoPorUid?.get(uid);
      if (custo !== void 0) props.push(["Cost", { tipo: "IFCMONETARYMEASURE", v: custo }]);
      const lod = o.lodPorUid?.get(uid);
      if (lod !== void 0) props.push(["LevelOfDevelopment", { tipo: "IFCINTEGER", v: lod }]);
    }
    emitirPset(ctx, produto, uid, "Pset_OpuraPlanta", props);
    psetPersonalizado(produto, uid);
  };
  const pavimentos = [];
  const produtosPorPavimento = /* @__PURE__ */ new Map();
  for (const nivel of model.levels) {
    const pontoNivel = emitir(`IFCCARTESIANPOINT((0.,0.,${n(nivel.elevationMm)}))`);
    const eixoNivel = emitir(`IFCAXIS2PLACEMENT3D(${pontoNivel},${dirZ},${dirX})`);
    const localNivel = emitir(`IFCLOCALPLACEMENT(${localEdificio},${eixoNivel})`);
    const pavimento = emitir(
      `IFCBUILDINGSTOREY(${guidDe(nivel.uid, `pav-${nivel.id}`)},${historico},${s(nivel.name)},$,$,${localNivel},$,$,.ELEMENT.,${n(nivel.elevationMm)})`
    );
    pavimentos.push(pavimento);
    const produtos = [];
    produtosPorPavimento.set(nivel.id, produtos);
    const paredesDoNivel = model.walls.filter((x) => x.levelId === nivel.id);
    for (const w of paredesDoNivel) {
      const { produto, localParede, avA, comp } = emitirParede(w, ctx, localNivel, paredesDoNivel);
      produtos.push(produto);
      emitirMaterialDaParede(w, produto, ctx);
      const externa = paredeEhExterna(model, w);
      const props = [];
      if (externa !== null) props.push(["IsExternal", { tipo: "IFCBOOLEAN", v: externa }]);
      if (w.camadas?.length) {
        props.push([
          "LoadBearing",
          { tipo: "IFCBOOLEAN", v: w.camadas.some((c) => c.funcao === "ESTRUTURAL") }
        ]);
      }
      emitirPset(ctx, produto, w.uid, "Pset_WallCommon", props);
      psetOpura(produto, w.uid, w.uid ? rotuloCurto(w.uid, "wall") : void 0, (w.camadas ?? []).map((c) => c.itemCode));
      emitirQtoParede(ctx, produto, w, qParede.get(w.id));
      for (const abertura of model.openings.filter((x) => x.wallId === w.id)) {
        const preenchimento = emitirAbertura(abertura, w, { produto, localParede, avA, comp }, ctx, {
          externa,
          quant: qAbertura.get(abertura.id),
          psetOpura
        });
        if (preenchimento) {
          produtos.push(preenchimento);
          aberturasEmitidas.push({ produto: preenchimento, o: abertura });
        }
      }
    }
    for (const peca of (model.structures ?? []).filter((x) => x.levelId === nivel.id)) {
      const produto = emitirEstrutura(peca, ctx, localNivel);
      produtos.push(produto);
      const classe = CLASSE_IFC[peca.kind];
      const pset = PSET_COMMON_ESTRUTURA[peca.kind];
      if (pset) emitirPset(ctx, produto, peca.uid, pset, [["LoadBearing", { tipo: "IFCBOOLEAN", v: classe.loadBearing }]]);
      psetOpura(produto, peca.uid, peca.uid ? rotuloCurto(peca.uid, "structural") : void 0);
      emitirQtoEstrutura(ctx, produto, peca, qEstrutura.get(peca.id));
    }
    for (const espaco of model.spaces.filter((x) => x.levelId === nivel.id)) {
      const tipoDeAmbiente = espaco.labelUid && model.labels.find((l) => l.uid === espaco.labelUid)?.tipoDeAmbiente || null;
      const produto = emitirAmbiente(espaco, nivel.defaultHeightMm, ctx, localNivel, tipoDeAmbiente);
      produtos.push(produto);
      emitirPset(ctx, produto, espaco.labelUid, "Pset_SpaceCommon", [
        ["IsExternal", { tipo: "IFCBOOLEAN", v: false }],
        // `Reference` é "a referência do tipo deste espaço no projeto" — é
        // exatamente o que a classe da NBR 5410 é. Só quando declarada.
        ...tipoDeAmbiente ? [["Reference", { tipo: "IFCIDENTIFIER", v: tipoDeAmbiente }]] : []
      ]);
      psetOpura(
        produto,
        espaco.labelUid,
        espaco.labelUid ? rotuloCurto(espaco.labelUid, "label") : void 0,
        [],
        tipoDeAmbiente ? [
          ["SpaceKind", { tipo: "IFCLABEL", v: tipoDeAmbiente }],
          ["SpaceKindLabel", { tipo: "IFCLABEL", v: ROTULO_DO_TIPO_DE_AMBIENTE[tipoDeAmbiente] }]
        ] : []
      );
      emitirQtoAmbiente(ctx, produto, espaco, nivel.defaultHeightMm, qAmbiente.get(espaco.id));
      emitirRevestimentos(ctx, produto, espaco, qAmbiente.get(espaco.id), psetOpura);
    }
    for (const escada of (model.stairs ?? []).filter((x) => x.levelId === nivel.id)) {
      const produto = emitirEscada(model, escada, ctx, localNivel);
      if (!produto) continue;
      produtos.push(produto);
      psetOpura(produto, escada.uid, escada.uid ? rotuloCurto(escada.uid, "stair") : void 0);
    }
    const aguasDoNivel = (model.roofs ?? []).filter((r) => r.levelId === nivel.id);
    if (aguasDoNivel.length > 0) {
      produtos.push(emitirTelhado(aguasDoNivel, nivel, ctx, localNivel, { qAgua, psetOpura }));
    }
    for (const t of (model.trechos ?? []).filter((x) => x.levelId === nivel.id)) {
      const produto = emitirTrecho(t, ctx, localNivel, nivel.defaultHeightMm);
      produtos.push(produto);
      porSistema.set(t.disciplina, [...porSistema.get(t.disciplina) ?? [], produto]);
      psetOpura(produto, t.uid, rotuloCurto(t.uid, "trecho"));
      emitirPset(ctx, produto, t.uid, "Pset_OpuraInstalacao", [
        ["Disciplina", { tipo: "IFCLABEL", v: t.disciplina }],
        ["BitolaMm", { tipo: "IFCINTEGER", v: t.bitolaMm }]
      ]);
      const qt = qTrecho.get(t.id);
      if (qt) {
        emitirQto(ctx, produto, t.uid, "Qto_FlowSegmentBaseQuantities", [
          {
            classe: "IFCQUANTITYLENGTH",
            nome: "Length",
            valor: qt.comprimentoM * M,
            formula: qt.formula
          }
        ]);
      }
      if (t.itemCode) {
        produtosPorCodigo.set(t.itemCode, [...produtosPorCodigo.get(t.itemCode) ?? [], produto]);
      }
    }
    for (const c of (model.componentes ?? []).filter((x) => x.levelId === nivel.id && !ehConjunto(x.tipoId))) {
      const produto = emitirComponente(c, ctx, localNivel);
      produtos.push(produto);
      psetOpura(produto, c.uid, rotuloCurto(c.uid, "componente"));
      emitirPset(ctx, produto, c.uid, "Pset_OpuraComponente", [
        ["TipoId", { tipo: "IFCLABEL", v: c.tipoId }],
        ["Familia", { tipo: "IFCLABEL", v: c.familia }],
        ["Sugerido", { tipo: "IFCBOOLEAN", v: !!c.sugerido }]
      ]);
    }
    for (const g of (model.guardaCorpos ?? []).filter((x) => x.levelId === nivel.id)) {
      const produto = emitirGuardaCorpo(g, ctx, localNivel);
      produtos.push(produto);
      psetOpura(produto, g.uid, rotuloCurto(g.uid, "guardaCorpo"));
      emitirQto(ctx, produto, g.uid, "Qto_RailingBaseQuantities", [
        { classe: "IFCQUANTITYLENGTH", nome: "Length", valor: comprimentoDoGuardaCorpo(g), formula: "\u03A3 comprimento dos trechos da polilinha" }
      ]);
      emitirPset(ctx, produto, g.uid, "Pset_OpuraGuardaCorpo", [
        ["Tipo", { tipo: "IFCLABEL", v: g.tipo }],
        ["Material", { tipo: "IFCLABEL", v: g.material }],
        ["AlturaMm", { tipo: "IFCREAL", v: g.alturaMm }],
        ["ItemCode", { tipo: "IFCLABEL", v: g.itemCode }],
        ["Sugerido", { tipo: "IFCBOOLEAN", v: !!g.sugerido }]
      ]);
      if (g.itemCode) produtosPorCodigo.set(g.itemCode, [...produtosPorCodigo.get(g.itemCode) ?? [], produto]);
    }
    for (const t of (model.terminais ?? []).filter((x) => x.levelId === nivel.id)) {
      const produto = emitirTerminal(t, ctx, localNivel);
      produtos.push(produto);
      porSistema.set(t.disciplina, [...porSistema.get(t.disciplina) ?? [], produto]);
      psetOpura(produto, t.uid, rotuloCurto(t.uid, "terminal"));
      emitirPset(ctx, produto, t.uid, "Pset_OpuraInstalacao", [
        ["Disciplina", { tipo: "IFCLABEL", v: t.disciplina }],
        ["Tipo", { tipo: "IFCLABEL", v: t.tipo }],
        // A carga DECLARADA. Ausente quando ninguém informou — e ausente é
        // diferente de zero, então a propriedade simplesmente não sai.
        ...t.potenciaW != null ? [["PotenciaW", { tipo: "IFCINTEGER", v: t.potenciaW }]] : []
      ]);
      if (t.circuitoId) {
        porCircuito.set(t.circuitoId, [...porCircuito.get(t.circuitoId) ?? [], produto]);
      }
      if (t.itemCode) {
        produtosPorCodigo.set(t.itemCode, [...produtosPorCodigo.get(t.itemCode) ?? [], produto]);
      }
    }
    for (const q of (model.quadros ?? []).filter((x) => x.levelId === nivel.id)) {
      const produto = emitirQuadro(q, ctx, localNivel);
      produtos.push(produto);
      porQuadro.set(q.id, produto);
      porSistema.set("ELETRICA", [...porSistema.get("ELETRICA") ?? [], produto]);
      psetOpura(produto, q.uid, rotuloCurto(q.uid, "quadro"));
    }
    if (produtos.length > 0) {
      emitir(
        `IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`cont-${nivel.id}`)},${historico},$,$,(${produtos.join(",")}),${pavimento})`
      );
    }
  }
  if (pavimentos.length > 0) {
    emitir(
      `IFCRELAGGREGATES(${guid("agg-edificio")},${historico},$,$,${edificio},(${pavimentos.join(",")}))`
    );
  }
  for (const [disciplina, membros] of porSistema) {
    if (membros.length === 0) continue;
    const sistema = emitir(
      `IFCDISTRIBUTIONSYSTEM(${guid(`sist-${disciplina}`)},${historico},${s(disciplina)},$,$,$,${SISTEMA_IFC[disciplina] ?? "$"})`
    );
    emitir(
      `IFCRELASSIGNSTOGROUP(${guid(`rel-sist-${disciplina}`)},${historico},$,$,(${membros.join(",")}),$,${sistema})`
    );
  }
  for (const c of model.circuitos ?? []) {
    const membros = [...porCircuito.get(c.id) ?? []];
    const quadro = porQuadro.get(c.quadroId);
    if (quadro) membros.push(quadro);
    if (membros.length === 0) continue;
    const circuito = emitir(
      `IFCDISTRIBUTIONCIRCUIT(${guidDe(c.uid, `circuito-${c.id}`)},${historico},${s(c.nome)},$,$,$,.ELECTRICAL.)`
    );
    emitir(
      `IFCRELASSIGNSTOGROUP(${guidDe(uidDeterministico(`${c.uid}:rel`), `rel-cir-${c.id}`)},${historico},$,$,(${membros.join(",")}),$,${circuito})`
    );
    emitirPset(ctx, circuito, c.uid, "Pset_OpuraEletrica", [
      ...c.tipo ? [["Tipo", { tipo: "IFCLABEL", v: c.tipo }]] : [],
      ...c.tensaoV != null ? [["TensaoV", { tipo: "IFCINTEGER", v: c.tensaoV }]] : [],
      ...c.disjuntorA != null ? [["DisjuntorA_Declarado", { tipo: "IFCINTEGER", v: c.disjuntorA }]] : [],
      ...c.secaoMm2 != null ? [["SecaoMm2_Declarada", { tipo: "IFCREAL", v: c.secaoMm2 }]] : []
    ]);
  }
  emitirTiposDeEsquadria(aberturasEmitidas, ctx, psetOpura);
  emitirClassificacao(ctx, produtosPorCodigo, o.fonteDaClassificacao ?? "SINAPI");
  if (geo?.projetada) {
    const crs = emitir(
      `IFCPROJECTEDCRS(${s(geo.projetada.crs)},$,$,$,$,$,${comprimento})`
    );
    emitir(
      `IFCMAPCONVERSION(${contexto},${crs},${n(geo.projetada.lesteM)},${n(geo.projetada.norteM)},${geo.elevacaoM != null ? n(geo.elevacaoM) : "0."},${n(Math.cos(thetaRad))},${n(Math.sin(thetaRad))},0.001)`
    );
  }
  const carimbo = data.toISOString().replace(/\.\d{3}Z$/, "");
  const cabecalho = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((${s("ViewDefinition [CoordinationView]")},${s(`COBERTURA PARCIAL: ${COBERTURA_IFC.join(" | ")}`)}),${s("2;1")});
FILE_NAME(${s(`${o.titulo} v${o.revisao}`)},${s(carimbo)},(${s(o.autor ?? "ORCACLOUD")}),(${s("ORCACLOUD")}),${s("OPURA Planta Inteligente")},${s("OPURA")},${s(o.hash)});
FILE_SCHEMA((${s("IFC4")}));
ENDSEC;
DATA;
`;
  return `${cabecalho}${linhas.join("\n")}
ENDSEC;
END-ISO-10303-21;
`;
}
function emitirClassificacao(ctx, produtosPorCodigo, fonte) {
  if (produtosPorCodigo.size === 0) return;
  const { emitir, guid, historico } = ctx;
  const classificacao = emitir(
    `IFCCLASSIFICATION(${s("ORCACLOUD")},$,$,${s(fonte)},$,$,$)`
  );
  for (const codigo of [...produtosPorCodigo.keys()].sort()) {
    const produtos = [...new Set(produtosPorCodigo.get(codigo))];
    const referencia = emitir(
      `IFCCLASSIFICATIONREFERENCE($,${s(codigo)},${s(codigo)},${classificacao},$,$)`
    );
    emitir(
      `IFCRELASSOCIATESCLASSIFICATION(${guid(`class-${fonte}-${codigo}`)},${historico},$,$,(${produtos.join(",")}),${referencia})`
    );
  }
}
function valorIfc(v) {
  switch (v.tipo) {
    case "IFCBOOLEAN":
      return `IFCBOOLEAN(${v.v ? ".T." : ".F."})`;
    case "IFCINTEGER":
      return `IFCINTEGER(${Math.trunc(v.v)})`;
    case "IFCAREAMEASURE":
    case "IFCPLANEANGLEMEASURE":
    case "IFCREAL":
    case "IFCPOSITIVELENGTHMEASURE":
    case "IFCMONETARYMEASURE":
      return `${v.tipo}(${n(v.v)})`;
    default:
      return `${v.tipo}(${s(v.v)})`;
  }
}
function emitirPset(ctx, produto, uidPai, nome, props) {
  if (props.length === 0) return;
  const { emitir, guidFilho, historico } = ctx;
  const refs = props.map(
    ([nomeProp, v]) => emitir(`IFCPROPERTYSINGLEVALUE(${s(nomeProp)},$,${valorIfc(v)},$)`)
  );
  const pset = emitir(
    `IFCPROPERTYSET(${guidFilho(uidPai, nome, produto)},${historico},${s(nome)},$,(${refs.join(",")}))`
  );
  emitir(
    `IFCRELDEFINESBYPROPERTIES(${guidFilho(uidPai, `rel-${nome}`, produto)},${historico},$,$,(${produto}),${pset})`
  );
}
function emitirQto(ctx, produto, uidPai, nome, grandezas) {
  const validas = grandezas.filter((g) => Number.isFinite(g.valor));
  if (validas.length === 0) return;
  const { emitir, guidFilho, historico } = ctx;
  const refs = validas.map(
    (g) => emitir(`${g.classe}(${s(g.nome)},$,$,${n(g.valor)},${g.formula ? s(g.formula) : "$"})`)
  );
  const qto = emitir(
    `IFCELEMENTQUANTITY(${guidFilho(uidPai, nome, produto)},${historico},${s(nome)},$,$,(${refs.join(",")}))`
  );
  emitir(
    `IFCRELDEFINESBYPROPERTIES(${guidFilho(uidPai, `rel-${nome}`, produto)},${historico},$,$,(${produto}),${qto})`
  );
}
var M = 1e3;
function emitirQtoParede(ctx, produto, w, q) {
  if (!q) return;
  emitirQto(ctx, produto, w.uid, "Qto_WallBaseQuantities", [
    { classe: "IFCQUANTITYLENGTH", nome: "Length", valor: wallLength(w) },
    { classe: "IFCQUANTITYLENGTH", nome: "Width", valor: w.thicknessMm },
    { classe: "IFCQUANTITYLENGTH", nome: "Height", valor: w.heightMm },
    { classe: "IFCQUANTITYAREA", nome: "GrossSideArea", valor: q.areaFaceBrutaM2 },
    { classe: "IFCQUANTITYAREA", nome: "NetSideArea", valor: q.areaFaceLiquidaM2 },
    { classe: "IFCQUANTITYVOLUME", nome: "GrossVolume", valor: q.areaFaceBrutaM2 * q.espessuraM },
    { classe: "IFCQUANTITYVOLUME", nome: "NetVolume", valor: q.volumeM3 }
  ]);
}
function emitirQtoAbertura(ctx, produto, o, q) {
  emitirQto(ctx, produto, o.uid, o.kind === "window" ? "Qto_WindowBaseQuantities" : "Qto_DoorBaseQuantities", [
    { classe: "IFCQUANTITYLENGTH", nome: "Width", valor: o.widthMm },
    { classe: "IFCQUANTITYLENGTH", nome: "Height", valor: o.heightMm },
    { classe: "IFCQUANTITYAREA", nome: "Area", valor: q?.areaM2 ?? o.widthMm * o.heightMm / (M * M) }
  ]);
}
function emitirQtoEstrutura(ctx, produto, peca, q) {
  if (!q) return;
  const classe = CLASSE_IFC[peca.kind];
  const forma = FORMA_ESTRUTURAL[peca.kind];
  const grandezas = [];
  if (forma === "AREA") {
    grandezas.push({ classe: "IFCQUANTITYLENGTH", nome: "Depth", valor: peca.alturaMm });
    grandezas.push({ classe: "IFCQUANTITYAREA", nome: "GrossArea", valor: q.areaPlantaM2 });
  } else {
    grandezas.push({
      classe: "IFCQUANTITYLENGTH",
      nome: "Length",
      valor: forma === "LINHA" ? q.comprimentoM * M : peca.alturaMm
    });
    grandezas.push({ classe: "IFCQUANTITYAREA", nome: classe.superficie, valor: q.areaFormaM2 });
  }
  grandezas.push(
    { classe: "IFCQUANTITYVOLUME", nome: "GrossVolume", valor: q.volumeConcretoM3 + q.volumeCedidoM3, formula: q.formula },
    { classe: "IFCQUANTITYVOLUME", nome: "NetVolume", valor: q.volumeConcretoM3, formula: q.formula }
  );
  emitirQto(ctx, produto, peca.uid, classe.qto, grandezas);
}
function emitirQtoAmbiente(ctx, produto, espaco, peDireitoMm, q) {
  if (!q) return;
  emitirQto(ctx, produto, espaco.labelUid, "Qto_SpaceBaseQuantities", [
    { classe: "IFCQUANTITYLENGTH", nome: "Height", valor: peDireitoMm },
    { classe: "IFCQUANTITYLENGTH", nome: "GrossPerimeter", valor: q.perimetroEixoM * M },
    // EIXO × PISO — a distinção que decide o orçamento (ver `quantities.ts`).
    { classe: "IFCQUANTITYAREA", nome: "GrossFloorArea", valor: q.areaEixoM2 },
    { classe: "IFCQUANTITYAREA", nome: "NetFloorArea", valor: q.areaPisoM2, formula: q.formulaAreaPiso }
  ]);
}
function emitirEscada(model, e, ctx, localNivel) {
  const { emitir, guidDe, historico, dirZ, dirX, subContexto } = ctx;
  const fatias = fatiasDaEscada(model, e);
  if (fatias.length === 0) return null;
  const med = medirEscada(model, e);
  const rampa = e.tipo === "RAMPA";
  const solidos = [];
  let volumeMm3 = 0;
  for (const f of fatias) {
    const p0 = f.cantos[0];
    const p1 = f.cantos[1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const comp = Math.hypot(dx, dy);
    if (comp === 0) continue;
    const dir = { x: dx / comp, y: dy / comp };
    const nrm = { x: dir.y, y: -dir.x };
    const largura = Math.hypot(f.cantos[3].x - p0.x, f.cantos[3].y - p0.y);
    if (largura === 0) continue;
    const xs = f.cantos.map((c) => (c.x - p0.x) * dir.x + (c.y - p0.y) * dir.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const cotaA = f.cotasMm[0];
    const cotaB = f.cotasMm[1];
    if (xMax - xMin <= 0) continue;
    const perfil = [
      { x: xMin, y: 0 },
      { x: xMax, y: 0 },
      { x: xMax, y: cotaB },
      { x: xMin, y: cotaA }
    ];
    volumeMm3 += (xMax - xMin) * (cotaA + cotaB) / 2 * largura;
    const pontos = perfil.map((q) => emitir(`IFCCARTESIANPOINT((${n(q.x)},${n(q.y)}))`));
    const contorno = emitir(`IFCPOLYLINE((${pontos.join(",")},${pontos[0]}))`);
    const perfilDef = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${contorno})`);
    const origem = emitir(`IFCCARTESIANPOINT((${n(p0.x)},${n(p0.y)},0.))`);
    const eixoZ = emitir(`IFCDIRECTION((${n(nrm.x)},${n(nrm.y)},0.))`);
    const eixoX = emitir(`IFCDIRECTION((${n(dir.x)},${n(dir.y)},0.))`);
    const placement = emitir(`IFCAXIS2PLACEMENT3D(${origem},${eixoZ},${eixoX})`);
    const solido = emitir(`IFCEXTRUDEDAREASOLID(${perfilDef},${placement},${dirZ},${n(largura)})`);
    solidos.push(solido);
  }
  if (solidos.length === 0) return null;
  const forma = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solidos.join(",")}))`);
  const pds = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  const eixo = emitir(`IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},${dirZ},${dirX})`);
  const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixo})`);
  const voltas = e.pontos.length - 2;
  const tipo = voltas <= 0 ? rampa ? ".STRAIGHT_RUN_RAMP." : ".STRAIGHT_RUN_STAIR." : voltas === 1 ? rampa ? ".QUARTER_TURN_RAMP." : ".QUARTER_TURN_STAIR." : voltas === 2 ? rampa ? ".HALF_TURN_RAMP." : ".HALF_TURN_STAIR." : ".NOTDEFINED.";
  const nome = e.rotulo || (rampa ? "Rampa" : `Escada ${med.degraus} degraus`);
  const rotulo = e.uid ? rotuloCurto(e.uid, "stair") : void 0;
  const produto = emitir(
    `${rampa ? "IFCRAMP" : "IFCSTAIR"}(${guidDe(e.uid, `escada-${e.id}`)},${historico},${s(nome)},$,$,${local},${pds},${rotulo ? s(rotulo) : "$"},${tipo})`
  );
  if (rampa) {
    emitirPset(ctx, produto, e.uid, "Pset_RampCommon", [
      ["IsExternal", { tipo: "IFCBOOLEAN", v: false }],
      ["RequiredSlope", { tipo: "IFCPLANEANGLEMEASURE", v: Math.atan(med.inclinacaoPct / 100) }]
    ]);
    emitirQto(ctx, produto, e.uid, "Qto_RampBaseQuantities", [
      { classe: "IFCQUANTITYLENGTH", nome: "Length", valor: med.comprimentoInclinadoMm },
      { classe: "IFCQUANTITYLENGTH", nome: "Width", valor: e.larguraMm },
      { classe: "IFCQUANTITYAREA", nome: "GrossArea", valor: med.areaPlantaMm2 / 1e6 },
      { classe: "IFCQUANTITYAREA", nome: "NetArea", valor: med.areaPlantaMm2 / 1e6 },
      { classe: "IFCQUANTITYVOLUME", nome: "GrossVolume", valor: volumeMm3 / 1e9 },
      { classe: "IFCQUANTITYVOLUME", nome: "NetVolume", valor: volumeMm3 / 1e9 }
    ]);
  } else {
    emitirPset(ctx, produto, e.uid, "Pset_StairCommon", [
      ["IsExternal", { tipo: "IFCBOOLEAN", v: false }],
      ["NumberOfRiser", { tipo: "IFCINTEGER", v: med.degraus }],
      ["NumberOfTreads", { tipo: "IFCINTEGER", v: Math.max(0, med.degraus - 1) }],
      ["RiserHeight", { tipo: "IFCPOSITIVELENGTHMEASURE", v: med.espelhoMm }],
      ["TreadLength", { tipo: "IFCPOSITIVELENGTHMEASURE", v: med.pisoMm }]
    ]);
    emitirQto(ctx, produto, e.uid, "Qto_StairBaseQuantities", [
      { classe: "IFCQUANTITYLENGTH", nome: "Length", valor: med.comprimentoInclinadoMm },
      { classe: "IFCQUANTITYVOLUME", nome: "GrossVolume", valor: volumeMm3 / 1e9 },
      { classe: "IFCQUANTITYVOLUME", nome: "NetVolume", valor: volumeMm3 / 1e9 }
    ]);
  }
  return produto;
}
function emitirTelhado(aguas, nivel, ctx, localNivel, extras) {
  const { emitir, guid, guidDe, guidFilho, historico, dirZ, dirX, subContexto } = ctx;
  const lajes = [];
  let projetadaM2 = 0;
  let realM2 = 0;
  for (const r of aguas) {
    const plano = planoDaAgua(r);
    const nrm = normalDaAgua(r);
    const med = extras.qAgua.get(r.id) ?? medirAgua(r);
    projetadaM2 += med.areaProjetadaM2;
    realM2 += med.areaRealM2;
    const perfil = perfilDaAguaNoPlano(r);
    const pontos = perfil.map((p) => emitir(`IFCCARTESIANPOINT((${n(p.x)},${n(p.y)}))`));
    const contorno = emitir(`IFCPOLYLINE((${pontos.join(",")},${pontos[0]}))`);
    const perfilDef = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${contorno})`);
    const o = plano.origem;
    const origem = emitir(
      `IFCCARTESIANPOINT((${n(o.x - nrm.x * r.espessuraMm)},${n(o.y - nrm.y * r.espessuraMm)},${n(r.baseMm - nrm.z * r.espessuraMm)}))`
    );
    const eixoZ = emitir(`IFCDIRECTION((${n(nrm.x)},${n(nrm.y)},${n(nrm.z)}))`);
    const eixoX = emitir(`IFCDIRECTION((${n(plano.eixoX.x)},${n(plano.eixoX.y)},0.))`);
    const placement = emitir(`IFCAXIS2PLACEMENT3D(${origem},${eixoZ},${eixoX})`);
    const eixoPerfil = emitir(
      `IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},${dirZ},${dirX})`
    );
    const solido = emitir(`IFCEXTRUDEDAREASOLID(${perfilDef},${eixoPerfil},${dirZ},${n(r.espessuraMm)})`);
    const forma = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
    const pds = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
    const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${placement})`);
    const rotulo = r.uid ? rotuloCurto(r.uid, "roof") : void 0;
    const laje = emitir(
      `IFCSLAB(${guidDe(r.uid, `agua-${r.id}`)},${historico},${s(`\xC1gua ${r.inclinacaoPct}%`)},$,$,${local},${pds},${rotulo ? s(rotulo) : "$"},.ROOF.)`
    );
    lajes.push(laje);
    emitirPset(ctx, laje, r.uid, "Pset_SlabCommon", [
      ["IsExternal", { tipo: "IFCBOOLEAN", v: true }],
      ["PitchAngle", { tipo: "IFCPLANEANGLEMEASURE", v: Math.atan(plano.tg) }]
    ]);
    extras.psetOpura(laje, r.uid, rotulo);
    emitirQto(ctx, laje, r.uid, "Qto_SlabBaseQuantities", [
      { classe: "IFCQUANTITYLENGTH", nome: "Depth", valor: r.espessuraMm },
      { classe: "IFCQUANTITYLENGTH", nome: "Perimeter", valor: med.comprimentoBeiralM * 1e3 * 0 + perimetroMm(r) },
      // ÁREA REAL, não projetada: é a superfície da laje inclinada.
      { classe: "IFCQUANTITYAREA", nome: "GrossArea", valor: med.areaRealM2, formula: med.formula },
      { classe: "IFCQUANTITYAREA", nome: "NetArea", valor: med.areaRealM2 },
      { classe: "IFCQUANTITYVOLUME", nome: "GrossVolume", valor: med.areaRealM2 * r.espessuraMm / 1e3 },
      { classe: "IFCQUANTITYVOLUME", nome: "NetVolume", valor: med.areaRealM2 * r.espessuraMm / 1e3 }
    ]);
  }
  const tipo = aguas.length === 1 ? aguas[0].inclinacaoPct === 0 ? ".FLAT_ROOF." : ".SHED_ROOF." : ".NOTDEFINED.";
  const eixoTelhado = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},${dirZ},${dirX})`
  );
  const localTelhado = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoTelhado})`);
  const telhado = emitir(
    `IFCROOF(${guidFilho(nivel.uid, "telhado", `telhado-${nivel.id}`)},${historico},${s(`Telhado \u2014 ${nivel.name}`)},$,$,${localTelhado},$,$,${tipo})`
  );
  emitir(`IFCRELAGGREGATES(${guid(`agg-telhado-${nivel.id}`)},${historico},$,$,${telhado},(${lajes.join(",")}))`);
  emitirPset(ctx, telhado, void 0, "Pset_RoofCommon", [
    ["IsExternal", { tipo: "IFCBOOLEAN", v: true }],
    ["ProjectedArea", { tipo: "IFCAREAMEASURE", v: projetadaM2 }],
    ["TotalArea", { tipo: "IFCAREAMEASURE", v: realM2 }]
  ]);
  emitirQto(ctx, telhado, void 0, "Qto_RoofBaseQuantities", [
    { classe: "IFCQUANTITYAREA", nome: "GrossArea", valor: realM2 },
    { classe: "IFCQUANTITYAREA", nome: "NetArea", valor: realM2 },
    { classe: "IFCQUANTITYAREA", nome: "ProjectedArea", valor: projetadaM2 }
  ]);
  return telhado;
}
function perimetroMm(r) {
  let total = 0;
  for (let i = 0; i < r.pontos.length; i++) {
    const a = r.pontos[i];
    const b = r.pontos[(i + 1) % r.pontos.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}
function emitirParede(w, ctx, localNivel, paredesDoNivel) {
  const { emitir, guidDe, historico, dirZ, dirX, subContexto } = ctx;
  const avA = extensaoDeCanto(paredesDoNivel, w, "a");
  const avB = extensaoDeCanto(paredesDoNivel, w, "b");
  const comp = wallLength(w) + avA + avB;
  const perfil = emitir(
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,${ctx.origem2d},${n(comp)},${n(w.thicknessMm)})`
  );
  const angulo = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
  const desloc = (avB - avA) / 2;
  const meioX = (w.a.x + w.b.x) / 2 + Math.cos(angulo) * desloc;
  const meioY = (w.a.y + w.b.y) / 2 + Math.sin(angulo) * desloc;
  const direcao = emitir(
    `IFCDIRECTION((${n(Math.cos(angulo))},${n(Math.sin(angulo))},0.))`
  );
  const centro = emitir(`IFCCARTESIANPOINT((${n(meioX)},${n(meioY)},0.))`);
  const eixoParede = emitir(`IFCAXIS2PLACEMENT3D(${centro},${dirZ},${direcao})`);
  const eixoPerfil = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},${dirZ},${dirX})`
  );
  const solido = emitir(
    `IFCEXTRUDEDAREASOLID(${perfil},${eixoPerfil},${dirZ},${n(w.heightMm)})`
  );
  const forma = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
  const eixoA = emitir(`IFCCARTESIANPOINT((${n(-comp / 2 + avA)},0.))`);
  const eixoB = emitir(`IFCCARTESIANPOINT((${n(comp / 2 - avB)},0.))`);
  const linhaDoEixo = emitir(`IFCPOLYLINE((${eixoA},${eixoB}))`);
  const formaEixo = emitir(
    `IFCSHAPEREPRESENTATION(${ctx.subContextoEixo},'Axis','Curve2D',(${linhaDoEixo}))`
  );
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${formaEixo},${forma}))`);
  const localParede = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoParede})`);
  const tag = w.uid ? s(rotuloCurto(w.uid, "wall")) : "$";
  const produto = emitir(
    // CORTINA DE VIDRO (P2.20): a pele de vidro é IfcCurtainWall, com a mesma
    // geometria (o volume é o do plano dos montantes). O brise não sai no IFC.
    (w.cortina ? `IFCCURTAINWALL(` : `IFCWALL(`) + `${guidDe(w.uid, `par-${w.id}`)},${historico},${s(
      w.cortina ? `Cortina de ${w.cortina.painel.toLowerCase()} \xB7 m\xF3dulo ${w.cortina.moduloMm} mm` : w.camadas?.length ? `Parede ${w.thicknessMm} mm (${w.camadas.length} camadas)` : `Parede ${w.thicknessMm} mm`
    )},$,$,${localParede},${produtoForma},${tag},.NOTDEFINED.)`
  );
  return { produto, localParede, avA, comp };
}
function emitirAbertura(o, w, parede, ctx, extras) {
  const { emitir, guid, guidDe, historico, dirZ, dirX, subContexto } = ctx;
  const nome = nomeDoTipoDeAbertura(o.kind, o.embutida);
  const rotulo = o.uid ? rotuloCurto(o.uid, "opening") : void 0;
  const xVao = -parede.comp / 2 + parede.avA + o.offsetMm + o.widthMm / 2;
  const pontoVao = emitir(`IFCCARTESIANPOINT((${n(xVao)},0.,${n(o.sillMm)}))`);
  const eixoVao = emitir(`IFCAXIS2PLACEMENT3D(${pontoVao},${dirZ},${dirX})`);
  const localVao = emitir(`IFCLOCALPLACEMENT(${parede.localParede},${eixoVao})`);
  const perfilVao = emitir(
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,${ctx.origem2d},${n(o.widthMm)},${n(w.thicknessMm + 2 * FOLGA_VAO_MM)})`
  );
  const eixoPerfilVao = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},${dirZ},${dirX})`
  );
  const solidoVao = emitir(`IFCEXTRUDEDAREASOLID(${perfilVao},${eixoPerfilVao},${dirZ},${n(o.heightMm)})`);
  const formaVao = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solidoVao}))`);
  const pdsVao = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${formaVao}))`);
  const vao = emitir(
    `IFCOPENINGELEMENT(${ctx.guidFilho(o.uid, "vao", `vao-${o.id}`)},${historico},${s(`V\xE3o \u2014 ${nome}`)},$,$,${localVao},${pdsVao},$,.OPENING.)`
  );
  emitir(`IFCRELVOIDSELEMENT(${guid(`voids-${o.uid ?? o.id}`)},${historico},$,$,${parede.produto},${vao})`);
  if (o.kind === "passage") return null;
  const gira = o.kind !== "sliding" && o.swingReversed;
  const dirFolha = gira ? emitir("IFCDIRECTION((-1.,0.,0.))") : dirX;
  const eixoFolha = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},${dirZ},${dirFolha})`
  );
  const localFolha = emitir(`IFCLOCALPLACEMENT(${localVao},${eixoFolha})`);
  const perfilFolha = emitir(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${ctx.origem2d},${n(o.widthMm)},${n(w.thicknessMm)})`);
  const eixoPerfilFolha = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},${dirZ},${dirX})`
  );
  const solidoFolha = emitir(
    `IFCEXTRUDEDAREASOLID(${perfilFolha},${eixoPerfilFolha},${dirZ},${n(o.heightMm)})`
  );
  const formaFolha = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solidoFolha}))`);
  const pdsFolha = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${formaFolha}))`);
  const tag = rotulo ? s(rotulo) : "$";
  const produto = o.kind === "window" ? emitir(
    `IFCWINDOW(${guidDe(o.uid, `abr-${o.id}`)},${historico},${s(`${nome} ${o.widthMm}\xD7${o.heightMm}`)},$,$,${localFolha},${pdsFolha},${tag},${n(o.heightMm)},${n(o.widthMm)},.WINDOW.,.NOTDEFINED.,$)`
  ) : emitir(
    `IFCDOOR(${guidDe(o.uid, `abr-${o.id}`)},${historico},${s(`${nome} ${o.widthMm}\xD7${o.heightMm}`)},$,$,${localFolha},${pdsFolha},${tag},${n(o.heightMm)},${n(o.widthMm)},.DOOR.,${operacaoIfcDaAbertura(o)},$)`
  );
  emitir(`IFCRELFILLSELEMENT(${guid(`fills-${o.uid ?? o.id}`)},${historico},$,$,${vao},${produto})`);
  if (extras.externa !== null) {
    emitirPset(ctx, produto, o.uid, o.kind === "window" ? "Pset_WindowCommon" : "Pset_DoorCommon", [
      ["IsExternal", { tipo: "IFCBOOLEAN", v: extras.externa }]
    ]);
  }
  extras.psetOpura(produto, o.uid, rotulo);
  emitirQtoAbertura(ctx, produto, o, extras.quant);
  return produto;
}
function emitirTiposDeEsquadria(aberturas, ctx, psetOpura) {
  const { emitir, guid, historico } = ctx;
  const grupos = /* @__PURE__ */ new Map();
  for (const { produto, o } of aberturas) {
    const chave = assinaturaDaEsquadria(o);
    const g = grupos.get(chave);
    if (g) g.produtos.push(produto);
    else grupos.set(chave, { o, produtos: [produto] });
  }
  for (const [chave, g] of [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const o = g.o;
    const nome = nomeDaEsquadria(o);
    const janela = o.kind === "window";
    const item = o.esquadria?.itemCode ?? "";
    const tipo = emitir(
      `${janela ? "IFCWINDOWTYPE" : "IFCDOORTYPE"}(${guid(`tipo-esquadria:${chave}`)},${historico},${s(nome)},${o.esquadria?.descricao ? s(o.esquadria.descricao) : "$"},$,$,$,${item ? s(item) : "$"},$,${janela ? ".WINDOW." : ".DOOR."},.NOTDEFINED.,.F.,$)`
    );
    emitir(
      `IFCRELDEFINESBYTYPE(${guid(`deftipo:${chave}`)},${historico},$,$,(${g.produtos.join(",")}),${tipo})`
    );
    psetOpura(tipo, void 0, nome, item ? [item] : []);
  }
}
var SISTEMA_IFC = {
  ELETRICA: ".ELECTRICAL.",
  AGUA_FRIA: ".DOMESTICCOLDWATER.",
  AGUA_QUENTE: ".DOMESTICHOTWATER.",
  ESGOTO: ".SEWAGE."
};
function emitirTrecho(t, ctx, localNivel, peDireitoMm) {
  const { emitir, guidDe, historico } = ctx;
  const origem = emitir(`IFCCARTESIANPOINT((${n(t.a.x)},${n(t.a.y)},${n(t.cotaAMm)}))`);
  const local = emitir(
    `IFCLOCALPLACEMENT(${localNivel},${emitir(`IFCAXIS2PLACEMENT3D(${origem},$,$)`)})`
  );
  const centroPerfil = emitir("IFCCARTESIANPOINT((0.,0.))");
  const posPerfil = emitir(`IFCAXIS2PLACEMENT2D(${centroPerfil},$)`);
  const perfil = emitir(`IFCCIRCLEPROFILEDEF(.AREA.,$,${posPerfil},${n(t.bitolaMm / 2)})`);
  const solidos = segmentosDoEletroduto(t, peDireitoMm).map((seg) => {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const dz = seg.cotaBMm - seg.cotaAMm;
    const comprimento = Math.hypot(dx, dy, dz);
    const eixo = [dx / comprimento, dy / comprimento, dz / comprimento];
    const auxiliar = Math.abs(eixo[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const perp = [
      eixo[1] * auxiliar[2] - eixo[2] * auxiliar[1],
      eixo[2] * auxiliar[0] - eixo[0] * auxiliar[2],
      eixo[0] * auxiliar[1] - eixo[1] * auxiliar[0]
    ];
    const normaPerp = Math.hypot(perp[0], perp[1], perp[2]);
    const inicio = emitir(
      `IFCCARTESIANPOINT((${n(seg.a.x - t.a.x)},${n(seg.a.y - t.a.y)},${n(seg.cotaAMm - t.cotaAMm)}))`
    );
    const dirEixo = emitir(`IFCDIRECTION((${n(eixo[0])},${n(eixo[1])},${n(eixo[2])}))`);
    const dirRef = emitir(
      `IFCDIRECTION((${n(perp[0] / normaPerp)},${n(perp[1] / normaPerp)},${n(perp[2] / normaPerp)}))`
    );
    const posicao = emitir(`IFCAXIS2PLACEMENT3D(${inicio},${dirEixo},${dirRef})`);
    return emitir(`IFCEXTRUDEDAREASOLID(${perfil},${posicao},${ctx.dirZ},${n(comprimento)})`);
  });
  const forma = emitir(
    `IFCSHAPEREPRESENTATION(${ctx.subContexto},'Body','SweptSolid',(${solidos.join(",")}))`
  );
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  return emitir(
    `IFCFLOWSEGMENT(${guidDe(t.uid, `trecho-${t.id}`)},${historico},${s(t.rotulo || `Trecho ${t.disciplina}`)},$,$,${local},${produtoForma},${s(rotuloCurto(t.uid, "trecho"))})`
  );
}
function direcaoDaPeca(graus, ctx) {
  if (graus === 0) return "$";
  const a = graus * Math.PI / 180;
  const limpo = (v) => Math.round(v * 1e9) / 1e9;
  return ctx.emitir(`IFCDIRECTION((${n(limpo(Math.cos(a)))},${n(limpo(Math.sin(a)))},0.))`);
}
function entidadeDoPontoEletrico(tipo) {
  const OUTLET = (predefinido, objectType) => ({
    entidade: "IFCOUTLET",
    predefinido,
    objectType
  });
  switch (tipo) {
    case "ILUMINACAO_TETO":
    case "ILUMINACAO_PAREDE":
    case "ILUMINACAO_PISO":
      return { entidade: "IFCLIGHTFIXTURE", predefinido: ".USERDEFINED.", objectType: tipo };
    case "TUG":
    case "TUE":
      return OUTLET(".POWEROUTLET.", tipo);
    case "DADOS_TELEFONE":
      return OUTLET(".TELEPHONEOUTLET.", tipo);
    case "DADOS_TV":
      return OUTLET(".AUDIOVISUALOUTLET.", tipo);
    case "DADOS_REDE":
      return OUTLET(".DATAOUTLET.", tipo);
    case "DADOS_USB":
      return OUTLET(".USERDEFINED.", tipo);
    case "LIGACAO_DIRETA":
      return { entidade: "IFCJUNCTIONBOX", predefinido: ".POWER.", objectType: tipo };
    case "INTERRUPTOR":
      return { entidade: "IFCSWITCHINGDEVICE", predefinido: ".TOGGLESWITCH.", objectType: tipo };
  }
}
function entidadeDoPontoHidraulico(tipo) {
  switch (tipo) {
    case "LAVATORIO":
      return { entidade: "IFCSANITARYTERMINAL", predefinido: ".WASHHANDBASIN." };
    case "PIA_COZINHA":
    case "TANQUE":
      return { entidade: "IFCSANITARYTERMINAL", predefinido: ".SINK." };
    case "CHUVEIRO":
      return { entidade: "IFCSANITARYTERMINAL", predefinido: ".SHOWER." };
    case "VASO_SANITARIO":
      return { entidade: "IFCSANITARYTERMINAL", predefinido: ".TOILETPAN." };
    case "DUCHA_HIGIENICA":
    case "MAQUINA_LAVAR":
      return { entidade: "IFCSANITARYTERMINAL", predefinido: ".USERDEFINED." };
    case "TORNEIRA":
    case "TORNEIRA_JARDIM":
      return { entidade: "IFCVALVE", predefinido: ".FAUCET." };
    case "RESERVATORIO":
      return { entidade: "IFCTANK", predefinido: ".STORAGE." };
    case "BOMBA":
      return { entidade: "IFCPUMP", predefinido: ".USERDEFINED." };
    case "AQUECEDOR":
      return { entidade: "IFCBOILER", predefinido: ".WATER." };
    case "RALO_SECO":
    case "RALO_SIFONADO":
      return { entidade: "IFCWASTETERMINAL", predefinido: ".FLOORTRAP." };
    case "CAIXA_SIFONADA":
      return { entidade: "IFCWASTETERMINAL", predefinido: ".FLOORWASTE." };
    case "CAIXA_INSPECAO":
      return { entidade: "IFCDISTRIBUTIONCHAMBERELEMENT", predefinido: ".INSPECTIONCHAMBER." };
    case "CAIXA_GORDURA":
      return { entidade: "IFCINTERCEPTOR", predefinido: ".GREASE." };
    case "REGISTRO_GAVETA":
      return { entidade: "IFCVALVE", predefinido: ".ISOLATING." };
    case "REGISTRO_PRESSAO":
      return { entidade: "IFCVALVE", predefinido: ".REGULATING." };
    case "VALVULA_RETENCAO":
      return { entidade: "IFCVALVE", predefinido: ".CHECK." };
    case "HIDROMETRO":
      return { entidade: "IFCFLOWMETER", predefinido: ".WATERMETER." };
    case "CONEXAO_JOELHO_90":
    case "CONEXAO_JOELHO_45":
      return { entidade: "IFCPIPEFITTING", predefinido: ".BEND." };
    case "CONEXAO_TE":
      return { entidade: "IFCPIPEFITTING", predefinido: ".JUNCTION." };
    case "CONEXAO_LUVA":
      return { entidade: "IFCPIPEFITTING", predefinido: ".CONNECTOR." };
    case "CONEXAO_REDUCAO":
      return { entidade: "IFCPIPEFITTING", predefinido: ".TRANSITION." };
  }
}
function emitirGuardaCorpo(g, ctx, localNivel) {
  const { emitir, guidDe, historico } = ctx;
  const ESPESSURA = 50;
  const solidos = [];
  for (let i = 1; i < g.pontos.length; i++) {
    const a = g.pontos[i - 1];
    const b = g.pontos[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) continue;
    const graus = Math.round(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI * 1e6) / 1e6;
    const centro = emitir(`IFCCARTESIANPOINT((${n((a.x + b.x) / 2)},${n((a.y + b.y) / 2)},0.))`);
    const posPerfil = emitir(`IFCAXIS2PLACEMENT2D(${emitir("IFCCARTESIANPOINT((0.,0.))")},$)`);
    const perfil = emitir(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${posPerfil},${n(L)},${n(ESPESSURA)})`);
    const posicao = emitir(`IFCAXIS2PLACEMENT3D(${centro},$,${direcaoDaPeca(graus, ctx)})`);
    solidos.push(emitir(`IFCEXTRUDEDAREASOLID(${perfil},${posicao},${ctx.dirZ},${n(g.alturaMm)})`));
  }
  const origem = emitir("IFCCARTESIANPOINT((0.,0.,0.))");
  const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${emitir(`IFCAXIS2PLACEMENT3D(${origem},$,$)`)})`);
  const forma = emitir(`IFCSHAPEREPRESENTATION(${ctx.subContexto},'Body','SweptSolid',(${solidos.join(",")}))`);
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  const nome = g.rotulo || (g.tipo === "CORRIMAO" ? "Corrim\xE3o" : "Guarda-corpo");
  const predefinido = g.tipo === "CORRIMAO" ? ".HANDRAIL." : ".GUARDRAIL.";
  return emitir(`IFCRAILING(${guidDe(g.uid, `guarda-corpo-${g.id}`)},${historico},${s(nome)},$,${s(g.material)},${local},${produtoForma},${s(rotuloCurto(g.uid, "guardaCorpo"))},${predefinido})`);
}
function emitirComponente(c, ctx, localNivel) {
  const { emitir, guidDe, historico } = ctx;
  const L = c.larguraMm;
  const P = c.profundidadeMm;
  const A = c.alturaMm;
  const origem = emitir(`IFCCARTESIANPOINT((${n(c.at.x)},${n(c.at.y)},${c.cotaMm ? n(c.cotaMm) : "0."}))`);
  const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${emitir(`IFCAXIS2PLACEMENT3D(${origem},$,${direcaoDaPeca(c.rotacaoGraus, ctx)})`)})`);
  const posPerfil = emitir(`IFCAXIS2PLACEMENT2D(${emitir("IFCCARTESIANPOINT((0.,0.))")},$)`);
  const perfil = emitir(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${posPerfil},${n(L)},${n(P)})`);
  const solido = emitir(`IFCEXTRUDEDAREASOLID(${perfil},${emitir(`IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},$,$)`)},${ctx.dirZ},${n(A)})`);
  const forma = emitir(`IFCSHAPEREPRESENTATION(${ctx.subContexto},'Body','SweptSolid',(${solido}))`);
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  const nome = c.rotulo || CATALOGO_DE_COMPONENTES[c.tipoId]?.rotulo || c.tipoId;
  const tag = rotuloCurto(c.uid, "componente");
  if (c.familia === "LOUCA") {
    const predefinido2 = c.tipoId === "VASO" ? ".TOILETPAN." : c.tipoId === "LAVATORIO" ? ".WASHHANDBASIN." : c.tipoId === "BOX" ? ".SHOWER." : c.tipoId === "TANQUE" ? ".SINK." : ".USERDEFINED.";
    return emitir(`IFCSANITARYTERMINAL(${guidDe(c.uid, `componente-${c.id}`)},${historico},${s(nome)},$,${s(c.tipoId)},${local},${produtoForma},${s(tag)},${predefinido2})`);
  }
  if (c.familia === "CLIMATIZACAO") {
    const guid = guidDe(c.uid, `componente-${c.id}`);
    if (c.tipoId === "EXAUSTOR") return emitir(`IFCFAN(${guid},${historico},${s(nome)},$,${s(c.tipoId)},${local},${produtoForma},${s(tag)},.PROPELLORAXIAL.)`);
    if (c.tipoId === "CASA_DE_MAQUINAS") return emitir(`IFCBUILDINGELEMENTPROXY(${guid},${historico},${s(nome)},$,${s(c.tipoId)},${local},${produtoForma},${s(tag)},.PROVISIONFORSPACE.)`);
    return emitir(`IFCUNITARYEQUIPMENT(${guid},${historico},${s(nome)},$,${s(c.tipoId)},${local},${produtoForma},${s(tag)},.SPLITSYSTEM.)`);
  }
  const predefinido = c.familia === "ARMARIO" ? ".SHELF." : c.tipoId.startsWith("CAMA") ? ".BED." : c.tipoId === "MESA_JANTAR" || c.tipoId === "ESCRIVANINHA" ? ".TABLE." : c.tipoId === "CADEIRA" || c.tipoId === "SOFA" || c.tipoId === "POLTRONA" ? ".CHAIR." : ".USERDEFINED.";
  return emitir(`IFCFURNITURE(${guidDe(c.uid, `componente-${c.id}`)},${historico},${s(nome)},$,${s(c.tipoId)},${local},${produtoForma},${s(tag)},${predefinido})`);
}
function emitirTerminal(t, ctx, localNivel) {
  const { emitir, guidDe, historico } = ctx;
  const medidas = medidasDoTerminal(t);
  const giro = giroDaPeca(t);
  const L = medidas.larguraMm;
  const P = medidas.profundidadeMm;
  const A = medidas.alturaMm;
  const origem = emitir(
    `IFCCARTESIANPOINT((${n(t.at.x)},${n(t.at.y)},${n(t.cotaMm - A / 2)}))`
  );
  const local = emitir(
    `IFCLOCALPLACEMENT(${localNivel},${emitir(`IFCAXIS2PLACEMENT3D(${origem},$,${direcaoDaPeca(giro, ctx)})`)})`
  );
  const posPerfil = emitir(
    `IFCAXIS2PLACEMENT2D(${emitir("IFCCARTESIANPOINT((0.,0.))")},$)`
  );
  const perfil = emitir(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${posPerfil},${n(L)},${n(P)})`);
  const solido = emitir(
    `IFCEXTRUDEDAREASOLID(${perfil},${emitir(`IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},$,$)`)},${ctx.dirZ},${n(A)})`
  );
  const forma = emitir(
    `IFCSHAPEREPRESENTATION(${ctx.subContexto},'Body','SweptSolid',(${solido}))`
  );
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  const eletrico = t.disciplina === "ELETRICA" && t.tipoEletrico ? t.tipoEletrico : null;
  if (!eletrico && t.tipoHidraulico) {
    const { entidade: entidade2, predefinido: predefinido2 } = entidadeDoPontoHidraulico(t.tipoHidraulico);
    const objectType2 = t.tipoHidraulico === "RESERVATORIO" && t.volumeL != null ? `${t.tipoHidraulico}:${t.volumeL}L` : t.tipoHidraulico;
    return emitir(
      `${entidade2}(${guidDe(t.uid, `terminal-${t.id}`)},${historico},${s(t.tipo)},$,${s(objectType2)},${local},${produtoForma},${s(rotuloCurto(t.uid, "terminal"))},${predefinido2})`
    );
  }
  if (!eletrico) {
    return emitir(
      `IFCFLOWTERMINAL(${guidDe(t.uid, `terminal-${t.id}`)},${historico},${s(t.tipo)},$,$,${local},${produtoForma},${s(rotuloCurto(t.uid, "terminal"))})`
    );
  }
  const { entidade, predefinido, objectType: tipoBase } = entidadeDoPontoEletrico(eletrico);
  const objectType = t.interruptor ? `${tipoBase}:${t.interruptor}` : tipoBase;
  return emitir(
    `${entidade}(${guidDe(t.uid, `terminal-${t.id}`)},${historico},${s(t.tipo)},$,${s(objectType)},${local},${produtoForma},${s(rotuloCurto(t.uid, "terminal"))},${predefinido})`
  );
}
function emitirQuadro(q, ctx, localNivel) {
  const { emitir, guidDe, historico } = ctx;
  const medidas = medidasDoQuadro(q);
  const giro = giroDaPeca(q);
  const L = medidas.larguraMm;
  const P = medidas.profundidadeMm;
  const A = medidas.alturaMm;
  const origem = emitir(
    `IFCCARTESIANPOINT((${n(q.at.x)},${n(q.at.y)},${n(q.cotaMm - A / 2)}))`
  );
  const local = emitir(
    `IFCLOCALPLACEMENT(${localNivel},${emitir(`IFCAXIS2PLACEMENT3D(${origem},$,${direcaoDaPeca(giro, ctx)})`)})`
  );
  const posPerfil = emitir(
    `IFCAXIS2PLACEMENT2D(${emitir("IFCCARTESIANPOINT((0.,0.))")},$)`
  );
  const perfil = emitir(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${posPerfil},${n(L)},${n(P)})`);
  const solido = emitir(
    `IFCEXTRUDEDAREASOLID(${perfil},${emitir(`IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},$,$)`)},${ctx.dirZ},${n(A)})`
  );
  const forma = emitir(
    `IFCSHAPEREPRESENTATION(${ctx.subContexto},'Body','SweptSolid',(${solido}))`
  );
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  return emitir(
    `IFCFLOWCONTROLLER(${guidDe(q.uid, `quadro-${q.id}`)},${historico},${s(q.nome)},$,$,${local},${produtoForma},${s(rotuloCurto(q.uid, "quadro"))})`
  );
}
function emitirMaterialDaParede(w, produtoParede, ctx) {
  const { emitir, guid, historico } = ctx;
  const declaradas = w.camadas && w.camadas.length > 0 ? w.camadas : [{ espessuraMm: w.thicknessMm, descricao: void 0, itemCode: void 0 }];
  const camadas = declaradas.map((c) => {
    const nome = c.descricao || c.itemCode || "Material n\xE3o especificado";
    const material = emitir(`IFCMATERIAL(${s(nome)},$,$)`);
    return emitir(`IFCMATERIALLAYER(${material},${n(c.espessuraMm)},$,${s(nome)},$,$,$)`);
  });
  const conjunto = emitir(
    `IFCMATERIALLAYERSET((${camadas.join(",")}),${s(`Parede ${w.thicknessMm} mm`)},$)`
  );
  const uso = emitir(
    `IFCMATERIALLAYERSETUSAGE(${conjunto},.AXIS2.,.POSITIVE.,${n(-w.thicknessMm / 2)},$)`
  );
  emitir(
    `IFCRELASSOCIATESMATERIAL(${guid(`mat-${w.uid ?? w.id}`)},${historico},$,$,(${produtoParede}),${uso})`
  );
}
function emitirRevestimentos(ctx, espacoProduto, espaco, q, psetOpura) {
  const { emitir, guidDe, guid, historico } = ctx;
  const areaM2 = q?.areaPisoM2;
  if (!areaM2 || areaM2 <= 0) return;
  const associarCamadas = (produto, camadas, rotulo, semente) => {
    if (camadas.length === 0) return 0;
    const layers = camadas.map((c) => {
      const nome = c.descricao || c.itemCode || "Material n\xE3o especificado";
      const material = emitir(`IFCMATERIAL(${s(nome)},$,$)`);
      return emitir(`IFCMATERIALLAYER(${material},${n(Math.round(c.espessuraM * 1e3))},$,${s(nome)},$,$,$)`);
    });
    const total = camadas.reduce((acc, c) => acc + Math.round(c.espessuraM * 1e3), 0);
    const conjunto = emitir(`IFCMATERIALLAYERSET((${layers.join(",")}),${s(`${rotulo} ${total} mm`)},$)`);
    emitir(`IFCRELASSOCIATESMATERIAL(${guid(semente)},${historico},$,$,(${produto}),${conjunto})`);
    return total;
  };
  for (const [tipo, sufixo, nome] of [
    [".FLOORING.", "piso", "Piso"],
    [".CEILING.", "forro", "Forro"]
  ]) {
    const uidDoRevestimento = espaco.labelUid ? uidDeterministico(`${espaco.labelUid}:${sufixo}`) : void 0;
    const produto = emitir(
      `IFCCOVERING(${guidDe(uidDoRevestimento, `cov-${sufixo}-${espaco.id}`)},${historico},${s(`${nome} \u2014 ${espaco.name ?? "Ambiente"}`)},$,$,$,$,$,${tipo})`
    );
    const camadas = sufixo === "piso" ? q?.piso?.camadas ?? [] : q?.forro?.camadas ?? [];
    const espessuraMm = associarCamadas(produto, camadas, nome, `mat-${sufixo}-${espaco.labelUid ?? espaco.id}`);
    emitirQto(ctx, produto, void 0, "Qto_CoveringBaseQuantities", [
      { classe: "IFCQUANTITYAREA", nome: "GrossArea", valor: areaM2, formula: "\xE1rea do ambiente" },
      { classe: "IFCQUANTITYAREA", nome: "NetArea", valor: areaM2, formula: "\xE1rea do ambiente" },
      ...espessuraMm > 0 ? [{ classe: "IFCQUANTITYLENGTH", nome: "Width", valor: espessuraMm, formula: "soma das camadas declaradas" }] : []
    ]);
    psetOpura(produto, void 0, void 0);
    if (sufixo === "forro" && q?.forro) {
      emitirPset(ctx, produto, void 0, "Pset_OpuraAcabamento", [
        ["RebaixoMm", { tipo: "IFCREAL", v: Math.round(q.forro.rebaixoM * 1e3) }],
        ["Camadas", { tipo: "IFCLABEL", v: q.forro.camadas.map((c) => `${c.descricao || c.funcao} ${Math.round(c.espessuraM * 1e3)}`).join(" + ") }]
      ]);
    }
    emitir(
      `IFCRELCOVERSSPACES(${guidDe(void 0, `cobre-${sufixo}-${espaco.id}`)},${historico},$,$,${espacoProduto},(${produto}))`
    );
  }
  const r = q?.rodapeDeclarado;
  if (r && (q?.comprimentoRodapeM ?? 0) > 0) {
    const uidDoRodape = espaco.labelUid ? uidDeterministico(`${espaco.labelUid}:rodape`) : void 0;
    const produto = emitir(
      `IFCCOVERING(${guidDe(uidDoRodape, `cov-rodape-${espaco.id}`)},${historico},${s(`Rodap\xE9 \u2014 ${espaco.name ?? "Ambiente"}`)},$,${s(r.descricao || r.itemCode || "Rodap\xE9")},$,$,$,.SKIRTINGBOARD.)`
    );
    emitirQto(ctx, produto, void 0, "Qto_CoveringBaseQuantities", [
      { classe: "IFCQUANTITYLENGTH", nome: "Length", valor: (q?.comprimentoRodapeM ?? 0) * 1e3, formula: "per\xEDmetro \u2212 v\xE3os que chegam ao piso" },
      { classe: "IFCQUANTITYLENGTH", nome: "Height", valor: r.alturaMm, formula: "altura declarada" },
      { classe: "IFCQUANTITYAREA", nome: "NetArea", valor: q?.areaRodapeM2 ?? 0, formula: "comprimento \xD7 altura" }
    ]);
    const material = emitir(`IFCMATERIAL(${s(r.descricao || r.itemCode || "Rodap\xE9")},$,$)`);
    emitir(`IFCRELASSOCIATESMATERIAL(${guid(`mat-rodape-${espaco.labelUid ?? espaco.id}`)},${historico},$,$,(${produto}),${material})`);
    psetOpura(produto, void 0, void 0);
    emitir(
      `IFCRELCOVERSSPACES(${guidDe(void 0, `cobre-rodape-${espaco.id}`)},${historico},$,$,${espacoProduto},(${produto}))`
    );
  }
}
function emitirAmbiente(espaco, peDireitoMm, ctx, localNivel, tipoDeAmbiente = null) {
  const { emitir, guidDe, historico, dirZ, dirX, subContexto } = ctx;
  const pontos = espaco.ring.map((p) => emitir(`IFCCARTESIANPOINT((${n(p.x)},${n(p.y)}))`));
  const contorno = emitir(`IFCPOLYLINE((${pontos.join(",")},${pontos[0]}))`);
  const perfil = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${contorno})`);
  const pontoBase = emitir("IFCCARTESIANPOINT((0.,0.,0.))");
  const eixoBase = emitir(`IFCAXIS2PLACEMENT3D(${pontoBase},${dirZ},${dirX})`);
  const solido = emitir(`IFCEXTRUDEDAREASOLID(${perfil},${eixoBase},${dirZ},${n(peDireitoMm)})`);
  const forma = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma}))`);
  const localEspaco = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoBase})`);
  return emitir(
    `IFCSPACE(${guidDe(espaco.labelUid, `esp-${espaco.id}`)},${historico},${s(espaco.name ?? "Ambiente")},$,${tipoDeAmbiente ? s(tipoDeAmbiente) : "$"},${localEspaco},${produtoForma},$,.ELEMENT.,.INTERNAL.,$)`
  );
}
function emitirVigaT(peca, ctx, localNivel, t, eixo) {
  const { emitir, guidDe, historico, dirZ, dirX, subContexto } = ctx;
  const classe = CLASSE_IFC[peca.kind];
  const c = contornoDaSecaoT(peca.larguraMm, peca.alturaMm, t);
  const pts = c.map((q) => emitir(`IFCCARTESIANPOINT((${n(q.x)},${n(q.y)}))`));
  const anel = emitir(`IFCPOLYLINE((${pts.join(",")},${pts[0]}))`);
  const perfil = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${anel})`);
  const rad = eixo.anguloDeg * Math.PI / 180;
  const direcao = emitir(`IFCDIRECTION((${n(Math.cos(rad))},${n(Math.sin(rad))},0.))`);
  const centro = emitir(
    `IFCCARTESIANPOINT((${n(eixo.cx)},${n(eixo.cy)},${n(peca.baseMm + peca.alturaMm / 2)}))`
  );
  const eixoPeca = emitir(`IFCAXIS2PLACEMENT3D(${centro},${dirZ},${direcao})`);
  const origem = emitir(`IFCCARTESIANPOINT((${n(-eixo.comp / 2)},0.,0.))`);
  const eixoPerfil = emitir(
    `IFCAXIS2PLACEMENT3D(${origem},${dirX},${emitir("IFCDIRECTION((0.,1.,0.))")})`
  );
  const solido = emitir(
    `IFCEXTRUDEDAREASOLID(${perfil},${eixoPerfil},${dirZ},${n(eixo.comp)})`
  );
  const forma3d = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma3d}))`);
  const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoPeca})`);
  const nome = peca.rotulo ? `${peca.rotulo} \u2014 ${nomeDoTipoEstrutural(peca.kind)}` : nomeDoTipoEstrutural(peca.kind);
  const tag = peca.rotulo ? s(peca.rotulo) : peca.uid ? s(rotuloCurto(peca.uid, "structural")) : "$";
  const extra = classe.extra ? `,${classe.extra}` : "";
  return emitir(
    `${classe.entidade}(${guidDe(peca.uid, `est-${peca.id}`)},${historico},${s(nome)},$,$,${local},${produtoForma},${tag},${classe.tipo}${extra})`
  );
}
function emitirEstrutura(peca, ctx, localNivel) {
  const { emitir, guidDe, historico, dirZ, dirX, subContexto } = ctx;
  const forma = FORMA_ESTRUTURAL[peca.kind];
  const classe = CLASSE_IFC[peca.kind];
  let perfil;
  let cx = 0;
  let cy = 0;
  let anguloDeg = 0;
  if (forma === "AREA") {
    const pontos = peca.pontos.map((p) => emitir(`IFCCARTESIANPOINT((${n(p.x)},${n(p.y)}))`));
    const contorno = emitir(`IFCPOLYLINE((${pontos.join(",")},${pontos[0]}))`);
    perfil = emitir(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${contorno})`);
  } else if (forma === "LINHA") {
    const [a, b] = peca.pontos;
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    cx = (a.x + b.x) / 2;
    cy = (a.y + b.y) / 2;
    anguloDeg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const t = secaoTValida(peca);
    if (t) return emitirVigaT(peca, ctx, localNivel, t, { cx, cy, comp, anguloDeg });
    perfil = emitir(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${ctx.origem2d},${n(comp)},${n(peca.larguraMm)})`);
  } else if (peca.circular) {
    perfil = emitir(`IFCCIRCLEPROFILEDEF(.AREA.,$,$,${n(peca.larguraMm / 2)})`);
    cx = peca.pontos[0].x;
    cy = peca.pontos[0].y;
  } else {
    perfil = emitir(
      `IFCRECTANGLEPROFILEDEF(.AREA.,$,${ctx.origem2d},${n(peca.larguraMm)},${n(peca.profundidadeMm)})`
    );
    cx = peca.pontos[0].x;
    cy = peca.pontos[0].y;
    anguloDeg = peca.rotacaoDeg;
  }
  const rad = anguloDeg * Math.PI / 180;
  const direcao = emitir(`IFCDIRECTION((${n(Math.cos(rad))},${n(Math.sin(rad))},0.))`);
  const centro = emitir(`IFCCARTESIANPOINT((${n(cx)},${n(cy)},${n(peca.baseMm)}))`);
  const eixoPeca = emitir(`IFCAXIS2PLACEMENT3D(${centro},${dirZ},${direcao})`);
  const eixoPerfil = emitir(
    `IFCAXIS2PLACEMENT3D(${emitir("IFCCARTESIANPOINT((0.,0.,0.))")},${dirZ},${dirX})`
  );
  const solido = emitir(
    `IFCEXTRUDEDAREASOLID(${perfil},${eixoPerfil},${dirZ},${n(peca.alturaMm)})`
  );
  const forma3d = emitir(`IFCSHAPEREPRESENTATION(${subContexto},'Body','SweptSolid',(${solido}))`);
  const produtoForma = emitir(`IFCPRODUCTDEFINITIONSHAPE($,$,(${forma3d}))`);
  const local = emitir(`IFCLOCALPLACEMENT(${localNivel},${eixoPeca})`);
  const nome = peca.rotulo ? `${peca.rotulo} \u2014 ${nomeDoTipoEstrutural(peca.kind)}` : nomeDoTipoEstrutural(peca.kind);
  const tag = peca.rotulo ? s(peca.rotulo) : peca.uid ? s(rotuloCurto(peca.uid, "structural")) : "$";
  const extra = classe.extra ? `,${classe.extra}` : "";
  return emitir(
    `${classe.entidade}(${guidDe(peca.uid, `est-${peca.id}`)},${historico},${s(nome)},$,$,${local},${produtoForma},${tag},${classe.tipo}${extra})`
  );
}

// utils/blueprintArmadura.ts
var ROTULO_DA_ORIGEM = {
  ESQUEMA: "esquema m\xEDnimo",
  TAXA: "taxa de refer\xEAncia",
  MANUAL: "manual"
};

// utils/blueprintHidraulica.ts
var CONSUMO = "Hidr\xE1ulica \u2014 pontos de consumo";
var RESERVA = "Hidr\xE1ulica \u2014 reserva\xE7\xE3o";
var ESGOTO = "Hidr\xE1ulica \u2014 esgoto";
var REGISTROS = "Hidr\xE1ulica \u2014 registros e v\xE1lvulas";
var CONEXOES = "Hidr\xE1ulica \u2014 conex\xF5es";
var FICHA_DO_PONTO_HIDRAULICO = {
  TORNEIRA: {
    rotulo: "Torneira",
    sigla: "TR",
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 1100, AGUA_QUENTE: 1100 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15 },
    pesoNbr5626: 0.4,
    ajuda: "Torneira de uso geral (\xE1rea de servi\xE7o, garagem). Peso 0,4 na NBR 5626."
  },
  TORNEIRA_JARDIM: {
    rotulo: "Torneira de jardim",
    sigla: "TJ",
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 600 },
    dnMinimoMm: { AGUA_FRIA: 20 },
    pesoNbr5626: 0.4,
    ajuda: "Torneira externa, s\xF3 \xE1gua fria. Peso 0,4."
  },
  CHUVEIRO: {
    rotulo: "Chuveiro",
    sigla: "CH",
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 2100, AGUA_QUENTE: 2100, ESGOTO: 0 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40 },
    pesoNbr5626: 0.4,
    uhcNbr8160: 2,
    ajuda: "Ponto de \xE1gua a 2,10 m; o esgoto do box vai por ralo/caixa sifonada. Peso 0,4 \xB7 2 UHC."
  },
  LAVATORIO: {
    rotulo: "Lavat\xF3rio",
    sigla: "LV",
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 600, AGUA_QUENTE: 600, ESGOTO: 500 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40 },
    pesoNbr5626: 0.3,
    uhcNbr8160: 1,
    ajuda: "\xC1gua a 0,60 m, esgoto a 0,50 m (sif\xE3o). Peso 0,3 \xB7 1 UHC."
  },
  PIA_COZINHA: {
    rotulo: "Pia de cozinha",
    sigla: "PIA",
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 1100, AGUA_QUENTE: 1100, ESGOTO: 500 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 50 },
    pesoNbr5626: 0.7,
    uhcNbr8160: 3,
    ajuda: "\xC1gua a 1,10 m, esgoto a 0,50 m \u2014 passa pela caixa de gordura. Peso 0,7 \xB7 3 UHC."
  },
  TANQUE: {
    rotulo: "Tanque",
    sigla: "TQ",
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 1100, AGUA_QUENTE: 1100, ESGOTO: 500 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 50 },
    pesoNbr5626: 0.7,
    uhcNbr8160: 3,
    ajuda: "Tanque da \xE1rea de servi\xE7o. Peso 0,7 \xB7 3 UHC."
  },
  MAQUINA_LAVAR: {
    rotulo: "M\xE1quina de lavar",
    sigla: "ML",
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 1100, AGUA_QUENTE: 1100, ESGOTO: 700 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 50 },
    pesoNbr5626: 1,
    uhcNbr8160: 3,
    ajuda: "Ponto de m\xE1quina de lavar roupa/lou\xE7a. Peso 1,0 \xB7 3 UHC."
  },
  VASO_SANITARIO: {
    rotulo: "Vaso sanit\xE1rio",
    sigla: "VS",
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 300, ESGOTO: 0 },
    dnMinimoMm: { AGUA_FRIA: 20, ESGOTO: 100 },
    pesoNbr5626: 0.3,
    uhcNbr8160: 6,
    ajuda: "Com caixa acoplada: \xE1gua a 0,30 m, sa\xEDda de esgoto DN 100 no piso. Peso 0,3 \xB7 6 UHC."
  },
  DUCHA_HIGIENICA: {
    rotulo: "Ducha higi\xEAnica",
    sigla: "DH",
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 500, AGUA_QUENTE: 500 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15 },
    pesoNbr5626: 0.1,
    ajuda: "Ao lado do vaso, a 0,50 m. Peso 0,1."
  },
  RESERVATORIO: {
    rotulo: "Caixa d'\xE1gua",
    sigla: "CX",
    grupo: RESERVA,
    // A cota é a do FUNDO da caixa: é de onde a rede sai.
    cotaMm: { AGUA_FRIA: 2800 },
    dnMinimoMm: { AGUA_FRIA: 25 },
    medidasMm: { larguraMm: 1200, profundidadeMm: 1200, alturaMm: 800 },
    volumeL: 1e3,
    ajuda: "Reservat\xF3rio superior. A cota \xE9 a do fundo; o volume, em litros, \xE9 o da caixa comercial. \xC9 de onde a \xE1gua fria autom\xE1tica parte."
  },
  BOMBA: {
    rotulo: "Bomba / pressurizador",
    sigla: "BB",
    grupo: RESERVA,
    cotaMm: { AGUA_FRIA: 300 },
    dnMinimoMm: { AGUA_FRIA: 25 },
    medidasMm: { larguraMm: 300, profundidadeMm: 200, alturaMm: 250 },
    ajuda: "Bomba de recalque ou pressurizador. N\xE3o \xE9 dimensionada pelo lan\xE7amento autom\xE1tico."
  },
  AQUECEDOR: {
    rotulo: "Aquecedor",
    sigla: "AQ",
    grupo: RESERVA,
    cotaMm: { AGUA_FRIA: 1600, AGUA_QUENTE: 1600 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 22 },
    medidasMm: { larguraMm: 400, profundidadeMm: 200, alturaMm: 600 },
    ajuda: "Aquecedor de passagem ou acumula\xE7\xE3o: recebe \xE1gua fria e \xE9 a origem da rede de \xE1gua quente."
  },
  RALO_SECO: {
    rotulo: "Ralo seco",
    sigla: "RS",
    grupo: ESGOTO,
    cotaMm: { ESGOTO: 0 },
    dnMinimoMm: { ESGOTO: 40 },
    uhcNbr8160: 1,
    medidasMm: { larguraMm: 100, profundidadeMm: 100, alturaMm: 60 },
    ajuda: "Ralo sem fecho h\xEDdrico (\xE1rea de servi\xE7o, varanda). 1 UHC."
  },
  RALO_SIFONADO: {
    rotulo: "Ralo sifonado",
    sigla: "RSf",
    grupo: ESGOTO,
    cotaMm: { ESGOTO: 0 },
    dnMinimoMm: { ESGOTO: 50 },
    uhcNbr8160: 1,
    medidasMm: { larguraMm: 100, profundidadeMm: 100, alturaMm: 150 },
    ajuda: "Ralo com fecho h\xEDdrico \u2014 recebe o chuveiro. 1 UHC."
  },
  CAIXA_SIFONADA: {
    rotulo: "Caixa sifonada",
    sigla: "CS",
    grupo: ESGOTO,
    cotaMm: { ESGOTO: 0 },
    dnMinimoMm: { ESGOTO: 50 },
    uhcNbr8160: 1,
    medidasMm: { larguraMm: 150, profundidadeMm: 150, alturaMm: 200 },
    ajuda: "Coletor do banheiro: recebe lavat\xF3rio, chuveiro e ralo e sai em DN 50 (o vaso vai direto). 1 UHC pr\xF3pria."
  },
  CAIXA_INSPECAO: {
    rotulo: "Caixa de inspe\xE7\xE3o",
    sigla: "CI",
    grupo: ESGOTO,
    cotaMm: { ESGOTO: -600 },
    dnMinimoMm: { ESGOTO: 100 },
    medidasMm: { larguraMm: 600, profundidadeMm: 600, alturaMm: 600 },
    ajuda: "Caixa enterrada onde os ramais se juntam antes do coletor. A cota \xE9 a do fundo. \xC9 o destino do esgoto autom\xE1tico."
  },
  CAIXA_GORDURA: {
    rotulo: "Caixa de gordura",
    sigla: "CG",
    grupo: ESGOTO,
    cotaMm: { ESGOTO: -400 },
    dnMinimoMm: { ESGOTO: 75 },
    medidasMm: { larguraMm: 400, profundidadeMm: 400, alturaMm: 500 },
    ajuda: "Recebe o esgoto da pia de cozinha antes da caixa de inspe\xE7\xE3o. A cota \xE9 a do fundo."
  },
  REGISTRO_GAVETA: {
    rotulo: "Registro de gaveta",
    sigla: "RG",
    grupo: REGISTROS,
    cotaMm: { AGUA_FRIA: 1800, AGUA_QUENTE: 1800 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15 },
    sobreOTrecho: true,
    ajuda: "Fecha o ramal do ambiente. Insere-se SOBRE um trecho de \xE1gua \u2014 clique perto dele."
  },
  REGISTRO_PRESSAO: {
    rotulo: "Registro de press\xE3o",
    sigla: "RP",
    grupo: REGISTROS,
    cotaMm: { AGUA_FRIA: 1100, AGUA_QUENTE: 1100 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15 },
    sobreOTrecho: true,
    ajuda: "O registro do chuveiro. Insere-se sobre um trecho de \xE1gua."
  },
  VALVULA_RETENCAO: {
    rotulo: "V\xE1lvula de reten\xE7\xE3o",
    sigla: "VR",
    grupo: REGISTROS,
    cotaMm: { AGUA_FRIA: 1800, AGUA_QUENTE: 1800 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15 },
    sobreOTrecho: true,
    ajuda: "Impede o retorno. Insere-se sobre um trecho de \xE1gua."
  },
  HIDROMETRO: {
    rotulo: "Hidr\xF4metro",
    sigla: "H",
    grupo: REGISTROS,
    cotaMm: { AGUA_FRIA: 600 },
    dnMinimoMm: { AGUA_FRIA: 20 },
    sobreOTrecho: true,
    medidasMm: { larguraMm: 200, profundidadeMm: 100, alturaMm: 100 },
    ajuda: "Medidor na entrada. Insere-se sobre o trecho de alimenta\xE7\xE3o."
  },
  CONEXAO_JOELHO_90: {
    rotulo: "Joelho 90\xB0",
    sigla: "J90",
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: "For\xE7a um joelho de 90\xB0 neste n\xF3. As conex\xF5es dos encontros de trechos s\xE3o contadas sozinhas \u2014 s\xF3 lance \xE0 m\xE3o o que o desenho n\xE3o deduz."
  },
  CONEXAO_JOELHO_45: {
    rotulo: "Joelho 45\xB0",
    sigla: "J45",
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: "For\xE7a um joelho de 45\xB0 neste n\xF3."
  },
  CONEXAO_TE: {
    rotulo: "T\xEA",
    sigla: "T",
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: "For\xE7a um t\xEA neste n\xF3."
  },
  CONEXAO_LUVA: {
    rotulo: "Luva",
    sigla: "L",
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: "For\xE7a uma luva (emenda reta) neste ponto."
  },
  CONEXAO_REDUCAO: {
    rotulo: "Redu\xE7\xE3o",
    sigla: "R",
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: "For\xE7a uma redu\xE7\xE3o (mudan\xE7a de di\xE2metro) neste ponto."
  }
};
var ROTULO_DO_PONTO_HIDRAULICO = Object.fromEntries(
  TIPOS_DE_PONTO_HIDRAULICO.map((t) => [t, FICHA_DO_PONTO_HIDRAULICO[t].rotulo])
);
var SIGLA_DO_PONTO_HIDRAULICO = Object.fromEntries(
  TIPOS_DE_PONTO_HIDRAULICO.map((t) => [t, FICHA_DO_PONTO_HIDRAULICO[t].sigla])
);
var GRUPO_DO_PONTO_HIDRAULICO = Object.fromEntries(
  TIPOS_DE_PONTO_HIDRAULICO.map((t) => [t, FICHA_DO_PONTO_HIDRAULICO[t].grupo])
);

// utils/blueprintPlanilha.ts
var COBERTURA_PLANILHA = [
  "CONT\xC9M: ambientes (\xE1rea de eixo e de piso, per\xEDmetro, rodap\xE9), paredes (face, volume de alvenaria), aberturas, estrutura de concreto (volume e f\xF4rma por pe\xE7a), telhado (\xE1rea REAL e projetada por \xE1gua) e escadas/rampas (degraus, espelho, piso, pegada e o furo que abrem na laje).",
  "A LAJE j\xE1 vem DESCONTADA do furo da escada, em \xE1rea e em volume. O desconto \xE9 recalculado a cada leitura \u2014 mover a escada corrige o n\xFAmero sozinho.",
  "QUADRO DE ESQUADRIAS: uma linha por tipo (kind, medidas, nome de projeto e item), com quantidade e \xE1rea total. Portas sem nome aparecem agrupadas por medida. V\xE3o livre fica fora \u2014 n\xE3o h\xE1 caixilho.",
  "\xC1rea de telhado \xE9 a da SUPERF\xCDCIE INCLINADA (\xE1rea projetada \xD7 \u221A(1 + inclina\xE7\xE3o\xB2)) \u2014 a 30% s\xE3o 4,4% a mais que a planta; a 100%, 41%. \xC9 a \xE1rea real que compra telha.",
  "\xC1rea de piso \xE9 o contorno RECUADO em meia espessura de parede \u2014 n\xE3o \xE9 a \xE1rea de eixo, e a diferen\xE7a chega a 9%.",
  'ARMADURA ESQUEM\xC1TICA (aba "Armadura", quando h\xE1 estrutura): kg de a\xE7o por pe\xE7a pelos M\xCDNIMOS da NBR 6118 (barras, estribos ou malha) com um piso por taxa de refer\xEAncia (kg/m\xB3) \u2014 hip\xF3teses do estudo. \xC9 pr\xE9-quantitativo, n\xE3o detalhamento: sem dobras, sem lista de barras, sem esfor\xE7os. A coluna "Origem" diz se valeu o esquema ou a taxa.',
  'INSTALA\xC7\xD5ES (abas "Instala\xE7\xF5es" e "Pontos e conex\xF5es", quando h\xE1 rede, 18/09/2026): tubo por disciplina e DN com o comprimento REAL (prumadas e caimento inclusos), um trecho por linha com caimento em %; pontos hidr\xE1ulicos e el\xE9tricos por classifica\xE7\xE3o; conex\xF5es (joelho, t\xEA, luva, redu\xE7\xE3o) DEDUZIDAS dos encontros de trechos mais as lan\xE7adas \xE0 m\xE3o. Eletroduto entra pela bitola.',
  "N\xC3O CONT\xC9M pre\xE7o. Para virar or\xE7amento, use o de-para da aba Or\xE7amento do editor, que trava a unidade do item.",
  "F\xF4rma de pe\xE7a estrutural segue a pol\xEDtica do m\xF3dulo: pilar pelo per\xEDmetro da se\xE7\xE3o, viga em duas laterais mais o fundo, laje s\xF3 o fundo. A borda da laje n\xE3o entra.",
  "Estudo preliminar assistido; requer valida\xE7\xE3o de profissional habilitado."
];
var cmDeM = (m) => Number((m * 100).toFixed(1));
function n2(v) {
  return Math.round(v * 100) / 100;
}
function n3(v) {
  return Math.round(v * 1e3) / 1e3;
}
function abasDoQuantitativo(quant, ctx, armadura, parametros) {
  const abas = [];
  const t = quant.totais;
  abas.push({
    nome: "Cobertura",
    linhas: [
      ["QUANTITATIVO DA PLANTA"],
      ["Estudo", ctx.titulo],
      ["Vers\xE3o", ctx.revisao],
      ["Hash do snapshot", ctx.hash],
      ["Kernel", ctx.kernelVersion],
      ["Pol\xEDtica de c\xE1lculo", quant.policy.version],
      [],
      ["O QUE ESTE ARQUIVO REPRESENTA"],
      ...COBERTURA_PLANILHA.map((i) => [i])
    ]
  });
  const totais = [["Medida", "Valor", "Unidade"]];
  if (quant.ambientes.length > 0) {
    totais.push(
      ["\xC1rea de piso", n2(t.areaPisoM2), "m\xB2"],
      [`\xC1rea de piso com perda (${(quant.policy.perdaRevestimento * 100).toFixed(0)}%)`, n2(t.areaPisoComPerdaM2), "m\xB2"],
      ["\xC1rea constru\xEDda", n2(t.areaConstruidaM2), "m\xB2"],
      ["\xC1rea de parede (duas faces)", n2(t.areaParedeDuasFacesM2), "m\xB2"],
      ["Volume de alvenaria", n3(t.volumeAlvenariaM3), "m\xB3"],
      ["Comprimento de rodap\xE9", n2(t.comprimentoRodapeM), "m"],
      ["Portas", t.portas, "un"],
      ["Janelas", t.janelas, "un"],
      ["V\xE3os livres", t.vaosLivres, "un"],
      ["Portas de correr", t.portasDeCorrer, "un"],
      ["\xC1rea de esquadrias", n2(t.areaAberturasM2), "m\xB2"]
    );
  }
  if (quant.estruturas.length > 0) {
    totais.push(
      [],
      ["ESTRUTURA"],
      ["Concreto \u2014 pilares", n3(t.volumeConcretoPilarM3), "m\xB3"],
      ["Concreto \u2014 vigas", n3(t.volumeConcretoVigaM3), "m\xB3"],
      ["Concreto \u2014 lajes", n3(t.volumeConcretoLajeM3), "m\xB3"],
      ["Concreto \u2014 funda\xE7\xE3o", n3(t.volumeConcretoFundacaoM3), "m\xB3"],
      ["F\xF4rma \u2014 pilares", n2(t.areaFormaPilarM2), "m\xB2"],
      ["F\xF4rma \u2014 vigas", n2(t.areaFormaVigaM2), "m\xB2"],
      ["F\xF4rma \u2014 lajes", n2(t.areaFormaLajeM2), "m\xB2"],
      ["F\xF4rma \u2014 funda\xE7\xE3o", n2(t.areaFormaFundacaoM2), "m\xB2"],
      ["Comprimento de vigas", n2(t.comprimentoVigasM), "m"],
      ["\xC1rea de laje", n2(t.areaLajeM2), "m\xB2"],
      ["Estacas", t.estacas, "un"],
      ["Estacas \u2014 metro perfurado", n2(t.comprimentoEstacasM), "m"],
      ["Pilares", t.pilares, "un"],
      ["Blocos de coroamento", t.blocosCoroamento, "un"],
      ...armadura ? [
        ["A\xE7o \u2014 pilares", n2(armadura.totais.pilarKg), "kg"],
        ["A\xE7o \u2014 vigas", n2(armadura.totais.vigaKg), "kg"],
        ["A\xE7o \u2014 lajes", n2(armadura.totais.lajeKg), "kg"],
        ["A\xE7o \u2014 funda\xE7\xE3o", n2(armadura.totais.fundacaoKg), "kg"],
        ["A\xE7o \u2014 total (CA-50)", n2(armadura.totais.ca50Kg), "kg"],
        ["A\xE7o \u2014 total (CA-60)", n2(armadura.totais.ca60Kg), "kg"]
      ] : []
    );
  }
  if (quant.telhados.length > 0) {
    totais.push(
      [],
      ["TELHADO"],
      ["\xC1rea de telhado (real, inclinada)", n2(t.areaTelhadoM2), "m\xB2"],
      ["\xC1rea de telhado (projetada em planta)", n2(t.areaTelhadoProjetadaM2), "m\xB2"],
      ["\xC1guas", t.aguas, "un"]
    );
  }
  if (quant.escadas.length > 0) {
    totais.push(
      [],
      ["ESCADAS E RAMPAS"],
      ["Pegada em planta", n2(t.areaEscadasM2), "m\xB2"],
      ["Degraus (espelhos)", t.degraus, "un"],
      ["Escadas e rampas", t.escadas, "un"]
    );
  }
  const nomeDaDisciplina = (d) => ROTULO_DA_DISCIPLINA[d] ?? d;
  const nomeDoPonto = (p) => p.classificacao ? ROTULO_DO_PONTO_HIDRAULICO[p.classificacao] ?? ROTULO_DO_PONTO_ELETRICO[p.classificacao] ?? p.classificacao : `${p.tipo} (sem tipo)`;
  if ((t.porBitola ?? []).length > 0 || (t.porTerminal ?? []).length > 0) {
    totais.push([], ["INSTALA\xC7\xD5ES"]);
    for (const b of t.porBitola ?? []) totais.push([`${nomeDaDisciplina(b.disciplina)} DN ${b.bitolaMm}${b.itemCode ? ` \xB7 ${b.itemCode}` : ""}`, n2(b.comprimentoM), "m"]);
    for (const p of t.porTerminal ?? []) totais.push([`${nomeDoPonto(p)} \xB7 ${nomeDaDisciplina(p.disciplina)}`, p.quantidade, "un"]);
    for (const c of t.porConexao ?? []) totais.push([`${ROTULO_DA_CONEXAO[c.tipo]} DN ${c.bitolaMm}${c.paraMm != null ? `\u2192${c.paraMm}` : ""} \xB7 ${nomeDaDisciplina(c.disciplina)}`, c.quantidade, "un"]);
    totais.push(["Rede \u2014 comprimento total", n2(t.comprimentoRedeM), "m"]);
  }
  abas.push({ nome: "Totais", linhas: totais });
  if (quant.ambientes.length > 0) {
    abas.push({
      nome: "Ambientes",
      linhas: [
        ["Ambiente", "\xC1rea de piso (m\xB2)", "\xC1rea de eixo (m\xB2)", "Piso c/ perda (m\xB2)", "Per\xEDmetro (m)", "Rodap\xE9 (m)", "\xC1rea de rodap\xE9 (m\xB2)", "P\xE9-direito \xFAtil (m)", "Volume (m\xB3)", "F\xF3rmula da \xE1rea de piso"],
        ...quant.ambientes.map((a, i) => [
          a.nome ?? `Ambiente ${i + 1}`,
          n2(a.areaPisoM2),
          n2(a.areaEixoM2),
          n2(a.areaPisoComPerdaM2),
          n2(a.perimetroEixoM),
          n2(a.comprimentoRodapeM),
          n2(a.areaRodapeM2),
          n2(a.peDireitoM ?? 0),
          n2(a.volumeM3 ?? 0),
          a.formulaAreaPiso
        ])
      ]
    });
  }
  if (quant.paredes.length > 0) {
    abas.push({
      nome: "Paredes",
      linhas: [
        ["Parede", "Comprimento (m)", "Altura (m)", "Espessura (m)", "Face bruta (m\xB2)", "Aberturas (m\xB2)", "Face l\xEDquida (m\xB2)", "Volume (m\xB3)"],
        ...quant.paredes.map((p) => [
          p.wallId,
          n2(p.comprimentoM),
          n2(p.alturaM),
          n2(p.espessuraM),
          n2(p.areaFaceBrutaM2),
          n2(p.areaAberturasM2),
          n2(p.areaFaceLiquidaM2),
          n3(p.volumeM3)
        ])
      ]
    });
  }
  if (quant.aberturas.length > 0) {
    abas.push({
      nome: "Aberturas",
      linhas: [
        ["Abertura", "Tipo", "Esquadria", "Item", "Largura (m)", "Altura (m)", "\xC1rea (m\xB2)"],
        ...quant.aberturas.map((o) => [
          o.openingId,
          nomeDoTipoDeAbertura(o.tipo),
          o.tipo === "passage" ? "" : o.nome,
          o.itemCode,
          n2(o.larguraM),
          n2(o.alturaM),
          n2(o.areaM2)
        ])
      ]
    });
  }
  if ((quant.totais.porEsquadria ?? []).length > 0) {
    abas.push({
      nome: "Quadro de esquadrias",
      linhas: [
        // Largura e altura em CENTIMETRO (P2.46): a esquadria se especifica em cm
        // ("porta 80x210"), e o quadro tem de dizer o mesmo que a tela.
        ["Esquadria", "Tipo", "Largura (cm)", "Altura (cm)", "Quantidade", "\xC1rea total (m\xB2)", "Item", "Descri\xE7\xE3o"],
        ...quant.totais.porEsquadria.map((e) => [
          e.nome,
          nomeDoTipoDeAbertura(e.tipo),
          cmDeM(e.larguraM),
          cmDeM(e.alturaM),
          e.quantidade,
          n2(e.areaM2),
          e.itemCode,
          e.descricao
        ])
      ]
    });
  }
  if (quant.estruturas.length > 0) {
    abas.push({
      nome: "Estrutura",
      linhas: [
        ["R\xF3tulo", "Tipo", "Comprimento (m)", "\xC1rea em planta (m\xB2)", "Concreto (m\xB3)", "F\xF4rma (m\xB2)", "F\xF3rmula do volume"],
        ...quant.estruturas.map((e) => [
          // Sem rótulo, o id — é o único identificador que resta, e uma célula
          // vazia deixaria a linha impossível de casar com o desenho.
          e.rotulo || e.structuralId,
          nomeDoTipoEstrutural(e.kind),
          n2(e.comprimentoM),
          n2(e.areaPlantaM2),
          n3(e.volumeConcretoM3),
          n2(e.areaFormaM2),
          e.formula
        ])
      ]
    });
  }
  if (armadura && armadura.pecas.length > 0) {
    abas.push({
      nome: "Armadura",
      linhas: [
        ["R\xF3tulo", "Tipo", "Se\xE7\xE3o", "Concreto (m\xB3)", "A\xE7o (kg)", "Taxa (kg/m\xB3)", "CA-50 (kg)", "CA-60 (kg)", "Barras (m)", "Estribos (m)", "Origem", "Esquema (m\xEDnimos NBR 6118)"],
        ...armadura.pecas.map((p) => [
          p.rotulo || p.structuralId,
          nomeDoTipoEstrutural(p.kind),
          p.secao,
          n3(p.volumeConcretoM3),
          n2(p.kg),
          n2(p.taxaEfetivaKgM3),
          n2(p.kgCa50),
          n2(p.kgCa60),
          n2(p.comprimentoLongitudinalM),
          n2(p.comprimentoTransversalM),
          ROTULO_DA_ORIGEM[p.origem],
          p.descricao
        ])
      ]
    });
  }
  if (quant.trechos.length > 0) {
    abas.push({
      nome: "Instala\xE7\xF5es",
      linhas: [
        ["Trecho", "Disciplina", "DN (mm)", "Item", "Em planta (m)", "Real (m)", "Desn\xEDvel (m)", "Caimento (%)", "F\xF3rmula"],
        ...quant.trechos.map((tr, i) => [
          tr.rotulo || `${nomeDaDisciplina(tr.disciplina)} ${i + 1}`,
          nomeDaDisciplina(tr.disciplina),
          tr.bitolaMm,
          tr.itemCode ?? "",
          n2(tr.comprimentoPlantaM),
          n2(tr.comprimentoM),
          n3(tr.desnivelM),
          tr.comprimentoPlantaM > 0 ? Number((Math.abs(tr.desnivelM) / tr.comprimentoPlantaM * 100).toFixed(1)) : "",
          tr.formula
        ])
      ]
    });
  }
  if ((t.porTerminal ?? []).length > 0 || (t.porConexao ?? []).length > 0) {
    abas.push({
      nome: "Pontos e conex\xF5es",
      linhas: [
        ["PONTOS"],
        ["Classifica\xE7\xE3o", "Disciplina", "Item", "Quantidade"],
        ...(t.porTerminal ?? []).map((p) => [nomeDoPonto(p), nomeDaDisciplina(p.disciplina), p.itemCode ?? "", p.quantidade]),
        [],
        ["CONEX\xD5ES (deduzidas dos encontros de trechos + lan\xE7adas \xE0 m\xE3o)"],
        ["Conex\xE3o", "Disciplina", "DN (mm)", "Reduz para (mm)", "Quantidade", "Deduzidas", "Manuais"],
        ...(t.porConexao ?? []).map((c) => [ROTULO_DA_CONEXAO[c.tipo], nomeDaDisciplina(c.disciplina), c.bitolaMm, c.paraMm ?? "", c.quantidade, c.derivadas, c.manuais])
      ]
    });
  }
  if (quant.telhados.length > 0) {
    abas.push({
      nome: "Telhado",
      linhas: [
        ["\xC1gua", "Inclina\xE7\xE3o (%)", "Inclina\xE7\xE3o (\xB0)", "\xC1rea real (m\xB2)", "\xC1rea projetada (m\xB2)", "Beiral (m)", "Altura m\xE1x. (m)", "F\xF3rmula"],
        ...quant.telhados.map((a, i) => [
          `\xC1gua ${i + 1}`,
          a.inclinacaoPct,
          n2(a.inclinacaoGraus),
          n2(a.areaRealM2),
          n2(a.areaProjetadaM2),
          n2(a.comprimentoBeiralM),
          n2(a.alturaMaximaM),
          a.formula
        ])
      ]
    });
  }
  if (quant.escadas.length > 0) {
    abas.push({
      nome: "Escadas",
      linhas: [
        ["Pe\xE7a", "Tipo", "Degraus", "Espelho (m)", "Piso (m)", "Largura (m)", "Desn\xEDvel (m)", "Comprimento (m)", "Inclinada (m)", "Inclina\xE7\xE3o (%)", "Pegada (m\xB2)", "Furo na laje (m\xB2)", "F\xF3rmula"],
        ...quant.escadas.map((e, i) => [
          e.rotulo || `${e.tipo === "RAMPA" ? "Rampa" : "Escada"} ${i + 1}`,
          e.tipo === "RAMPA" ? "Rampa" : "Escada",
          e.degraus,
          Number(e.espelhoM.toFixed(3)),
          Number(e.pisoM.toFixed(3)),
          n2(e.larguraM),
          n2(e.desnivelM),
          n2(e.comprimentoM),
          n2(e.comprimentoInclinadoM),
          Number(e.inclinacaoPct.toFixed(1)),
          n2(e.areaPlantaM2),
          n2(e.areaFuroLajeM2),
          e.formula
        ])
      ]
    });
  }
  if (parametros && parametros.length > 0) {
    abas.push({
      nome: "Par\xE2metros",
      linhas: [
        ["Pe\xE7a", "Fam\xEDlia", "Chave", "Valor", "Origem"],
        ...parametros.map((l) => [l.peca, l.familia, l.chave, typeof l.valor === "boolean" ? l.valor ? "sim" : "n\xE3o" : l.valor, l.origem === "formula" ? "f\xF3rmula" : "gravado"])
      ]
    });
  }
  return abas;
}
export {
  KERNEL_VERSION,
  POLITICA_PADRAO,
  abasDoQuantitativo,
  acabamentosDoAmbiente,
  computeQuantities,
  gerarIfc,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  snapshotHash,
  unidadeDaEtiqueta
};
