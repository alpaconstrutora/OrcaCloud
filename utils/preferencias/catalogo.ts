/**
 * Catálogo das preferências da planta elétrica (23/10/2026).
 *
 * O PR #110 deixou o desenho elétrico escrevendo tudo de uma vez — fios, número do circuito,
 * bitola, Ø, potência, letra do comando… — e quem trabalha com planta cheia precisa escolher o
 * que aparece, na tela e na prancha, sem mexer no código. Este arquivo é a LISTA ÚNICA desses
 * itens: a tela de Preferências desenha as linhas a partir dele, o resolvedor aplica o padrão e
 * as dependências a partir dele, e o canvas/prancha só perguntam "este item está ligado?".
 *
 * Regras que moram aqui (e não espalhadas pelos consumidores):
 *  - a ORDEM do array é a ordem das linhas na tela;
 *  - todo item nasce LIGADO — sem preferência gravada o desenho é idêntico ao de hoje;
 *  - `dependeDe` diz qual item precisa estar ligado para este fazer sentido (sem os fios, o
 *    número do circuito "em cima do grupo", a bitola e o "N cond." não têm onde ficar);
 *  - `naPrancha: false` marca o que só a TELA escreve (a prancha não tem a instrução da tomada
 *    sugerida nem o "N cond." do trecho cheio).
 *
 * Puro: sem React, sem Supabase.
 */

export type ItemEletrico =
  | 'fios'
  | 'circuitoNosFios'
  | 'bitola'
  | 'diametro'
  | 'circuitoNoPonto'
  | 'potencia'
  | 'comando'
  | 'instrucaoSugerida'
  | 'condutoresDoTrecho';

/** Onde a preferência vale: no desenho da tela ou na prancha exportada. */
export type AlvoDaPreferencia = 'tela' | 'prancha';

/** Quem gravou a preferência: a pessoa, a empresa inteira ou um estudo específico. */
export type EscopoDaPreferencia = 'USUARIO' | 'ORGANIZACAO' | 'ESTUDO';

export interface ItemDoCatalogo {
  item: ItemEletrico;
  /** Nome curto da linha na tela de Preferências. */
  rotulo: string;
  /** Explicação de UMA linha, com o exemplo do que aparece no desenho. */
  explicacao: string;
  /** Valor quando ninguém escolheu nada. */
  padrao: boolean;
  /** Item que precisa estar ligado para este valer. */
  dependeDe?: ItemEletrico;
  /** Falso quando só a tela escreve este item. */
  naPrancha: boolean;
}

export const ITENS_ELETRICOS: readonly ItemDoCatalogo[] = [
  {
    item: 'fios',
    rotulo: 'Fios no eletroduto',
    explicacao: 'Traços de fase, neutro, retorno e terra desenhados sobre o eletroduto (╫).',
    padrao: true,
    naPrancha: true,
  },
  {
    item: 'circuitoNosFios',
    rotulo: 'Circuito nos fios',
    explicacao: 'Número do circuito escrito em cima do grupo de fios (ex.: "3").',
    padrao: true,
    dependeDe: 'fios',
    naPrancha: true,
  },
  {
    item: 'bitola',
    rotulo: 'Bitola dos fios',
    explicacao: 'Seção dos fios ao lado do grupo (ex.: "2,5").',
    padrao: true,
    dependeDe: 'fios',
    naPrancha: true,
  },
  {
    item: 'diametro',
    rotulo: 'Diâmetro do eletroduto',
    explicacao: 'Ø escrito só nos trechos diferentes do predominante (ex.: "Ø 40").',
    padrao: true,
    naPrancha: true,
  },
  {
    item: 'circuitoNoPonto',
    rotulo: 'Circuito no ponto',
    explicacao: 'Circuito escrito junto do ponto (ex.: "-20-", "C3", "TUG · C2").',
    padrao: true,
    naPrancha: true,
  },
  {
    item: 'potencia',
    rotulo: 'Potência do ponto',
    explicacao: 'Potência escrita no ponto, e o número dentro do círculo da luminária (ex.: "600 VA").',
    padrao: true,
    naPrancha: true,
  },
  {
    item: 'comando',
    rotulo: 'Letra do comando',
    explicacao: 'Letra que liga a luz ao seu interruptor, nos dois lados (ex.: "a").',
    padrao: true,
    naPrancha: true,
  },
  {
    item: 'instrucaoSugerida',
    rotulo: 'Instrução da tomada sugerida',
    explicacao: 'Orientação de posição da tomada sugerida (ex.: "Posicione sobre a bancada…").',
    padrao: true,
    naPrancha: false,
  },
  {
    item: 'condutoresDoTrecho',
    rotulo: 'Condutores do trecho',
    explicacao: 'Quantidade de condutores no trecho cheio (ex.: "34 cond.").',
    padrao: true,
    dependeDe: 'fios',
    naPrancha: false,
  },
];

/** Chave gravada no banco: `planta.eletrica.<alvo>.<item>`. */
export function chaveDoItem(alvo: AlvoDaPreferencia, item: ItemEletrico): string {
  return `planta.eletrica.${alvo}.${item}`;
}
