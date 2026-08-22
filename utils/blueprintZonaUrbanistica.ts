/**
 * A zona do Mapa Regulatório traduzida para o que o editor de terreno usa.
 *
 * ─── ESTE MÓDULO É PURO ─────────────────────────────────────────────────────
 *
 * Recebe uma zona (texto, como o usuário digitou lendo a lei) e devolve números
 * nas unidades do editor. Não conhece React, nem Supabase — é o que permite
 * testar a tradução sem navegador e sem banco, e o que impede uma segunda cópia
 * da regra aparecer dentro do painel.
 *
 * ─── O QUE NÃO É NÚMERO NÃO VIRA ZERO ───────────────────────────────────────
 *
 * Campo com "N.A.", vazio ou texto livre ("conforme art. 42") sai como `null` e
 * entra em `naoAplicados`, com o rótulo em português. A tela NOMEIA esses campos
 * em vez de silenciá-los, pela mesma razão que `envelopeConstrutivo` já não
 * inventa recuo para divisa sem papel: restrição inventada é pior que restrição
 * faltando, porque parece conferida.
 */

import { lerMilimetros, lerPorcentagem, lerValorRegulatorio } from './regulatoryValue';
import { RECUOS_ZERO, type Recuos } from './blueprintTerreno';

/**
 * O que este módulo precisa de uma zona — e só isso.
 *
 * ⚠️ Tipo ESTRUTURAL de propósito, em vez do tipo da tabela do empreendimento. A
 * zona existe em DUAS tabelas com os MESMOS 21 campos de conteúdo:
 * `empreendimento_regulatory_zones` (a cópia editável do empreendimento) e
 * `regulatory_map_zones` (o catálogo por cidade). Amarrar a tradução a um dos
 * dois obrigaria a converter um no outro só para ler um recuo — e foi
 * justamente para o estudo SEM empreendimento poder ler o catálogo direto que
 * esta generalização existe.
 */
export interface ZonaRegulatoria {
  id: string;
  zona?: string;
  macroarea?: string;
  recuo_frente?: string;
  recuo_fundos?: string;
  recuo_lateral_direita?: string;
  recuo_lateral_esquerda?: string;
  taxa_ocupacao_maxima?: string;
  taxa_permeabilidade_minima?: string;
  ca_maximo?: string;
  gabarito_altura_maxima?: string;
  gabarito_pavimentos?: string;
  lei_referencia?: string;
  nivel_confianca?: string;
}


/** Cada número que o editor toma da lei. A chave é a mesma de `origem_valores`. */
export type CampoDaZona =
  | 'recuo_frente'
  | 'recuo_fundos'
  | 'recuo_lateral_direita'
  | 'recuo_lateral_esquerda'
  | 'taxa_ocupacao_max'
  | 'coeficiente_max'
  | 'gabarito_altura_max'
  | 'gabarito_pavimentos'
  | 'taxa_permeabilidade_min';

export const ROTULO_DO_CAMPO: Record<CampoDaZona, string> = {
  recuo_frente: 'recuo de frente',
  recuo_fundos: 'recuo de fundos',
  recuo_lateral_direita: 'recuo lateral direita',
  recuo_lateral_esquerda: 'recuo lateral esquerda',
  taxa_ocupacao_max: 'taxa de ocupação',
  coeficiente_max: 'coeficiente de aproveitamento',
  gabarito_altura_max: 'gabarito (altura)',
  gabarito_pavimentos: 'gabarito (pavimentos)',
  taxa_permeabilidade_min: 'taxa de permeabilidade',
};

/** O que o editor consome. `null` em qualquer campo = a lei não disse. */
export interface ValoresDaZona {
  /** Em MILÍMETRO, a unidade do kernel. `null` num papel = aquele lado não recua. */
  recuoMm: Record<keyof Recuos, number | null>;
  /** Em PORCENTAGEM (80 = 80%). */
  taxaOcupacaoMax: number | null;
  taxaPermeabilidadeMin: number | null;
  coeficienteMax: number | null;
  /** Em METRO. */
  gabaritoAlturaMaxM: number | null;
  gabaritoPavimentos: number | null;
}

export interface LeituraDaZona {
  valores: ValoresDaZona;
  /**
   * Campos que a zona tem preenchidos mas que NÃO deram número — "N.A.", texto
   * livre. Vão nomeados para a tela. Campo simplesmente VAZIO não entra: não
   * informado não é o mesmo que informado de forma ilegível, e listar os vazios
   * afogaria o aviso.
   */
  naoAplicados: { campo: CampoDaZona; textoOriginal: string }[];
}

/** Traduz a zona. Sempre devolve leitura — zona vazia devolve tudo `null`. */
export function lerZona(zona: ZonaRegulatoria): LeituraDaZona {
  const naoAplicados: LeituraDaZona['naoAplicados'] = [];

  /** Converte e, se o texto existia e não virou número, denuncia o campo. */
  function ler<T>(
    campo: CampoDaZona,
    texto: string | undefined,
    conversor: (v?: string | null) => T | null,
  ): T | null {
    const valor = conversor(texto);
    const preenchido = (texto ?? '').trim() !== '';
    if (valor === null && preenchido) {
      naoAplicados.push({ campo, textoOriginal: (texto ?? '').trim() });
    }
    return valor;
  }

  return {
    valores: {
      recuoMm: {
        FRENTE: ler('recuo_frente', zona.recuo_frente, lerMilimetros),
        FUNDOS: ler('recuo_fundos', zona.recuo_fundos, lerMilimetros),
        LATERAL_DIREITA: ler('recuo_lateral_direita', zona.recuo_lateral_direita, lerMilimetros),
        LATERAL_ESQUERDA: ler(
          'recuo_lateral_esquerda',
          zona.recuo_lateral_esquerda,
          lerMilimetros,
        ),
      },
      taxaOcupacaoMax: ler('taxa_ocupacao_max', zona.taxa_ocupacao_maxima, lerPorcentagem),
      taxaPermeabilidadeMin: ler(
        'taxa_permeabilidade_min',
        zona.taxa_permeabilidade_minima,
        lerPorcentagem,
      ),
      // C.A. é número puro (2,5 = duas vezes e meia a área do lote), não taxa —
      // passar por `lerPorcentagem` transformaria um C.A. de 1,0 em 100.
      coeficienteMax: ler('coeficiente_max', zona.ca_maximo, lerValorRegulatorio),
      gabaritoAlturaMaxM: ler(
        'gabarito_altura_max',
        zona.gabarito_altura_maxima,
        lerValorRegulatorio,
      ),
      gabaritoPavimentos: ler('gabarito_pavimentos', zona.gabarito_pavimentos, (v) => {
        const n = lerValorRegulatorio(v);
        return n === null ? null : Math.round(n);
      }),
    },
    naoAplicados,
  };
}

/**
 * Os recuos que o envelope vai usar, a partir da leitura.
 *
 * ⚠️ Papel sem valor na lei fica em **zero**, e isso NÃO contradiz o "não
 * inventar restrição": aqui zero é a ausência de recuo, que é o que o envelope
 * já faz com divisa sem papel. O aviso de que a lei não disse nada sobre aquele
 * lado é da tela — este módulo devolve o número que a geometria precisa.
 */
export function recuosDaZona(valores: ValoresDaZona): Recuos {
  return {
    FRENTE: valores.recuoMm.FRENTE ?? RECUOS_ZERO.FRENTE,
    FUNDOS: valores.recuoMm.FUNDOS ?? RECUOS_ZERO.FUNDOS,
    LATERAL_DIREITA: valores.recuoMm.LATERAL_DIREITA ?? RECUOS_ZERO.LATERAL_DIREITA,
    LATERAL_ESQUERDA: valores.recuoMm.LATERAL_ESQUERDA ?? RECUOS_ZERO.LATERAL_ESQUERDA,
  };
}

/** Rótulo curto da zona para a tela e para a cópia guardada no estudo. */
export function rotuloDaZona(zona: ZonaRegulatoria): string {
  const partes = [zona.zona, zona.macroarea].map((p) => (p ?? '').trim()).filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : 'Zona sem nome';
}

// ─────────────────────────────────────────────────────────────────────────────
// Deriva — a zona mudou depois de aplicada?
// ─────────────────────────────────────────────────────────────────────────────

/** Os valores guardados no estudo, na mesma forma da leitura. */
export interface ValoresAplicados extends ValoresDaZona {}

/**
 * `true` quando a zona de origem hoje diria algo diferente do que está em vigor
 * no estudo.
 *
 * ⚠️ Só compara os campos que continuam marcados como vindos da ZONA. Um número
 * que o usuário ajustou à mão diverge da lei por definição — acusá-lo como
 * "deriva" transformaria o aviso em ruído permanente e ensinaria a ignorá-lo.
 */
export function zonaDerivou(
  aplicados: ValoresAplicados,
  origem: Record<CampoDaZona, 'ZONA' | 'MANUAL'> | Record<string, string>,
  zonaAtual: ZonaRegulatoria,
): boolean {
  const hoje = lerZona(zonaAtual).valores;
  const daZona = (campo: CampoDaZona) => origem[campo] !== 'MANUAL';

  // ⚠️ Recuos comparados DEPOIS de `recuosDaZona`, dos dois lados. O que foi
  // aplicado passou por ela — "N.A." virou 0 —, então comparar contra o `null`
  // cru da releitura acusaria deriva no instante seguinte a aplicar uma zona que
  // tem qualquer campo ilegível. O aviso nasceria acesso e sem verdade nenhuma.
  const recuoHoje = recuosDaZona(hoje);

  const pares: [CampoDaZona, number | null, number | null][] = [
    ['recuo_frente', aplicados.recuoMm.FRENTE, recuoHoje.FRENTE],
    ['recuo_fundos', aplicados.recuoMm.FUNDOS, recuoHoje.FUNDOS],
    ['recuo_lateral_direita', aplicados.recuoMm.LATERAL_DIREITA, recuoHoje.LATERAL_DIREITA],
    ['recuo_lateral_esquerda', aplicados.recuoMm.LATERAL_ESQUERDA, recuoHoje.LATERAL_ESQUERDA],
    ['taxa_ocupacao_max', aplicados.taxaOcupacaoMax, hoje.taxaOcupacaoMax],
    ['taxa_permeabilidade_min', aplicados.taxaPermeabilidadeMin, hoje.taxaPermeabilidadeMin],
    ['coeficiente_max', aplicados.coeficienteMax, hoje.coeficienteMax],
    ['gabarito_altura_max', aplicados.gabaritoAlturaMaxM, hoje.gabaritoAlturaMaxM],
    ['gabarito_pavimentos', aplicados.gabaritoPavimentos, hoje.gabaritoPavimentos],
  ];

  return pares.some(([campo, aplicado, atual]) => daZona(campo) && aplicado !== atual);
}
