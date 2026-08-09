/**
 * Formas medidas — o levantamento à mão sobre a planta de fundo.
 *
 * ─── DUAS VERDADES, EMPILHADAS, NUNCA MISTURADAS ────────────────────────────
 *
 * O kernel deriva ambiente do arranjo planar: o contorno NUNCA é declarado pelo
 * usuário, e é esse invariante que sustenta o hash, o diff e a conferência do
 * quantitativo. Uma forma traçada à mão é o oposto — é uma afirmação.
 *
 * Por isso ela não entra em `model.spaces`. Vive numa camada própria, e o
 * resultado sai marcado: **DERIVADO** (recalculável, com fórmula e hash) ou
 * **MEDIDO** (traçado por alguém, na escala X). Quem revisa o orçamento passa a
 * ver quais números pode recalcular e quais dependem da mão de uma pessoa —
 * hoje ninguém sabe isso, porque o Medição não grava procedência nenhuma.
 *
 * ─── A UNIDADE VEM DO TIPO DA FORMA, E ISSO É MAIS FORTE ────────────────────
 *
 * Polígono é m², linha é m, ponto é unidade. Não há como mapear área para um
 * item cotado por metro, porque o tipo da forma decide. A trava de unidade do
 * de-para (RF-122) existe porque lá se mapeia medida livre para item livre;
 * aqui o erro é impossível por construção. É o ponto em que o Medição
 * Inteligente já era melhor que o meu de-para.
 */

import type { Point } from './blueprintKernel';
import { polygonArea, polygonPerimeter } from './blueprintKernel';
import { pixelParaModelo, modeloParaPixel, type Underlay } from './blueprintUnderlay';

export type TipoMedida = 'POLIGONO' | 'LINHA' | 'PONTO';

/** Dimensão que cada tipo produz. Fechado de propósito — ver o cabeçalho. */
export const DIMENSAO_POR_TIPO: Record<TipoMedida, 'M2' | 'M' | 'UN'> = {
  POLIGONO: 'M2',
  LINHA: 'M',
  PONTO: 'UN',
};

export interface FormaMedida {
  id: string;
  tipo: TipoMedida;
  /** Em MILÍMETRO DO MODELO, como todo o resto. Ver `transformarPorRecalibracao`. */
  pontos: Point[];
  nome: string;
  /** Código no catálogo — SINAPI ou base própria. Opcional até alguém ligar. */
  itemCode?: string | null;
  cor: string;
}

export interface ValorMedido {
  /** Já na unidade do tipo: m², m ou unidade. */
  valor: number;
  unidade: 'M2' | 'M' | 'UN';
  /** Explica de onde saiu o número, para conferência. */
  formula: string;
}

const MM2_PARA_M2 = 1_000_000;

/**
 * Quanto uma forma mede.
 *
 * Sem arredondar: a mesma disciplina do quantitativo derivado (PRD §9.2). Somar
 * valores já arredondados acumula o erro de cada parcela no total, e aqui o
 * total é o que vai para o orçamento.
 */
export function medir(forma: FormaMedida): ValorMedido {
  switch (forma.tipo) {
    case 'POLIGONO':
      return {
        valor: polygonArea(forma.pontos) / MM2_PARA_M2,
        unidade: 'M2',
        formula: 'área do polígono traçado (laço do agrimensor)',
      };

    case 'LINHA': {
      // Polilinha ABERTA: o perímetro fecharia o contorno e contaria um trecho
      // que ninguém desenhou.
      let mm = 0;
      for (let i = 0; i + 1 < forma.pontos.length; i++) {
        mm += Math.hypot(
          forma.pontos[i + 1].x - forma.pontos[i].x,
          forma.pontos[i + 1].y - forma.pontos[i].y,
        );
      }
      return { valor: mm / 1000, unidade: 'M', formula: 'soma dos trechos traçados' };
    }

    case 'PONTO':
      return {
        valor: forma.pontos.length,
        unidade: 'UN',
        formula: 'contagem de pontos marcados',
      };
  }
}

/** Perímetro de um polígono medido — útil para rodapé sem traçar de novo. */
export function perimetroM(forma: FormaMedida): number | null {
  if (forma.tipo !== 'POLIGONO') return null;
  return polygonPerimeter(forma.pontos) / 1000;
}

/**
 * Reposiciona as formas quando a planta de fundo é recalibrada.
 *
 * ESTE É O PONTO DELICADO DO MÓDULO. As formas são traçadas SOBRE a imagem, mas
 * guardadas em milímetro do modelo. Recalibrar move e redimensiona a imagem
 * embaixo delas — sem transformar, o contorno que seguia uma parede passa a
 * flutuar no vazio, e o número que ele mede vira ficção.
 *
 * A conversão é de ida e volta pelo pixel da imagem: onde a forma estava na
 * imagem ANTES, é onde ela deve continuar DEPOIS. É o que preserva a intenção de
 * quem traçou — ele apontou uma parede no desenho, não uma coordenada.
 *
 * Consequência desejada: corrigir a escala corrige TODAS as medições de uma vez,
 * sem retraçar nada.
 */
export function transformarPorRecalibracao(
  formas: FormaMedida[],
  antes: Underlay,
  depois: Underlay,
): FormaMedida[] {
  return formas.map((f) => ({
    ...f,
    pontos: f.pontos.map((p) => {
      const emPixel = modeloParaPixel(antes, p.x, p.y);
      const novo = pixelParaModelo(depois, emPixel);
      // Volta a milímetro inteiro: o resto do sistema trabalha assim, e deixar
      // fração aqui espalharia ponto flutuante para dentro do modelo.
      return { x: Math.round(novo.x), y: Math.round(novo.y) };
    }),
  }));
}

export interface TotalPorItem {
  itemCode: string;
  unidade: 'M2' | 'M' | 'UN';
  total: number;
  formas: number;
}

/**
 * Soma por item de catálogo.
 *
 * Agrupa por código E unidade. Duas formas de tipos diferentes ligadas ao mesmo
 * item seriam m² somado com metro — soma que não significa nada. Separar por
 * unidade transforma esse engano em duas linhas visíveis, em vez de um número
 * errado.
 */
export function totaisPorItem(formas: FormaMedida[]): TotalPorItem[] {
  const mapa = new Map<string, TotalPorItem>();

  for (const f of formas) {
    if (!f.itemCode) continue;
    const m = medir(f);
    const chave = `${f.itemCode}|${m.unidade}`;
    const atual = mapa.get(chave);

    if (atual) {
      atual.total += m.valor;
      atual.formas += 1;
    } else {
      mapa.set(chave, {
        itemCode: f.itemCode,
        unidade: m.unidade,
        total: m.valor,
        formas: 1,
      });
    }
  }

  return [...mapa.values()].sort((a, b) => a.itemCode.localeCompare(b.itemCode));
}

/** Formas sem item ligado — medem, mas não chegam ao orçamento. */
export function semItem(formas: FormaMedida[]): FormaMedida[] {
  return formas.filter((f) => !f.itemCode);
}

/**
 * Quantos pontos o tipo exige para a forma existir.
 *
 * Polígono com 2 pontos tem área zero e linha com 1 ponto tem comprimento zero:
 * as duas medem nada e ocupam a lista. Recusar na origem é melhor que gravar
 * uma medição de zero que alguém vai tentar entender depois.
 */
export function pontosMinimos(tipo: TipoMedida): number {
  return tipo === 'POLIGONO' ? 3 : tipo === 'LINHA' ? 2 : 1;
}

export function formaValida(forma: FormaMedida): boolean {
  return forma.pontos.length >= pontosMinimos(forma.tipo);
}
