/**
 * Cor de preenchimento por AMBIENTE — paleta determinística.
 *
 * O modelo não tem tipo de cômodo: `Space` é DERIVADO da geometria
 * (`arrangement.ts`) e carrega só `ring`, `holes`, área, perímetro e um `name`
 * opcional. Não há de onde puxar uma cor semântica ("cozinha é amarelo"), então
 * o que a cor entrega é DISTINÇÃO, não significado: cômodos vizinhos precisam
 * ler como cômodos diferentes de relance.
 */

/** Ponto do anel — só o que o hash precisa, para não amarrar este arquivo ao kernel. */
interface PontoDoAnel {
  x: number;
  y: number;
}

/**
 * Oito tons translúcidos.
 *
 * ⚠️ O ALFA BAIXO É REQUISITO, NÃO ESTÉTICA. O preenchimento é pintado ANTES das
 * paredes e por cima da planta de fundo escaneada — com alfa alto ele apaga o
 * escaneamento que se está copiando, e a cota deixa de ser conferível justamente
 * quando importa. 0,10 é um degrau acima dos 0,08 do azul único de antes: com
 * oito matizes disputando, um pouco mais de saturação é o que separa dois
 * pastéis vizinhos sem chegar a competir com o desenho.
 *
 * As oito matizes evitam de propósito o vermelho puro (seleção) e o âmbar forte
 * (alerta): no alfa em que são pintadas ainda assim ficam distantes daquelas
 * cores, que aparecem em traço opaco.
 */
export const PALETA_AMBIENTE: readonly string[] = [
  'rgba(37, 99, 235, 0.10)', // azul
  'rgba(22, 163, 74, 0.10)', // verde
  'rgba(217, 119, 6, 0.10)', // âmbar
  'rgba(219, 39, 119, 0.10)', // rosa
  'rgba(13, 148, 136, 0.10)', // teal
  'rgba(124, 58, 237, 0.10)', // violeta
  'rgba(202, 138, 4, 0.10)', // ouro
  'rgba(2, 132, 199, 0.10)', // ciano
];

/** FNV-1a de 32 bits. Curto, sem dependência, e espalha bem para 8 baldes. */
function hash(chave: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i);
    // `Math.imul` em vez de `*`: o produto de 32 bits estoura o inteiro exato do
    // double e o hash perderia os bits baixos, que são justamente os que o
    // módulo usa.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A chave de cor de um ambiente.
 *
 * ⚠️ **NÃO É O `id`.** `spc_<nível>_<ordinal>` é atribuído por ordem canônica dos
 * anéis (`arrangement.ts`, ordenação pelo vértice inicial). Acrescentar uma
 * parede no miolo insere um anel no meio dessa ordem e empurra o ordinal de
 * todos os cômodos seguintes — a planta inteira trocaria de cor num gesto que
 * não teve nada a ver com ela.
 *
 * A chave é o NOME quando existe (o usuário nomeou: é a identidade mais estável
 * que o cômodo tem, e sobrevive até a ele mudar de forma), e senão o primeiro
 * vértice do anel — intrínseco ao cômodo, muda só se ele mudar de lugar.
 */
export function chaveDeCor(s: { name?: string; ring: readonly PontoDoAnel[] }): string {
  const nome = s.name?.trim().toLowerCase();
  if (nome) return `n:${nome}`;
  const p = s.ring[0];
  return p ? `p:${p.x}:${p.y}` : 'p:vazio';
}

/** A cor de preenchimento do ambiente, determinística e estável. */
export function corDoAmbiente(s: { name?: string; ring: readonly PontoDoAnel[] }): string {
  return PALETA_AMBIENTE[hash(chaveDeCor(s)) % PALETA_AMBIENTE.length];
}
