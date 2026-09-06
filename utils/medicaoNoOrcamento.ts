// utils/medicaoNoOrcamento.ts
//
// Levar o quantitativo da Medição Inteligente para `projects.budget`.
//
// ─── A DÍVIDA QUE ISTO FECHA ─────────────────────────────────────────────────
//
// `projects.budget` tem dois escritores com convenções incompatíveis. O da
// Planta Inteligente (`aplicarNoOrcamento`) usa id DETERMINÍSTICO com prefixo e
// substitui por prefixo: reexportar é idempotente por construção. O da Medição
// criava a linha com `crypto.randomUUID()` e um código `MED-<4 dígitos
// aleatórios>` — ou seja, sem nada que ligasse a linha ao item que a gerou.
//
// A única coisa que impedia duplicata ao reexportar era casar pelo TEXTO da
// descrição, comparado em minúsculas. Renomear o item na biblioteca — ou
// corrigir um acento — passava a criar uma linha nova ao lado da antiga, sem
// aviso, e o orçamento crescia sozinho.
//
// (O `item_referencia_id` não salva: ele é preenchido à MÃO por quem cadastra o
// item de biblioteca, e a exportação nunca o grava de volta.)
//
// ─── E POR QUE O ID NÃO PODE MUDAR DEPOIS ────────────────────────────────────
//
// ⚠️ Linhas JÁ exportadas ficam com o id aleatório que têm. Reescrever o id de
// uma linha existente seria pior que o defeito: o id de uma linha de orçamento é
// o id da TAREFA no cronograma (`ensureFullScheduleList`), então trocá-lo
// romperia o vínculo com o planejamento em silêncio. Elas continuam sendo
// achadas pela descrição, como antes; o id estável vale das novas em diante.

import type { BudgetEntry } from '../types';

/** Prefixo que marca uma linha como vinda da Medição Inteligente. */
export const PREFIXO_MEDICAO = 'med:';

/** O id determinístico de uma linha, a partir do item de biblioteca. */
export function idDaMedicao(itemDeBibliotecaId: string): string {
  return `${PREFIXO_MEDICAO}${itemDeBibliotecaId}`;
}

/** O que a Medição sabe de um item que vai virar linha. */
export interface ItemMedido {
  /** Id do item na biblioteca de medição — a identidade estável. */
  itemId: string;
  nome: string;
  unidade: 'M2' | 'M' | 'UN';
  valorUnitario: number;
  categoria: string | null;
  /** Linha do orçamento escolhida à mão por quem cadastrou o item. */
  referenciaManual?: string | null;
  /** Quantidade medida, já somada. */
  total: number;
}

export interface ResultadoDaExportacao {
  budget: BudgetEntry[];
  atualizadas: number;
  adicionadas: number;
}

const UNIDADE: Record<ItemMedido['unidade'], string> = { M2: 'm²', M: 'm', UN: 'un' };

const normalizar = (s: string): string => s.trim().toLowerCase();

/**
 * Aplica o quantitativo no orçamento, sem duplicar ao repetir.
 *
 * A ordem de casamento é do MAIS forte para o mais fraco, e cada degrau existe
 * por um motivo diferente:
 *
 *   1. `referenciaManual` — alguém disse explicitamente qual linha é. Ganha de
 *      tudo, inclusive de uma descrição igual noutra linha;
 *   2. o id determinístico — é a linha que ESTA exportação criou antes;
 *   3. a descrição — o único jeito de reencontrar as linhas antigas, criadas
 *      com id aleatório. Sem este degrau, a primeira exportação depois da
 *      correção duplicaria tudo o que já existe.
 *
 * Função PURA: recebe o orçamento e devolve outro. Ela morava dentro de um
 * componente de 1.400 linhas, que é onde uma regra assim deixa de ser
 * verificável.
 */
export function aplicarMedicaoNoOrcamento(
  budget: BudgetEntry[],
  itens: ItemMedido[],
): ResultadoDaExportacao {
  const saida = [...budget];
  let atualizadas = 0;
  let adicionadas = 0;

  for (const item of itens) {
    const id = idDaMedicao(item.itemId);
    const quantidade = Math.round(item.total * 100) / 100;

    let i = -1;
    if (item.referenciaManual) i = saida.findIndex((b) => b.id === item.referenciaManual);
    if (i === -1) i = saida.findIndex((b) => b.id === id);
    if (i === -1) {
      i = saida.findIndex(
        (b) => normalizar(b.sinapiItem?.description ?? '') === normalizar(item.nome),
      );
    }

    if (i !== -1) {
      // Só a QUANTIDADE é atualizada. Preço, fase e grupo podem ter sido
      // ajustados no orçamento por quem o mantém, e a medição não tem
      // autoridade sobre eles — sobrescrever apagaria trabalho alheio.
      saida[i] = { ...saida[i], quantity: quantidade };
      atualizadas++;
      continue;
    }

    saida.push({
      id,
      sinapiItem: {
        // O código também é determinístico. O anterior era
        // `MED-<aleatório>`, e mudava a cada exportação — dois números para o
        // mesmo serviço, sem nada que os ligasse.
        code: `MED-${item.itemId.slice(0, 8).toUpperCase()}`,
        description: item.nome,
        unit: UNIDADE[item.unidade],
        price: item.valorUnitario,
        type: 'INPUT',
        category: item.categoria || 'Medições Inteligentes',
        source: 'Própria',
      },
      quantity: quantidade,
      phase: item.categoria || 'Medições Inteligentes',
      group: 'Medições Inteligentes',
    } as BudgetEntry);
    adicionadas++;
  }

  return { budget: saida, atualizadas, adicionadas };
}
