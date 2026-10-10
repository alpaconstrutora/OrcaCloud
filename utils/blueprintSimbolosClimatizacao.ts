/**
 * OS SÍMBOLOS DA CLIMATIZAÇÃO (04/10/2026, E3.4 do roadmap de climatização).
 *
 * Mesmo contrato dos símbolos de incêndio (`blueprintSimbolosIncendio.ts`):
 * primitivas num quadrado de lado 1 centrado na origem, y para BAIXO; o canvas
 * escala pelo zoom e a prancha por um lado fixo em mm de papel. O 3D continua
 * desenhando a peça com as medidas da ficha — aqui é só a representação 2D.
 *
 * ⚠️ Símbolos de TRABALHO, legíveis e distintos entre si. A simbologia oficial
 * (NBR 16401 e a convenção do fabricante) deve ser conferida antes da prancha
 * de aprovação — CONFERIR NA NORMA.
 */
import type { BlueprintModel, TipoDePontoHidraulico } from './blueprintKernel';
import { TIPOS_DE_CLIMATIZACAO } from './blueprintKernel';
import type { Desenhista, EstiloTraco } from './blueprintExport';
import type { PrimitivaDoSimbolo } from './blueprintSimbolosIncendio';

export type { PrimitivaDoSimbolo };

const RET = (w: number, h: number): [number, number][] => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
const poligono = (pontos: [number, number][], cheio = false): PrimitivaDoSimbolo => ({ tipo: 'poligono', pontos, cheio });
const quadrado = (lado = 1, cheio = false) => poligono(RET(lado, lado), cheio);
const circulo = (r: number, cheio = false, cx = 0, cy = 0): PrimitivaDoSimbolo => ({ tipo: 'circulo', cx, cy, r, cheio });
const linha = (x1: number, y1: number, x2: number, y2: number): PrimitivaDoSimbolo => ({ tipo: 'linha', x1, y1, x2, y2 });
const texto = (t: string, altura = 0.34, x = 0, y = 0): PrimitivaDoSimbolo => ({ tipo: 'texto', x, y, texto: t, altura });
/** A seta: haste de (x1,y1) a (x2,y2) e as duas farpas na ponta. */
function seta(x1: number, y1: number, x2: number, y2: number, farpa = 0.12): PrimitivaDoSimbolo[] {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const f = (d: number) => linha(x2, y2, x2 - farpa * Math.cos(ang + d), y2 - farpa * Math.sin(ang + d));
  return [linha(x1, y1, x2, y2), f(Math.PI / 6), f(-Math.PI / 6)];
}
/** As lâminas de uma grelha: `n` linhas horizontais dentro do retângulo w × h. */
function laminas(n: number, w: number, h: number): PrimitivaDoSimbolo[] {
  return Array.from({ length: n }, (_, i) => {
    const y = -h / 2 + (h * (i + 1)) / (n + 1);
    return linha(-w / 2 + 0.06, y, w / 2 - 0.06, y);
  });
}

/** Os ids de toda a climatização — linha, dreno, duto e peças —, para a vista esconder de uma vez. */
export function idsDaClimatizacao(model: BlueprintModel): string[] {
  const disc = new Set(['FRIGORIGENA', 'DRENO_AC', 'MECANICA']);
  return [
    ...(model.trechos ?? []).filter((t) => disc.has(t.disciplina)).map((t) => t.id),
    ...(model.terminais ?? []).filter((t) => disc.has(t.disciplina) || (t.tipoHidraulico && (TIPOS_DE_CLIMATIZACAO as readonly string[]).includes(t.tipoHidraulico))).map((t) => t.id),
  ];
}

/** Os tipos de climatização que têm símbolo próprio — todos os da E3.1/E3.3. */
export const TIPOS_COM_SIMBOLO_DE_CLIMATIZACAO: readonly TipoDePontoHidraulico[] = TIPOS_DE_CLIMATIZACAO;

export function temSimboloDeClimatizacao(tipo: TipoDePontoHidraulico | null | undefined): tipo is TipoDePontoHidraulico {
  return !!tipo && TIPOS_COM_SIMBOLO_DE_CLIMATIZACAO.includes(tipo);
}

/**
 * Os equipamentos RETANGULARES (10/10/2026, pendência D1): o símbolo é desenhado
 * nas proporções da peça — largura × profundidade —, e não num quadrado do lado da
 * maior medida. A hi-wall de 900 × 220 saía 900 × 360 e "montava" na parede.
 */
export const TIPOS_COM_SIMBOLO_PROPORCIONAL: readonly TipoDePontoHidraulico[] = [
  'EVAPORADORA_HI_WALL',
  'EVAPORADORA_PISO_TETO',
  'EVAPORADORA_DUTADA',
  'CONDENSADORA_SPLIT',
  'CONDENSADORA_VRF',
];

/**
 * Profundidade ÷ largura da peça, para os tipos proporcionais (entre 0,15 e 1);
 * `null` para os demais — e então o símbolo é o do quadrado, como sempre.
 */
export function proporcaoDoSimbolo(tipo: TipoDePontoHidraulico | null | undefined, larguraMm: number, profundidadeMm: number): number | null {
  if (!tipo || !TIPOS_COM_SIMBOLO_PROPORCIONAL.includes(tipo)) return null;
  if (!(larguraMm > 0) || !(profundidadeMm > 0)) return null;
  return Math.min(1, Math.max(0.15, profundidadeMm / larguraMm));
}

/**
 * O símbolo do tipo, em primitivas no quadrado unitário. Com `proporcao`
 * (`proporcaoDoSimbolo`), o equipamento retangular ocupa 1 × `proporcao` — o lado
 * passa a ser a LARGURA da peça. Sem ela, a forma de sempre (a legenda usa assim).
 */
export function simboloDeClimatizacao(tipo: TipoDePontoHidraulico, proporcao: number | null = null): PrimitivaDoSimbolo[] {
  const h = proporcao;
  switch (tipo) {
    // Evaporadoras: o retângulo da unidade; o detalhe diz o tipo.
    case 'EVAPORADORA_HI_WALL':
      // Deitada na parede, com as lâminas de insuflamento embaixo (o jato sai para fora da peça).
      if (h != null) return [poligono(RET(1, h)), ...laminas(2, 1, h), linha(-0.3, h / 2, -0.3, h * 0.95), linha(0, h / 2, 0, h * 0.95), linha(0.3, h / 2, 0.3, h * 0.95)];
      return [poligono(RET(1, 0.4)), ...laminas(2, 1, 0.4), linha(-0.3, 0.2, -0.3, 0.38), linha(0, 0.2, 0, 0.38), linha(0.3, 0.2, 0.3, 0.38)];
    case 'EVAPORADORA_PISO_TETO':
      if (h != null) return [poligono(RET(1, h)), linha(-0.5, 0, 0.5, 0), ...seta(0, 0, 0, -h * 0.9, Math.min(0.12, h * 0.3)), ...seta(0, 0, 0, h * 0.9, Math.min(0.12, h * 0.3))];
      return [poligono(RET(1, 0.5)), linha(-0.5, 0, 0.5, 0), ...seta(0, 0, 0, -0.45), ...seta(0, 0, 0, 0.45)];
    case 'EVAPORADORA_CASSETE':
      // Quadrada no forro, quatro vias: o quadrado, o miolo e as quatro setas.
      return [quadrado(1), quadrado(0.36), ...seta(0.18, 0, 0.46, 0), ...seta(-0.18, 0, -0.46, 0), ...seta(0, 0.18, 0, 0.46), ...seta(0, -0.18, 0, -0.46)];
    case 'EVAPORADORA_DUTADA':
      // A caixa e o duto saindo pela direita.
      if (h != null) return [poligono(RET(0.8, h), false), linha(0.4, -h * 0.24, 0.5, -h * 0.24), linha(0.4, h * 0.24, 0.5, h * 0.24), ...seta(0.1, 0, 0.42, 0, Math.min(0.12, h * 0.3)), texto('EV', Math.min(0.26, h * 0.5), -0.12, 0)];
      return [poligono(RET(0.8, 0.5), false), linha(0.4, -0.12, 0.5, -0.12), linha(0.4, 0.12, 0.5, 0.12), ...seta(0.1, 0, 0.42, 0), texto('EV', 0.26, -0.12, 0)];
    // Condensadoras: o quadrado com a hélice (círculo) — uma no split, duas no VRF.
    case 'CONDENSADORA_SPLIT':
      if (h != null) {
        // A hélice num dos lados (como a unidade real), no círculo que cabe na profundidade.
        const r = h * 0.4;
        return [poligono(RET(1, h)), circulo(r, false, 0.18), circulo(r * 0.18, true, 0.18), linha(0.18 - r, 0, 0.18 + r, 0), linha(0.18, -r, 0.18, r)];
      }
      return [quadrado(1), circulo(0.32), circulo(0.06, true), linha(-0.32, 0, 0.32, 0), linha(0, -0.32, 0, 0.32)];
    case 'CONDENSADORA_VRF':
      if (h != null) {
        const r = Math.min(h * 0.4, 0.22);
        return [poligono(RET(1, h)), circulo(r, false, -0.24, 0), circulo(r, false, 0.24, 0), circulo(r * 0.2, true, -0.24, 0), circulo(r * 0.2, true, 0.24, 0)];
      }
      return [quadrado(1), circulo(0.2, false, -0.24, 0), circulo(0.2, false, 0.24, 0), circulo(0.04, true, -0.24, 0), circulo(0.04, true, 0.24, 0), texto('VRF', 0.2, 0, 0.36)];
    case 'DERIVADOR_VRF':
      // O "Y" da derivação (refnet), sobre o trecho.
      return [circulo(0.5), linha(-0.5, 0, 0, 0), linha(0, 0, 0.42, -0.3), linha(0, 0, 0.42, 0.3), circulo(0.06, true)];
    case 'COLETOR_VRF':
      // 0.94.0: o coletor (header) — a barra que recebe a linha e solta três ramais.
      return [circulo(0.5), linha(-0.5, 0, -0.12, 0), linha(-0.12, -0.3, -0.12, 0.3), linha(-0.12, -0.3, 0.42, -0.3), linha(-0.12, 0, 0.48, 0), linha(-0.12, 0.3, 0.42, 0.3)];
    case 'EXAUSTOR_AR':
      // O círculo da hélice com as três pás e a seta de saída.
      return [circulo(0.5), circulo(0.07, true), linha(0, 0, 0, -0.42), linha(0, 0, 0.36, 0.21), linha(0, 0, -0.36, 0.21), ...seta(0.44, 0.1, 0.44, -0.3, 0.06)];
    case 'BOMBA_DRENO':
      // Bomba: círculo com o triângulo apontando o recalque (o mesmo gesto da bomba de incêndio, menor).
      return [circulo(0.5), poligono([[-0.22, 0.22], [0.3, 0], [-0.22, -0.22]], true), texto('D', 0.22, 0, 0.36)];
    case 'PONTO_DRENO':
      // O funil: triângulo invertido no círculo.
      return [circulo(0.5), poligono([[-0.3, -0.2], [0.3, -0.2], [0, 0.3]], false), linha(0, 0.3, 0, 0.46)];
    case 'SIFAO_DRENO':
      // 0.94.0: o sifão — o "U" do fecho hídrico no círculo.
      return [circulo(0.5), linha(-0.22, -0.36, -0.22, 0.12), linha(-0.22, 0.12, 0, 0.3), linha(0, 0.3, 0.22, 0.12), linha(0.22, 0.12, 0.22, -0.1)];
    case 'CAIXA_DISTRIBUICAO_AR':
      // A caixa com os quatro ramais.
      return [quadrado(0.7), linha(0.35, 0, 0.5, 0), linha(-0.35, 0, -0.5, 0), linha(0, 0.35, 0, 0.5), linha(0, -0.35, 0, -0.5), texto('CX', 0.26)];
    // Terminais de ar.
    case 'DIFUSOR':
      // O quadrado com as diagonais — o X que o difusor sempre teve (P2.2).
      return [quadrado(1), linha(-0.5, -0.5, 0.5, 0.5), linha(0.5, -0.5, -0.5, 0.5)];
    case 'GRELHA_INSUFLAMENTO':
      return [poligono(RET(1, 0.5)), ...laminas(3, 1, 0.5), ...seta(0.42, 0.2, 0.42, -0.2, 0.08)];
    case 'GRELHA_RETORNO':
      // Retorno: as lâminas e a seta entrando (sentido contrário).
      return [poligono(RET(1, 0.5)), ...laminas(3, 1, 0.5), ...seta(0.42, -0.2, 0.42, 0.2, 0.08)];
    case 'BOCAL_AR':
      // Dois círculos concêntricos e o jato.
      return [circulo(0.5), circulo(0.25), circulo(0.06, true), ...seta(0.25, 0, 0.48, 0, 0.08)];
    case 'TOMADA_AR_EXTERIOR':
      // Veneziana com a seta entrando.
      return [poligono(RET(1, 0.5)), linha(-0.4, -0.2, -0.2, 0.2), linha(-0.1, -0.2, 0.1, 0.2), linha(0.2, -0.2, 0.4, 0.2), ...seta(0, -0.5, 0, -0.26, 0.08)];
    case 'VENEZIANA_AR':
      return [poligono(RET(1, 0.5)), linha(-0.4, -0.2, -0.2, 0.2), linha(-0.1, -0.2, 0.1, 0.2), linha(0.2, -0.2, 0.4, 0.2)];
    case 'CAIXA_PLENUM':
      // A caixa atrás do difusor: quadrado com o quadrado menor e o nome.
      return [quadrado(1), quadrado(0.6), texto('PL', 0.26)];
    case 'DAMPER':
      // A lâmina do registro inclinada no duto, com o eixo.
      return [poligono(RET(1, 0.4)), linha(-0.3, 0.16, 0.3, -0.16), circulo(0.05, true)];
    case 'EQUIPAMENTO_CLIMATIZACAO':
      return [quadrado(1), texto('EQ', 0.34)];
    default:
      return [];
  }
}

/** Círculo como polígono — o `Desenhista` da prancha não tem arco. */
function circuloComoPoligono(cx: number, cy: number, r: number, lados = 24): { x: number; y: number }[] {
  return Array.from({ length: lados }, (_, i) => {
    const a = (i / lados) * Math.PI * 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

/**
 * Desenha o símbolo na PRANCHA: centro (x, y) e lado `ladoMm`, em mm de papel (mesmo contrato do incêndio).
 * Com `proporcao`, o lado é a LARGURA da peça (ver `proporcaoDoSimbolo`).
 */
export function desenharSimboloDeClimatizacao(d: Desenhista, tipo: TipoDePontoHidraulico, x: number, y: number, ladoMm: number, estilo: EstiloTraco, proporcao: number | null = null): void {
  const P = (px: number, py: number) => ({ x: x + px * ladoMm, y: y + py * ladoMm });
  const contorno = (pts: { x: number; y: number }[]) =>
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      d.linha(p.x, p.y, q.x, q.y, estilo);
    });
  for (const pr of simboloDeClimatizacao(tipo, proporcao)) {
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
