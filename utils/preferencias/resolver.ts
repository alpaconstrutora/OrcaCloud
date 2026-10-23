/**
 * Quem vence entre as preferências gravadas da planta elétrica (23/10/2026).
 *
 * O banco guarda LINHAS (escopo, chave, valor). O desenho precisa de um sim/não por item. Este
 * arquivo faz a ponte, com três regras:
 *  1. TELA: vale a linha do USUARIO, senão o padrão do catálogo. Nada de empresa ou estudo — a
 *     tela é de cada pessoa.
 *  2. PRANCHA: vale a linha do ESTUDO, depois a da ORGANIZACAO, senão o padrão. A preferência da
 *     tela NUNCA vaza para a prancha (chaves diferentes: `...tela.x` × `...prancha.x`).
 *  3. Linha inválida (valor que não é booleano, chave fora do catálogo) é IGNORADA — vale o
 *     próximo escopo ou o padrão. Nunca lança: um dado estranho no banco não pode deixar a
 *     planta em branco.
 * Depois de escolhido o valor de cada item, as regras de convivência: item com `dependeDe`
 * fica desligado quando o item de que depende está desligado (valor gravado `true` não ressuscita
 * "circuito nos fios" sem os fios), e a prancha devolve `false` para o que ela não escreve.
 *
 * Puro: sem React, sem Supabase.
 */
import {
  ITENS_ELETRICOS,
  chaveDoItem,
  type AlvoDaPreferencia,
  type EscopoDaPreferencia,
  type ItemEletrico,
} from './catalogo';

export type { AlvoDaPreferencia, EscopoDaPreferencia, ItemEletrico, ItemDoCatalogo } from './catalogo';

export interface LinhaDePreferencia {
  escopo: EscopoDaPreferencia;
  chave: string;
  valor: unknown;
}

export type ExibicaoEletrica = Readonly<Record<ItemEletrico, boolean>>;

/** Tudo ligado: o comportamento de hoje (PR #110). */
export const EXIBICAO_ELETRICA_PADRAO: ExibicaoEletrica = Object.freeze(
  Object.fromEntries(ITENS_ELETRICOS.map((i) => [i.item, i.padrao])) as Record<ItemEletrico, boolean>,
);

/** Escopos que valem para cada alvo, do que vence primeiro ao que vence por último. */
const ESCOPOS_DO_ALVO: Record<AlvoDaPreferencia, readonly EscopoDaPreferencia[]> = {
  tela: ['USUARIO'],
  prancha: ['ESTUDO', 'ORGANIZACAO'],
};

/** Linha válida para (escopo, chave): valor booleano. Havendo repetida, vale a última. */
function valorValido(
  linhas: readonly LinhaDePreferencia[],
  escopo: EscopoDaPreferencia,
  chave: string,
): boolean | undefined {
  let achado: boolean | undefined;
  for (const l of linhas) {
    if (l && l.escopo === escopo && l.chave === chave && typeof l.valor === 'boolean') {
      achado = l.valor;
    }
  }
  return achado;
}

export function origemDoValor(
  linhas: readonly LinhaDePreferencia[],
  alvo: AlvoDaPreferencia,
  item: ItemEletrico,
): EscopoDaPreferencia | 'PADRAO' {
  const chave = chaveDoItem(alvo, item);
  for (const escopo of ESCOPOS_DO_ALVO[alvo]) {
    if (valorValido(linhas, escopo, chave) !== undefined) return escopo;
  }
  return 'PADRAO';
}

function exibicaoDoAlvo(linhas: readonly LinhaDePreferencia[], alvo: AlvoDaPreferencia): ExibicaoEletrica {
  // 1ª passada: o valor escolhido (ou o padrão) de cada item, sem dependências.
  const escolhido = {} as Record<ItemEletrico, boolean>;
  for (const def of ITENS_ELETRICOS) {
    const chave = chaveDoItem(alvo, def.item);
    let valor: boolean | undefined;
    for (const escopo of ESCOPOS_DO_ALVO[alvo]) {
      valor = valorValido(linhas, escopo, chave);
      if (valor !== undefined) break;
    }
    escolhido[def.item] = valor ?? def.padrao;
  }
  // 2ª passada: dependências e o que a prancha não escreve.
  const efetivo = {} as Record<ItemEletrico, boolean>;
  for (const def of ITENS_ELETRICOS) {
    let ligado = escolhido[def.item];
    if (alvo === 'prancha' && !def.naPrancha) ligado = false;
    if (def.dependeDe && !escolhido[def.dependeDe]) ligado = false;
    efetivo[def.item] = ligado;
  }
  return Object.freeze(efetivo);
}

/** USUARIO > padrão. */
export function exibicaoEletricaDaTela(linhas: readonly LinhaDePreferencia[]): ExibicaoEletrica {
  return exibicaoDoAlvo(linhas, 'tela');
}

/** ESTUDO > ORGANIZACAO > padrão. */
export function exibicaoEletricaDaPrancha(linhas: readonly LinhaDePreferencia[]): ExibicaoEletrica {
  return exibicaoDoAlvo(linhas, 'prancha');
}
