/**
 * OS SÍMBOLOS DA REDE DE INCÊNDIO (30/09/2026, E1.3 do roadmap de incêndio).
 *
 * O AltoQi separa a representação de MODELO (o extintor realista no 3D) da de
 * PRANCHA (o símbolo técnico). O ÒPURA já funciona assim: o 3D desenha a peça
 * com as medidas dela (`Blueprint3DViewer`), e o 2D desenha um símbolo. Este
 * arquivo é a fonte ÚNICA do símbolo 2D: primitivas geométricas num quadrado
 * de lado 1 centrado na origem (y para BAIXO, como a tela e o papel). O canvas
 * as escala pelo zoom; a prancha (E8 do roadmap), por um tamanho fixo em mm de
 * papel. Mesmo desenho, dois tamanhos — é isso que "símbolo de prancha" quer dizer.
 *
 * ⚠️ Símbolos de TRABALHO, legíveis e distintos entre si. A simbologia gráfica
 * oficial de segurança contra incêndio (NBR 14100 e a IT do CBMMG) deve ser
 * conferida antes da prancha de aprovação — CONFERIR NA NORMA.
 */
import type { BlueprintModel, PosicaoDoSprinkler, TipoDePontoHidraulico } from './blueprintKernel';
import type { Desenhista, EstiloTraco } from './blueprintExport';

export type PrimitivaDoSimbolo =
  | { tipo: 'circulo'; cx: number; cy: number; r: number; cheio: boolean }
  | { tipo: 'linha'; x1: number; y1: number; x2: number; y2: number }
  | { tipo: 'poligono'; pontos: [number, number][]; cheio: boolean }
  | { tipo: 'texto'; x: number; y: number; texto: string; altura: number };

const QUADRADO: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const quadrado = (cheio = false): PrimitivaDoSimbolo => ({ tipo: 'poligono', pontos: QUADRADO, cheio });
const circulo = (r: number, cheio = false, cx = 0, cy = 0): PrimitivaDoSimbolo => ({ tipo: 'circulo', cx, cy, r, cheio });
const linha = (x1: number, y1: number, x2: number, y2: number): PrimitivaDoSimbolo => ({ tipo: 'linha', x1, y1, x2, y2 });
const texto = (t: string, altura = 0.42, x = 0, y = 0): PrimitivaDoSimbolo => ({ tipo: 'texto', x, y, texto: t, altura });
/** A válvula: dois triângulos com as pontas no centro (a "gravata"). */
const gravata = (m = 0.34): PrimitivaDoSimbolo[] => [
  { tipo: 'poligono', pontos: [[-m, -m * 0.7], [0, 0], [-m, m * 0.7]], cheio: true },
  { tipo: 'poligono', pontos: [[m, -m * 0.7], [0, 0], [m, m * 0.7]], cheio: true },
];
/** A bomba: círculo com o triângulo apontando o recalque. */
const bomba = (): PrimitivaDoSimbolo[] => [circulo(0.5), { tipo: 'poligono', pontos: [[-0.28, -0.3], [0.36, 0], [-0.28, 0.3]], cheio: true }];

/** Os ids de toda a rede de incêndio — trechos e peças —, para a vista esconder de uma vez (E1.3). */
export function idsDaRedeDeIncendio(model: BlueprintModel): string[] {
  return [
    ...(model.trechos ?? []).filter((t) => t.disciplina === 'INCENDIO').map((t) => t.id),
    ...(model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO').map((t) => t.id),
  ];
}

/** Os tipos da rede de incêndio que têm símbolo próprio (os da E1.1). */
export const TIPOS_COM_SIMBOLO_DE_INCENDIO: readonly TipoDePontoHidraulico[] = [
  'HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO', 'HIDRANTE_RECALQUE', 'SPRINKLER',
  'VGA', 'CHAVE_FLUXO', 'BOMBA_INCENDIO', 'BOMBA_JOCKEY', 'PRESSOSTATO',
  // E7.1/E7.2: os preventivos.
  'EXTINTOR',
  'PLACA',
];

export function temSimboloDeIncendio(tipo: TipoDePontoHidraulico | null | undefined): tipo is TipoDePontoHidraulico {
  return !!tipo && TIPOS_COM_SIMBOLO_DE_INCENDIO.includes(tipo);
}

/**
 * O símbolo do tipo, em primitivas no quadrado unitário. `posicao` só muda o
 * sprinkler: pendente = cruz; em pé = metade de cima cheia; lateral = a seta do
 * defletor para o lado.
 */
export function simboloDeIncendio(tipo: TipoDePontoHidraulico, posicao?: PosicaoDoSprinkler | null): PrimitivaDoSimbolo[] {
  switch (tipo) {
    case 'HIDRANTE_SIMPLES':
      // O abrigo com a metade de baixo cheia.
      return [quadrado(), { tipo: 'poligono', pontos: [[0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], cheio: true }];
    case 'HIDRANTE_DUPLO':
      // As duas saídas: as duas metades opostas cheias, pela outra diagonal.
      return [
        quadrado(),
        { tipo: 'poligono', pontos: [[-0.5, -0.5], [0, -0.5], [-0.5, 0]], cheio: true },
        { tipo: 'poligono', pontos: [[0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], cheio: true },
      ];
    case 'MANGOTINHO':
      // O carretel dentro do abrigo.
      return [quadrado(), circulo(0.3), circulo(0.1, true)];
    case 'HIDRANTE_RECALQUE':
      // A caixa no passeio com a conexão do caminhão.
      return [quadrado(), circulo(0.28, true), linha(-0.5, 0.5, 0.5, -0.5)];
    case 'SPRINKLER':
      if (posicao === 'EM_PE') return [circulo(0.5), { tipo: 'poligono', pontos: meiaLua(), cheio: true }];
      if (posicao === 'LATERAL') return [circulo(0.5), linha(-0.35, 0, 0.35, 0), linha(0.35, 0, 0.15, -0.18), linha(0.35, 0, 0.15, 0.18)];
      return [circulo(0.5), linha(-0.35, 0, 0.35, 0), linha(0, -0.35, 0, 0.35)];
    case 'VGA':
      return [quadrado(), ...gravata()];
    case 'CHAVE_FLUXO':
      // Quadrado (e não círculo): o sprinkler lateral também tem seta, e os dois não podem se confundir.
      return [quadrado(), linha(-0.32, 0, 0.32, 0), { tipo: 'poligono', pontos: [[0.32, 0], [0.1, -0.16], [0.1, 0.16]], cheio: true }];
    case 'BOMBA_INCENDIO':
      return bomba();
    case 'BOMBA_JOCKEY':
      // A pequena: triângulo menor à direita e o J à esquerda, sem se tocarem.
      return [circulo(0.5), { tipo: 'poligono', pontos: [[0.02, -0.2], [0.34, 0], [0.02, 0.2]], cheio: true }, texto('J', 0.34, -0.2, 0)];
    case 'PRESSOSTATO':
      return [circulo(0.5), texto('P')];
    case 'EXTINTOR':
      // O triângulo do extintor, com o cilindro (círculo cheio) dentro.
      return [{ tipo: 'poligono', pontos: [[0, -0.5], [0.5, 0.5], [-0.5, 0.5]], cheio: false }, circulo(0.14, true)];
    case 'PLACA':
      // A placa retangular, baixa, com a seta (a direção é a rotação da peça).
      return [
        { tipo: 'poligono', pontos: [[-0.5, -0.3], [0.5, -0.3], [0.5, 0.3], [-0.5, 0.3]], cheio: false },
        linha(-0.3, 0, 0.25, 0),
        { tipo: 'poligono', pontos: [[0.32, 0], [0.12, -0.14], [0.12, 0.14]], cheio: true },
      ];
    default:
      return [];
  }
}

/** A metade de cima do círculo de raio 0,5, como polígono (o sprinkler em pé). */
function meiaLua(): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    pts.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)]);
  }
  return pts;
}

/** Círculo como polígono — o `Desenhista` da prancha não tem arco. */
function circuloComoPoligono(cx: number, cy: number, r: number, lados = 24): { x: number; y: number }[] {
  return Array.from({ length: lados }, (_, i) => {
    const a = (i / lados) * Math.PI * 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

/**
 * Desenha o símbolo na PRANCHA: centro (x, y) e lado `ladoMm`, em mm de papel.
 * `branco` pinta o fundo antes (o símbolo sobre a tubulação não pode deixar o
 * traço passar por dentro).
 */
export function desenharSimboloDeIncendio(
  d: Desenhista,
  tipo: TipoDePontoHidraulico,
  x: number,
  y: number,
  ladoMm: number,
  estilo: EstiloTraco,
  posicao?: PosicaoDoSprinkler | null,
): void {
  const P = (px: number, py: number) => ({ x: x + px * ladoMm, y: y + py * ladoMm });
  const contorno = (pts: { x: number; y: number }[]) => pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; d.linha(p.x, p.y, q.x, q.y, estilo); });
  for (const pr of simboloDeIncendio(tipo, posicao)) {
    if (pr.tipo === 'linha') {
      const a = P(pr.x1, pr.y1);
      const b = P(pr.x2, pr.y2);
      d.linha(a.x, a.y, b.x, b.y, estilo);
    } else if (pr.tipo === 'circulo') {
      const pts = circuloComoPoligono(x + pr.cx * ladoMm, y + pr.cy * ladoMm, pr.r * ladoMm);
      d.poligono(pts, pr.cheio ? estilo.cor : '#ffffff');
      contorno(pts);
    } else if (pr.tipo === 'poligono') {
      const pts = pr.pontos.map(([px, py]) => P(px, py));
      d.poligono(pts, pr.cheio ? estilo.cor : '#ffffff');
      contorno(pts);
    } else {
      const q = P(pr.x, pr.y);
      d.texto(q.x, q.y, pr.texto, pr.altura * ladoMm, estilo.cor);
    }
  }
}
