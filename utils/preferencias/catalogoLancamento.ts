/**
 * Catálogo do LANÇAMENTO da Planta Inteligente (24/10/2026) — COMO a planta lança (não o que ela exibe).
 * Plano: docs/planos/2026-10-24-preferencia-caixas-de-passagem.md.
 *
 * Pedido original (sessão 9e26b316, 24/10/2026, com o print da planta Garden cheia de caixas "CP"):
 *
 *   "em instalacao residencial não se usa caixas de passagens como sugerido no projeto. Mas nao vamos deixar de
 *    oferecer como solucao ao usuário.
 *    Incluir em preferencias se ele quer utilizar caixas de passagens ou utilizar prefertencialmente encaminhamentos via
 *    luz no teto. o usuário escolhe"
 *
 * Decisões do usuário (mesma sessão): a escolha é DE CADA USUÁRIO (escopo USUARIO, como as de exibição do PR #128) e o
 * padrão, para quem ainda não escolheu, é "pela luz do teto, sem caixas".
 *
 * Regras que moram aqui:
 *  - chave no banco `planta.lancamento.<item>` (a CHECK da tabela `preferencias` já aceita `planta.%`: sem migration);
 *  - `chaveAntiga` é onde a escolha fica no navegador SEM sessão (deslogado/offline). É uma chave NOVA de propósito:
 *    o `blueprint:eletrodutosCaixas` de antes NÃO é migrado — ele valia `true` para quase todos (o
 *    `usePersistedState` grava o padrão ao montar) e migrá-lo desfaria a decisão do usuário de mudar o padrão;
 *  - valor fora das opções vale como "sem escolha" (`undefined`) — nunca lança.
 *
 * Mesma máquina do catálogo de exibição (`catalogoExibir.ts`): o hook `usePreferenciaDaPlanta(item,
 * CATALOGO_DE_LANCAMENTO)` lê a MESMA query do usuário, com o mesmo contador de gravações e o mesmo aviso de leitura.
 *
 * Puro: sem React, sem Supabase.
 */
import type { LinhaDePreferencia } from './resolver';
import {
  valorNaChave,
  type CatalogoDePreferenciasDaPlanta,
  type DefinicaoDePreferencia,
  type OpcaoDeExibicao,
  type ValorDeExibicao,
} from './catalogoExibir';

/**
 * `PELA_LUZ` = sem caixas de passagem: a caixa da luz do teto, a das tomadas e o quadro fazem a passagem (padrão);
 * `CAIXAS` = caixas pela NBR 5410. A preferência só liga/desliga as caixas — o CAMINHO do eletroduto é o
 * "Encaminhamento" do painel dos eletrodutos (que já é "pela luz do ambiente" por padrão).
 */
export type CaixasDePassagem = 'PELA_LUZ' | 'CAIXAS';

/** As duas opções, com os rótulos do plano (a aba Preferências mostra estes textos). */
export const OPCOES_CAIXAS_DE_PASSAGEM: readonly (OpcaoDeExibicao & { valor: CaixasDePassagem })[] = [
  { valor: 'PELA_LUZ', rotulo: 'Sem caixas de passagem — a caixa da luz do teto, a das tomadas e o quadro fazem a passagem (como em obra residencial)' },
  { valor: 'CAIXAS', rotulo: 'Usar caixas de passagem (NBR 5410: a cada 15 m ou 270° de curvas)' },
];

export const ITENS_DE_LANCAMENTO: readonly DefinicaoDePreferencia[] = [
  {
    item: 'caixasDePassagem',
    chaveAntiga: 'blueprint:lancamento:caixasDePassagem',
    rotulo: 'Caixas de passagem',
    tipo: 'opcao',
    opcoes: OPCOES_CAIXAS_DE_PASSAGEM,
    padrao: 'PELA_LUZ',
  },
];

const POR_ITEM: ReadonlyMap<string, DefinicaoDePreferencia> = new Map(ITENS_DE_LANCAMENTO.map((i) => [i.item, i]));

/** Chave gravada no banco: `planta.lancamento.<item>`. */
export function chaveDeLancamento(item: string): string {
  return `planta.lancamento.${item}`;
}

/** O que o usuário escolheu para o item; `undefined` = sem escolha válida (quem chama usa o padrão). */
export function valorDeLancamento(linhas: readonly LinhaDePreferencia[], item: string): ValorDeExibicao | undefined {
  const def = POR_ITEM.get(item);
  return def ? valorNaChave(linhas, def, chaveDeLancamento(item)) : undefined;
}

/** O catálogo do lançamento para o hook `usePreferenciaDaPlanta`. */
export const CATALOGO_DE_LANCAMENTO: CatalogoDePreferenciasDaPlanta = {
  nome: 'lançamento',
  definicaoDe: (item) => POR_ITEM.get(item),
  chaveDe: chaveDeLancamento,
};
