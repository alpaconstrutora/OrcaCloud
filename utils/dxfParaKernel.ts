// utils/dxfParaKernel.ts
//
// Do DXF para paredes do kernel — a escala e o pareamento.
//
// ─── NADA AQUI É NOVO, E ISSO É DE PROPÓSITO ─────────────────────────────────
//
// O pareamento de faces, a junção de colineares e a mitragem de cantos já
// existem em `blueprintVetor.ts`, escritos para o Digitalizador (PDF vetorial) e
// afinados contra prancha real. Um DXF é a mesma pergunta com outra entrada:
// "estes traços descrevem que paredes?". Escrever um segundo pareador daria
// dois comportamentos para o mesmo conceito, e o segundo seria o pior.
//
// O que este módulo acrescenta é o que o DXF tem de diferente: a ESCALA.

import { lerDxf, type ArcoDxf, type SegmentoDxf } from './dxfLeitor';
import {
  juntarColineares,
  mitrarCantos,
  parearFaces,
  type ParedeGerada,
} from './blueprintVetor';
import { emendarColineares, type AberturaLida } from './emendaDeParedes';
import { encostarNasFaces } from './ifcEncostarParedes';

/** Espessura plausível de parede, em milímetros. Fora disto não é parede. */
export const ESPESSURA_MIN_MM = 50;
export const ESPESSURA_MAX_MM = 500;

/** As unidades que aparecem em projeto, em milímetros por unidade do arquivo. */
export const UNIDADES: { rotulo: string; mmPorUnidade: number }[] = [
  { rotulo: 'milímetro', mmPorUnidade: 1 },
  { rotulo: 'centímetro', mmPorUnidade: 10 },
  { rotulo: 'metro', mmPorUnidade: 1000 },
  { rotulo: 'polegada', mmPorUnidade: 25.4 },
];

export interface EscalaSugerida {
  mmPorUnidade: number;
  rotulo: string;
  /** Quantos pares de face caíram na faixa de espessura de parede. */
  paredesPlausiveis: number;
  /** A espessura mediana que essa escala produz, em mm. */
  espessuraMedianaMm: number | null;
}

/** Faces a partir dos segmentos de uma camada. */
function facesDe(segmentos: SegmentoDxf[]) {
  return juntarColineares(
    segmentos.map((s) => ({ a: s.a, b: s.b, larguraPt: 0 })),
    0.5,
  );
}

/**
 * Qual unidade o arquivo usa, MEDIDA em vez de acreditada.
 *
 * ─── POR QUE NÃO SE LÊ O `$INSUNITS` ────────────────────────────────────────
 *
 * ⚠️ Ele MENTE. Medido em 07/09/2026 no projeto arquitetônico real da empresa
 * (8,3 MB, aprovado na prefeitura): o arquivo declara `$INSUNITS = 4`, que é
 * MILÍMETRO, e está em METRO — a extensão do desenho é 134 × 78 unidades, e as
 * espessuras pareadas caem em 0,1 · 0,2 · 0,3 · 0,4. Acreditar no campo daria
 * uma casa de 13 centímetros, com a forma perfeita.
 *
 * ─── O QUE SE MEDE NO LUGAR ─────────────────────────────────────────────────
 *
 * A ESPESSURA DAS PAREDES. Ela é a única medida de um projeto de arquitetura
 * que se conhece de antemão: fica entre 5 e 50 cm, sempre, em qualquer projeto
 * de qualquer época. Então testa-se cada unidade candidata e vence a que põe
 * mais pares dentro dessa faixa.
 *
 * No arquivo real isso dá metro (183 + 135 + 74 pares em 10, 20 e 30 cm); no
 * nosso próprio export, milímetro. Sem heurística sobre nome de camada, sem
 * confiar em campo de cabeçalho — e a tela ainda mostra o resultado para quem
 * sabe confirmar.
 */
export function sugerirEscala(segmentos: SegmentoDxf[]): EscalaSugerida[] {
  const faces = facesDe(segmentos);
  return UNIDADES.map(({ rotulo, mmPorUnidade }) => {
    const eixos = parearFaces(faces, {
      mmPorPt: mmPorUnidade,
      espessuraMinMm: ESPESSURA_MIN_MM,
      espessuraMaxMm: ESPESSURA_MAX_MM,
    });
    const espessuras = eixos.map((e) => e.espessuraPt * mmPorUnidade).sort((a, b) => a - b);
    return {
      mmPorUnidade,
      rotulo,
      paredesPlausiveis: eixos.length,
      espessuraMedianaMm: espessuras.length
        ? Math.round(espessuras[espessuras.length >> 1])
        : null,
    };
  }).sort((a, b) => b.paredesPlausiveis - a.paredesPlausiveis);
}

export interface ParedeDoDxf extends ParedeGerada {
  camada: string;
}

/**
 * As paredes de uma camada, já em milímetro do kernel e com os cantos mitrados.
 *
 * ⚠️ A MITRAGEM NÃO É COSMÉTICA. O eixo derivado abrange só a sobreposição do
 * par de faces, e num canto as faces de uma parede são interrompidas pela
 * outra — então o eixo para antes do encontro e NENHUM ambiente fecha. É o
 * mesmo problema que a importação de IFC teve por outro motivo, e a mesma
 * solução já medida contra prancha real (`mitrarCantos`, teto de 300 mm: pega o
 * canto e não alcança vão de porta).
 */
export function paredesDoDxf(
  segmentos: SegmentoDxf[],
  mmPorUnidade: number,
): ParedeDoDxf[] {
  if (segmentos.length === 0) return [];
  const camada = segmentos[0].camada;
  const eixos = parearFaces(facesDe(segmentos), {
    mmPorPt: mmPorUnidade,
    espessuraMinMm: ESPESSURA_MIN_MM,
    espessuraMaxMm: ESPESSURA_MAX_MM,
  });

  const emMm: ParedeGerada[] = eixos.map((e) => ({
    a: { x: Math.round(e.a.x * mmPorUnidade), y: Math.round(e.a.y * mmPorUnidade) },
    b: { x: Math.round(e.b.x * mmPorUnidade), y: Math.round(e.b.y * mmPorUnidade) },
    espessuraMm: Math.round(e.espessuraPt * mmPorUnidade),
    comprimentoMm: Math.round(e.comprimentoPt * mmPorUnidade),
  }));

  return mitrarCantos(emMm)
    // Depois de mitrar, um eixo pode ter virado degenerado. O kernel recusaria
    // com `DEGENERATE_WALL` e derrubaria a importação inteira — "ou tudo, ou
    // nada" viraria "nada" por causa de um traço.
    .filter((p) => p.a.x !== p.b.x || p.a.y !== p.b.y)
    .map((p) => ({ ...p, camada }));
}

/** A leitura inteira de um arquivo, pronta para a tela. */
export function prepararDxf(texto: string) {
  const leitura = lerDxf(texto);
  return {
    ...leitura,
    /** A escala medida por camada é ruidosa; mede-se no desenho inteiro. */
    escalas: sugerirEscala(leitura.segmentos),
  };
}

/**
 * As paredes de uma camada de EIXO — um segmento, uma parede.
 *
 * ─── QUANDO ESTE CAMINHO EXISTE ─────────────────────────────────────────────
 *
 * Um DXF de terceiro desenha parede como duas faces paralelas, e daí vem o
 * pareamento. Mas o NOSSO próprio export escreve uma camada `PLANTA-EIXOS` com
 * o eixo de cada parede — e quem desenha em CAD com disciplina costuma ter uma
 * equivalente. Onde ela existe não há o que derivar: o traço JÁ é o eixo, e
 * pareá-lo seria trocar um dado exato por uma estimativa.
 *
 * A espessura, essa não está no traço: quem escolhe a camada informa. É a mesma
 * disciplina do casamento de pavimentos do IFC — perguntar o que não dá para
 * medir, em vez de arbitrar.
 */
export function paredesDeEixos(
  segmentos: SegmentoDxf[],
  mmPorUnidade: number,
  espessuraMm: number,
): ParedeDoDxf[] {
  return segmentos
    .map((s) => {
      const a = { x: Math.round(s.a.x * mmPorUnidade), y: Math.round(s.a.y * mmPorUnidade) };
      const b = { x: Math.round(s.b.x * mmPorUnidade), y: Math.round(s.b.y * mmPorUnidade) };
      return {
        a,
        b,
        espessuraMm,
        comprimentoMm: Math.round(Math.hypot(b.x - a.x, b.y - a.y)),
        camada: s.camada,
      };
    })
    .filter((p) => p.comprimentoMm > 0);
}

/**
 * Tira o eixo que descreve a MESMA parede que outro.
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * O pareamento consome face por TRECHO, e uma mesma face pode encontrar mais de
 * uma contraparte — a face externa de uma parede rebocada encontra a interna e
 * também a linha do reboco. O resultado é o mesmo pedaço de parede saindo duas
 * vezes, sobreposto. Medido no projeto real da empresa: **108 das 572** paredes
 * (19%) tinham uma quase-cópia.
 *
 * ─── O CRITÉRIO É ESTREITO DE PROPÓSITO ─────────────────────────────────────
 *
 * ⚠️ Duas paredes paralelas e próximas EXISTEM de verdade: um duto de shaft tem
 * duas, a 20 cm uma da outra. Fundir por proximidade apagaria o shaft e o
 * ambiente entre elas — um cômodo a menos, sem aviso.
 *
 * Por isso a condição não é "estão perto": é **os corpos se sobrepõem** — a
 * distância entre os eixos é menor que metade da espessura menor. Duas paredes
 * de 15 cm a 20 cm de distância não se tocam e sobrevivem às duas; o mesmo
 * trecho pareado duas vezes, com 3 cm entre os eixos, não.
 *
 * Fica a MAIS LONGA, porque o par que cobre mais face é o que descreve mais
 * parede real.
 */
export function tirarDuplicadas<T extends ParedeDoDxf>(paredes: T[]): {
  paredes: T[];
  removidas: number;
} {
  const dir = (p: T) => {
    const dx = p.b.x - p.a.x;
    const dy = p.b.y - p.a.y;
    const L = Math.hypot(dx, dy);
    return { ux: dx / L, uy: dy / L, L };
  };
  // Da mais longa para a mais curta: a que fica é sempre a que descreve mais.
  const ordenadas = [...paredes].sort((a, b) => b.comprimentoMm - a.comprimentoMm);
  const fora = new Set<number>();

  for (let i = 0; i < ordenadas.length; i++) {
    if (fora.has(i)) continue;
    const a = ordenadas[i];
    const da = dir(a);
    if (!(da.L > 0)) continue;
    for (let j = i + 1; j < ordenadas.length; j++) {
      if (fora.has(j)) continue;
      const b = ordenadas[j];
      const db = dir(b);
      if (!(db.L > 0)) continue;

      // Paralelas, sem se importar com o sentido do traço.
      if (Math.abs(da.ux * db.ux + da.uy * db.uy) < 0.999) continue;

      // Os CORPOS se sobrepõem — e não só "estão perto".
      const perp = Math.abs((b.a.x - a.a.x) * -da.uy + (b.a.y - a.a.y) * da.ux);
      if (perp >= Math.min(a.espessuraMm, b.espessuraMm) / 2) continue;

      // E cobrem o mesmo trecho: um encosto de topo não é duplicata.
      const s0 = (b.a.x - a.a.x) * da.ux + (b.a.y - a.a.y) * da.uy;
      const s1 = (b.b.x - a.a.x) * da.ux + (b.b.y - a.a.y) * da.uy;
      const sobreposto =
        Math.min(Math.max(s0, s1), da.L) - Math.max(Math.min(s0, s1), 0);
      if (sobreposto > 0.6 * Math.min(da.L, db.L)) fora.add(j);
    }
  }

  return {
    paredes: ordenadas.filter((_, i) => !fora.has(i)),
    removidas: fora.size,
  };
}

// ─── ESQUADRIAS (P2.33): porta pelo arco, janela pelo símbolo, vão pelo buraco ──
//
// Uma parede com porta volta do pareamento como DOIS trechos colineares com um
// buraco: as faces param no batente, e `juntarColineares` não cruza o vão de
// propósito. O buraco é a abertura; o que está desenhado EM CIMA dele diz qual:
//
//  - **Porta**: o arco do giro da folha. Centro na dobradiça (numa ponta do
//    buraco), raio = largura da folha = largura do buraco, varredura de ~90°.
//    O lado em que o arco está diz para onde a porta abre; a ponta em que o
//    centro está diz de onde sai a dobradiça. Medido no projeto real da
//    empresa: 38 arcos na camada PORTAS, um por porta.
//  - **Janela**: traços PARALELOS à parede dentro do buraco (o símbolo de
//    vidro/peitoril: 2 a 4 linhas). No projeto real: 402 LINE na camada JANELAS.
//  - **Vão livre**: buraco sem símbolo nenhum, até `vaoLivreMaxMm` (padrão 3 m —
//    decisão de 21/09/2026). Acima disso ficam duas paredes: é recuo, não vão.
//
// O símbolo mora em OUTRA camada que a da parede (PORTAS, JANELAS), então a
// busca é em todas as camadas — menos a de parede, cujos traços são face e não
// vidro. Nome de bloco ("PORTA-80", "JAN-120") vale como pista quando o
// desenho veio em bloco.
//
// As ALTURAS não estão no DXF (é planta): vêm das hipóteses editáveis do painel.

export interface HipotesesDeEsquadrias {
  /** Reconhecer porta (arco) e janela (símbolo) em todas as camadas. Desligado: só o vão livre pelo buraco. */
  reconhecerSimbolos: boolean;
  portaAlturaMm: number;
  janelaPeitorilMm: number;
  janelaAlturaMm: number;
  /** Buraco sem símbolo até isto vira vão livre; `0` = não emendar. */
  vaoLivreMaxMm: number;
  /** Buraco menor que isto é fresta de desenho, não vão. */
  vaoMinMm: number;
  /** FRESTA (P2.34): buraco menor que o vão mínimo e até isto emenda sem abertura (o cruzamento em T). */
  frestaMaxMm: number;
}

export const HIPOTESES_ESQUADRIAS_PADRAO: HipotesesDeEsquadrias = {
  reconhecerSimbolos: true,
  portaAlturaMm: 2100,
  janelaPeitorilMm: 1000,
  janelaAlturaMm: 1200,
  vaoLivreMaxMm: 3000,
  vaoMinMm: 300,
  frestaMaxMm: 299,
};

/** Porta e janela cabem num buraco até isto, mesmo com o vão livre desligado. */
const BURACO_MAX_MM = 6000;
/** Raio plausível do arco de uma folha de porta (mm). */
const RAIO_PORTA_MIN_MM = 500;
const RAIO_PORTA_MAX_MM = 1600;
/**
 * Folga entre o centro do arco e a ponta do buraco, além de meia espessura: o
 * CAD põe a dobradiça na face, no eixo ou no batente — medido no projeto real,
 * 175 mm do eixo numa parede de 150 (100 mm além da face) é comum.
 */
const FOLGA_DOBRADICA_MM = 150;
const BLOCO_DE_PORTA = /porta|door/i;
const BLOCO_DE_JANELA = /janela|window|\bjan\b/i;
/** Camada (ou bloco) cujo nome declara esquadria: a evidência que permite abrir janela em parede contínua (P2.41). */
const NOME_DE_JANELA = /janela|window|esquadr|\bjan\b/i;
/** Largura plausível de uma janela em planta, em mm. */
const JANELA_MIN_MM = 400;
const JANELA_MAX_MM = 4000;

export interface ParedeComAberturas extends ParedeDoDxf {
  aberturas: AberturaLida[];
}

export interface ResumoDeEsquadrias {
  portas: number;
  janelas: number;
  vaos: number;
  /** Arcos com cara de porta (varredura e raio) que não encontraram parede nem buraco. */
  arcosSemParede: number;
  /** Tocos de batente (mais largos que compridos) descartados de dentro dos vãos. */
  tocosDeBatente: number;
  /** P2.34: pontas levadas da face ao eixo da parede que cruzam (`encostarNasFaces`). */
  encostadas: number;
  /** P2.34: pontas que continuam sem tocar parede nenhuma — o que vai aparecer como ponta solta. */
  pontasSoltas: number;
  /** P2.34: cantos em L fechados levando as duas pontas soltas ao cruzamento dos eixos. */
  cantosFechados: number;
  /** P2.40: arcos de porta que não têm vão na parede — nenhuma porta é criada para eles. */
  arcosSemVao: number;
  /** P2.40: portas abertas no vão entre a ponta da parede e o batente do canto. */
  portasNoCanto: number;
  /** P2.41: janelas abertas pelo SÍMBOLO dentro de parede contínua (o desenho não interrompeu as faces). */
  janelasPeloSimbolo: number;
  /** P2.41: grupos de símbolo de janela sobre parede que não viraram janela (largura fora da faixa, traços de menos). */
  simbolosDeJanelaIgnorados: number;
}

interface Ponto {
  x: number;
  y: number;
}

/** Um arco já em mm com o que a porta precisa dele. */
interface ArcoDePorta {
  c: Ponto;
  raio: number;
  varredura: number;
  /** Ponto médio do arco: o lado para onde a folha abre. */
  meio: Ponto;
  /** As duas pontas: uma delas é a folha fechada, encostada na parede. */
  pontas: [Ponto, Ponto];
  bloco?: string;
  usado: boolean;
}

/** Um segmento em mm, com o que a janela precisa dele. */
interface TracoMm {
  a: Ponto;
  b: Ponto;
  ux: number;
  uy: number;
  L: number;
  camada: string;
  bloco?: string;
}

const graus = (g: number) => (g * Math.PI) / 180;

function arcosDePorta(arcos: readonly ArcoDxf[], mm: number): ArcoDePorta[] {
  const saida: ArcoDePorta[] = [];
  for (const a of arcos) {
    const raio = a.raio * mm;
    if (raio < RAIO_PORTA_MIN_MM || raio > RAIO_PORTA_MAX_MM) continue;
    let varredura = (a.anguloFinal - a.anguloInicial) % 360;
    if (varredura < 0) varredura += 360;
    if (varredura === 0) varredura = 360;
    // Um quarto de volta é a folha; meia volta é a porta dupla/vaivém. Círculo inteiro não é porta.
    const quarto = varredura >= 60 && varredura <= 120;
    const meia = varredura >= 170 && varredura <= 190;
    if (!quarto && !meia) continue;
    const c = { x: a.centro.x * mm, y: a.centro.y * mm };
    const ponto = (g: number) => ({ x: c.x + raio * Math.cos(graus(g)), y: c.y + raio * Math.sin(graus(g)) });
    saida.push({ c, raio, varredura, meio: ponto(a.anguloInicial + varredura / 2), pontas: [ponto(a.anguloInicial), ponto(a.anguloFinal)], ...(a.bloco ? { bloco: a.bloco } : {}), usado: false });
  }
  return saida;
}

function tracosMm(segmentos: readonly SegmentoDxf[], mm: number, camadaDeParede: string): TracoMm[] {
  const saida: TracoMm[] = [];
  for (const s of segmentos) {
    if (s.camada === camadaDeParede && !s.bloco) continue;
    const a = { x: s.a.x * mm, y: s.a.y * mm };
    const b = { x: s.b.x * mm, y: s.b.y * mm };
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    // Símbolo de janela tem entre uns centímetros e alguns metros; fora disso é cota, hachura ou paisagismo.
    if (L < 100 || L > BURACO_MAX_MM) continue;
    saida.push({ a, b, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L, L, camada: s.camada, ...(s.bloco ? { bloco: s.bloco } : {}) });
  }
  return saida;
}

const dist = (p: Ponto, q: Ponto) => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * Reconhece portas, janelas e vãos livres nas paredes de um DXF e as devolve
 * emendadas (dois trechos com buraco → uma parede com abertura). Ver o
 * cabeçalho da seção. `alturaDaParedeMm` é o pé-direito: vão livre vai de piso
 * a teto, e porta/janela não passam dele.
 */
export function aberturasDoDxf(
  paredes: readonly ParedeDoDxf[],
  leitura: { segmentos: readonly SegmentoDxf[]; arcos: readonly ArcoDxf[] },
  mmPorUnidade: number,
  camadaDeParede: string,
  alturaDaParedeMm: number,
  hip: HipotesesDeEsquadrias = HIPOTESES_ESQUADRIAS_PADRAO,
): { paredes: ParedeComAberturas[]; resumo: ResumoDeEsquadrias } {
  const arcos = hip.reconhecerSimbolos ? arcosDePorta(leitura.arcos, mmPorUnidade) : [];
  const tracos = hip.reconhecerSimbolos ? tracosMm(leitura.segmentos, mmPorUnidade, camadaDeParede) : [];
  const resumo: ResumoDeEsquadrias = { portas: 0, janelas: 0, vaos: 0, arcosSemParede: 0, tocosDeBatente: 0, encostadas: 0, pontasSoltas: 0, cantosFechados: 0, arcosSemVao: 0, portasNoCanto: 0, janelasPeloSimbolo: 0, simbolosDeJanelaIgnorados: 0 };
  const alturaPorta = Math.min(hip.portaAlturaMm, alturaDaParedeMm);
  const janela = (): AberturaLida => {
    const sill = Math.min(hip.janelaPeitorilMm, Math.max(0, alturaDaParedeMm - 1));
    return { kind: 'window', offsetMm: 0, widthMm: 0, heightMm: Math.max(1, Math.min(hip.janelaAlturaMm, alturaDaParedeMm - sill)), sillMm: sill };
  };

  const comAberturas: ParedeComAberturas[] = paredes.map((p) => ({ ...p, aberturas: [] }));

  const emendadas = emendarColineares(comAberturas, {
    vaoMinMm: hip.vaoMinMm,
    frestaMaxMm: hip.frestaMaxMm ?? 0,
    vaoMaxMm: Math.max(hip.vaoLivreMaxMm, hip.reconhecerSimbolos ? BURACO_MAX_MM : 0),
    classificar: (v) => {
      const nx = -v.uy;
      const ny = v.ux;
      const meia = v.espessuraMm / 2 + FOLGA_DOBRADICA_MM;
      /** Posição ao longo do eixo e afastamento perpendicular de um ponto, medidos do começo do buraco. */
      const local = (p: Ponto) => ({ t: (p.x - v.inicio.x) * v.ux + (p.y - v.inicio.y) * v.uy, n: (p.x - v.inicio.x) * nx + (p.y - v.inicio.y) * ny });

      // ── Porta pelo arco: centro numa ponta do buraco, raio ≈ largura ─────
      let melhor: { arco: ArcoDePorta; hingeAtStart: boolean; erro: number } | null = null;
      for (const arco of arcos) {
        if (arco.usado) continue;
        const dIni = dist(arco.c, v.inicio);
        const dFim = dist(arco.c, v.fim);
        if (arco.varredura <= 120) {
          if (Math.abs(arco.raio - v.larguraMm) > Math.max(150, 0.15 * v.larguraMm)) continue;
          const d = Math.min(dIni, dFim);
          if (d > meia) continue;
          // A folha FECHADA atravessa o buraco: uma ponta do arco está na outra ponta do vão.
          const outra = dIni <= dFim ? v.fim : v.inicio;
          const fechada = Math.min(...arco.pontas.map((q) => dist(q, outra)));
          if (fechada > meia + 50) continue;
          const erro = d + fechada;
          if (!melhor || erro < melhor.erro) melhor = { arco, hingeAtStart: dIni <= dFim, erro };
        } else {
          // Meia volta: centro no meio do buraco, diâmetro ≈ largura.
          const { t, n } = local(arco.c);
          if (Math.abs(2 * arco.raio - v.larguraMm) > 150 || Math.abs(t - v.larguraMm / 2) > 150 || Math.abs(n) > meia) continue;
          const erro = Math.abs(2 * arco.raio - v.larguraMm);
          if (!melhor || erro < melhor.erro) melhor = { arco, hingeAtStart: true, erro };
        }
      }
      if (melhor) {
        melhor.arco.usado = true;
        const abreParaOLadoNegativo = local(melhor.arco.meio).n < 0;
        resumo.portas++;
        return { kind: 'door', offsetMm: 0, widthMm: 0, heightMm: alturaPorta, sillMm: 0, hingeAtStart: melhor.hingeAtStart, swingReversed: abreParaOLadoNegativo };
      }
      // Porta de DUAS FOLHAS: um arco em cada ponta do buraco, cada raio ≈ metade da largura.
      const meiaFolha = (ponta: Ponto) => arcos.find((a) => !a.usado && a.varredura <= 120 && dist(a.c, ponta) <= meia && Math.abs(2 * a.raio - v.larguraMm) <= Math.max(150, 0.15 * v.larguraMm));
      const folhaIni = meiaFolha(v.inicio);
      const folhaFim = meiaFolha(v.fim);
      if (folhaIni && folhaFim && folhaIni !== folhaFim) {
        folhaIni.usado = true;
        folhaFim.usado = true;
        resumo.portas++;
        // Duas folhas de meia largura, dobradiças nas pontas, mesmo lado de abrir — é o que o CAD desenhou.
        const meiaLargura = Math.round(v.larguraMm / 2);
        const lado = local(folhaIni.meio).n < 0;
        return [
          { kind: 'door', offsetMm: 0, widthMm: meiaLargura, heightMm: alturaPorta, sillMm: 0, hingeAtStart: true, swingReversed: lado },
          { kind: 'door', offsetMm: meiaLargura, widthMm: Math.round(v.larguraMm) - meiaLargura, heightMm: alturaPorta, sillMm: 0, hingeAtStart: false, swingReversed: lado },
        ];
      }

      // ── Símbolo dentro do buraco: traços paralelos (janela) ou nome de bloco ──
      let paralelos = 0;
      let coberto = 0;
      const intervalos: [number, number][] = [];
      let blocoDePorta = false;
      let blocoDeJanela = false;
      const faixa = v.espessuraMm / 2 + 50;
      for (const s of tracos) {
        const la = local(s.a);
        const lb = local(s.b);
        // Está na caixa do buraco (com folga para símbolo que sai um pouco da parede)?
        const dentro = (l: { t: number; n: number }) => l.t >= -50 && l.t <= v.larguraMm + 50 && Math.abs(l.n) <= Math.max(faixa, v.larguraMm + 100);
        if (s.bloco && (dentro(la) || dentro(lb))) {
          if (BLOCO_DE_PORTA.test(s.bloco)) blocoDePorta = true;
          if (BLOCO_DE_JANELA.test(s.bloco)) blocoDeJanela = true;
        }
        if (Math.abs(s.ux * v.ux + s.uy * v.uy) < 0.99985) continue; // ±1°
        if (Math.abs(la.n) > faixa || Math.abs(lb.n) > faixa) continue;
        const t0 = Math.max(0, Math.min(la.t, lb.t));
        const t1 = Math.min(v.larguraMm, Math.max(la.t, lb.t));
        if (t1 - t0 < 50) continue;
        paralelos++;
        intervalos.push([t0, t1]);
      }
      if (intervalos.length) {
        intervalos.sort((x, y) => x[0] - y[0]);
        let [ini, fim] = intervalos[0];
        for (const [a, b] of intervalos.slice(1)) {
          if (a > fim) {
            coberto += fim - ini;
            [ini, fim] = [a, b];
          } else fim = Math.max(fim, b);
        }
        coberto += fim - ini;
      }
      if (blocoDePorta && !blocoDeJanela) {
        resumo.portas++;
        // O bloco de porta quase sempre traz o arco do giro dentro dele. Se houver um com o centro
        // numa ponta do vão, ele diz a dobradiça e o lado — sem isso a porta entrava com o padrão
        // (dobradiça no início, abrindo para +n), que acerta por acaso em metade dos casos.
        const doBloco = arcos.find((a) => !a.usado && (dist(a.c, v.inicio) <= meia || dist(a.c, v.fim) <= meia));
        if (doBloco) {
          doBloco.usado = true;
          return { kind: 'door', offsetMm: 0, widthMm: 0, heightMm: alturaPorta, sillMm: 0, hingeAtStart: dist(doBloco.c, v.inicio) <= dist(doBloco.c, v.fim), swingReversed: local(doBloco.meio).n < 0 };
        }
        return { kind: 'door', offsetMm: 0, widthMm: 0, heightMm: alturaPorta, sillMm: 0 };
      }
      if (blocoDeJanela || (paralelos >= 2 && coberto >= 0.6 * v.larguraMm)) {
        resumo.janelas++;
        return janela();
      }

      // ── Nada em cima: vão livre até o teto de hipótese ────────────────────
      if (hip.vaoLivreMaxMm > 0 && v.larguraMm <= hip.vaoLivreMaxMm) {
        resumo.vaos++;
        return { kind: 'passage', offsetMm: 0, widthMm: 0, heightMm: alturaDaParedeMm, sillMm: 0 };
      }
      return null;
    },
  });

  // ── Arco NA PONTA da parede, contra o batente do canto (P2.40) ───────────
  //
  // ⚠️ A REGRA É: PRIMEIRO O VÃO, DEPOIS O ARCO. O arco diz que um vão é porta,
  // e para que lado ela abre — ele NÃO cria o vão. Até a P2.39 um arco em cima
  // de parede contínua abria uma porta com a largura do raio: nascia abertura
  // onde o desenho não tinha nenhuma, e na posição que o arco sugeria, não na
  // do vão (que não existia) — o defeito que o usuário viu em 23/09/2026.
  //
  // Sobra UM caso legítimo sem buraco entre trechos: a porta encostada num
  // CANTO. Ali o batente da dobradiça é a parede perpendicular, então só há
  // trecho colinear de um lado e não existe o que emendar — mas o vão existe no
  // desenho, entre a ponta da parede e a perpendicular. É esse vão que se abre,
  // e só quando a perpendicular está lá: sem ela, não há batente, e sem batente
  // não há vão.
  for (const arco of arcos) {
    if (arco.usado || arco.varredura > 120) continue;
    let hospedeira: { p: ParedeComAberturas; tC: number; tE: number; n: number; L: number } | null = null;
    /** Alguma parede passa pelo centro do arco? Distingue "longe de tudo" de "em parede sem vão". */
    let emAlgumaParede = false;
    for (const p of emendadas) {
      const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1;
      const ux = (p.b.x - p.a.x) / L;
      const uy = (p.b.y - p.a.y) / L;
      const nx = -uy;
      const ny = ux;
      const meia = p.espessuraMm / 2 + FOLGA_DOBRADICA_MM;
      const nC = (arco.c.x - p.a.x) * nx + (arco.c.y - p.a.y) * ny;
      if (Math.abs(nC) > meia) continue;
      {
        const t = (arco.c.x - p.a.x) * ux + (arco.c.y - p.a.y) * uy;
        if (t >= -FOLGA_DOBRADICA_MM && t <= L + FOLGA_DOBRADICA_MM) emAlgumaParede = true;
      }
      const tC = (arco.c.x - p.a.x) * ux + (arco.c.y - p.a.y) * uy;
      // A ponta da folha fechada está encostada na mesma reta, a um raio do centro.
      const fechada = arco.pontas.find((q) => Math.abs((q.x - p.a.x) * nx + (q.y - p.a.y) * ny) <= meia + 50);
      if (!fechada) continue;
      const tE = (fechada.x - p.a.x) * ux + (fechada.y - p.a.y) * uy;
      const t0 = Math.min(tC, tE);
      const t1 = Math.max(tC, tE);
      // SÓ o vão que sai por uma ponta da parede: dentro dela não há vão nenhum (a parede é contínua ali).
      const folga = arco.raio + FOLGA_DOBRADICA_MM;
      const saiPorA = t0 < -50 && t1 <= L + 50 && t0 >= -folga;
      const saiPorB = t1 > L + 50 && t0 >= -50 && t1 <= L + folga;
      if (!saiPorA && !saiPorB) continue;
      // E a folha fechada tem de terminar na ponta da parede — é o outro batente do vão.
      if (saiPorA && Math.abs(tE) > 50) continue;
      if (saiPorB && Math.abs(tE - L) > 50) continue;
      const nMeio = (arco.meio.x - p.a.x) * nx + (arco.meio.y - p.a.y) * ny;
      const custo = (saiPorA ? -t0 : t1 - L) + Math.abs(nC);
      const custoAtual = hospedeira ? Math.abs(hospedeira.n) + Math.max(-Math.min(hospedeira.tC, hospedeira.tE), Math.max(hospedeira.tC, hospedeira.tE) - hospedeira.L) : Infinity;
      if (custo < custoAtual) hospedeira = { p, tC, tE, n: nMeio, L };
    }
    if (!hospedeira) {
      // Em cima de uma parede, mas sem vão ali; ou longe de qualquer parede (paisagismo, carimbo).
      if (emAlgumaParede) resumo.arcosSemVao++;
      else resumo.arcosSemParede++;
      continue;
    }
    const { p, L, tC, tE } = hospedeira;
    const t0 = Math.min(tC, tE);
    const t1 = Math.max(tC, tE);
    const ext0 = t0 < 0 ? Math.round(-t0) : 0;
    const ext1 = t1 > L ? Math.round(t1 - L) : 0;
    const ux = (p.b.x - p.a.x) / L;
    const uy = (p.b.y - p.a.y) / L;
    // O BATENTE: uma parede que cruza a reta no fim do vão. Sem ela, o vão não existe — e a porta não nasce.
    const pontaDoVao = ext0
      ? { x: p.a.x - ux * ext0, y: p.a.y - uy * ext0 }
      : { x: p.b.x + ux * ext1, y: p.b.y + uy * ext1 };
    const temBatente = emendadas.some((o) => {
      if (o === p) return false;
      const Lo = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y) || 1;
      const ox = (o.b.x - o.a.x) / Lo;
      const oy = (o.b.y - o.a.y) / Lo;
      // Perpendicular (ou pelo menos não paralela) e passando pela ponta do vão.
      if (Math.abs(ox * ux + oy * uy) > 0.5) return false;
      const t = (pontaDoVao.x - o.a.x) * ox + (pontaDoVao.y - o.a.y) * oy;
      const n = Math.abs((pontaDoVao.x - o.a.x) * -oy + (pontaDoVao.y - o.a.y) * ox);
      return t >= -FOLGA_DOBRADICA_MM && t <= Lo + FOLGA_DOBRADICA_MM && n <= o.espessuraMm / 2 + FOLGA_DOBRADICA_MM;
    });
    if (!temBatente) {
      resumo.arcosSemVao++;
      continue;
    }
    const novoL = Math.round(L) + ext0 + ext1;
    const offsetMm = Math.max(0, Math.round(t0) + ext0);
    const widthMm = Math.min(Math.round(arco.raio), novoL - offsetMm);
    if (widthMm < hip.vaoMinMm) continue;
    if (p.aberturas.some((ab) => ab.offsetMm + ext0 < offsetMm + widthMm && offsetMm < ab.offsetMm + ext0 + ab.widthMm)) continue;
    if (ext0) {
      p.a = { x: Math.round(p.a.x - ux * ext0), y: Math.round(p.a.y - uy * ext0) };
      for (const ab of p.aberturas) ab.offsetMm += ext0;
    }
    if (ext1) p.b = { x: Math.round(p.b.x + ux * ext1), y: Math.round(p.b.y + uy * ext1) };
    p.comprimentoMm = novoL;
    arco.usado = true;
    resumo.portas++;
    resumo.portasNoCanto++;
    p.aberturas.push({ kind: 'door', offsetMm, widthMm, heightMm: alturaPorta, sillMm: 0, hingeAtStart: tC <= tE, swingReversed: hospedeira.n < 0 });
    p.aberturas.sort((x, y) => x.offsetMm - y.offsetMm);
  }

  // ── Tocos de batente atravessados na parede ──────────────────────────────
  //
  // As duas linhas de batente de um pilarete entre duas portas (350 mm uma da
  // outra, 150 mm de comprimento) PAREIAM como se fossem parede: um toco mais
  // largo que comprido, atravessado dentro do corpo da parede emendada (ou do
  // vão). Existia antes desta fase, solto; agora que o pilarete e as portas
  // viraram uma parede só, o toco é um traço cruzado dentro dela. Sai o que é
  // mais largo que comprido e tem o centro dentro do corpo de outra parede.
  const tocos = new Set<ParedeComAberturas>();
  for (const t of emendadas) {
    if (t.comprimentoMm > t.espessuraMm) continue;
    const cx = (t.a.x + t.b.x) / 2;
    const cy = (t.a.y + t.b.y) / 2;
    for (const p of emendadas) {
      if (p === t || p.comprimentoMm <= p.espessuraMm) continue;
      const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1;
      const ux = (p.b.x - p.a.x) / L;
      const uy = (p.b.y - p.a.y) / L;
      const n = Math.abs((cx - p.a.x) * -uy + (cy - p.a.y) * ux);
      if (n > p.espessuraMm / 2) continue;
      const tt = (cx - p.a.x) * ux + (cy - p.a.y) * uy;
      if (tt >= -50 && tt <= L + 50) {
        tocos.add(t);
        break;
      }
    }
  }
  resumo.tocosDeBatente = tocos.size;

  // ── Janela pelo SÍMBOLO, em parede contínua (P2.41) ──────────────────────
  //
  // A porta precisa do vão desenhado (P2.40) porque o arco não diz onde ele
  // começa nem termina. A JANELA é outra coisa: o símbolo — as duas ou mais
  // linhas de vidro — atravessa o vão de ponta a ponta, e a extensão delas É a
  // largura da abertura, medida, não suposta. Por isso aqui a janela pode
  // nascer sem buraco entre trechos: quando o desenhista não interrompeu as
  // faces da parede e desenhou a esquadria por cima.
  //
  // ⚠️ SÓ COM O NOME DECLARANDO. Bancada, armário e degrau também são traços
  // paralelos dentro da parede; o que separa a janela deles é a camada (ou o
  // bloco) se chamar janela/window/esquadria. Sem esse nome, não se abre nada —
  // o preço de errar aqui é um buraco na parede de quem confiou no importador.
  if (hip.reconhecerSimbolos) {
    for (const p of emendadas) {
      const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1;
      const ux = (p.b.x - p.a.x) / L;
      const uy = (p.b.y - p.a.y) / L;
      const nx = -uy;
      const ny = ux;
      const faixa = p.espessuraMm / 2 + 50;
      const intervalos: [number, number][] = [];
      for (const t of tracos) {
        if (!NOME_DE_JANELA.test(t.camada) && !(t.bloco && NOME_DE_JANELA.test(t.bloco))) continue;
        if (Math.abs(t.ux * ux + t.uy * uy) < 0.99985) continue;
        const na = (t.a.x - p.a.x) * nx + (t.a.y - p.a.y) * ny;
        const nb = (t.b.x - p.a.x) * nx + (t.b.y - p.a.y) * ny;
        if (Math.abs(na) > faixa || Math.abs(nb) > faixa) continue;
        const ta = (t.a.x - p.a.x) * ux + (t.a.y - p.a.y) * uy;
        const tb = (t.b.x - p.a.x) * ux + (t.b.y - p.a.y) * uy;
        const t0 = Math.max(0, Math.min(ta, tb));
        const t1 = Math.min(L, Math.max(ta, tb));
        if (t1 - t0 < hip.vaoMinMm) continue;
        intervalos.push([t0, t1]);
      }
      if (intervalos.length < 2) continue;
      // Traços que se tocam são a MESMA esquadria; um espaço entre eles separa duas janelas.
      intervalos.sort((a, b) => a[0] - b[0]);
      const grupos: { ini: number; fim: number; quantos: number }[] = [];
      let atual = { ini: intervalos[0][0], fim: intervalos[0][1], quantos: 1 };
      for (const [a, b] of intervalos.slice(1)) {
        if (a > atual.fim + 100) {
          grupos.push(atual);
          atual = { ini: a, fim: b, quantos: 1 };
        } else {
          atual.fim = Math.max(atual.fim, b);
          atual.quantos++;
        }
      }
      grupos.push(atual);
      for (const g of grupos) {
        if (g.quantos < 2) continue;
        const largura = Math.round(g.fim - g.ini);
        const offsetMm = Math.round(g.ini);
        if (largura < JANELA_MIN_MM || largura > JANELA_MAX_MM) {
          resumo.simbolosDeJanelaIgnorados++;
          continue;
        }
        // Onde já há abertura (o caminho do vão, que é o preferido), não se mexe.
        if (p.aberturas.some((ab) => ab.offsetMm < offsetMm + largura && offsetMm < ab.offsetMm + ab.widthMm)) continue;
        const sill = Math.min(hip.janelaPeitorilMm, Math.max(0, alturaDaParedeMm - 1));
        p.aberturas.push({ kind: 'window', offsetMm, widthMm: largura, heightMm: Math.max(1, Math.min(hip.janelaAlturaMm, alturaDaParedeMm - sill)), sillMm: sill });
        p.aberturas.sort((x, y) => x.offsetMm - y.offsetMm);
        resumo.janelas++;
        resumo.janelasPeloSimbolo++;
      }
    }
  }

  const limpas = emendadas.filter((p) => !tocos.has(p));
  return { paredes: acabarJuncoes(limpas, resumo), resumo };
}

/**
 * JUNÇÕES (P2.34): encostar a ponta que parou na FACE da parede que cruza e
 * fechar o canto em L — o que faz o anel fechar. Compartilhado entre o caminho
 * das faces (`aberturasDoDxf`) e o do Padrão ÒPURA (P2.35). Preenche
 * `encostadas`, `pontasSoltas` e `cantosFechados` no resumo.
 */
export function acabarJuncoes(limpas: ParedeComAberturas[], resumo: Pick<ResumoDeEsquadrias, 'encostadas' | 'pontasSoltas' | 'cantosFechados'>): ParedeComAberturas[] {
  // ── Encostar a ponta que parou na FACE da parede que cruza (P2.34) ───────
  //
  // Num desenho de faces a parede que chega para na face da que passa: a ponta
  // fica a meia espessura do eixo, dentro do corpo da outra — e o anel não
  // fecha. `encostarNasFaces` (do IFC) leva a ponta ao eixo só nessa condição.
  // Como a ponta `a` pode andar, os offsets das aberturas (medidos de `a`)
  // deslocam junto; abertura que sair da parede é descartada.
  const encosto = encostarNasFaces(limpas, 5);
  resumo.encostadas = encosto.encostadas;
  resumo.pontasSoltas = encosto.soltas;
  const encostadas: ParedeComAberturas[] = [];
  encosto.paredes.forEach((q, i) => {
    const p = limpas[i];
    const L = Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y);
    if (L < 1) return;
    const ux = (p.b.x - p.a.x) / (Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1);
    const uy = (p.b.y - p.a.y) / (Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1);
    const desloc = (q.a.x - p.a.x) * ux + (q.a.y - p.a.y) * uy;
    const aberturas = p.aberturas
      .map((ab) => ({ ...ab, offsetMm: Math.round(ab.offsetMm - desloc) }))
      .filter((ab) => ab.offsetMm >= 0 && ab.offsetMm + ab.widthMm <= Math.round(L));
    encostadas.push({ ...q, comprimentoMm: Math.round(L), aberturas });
  });

  // ── Fechar o CANTO onde as duas pontas ficaram soltas (P2.34) ────────────
  //
  // A mitragem (`mitrarCantos`) só ESTICA, e o encosto só leva a ponta ao eixo
  // de quem cruza pelo MEIO. Sobra o canto em L onde uma peça avançou e a
  // outra parou curta — duas pontas soltas a poucos centímetros, uma dentro do
  // corpo da outra, sem que nenhuma regra as una. Aqui, duas pontas SOLTAS,
  // não paralelas, a até `MAX_CANTO_MM`, vão as duas para o cruzamento dos
  // eixos, desde que nenhuma ande mais que isso. Pontas soltas juntas e não
  // paralelas são um canto; a trava de distância impede unir paredes distantes.
  const cantos = fecharCantos(encostadas);
  resumo.cantosFechados = cantos.fechados;
  resumo.pontasSoltas = Math.max(0, resumo.pontasSoltas - 2 * cantos.fechados);
  return cantos.paredes;
}

const MAX_CANTO_MM = 300;

function fecharCantos(paredes: ParedeComAberturas[]): { paredes: ParedeComAberturas[]; fechados: number } {
  const saida = paredes.map((p) => ({ ...p, a: { ...p.a }, b: { ...p.b }, aberturas: p.aberturas.map((ab) => ({ ...ab })) }));
  const distSeg = (q: Ponto, a: Ponto, b: Ponto) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(q.x - a.x, q.y - a.y);
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2));
    return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
  };
  const solta = (i: number, q: Ponto) => saida.every((o, j) => j === i || distSeg(q, o.a, o.b) > 5);
  type Ponta = { i: number; lado: 'a' | 'b' };
  const soltas: Ponta[] = [];
  const pontas: Ponta[] = [];
  saida.forEach((p, i) => {
    pontas.push({ i, lado: 'a' }, { i, lado: 'b' });
    if (solta(i, p.a)) soltas.push({ i, lado: 'a' });
    if (solta(i, p.b)) soltas.push({ i, lado: 'b' });
  });
  const usadas = new Set<string>();
  let fechados = 0;
  for (let x = 0; x < soltas.length; x++) {
    const A = soltas[x];
    if (usadas.has(`${A.i}${A.lado}`)) continue;
    const pa = saida[A.i];
    const qa = pa[A.lado];
    let melhor: { B: Ponta; ponto: Ponto; custo: number } | null = null;
    // A outra ponta do canto pode já estar encostada (a peça que avançou 75 mm além do eixo da
    // outra deixa a própria ponta solta e a da outra no cruzamento): vale qualquer PONTA de parede perto.
    for (const B of pontas) {
      if (B.i === A.i || usadas.has(`${B.i}${B.lado}`)) continue;
      const pb = saida[B.i];
      const qb = pb[B.lado];
      if (Math.hypot(qa.x - qb.x, qa.y - qb.y) > MAX_CANTO_MM) continue;
      // Cruzamento das duas retas (eixos).
      const ax = pa.b.x - pa.a.x;
      const ay = pa.b.y - pa.a.y;
      const bx = pb.b.x - pb.a.x;
      const by = pb.b.y - pb.a.y;
      const den = ax * by - ay * bx;
      const La = Math.hypot(ax, ay) || 1;
      const Lb = Math.hypot(bx, by) || 1;
      if (Math.abs(den) < 0.05 * La * Lb) continue; // quase paralelas: não é canto
      const t = ((pb.a.x - pa.a.x) * by - (pb.a.y - pa.a.y) * bx) / den;
      const ponto = { x: Math.round(pa.a.x + ax * t), y: Math.round(pa.a.y + ay * t) };
      const da = Math.hypot(ponto.x - qa.x, ponto.y - qa.y);
      const db = Math.hypot(ponto.x - qb.x, ponto.y - qb.y);
      if (da > MAX_CANTO_MM || db > MAX_CANTO_MM) continue;
      // O cruzamento tem de ficar do lado da ponta (não no meio da peça): a ponta anda para fora ou recua pouco.
      const custo = da + db;
      if (!melhor || custo < melhor.custo) melhor = { B, ponto, custo };
    }
    if (!melhor) continue;
    for (const P of [A, melhor.B]) {
      const p = saida[P.i];
      const antigoA = { ...p.a };
      p[P.lado] = { ...melhor.ponto };
      const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
      if (P.lado === 'a') {
        // A ponta `a` andou: os offsets (medidos de `a`) deslocam pelo que ela andou ao longo do eixo.
        const ux = (p.b.x - p.a.x) / (L || 1);
        const uy = (p.b.y - p.a.y) / (L || 1);
        const desloc = (p.a.x - antigoA.x) * ux + (p.a.y - antigoA.y) * uy;
        p.aberturas = p.aberturas.map((ab) => ({ ...ab, offsetMm: Math.round(ab.offsetMm - desloc) }));
      }
      p.aberturas = p.aberturas.filter((ab) => ab.offsetMm >= 0 && ab.offsetMm + ab.widthMm <= Math.round(L));
      p.comprimentoMm = Math.round(L);
      usadas.add(`${P.i}${P.lado}`);
    }
    fechados++;
  }
  return { paredes: saida.filter((p) => p.comprimentoMm > 0), fechados };
}
