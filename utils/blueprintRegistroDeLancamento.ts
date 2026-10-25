/**
 * REGISTRO DO LANÇAMENTO — ler, comparar e dizer o que mudou (F1 do plano
 * `docs/planos/2026-10-24-relancar-quando-escolha-muda.md`, 24/10/2026).
 *
 * Pedido (sessão 9e26b316, 24/10/2026):
 * > *"quando o usuário faz uma allteracao em preferencias, porem exemplo alterar o tipo de lançamento de eletroduto
 * > para Sem caixas de passagem, o motor de lançar Eletrodutos por circuito deve ficar disponivel para relançar e
 * > incluir essa nova preferencia. Isto deve valer para qualquer alteracao de preferencia"*
 *
 * O kernel guarda, por (motor, alvo), as escolhas com que a rede foi lançada (`RegistroDeLancamento`, 0.105.0). Este
 * módulo é o lado de LEITURA comum a todos os motores (eletrodutos, água, esgoto, pluvial, circuitos automáticos):
 * - `registroDe`: o registro de um motor num alvo, ou `null`;
 * - `diferencasDasEscolhas`: o que difere entre o gravado e o atual, na ordem que o motor declarou;
 * - `textoDasDiferencas`: a frase do aviso âmbar ("Caixas de passagem — lançado com: … · agora: …");
 * - `comandoDeRegistro`: o comando que o motor põe NO MESMO LOTE do lançamento (o Ctrl+Z volta os dois).
 *
 * Puro: sem React, sem banco. As escolhas vêm de onde a tela as tem (preferência do usuário, estado do navegador,
 * hipóteses do estudo) — o motor só as entrega aqui achatadas em texto/número/sim-não.
 */
import type {
  BlueprintModel,
  Command,
  MotorDeLancamento,
  ObjectId,
  RegistroDeLancamento,
  ValorDeEscolha,
} from './blueprintKernel';

/** As escolhas de um lançamento, achatadas. */
export type EscolhasDoLancamento = Record<string, ValorDeEscolha>;

/** Uma escolha que mudou entre o lançamento e agora. `antes`/`agora` são só o VALOR em texto (o rótulo vai à parte). */
export interface DiferencaDeEscolha {
  /** A chave da escolha (`caixasDePassagem`). */
  item: string;
  /** Como o usuário a chama (`Caixas de passagem`). */
  rotulo: string;
  /** Com o que a rede foi lançada (`com caixas`); `—` = não informado. */
  antes: string;
  /** O que está escolhido agora (`sem caixas`); `—` = não informado. */
  agora: string;
}

export interface OpcoesDaComparacao {
  /**
   * As escolhas que o motor DECLARA, com o nome para o usuário. A ordem deste objeto é a ordem das diferenças. Chave
   * sem rótulo não entra na comparação: não é escolha que o motor declare hoje (ex.: uma que uma versão antiga gravava
   * e saiu) — acender o aviso por ela pediria um relançamento que não muda nada.
   */
  rotulos: Record<string, string>;
  /**
   * Como dizer o VALOR de uma escolha, quando o padrão (sim/não, número com vírgula, texto cru) não serve — ex.: `true`
   * → "com caixas". Vale para os DOIS lados; só não é chamado para o lado não informado (sai `—`). Devolve só o valor:
   * o rótulo já abre a frase ("Caixas de passagem — lançado com: com caixas · agora: sem caixas").
   */
  valores?: Record<string, (v: ValorDeEscolha) => string>;
  /**
   * O valor PADRÃO de cada escolha. Chave presente de um lado só vale o padrão do outro lado: escolha que nasceu depois
   * do lançamento, e está no padrão, não pede relançar (a rede antiga foi lançada exatamente como o padrão manda).
   */
  padroes?: Record<string, ValorDeEscolha>;
}

/** O registro de `motor` em `alvoId` (`null` = a planta inteira), ou `null` — planta antiga não tem nenhum. */
export function registroDe(
  model: Pick<BlueprintModel, 'registrosDeLancamento'>,
  motor: MotorDeLancamento,
  alvoId: ObjectId | null,
): RegistroDeLancamento | null {
  return (model.registrosDeLancamento ?? []).find((r) => r.motor === motor && r.alvoId === alvoId) ?? null;
}

/**
 * As escolhas como o registro as guarda: sem `undefined` (escolha que a tela não tem), número não finito vira `null`
 * (o kernel recusa NaN, que o JSON não guarda), chaves em ordem alfabética (o mesmo lançamento dá o mesmo registro).
 */
export function escolhasNormalizadas(escolhas: Record<string, ValorDeEscolha | undefined>): EscolhasDoLancamento {
  const out: EscolhasDoLancamento = {};
  for (const chave of Object.keys(escolhas).sort()) {
    const v = escolhas[chave];
    if (v === undefined) continue;
    out[chave] = typeof v === 'number' && !Number.isFinite(v) ? null : v;
  }
  return out;
}

/** O comando que grava o registro — vai no MESMO lote do lançamento. */
export function comandoDeRegistro(
  motor: MotorDeLancamento,
  alvoId: ObjectId | null,
  escolhas: Record<string, ValorDeEscolha | undefined>,
): Command {
  return { type: 'RegistrarLancamento', motor, alvoId, escolhas: escolhasNormalizadas(escolhas) };
}

const AUSENTE = Symbol('ausente');
type Lado = ValorDeEscolha | typeof AUSENTE;

/** Presente = tem a chave com valor INFORMADO. `null` conta como ausente: "não informado" é o mesmo que não ter. */
const tem = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined && o[k] !== null;

const NAO_INFORMADO = '—';

function valorPadraoEmTexto(v: Exclude<ValorDeEscolha, null>): string {
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'number') return String(v).replace('.', ',');
  return v;
}

/**
 * O que difere entre as escolhas GRAVADAS no lançamento e as ATUAIS, na ordem de `opcoes.rotulos`.
 *
 * - `gravadas` nulo (rede sem registro: lançada antes de existir o registro) → `[]`: não se sabe com que foi lançada,
 *   então a regra B (o aviso) não acende; fica só a regra A (o botão de relançar disponível).
 * - Chave ausente (ou `null`) de um lado vale o padrão (`opcoes.padroes`); sem padrão declarado, ausente ≠ qualquer
 *   valor informado, e ausente = ausente.
 * - Rede de segurança: diferença cujos dois textos saem iguais (dois valores que o formatador diz do mesmo jeito) é
 *   descartada — um aviso "— · agora: —" pediria relançar sem nada a mudar.
 */
export function diferencasDasEscolhas(
  gravadas: Record<string, ValorDeEscolha | undefined> | null,
  atuais: Record<string, ValorDeEscolha | undefined>,
  opcoes: OpcoesDaComparacao,
): DiferencaDeEscolha[] {
  if (!gravadas) return [];
  const padroes = opcoes.padroes ?? {};
  const lado = (o: Record<string, ValorDeEscolha | undefined>, k: string): Lado =>
    tem(o, k) ? (o[k] as ValorDeEscolha) : tem(padroes, k) ? padroes[k] : AUSENTE;
  const texto = (k: string, v: Lado): string => {
    if (v === AUSENTE || v === null) return NAO_INFORMADO;
    const formatar = opcoes.valores?.[k];
    return formatar ? formatar(v) : valorPadraoEmTexto(v);
  };
  const out: DiferencaDeEscolha[] = [];
  for (const [item, rotulo] of Object.entries(opcoes.rotulos)) {
    const antes = lado(gravadas, item);
    const agora = lado(atuais, item);
    if (antes === agora) continue;
    const d = { item, rotulo, antes: texto(item, antes), agora: texto(item, agora) };
    if (d.antes === d.agora) continue;
    out.push(d);
  }
  return out;
}

/**
 * A frase do aviso — UM formato, para uma ou várias diferenças: `<Rótulo> — lançado com: <antes> · agora: <agora>`,
 * várias separadas por "; ". Ex.: "Caixas de passagem — lançado com: com caixas · agora: sem caixas; Bitola — lançado
 * com: 20 mm · agora: 25 mm".
 */
export function textoDasDiferencas(diferencas: DiferencaDeEscolha[]): string {
  return diferencas.map((d) => `${d.rotulo} — lançado com: ${d.antes} · agora: ${d.agora}`).join('; ');
}

/**
 * Correção 1 da F5 (M5, 25/10/2026): a frase das confirmações de Refazer quando há registro e NENHUMA escolha mudou — a
 * mesma em todos os motores. Refazer assim não muda o resultado; só desfaz o que o usuário confirmou ou ajustou.
 */
export const TEXTO_NADA_MUDOU = 'Nenhuma escolha mudou — o resultado será o mesmo (e os itens confirmados se perdem).';
