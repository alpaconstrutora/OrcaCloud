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

import { lerDxf, type SegmentoDxf } from './dxfLeitor';
import {
  juntarColineares,
  mitrarCantos,
  parearFaces,
  type ParedeGerada,
} from './blueprintVetor';

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
