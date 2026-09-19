/**
 * MOBILIÁRIO MÍNIMO E CIRCULAÇÃO LIVRE (19/09/2026, roadmap E6.3).
 *
 * Para cada ambiente, pelo USO que o nome sugere (`usoDoNome`, E4.1), o kit
 * mínimo de peças com as medidas de mercado — cama de casal 1,40 × 1,90 e
 * armário 0,60 de fundo no dormitório; sofá 2,00 × 0,90 e mesa 1,40 × 0,90 na
 * sala; bancada 0,60 de fundo, geladeira e fogão na cozinha; tanque e máquina
 * no serviço; vaso, lavatório e box no banheiro; escrivaninha no escritório;
 * vagas 2,50 × 5,00 na garagem — cada uma com a FAIXA DE USO na frente (o
 * lado de uma cama, a frente de um armário, o assento da mesa) que não pode
 * ser invadida.
 *
 * COLOCAÇÃO determinística: trabalha no maior retângulo interno do ambiente
 * (face interna das paredes); as PORTAS reservam o vão + o giro (0,90 m de
 * profundidade) e as JANELAS proíbem peça alta (armário, geladeira) no lado
 * delas e o encosto da cama sob elas. Peças que encostam em parede tentam os
 * lados na ordem de preferência da peça (armário: lado sem porta nem janela;
 * cama: cabeceira no lado sem janela, oposto à porta…), da esquerda para a
 * direita, sem sobrepor peça, faixa de uso ou giro de porta. Peça que não
 * cabe é DECLARADA ("não coube").
 *
 * CIRCULAÇÃO LIVRE verificada em grade de 50 mm: transformada de distância
 * (Chebyshev) sobre as células livres e busca em largura, da porta até a
 * faixa de uso de cada peça, só por células com folga ≥ metade da largura
 * pedida — 0,90 m (mínimo) e 1,20 m (rota acessível, NBR 9050). O resultado
 * diz a maior largura que passa (busca binária) e quais peças ficam fora
 * dela. Sem porta, mede a partir do centro do ambiente e avisa.
 *
 * Tudo derivado — o mobiliário do kernel (E7.1, `Componente`) ainda não
 * existe; quando chegar, "aceitar" persiste o que hoje é sugestão. As vagas
 * da garagem vão pelo planejador da E2.5 (`planejarVagas`), que já persiste.
 */
import { anelRecuado, contornoDoComponente, pointInPolygon, wallLength, type BlueprintModel, type Command, type ObjectId, type Opening, type Point, type Space, type TipoDeComponente, type Wall } from './blueprintKernel';
import { usoDoNome, type UsoDoAmbiente } from './blueprintPrograma';

export type TipoDePeca =
  | 'CAMA_CASAL'
  | 'CAMA_SOLTEIRO'
  | 'ARMARIO'
  | 'CRIADO'
  | 'SOFA'
  | 'MESA_JANTAR'
  | 'RACK'
  | 'BANCADA'
  | 'GELADEIRA'
  | 'FOGAO'
  | 'TANQUE'
  | 'MAQUINA'
  | 'VASO'
  | 'LAVATORIO'
  | 'BOX'
  | 'ESCRIVANINHA'
  | 'CADEIRA';

export interface PecaDeMobiliario {
  tipo: TipoDePeca;
  rotulo: string;
  /** Ao longo da parede em que encosta. */
  larguraMm: number;
  /** Para dentro do ambiente. */
  profundidadeMm: number;
  /** Faixa de uso na frente (mm) — não pode ser invadida por outra peça. */
  usoFrenteMm: number;
  /** Faixa de uso nos lados (cama). */
  usoLadosMm: number;
  alta: boolean;
  /** Preferência de lado: 'CEGO' (sem porta nem janela), 'QUALQUER', 'LIVRE' (não encosta). */
  encosta: 'CEGO' | 'QUALQUER' | 'LIVRE';
  prioridade: number;
}

const P = (tipo: TipoDePeca, rotulo: string, larguraMm: number, profundidadeMm: number, usoFrenteMm: number, o: Partial<PecaDeMobiliario> = {}): PecaDeMobiliario => ({
  tipo,
  rotulo,
  larguraMm,
  profundidadeMm,
  usoFrenteMm,
  usoLadosMm: 0,
  alta: false,
  encosta: 'QUALQUER',
  prioridade: 5,
  ...o,
});

/** O kit mínimo por uso, na ordem em que as peças disputam o espaço. */
export const KIT_POR_USO: Partial<Record<UsoDoAmbiente, PecaDeMobiliario[]>> = {
  DORMITORIO: [P('CAMA_CASAL', 'Cama de casal', 1400, 1900, 600, { usoLadosMm: 600, encosta: 'CEGO', prioridade: 1 }), P('ARMARIO', 'Armário', 1800, 600, 600, { alta: true, encosta: 'CEGO', prioridade: 2 }), P('CRIADO', 'Criado-mudo', 500, 400, 0, { prioridade: 6 })],
  SUITE: [P('CAMA_CASAL', 'Cama de casal', 1600, 2000, 600, { usoLadosMm: 600, encosta: 'CEGO', prioridade: 1 }), P('ARMARIO', 'Armário', 2400, 600, 600, { alta: true, encosta: 'CEGO', prioridade: 2 }), P('CRIADO', 'Criado-mudo', 500, 400, 0, { prioridade: 6 })],
  SALA: [P('SOFA', 'Sofá', 2000, 900, 600, { prioridade: 1 }), P('MESA_JANTAR', 'Mesa de jantar', 1400, 900, 600, { usoLadosMm: 600, encosta: 'LIVRE', prioridade: 2 }), P('RACK', 'Rack/TV', 1600, 450, 0, { prioridade: 4 })],
  COZINHA: [P('BANCADA', 'Bancada com pia', 1800, 600, 900, { prioridade: 1 }), P('GELADEIRA', 'Geladeira', 700, 700, 900, { alta: true, prioridade: 2 }), P('FOGAO', 'Fogão', 600, 600, 900, { prioridade: 3 })],
  AREA_DE_SERVICO: [P('TANQUE', 'Tanque', 600, 600, 800, { prioridade: 1 }), P('MAQUINA', 'Máquina de lavar', 600, 650, 800, { prioridade: 2 })],
  BANHEIRO: [P('BOX', 'Box', 900, 900, 600, { prioridade: 1 }), P('VASO', 'Vaso sanitário', 400, 650, 600, { prioridade: 2 }), P('LAVATORIO', 'Lavatório', 500, 450, 600, { prioridade: 3 })],
  LAVABO: [P('VASO', 'Vaso sanitário', 400, 650, 600, { prioridade: 1 }), P('LAVATORIO', 'Lavatório', 500, 450, 600, { prioridade: 2 })],
  ESCRITORIO: [P('ESCRIVANINHA', 'Escrivaninha', 1200, 600, 800, { prioridade: 1 }), P('ARMARIO', 'Estante', 900, 400, 600, { alta: true, encosta: 'CEGO', prioridade: 3 })],
};

export interface Retangulo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PecaColocada {
  peca: PecaDeMobiliario;
  /** A peça, em mm do mundo. */
  ret: Retangulo;
  /** Peça + faixas de uso. */
  comUso: Retangulo;
  lado: 'S' | 'N' | 'O' | 'L' | 'CENTRO';
}

export interface CirculacaoDoAmbiente {
  /** Maior largura (mm) que passa da porta à frente de TODAS as peças. `null` sem peça. */
  larguraLivreMm: number | null;
  ok90: boolean;
  ok120: boolean;
  /** Peças cuja frente não se alcança com 0,90 m. */
  foraDaRota90: string[];
  semPorta: boolean;
}

export interface MobiliarioDoAmbiente {
  spaceId: ObjectId;
  levelId: ObjectId;
  rotulo: string;
  uso: UsoDoAmbiente | null;
  interno: Retangulo | null;
  pecas: PecaColocada[];
  naoCouberam: string[];
  circulacao: CirculacaoDoAmbiente;
}

export interface HipotesesDeMobiliario {
  /** Exigir 1,20 m (rota acessível) em vez de 0,90. */
  acessivel: boolean;
  /** Profundidade do giro reservado à frente da porta. */
  giroDaPortaMm: number;
}
export const HIPOTESES_MOBILIARIO_PADRAO: HipotesesDeMobiliario = { acessivel: false, giroDaPortaMm: 900 };

const MALHA = 50;

// ─── Geometria de apoio ──────────────────────────────────────────────────────

function caixa(ps: readonly Point[]): Retangulo {
  return { x0: Math.min(...ps.map((p) => p.x)), y0: Math.min(...ps.map((p) => p.y)), x1: Math.max(...ps.map((p) => p.x)), y1: Math.max(...ps.map((p) => p.y)) };
}
const sobrepoe = (a: Retangulo, b: Retangulo) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
const dentro = (a: Retangulo, b: Retangulo) => a.x0 >= b.x0 - 1 && a.y0 >= b.y0 - 1 && a.x1 <= b.x1 + 1 && a.y1 <= b.y1 + 1;

/** O maior retângulo de eixos alinhados dentro do anel interno (grade de 100 mm), ou a caixa quando o anel já é retângulo. */
function maiorRetanguloInterno(anel: Point[]): Retangulo | null {
  if (anel.length < 3) return null;
  const c = caixa(anel);
  const cantos = [
    { x: c.x0 + 1, y: c.y0 + 1 },
    { x: c.x1 - 1, y: c.y0 + 1 },
    { x: c.x1 - 1, y: c.y1 - 1 },
    { x: c.x0 + 1, y: c.y1 - 1 },
  ];
  if (cantos.every((p) => pointInPolygon(anel, p))) return c;
  const passo = 100;
  const nx = Math.max(1, Math.floor((c.x1 - c.x0) / passo));
  const ny = Math.max(1, Math.floor((c.y1 - c.y0) / passo));
  const livre: boolean[][] = [];
  for (let j = 0; j < ny; j++) {
    const l: boolean[] = [];
    for (let i = 0; i < nx; i++) {
      const cx = c.x0 + (i + 0.5) * passo;
      const cy = c.y0 + (j + 0.5) * passo;
      const d = passo / 2 - 1;
      l.push([{ x: cx - d, y: cy - d }, { x: cx + d, y: cy - d }, { x: cx + d, y: cy + d }, { x: cx - d, y: cy + d }].every((p) => pointInPolygon(anel, p)));
    }
    livre.push(l);
  }
  let melhor: { area: number; ret: Retangulo } | null = null;
  const alturas = new Array(nx).fill(0) as number[];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) alturas[i] = livre[j][i] ? alturas[i] + 1 : 0;
    const pilha: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const h = i < nx ? alturas[i] : 0;
      while (pilha.length && alturas[pilha[pilha.length - 1]] >= h) {
        const topo = pilha.pop()!;
        const altura = alturas[topo];
        const esq = pilha.length ? pilha[pilha.length - 1] + 1 : 0;
        const area = altura * (i - esq);
        if (altura > 0 && (!melhor || area > melhor.area)) melhor = { area, ret: { x0: c.x0 + esq * passo, y0: c.y0 + (j - altura + 1) * passo, x1: c.x0 + i * passo, y1: c.y0 + (j + 1) * passo } };
      }
      pilha.push(i);
    }
  }
  return melhor?.ret ?? null;
}

/** Anel interno (face das paredes) do ambiente. */
export function anelInternoDoAmbiente(s: Space, paredes: readonly Wall[]): Point[] {
  const n = s.ring.length;
  const recuos = s.ring.map((a, i) => {
    const b = s.ring[(i + 1) % n];
    const w = paredes.find((x) => {
      const cruz = (p: Point) => (x.b.x - x.a.x) * (p.y - x.a.y) - (x.b.y - x.a.y) * (p.x - x.a.x);
      const entre = (p: Point) => Math.min(x.a.x, x.b.x) - 1 <= p.x && p.x <= Math.max(x.a.x, x.b.x) + 1 && Math.min(x.a.y, x.b.y) - 1 <= p.y && p.y <= Math.max(x.a.y, x.b.y) + 1;
      return Math.abs(cruz(a)) < 1 && Math.abs(cruz(b)) < 1 && entre(a) && entre(b);
    });
    return w ? w.thicknessMm / 2 : 0;
  });
  const anel = anelRecuado(s.ring, recuos);
  return anel.length >= 3 ? anel : s.ring;
}

type Lado = 'S' | 'N' | 'O' | 'L';
const LADOS: Lado[] = ['S', 'N', 'O', 'L'];

interface AberturaNoLado {
  lado: Lado;
  kind: Opening['kind'];
  /** Intervalo ao longo do lado, em coordenada do mundo (x para S/N, y para O/L). */
  ini: number;
  fim: number;
}

/** As aberturas das paredes do ambiente, projetadas nos lados do retângulo interno. */
function aberturasNosLados(model: BlueprintModel, s: Space, interno: Retangulo): AberturaNoLado[] {
  const out: AberturaNoLado[] = [];
  const paredes = model.walls.filter((w) => w.levelId === s.levelId);
  for (const o of model.openings) {
    const w = paredes.find((x) => x.id === o.wallId);
    if (!w) continue;
    const L = wallLength(w) || 1;
    const ux = (w.b.x - w.a.x) / L;
    const uy = (w.b.y - w.a.y) / L;
    const a = { x: w.a.x + ux * o.offsetMm, y: w.a.y + uy * o.offsetMm };
    const b = { x: a.x + ux * o.widthMm, y: a.y + uy * o.widthMm };
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const tol = w.thicknessMm / 2 + 30;
    const horizontal = Math.abs(uy) < 1e-6;
    if (horizontal) {
      const dentroX = meio.x >= interno.x0 - 1 && meio.x <= interno.x1 + 1;
      if (!dentroX) continue;
      if (Math.abs(meio.y - interno.y0) <= tol) out.push({ lado: 'S', kind: o.kind, ini: Math.min(a.x, b.x), fim: Math.max(a.x, b.x) });
      else if (Math.abs(meio.y - interno.y1) <= tol) out.push({ lado: 'N', kind: o.kind, ini: Math.min(a.x, b.x), fim: Math.max(a.x, b.x) });
    } else if (Math.abs(ux) < 1e-6) {
      const dentroY = meio.y >= interno.y0 - 1 && meio.y <= interno.y1 + 1;
      if (!dentroY) continue;
      if (Math.abs(meio.x - interno.x0) <= tol) out.push({ lado: 'O', kind: o.kind, ini: Math.min(a.y, b.y), fim: Math.max(a.y, b.y) });
      else if (Math.abs(meio.x - interno.x1) <= tol) out.push({ lado: 'L', kind: o.kind, ini: Math.min(a.y, b.y), fim: Math.max(a.y, b.y) });
    }
  }
  return out;
}

/** O retângulo de giro de uma porta (vão + profundidade para dentro). */
function giroDaPorta(ab: AberturaNoLado, interno: Retangulo, giroMm: number): Retangulo {
  switch (ab.lado) {
    case 'S':
      return { x0: ab.ini, y0: interno.y0, x1: ab.fim, y1: Math.min(interno.y1, interno.y0 + giroMm) };
    case 'N':
      return { x0: ab.ini, y0: Math.max(interno.y0, interno.y1 - giroMm), x1: ab.fim, y1: interno.y1 };
    case 'O':
      return { x0: interno.x0, y0: ab.ini, x1: Math.min(interno.x1, interno.x0 + giroMm), y1: ab.fim };
    case 'L':
      return { x0: Math.max(interno.x0, interno.x1 - giroMm), y0: ab.ini, x1: interno.x1, y1: ab.fim };
  }
}

/** A peça encostada num lado, com o canto "inicial" em `t` (coordenada ao longo do lado); devolve peça e peça+uso. */
function colocarNoLado(p: PecaDeMobiliario, lado: Lado, t: number, interno: Retangulo): { ret: Retangulo; comUso: Retangulo } {
  const ul = p.usoLadosMm;
  const uf = p.usoFrenteMm;
  switch (lado) {
    case 'S':
      return { ret: { x0: t, y0: interno.y0, x1: t + p.larguraMm, y1: interno.y0 + p.profundidadeMm }, comUso: { x0: t - ul, y0: interno.y0, x1: t + p.larguraMm + ul, y1: interno.y0 + p.profundidadeMm + uf } };
    case 'N':
      return { ret: { x0: t, y0: interno.y1 - p.profundidadeMm, x1: t + p.larguraMm, y1: interno.y1 }, comUso: { x0: t - ul, y0: interno.y1 - p.profundidadeMm - uf, x1: t + p.larguraMm + ul, y1: interno.y1 } };
    case 'O':
      return { ret: { x0: interno.x0, y0: t, x1: interno.x0 + p.profundidadeMm, y1: t + p.larguraMm }, comUso: { x0: interno.x0, y0: t - ul, x1: interno.x0 + p.profundidadeMm + uf, y1: t + p.larguraMm + ul } };
    case 'L':
      return { ret: { x0: interno.x1 - p.profundidadeMm, y0: t, x1: interno.x1, y1: t + p.larguraMm }, comUso: { x0: interno.x1 - p.profundidadeMm - uf, y0: t - ul, x1: interno.x1, y1: t + p.larguraMm + ul } };
  }
}

function comprimentoDoLado(lado: Lado, interno: Retangulo): [number, number] {
  return lado === 'S' || lado === 'N' ? [interno.x0, interno.x1] : [interno.y0, interno.y1];
}

/** Recorta a faixa de uso ao retângulo interno (a faixa pode sair pela parede — não importa). */
const recortar = (r: Retangulo, interno: Retangulo): Retangulo => ({ x0: Math.max(r.x0, interno.x0), y0: Math.max(r.y0, interno.y0), x1: Math.min(r.x1, interno.x1), y1: Math.min(r.y1, interno.y1) });

// ─── Colocação ───────────────────────────────────────────────────────────────

export function mobiliarDoAmbiente(model: BlueprintModel, s: Space, hip: HipotesesDeMobiliario = HIPOTESES_MOBILIARIO_PADRAO): MobiliarioDoAmbiente {
  const paredes = model.walls.filter((w) => w.levelId === s.levelId);
  const uso = usoDoNome(s.name);
  const rotulo = s.name || 'Ambiente';
  const vazio = (interno: Retangulo | null): MobiliarioDoAmbiente => ({ spaceId: s.id, levelId: s.levelId, rotulo, uso, interno, pecas: [], naoCouberam: [], circulacao: { larguraLivreMm: null, ok90: true, ok120: true, foraDaRota90: [], semPorta: false } });
  const kit = uso ? KIT_POR_USO[uso] : undefined;
  const anel = anelInternoDoAmbiente(s, paredes);
  const interno = maiorRetanguloInterno(anel);
  if (!kit || !interno) return vazio(interno);
  const aberturas = aberturasNosLados(model, s, interno);
  const portas = aberturas.filter((a) => a.kind !== 'window');
  const janelas = aberturas.filter((a) => a.kind === 'window');
  const reservados: Retangulo[] = portas.map((p) => giroDaPorta(p, interno, hip.giroDaPortaMm));
  const ocupadosPecas: Retangulo[] = [];
  const ocupadosUsos: Retangulo[] = []; // as faixas de uso podem se sobrepor entre si (o pé da cama e a frente do armário dividem a mesma faixa), nunca com peça
  const pecas: PecaColocada[] = [];
  const naoCouberam: string[] = [];
  const ladoTemPorta = (l: Lado) => portas.some((p) => p.lado === l);
  const ladoTemJanela = (l: Lado) => janelas.some((p) => p.lado === l);
  const ladoOpostoAPorta = (): Lado | null => {
    const p = portas[0];
    if (!p) return null;
    return ({ S: 'N', N: 'S', O: 'L', L: 'O' } as const)[p.lado];
  };
  const ordemDosLados = (p: PecaDeMobiliario): Lado[] => {
    const nota = (l: Lado) => {
      let n = 0;
      if (ladoTemPorta(l)) n += 4;
      if (ladoTemJanela(l)) n += p.alta || p.tipo.startsWith('CAMA') ? 6 : 1;
      if (p.tipo.startsWith('CAMA') && l === ladoOpostoAPorta()) n -= 2;
      // Lados mais compridos primeiro em empate (cabem mais peças).
      const [a, b] = comprimentoDoLado(l, interno);
      n -= (b - a) / 1e6;
      return n;
    };
    return [...LADOS].sort((a, b) => nota(a) - nota(b));
  };
  const cabe = (comUso: Retangulo, ret: Retangulo) => {
    if (!dentro(ret, interno)) return false;
    const uso = recortar(comUso, interno);
    // A peça não invade peça, faixa de uso alheia nem giro de porta; a faixa de uso não invade peça.
    return !ocupadosPecas.some((o) => sobrepoe(o, ret) || sobrepoe(o, uso)) && !ocupadosUsos.some((o) => sobrepoe(o, ret)) && !reservados.some((r) => sobrepoe(r, ret));
  };
  for (const p of [...kit].sort((a, b) => a.prioridade - b.prioridade)) {
    let colocada: PecaColocada | null = null;
    if (p.encosta === 'LIVRE') {
      // No centro; se não couber, encostada como as outras.
      const cx = (interno.x0 + interno.x1) / 2;
      const cy = (interno.y0 + interno.y1) / 2;
      const ret = { x0: Math.round((cx - p.larguraMm / 2) / MALHA) * MALHA, y0: Math.round((cy - p.profundidadeMm / 2) / MALHA) * MALHA, x1: 0, y1: 0 };
      ret.x1 = ret.x0 + p.larguraMm;
      ret.y1 = ret.y0 + p.profundidadeMm;
      const comUso = { x0: ret.x0 - p.usoLadosMm, y0: ret.y0 - p.usoFrenteMm, x1: ret.x1 + p.usoLadosMm, y1: ret.y1 + p.usoFrenteMm };
      if (cabe(comUso, ret)) colocada = { peca: p, ret, comUso: recortar(comUso, interno), lado: 'CENTRO' };
    }
    if (!colocada) {
      for (const lado of ordemDosLados(p)) {
        if (p.encosta === 'CEGO' && ladoTemPorta(lado) && LADOS.some((l) => !ladoTemPorta(l) && !ladoTemJanela(l))) continue;
        const [ini, fim] = comprimentoDoLado(lado, interno);
        for (let t = ini; t + p.larguraMm <= fim + 1; t += MALHA) {
          const { ret, comUso } = colocarNoLado(p, lado, t, interno);
          if (cabe(comUso, ret)) {
            colocada = { peca: p, ret, comUso: recortar(comUso, interno), lado };
            break;
          }
        }
        if (colocada) break;
      }
    }
    if (colocada) {
      pecas.push(colocada);
      ocupadosPecas.push(colocada.ret);
      ocupadosUsos.push(colocada.comUso);
    } else naoCouberam.push(p.rotulo);
  }
  return { spaceId: s.id, levelId: s.levelId, rotulo, uso, interno, pecas, naoCouberam, circulacao: verificarCirculacao(interno, pecas, portas) };
}

// ─── Circulação livre por grade ──────────────────────────────────────────────

function verificarCirculacao(interno: Retangulo, pecas: readonly PecaColocada[], portas: readonly AberturaNoLado[]): CirculacaoDoAmbiente {
  if (pecas.length === 0) return { larguraLivreMm: null, ok90: true, ok120: true, foraDaRota90: [], semPorta: portas.length === 0 };
  const nx = Math.max(1, Math.round((interno.x1 - interno.x0) / MALHA));
  const ny = Math.max(1, Math.round((interno.y1 - interno.y0) / MALHA));
  const idx = (i: number, j: number) => j * nx + i;
  const livre = new Uint8Array(nx * ny).fill(1);
  const celula = (x: number, y: number) => ({ i: Math.min(nx - 1, Math.max(0, Math.floor((x - interno.x0) / MALHA))), j: Math.min(ny - 1, Math.max(0, Math.floor((y - interno.y0) / MALHA))) });
  for (const p of pecas) {
    const a = celula(p.ret.x0 + 1, p.ret.y0 + 1);
    const b = celula(p.ret.x1 - 1, p.ret.y1 - 1);
    for (let j = a.j; j <= b.j; j++) for (let i = a.i; i <= b.i; i++) livre[idx(i, j)] = 0;
  }
  // Distância de Chebyshev à peça ou parede mais próxima (em células), duas passadas.
  const INF = 1 << 20;
  const dist = new Int32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (!livre[idx(i, j)]) {
        dist[idx(i, j)] = 0;
        continue;
      }
      let d = Math.min(i + 1, j + 1); // borda = parede
      if (i > 0) d = Math.min(d, dist[idx(i - 1, j)] + 1);
      if (j > 0) d = Math.min(d, dist[idx(i, j - 1)] + 1);
      if (i > 0 && j > 0) d = Math.min(d, dist[idx(i - 1, j - 1)] + 1);
      if (i < nx - 1 && j > 0) d = Math.min(d, dist[idx(i + 1, j - 1)] + 1);
      dist[idx(i, j)] = Math.min(d, INF);
    }
  for (let j = ny - 1; j >= 0; j--)
    for (let i = nx - 1; i >= 0; i--) {
      if (!livre[idx(i, j)]) continue;
      let d = Math.min(dist[idx(i, j)], nx - i, ny - j);
      if (i < nx - 1) d = Math.min(d, dist[idx(i + 1, j)] + 1);
      if (j < ny - 1) d = Math.min(d, dist[idx(i, j + 1)] + 1);
      if (i < nx - 1 && j < ny - 1) d = Math.min(d, dist[idx(i + 1, j + 1)] + 1);
      if (i > 0 && j < ny - 1) d = Math.min(d, dist[idx(i - 1, j + 1)] + 1);
      dist[idx(i, j)] = d;
    }
  // Origem: TODAS as células livres do giro da porta (vão × 0,90 m para dentro —
  // reservado, logo livre); sem porta, o centro. Partir de uma célula só, colada
  // na parede, travaria a busca: a folga ali é pequena por definição.
  const origens: { i: number; j: number }[] = [];
  for (const p of portas) {
    const g = giroDaPorta(p, interno, 900);
    const a = celula(g.x0 + 1, g.y0 + 1);
    const b = celula(g.x1 - 1, g.y1 - 1);
    for (let j = a.j; j <= b.j; j++) for (let i = a.i; i <= b.i; i++) if (livre[idx(i, j)]) origens.push({ i, j });
  }
  const semPorta = origens.length === 0;
  if (semPorta) origens.push(celula((interno.x0 + interno.x1) / 2, (interno.y0 + interno.y1) / 2));
  // Alvo de cada peça: as células da faixa de uso (comUso − ret) que estão livres.
  const alvos = pecas.map((p) => {
    const cels = new Set<number>();
    const a = celula(p.comUso.x0 + 1, p.comUso.y0 + 1);
    const b = celula(p.comUso.x1 - 1, p.comUso.y1 - 1);
    for (let j = a.j; j <= b.j; j++) for (let i = a.i; i <= b.i; i++) if (livre[idx(i, j)]) cels.add(idx(i, j));
    return cels;
  });
  /** Todas as peças se alcançam com folga ≥ raio (em células, cada célula = 50 mm; largura = 2 × raio)? Devolve as que não. */
  const alcancaveis = (raioCelulas: number): boolean[] => {
    const visto = new Uint8Array(nx * ny);
    const fila: number[] = [];
    for (const o of origens) {
      const k = idx(o.i, o.j);
      if (!livre[k] || visto[k]) continue;
      visto[k] = 1;
      fila.push(k);
    }
    while (fila.length) {
      const k = fila.shift()!;
      const i = k % nx;
      const j = (k - i) / nx;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const nk = idx(ni, nj);
        if (visto[nk] || !livre[nk] || dist[nk] < raioCelulas) continue;
        visto[nk] = 1;
        fila.push(nk);
      }
    }
    return alvos.map((cels) => {
      if (cels.size === 0) return true; // faixa de uso fora do retângulo: não há o que alcançar
      // A faixa de uso é alcançada se alguma célula dela ou vizinha imediata foi vista.
      for (const c of cels) {
        if (visto[c]) return true;
        const i = c % nx;
        const j = (c - i) / nx;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const ni = i + di;
          const nj = j + dj;
          if (ni >= 0 && nj >= 0 && ni < nx && nj < ny && visto[idx(ni, nj)]) return true;
        }
      }
      return false;
    });
  };
  // Maior largura que passa a todas: busca binária no raio (células), 1..30 (0,10 m..3,00 m).
  let lo = 0;
  let hi = 30;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi + 1) / 2);
    if (alcancaveis(meio).every(Boolean)) lo = meio;
    else hi = meio - 1;
  }
  const larguraLivreMm = lo * 2 * MALHA;
  const r90 = alcancaveis(9); // 0,90 m = 18 células de largura → raio 9
  const r120 = alcancaveis(12);
  return {
    larguraLivreMm,
    ok90: r90.every(Boolean),
    ok120: r120.every(Boolean),
    foraDaRota90: pecas.filter((_, k) => !r90[k]).map((p) => p.peca.rotulo),
    semPorta,
  };
}

// ─── Nível ───────────────────────────────────────────────────────────────────

export function mobiliarNivel(model: BlueprintModel, levelId: ObjectId | null, hip: HipotesesDeMobiliario = HIPOTESES_MOBILIARIO_PADRAO): MobiliarioDoAmbiente[] {
  return model.spaces.filter((s) => (!levelId || s.levelId === levelId) && s.ring.length >= 3).map((s) => mobiliarDoAmbiente(model, s, hip));
}

export interface ResumoDoMobiliario {
  ambientes: number;
  comKit: number;
  pecas: number;
  naoCouberam: number;
  /** Ambientes com kit em que a largura exigida (0,90 ou 1,20) passa. */
  circulacaoOk: number;
  circulacaoRuim: MobiliarioDoAmbiente[];
  semUso: MobiliarioDoAmbiente[];
}

export function resumirMobiliario(lista: readonly MobiliarioDoAmbiente[], hip: HipotesesDeMobiliario = HIPOTESES_MOBILIARIO_PADRAO): ResumoDoMobiliario {
  const comKit = lista.filter((m) => m.uso && KIT_POR_USO[m.uso]);
  const ok = (m: MobiliarioDoAmbiente) => (hip.acessivel ? m.circulacao.ok120 : m.circulacao.ok90);
  return {
    ambientes: lista.length,
    comKit: comKit.length,
    pecas: lista.reduce((s, m) => s + m.pecas.length, 0),
    naoCouberam: lista.reduce((s, m) => s + m.naoCouberam.length, 0),
    circulacaoOk: comKit.filter((m) => m.pecas.length > 0 && ok(m)).length,
    circulacaoRuim: comKit.filter((m) => m.pecas.length > 0 && !ok(m)),
    semUso: lista.filter((m) => !m.uso || !KIT_POR_USO[m.uso]),
  };
}

// ─── Núcleo vertical quando o programa pede (E2.4) ───────────────────────────

/**
 * Um SHAFT de 0,60 × 0,60 no canto do ambiente molhado (banheiro, lavabo,
 * cozinha, serviço) mais perto do centro do pavimento — só quando há mais de
 * um pavimento e nenhum shaft ainda. Devolve o comando e o porquê, ou o motivo
 * de não propor. Quem aplica é o editor (Ctrl+Z desfaz).
 */
export function sugerirShaft(model: BlueprintModel, levelId: ObjectId): { comando: import('./blueprintKernel').Command | null; motivo: string } {
  if (model.levels.length < 2) return { comando: null, motivo: 'um pavimento só — prumadas não precisam de shaft' };
  if ((model.nucleos ?? []).some((n) => n.tipo === 'SHAFT')) return { comando: null, motivo: 'já existe um shaft' };
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const molhados = model.spaces.filter((s) => s.levelId === levelId && ['BANHEIRO', 'LAVABO', 'COZINHA', 'AREA_DE_SERVICO'].includes(usoDoNome(s.name) ?? ''));
  if (molhados.length === 0) return { comando: null, motivo: 'nenhum ambiente molhado reconhecido pelo nome neste pavimento' };
  const todos = model.spaces.filter((s) => s.levelId === levelId);
  const cx = todos.reduce((a, s) => a + s.ring.reduce((b, p) => b + p.x, 0) / s.ring.length, 0) / todos.length;
  const cy = todos.reduce((a, s) => a + s.ring.reduce((b, p) => b + p.y, 0) / s.ring.length, 0) / todos.length;
  let melhor: { s: Space; canto: Point; d: number } | null = null;
  for (const s of molhados) {
    const interno = maiorRetanguloInterno(anelInternoDoAmbiente(s, paredes));
    if (!interno || interno.x1 - interno.x0 < 700 || interno.y1 - interno.y0 < 700) continue;
    for (const canto of [
      { x: interno.x0, y: interno.y0 },
      { x: interno.x1 - 600, y: interno.y0 },
      { x: interno.x1 - 600, y: interno.y1 - 600 },
      { x: interno.x0, y: interno.y1 - 600 },
    ]) {
      const d = Math.hypot(canto.x + 300 - cx, canto.y + 300 - cy);
      if (!melhor || d < melhor.d) melhor = { s, canto, d };
    }
  }
  if (!melhor) return { comando: null, motivo: 'os ambientes molhados são pequenos demais para um shaft de 0,60 m' };
  const c = melhor.canto;
  const ring: Point[] = [
    { x: Math.round(c.x), y: Math.round(c.y) },
    { x: Math.round(c.x + 600), y: Math.round(c.y) },
    { x: Math.round(c.x + 600), y: Math.round(c.y + 600) },
    { x: Math.round(c.x), y: Math.round(c.y + 600) },
  ];
  return { comando: { type: 'AddNucleo', levelId, tipo: 'SHAFT', ring, rotulo: 'Shaft' }, motivo: `no canto de ${melhor.s.name} mais perto do centro do pavimento` };
}

// ─── Aceitar como componentes do kernel (E7.1) ───────────────────────────────

/** A chave do catálogo para cada peça do kit (a estante é ARMARIO com rótulo "Estante"). */
export function tipoDeComponenteDaPeca(p: PecaDeMobiliario): TipoDeComponente {
  if (p.tipo === 'ARMARIO' && p.rotulo === 'Estante') return 'ESTANTE';
  return p.tipo as TipoDeComponente;
}

/**
 * Os `AddComponente` (sugerido: true) das peças colocadas — no centro do
 * retângulo, giradas quando encostam em O/L (a largura da peça corre ao longo
 * do encosto). Pula a peça cujo retângulo já tem um componente do mesmo tipo
 * dentro (idempotente: aceitar duas vezes não duplica).
 */
export function comandosDeMobiliario(lista: readonly MobiliarioDoAmbiente[], levelId: ObjectId, model: BlueprintModel): Command[] {
  const out: Command[] = [];
  const existentes = (model.componentes ?? []).filter((c) => c.levelId === levelId);
  for (const a of lista) {
    for (const p of a.pecas) {
      const tipoId = tipoDeComponenteDaPeca(p.peca);
      const at = { x: Math.round((p.ret.x0 + p.ret.x1) / 2), y: Math.round((p.ret.y0 + p.ret.y1) / 2) };
      if (existentes.some((c) => c.tipoId === tipoId && pointInPolygon(contornoDoComponente(c), at))) continue;
      const encostadaNaLateral = p.lado === 'O' || p.lado === 'L';
      // A largura do retângulo colocado já está no eixo certo; quando a peça
      // encosta em O/L o kernel gira 90° e troca largura/profundidade.
      const larguraMm = encostadaNaLateral ? p.ret.y1 - p.ret.y0 : p.ret.x1 - p.ret.x0;
      const profundidadeMm = encostadaNaLateral ? p.ret.x1 - p.ret.x0 : p.ret.y1 - p.ret.y0;
      out.push({ type: 'AddComponente', levelId, tipoId, at, larguraMm, profundidadeMm, rotacaoGraus: encostadaNaLateral ? 90 : 0, rotulo: null, sugerido: true });
    }
  }
  return out;
}
