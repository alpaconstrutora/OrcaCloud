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
  /**
   * Item ARBITRADO, quando não há código de catálogo. É a lacuna que o Medição
   * cobria e a planta não: "Demolição de alvenaria, R$ 45/m²" não existe no
   * SINAPI e precisava de algum lugar para morar.
   */
  itemNome?: string | null;
  itemPreco?: number | null;
  /** Prancha sobre a qual foi traçada. Nulo = traçada sem fundo. */
  underlayId?: string | null;
  /** Agrupamento de tela. Camada é campo, não tabela — ver o plano. */
  camada: string;
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

/**
 * Código de orçamento para item arbitrado, DERIVADO DO NOME.
 *
 * O Medição Inteligente gera `MED-{4 dígitos aleatórios}`, e é por isso que
 * reexportar duplica linha: o código muda a cada vez, o casamento falha e uma
 * entrada nova é criada. Derivar do nome faz o mesmo item produzir sempre o
 * mesmo código — repetir a exportação atualiza em vez de acumular.
 *
 * O hash é curto de propósito: ele identifica dentro de um orçamento, não no
 * mundo. Colisão entre dois nomes diferentes é possível e sem consequência
 * prática — as duas linhas se fundiriam, e é o que se quer quando o nome é o
 * mesmo a menos de um acento.
 */
export function codigoDeItemAvulso(nome: string): string {
  const limpo = nome.trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < limpo.length; i++) {
    h = Math.imul(h ^ limpo.charCodeAt(i), 0x01000193) >>> 0;
  }
  return `MED-${h.toString(36).toUpperCase().padStart(7, '0').slice(0, 7)}`;
}

/** A forma tem para onde ir no orçamento? Catálogo OU item arbitrado. */
export function temDestinoNoOrcamento(f: FormaMedida): boolean {
  return !!f.itemCode || !!(f.itemNome && f.itemNome.trim());
}

/** Camadas em uso, para o filtro da tela. */
export function camadas(formas: FormaMedida[]): string[] {
  return [...new Set(formas.map((f) => f.camada || 'Geral'))].sort();
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
    if (!temDestinoNoOrcamento(f)) continue;
    const codigo = f.itemCode || codigoDeItemAvulso(f.itemNome!);
    const m = medir(f);
    const chave = `${codigo}|${m.unidade}`;
    const atual = mapa.get(chave);

    if (atual) {
      atual.total += m.valor;
      atual.formas += 1;
    } else {
      mapa.set(chave, {
        itemCode: codigo,
        unidade: m.unidade,
        total: m.valor,
        formas: 1,
      });
    }
  }

  return [...mapa.values()].sort((a, b) => a.itemCode.localeCompare(b.itemCode));
}

/** Formas sem destino — medem, mas não chegam ao orçamento. */
export function semItem(formas: FormaMedida[]): FormaMedida[] {
  return formas.filter((f) => !temDestinoNoOrcamento(f));
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
