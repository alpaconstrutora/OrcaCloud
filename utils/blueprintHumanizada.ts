/**
 * PLANTA HUMANIZADA (20/09/2026, roadmap E8.4) — a parte PURA.
 *
 * "Humanizada" é um ESTILO de leitura da mesma planta: piso com a trama e a
 * cor do material declarado (E7.2), paredes cheias com sombra projetada,
 * mobiliário (E7.1) preenchido por família, vegetação simbólica no lote e nas
 * varandas. Nada aqui toca no modelo nem no hash — é o que a tela e o PDF
 * MOSTRAM, e por isso mora fora do kernel, ao lado das paletas (E8.2).
 *
 * Tudo sai em MILÍMETRO DE MODELO: o canvas e o PDF só levam ao papel. As
 * tramas são segmentos JÁ RECORTADOS pelo polígono do ambiente — o recorte é
 * feito aqui, em geometria, e não por `clip` do canvas, para que o PDF (que
 * só sabe recortar retângulo) e o teste vejam exatamente o mesmo desenho.
 *
 * O que decide o material do piso, em ordem: a ÚLTIMA camada de acabamento do
 * piso declarado do ambiente (pela descrição, que é onde o nome do material
 * vive; o código é opaco); senão o TIPO do ambiente (NBR 5410); senão o USO
 * pelo nome (E4.1); senão porcelanato. A regra é declarada no rótulo do
 * painel para o usuário saber de onde veio a trama.
 */
import {
  acabamentosDoAmbiente,
  CATALOGO_DE_COMPONENTES,
  cantosDaParede,
  contornoDoComponente,
  extensaoDeCanto,
  pointInPolygon,
  type BlueprintModel,
  type Componente,
  type FamiliaDeComponente,
  type ObjectId,
  type Point,
  type Space,
  type TipoDeAmbiente,
  type Wall,
} from './blueprintKernel';
import { usoDoNome, type UsoDoAmbiente } from './blueprintPrograma';
import { anelDoTerreno } from './blueprintTerreno';

export type PadraoDePiso = 'PORCELANATO' | 'CERAMICA' | 'MADEIRA' | 'PEDRA' | 'CARPETE' | 'CIMENTO' | 'DECK' | 'GRAMA';
export const PADROES_DE_PISO: readonly PadraoDePiso[] = ['PORCELANATO', 'CERAMICA', 'MADEIRA', 'PEDRA', 'CARPETE', 'CIMENTO', 'DECK', 'GRAMA'];
export const ROTULO_DO_PADRAO: Record<PadraoDePiso, string> = {
  PORCELANATO: 'Porcelanato',
  CERAMICA: 'Cerâmica',
  MADEIRA: 'Madeira / laminado',
  PEDRA: 'Pedra',
  CARPETE: 'Carpete',
  CIMENTO: 'Cimento queimado',
  DECK: 'Deck',
  GRAMA: 'Grama',
};

export interface EstiloDoPiso {
  padrao: PadraoDePiso;
  /** Cor de fundo do ambiente. */
  cor: string;
  /** Cor da trama (juntas, tábuas, tufos). */
  corDoTraco: string;
  /** Módulo da trama em mm de modelo (lado da peça, largura da tábua…). 0 = sem trama. */
  moduloMm: number;
  /** De onde veio: declarado no piso, pelo tipo do ambiente, pelo uso do nome, ou o padrão. */
  origem: 'PISO' | 'TIPO' | 'USO' | 'LOTE' | 'PADRAO';
}

const ESTILO: Record<PadraoDePiso, Omit<EstiloDoPiso, 'origem'>> = {
  PORCELANATO: { padrao: 'PORCELANATO', cor: '#f3efe6', corDoTraco: '#d6d0c4', moduloMm: 600 },
  CERAMICA: { padrao: 'CERAMICA', cor: '#e8eef3', corDoTraco: '#c3ccd6', moduloMm: 400 },
  MADEIRA: { padrao: 'MADEIRA', cor: '#e9d3b4', corDoTraco: '#c9a97e', moduloMm: 150 },
  PEDRA: { padrao: 'PEDRA', cor: '#e2e2dc', corDoTraco: '#b9b9b0', moduloMm: 500 },
  CARPETE: { padrao: 'CARPETE', cor: '#dfe3ea', corDoTraco: '#c2c8d2', moduloMm: 0 },
  CIMENTO: { padrao: 'CIMENTO', cor: '#d9d9d9', corDoTraco: '#bdbdbd', moduloMm: 0 },
  DECK: { padrao: 'DECK', cor: '#d9b58c', corDoTraco: '#b48a5e', moduloMm: 120 },
  GRAMA: { padrao: 'GRAMA', cor: '#cfe8c2', corDoTraco: '#7fb069', moduloMm: 450 },
};

/** Cores do mobiliário por família — fundo suave, contorno mais escuro. */
export const COR_DA_FAMILIA: Record<FamiliaDeComponente, { fundo: string; traco: string }> = {
  MOBILIARIO: { fundo: '#e7d4c0', traco: '#8b6b4a' },
  LOUCA: { fundo: '#ffffff', traco: '#64748b' },
  BANCADA: { fundo: '#d9dee5', traco: '#5b6b7c' },
  ARMARIO: { fundo: '#d8c3a5', traco: '#7c5f3d' },
  EQUIPAMENTO: { fundo: '#e5e7eb', traco: '#4b5563' },
};

/** Cores das paredes cheias e da sombra. */
export const COR_PAREDE_HUMANIZADA = '#2f2f2f';
export const COR_SOMBRA = 'rgba(0, 0, 0, 0.18)';
export const COR_SOMBRA_OPACA = '#c8c8c8';
/** Deslocamento da sombra (sol a noroeste, como o desenho de apresentação costuma assumir), mm de modelo. */
export const DESLOCAMENTO_DA_SOMBRA_MM = { dx: 120, dy: -120 };
export const COR_VEGETACAO = { copa: '#bfe0b0', traco: '#5f8f4e', arbusto: '#a9d29a' };

/** O material pelo NOME da camada — a descrição é o único lugar onde o material tem nome (o código é opaco). */
export function padraoDaDescricao(descricao: string | null | undefined): PadraoDePiso | null {
  const d = (descricao ?? '').toLowerCase();
  if (!d) return null;
  if (/grama|gramado/.test(d)) return 'GRAMA';
  if (/deck/.test(d)) return 'DECK';
  if (/porcelanato/.test(d)) return 'PORCELANATO';
  if (/cer[âa]mic|azulejo|lajota/.test(d)) return 'CERAMICA';
  if (/madeira|laminad|assoalho|t[áa]bua|vin[íi]lic|taco/.test(d)) return 'MADEIRA';
  if (/pedra|granito|m[áa]rmore|ard[óo]sia|s[ãa]o tom[ée]|miracema/.test(d)) return 'PEDRA';
  if (/carpete|tapete/.test(d)) return 'CARPETE';
  if (/cimento|concreto|epóxi|epoxi/.test(d)) return 'CIMENTO';
  return null;
}

const PADRAO_DO_TIPO: Record<TipoDeAmbiente, PadraoDePiso | null> = {
  BANHEIRO: 'CERAMICA',
  COZINHA_SERVICO: 'CERAMICA',
  VARANDA: 'DECK',
  SALA_DORMITORIO: 'MADEIRA',
  OUTRO: null,
};
const PADRAO_DO_USO: Partial<Record<UsoDoAmbiente, PadraoDePiso>> = {
  SALA: 'PORCELANATO',
  COZINHA: 'CERAMICA',
  DORMITORIO: 'MADEIRA',
  SUITE: 'MADEIRA',
  BANHEIRO: 'CERAMICA',
  LAVABO: 'CERAMICA',
  AREA_DE_SERVICO: 'CERAMICA',
  VARANDA: 'DECK',
  CIRCULACAO: 'PORCELANATO',
  GARAGEM: 'CIMENTO',
  ESCRITORIO: 'MADEIRA',
  DEPOSITO: 'CIMENTO',
};

/**
 * O ambiente que a DIVISA do lote fecha (o terreno em volta da casa, com a
 * edificação como buraco) é um ambiente derivado como outro qualquer; na
 * planta humanizada ele é o QUINTAL — grama. Reconhecido pela caixa igual à do lote.
 */
export function ehAmbienteDoLote(s: Pick<Space, 'ring'>, lote: Point[]): boolean {
  if (lote.length < 3 || s.ring.length < 3) return false;
  const a = caixa(s.ring);
  const b = caixa(lote);
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

/** O estilo do piso de UM ambiente (`lote` = anel do terreno do pavimento, quando há). */
export function estiloDoPiso(model: BlueprintModel, s: Space, lote: Point[] = []): EstiloDoPiso {
  if (ehAmbienteDoLote(s, lote)) return { ...ESTILO.GRAMA, origem: 'LOTE' };
  const piso = acabamentosDoAmbiente(model, s)?.piso ?? [];
  // A ÚLTIMA camada de acabamento é a que se pisa; sem função declarada, a última de todas.
  const topo = [...piso].reverse().find((c) => c.funcao === 'ACABAMENTO') ?? piso[piso.length - 1];
  const declarado = padraoDaDescricao(topo?.descricao);
  if (declarado) return { ...ESTILO[declarado], origem: 'PISO' };
  const etiqueta = s.labelUid ? (model.labels ?? []).find((l) => l.uid === s.labelUid) : undefined;
  // Nome que diz "jardim/quintal/gramado" ganha do tipo: é área externa aberta, não varanda com deck.
  if (/jardim|quintal|gramad/i.test(s.name ?? '')) return { ...ESTILO.GRAMA, origem: 'USO' };
  const porTipo = etiqueta?.tipoDeAmbiente ? PADRAO_DO_TIPO[etiqueta.tipoDeAmbiente] : null;
  if (porTipo) return { ...ESTILO[porTipo], origem: 'TIPO' };
  const uso = usoDoNome(s.name);
  const porUso = uso ? PADRAO_DO_USO[uso] : undefined;
  if (porUso) return { ...ESTILO[porUso], origem: 'USO' };
  return { ...ESTILO.PORCELANATO, origem: 'PADRAO' };
}

/** Estilo por ambiente (do pavimento pedido, ou de todos). */
export function pisosHumanizados(model: BlueprintModel, levelId?: ObjectId | null): Map<ObjectId, EstiloDoPiso> {
  const out = new Map<ObjectId, EstiloDoPiso>();
  const lotes = new Map(model.levels.map((l) => [l.id, anelDoTerreno(model.boundaries.filter((b) => b.levelId === l.id))]));
  for (const s of model.spaces) {
    if (levelId && s.levelId !== levelId) continue;
    out.set(s.id, estiloDoPiso(model, s, lotes.get(s.levelId) ?? []));
  }
  return out;
}

export interface Segmento {
  a: Point;
  b: Point;
}

/**
 * Recorta o segmento `a`→`b` pelo polígono (anel com buracos): devolve só os
 * trechos que ficam DENTRO. Vale para polígono côncavo: cruza o segmento com
 * todas as arestas, ordena os parâmetros e testa o meio de cada intervalo.
 */
export function recortarSegmento(a: Point, b: Point, ring: Point[], holes: Point[][] = []): Segmento[] {
  if (ring.length < 3) return [];
  const ts = [0, 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const arestas = (anel: Point[]) => {
    for (let i = 0; i < anel.length; i++) {
      const p = anel[i];
      const q = anel[(i + 1) % anel.length];
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den;
      const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
  };
  arestas(ring);
  for (const h of holes) arestas(h);
  ts.sort((p, q) => p - q);
  const dentro = (p: Point) => pointInPolygon(ring, p) && !holes.some((h) => pointInPolygon(h, p));
  const out: Segmento[] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i];
    const t1 = ts[i + 1];
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    if (!dentro({ x: a.x + dx * tm, y: a.y + dy * tm })) continue;
    const s = { a: { x: a.x + dx * t0, y: a.y + dy * t0 }, b: { x: a.x + dx * t1, y: a.y + dy * t1 } };
    const anterior = out[out.length - 1];
    // Intervalos vizinhos ambos dentro (cruzou um vértice) se emendam.
    if (anterior && Math.abs(anterior.b.x - s.a.x) < 1e-6 && Math.abs(anterior.b.y - s.a.y) < 1e-6) anterior.b = s.b;
    else out.push(s);
  }
  return out;
}

function caixa(ring: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Pseudoaleatório determinístico em [0,1) a partir de inteiros — a trama não pode mudar entre dois desenhos. */
function ruido(...ns: number[]): number {
  let h = 2166136261;
  for (const n of ns) {
    h ^= Math.trunc(n) & 0xffffffff;
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * A TRAMA do piso, já recortada pelo ambiente, em mm de modelo. O módulo é
 * ancorado na origem do modelo (múltiplos de `moduloMm`), para que dois
 * ambientes vizinhos com o mesmo piso alinhem as juntas.
 *
 * - PORCELANATO / CERAMICA / PEDRA: grade de juntas (a pedra desalinha as linhas horizontais a cada fiada);
 * - MADEIRA / DECK: tábuas (linhas paralelas a X a cada módulo) com topos desencontrados a cada 6 módulos;
 * - GRAMA: tufos em "V" espalhados;
 * - CARPETE / CIMENTO: sem trama.
 */
export function tramaDoPiso(s: Pick<Space, 'ring' | 'holes'>, estilo: Pick<EstiloDoPiso, 'padrao' | 'moduloMm'>): Segmento[] {
  if (s.ring.length < 3 || estilo.moduloMm <= 0) return [];
  const m = estilo.moduloMm;
  const bb = caixa(s.ring);
  const out: Segmento[] = [];
  const rec = (a: Point, b: Point) => out.push(...recortarSegmento(a, b, s.ring, s.holes));
  const x0 = Math.floor(bb.minX / m) * m;
  const y0 = Math.floor(bb.minY / m) * m;
  const LIMITE = 4000; // trama demais é ruído, não desenho
  switch (estilo.padrao) {
    case 'PORCELANATO':
    case 'CERAMICA': {
      for (let x = x0; x <= bb.maxX && out.length < LIMITE; x += m) rec({ x, y: bb.minY }, { x, y: bb.maxY });
      for (let y = y0; y <= bb.maxY && out.length < LIMITE; y += m) rec({ x: bb.minX, y }, { x: bb.maxX, y });
      break;
    }
    case 'PEDRA': {
      for (let y = y0; y <= bb.maxY && out.length < LIMITE; y += m) rec({ x: bb.minX, y }, { x: bb.maxX, y });
      // Juntas verticais desencontradas fiada a fiada (meio módulo a cada fiada ímpar).
      let fiada = 0;
      for (let y = y0; y <= bb.maxY && out.length < LIMITE; y += m, fiada++) {
        const desloc = fiada % 2 ? m / 2 : 0;
        for (let x = x0 + desloc; x <= bb.maxX; x += m) rec({ x, y }, { x, y: y + m });
      }
      break;
    }
    case 'MADEIRA':
    case 'DECK': {
      const comprimento = m * 6;
      let fiada = 0;
      for (let y = y0; y <= bb.maxY && out.length < LIMITE; y += m, fiada++) {
        rec({ x: bb.minX, y }, { x: bb.maxX, y });
        // Topos das tábuas: desencontrados a cada fiada, um terço por fiada.
        const desloc = ((fiada % 3) * comprimento) / 3;
        for (let x = Math.floor(bb.minX / comprimento) * comprimento + desloc; x <= bb.maxX; x += comprimento) rec({ x, y }, { x, y: y + m });
      }
      break;
    }
    case 'GRAMA': {
      // Um tufo por célula, deslocado pelo ruído determinístico da célula.
      for (let y = y0; y <= bb.maxY && out.length < LIMITE; y += m) {
        for (let x = x0; x <= bb.maxX; x += m) {
          const cx = x + m * (0.2 + 0.6 * ruido(x, y, 1));
          const cy = y + m * (0.2 + 0.6 * ruido(x, y, 2));
          const h = m * 0.16;
          const w = m * 0.1;
          if (!pointInPolygon(s.ring, { x: cx, y: cy })) continue;
          rec({ x: cx - w, y: cy }, { x: cx, y: cy + h });
          rec({ x: cx, y: cy + h }, { x: cx + w, y: cy });
        }
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/**
 * A SOMBRA de uma parede: o retângulo dela (com o avanço de canto, como o
 * desenho) deslocado. Pintada sob as paredes, sobre os pisos.
 */
export function sombraDaParede(walls: Wall[], w: Wall, desloc = DESLOCAMENTO_DA_SOMBRA_MM): Point[] {
  const anel = cantosDaParede(w.a, w.b, w.thicknessMm, extensaoDeCanto(walls, w, 'a'), extensaoDeCanto(walls, w, 'b'));
  return anel.map((p) => ({ x: p.x + desloc.dx, y: p.y + desloc.dy }));
}

/** O contorno CHEIO da parede (mesmo retângulo estendido), para pintar sólido. */
export function corpoDaParede(walls: Wall[], w: Wall): Point[] {
  return cantosDaParede(w.a, w.b, w.thicknessMm, extensaoDeCanto(walls, w, 'a'), extensaoDeCanto(walls, w, 'b'));
}

export interface Planta {
  tipo: 'ARVORE' | 'ARBUSTO';
  at: Point;
  raioMm: number;
}

/**
 * VEGETAÇÃO SIMBÓLICA do pavimento: árvores no LOTE fora da edificação
 * (quando há lote traçado) e um arbusto por varanda/jardim. Determinística:
 * a mesma planta dá as mesmas árvores. Não entra em quantitativo nenhum — é
 * desenho de apresentação, e o rótulo do painel diz isso.
 */
export function vegetacaoSimbolica(model: BlueprintModel, levelId: ObjectId): Planta[] {
  const out: Planta[] = [];
  const lote = anelDoTerreno(model.boundaries.filter((b) => b.levelId === levelId));
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const ambientes = model.spaces.filter((s) => s.levelId === levelId);
  if (lote.length >= 3 && paredes.length > 0) {
    const bb = caixa(lote);
    const PASSO = 2500;
    const RAIO = 1000;
    const longeDasParedes = (p: Point) =>
      paredes.every((w) => {
        const dx = w.b.x - w.a.x;
        const dy = w.b.y - w.a.y;
        const c2 = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / c2));
        return Math.hypot(w.a.x + u * dx - p.x, w.a.y + u * dy - p.y) >= RAIO + w.thicknessMm / 2 + 150;
      });
    const dentroDoLoteComFolga = (p: Point) =>
      [0, 90, 180, 270].every((g) => pointInPolygon(lote, { x: p.x + RAIO * Math.cos((g * Math.PI) / 180), y: p.y + RAIO * Math.sin((g * Math.PI) / 180) }));
    // Fora de qualquer ambiente da CASA (o do lote não conta: a árvore está justamente nele).
    const foraDaEdificacao = (p: Point) => !ambientes.some((s) => !ehAmbienteDoLote(s, lote) && pointInPolygon(s.ring, p) && !s.holes.some((h) => pointInPolygon(h, p)));
    let i = 0;
    for (let y = Math.floor(bb.minY / PASSO) * PASSO + PASSO / 2; y <= bb.maxY; y += PASSO) {
      for (let x = Math.floor(bb.minX / PASSO) * PASSO + PASSO / 2; x <= bb.maxX; x += PASSO, i++) {
        // Escolhe uma em cada duas células, com o ruído — árvore em grade perfeita parece pomar.
        if (ruido(x, y, 7) < 0.5) continue;
        const p = { x: Math.round(x + PASSO * 0.3 * (ruido(x, y, 3) - 0.5)), y: Math.round(y + PASSO * 0.3 * (ruido(x, y, 4) - 0.5)) };
        if (!dentroDoLoteComFolga(p) || !foraDaEdificacao(p) || !longeDasParedes(p)) continue;
        out.push({ tipo: 'ARVORE', at: p, raioMm: Math.round(RAIO * (0.8 + 0.4 * ruido(x, y, 5))) });
        if (out.length >= 24) break;
      }
      if (out.length >= 24) break;
    }
  }
  // Um arbusto por varanda/jardim, no canto mais afastado do centro do pavimento.
  const etiquetaDe = (s: Space) => (s.labelUid ? (model.labels ?? []).find((l) => l.uid === s.labelUid) : undefined);
  for (const s of ambientes) {
    const ehVerde = etiquetaDe(s)?.tipoDeAmbiente === 'VARANDA' || usoDoNome(s.name) === 'VARANDA' || /jardim|quintal/i.test(s.name ?? '');
    if (!ehVerde || s.ring.length < 3) continue;
    const bb = caixa(s.ring);
    const raio = Math.max(150, Math.min(400, Math.round(Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.12)));
    const cantos = [
      { x: bb.minX + raio + 100, y: bb.minY + raio + 100 },
      { x: bb.maxX - raio - 100, y: bb.minY + raio + 100 },
      { x: bb.maxX - raio - 100, y: bb.maxY - raio - 100 },
      { x: bb.minX + raio + 100, y: bb.maxY - raio - 100 },
    ].filter((p) => pointInPolygon(s.ring, p));
    if (cantos.length === 0) continue;
    // Estável: o primeiro canto que cabe (a ordem é fixa).
    out.push({ tipo: 'ARBUSTO', at: cantos[0], raioMm: raio });
  }
  return out;
}

/** O contorno da copa como polígono (n lados), para quem não tem círculo — o PDF. */
export function copa(p: Planta, lados = 16): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < lados; i++) {
    const g = (i / lados) * Math.PI * 2;
    // Copa ligeiramente irregular, determinística pelo índice.
    const r = p.raioMm * (p.tipo === 'ARVORE' ? 0.92 + 0.08 * ruido(p.at.x, p.at.y, i) : 1);
    out.push({ x: p.at.x + r * Math.cos(g), y: p.at.y + r * Math.sin(g) });
  }
  return out;
}

export type TracoDoSimbolo =
  | { tipo: 'linha'; a: [number, number]; b: [number, number] }
  | { tipo: 'poli'; pontos: [number, number][] }
  /** Centro e raio em FRAÇÃO do menor lado. */
  | { tipo: 'circulo'; c: [number, number]; r: number }
  /** Centro e raios em fração da largura (rx) e da profundidade (ry). */
  | { tipo: 'elipse'; c: [number, number]; rx: number; ry: number };

/**
 * O símbolo de cada peça no espaço LOCAL (x ao longo da largura, y da frente
 * ao encosto, ambos 0..1) — o mesmo desenho do canvas, em forma de dados, para
 * o PDF humanizado desenhar a mesma coisa.
 */
export function tracosDoSimbolo(simbolo: (typeof CATALOGO_DE_COMPONENTES)[keyof typeof CATALOGO_DE_COMPONENTES]['simbolo']): TracoDoSimbolo[] {
  switch (simbolo) {
    case 'CAMA':
      return [
        { tipo: 'linha', a: [0, 0.85], b: [1, 0.85] },
        { tipo: 'poli', pontos: [[0.08, 0.7], [0.46, 0.7], [0.46, 0.82], [0.08, 0.82]] },
        { tipo: 'poli', pontos: [[0.54, 0.7], [0.92, 0.7], [0.92, 0.82], [0.54, 0.82]] },
        { tipo: 'linha', a: [0, 0.55], b: [1, 0.55] },
      ];
    case 'SOFA':
      return [
        { tipo: 'linha', a: [0, 0.75], b: [1, 0.75] },
        { tipo: 'linha', a: [0.12, 0], b: [0.12, 0.75] },
        { tipo: 'linha', a: [0.88, 0], b: [0.88, 0.75] },
      ];
    case 'MESA':
      return [{ tipo: 'poli', pontos: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]] }];
    case 'VASO':
      return [
        { tipo: 'elipse', c: [0.5, 0.4], rx: 0.4, ry: 0.32 },
        { tipo: 'poli', pontos: [[0.1, 0.78], [0.9, 0.78], [0.9, 1], [0.1, 1]] },
      ];
    case 'LAVATORIO':
      return [{ tipo: 'elipse', c: [0.5, 0.5], rx: 0.36, ry: 0.34 }];
    case 'BOX':
      return [
        { tipo: 'linha', a: [0, 0], b: [1, 1] },
        { tipo: 'linha', a: [0.42, 0.5], b: [0.58, 0.5] },
      ];
    case 'PIA':
      return [{ tipo: 'poli', pontos: [[0.1, 0.2], [0.42, 0.2], [0.42, 0.8], [0.1, 0.8]] }];
    case 'FOGAO':
      return [
        { tipo: 'circulo', c: [0.28, 0.3], r: 0.14 },
        { tipo: 'circulo', c: [0.72, 0.3], r: 0.14 },
        { tipo: 'circulo', c: [0.28, 0.7], r: 0.14 },
        { tipo: 'circulo', c: [0.72, 0.7], r: 0.14 },
      ];
    case 'GELADEIRA':
      return [{ tipo: 'linha', a: [0, 0.6], b: [1, 0.6] }];
    case 'TANQUE':
      return [{ tipo: 'poli', pontos: [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]] }];
    case 'MAQUINA':
      return [{ tipo: 'circulo', c: [0.5, 0.5], r: 0.3 }];
    case 'ARMARIO':
      return [
        { tipo: 'linha', a: [0, 0], b: [1, 1] },
        { tipo: 'linha', a: [1, 0], b: [0, 1] },
      ];
    case 'CADEIRA':
      return [{ tipo: 'linha', a: [0, 0.8], b: [1, 0.8] }];
    default:
      return [];
  }
}

/**
 * O símbolo de UM componente já no MUNDO (mm de modelo): contorno + traços em
 * segmentos e polilinhas (círculos e elipses viram polígonos de 24 lados). É
 * o que o PDF desenha; o canvas continua com arcos verdadeiros.
 */
export function simboloNoMundo(c: Componente): { contorno: Point[]; tracos: Point[][]; cores: { fundo: string; traco: string } } {
  const anel = contornoDoComponente(c);
  const ux = { x: anel[1].x - anel[0].x, y: anel[1].y - anel[0].y };
  const uy = { x: anel[3].x - anel[0].x, y: anel[3].y - anel[0].y };
  const P = (fx: number, fy: number): Point => ({ x: anel[0].x + ux.x * fx + uy.x * fy, y: anel[0].y + ux.y * fx + uy.y * fy });
  const menor = Math.min(c.larguraMm, c.profundidadeMm);
  const tracos: Point[][] = [];
  for (const t of tracosDoSimbolo(CATALOGO_DE_COMPONENTES[c.tipoId]?.simbolo ?? 'CAIXA')) {
    if (t.tipo === 'linha') tracos.push([P(...t.a), P(...t.b)]);
    else if (t.tipo === 'poli') tracos.push([...t.pontos.map((p) => P(...p)), P(...t.pontos[0])]);
    else {
      const rx = t.tipo === 'circulo' ? (t.r * menor) / c.larguraMm : t.rx;
      const ry = t.tipo === 'circulo' ? (t.r * menor) / c.profundidadeMm : t.ry;
      const pts: Point[] = [];
      for (let i = 0; i <= 24; i++) {
        const g = (i / 24) * Math.PI * 2;
        pts.push(P(t.c[0] + rx * Math.cos(g), t.c[1] + ry * Math.sin(g)));
      }
      tracos.push(pts);
    }
  }
  return { contorno: anel, tracos, cores: COR_DA_FAMILIA[c.familia] ?? COR_DA_FAMILIA.MOBILIARIO };
}

/** Resumo para o rótulo do painel: quantos ambientes por padrão e de onde veio. */
export function resumirPisos(pisos: Map<ObjectId, EstiloDoPiso>): { padrao: PadraoDePiso; rotulo: string; quantidade: number; declarados: number }[] {
  const porPadrao = new Map<PadraoDePiso, { quantidade: number; declarados: number }>();
  for (const e of pisos.values()) {
    const atual = porPadrao.get(e.padrao) ?? { quantidade: 0, declarados: 0 };
    atual.quantidade++;
    if (e.origem === 'PISO') atual.declarados++;
    porPadrao.set(e.padrao, atual);
  }
  return PADROES_DE_PISO.filter((p) => porPadrao.has(p)).map((p) => ({ padrao: p, rotulo: ROTULO_DO_PADRAO[p], ...porPadrao.get(p)! }));
}
