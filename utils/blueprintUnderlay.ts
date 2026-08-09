/**
 * Planta de fundo: a transformação entre o pixel da imagem e o milímetro do modelo.
 *
 * ─── ESTE MÓDULO NÃO PRODUZ GEOMETRIA ───────────────────────────────────────
 *
 * Ele só posiciona uma imagem. O que o usuário desenha por cima continua nascendo
 * do clique na TELA, que já passa pelo encaixe na grade e sai em milímetro
 * inteiro. Por isso aqui se trabalha em ponto flutuante sem culpa: nenhum número
 * daqui vira coordenada de parede.
 *
 * A distinção importa porque o kernel é exato de propósito. Se a posição do fundo
 * entrasse na geometria, a topologia passaria a depender de um `atan2` — e o
 * determinismo do módulo inteiro cairia junto.
 *
 * ─── DUAS INVERSÕES QUE SE CANCELAM SE FOREM ESQUECIDAS ─────────────────────
 *
 * Imagem tem Y crescendo para BAIXO; o modelo, para CIMA. Quem esquece a
 * inversão obtém uma planta espelhada na vertical — e numa planta razoavelmente
 * simétrica isso não salta aos olhos: só aparece quando a porta está do lado
 * errado, já na obra.
 */

/** Estado de posicionamento do fundo. Tudo em milímetro do modelo. */
export interface Underlay {
  /** Onde o pixel (0,0) da imagem cai no modelo. */
  origemXMm: number;
  origemYMm: number;
  /** Escala aferida. É o único número que a calibração produz de fato. */
  mmPorPixel: number;
  /**
   * Prumo, para planta que veio torta no arquivo. Miliradianos, com decimais.
   *
   * NÃO arredondar para inteiro: 0,5 mrad de resíduo desalinha 2 mm em 4 m e
   * 10 mm numa planta de 20 m. A unidade é miliradiano só para o número ficar
   * legível no banco; a precisão é de ponto flutuante mesmo. Diferente das
   * coordenadas do kernel, aqui não há determinismo a preservar — o fundo é
   * imagem de referência e fica fora do hash da versão.
   */
  rotacaoMrad: number;
}

export interface PontoPx {
  px: number;
  py: number;
}

export const UNDERLAY_NEUTRO: Underlay = {
  origemXMm: 0,
  origemYMm: 0,
  mmPorPixel: 1,
  rotacaoMrad: 0,
};

/** Pixel da imagem → milímetro do modelo. */
export function pixelParaModelo(u: Underlay, p: PontoPx): { x: number; y: number } {
  const t = u.rotacaoMrad / 1000;
  // Y invertido AQUI, uma vez só. Espalhar o sinal pelo código é como o
  // espelhamento vertical entra sem ninguém notar.
  const vx = p.px * u.mmPorPixel;
  const vy = -p.py * u.mmPorPixel;

  return {
    x: u.origemXMm + vx * Math.cos(t) - vy * Math.sin(t),
    y: u.origemYMm + vx * Math.sin(t) + vy * Math.cos(t),
  };
}

/** Milímetro do modelo → pixel da imagem. Inversa exata da de cima. */
export function modeloParaPixel(u: Underlay, x: number, y: number): PontoPx {
  const t = u.rotacaoMrad / 1000;
  const dx = x - u.origemXMm;
  const dy = y - u.origemYMm;

  const vx = dx * Math.cos(t) + dy * Math.sin(t);
  const vy = -dx * Math.sin(t) + dy * Math.cos(t);

  return { px: vx / u.mmPorPixel, py: -vy / u.mmPorPixel };
}

export interface EntradaCalibracao {
  /** Os dois pontos clicados sobre a imagem, em pixel dela. */
  p1: PontoPx;
  p2: PontoPx;
  /** A distância real entre eles, declarada pelo usuário. */
  distanciaMm: number;
  /**
   * Trata o segmento clicado como uma referência HORIZONTAL e gira a imagem
   * para que ele fique reto. Serve para planta escaneada torta.
   */
  alinharHorizontal?: boolean;
  /**
   * Posicionamento anterior. Recalibrar PIVOTA em `p1`: a geometria já traçada
   * não se mexe, a imagem é que se ajusta em volta dela. Sem isso, recalibrar
   * arrastaria a planta inteira para longe do que já foi desenhado — e o
   * usuário teria de refazer o traçado por causa de uma aferição.
   */
  anterior?: Underlay;
}

export class CalibracaoInvalida extends Error {}

/**
 * Converte dois cliques e uma distância declarada em posicionamento.
 *
 * A escala é a ÚNICA coisa que a aferição realmente mede; origem e rotação são
 * consequência de onde se quer manter a imagem.
 */
export function calibrar(e: EntradaCalibracao): Underlay {
  const dpx = e.p2.px - e.p1.px;
  const dpy = e.p2.py - e.p1.py;
  const pixels = Math.hypot(dpx, dpy);

  if (pixels === 0) {
    throw new CalibracaoInvalida('Os dois pontos da calibração coincidem.');
  }
  if (!(e.distanciaMm > 0)) {
    throw new CalibracaoInvalida('A distância declarada precisa ser maior que zero.');
  }

  const mmPorPixel = e.distanciaMm / pixels;

  // Direção do segmento no espaço do modelo ANTES de girar (com o Y já
  // invertido). Alinhar é anular esse ângulo.
  const rotacaoMrad = e.alinharHorizontal
    ? -Math.atan2(-dpy, dpx) * 1000
    : (e.anterior?.rotacaoMrad ?? 0);

  const parcial: Underlay = { ...UNDERLAY_NEUTRO, mmPorPixel, rotacaoMrad };

  // Onde `p1` deve continuar caindo: no mesmo lugar de antes, se houver
  // posicionamento anterior; na origem do modelo, na primeira calibração.
  const alvo = e.anterior
    ? pixelParaModelo(e.anterior, e.p1)
    : { x: 0, y: 0 };

  const semOrigem = pixelParaModelo(parcial, e.p1);

  return {
    ...parcial,
    origemXMm: alvo.x - semOrigem.x,
    origemYMm: alvo.y - semOrigem.y,
  };
}

/**
 * Distância entre dois pixels, já convertida para milímetro do modelo.
 *
 * É a conferência da aferição: medir de volta os mesmos dois pontos tem de
 * devolver a distância que foi declarada. Sem esta função a calibração só
 * poderia ser verificada olhando o desenho — que é exatamente como um erro de
 * escala passa despercebido.
 */
export function distanciaMedidaMm(u: Underlay, p1: PontoPx, p2: PontoPx): number {
  const a = pixelParaModelo(u, p1);
  const b = pixelParaModelo(u, p2);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Escala equivalente em "1:N", só para exibição.
 *
 * Uma planta impressa em A1 a 1:50 e escaneada a 150 dpi dá por volta de 8,5
 * mm/px. O número cru não diz nada a quem desenha; o denominador diz.
 */
export function escalaAparente(u: Underlay, dpi = 150): number {
  const mmPorPixelDoPapel = 25.4 / dpi;
  return u.mmPorPixel / mmPorPixelDoPapel;
}

/**
 * TRAÇAR SOBRE RASTER HERDA A DISTORÇÃO DO RASTER.
 *
 * Planta escaneada ou fotografada não tem reta reta: a folha ondula, a lente
 * distorce, o papel encolhe com a umidade. A escala aferida num canto pode não
 * valer no outro, e nenhuma conta feita aqui detecta isso.
 *
 * O Spike C mediu 0,2–0,3% de erro em PDF VETORIAL, que é o melhor caso. Raster
 * é pior, e foto de planta impressa é pior ainda.
 */
export const AVISO_RASTER =
  'A planta de fundo é uma imagem: a escala aferida num ponto pode não valer no ' +
  'resto da folha. Confira uma segunda cota distante da primeira antes de confiar ' +
  'no traçado.';
